//! Motor do Tomatito compartilhado pelo desktop e pela versão web (PLANO-WEB,
//! 3.3). Os módulos vieram do `src-tauri/src`:
//! - `events` e `i18n` (W04a) sem mudar o conteúdo;
//! - `settings`, `tasks` e `state_file` (W04b) só com a parte pura: o formato,
//!   a validação e as conversões. O arquivo, o SQL e o que depende do sistema
//!   ficaram no desktop.
//!
//! O desktop reexporta tudo (`pub use tomatito_motor::{events, i18n};` e
//! `pub use tomatito_motor::<módulo>::*;` nos três outros), então os caminhos
//! `crate::events`, `crate::settings` etc. de lá continuam valendo.

pub mod events;
pub mod i18n;
pub mod settings;
pub mod state_file;
pub mod tasks;
