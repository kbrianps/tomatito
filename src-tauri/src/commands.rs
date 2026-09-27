//! Comandos chamados pelo JS com `invoke` (PLANO.md, 3.5). Cada um só
//! repassa ao motor (`engine.rs`), que tem as regras e os testes.
//!
//! Os comandos do foco devolvem o retrato novo, e o motor também o emite em
//! `tt://state`: quem chamou atualiza na hora, e as outras janelas pelo evento.

use std::sync::Arc;

use tauri::State;

use crate::engine::{CommandError, Engine, TauriSink};
use crate::events::{FocusDto, StateDto};

pub type AppEngine = Arc<Engine<TauriSink>>;

/// O retrato inteiro. O JS sempre começa por aqui (3.1) e chama de novo no
/// `visibilitychange` e quando a janela ganha foco.
#[tauri::command]
pub fn get_state(engine: State<'_, AppEngine>) -> StateDto {
    engine.state()
}

/// `focus_start{minutes, skip_breaks, task_id}`. No JS: `{ minutes,
/// skipBreaks, taskId }`, com os dois últimos opcionais.
#[tauri::command]
pub fn focus_start(
    engine: State<'_, AppEngine>,
    minutes: u32,
    skip_breaks: Option<bool>,
    task_id: Option<i64>,
) -> Result<FocusDto, CommandError> {
    engine.start(minutes, skip_breaks.unwrap_or(false), task_id)
}

#[tauri::command]
pub fn focus_pause(engine: State<'_, AppEngine>) -> Result<FocusDto, CommandError> {
    engine.pause()
}

#[tauri::command]
pub fn focus_resume(engine: State<'_, AppEngine>) -> Result<FocusDto, CommandError> {
    engine.resume()
}

#[tauri::command]
pub fn focus_skip(engine: State<'_, AppEngine>) -> Result<FocusDto, CommandError> {
    engine.skip()
}

#[tauri::command]
pub fn focus_stop(engine: State<'_, AppEngine>) -> Result<FocusDto, CommandError> {
    engine.stop()
}
