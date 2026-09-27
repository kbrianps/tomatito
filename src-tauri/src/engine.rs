//! O motor no app (PLANO.md, 3.1 e 3.2): o foco do `tomatito-core`, o relógio
//! e o laço que faz o tempo andar mesmo com a janela escondida.
//!
//! **O laço.** Um `tokio::time::interval` de 250 ms, com
//! `MissedTickBehavior::Skip`, que só roda enquanto uma fase corre. Parado
//! (ocioso, pausado ou concluído), a tarefa espera um `tokio::sync::Notify` e
//! não acorda sozinha: nenhum timer, nenhum gasto de CPU. Os comandos que
//! deixam uma fase correndo (iniciar, retomar, pular) acordam o laço.
//!
//! **O tempo.** Cada tick lê o relógio de parede e chama `advance_to(now)`.
//! O `interval` só marca o ritmo (ele usa o `Instant`, que no Linux não conta a
//! suspensão); quem decide o que venceu é o prazo em ms desde a época Unix.
//! Depois de uma suspensão, o primeiro tick já fecha as fases vencidas e manda
//! o restante certo (3.2, "Depois da suspensão").
//!
//! **Os eventos.** Os efeitos que o núcleo pede passam por um [`Sink`]: no app,
//! o [`TauriSink`], que emite `tt://state` e `tt://phase` para as janelas; nos
//! testes, um que só anota. O `tt://tick` sai do laço, uma vez por segundo de
//! contagem (quando o segundo mostrado muda), só para o JS corrigir desvio.
//! Tudo é emitido com o motor travado, para os eventos saírem na ordem das
//! transições.
//!
//! Som (M20), notificação (M21) e gravação (M26) ainda não existem: por
//! enquanto, o `TauriSink` só registra esses pedidos no stderr (em debug).

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::time::Duration;

use serde::Serialize;
use tokio::sync::Notify;
use tokio::time::{MissedTickBehavior, interval};
use tomatito_core::{
    Clock, Effects, EpochMs, Focus, FocusError, FocusSnapshot, LATE_AFTER_MS, Notice, Period,
    PhaseChange, PlanSettings, SessionConfig, Sound, SystemClock,
};

use crate::events::{self, FocusDto, PhaseEventDto, SetupDto, StateDto, TickDto};

/// O ritmo do laço (3.2).
pub const TICK_EVERY: Duration = Duration::from_millis(250);

/// Faixa de T aceita pelo `focus_start`: a do seletor, de 5 a 240 (2.1). No
/// debug, a partir de 1, porque lá o seletor anda de 1 em 1 (M17).
pub const MIN_MINUTES: u32 = if cfg!(debug_assertions) { 1 } else { 5 };
pub const MAX_MINUTES: u32 = 240;
/// Passo do seletor de minutos (M17): de 5 em 5, e de 1 em 1 no debug.
pub const STEP_MINUTES: u32 = if cfg!(debug_assertions) { 1 } else { 5 };

/// F e B das sessões novas: os padrões, até o `settings.rs`. O `focus_start`
/// e o `get_state` (a frase dos intervalos no cartão) leem daqui.
const PLAN_SETTINGS: PlanSettings = PlanSettings::DEFAULT;

/// O `setup` do `get_state` (M17).
fn setup() -> SetupDto {
    SetupDto {
        min_minutes: MIN_MINUTES,
        max_minutes: MAX_MINUTES,
        step_minutes: STEP_MINUTES,
        focus_minutes: PLAN_SETTINGS.focus_minutes,
        break_minutes: PLAN_SETTINGS.break_minutes,
    }
}

/// Para onde vão os efeitos do motor.
pub trait Sink: Send + Sync + 'static {
    /// `tt://state`.
    fn state(&self, focus: &FocusDto);
    /// `tt://tick`.
    fn tick(&self, tick: &TickDto);
    /// `tt://phase`.
    fn phase(&self, change: &PhaseEventDto);
    /// Som de fim de fase (M20).
    fn sound(&self, sound: Sound);
    /// Notificação do sistema (M21).
    fn notice(&self, notice: Notice);
    /// Uma linha em `periods` (M26).
    fn period(&self, period: &Period);
}

/// Adapta um [`Sink`] ao trait `Effects` do núcleo e numera os retratos.
struct Outbox<'a, S: Sink> {
    sink: &'a S,
    seq: &'a mut u64,
}

impl<S: Sink> Effects for Outbox<'_, S> {
    fn play_sound(&mut self, sound: Sound) {
        self.sink.sound(sound);
    }
    fn notify(&mut self, notice: Notice) {
        self.sink.notice(notice);
    }
    fn record_period(&mut self, period: &Period) {
        self.sink.period(period);
    }
    fn state_changed(&mut self, snapshot: &FocusSnapshot) {
        *self.seq += 1;
        let mut dto = FocusDto::from(snapshot);
        dto.seq = *self.seq;
        self.sink.state(&dto);
    }
    fn phase_changed(&mut self, change: &PhaseChange) {
        self.sink.phase(&change.into());
    }
}

/// Erro de um comando, como o JS o recebe: `{ code, message }`. O `message`
/// é para o registro; a interface decide o texto pelo `code`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandError {
    pub code: ErrorCode,
    pub message: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ErrorCode {
    /// T fora da faixa do seletor.
    InvalidMinutes,
    AlreadyActive,
    NotRunning,
    NotPaused,
    NoSession,
    /// T, F ou B iguais a zero (não acontece com T validado e F e B padrão).
    InvalidPlan,
}

impl From<FocusError> for CommandError {
    fn from(e: FocusError) -> Self {
        let code = match e {
            FocusError::AlreadyActive => ErrorCode::AlreadyActive,
            FocusError::NotRunning => ErrorCode::NotRunning,
            FocusError::NotPaused => ErrorCode::NotPaused,
            FocusError::NoSession => ErrorCode::NoSession,
            FocusError::Plan(_) => ErrorCode::InvalidPlan,
        };
        Self {
            code,
            message: e.to_string(),
        }
    }
}

struct Inner {
    focus: Focus,
    /// O `seq` do último `tt://state`.
    seq: u64,
    /// O último `tt://tick` emitido: sessão, fase e segundo mostrado.
    last_tick: Option<(i64, u32, u64)>,
}

impl Inner {
    /// O retrato em `now`, com o `seq` do último `tt://state`.
    fn dto(&self, now: EpochMs) -> FocusDto {
        let mut dto = FocusDto::from(&self.focus.snapshot(now));
        dto.seq = self.seq;
        dto
    }
}

/// O motor: um por processo, compartilhado (`Arc`) entre o laço e os
/// comandos.
pub struct Engine<S: Sink> {
    clock: Box<dyn Clock>,
    speed: f64,
    sink: S,
    inner: Mutex<Inner>,
    wake: Notify,
    /// Quantas vezes o laço rodou um tick. Serve aos testes: parado, o
    /// número não pode andar.
    ticks: AtomicU64,
}

impl<S: Sink> Engine<S> {
    /// `speed` é a velocidade do relógio (1, ou a do `TOMATITO_SPEED` num
    /// build de debug). Acima de 1, o limite do atraso cresce na mesma
    /// proporção: a 240×, um tick de 250 ms já passaria de 60 s, e todo fim de
    /// fase sairia "atrasado" (docs/decisoes.md, M15, item 16).
    pub fn new(clock: Box<dyn Clock>, speed: f64, sink: S) -> Self {
        let mut focus = Focus::new();
        if speed > 1.0 {
            focus = focus.with_late_after_ms((LATE_AFTER_MS as f64 * speed).round() as u64);
        }
        Self {
            clock,
            speed,
            sink,
            inner: Mutex::new(Inner {
                focus,
                seq: 0,
                last_tick: None,
            }),
            wake: Notify::new(),
            ticks: AtomicU64::new(0),
        }
    }

    #[cfg(test)]
    pub fn sink(&self) -> &S {
        &self.sink
    }

    #[cfg(test)]
    pub fn ticks(&self) -> u64 {
        self.ticks.load(Ordering::SeqCst)
    }

    fn lock(&self) -> MutexGuard<'_, Inner> {
        // Um pânico com o motor travado não pode derrubar o app inteiro: o
        // estado do núcleo é trocado de uma vez, então segue válido.
        self.inner.lock().unwrap_or_else(PoisonError::into_inner)
    }

    pub fn is_running(&self) -> bool {
        self.lock().focus.is_running()
    }

    /// `get_state`: fecha o que venceu (o JS chama isto ao abrir e ao voltar
    /// de uma janela escondida, às vezes antes do primeiro tick depois de uma
    /// suspensão) e devolve o retrato.
    pub fn state(&self) -> StateDto {
        let mut g = self.lock();
        let now = self.clock.now();
        let Inner { focus, seq, .. } = &mut *g;
        focus.advance_to(
            now,
            &mut Outbox {
                sink: &self.sink,
                seq,
            },
        );
        StateDto {
            focus: g.dto(now),
            speed: self.speed,
            setup: setup(),
        }
    }

    /// Roda um comando do núcleo com um único "agora", acorda o laço se uma
    /// fase ficou correndo e devolve o retrato novo.
    fn command(
        &self,
        f: impl FnOnce(&mut Focus, EpochMs, &mut dyn Effects) -> Result<(), FocusError>,
    ) -> Result<FocusDto, CommandError> {
        let mut g = self.lock();
        let now = self.clock.now();
        let Inner { focus, seq, .. } = &mut *g;
        let r = f(
            focus,
            now,
            &mut Outbox {
                sink: &self.sink,
                seq,
            },
        );
        let running = g.focus.is_running();
        let dto = g.dto(now);
        drop(g);
        if running {
            self.wake.notify_one();
        }
        r?;
        Ok(dto)
    }

    /// `focus_start`. F e B são os padrões até o `settings.rs` existir (M17
    /// em diante).
    pub fn start(
        &self,
        minutes: u32,
        skip_breaks: bool,
        task_id: Option<i64>,
    ) -> Result<FocusDto, CommandError> {
        if !(MIN_MINUTES..=MAX_MINUTES).contains(&minutes) {
            return Err(CommandError {
                code: ErrorCode::InvalidMinutes,
                message: format!(
                    "minutos fora da faixa de {MIN_MINUTES} a {MAX_MINUTES}: {minutes}"
                ),
            });
        }
        let config = SessionConfig {
            minutes,
            settings: PLAN_SETTINGS,
            skip_breaks,
            task_id,
        };
        self.command(|f, now, fx| f.start(now, config, fx))
    }

    pub fn pause(&self) -> Result<FocusDto, CommandError> {
        self.command(|f, now, fx| f.pause(now, fx))
    }

    pub fn resume(&self) -> Result<FocusDto, CommandError> {
        self.command(|f, now, fx| f.resume(now, fx))
    }

    pub fn skip(&self) -> Result<FocusDto, CommandError> {
        self.command(|f, now, fx| f.skip(now, fx))
    }

    pub fn stop(&self) -> Result<FocusDto, CommandError> {
        self.command(|f, now, fx| f.stop(now, fx))
    }

    /// Um passo do laço: fecha o que venceu e, com uma fase correndo, emite o
    /// `tt://tick` se o segundo mostrado mudou. Devolve se ainda há algo
    /// correndo.
    pub fn tick(&self) -> bool {
        self.ticks.fetch_add(1, Ordering::SeqCst);
        let mut g = self.lock();
        let now = self.clock.now();
        let Inner { focus, seq, .. } = &mut *g;
        focus.advance_to(
            now,
            &mut Outbox {
                sink: &self.sink,
                seq,
            },
        );
        let snapshot = g.focus.snapshot(now);
        let Some((s, ends_at)) = snapshot
            .session
            .as_ref()
            .and_then(|s| s.ends_at.map(|e| (s, e)))
        else {
            g.last_tick = None;
            return false;
        };
        let key = (s.id, s.phase_index, s.remaining_ms.div_ceil(1000));
        if g.last_tick != Some(key) {
            g.last_tick = Some(key);
            self.sink.tick(&TickDto {
                seq: g.seq,
                session_id: s.id,
                phase_index: s.phase_index,
                phase: s.phase.into(),
                at: now.0,
                ends_at_ms: ends_at.0,
                remaining_ms: s.remaining_ms,
            });
        }
        true
    }

    /// O laço (3.2). Roda para sempre na tarefa do `tauri::async_runtime`.
    pub async fn run(self: Arc<Self>) {
        loop {
            if !self.is_running() {
                // Um `notify_one` que chegou antes deste ponto fica guardado
                // (uma licença), e o `notified` volta na hora: nenhum início
                // se perde entre a conferência e a espera.
                self.wake.notified().await;
                continue;
            }
            let mut every = interval(TICK_EVERY);
            every.set_missed_tick_behavior(MissedTickBehavior::Skip);
            loop {
                every.tick().await;
                if !self.tick() {
                    break;
                }
            }
        }
    }
}

/// O relógio do motor e a velocidade dele. Num build de debug,
/// `TOMATITO_SPEED` acelera o tempo (3.2); um valor inválido é registrado e
/// ignorado. No release, a variável não é lida.
pub fn clock_from_env() -> (Box<dyn Clock>, f64) {
    #[cfg(debug_assertions)]
    {
        match tomatito_core::ScaledClock::from_env() {
            Ok(Some(c)) => {
                let speed = c.speed();
                eprintln!("[tomatito] relógio acelerado: {speed}×");
                return (Box::new(c), speed);
            }
            Ok(None) => {}
            Err(e) => eprintln!("[tomatito] {e}; seguindo sem aceleração"),
        }
    }
    (Box::new(SystemClock), 1.0)
}

/// O [`Sink`] do app: emite os eventos para todas as janelas.
pub struct TauriSink {
    app: tauri::AppHandle,
}

impl TauriSink {
    pub fn new(app: tauri::AppHandle) -> Self {
        Self { app }
    }

    fn emit<T: Serialize + Clone>(&self, event: &str, payload: &T) {
        use tauri::Emitter;
        if let Err(e) = self.app.emit(event, payload.clone()) {
            eprintln!("[tomatito] falha ao emitir {event}: {e}");
        }
    }
}

impl Sink for TauriSink {
    fn state(&self, focus: &FocusDto) {
        self.emit(events::STATE, focus);
    }
    fn tick(&self, tick: &TickDto) {
        self.emit(events::TICK, tick);
    }
    fn phase(&self, change: &PhaseEventDto) {
        self.emit(events::PHASE, change);
    }
    fn sound(&self, _sound: Sound) {
        #[cfg(debug_assertions)]
        eprintln!("[tomatito] som (M20): {_sound:?}");
    }
    fn notice(&self, _notice: Notice) {
        #[cfg(debug_assertions)]
        eprintln!("[tomatito] aviso (M21): {_notice:?}");
    }
    fn period(&self, _period: &Period) {
        #[cfg(debug_assertions)]
        eprintln!("[tomatito] período (M26): {_period:?}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::events::{CauseDto, StatusDto};
    use tomatito_core::FakeClock;

    const T0: EpochMs = EpochMs(1_790_000_000_000);

    #[derive(Debug, Clone, PartialEq)]
    enum Out {
        State(FocusDto),
        Tick(TickDto),
        Phase(PhaseEventDto),
        Sound(Sound),
        Notice(Notice),
        Period(Period),
    }

    #[derive(Default)]
    struct Anota(Mutex<Vec<Out>>);

    impl Anota {
        fn tirar(&self) -> Vec<Out> {
            std::mem::take(&mut *self.0.lock().unwrap())
        }
        fn put(&self, o: Out) {
            self.0.lock().unwrap().push(o);
        }
    }

    impl Sink for Anota {
        fn state(&self, f: &FocusDto) {
            self.put(Out::State(f.clone()));
        }
        fn tick(&self, t: &TickDto) {
            self.put(Out::Tick(t.clone()));
        }
        fn phase(&self, c: &PhaseEventDto) {
            self.put(Out::Phase(*c));
        }
        fn sound(&self, s: Sound) {
            self.put(Out::Sound(s));
        }
        fn notice(&self, n: Notice) {
            self.put(Out::Notice(n));
        }
        fn period(&self, p: &Period) {
            self.put(Out::Period(*p));
        }
    }

    fn motor() -> (Arc<Engine<Anota>>, FakeClock) {
        let clock = FakeClock::new(T0);
        let e = Engine::new(Box::new(clock.clone()), 1.0, Anota::default());
        (Arc::new(e), clock)
    }

    fn ticks(out: &[Out]) -> Vec<&TickDto> {
        out.iter()
            .filter_map(|o| match o {
                Out::Tick(t) => Some(t),
                _ => None,
            })
            .collect()
    }

    /// Faz o laço andar `ms` em passos de 250 ms, com o relógio junto.
    fn andar(e: &Engine<Anota>, clock: &FakeClock, ms: u64) {
        for _ in 0..ms / 250 {
            clock.advance_ms(250);
            e.tick();
        }
    }

    #[test]
    fn iniciar_emite_estado_e_fase_e_devolve_o_retrato() {
        let (e, _) = motor();
        let r = e.start(5, false, None).unwrap();
        assert_eq!(r.status, StatusDto::Focus);
        let s = r.session.as_ref().unwrap();
        assert_eq!(s.ends_at, Some(T0.0 + 300_000));
        assert_eq!(s.remaining_ms, 300_000);
        assert_eq!(r.seq, 1);
        let out = e.sink().tirar();
        assert!(matches!(&out[0], Out::State(f) if *f == r));
        assert!(matches!(&out[1], Out::Phase(p) if p.cause == CauseDto::Started));
        assert_eq!(out.len(), 2);
        assert!(e.is_running());
    }

    #[test]
    fn tick_uma_vez_por_segundo_mostrado() {
        let (e, clock) = motor();
        e.start(5, false, None).unwrap();
        e.sink().tirar();
        assert!(e.tick()); // o primeiro tick do laço sai na hora
        andar(&e, &clock, 3_000);
        let out = e.sink().tirar();
        let t = ticks(&out);
        assert_eq!(out.len(), t.len(), "só ticks, sem transição");
        let restantes: Vec<u64> = t.iter().map(|t| t.remaining_ms).collect();
        assert_eq!(restantes, [300_000, 299_000, 298_000, 297_000]);
        assert!(t.iter().all(|t| t.ends_at_ms == T0.0 + 300_000));
        assert_eq!(t[3].at, T0.0 + 3_000);
        assert!(t.iter().all(|t| t.seq == 1), "o seq do último retrato");
        assert_eq!(
            e.state().focus.seq,
            1,
            "get_state sem transição não muda o seq"
        );
        assert_eq!(e.pause().unwrap().seq, 2);
    }

    #[test]
    fn suspensao_de_1_min_num_foco_de_5_min_desconta_o_minuto_no_primeiro_tick() {
        // O "Pronto quando" do M16, sem suspender: o relógio de parede salta
        // 1 min entre dois ticks, como na volta de um `systemctl suspend`.
        let (e, clock) = motor();
        e.start(5, false, None).unwrap();
        andar(&e, &clock, 120_000);
        e.sink().tirar();
        clock.advance_ms(60_000);
        assert!(e.tick());
        let out = e.sink().tirar();
        let t = ticks(&out);
        assert_eq!(t.len(), 1);
        assert_eq!(
            t[0].remaining_ms, 120_000,
            "5 min − 2 min correndo − 1 min suspenso"
        );
        // O get_state do JS (visibilitychange) vê o mesmo.
        let s = e.state();
        assert_eq!(s.focus.session.unwrap().remaining_ms, 120_000);
    }

    #[test]
    fn get_state_fecha_a_fase_vencida_antes_do_tick() {
        let (e, clock) = motor();
        e.start(5, false, None).unwrap();
        e.sink().tirar();
        clock.advance_ms(5 * 60_000 + 30_000);
        let s = e.state();
        assert_eq!(s.focus.status, StatusDto::Completed);
        assert_eq!(s.speed, 1.0);
        let out = e.sink().tirar();
        assert!(out.iter().any(|o| matches!(o, Out::Sound(Sound::FocusEnd))));
        assert!(
            out.iter()
                .any(|o| matches!(o, Out::Period(p) if p.completed))
        );
        assert!(!e.tick(), "concluído: nada corre");
    }

    #[test]
    fn a_sessao_inteira_pelo_laco() {
        let (e, clock) = motor();
        e.start(60, false, None).unwrap();
        e.sink().tirar();
        let mut n = 0;
        while e.tick() {
            clock.advance_ms(250);
            n += 1;
            assert!(n < 60 * 60 * 4 + 10, "o laço não para");
        }
        let out = e.sink().tirar();
        let sons: Vec<_> = out
            .iter()
            .filter_map(|o| match o {
                Out::Sound(s) => Some(*s),
                _ => None,
            })
            .collect();
        assert_eq!(sons, [Sound::FocusEnd, Sound::BreakEnd, Sound::FocusEnd]);
        let ticks = ticks(&out);
        // 1650 + 300 + 1650 s, um tick por segundo mostrado (de N a 1).
        assert_eq!(ticks.len(), 1650 + 300 + 1650);
        assert_eq!(e.state().focus.status, StatusDto::Completed);
    }

    #[test]
    fn pausar_para_os_ticks_e_retomar_volta() {
        let (e, clock) = motor();
        e.start(5, false, None).unwrap();
        andar(&e, &clock, 10_000);
        let p = e.pause().unwrap();
        assert_eq!(p.status, StatusDto::Paused);
        assert!(!e.tick());
        e.sink().tirar();
        clock.advance_ms(600_000);
        assert!(!e.tick());
        assert!(e.sink().tirar().is_empty(), "pausado: nada sai");
        let r = e.resume().unwrap();
        assert_eq!(r.session.unwrap().remaining_ms, 290_000);
        assert!(e.tick());
    }

    #[test]
    fn erros_com_codigo() {
        let (e, _) = motor();
        assert_eq!(e.pause().unwrap_err().code, ErrorCode::NotRunning);
        assert_eq!(e.resume().unwrap_err().code, ErrorCode::NotPaused);
        assert_eq!(e.skip().unwrap_err().code, ErrorCode::NoSession);
        assert_eq!(e.stop().unwrap_err().code, ErrorCode::NoSession);
        assert_eq!(
            e.start(0, false, None).unwrap_err().code,
            ErrorCode::InvalidMinutes
        );
        assert_eq!(
            e.start(241, false, None).unwrap_err().code,
            ErrorCode::InvalidMinutes
        );
        e.start(240, true, Some(7)).unwrap();
        let erro = e.start(25, false, None).unwrap_err();
        assert_eq!(erro.code, ErrorCode::AlreadyActive);
        let v = serde_json::to_value(&erro).unwrap();
        assert_eq!(v["code"], "alreadyActive");
        assert!(v["message"].as_str().unwrap().contains("em andamento"));
    }

    #[test]
    fn get_state_leva_o_preparo_da_sessao() {
        let (e, _) = motor();
        let s = e.state().setup;
        assert_eq!((s.min_minutes, s.max_minutes), (MIN_MINUTES, MAX_MINUTES));
        assert_eq!(s.step_minutes, if cfg!(debug_assertions) { 1 } else { 5 });
        assert_eq!((s.focus_minutes, s.break_minutes), (25, 5));
        // O passo cabe na faixa: do mínimo ao máximo, de passo em passo.
        assert_eq!((s.max_minutes - s.min_minutes) % s.step_minutes, 0);
    }

    #[test]
    fn faixa_de_minutos() {
        assert_eq!(MAX_MINUTES, 240);
        assert_eq!(MIN_MINUTES, if cfg!(debug_assertions) { 1 } else { 5 });
        let (e, _) = motor();
        e.start(MIN_MINUTES, false, None).unwrap();
        e.stop().unwrap();
        if MIN_MINUTES > 1 {
            assert_eq!(
                e.start(MIN_MINUTES - 1, false, None).unwrap_err().code,
                ErrorCode::InvalidMinutes
            );
        }
    }

    #[test]
    fn acelerado_estica_o_limite_do_atraso() {
        let clock = FakeClock::new(T0);
        let e = Engine::new(Box::new(clock.clone()), 480.0, Anota::default());
        e.start(5, false, None).unwrap();
        e.sink().tirar();
        // A 480×, um tick de 250 ms vale 2 min: o fim sai com som, não atrasado.
        clock.advance_ms(5 * 60_000 + 120_000);
        e.tick();
        let out = e.sink().tirar();
        assert!(out.iter().any(|o| matches!(o, Out::Sound(Sound::FocusEnd))));
        assert!(out.iter().any(|o| matches!(o, Out::Phase(p) if !p.late)));
    }

    /// O laço de verdade, com o tempo do tokio parado (ele só anda quando
    /// todas as tarefas esperam). Parado, o laço não acorda.
    #[tokio::test(start_paused = true)]
    async fn laco_so_roda_com_algo_correndo() {
        let (e, clock) = motor();
        let laco = tokio::spawn(e.clone().run());
        tokio::time::sleep(Duration::from_secs(60)).await;
        assert_eq!(e.ticks(), 0, "ocioso: o laço espera o Notify");

        e.start(5, false, None).unwrap();
        for _ in 0..8 {
            tokio::time::sleep(TICK_EVERY).await;
            clock.advance_ms(250);
        }
        let rodando = e.ticks();
        assert!(
            (8..=10).contains(&rodando),
            "4 ticks por segundo: {rodando}"
        );
        assert!(ticks(&e.sink().tirar()).len() >= 2);

        e.pause().unwrap();
        tokio::time::sleep(Duration::from_secs(1)).await;
        let pausado = e.ticks();
        tokio::time::sleep(Duration::from_secs(3600)).await;
        assert_eq!(e.ticks(), pausado, "pausado: o laço espera o Notify");

        e.resume().unwrap();
        tokio::time::sleep(Duration::from_secs(1)).await;
        assert!(e.ticks() > pausado + 2, "retomar acorda o laço");

        e.stop().unwrap();
        tokio::time::sleep(Duration::from_secs(1)).await;
        let parado = e.ticks();
        tokio::time::sleep(Duration::from_secs(3600)).await;
        assert_eq!(e.ticks(), parado);
        laco.abort();
    }

    /// A fase vence sozinha pelo laço, e ele dorme depois do fim da sessão.
    #[tokio::test(start_paused = true)]
    async fn laco_fecha_a_sessao_e_dorme() {
        let (e, clock) = motor();
        let laco = tokio::spawn(e.clone().run());
        e.start(5, false, None).unwrap();
        for _ in 0..(4 * 301) {
            tokio::time::sleep(TICK_EVERY).await;
            clock.advance_ms(250);
        }
        assert_eq!(e.state().focus.status, StatusDto::Completed);
        let fim = e.ticks();
        tokio::time::sleep(Duration::from_secs(3600)).await;
        assert_eq!(e.ticks(), fim);
        let out = e.sink().tirar();
        assert!(
            out.iter()
                .any(|o| matches!(o, Out::Notice(Notice::SessionCompleted { .. })))
        );
        laco.abort();
    }
}
