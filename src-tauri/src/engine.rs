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
//! O som (M20) vai para a thread do `audio.rs`, sem esperar, e a notificação
//! (M21), para o `notify.rs`, que também não espera. Os períodos (M26) vão
//! para o `stats.rs`, uma linha no SQLite por fase que termina.
//!
//! **Temporizadores (M32).** O mesmo motor guarda os [`Timers`] do núcleo,
//! sob a mesma trava e com o mesmo relógio. O laço também roda enquanto algum
//! temporizador corre rumo ao zero (um prazo ainda não disparado); passado o
//! zero, a contagem negativa é só do JS, e o laço pode dormir. Cada mudança
//! sai em `tt://timers`, e cada fim toca o som de fim de foco (menos o
//! atrasado) e mostra uma notificação.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::time::Duration;

use serde::Serialize;
use tokio::sync::Notify;
use tokio::time::{MissedTickBehavior, interval};
use tomatito_core::{
    Clock, CountdownEffects, CountdownError, Effects, EpochMs, Focus, FocusError, FocusSnapshot,
    LATE_AFTER_MS, Notice, Period, PhaseChange, PlanSettings, SessionConfig, Sound, SystemClock,
    TimerEnded, TimerId, Timers, TimersSnapshot,
};

use crate::audio::Som;
use crate::events::{self, FocusDto, PhaseEventDto, SetupDto, StateDto, TickDto, TimersDto};
use crate::notify::Notificador;
use crate::stats::Stats;

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
    /// `tt://timers` (M32).
    fn timers(&self, timers: &TimersDto);
    /// A notificação do fim de um temporizador (M32).
    fn timer_notice(&self, ended: &TimerEnded);
}

/// Adapta um [`Sink`] ao trait `Effects` do núcleo e numera os retratos.
///
/// M19: guarda o último retrato emitido. O núcleo sempre chama
/// `state_changed` logo antes de `phase_changed`, e o `tt://phase` leva o
/// `seq` e a fase desse retrato: o anúncio do `aria-live` sai do próprio
/// evento, sem depender da ordem em que o JS recebe os dois.
struct Outbox<'a, S: Sink> {
    sink: &'a S,
    seq: &'a mut u64,
    last: Option<FocusDto>,
}

impl<'a, S: Sink> Outbox<'a, S> {
    fn new(sink: &'a S, seq: &'a mut u64) -> Self {
        Self {
            sink,
            seq,
            last: None,
        }
    }
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
        self.last = Some(dto);
    }
    fn phase_changed(&mut self, change: &PhaseChange) {
        let mut dto = PhaseEventDto::from(change);
        if let Some(last) = &self.last {
            dto.complete_with(last);
        }
        self.sink.phase(&dto);
    }
}

/// Adapta um [`Sink`] ao trait `CountdownEffects` do núcleo (M32) e numera
/// os retratos dos temporizadores.
struct TimersOutbox<'a, S: Sink> {
    sink: &'a S,
    seq: &'a mut u64,
}

impl<S: Sink> CountdownEffects for TimersOutbox<'_, S> {
    fn timer_ended(&mut self, ended: &TimerEnded) {
        // O som de fim de foco (o "Fazer" do M32); o atrasado só notifica,
        // como o foco (3.2).
        if !ended.late {
            self.sink.sound(Sound::FocusEnd);
        }
        self.sink.timer_notice(ended);
    }
    fn timers_changed(&mut self, snapshot: &TimersSnapshot) {
        *self.seq += 1;
        let mut dto = TimersDto::from(snapshot);
        dto.seq = *self.seq;
        self.sink.timers(&dto);
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
    /// M32: não existe temporizador com esse id.
    NotFound,
    /// M32: duração fora de 1 s a 99:59:59.
    InvalidDuration,
    /// M32: nome com mais de 255 caracteres.
    NameTooLong,
    /// M32: iniciar um temporizador que já corre.
    AlreadyRunning,
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

impl From<CountdownError> for CommandError {
    fn from(e: CountdownError) -> Self {
        let code = match e {
            CountdownError::NotFound(_) => ErrorCode::NotFound,
            CountdownError::InvalidDuration => ErrorCode::InvalidDuration,
            CountdownError::NameTooLong => ErrorCode::NameTooLong,
            CountdownError::AlreadyRunning => ErrorCode::AlreadyRunning,
            CountdownError::NotRunning => ErrorCode::NotRunning,
        };
        Self {
            code,
            message: e.to_string(),
        }
    }
}

struct Inner {
    focus: Focus,
    /// M32: os temporizadores, com o `seq` do último `tt://timers`.
    timers: Timers,
    timers_seq: u64,
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

    /// M32: o retrato dos temporizadores em `now`, com o `seq` do último
    /// `tt://timers`.
    fn timers_dto(&self, now: EpochMs) -> TimersDto {
        let mut dto = TimersDto::from(&self.timers.snapshot(now));
        dto.seq = self.timers_seq;
        dto
    }

    /// Se o laço precisa rodar: uma fase corre, ou um temporizador corre
    /// rumo ao zero (um fim ainda por disparar).
    fn active(&self) -> bool {
        self.focus.is_running() || self.timers.next_deadline().is_some()
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
        // M32: os padrões de 1, 3, 5 e 10 min. Carregar a lista gravada
        // (M33) ao abrir é do M40.
        let mut timers = Timers::with_defaults();
        if speed > 1.0 {
            let late = (LATE_AFTER_MS as f64 * speed).round() as u64;
            focus = focus.with_late_after_ms(late);
            timers = timers.with_late_after_ms(late);
        }
        Self {
            clock,
            speed,
            sink,
            inner: Mutex::new(Inner {
                focus,
                timers,
                timers_seq: 0,
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

    /// O "agora" do motor (acelerado no modo `TOMATITO_SPEED`): o
    /// `stats_get` vê os dias pelo mesmo relógio que gravou os períodos.
    pub fn now(&self) -> EpochMs {
        self.clock.now()
    }

    /// Se o laço precisa rodar (uma fase ou um temporizador rumo ao zero).
    pub fn is_running(&self) -> bool {
        self.lock().active()
    }

    /// `get_state`: fecha o que venceu (o JS chama isto ao abrir e ao voltar
    /// de uma janela escondida, às vezes antes do primeiro tick depois de uma
    /// suspensão) e devolve o retrato.
    pub fn state(&self) -> StateDto {
        let mut g = self.lock();
        let now = self.clock.now();
        let Inner {
            focus,
            seq,
            timers,
            timers_seq,
            ..
        } = &mut *g;
        focus.advance_to(now, &mut Outbox::new(&self.sink, seq));
        timers.advance_to(
            now,
            &mut TimersOutbox {
                sink: &self.sink,
                seq: timers_seq,
            },
        );
        StateDto {
            focus: g.dto(now),
            speed: self.speed,
            setup: setup(),
            timers: g.timers_dto(now),
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
        let r = f(focus, now, &mut Outbox::new(&self.sink, seq));
        let running = g.active();
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

    /// Roda um comando dos temporizadores (M32) com um único "agora", acorda
    /// o laço se algum ficou correndo rumo ao zero e devolve o retrato novo.
    fn timer_command<T>(
        &self,
        f: impl FnOnce(&mut Timers, EpochMs, &mut dyn CountdownEffects) -> Result<T, CountdownError>,
    ) -> Result<(T, TimersDto), CommandError> {
        let mut g = self.lock();
        let now = self.clock.now();
        let Inner {
            timers, timers_seq, ..
        } = &mut *g;
        let r = f(
            timers,
            now,
            &mut TimersOutbox {
                sink: &self.sink,
                seq: timers_seq,
            },
        );
        let active = g.active();
        let dto = g.timers_dto(now);
        drop(g);
        if active {
            self.wake.notify_one();
        }
        Ok((r?, dto))
    }

    /// `timer_create{name, duration_ms}`: devolve o retrato com o novo no fim.
    pub fn timer_create(&self, name: &str, duration_ms: u64) -> Result<TimersDto, CommandError> {
        self.timer_command(|t, now, fx| t.create(now, name, duration_ms, fx))
            .map(|(_, dto)| dto)
    }

    /// `timer_update{id, name, duration_ms}`.
    pub fn timer_update(
        &self,
        id: TimerId,
        name: &str,
        duration_ms: u64,
    ) -> Result<TimersDto, CommandError> {
        self.timer_command(|t, now, fx| t.update(now, id, name, duration_ms, fx))
            .map(|(_, dto)| dto)
    }

    /// `timer_delete{id}`.
    pub fn timer_delete(&self, id: TimerId) -> Result<TimersDto, CommandError> {
        self.timer_command(|t, now, fx| t.delete(now, id, fx))
            .map(|(_, dto)| dto)
    }

    /// `timer_start{id}`: inicia ou retoma.
    pub fn timer_start(&self, id: TimerId) -> Result<TimersDto, CommandError> {
        self.timer_command(|t, now, fx| t.start(now, id, fx))
            .map(|(_, dto)| dto)
    }

    /// `timer_pause{id}`.
    pub fn timer_pause(&self, id: TimerId) -> Result<TimersDto, CommandError> {
        self.timer_command(|t, now, fx| t.pause(now, id, fx))
            .map(|(_, dto)| dto)
    }

    /// `timer_reset{id}`.
    pub fn timer_reset(&self, id: TimerId) -> Result<TimersDto, CommandError> {
        self.timer_command(|t, now, fx| t.reset(now, id, fx))
            .map(|(_, dto)| dto)
    }

    /// Um passo do laço: fecha o que venceu e, com uma fase correndo, emite o
    /// `tt://tick` se o segundo mostrado mudou. Devolve se ainda há algo
    /// correndo.
    pub fn tick(&self) -> bool {
        self.ticks.fetch_add(1, Ordering::SeqCst);
        let mut g = self.lock();
        let now = self.clock.now();
        let Inner {
            focus,
            seq,
            timers,
            timers_seq,
            ..
        } = &mut *g;
        focus.advance_to(now, &mut Outbox::new(&self.sink, seq));
        timers.advance_to(
            now,
            &mut TimersOutbox {
                sink: &self.sink,
                seq: timers_seq,
            },
        );
        let snapshot = g.focus.snapshot(now);
        let Some((s, ends_at)) = snapshot
            .session
            .as_ref()
            .and_then(|s| s.ends_at.map(|e| (s, e)))
        else {
            g.last_tick = None;
            return g.active();
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

/// O [`Sink`] do app: emite os eventos para todas as janelas e pede os sons
/// e as notificações.
pub struct TauriSink {
    app: tauri::AppHandle,
    som: Arc<Som>,
    notificador: Notificador,
    stats: Arc<Stats>,
}

impl TauriSink {
    pub fn new(app: tauri::AppHandle, som: Arc<Som>, stats: Arc<Stats>) -> Self {
        let notificador = Notificador::new(app.clone());
        Self {
            app,
            som,
            notificador,
            stats,
        }
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
    fn sound(&self, sound: Sound) {
        // Só manda o pedido: o motor está travado aqui, e a thread de som é
        // que espera o som acabar, com o volume que ela guarda.
        self.som.tocar(sound);
    }
    fn notice(&self, notice: Notice) {
        // Também sem esperar: o plugin entrega numa tarefa à parte.
        self.notificador.mostrar(notice);
    }
    fn timers(&self, timers: &TimersDto) {
        self.emit(events::TIMERS, timers);
    }
    fn timer_notice(&self, ended: &TimerEnded) {
        self.notificador.mostrar_temporizador(ended);
    }
    fn period(&self, period: &Period) {
        // Síncrono, com o motor travado: um INSERT leva menos de 1 ms, e
        // assim o `stats_get` que vier depois do `tt://state` já vê a linha.
        if let Err(e) = self.stats.record(period) {
            eprintln!("[tomatito] estatísticas: período não gravado ({e}): {period:?}");
        }
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
        Timers(TimersDto),
        TimerNotice(TimerEnded),
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
        fn timers(&self, t: &TimersDto) {
            self.put(Out::Timers(t.clone()));
        }
        fn timer_notice(&self, e: &TimerEnded) {
            self.put(Out::TimerNotice(e.clone()));
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
    fn evento_de_fase_leva_a_fase_nova_e_o_seq_do_retrato() {
        // M19: o anúncio de cada fase sai do próprio tt://phase.
        let (e, clock) = motor();
        e.start(60, false, None).unwrap();
        let mut n = 0;
        while e.tick() {
            clock.advance_ms(250);
            n += 1;
            assert!(n < 60 * 60 * 4 + 10, "o laço não para");
        }
        e.stop().unwrap_err();
        let out = e.sink().tirar();
        let mut ultimo_seq = 0;
        let mut fases = Vec::new();
        for o in &out {
            match o {
                Out::State(f) => ultimo_seq = f.seq,
                Out::Phase(p) => {
                    assert_eq!(p.seq, ultimo_seq, "o seq do retrato emitido logo antes");
                    fases.push((p.cause, p.status, p.phase.map(|f| (f.kind, f.n)), p.of));
                }
                _ => {}
            }
        }
        use crate::events::PhaseKindDto::{Break, Focus};
        assert_eq!(
            fases,
            [
                (
                    CauseDto::Started,
                    StatusDto::Focus,
                    Some((Focus, 1)),
                    Some(2)
                ),
                (CauseDto::Ended, StatusDto::Break, Some((Break, 1)), Some(1)),
                (CauseDto::Ended, StatusDto::Focus, Some((Focus, 2)), Some(2)),
                (CauseDto::Ended, StatusDto::Completed, None, None),
            ]
        );

        // Encerrar volta ao ocioso, sem fase.
        e.start(5, false, None).unwrap();
        e.sink().tirar();
        e.stop().unwrap();
        let out: Vec<_> = e
            .sink()
            .tirar()
            .into_iter()
            .filter(|o| matches!(o, Out::State(_) | Out::Phase(_)))
            .collect();
        assert!(matches!(&out[..], [Out::State(s), Out::Phase(p)]
            if p.seq == s.seq && p.cause == CauseDto::Stopped && p.status == StatusDto::Idle && p.phase.is_none()));
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

    // M32: os temporizadores no motor.

    fn fins(out: &[Out]) -> Vec<&TimerEnded> {
        out.iter()
            .filter_map(|o| match o {
                Out::TimerNotice(e) => Some(e),
                _ => None,
            })
            .collect()
    }

    fn sons(out: &[Out]) -> Vec<Sound> {
        out.iter()
            .filter_map(|o| match o {
                Out::Sound(s) => Some(*s),
                _ => None,
            })
            .collect()
    }

    #[test]
    fn get_state_traz_os_quatro_padroes() {
        let (e, _) = motor();
        let t = e.state().timers;
        let duracoes: Vec<u64> = t.timers.iter().map(|t| t.duration_ms).collect();
        assert_eq!(duracoes, [60_000, 180_000, 300_000, 600_000]);
        assert_eq!(t.seq, 0);
        assert!(t.timers.iter().all(|t| t.name.is_empty() && !t.overdue));
        assert!(!e.is_running(), "parados: o laço dorme");
        assert!(e.sink().tirar().is_empty());
    }

    #[test]
    fn dois_temporizadores_juntos_e_o_fim_com_som_e_notificacao() {
        // O "Pronto quando" do M32, no motor: 1 min e 3 min correndo juntos;
        // o de 1 min acaba, toca o som de fim de foco e notifica uma vez, e
        // 12 s depois está em −12 s, ainda correndo, com o outro intacto.
        let (e, clock) = motor();
        let r = e.timer_start(1).unwrap();
        assert_eq!(r.seq, 1);
        assert_eq!(r.timers[0].ends_at, Some(T0.0 + 60_000));
        clock.advance_ms(10_000);
        e.timer_start(2).unwrap();
        assert!(e.is_running());
        e.sink().tirar();
        andar(&e, &clock, 50_000);
        let out = e.sink().tirar();
        let f = fins(&out);
        assert_eq!(f.len(), 1);
        assert_eq!(
            (f[0].id, f[0].ended_at, f[0].late),
            (1, T0.plus_ms(60_000), false)
        );
        assert_eq!(sons(&out), [Sound::FocusEnd]);
        let ultimo = out
            .iter()
            .rev()
            .find_map(|o| match o {
                Out::Timers(t) => Some(t),
                _ => None,
            })
            .unwrap();
        assert!(ultimo.timers[0].ended);
        andar(&e, &clock, 12_000);
        let out = e.sink().tirar();
        assert!(fins(&out).is_empty(), "o fim dispara uma única vez");
        assert!(sons(&out).is_empty());
        let t = e.state().timers;
        assert_eq!(t.timers[0].remaining_ms, -12_000);
        assert!(t.timers[0].overdue);
        assert_eq!(t.timers[1].remaining_ms, 180_000 - 62_000);
        assert!(!t.timers[1].overdue);
        assert!(e.is_running(), "o de 3 min ainda vai ao zero");
    }

    #[test]
    fn pausar_um_nao_mexe_no_outro_e_redefinir_rearma() {
        let (e, clock) = motor();
        e.timer_start(1).unwrap();
        e.timer_start(2).unwrap();
        andar(&e, &clock, 20_000);
        let p = e.timer_pause(2).unwrap();
        assert_eq!(p.timers[1].status, crate::events::TimerStatusDto::Paused);
        assert_eq!(p.timers[1].remaining_ms, 160_000);
        assert_eq!(p.timers[0].remaining_ms, 40_000);
        let r = e.timer_reset(2).unwrap();
        assert_eq!(r.timers[1].status, crate::events::TimerStatusDto::Idle);
        assert_eq!(r.timers[1].remaining_ms, 180_000);
        e.sink().tirar();
        andar(&e, &clock, 45_000);
        assert_eq!(fins(&e.sink().tirar()).len(), 1);
        // Redefinir o que acabou e correr de novo dispara outra vez.
        e.timer_reset(1).unwrap();
        e.timer_start(1).unwrap();
        e.sink().tirar();
        andar(&e, &clock, 60_000);
        assert_eq!(fins(&e.sink().tirar()).len(), 1);
    }

    #[test]
    fn passado_o_zero_o_laco_pode_dormir() {
        let (e, clock) = motor();
        e.timer_start(1).unwrap();
        andar(&e, &clock, 60_000);
        assert!(!e.tick(), "no negativo, nada a disparar: o laço dorme");
        assert!(!e.is_running());
        clock.advance_ms(30_000);
        assert_eq!(e.state().timers.timers[0].remaining_ms, -30_000);
    }

    #[test]
    fn fim_atrasado_notifica_sem_som() {
        let (e, clock) = motor();
        e.timer_start(1).unwrap();
        e.sink().tirar();
        clock.advance_ms(60_000 + LATE_AFTER_MS + 1_000);
        e.tick();
        let out = e.sink().tirar();
        assert!(sons(&out).is_empty());
        let f = fins(&out);
        assert_eq!(f.len(), 1);
        assert!(f[0].late);
    }

    #[test]
    fn erros_dos_temporizadores() {
        let (e, _) = motor();
        assert_eq!(e.timer_start(99).unwrap_err().code, ErrorCode::NotFound);
        assert_eq!(e.timer_pause(1).unwrap_err().code, ErrorCode::NotRunning);
        e.timer_start(1).unwrap();
        let erro = e.timer_start(1).unwrap_err();
        assert_eq!(erro.code, ErrorCode::AlreadyRunning);
        assert_eq!(
            serde_json::to_value(&erro).unwrap()["code"],
            "alreadyRunning"
        );
        assert_eq!(
            e.timer_create("", 0).unwrap_err().code,
            ErrorCode::InvalidDuration
        );
        assert_eq!(
            e.timer_create(&"a".repeat(256), 1000).unwrap_err().code,
            ErrorCode::NameTooLong
        );
        let c = e.timer_create("Chá", 240_000).unwrap();
        assert_eq!(c.timers.last().unwrap().name, "Chá");
        let u = e.timer_update(5, "Chá verde", 240_000).unwrap();
        assert_eq!(u.timers.last().unwrap().name, "Chá verde");
        let d = e.timer_delete(5).unwrap();
        assert_eq!(d.timers.len(), 4);
    }

    #[test]
    fn foco_e_temporizador_juntos() {
        let (e, clock) = motor();
        e.start(5, false, None).unwrap();
        e.timer_start(1).unwrap();
        e.sink().tirar();
        andar(&e, &clock, 60_000);
        let out = e.sink().tirar();
        assert_eq!(fins(&out).len(), 1);
        assert!(!ticks(&out).is_empty(), "o foco segue com os ticks");
        assert!(e.tick(), "o foco ainda corre");
    }

    /// O laço de verdade acorda com um temporizador e dorme depois do zero.
    #[tokio::test(start_paused = true)]
    async fn laco_acorda_com_o_temporizador() {
        let (e, clock) = motor();
        let laco = tokio::spawn(e.clone().run());
        tokio::time::sleep(Duration::from_secs(5)).await;
        assert_eq!(e.ticks(), 0);
        e.timer_start(1).unwrap();
        for _ in 0..(4 * 61) {
            tokio::time::sleep(TICK_EVERY).await;
            clock.advance_ms(250);
        }
        assert_eq!(fins(&e.sink().tirar()).len(), 1);
        let fim = e.ticks();
        tokio::time::sleep(Duration::from_secs(3600)).await;
        assert_eq!(e.ticks(), fim, "passado o zero, o laço dorme");
        laco.abort();
    }
}
