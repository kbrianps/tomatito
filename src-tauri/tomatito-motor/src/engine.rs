//! O motor (PLANO.md, 3.1 e 3.2): o foco, os temporizadores e o cronômetro do
//! `tomatito-core` sob uma trava só e com um relógio só. Veio do
//! `src-tauri/src/engine.rs` no W05 (PLANO-WEB, 3.3), sem o que depende do
//! Tauri e do tokio: o desktop e o `tomatito-wasm` usam este mesmo motor.
//!
//! **O laço fica fora.** O motor não tem relógio próprio nem tarefa: quem o
//! hospeda chama [`Engine::tick`] enquanto [`Engine::is_running`] disser que
//! algo corre, e dorme quando nada corre. Os comandos que deixam algo
//! correndo (iniciar, retomar, pular, um temporizador, a retomada) chamam
//! [`Sink::acordar`], que no desktop acorda o `laco()` do tokio
//! (`src-tauri/src/engine.rs`) e na web não faz nada (o `motor.js` arma o
//! próprio prazo). Um `impl Engine` fora deste crate não compilaria (E0116),
//! por isso o laço do desktop é uma função livre.
//!
//! **O tempo.** Cada tick lê o relógio de parede e chama `advance_to(now)`.
//! Quem decide o que venceu é o prazo em ms desde a época Unix, não o ritmo
//! do laço: depois de uma suspensão, o primeiro tick já fecha as fases
//! vencidas e manda o restante certo (3.2, "Depois da suspensão").
//!
//! **Os eventos.** Os efeitos que o núcleo pede passam por um [`Sink`]: no
//! desktop, o `TauriSink`, que emite `tt://state` e `tt://phase` para as
//! janelas; nos testes, um que só anota. O `tt://tick` sai do [`Engine::tick`],
//! uma vez por segundo de contagem (quando o segundo mostrado muda), só para o
//! JS corrigir desvio. Tudo é emitido com o motor travado, para os eventos
//! saírem na ordem das transições.
//!
//! **Configurações (M38).** O motor guarda as [`Preferencias`] que lê das
//! configurações: o F e o B das sessões novas (a sessão em andamento fica
//! com o plano com que começou) e quais fins de fase tocam som. O `setup` e
//! cada `settings_set` as regravam ([`Engine::configurar`]). Um som desligado
//! não sai do motor; a notificação sai do mesmo jeito.
//!
//! **Temporizadores (M32).** O mesmo motor guarda os [`Timers`] do núcleo,
//! sob a mesma trava e com o mesmo relógio. O laço também roda enquanto algum
//! temporizador corre rumo ao zero (um prazo ainda não disparado); passado o
//! zero, a contagem negativa é só do JS, e o laço pode dormir. Cada mudança
//! sai em `tt://timers`, e cada fim toca o som de fim de foco (menos o
//! atrasado) e mostra uma notificação.
//!
//! **Cronômetro (M34).** Também sob a mesma trava e com o mesmo relógio. Ele
//! não tem prazo nem nada a disparar: o decorrido é `acumulado + (agora −
//! started_at)`, calculado na hora de cada leitura. Por isso o laço não roda
//! por causa dele (seria só gasto de CPU; docs/decisoes.md, M34), e os
//! centésimos da tela são contados pelo JS a partir do retrato.
//!
//! **Retomada (M40).** Ao abrir, quem hospeda entrega ao motor o que o estado
//! gravado trouxe ([`Engine::restaurar`]): a sessão de foco, os temporizadores
//! e o cronômetro voltam como estavam, e o `advance_to(now)` fecha o que
//! venceu com o app fechado, com a regra do atraso: mais de 60 s depois do
//! prazo, sem som e com o aviso "concluída às …".

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, MutexGuard, PoisonError};
use std::time::Duration;

use serde::Serialize;
use tomatito_core::{
    Clock, CountdownEffects, CountdownError, Effects, EpochMs, Focus, FocusError, FocusSnapshot,
    LATE_AFTER_MS, Notice, Period, PhaseChange, PlanSettings, SessionConfig, Sound, Stopwatch,
    StopwatchError, TimerEnded, TimerId, Timers, TimersSnapshot,
};

use crate::events::{
    FocusDto, PhaseEventDto, SetupDto, StateDto, StopwatchDto, TickDto, TimersDto,
};
use crate::settings::Settings;
use crate::state_file::Restored;

/// O ritmo do laço do desktop (3.2). A web usa o próprio ritmo (1 Hz, com a
/// aba visível).
pub const TICK_EVERY: Duration = Duration::from_millis(250);

/// Faixa de T aceita pelo `focus_start`: a do seletor, de 5 a 240 (2.1). No
/// debug, a partir de 1, porque lá o seletor anda de 1 em 1 (M17).
pub const MIN_MINUTES: u32 = if cfg!(debug_assertions) { 1 } else { 5 };
pub const MAX_MINUTES: u32 = 240;
/// Passo do seletor de minutos (M17): de 5 em 5, e de 1 em 1 no debug.
pub const STEP_MINUTES: u32 = if cfg!(debug_assertions) { 1 } else { 5 };

/// M38: o que o motor lê das configurações (3.3): o F e o B das sessões
/// novas (`focusMinutes` e `breakMinutes`) e os sons de fim de fase
/// (`sounds.focusEnd` e `sounds.breakEnd`). O volume fica com o `Som`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Preferencias {
    pub plano: PlanSettings,
    /// Toca o som no fim de cada período de foco (e no fim da sessão, que é o
    /// fim do último foco).
    pub som_fim_de_foco: bool,
    /// Toca o som no fim de cada intervalo.
    pub som_fim_de_intervalo: bool,
}

impl Default for Preferencias {
    /// Os padrões da 3.3: 25 e 5, com os dois sons ligados.
    fn default() -> Self {
        Self {
            plano: PlanSettings::DEFAULT,
            som_fim_de_foco: true,
            som_fim_de_intervalo: true,
        }
    }
}

impl From<&Settings> for Preferencias {
    fn from(s: &Settings) -> Self {
        Self {
            plano: PlanSettings {
                focus_minutes: s.focus_minutes,
                break_minutes: s.break_minutes,
            },
            som_fim_de_foco: s.sounds.focus_end,
            som_fim_de_intervalo: s.sounds.break_end,
        }
    }
}

impl Preferencias {
    /// Se o som `sound` do fim de uma fase do foco toca.
    pub fn toca(&self, sound: Sound) -> bool {
        match sound {
            Sound::FocusEnd => self.som_fim_de_foco,
            Sound::BreakEnd => self.som_fim_de_intervalo,
        }
    }
}

/// O `setup` do `get_state` (M17), com o F e o B das configurações (M38).
fn setup(plano: PlanSettings) -> SetupDto {
    SetupDto {
        min_minutes: MIN_MINUTES,
        max_minutes: MAX_MINUTES,
        step_minutes: STEP_MINUTES,
        focus_minutes: plano.focus_minutes,
        break_minutes: plano.break_minutes,
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
    /// `tt://stopwatch` e o `state.json` (M34).
    fn stopwatch(&self, stopwatch: &StopwatchDto);
    /// Algo passou a correr: o laço de quem hospeda o motor tem de acordar
    /// (W05). No desktop, o `notify_one` do `laco()`; o padrão não faz nada
    /// (a web e os sinks de teste).
    fn acordar(&self) {}
}

/// Adapta um [`Sink`] ao trait `Effects` do núcleo e numera os retratos.
///
/// M19: guarda o último retrato emitido. O núcleo sempre chama
/// `state_changed` logo antes de `phase_changed`, e o `tt://phase` leva o
/// `seq` e a fase desse retrato: o anúncio do `aria-live` sai do próprio
/// evento, sem depender da ordem em que o JS recebe os dois.
///
/// M38: também filtra os sons pelas [`Preferencias`]: um som desligado não
/// chega ao [`Sink`].
struct Outbox<'a, S: Sink> {
    sink: &'a S,
    seq: &'a mut u64,
    last: Option<FocusDto>,
    prefs: Preferencias,
}

impl<'a, S: Sink> Outbox<'a, S> {
    fn new(sink: &'a S, seq: &'a mut u64, prefs: Preferencias) -> Self {
        Self {
            sink,
            seq,
            last: None,
            prefs,
        }
    }
}

impl<S: Sink> Effects for Outbox<'_, S> {
    fn play_sound(&mut self, sound: Sound) {
        if self.prefs.toca(sound) {
            self.sink.sound(sound);
        } else if cfg!(debug_assertions) {
            eprintln!("[tomatito] som {sound:?} desligado nas configurações; não tocou");
        }
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
        // como o foco (3.2). As chaves `sounds.*` são dos fins de fase do foco
        // (M38): o temporizador toca mesmo com elas desligadas.
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
    /// T, F ou B iguais a zero (não acontece: T é validado aqui, e o
    /// `settings.rs` só aceita F e B a partir de 1).
    InvalidPlan,
    /// M32: não existe temporizador com esse id.
    NotFound,
    /// M32: duração fora de 1 s a 99:59:59.
    InvalidDuration,
    /// M32: nome com mais de 255 caracteres.
    NameTooLong,
    /// M32: iniciar um temporizador que já corre (M34: ou o cronômetro).
    AlreadyRunning,
    /// M34: mais de 999 voltas.
    TooManyLaps,
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

impl From<StopwatchError> for CommandError {
    fn from(e: StopwatchError) -> Self {
        let code = match e {
            StopwatchError::AlreadyRunning => ErrorCode::AlreadyRunning,
            StopwatchError::NotRunning => ErrorCode::NotRunning,
            StopwatchError::TooManyLaps => ErrorCode::TooManyLaps,
        };
        Self {
            code,
            message: e.to_string(),
        }
    }
}

struct Inner {
    focus: Focus,
    /// M34: o cronômetro, com o `seq` do último `tt://stopwatch`.
    stopwatch: Stopwatch,
    stopwatch_seq: u64,
    /// M32: os temporizadores, com o `seq` do último `tt://timers`.
    timers: Timers,
    timers_seq: u64,
    /// O `seq` do último `tt://state`.
    seq: u64,
    /// O último `tt://tick` emitido: sessão, fase e segundo mostrado.
    last_tick: Option<(i64, u32, u64)>,
    /// M38: F, B e os sons, das configurações.
    prefs: Preferencias,
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

    /// M34: o retrato do cronômetro em `now`, com o `seq` do último
    /// `tt://stopwatch`.
    fn stopwatch_dto(&self, now: EpochMs) -> StopwatchDto {
        let mut dto = StopwatchDto::from(&self.stopwatch.snapshot(now));
        dto.seq = self.stopwatch_seq;
        dto
    }

    /// Se o laço precisa rodar: uma fase corre, ou um temporizador corre
    /// rumo ao zero (um fim ainda por disparar). O cronômetro não conta
    /// (M34): não há nada nele que vença.
    fn active(&self) -> bool {
        self.focus.is_running() || self.timers.next_deadline().is_some()
    }
}

/// O motor: um por processo (um por aba, na web), compartilhado (`Arc`)
/// entre o laço e os comandos.
pub struct Engine<S: Sink> {
    clock: Box<dyn Clock>,
    speed: f64,
    sink: S,
    inner: Mutex<Inner>,
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
        // M32: os padrões de 1, 3, 5 e 10 min, até o `restaurar` (M40) trazer
        // a lista gravada, se houver.
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
                stopwatch: Stopwatch::new(),
                stopwatch_seq: 0,
                timers,
                timers_seq: 0,
                seq: 0,
                last_tick: None,
                prefs: Preferencias::default(),
            }),
            ticks: AtomicU64::new(0),
        }
    }

    /// O sink, para os testes (os do laço, no desktop, também).
    #[doc(hidden)]
    pub fn sink(&self) -> &S {
        &self.sink
    }

    /// Quantos ticks o laço já rodou, para os testes do laço (no desktop).
    #[doc(hidden)]
    pub fn ticks(&self) -> u64 {
        self.ticks.load(Ordering::SeqCst)
    }

    fn lock(&self) -> MutexGuard<'_, Inner> {
        // Um pânico com o motor travado não pode derrubar o app inteiro: o
        // estado do núcleo é trocado de uma vez, então segue válido.
        self.inner.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// M38: as preferências das configurações, no `setup` e a cada
    /// `settings_set`. Valem para a próxima sessão e o próximo fim de fase; a
    /// sessão em andamento continua com o F e o B com que começou.
    pub fn configurar(&self, prefs: Preferencias) {
        self.lock().prefs = prefs;
    }

    /// M40: a retomada, no `setup`, antes do laço e das janelas (e depois do
    /// `configurar`: um fim no horário toca o som das configurações). Cada
    /// parte do `state.json` volta à sua máquina; ausente ou recusada, fica o
    /// padrão, com a causa no registro. Depois, o `advance_to(now)` do foco e
    /// dos temporizadores: o que venceu com o app fechado é gravado e avisado
    /// ali, com a regra do atraso do núcleo (mais de 60 s: sem som, e um aviso
    /// só, "Sessão concluída às 14:32").
    pub fn restaurar(&self, r: Restored) {
        let mut g = self.lock();
        let now = self.clock.now();
        if let Some((last_session_id, sessao)) = r.focus
            && let Err(e) = g.focus.restore(last_session_id, sessao)
        {
            eprintln!("[tomatito] retomada: {e}; o foco fica ocioso");
        }
        if let Some(lista) = r.timers {
            let recusados = g.timers.restore(lista);
            if recusados > 0 {
                eprintln!("[tomatito] retomada: {recusados} temporizador(es) recusado(s)");
            }
        }
        if let Some(c) = r.stopwatch
            && !g.stopwatch.restore(c)
        {
            eprintln!("[tomatito] retomada: cronômetro incoerente no state.json; fica zerado");
        }
        let Inner {
            focus,
            seq,
            timers,
            timers_seq,
            prefs,
            ..
        } = &mut *g;
        focus.advance_to(now, &mut Outbox::new(&self.sink, seq, *prefs));
        timers.advance_to(
            now,
            &mut TimersOutbox {
                sink: &self.sink,
                seq: timers_seq,
            },
        );
        let active = g.active();
        drop(g);
        if active {
            self.sink.acordar();
        }
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

    /// W06a: o prazo mais próximo entre o fim da fase que corre e o do
    /// temporizador que corre rumo ao zero, sem avançar nada. `None` quando
    /// nada vence (o mesmo caso em que [`Engine::is_running`] é `false`). A
    /// web arma um despertador só para ele (PLANO-WEB, 3.4); o desktop não o
    /// usa (o `laco()` roda a 4 Hz enquanto algo corre).
    pub fn proximo_prazo(&self) -> Option<EpochMs> {
        let g = self.lock();
        g.focus
            .deadline()
            .into_iter()
            .chain(g.timers.next_deadline())
            .min()
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
            prefs,
            ..
        } = &mut *g;
        focus.advance_to(now, &mut Outbox::new(&self.sink, seq, *prefs));
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
            setup: setup(g.prefs.plano),
            timers: g.timers_dto(now),
            stopwatch: g.stopwatch_dto(now),
        }
    }

    /// Roda um comando do núcleo com um único "agora" (e o F e o B em uso,
    /// que só o `start` lê), acorda o laço se uma fase ficou correndo e
    /// devolve o retrato novo.
    fn command(
        &self,
        f: impl FnOnce(&mut Focus, EpochMs, PlanSettings, &mut dyn Effects) -> Result<(), FocusError>,
    ) -> Result<FocusDto, CommandError> {
        let mut g = self.lock();
        let now = self.clock.now();
        let Inner {
            focus, seq, prefs, ..
        } = &mut *g;
        let prefs = *prefs;
        let r = f(
            focus,
            now,
            prefs.plano,
            &mut Outbox::new(&self.sink, seq, prefs),
        );
        let running = g.active();
        let dto = g.dto(now);
        drop(g);
        if running {
            self.sink.acordar();
        }
        r?;
        Ok(dto)
    }

    /// `focus_start`. F e B vêm das configurações (M38).
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
        // O F e o B do momento do início: a sessão fica com eles até o fim.
        self.command(|f, now, plano, fx| {
            let config = SessionConfig {
                minutes,
                settings: plano,
                skip_breaks,
                task_id,
            };
            f.start(now, config, fx)
        })
    }

    pub fn pause(&self) -> Result<FocusDto, CommandError> {
        self.command(|f, now, _, fx| f.pause(now, fx))
    }

    pub fn resume(&self) -> Result<FocusDto, CommandError> {
        self.command(|f, now, _, fx| f.resume(now, fx))
    }

    pub fn skip(&self) -> Result<FocusDto, CommandError> {
        self.command(|f, now, _, fx| f.skip(now, fx))
    }

    pub fn stop(&self) -> Result<FocusDto, CommandError> {
        self.command(|f, now, _, fx| f.stop(now, fx))
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
            self.sink.acordar();
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

    /// M34: roda um comando do cronômetro com um único "agora"; aceito, emite
    /// o retrato novo (`tt://stopwatch` e `state.json`) e o devolve. Recusado,
    /// não emite nada.
    fn stopwatch_command(
        &self,
        f: impl FnOnce(&mut Stopwatch, EpochMs) -> Result<(), StopwatchError>,
    ) -> Result<StopwatchDto, CommandError> {
        let mut g = self.lock();
        let now = self.clock.now();
        f(&mut g.stopwatch, now)?;
        g.stopwatch_seq += 1;
        let dto = g.stopwatch_dto(now);
        self.sink.stopwatch(&dto);
        Ok(dto)
    }

    /// `stopwatch_start`: inicia (zerado) ou retoma (pausado).
    pub fn stopwatch_start(&self) -> Result<StopwatchDto, CommandError> {
        self.stopwatch_command(|c, now| c.start(now))
    }

    /// `stopwatch_pause`.
    pub fn stopwatch_pause(&self) -> Result<StopwatchDto, CommandError> {
        self.stopwatch_command(|c, now| c.pause(now))
    }

    /// `stopwatch_lap`: anota o total agora (a lista na tela é do M35).
    pub fn stopwatch_lap(&self) -> Result<StopwatchDto, CommandError> {
        self.stopwatch_command(|c, now| c.lap(now).map(|_| ()))
    }

    /// `stopwatch_reset`: zera e para, em qualquer estado.
    pub fn stopwatch_reset(&self) -> Result<StopwatchDto, CommandError> {
        self.stopwatch_command(|c, _| {
            c.reset();
            Ok(())
        })
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
            prefs,
            ..
        } = &mut *g;
        focus.advance_to(now, &mut Outbox::new(&self.sink, seq, *prefs));
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
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::events::{CauseDto, StatusDto};
    use crate::state_file::{SavedFocus, SavedStopwatch, SavedTimer, StateFile};
    use std::sync::Arc;
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
        Stopwatch(StopwatchDto),
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
        fn stopwatch(&self, c: &StopwatchDto) {
            self.put(Out::Stopwatch(c.clone()));
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
    fn proximo_prazo_e_o_menor_entre_a_fase_e_os_temporizadores() {
        let (e, clock) = motor();
        assert_eq!(e.proximo_prazo(), None, "ocioso, sem temporizador");
        e.start(5, false, None).unwrap();
        assert_eq!(e.proximo_prazo(), Some(T0.plus_ms(300_000)));
        // O de 1 min (id 1, dos padrões) vence antes da fase.
        e.timer_start(1).unwrap();
        assert_eq!(e.proximo_prazo(), Some(T0.plus_ms(60_000)));
        // Pausado, o foco sai da conta; passado o zero, o temporizador também.
        e.pause().unwrap();
        clock.advance_ms(61_000);
        e.tick();
        assert_eq!(e.proximo_prazo(), None);
        assert!(!e.is_running());
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

    /// Os sons de uma sessão de `minutos` inteira, pelo laço.
    fn sons_da_sessao(e: &Engine<Anota>, clock: &FakeClock, minutos: u32) -> Vec<Sound> {
        e.start(minutos, false, None).unwrap();
        let mut n = 0;
        while e.tick() {
            clock.advance_ms(250);
            n += 1;
            assert!(n < 60 * 60 * 4 * 4, "o laço não para");
        }
        e.sink()
            .tirar()
            .iter()
            .filter_map(|o| match o {
                Out::Sound(s) => Some(*s),
                _ => None,
            })
            .collect()
    }

    #[test]
    fn m38_preferencias_saem_das_configuracoes() {
        let mut s = Settings::default();
        assert_eq!(Preferencias::from(&s), Preferencias::default());
        s.focus_minutes = 50;
        s.break_minutes = 10;
        s.sounds.break_end = false;
        let p = Preferencias::from(&s);
        assert_eq!((p.plano.focus_minutes, p.plano.break_minutes), (50, 10));
        assert!(p.toca(Sound::FocusEnd) && !p.toca(Sound::BreakEnd));
    }

    #[test]
    fn m38_f_e_b_das_configuracoes_valem_na_proxima_sessao_e_no_preparo() {
        let (e, _) = motor();
        e.configurar(Preferencias {
            plano: PlanSettings {
                focus_minutes: 15,
                break_minutes: 10,
            },
            ..Preferencias::default()
        });
        let setup = e.state().setup;
        assert_eq!((setup.focus_minutes, setup.break_minutes), (15, 10));
        // T = 60 com F = 15 e B = 10: floor(59 / 25) = 2 intervalos.
        let r = e.start(60, false, None).unwrap();
        let s = r.session.unwrap();
        assert_eq!((s.focus_minutes, s.break_minutes), (15, 10));
        assert_eq!((s.blocks, s.intervals), (3, 2));
        assert_eq!(s.next.unwrap().duration_s, 600, "intervalo de 10 min");
    }

    #[test]
    fn m38_a_sessao_em_andamento_fica_com_o_plano_do_inicio() {
        let (e, clock) = motor();
        e.start(60, false, None).unwrap();
        e.configurar(Preferencias {
            plano: PlanSettings {
                focus_minutes: 15,
                break_minutes: 15,
            },
            ..Preferencias::default()
        });
        andar(&e, &clock, 1_000);
        let s = e.state();
        let sessao = s.focus.session.unwrap();
        assert_eq!((sessao.focus_minutes, sessao.break_minutes), (25, 5));
        assert_eq!((sessao.blocks, sessao.intervals), (2, 1));
        // O preparo da próxima já mostra os novos.
        assert_eq!((s.setup.focus_minutes, s.setup.break_minutes), (15, 15));
    }

    #[test]
    fn m38_desligar_um_som_silencia_o_proximo_fim_de_fase() {
        // O "Pronto quando" do M38, no motor: 60 min = foco, intervalo, foco.
        let (e, clock) = motor();
        assert_eq!(
            sons_da_sessao(&e, &clock, 60),
            [Sound::FocusEnd, Sound::BreakEnd, Sound::FocusEnd]
        );
        e.configurar(Preferencias {
            som_fim_de_foco: false,
            ..Preferencias::default()
        });
        assert_eq!(sons_da_sessao(&e, &clock, 60), [Sound::BreakEnd]);
        e.configurar(Preferencias {
            som_fim_de_intervalo: false,
            ..Preferencias::default()
        });
        assert_eq!(
            sons_da_sessao(&e, &clock, 60),
            [Sound::FocusEnd, Sound::FocusEnd]
        );
    }

    #[test]
    fn m38_som_desligado_no_meio_da_sessao_vale_no_proximo_fim() {
        let (e, clock) = motor();
        e.start(60, false, None).unwrap();
        e.sink().tirar();
        // Desliga o do intervalo durante o primeiro foco.
        e.configurar(Preferencias {
            som_fim_de_intervalo: false,
            ..Preferencias::default()
        });
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
        assert_eq!(sons, [Sound::FocusEnd, Sound::FocusEnd]);
        // A notificação do fim do intervalo sai do mesmo jeito.
        let avisos = out.iter().filter(|o| matches!(o, Out::Notice(_))).count();
        assert_eq!(avisos, 3, "fim do foco, fim do intervalo e fim da sessão");
    }

    #[test]
    fn m38_o_temporizador_toca_mesmo_com_os_sons_do_foco_desligados() {
        let (e, clock) = motor();
        e.configurar(Preferencias {
            som_fim_de_foco: false,
            som_fim_de_intervalo: false,
            ..Preferencias::default()
        });
        e.timer_start(1).unwrap();
        e.sink().tirar();
        andar(&e, &clock, 60_250);
        let out = e.sink().tirar();
        assert!(out.iter().any(|o| matches!(o, Out::Sound(Sound::FocusEnd))));
        assert!(out.iter().any(|o| matches!(o, Out::TimerNotice(_))));
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

    fn cronometros(out: &[Out]) -> Vec<&StopwatchDto> {
        out.iter()
            .filter_map(|o| match o {
                Out::Stopwatch(c) => Some(c),
                _ => None,
            })
            .collect()
    }

    #[test]
    fn get_state_traz_o_cronometro_zerado() {
        let (e, _) = motor();
        let c = e.state().stopwatch;
        assert_eq!(c.status, crate::events::StopwatchStatusDto::Idle);
        assert_eq!((c.seq, c.elapsed_ms, c.started_at), (0, 0, None));
        assert!(e.sink().tirar().is_empty());
    }

    #[test]
    fn cada_transicao_do_cronometro_emite_e_o_get_state_ve_o_decorrido() {
        use crate::events::StopwatchStatusDto as St;
        let (e, clock) = motor();
        let r = e.stopwatch_start().unwrap();
        assert_eq!(
            (r.status, r.started_at, r.seq),
            (St::Running, Some(T0.0), 1)
        );
        clock.advance_ms(12_340);
        let r = e.stopwatch_lap().unwrap();
        assert_eq!((r.laps.clone(), r.seq), (vec![12_340], 2));
        clock.advance_ms(660);
        assert_eq!(e.state().stopwatch.elapsed_ms, 13_000);
        let r = e.stopwatch_pause().unwrap();
        assert_eq!(
            (r.status, r.accumulated_ms, r.started_at),
            (St::Paused, 13_000, None)
        );
        clock.advance_ms(60_000);
        assert_eq!(e.state().stopwatch.elapsed_ms, 13_000);
        let r = e.stopwatch_reset().unwrap();
        assert_eq!(
            (r.status, r.elapsed_ms, r.laps.len(), r.seq),
            (St::Idle, 0, 0, 4)
        );
        let out = e.sink().tirar();
        let emitidos: Vec<u64> = cronometros(&out).iter().map(|c| c.seq).collect();
        assert_eq!(
            emitidos,
            vec![1, 2, 3, 4],
            "um tt://stopwatch por transição"
        );
        assert_eq!(out.len(), 4, "nada além do cronômetro");
    }

    #[test]
    fn erros_do_cronometro_nao_emitem() {
        let (e, _) = motor();
        assert_eq!(e.stopwatch_pause().unwrap_err().code, ErrorCode::NotRunning);
        assert_eq!(e.stopwatch_lap().unwrap_err().code, ErrorCode::NotRunning);
        e.stopwatch_start().unwrap();
        assert_eq!(
            e.stopwatch_start().unwrap_err().code,
            ErrorCode::AlreadyRunning
        );
        assert_eq!(cronometros(&e.sink().tirar()).len(), 1);
        assert_eq!(e.state().stopwatch.seq, 1);
    }

    #[test]
    fn cronometro_nao_acorda_o_laco() {
        let (e, clock) = motor();
        e.stopwatch_start().unwrap();
        assert!(!e.is_running(), "sem prazo, o laço dorme");
        clock.advance_ms(600_000);
        assert!(!e.tick());
        assert_eq!(e.state().stopwatch.elapsed_ms, 600_000);
    }

    #[test]
    fn cronometro_foco_e_temporizador_nao_se_misturam() {
        let (e, clock) = motor();
        e.start(5, false, None).unwrap();
        e.timer_start(1).unwrap();
        e.stopwatch_start().unwrap();
        e.sink().tirar();
        andar(&e, &clock, 60_000);
        e.stopwatch_pause().unwrap();
        let s = e.state();
        assert_eq!(s.stopwatch.elapsed_ms, 60_000);
        assert_eq!(s.focus.session.as_ref().unwrap().remaining_ms, 240_000);
        assert_eq!(s.timers.timers[0].remaining_ms, 0);
    }

    // --- M40: a retomada, pelo formato do `state.json`.

    /// Fecha `antes` (o estado gravado fica com o retrato do instante, como
    /// depois de um `kill -9`) e abre um motor novo, com o relógio em
    /// `abre_em`, que lê o estado e roda a retomada. Até o W04b isto passava
    /// por um `state.json` numa pasta de teste; o arquivo ficou no desktop
    /// (W05), e aqui o `StateFile` vai e volta pelo JSON, como o `save_all` e
    /// o `load` do `StateStore` fazem (os testes do arquivo em si, a versão e
    /// o corrompido, continuam no `state_file.rs` do desktop).
    fn reabrir(antes: &Engine<Anota>, abre_em: EpochMs) -> (Arc<Engine<Anota>>, FakeClock) {
        let estado = antes.state();
        let gravado = StateFile {
            saved_at: estado.focus.at,
            focus: Some(SavedFocus::from_dto(&estado.focus, 0)),
            timers: Some(
                estado
                    .timers
                    .timers
                    .iter()
                    .map(SavedTimer::from_dto)
                    .collect(),
            ),
            stopwatch: Some((&estado.stopwatch).into()),
            ..StateFile::default()
        };
        let json: serde_json::Value = serde_json::to_value(&gravado).unwrap();
        let focus: SavedFocus = serde_json::from_value(json["focus"].clone()).unwrap();
        let timers: Vec<SavedTimer> = serde_json::from_value(json["timers"].clone()).unwrap();
        let stopwatch: SavedStopwatch = serde_json::from_value(json["stopwatch"].clone()).unwrap();
        let r = Restored {
            focus: Some((
                focus.last_session_id,
                focus.session.as_ref().and_then(|s| s.record()),
            )),
            timers: Some(timers.iter().filter_map(SavedTimer::record).collect()),
            stopwatch: Some(stopwatch.record()),
        };
        let clock = FakeClock::new(abre_em);
        let e = Arc::new(Engine::new(Box::new(clock.clone()), 1.0, Anota::default()));
        e.restaurar(r);
        (e, clock)
    }

    #[test]
    fn retomada_no_meio_do_foco_continua_no_tempo_certo_sem_efeito() {
        let (a, clock) = motor();
        a.start(5, false, None).unwrap();
        clock.advance_ms(60_000);
        let (b, _) = reabrir(&a, T0.plus_ms(90_000));
        assert!(b.sink().tirar().is_empty(), "nada venceu: nada emitido");
        let s = b.state().focus;
        assert_eq!(s.status, StatusDto::Focus);
        let sessao = s.session.unwrap();
        assert_eq!(sessao.remaining_ms, 210_000);
        assert_eq!(sessao.ends_at, Some(T0.0 + 300_000));
        assert!(b.is_running(), "o laço acorda para a sessão retomada");
    }

    #[test]
    fn retomada_depois_do_prazo_grava_e_avisa_concluida_sem_som() {
        let (a, clock) = motor();
        a.start(5, false, None).unwrap();
        clock.advance_ms(30_000);
        let (b, _) = reabrir(&a, T0.plus_ms(7 * 60_000));
        let out = b.sink().tirar();
        assert!(!out.iter().any(|o| matches!(o, Out::Sound(_))), "sem som");
        assert!(out.iter().any(|o| matches!(
            o,
            Out::Period(p) if p.completed && p.actual_s == 300 && p.ended_at == T0.plus_ms(300_000)
        )));
        let avisos: Vec<_> = out
            .iter()
            .filter_map(|o| match o {
                Out::Notice(n) => Some(*n),
                _ => None,
            })
            .collect();
        assert!(matches!(
            avisos[..],
            [Notice::Late { session_completed: true, ended_at, .. }] if ended_at == T0.plus_ms(300_000)
        ));
        assert_eq!(b.state().focus.status, StatusDto::Completed);
        assert!(!b.is_running());
    }

    #[test]
    fn retomada_dos_temporizadores_e_do_cronometro() {
        let (a, clock) = motor();
        a.timer_create("Chá", 240_000).unwrap();
        a.timer_delete(1).unwrap();
        a.timer_start(5).unwrap();
        a.timer_start(2).unwrap(); // 3 min: zera com o app fechado
        a.stopwatch_start().unwrap();
        clock.advance_ms(10_000);
        a.stopwatch_lap().unwrap();
        let (b, _) = reabrir(&a, T0.plus_ms(5 * 60_000 + 1_000));
        let t = b.state().timers;
        assert_eq!(
            t.timers.iter().map(|t| t.id).collect::<Vec<_>>(),
            [2, 3, 4, 5],
            "a lista gravada, e não os padrões"
        );
        let cha = &t.timers[3];
        assert_eq!(cha.name, "Chá");
        assert_eq!(cha.ends_at, Some(T0.0 + 240_000));
        assert_eq!(cha.remaining_ms, -61_000);
        let out = b.sink().tirar();
        let fins: Vec<_> = out
            .iter()
            .filter_map(|o| match o {
                Out::TimerNotice(e) => Some((e.id, e.late)),
                _ => None,
            })
            .collect();
        assert_eq!(
            fins,
            [(2, true), (5, true)],
            "zeraram há mais de 60 s: atrasados"
        );
        assert!(!out.iter().any(|o| matches!(o, Out::Sound(_))));
        assert!(b.sink().tirar().is_empty());
        b.state();
        assert!(b.sink().tirar().is_empty(), "o fim não dispara de novo");
        let c = b.state().stopwatch;
        assert_eq!(c.elapsed_ms, 301_000);
        assert_eq!(c.laps, [10_000]);
        assert_eq!(
            b.timer_create("", 60_000)
                .unwrap()
                .timers
                .last()
                .unwrap()
                .id,
            6
        );
    }

    #[test]
    fn retomada_sem_arquivo_fica_nos_padroes() {
        let (e, _) = motor();
        e.restaurar(Restored::default());
        assert!(e.sink().tirar().is_empty());
        let s = e.state();
        assert_eq!(s.focus.status, StatusDto::Idle);
        assert_eq!(s.timers.timers.len(), 4);
    }
}
