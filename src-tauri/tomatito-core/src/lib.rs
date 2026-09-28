//! Motor do Tomatito.
//!
//! Guarda a regra dos intervalos (`plan`), o relógio de parede (`clock`) e as
//! máquinas de estado do foco (`focus`), do temporizador e do cronômetro. Não
//! conhece o Tauri: conversa com o app pelo trait [`Effects`], e os testes
//! rodam sem janela, com o [`FakeClock`] e o [`FakeEffects`].
//!
//! A regra de isolamento (nenhuma dependência de janela nem de WebView, em
//! nenhum nível) é conferida por `tests/isolamento.rs`.

pub mod clock;
pub mod effects;
pub mod focus;
pub mod plan;

pub use clock::{Clock, EpochMs, FakeClock, SystemClock, TimeZone, epoch_ms};
#[cfg(debug_assertions)]
pub use clock::{MAX_SPEED, SPEED_ENV, ScaledClock, SpeedError, parse_speed};
pub use effects::{ChangeCause, Effect, Effects, FakeEffects, Notice, Period, PhaseChange, Sound};
pub use focus::{
    Focus, FocusError, FocusSnapshot, LATE_AFTER_MS, SessionConfig, SessionSnapshot, Status,
};
pub use plan::{Phase, PhaseKind, Plan, PlanError, PlanSettings};
