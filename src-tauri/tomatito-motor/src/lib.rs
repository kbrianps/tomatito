//! Motor do Tomatito compartilhado pelo desktop e pela versão web (PLANO-WEB,
//! 3.3). Os módulos vieram do `src-tauri/src` sem mudar o conteúdo; o desktop
//! os reexporta (`pub use tomatito_motor::{events, i18n};`), então os caminhos
//! `crate::events` e `crate::i18n` de lá continuam valendo.

pub mod events;
pub mod i18n;
