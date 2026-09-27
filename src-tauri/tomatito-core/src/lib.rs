//! Motor do Tomatito.
//!
//! Guarda a regra dos intervalos, o relógio de parede e as máquinas de estado
//! do foco, do temporizador e do cronômetro. Não conhece o Tauri: conversa com
//! o app pelo trait `Effects` (M15), e os testes rodam sem janela.
//!
//! A regra de isolamento (nenhuma dependência de janela nem de WebView, em
//! nenhum nível) é conferida por `tests/isolamento.rs`.

pub mod plan;

pub use plan::{Phase, PhaseKind, Plan, PlanError, PlanSettings};
