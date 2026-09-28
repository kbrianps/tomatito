//! Motor do Tomatito.
//!
//! Guarda a regra dos intervalos (`plan`), o relógio de parede (`clock`) e as
//! máquinas de estado do foco (`focus`), dos temporizadores (`countdown`) e
//! do cronômetro (`stopwatch`, M34), e os dias e semanas das estatísticas
//! (`days`). Não conhece o Tauri: conversa com o app pelos traits [`Effects`]
//! e [`CountdownEffects`] (o cronômetro não pede efeitos: quem chama emite o
//! retrato), e os testes rodam sem janela, com o [`FakeClock`], o
//! [`FakeEffects`] e o [`FakeCountdownEffects`].
//!
//! A regra de isolamento (nenhuma dependência de janela nem de WebView, em
//! nenhum nível) é conferida por `tests/isolamento.rs`.

pub mod clock;
pub mod countdown;
pub mod days;
pub mod effects;
pub mod focus;
pub mod plan;
pub mod stopwatch;

pub use clock::{Clock, EpochMs, FakeClock, SystemClock, TimeZone, epoch_ms};
#[cfg(debug_assertions)]
pub use clock::{MAX_SPEED, SPEED_ENV, ScaledClock, SpeedError, parse_speed};
pub use countdown::{
    CountdownEffects, CountdownError, DEFAULT_MINUTES, FakeCountdownEffects, MAX_DURATION_MS,
    MAX_NAME_CHARS, MIN_DURATION_MS, TimerEnded, TimerId, TimerRecord, TimerRunRecord,
    TimerSnapshot, TimerStatus, Timers, TimersSnapshot, clean_name,
};
pub use days::{DayRange, StatsRanges, day_range, logical_date, stats_ranges, week_range};
pub use effects::{ChangeCause, Effect, Effects, FakeEffects, Notice, Period, PhaseChange, Sound};
pub use focus::{
    Focus, FocusError, FocusSnapshot, LATE_AFTER_MS, RestoreError, RunRecord, SessionConfig,
    SessionRecord, SessionSnapshot, Status,
};
pub use plan::{Phase, PhaseKind, Plan, PlanError, PlanSettings};
pub use stopwatch::{
    MAX_LAPS, Stopwatch, StopwatchError, StopwatchRecord, StopwatchSnapshot, StopwatchStatus,
};
