//! Comandos chamados pelo JS com `invoke` (PLANO.md, 3.5). Cada um só
//! repassa ao motor (`engine.rs`), que tem as regras e os testes.
//!
//! Os comandos do foco devolvem o retrato novo, e o motor também o emite em
//! `tt://state`: quem chamou atualiza na hora, e as outras janelas pelo evento.

use std::sync::Arc;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter, State};
use tomatito_core::{Sound, TimeZone};

use crate::audio::Som;
use crate::engine::{CommandError, Engine, TauriSink};
use crate::events::{self, FocusDto, StateDto};
use crate::settings::{Settings, SettingsError, SettingsStore};
use crate::stats::{Stats, StatsDto};
use crate::tasks::{TaskDto, TaskError};

pub type AppEngine = Arc<Engine<TauriSink>>;

/// Resposta do `get_state`: o retrato do motor (`focus`, `speed`, `setup`)
/// e, a partir do M23, as configurações em `settings`.
#[derive(Debug, Clone, Serialize)]
pub struct GetStateDto {
    #[serde(flatten)]
    pub state: StateDto,
    pub settings: Settings,
}

/// O retrato inteiro. O JS sempre começa por aqui (3.1) e chama de novo no
/// `visibilitychange` e quando a janela ganha foco.
#[tauri::command]
pub fn get_state(engine: State<'_, AppEngine>, settings: State<'_, SettingsStore>) -> GetStateDto {
    GetStateDto {
        state: engine.state(),
        settings: settings.get(),
    }
}

/// `settings_get`: as configurações atuais, no formato do `settings.json`.
#[tauri::command]
pub fn settings_get(settings: State<'_, SettingsStore>) -> Settings {
    settings.get()
}

/// `settings_set{patch}`: o único caminho de escrita (3.3). Aplica o patch,
/// grava e emite `tt://settings` para todas as janelas; devolve o resultado.
/// Um patch com chave desconhecida ou valor inválido é recusado inteiro, com
/// `{ code, message }` (`settings.rs`, `SettingsError`).
#[tauri::command]
pub fn settings_set(
    app: AppHandle,
    settings: State<'_, SettingsStore>,
    patch: Value,
) -> Result<Settings, SettingsError> {
    settings.set(&patch, |s| {
        if let Err(e) = app.emit(events::SETTINGS, s) {
            eprintln!("[tomatito] {} não saiu: {e}", events::SETTINGS);
        }
    })
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

/// Qual som testar, no JS: `"focusEnd"` ou `"breakEnd"`.
#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SoundDto {
    FocusEnd,
    BreakEnd,
}

impl From<SoundDto> for Sound {
    fn from(s: SoundDto) -> Self {
        match s {
            SoundDto::FocusEnd => Sound::FocusEnd,
            SoundDto::BreakEnd => Sound::BreakEnd,
        }
    }
}

/// `sound_test{sound?}`: toca um som agora, com o volume atual (o "Testar"
/// das Configurações, M38). Sem `sound`, toca os dois, um depois do outro.
/// Volta na hora; um erro de áudio só vai para o log (`audio.rs`).
#[tauri::command]
pub fn sound_test(som: State<'_, Arc<Som>>, sound: Option<SoundDto>) {
    let sons = match sound {
        Some(s) => vec![s.into()],
        None => vec![Sound::FocusEnd, Sound::BreakEnd],
    };
    for s in sons {
        som.tocar(s);
    }
}

/// `stats_get` (M26): o foco de ontem, de hoje e desta semana, com a meta e a
/// hora de zerar lidas das configurações (3.5). Os dias são os do fuso do
/// sistema, lido a cada chamada, e do relógio do motor.
#[tauri::command]
pub fn stats_get(
    engine: State<'_, AppEngine>,
    stats: State<'_, Arc<Stats>>,
    settings: State<'_, SettingsStore>,
) -> StatsDto {
    // Fecha o que venceu antes de somar, como o `get_state`: com a janela
    // voltando de uma suspensão, o card já sai com o período novo.
    engine.state();
    let s = settings.get();
    stats.summary(
        engine.now(),
        &TimeZone::system(),
        s.reset_hour,
        s.daily_goal_minutes,
    )
}

/// O "agora" e a hora de zerar que as tarefas usam: o relógio do motor
/// (acelerado no `TOMATITO_SPEED`) e as configurações, como o `stats_get`.
fn agora_e_zerar(engine: &AppEngine, settings: &SettingsStore) -> (tomatito_core::EpochMs, u8) {
    (engine.now(), settings.get().reset_hour)
}

/// `task_list` (M29): as pendentes e as concluídas desde a virada de hoje,
/// na ordem de criação (`tasks.rs`).
#[tauri::command]
pub fn task_list(
    engine: State<'_, AppEngine>,
    stats: State<'_, Arc<Stats>>,
    settings: State<'_, SettingsStore>,
) -> Result<Vec<TaskDto>, TaskError> {
    let (agora, zerar) = agora_e_zerar(&engine, &settings);
    stats.task_list(agora, &TimeZone::system(), zerar)
}

/// `task_add{title}` (M29): devolve a tarefa criada, pendente.
#[tauri::command]
pub fn task_add(
    engine: State<'_, AppEngine>,
    stats: State<'_, Arc<Stats>>,
    title: String,
) -> Result<TaskDto, TaskError> {
    stats.task_add(&title, engine.now())
}

/// `task_complete{id, done}` (M29): `done` é opcional e vale `true`; com
/// `false`, a tarefa volta a pendente. Devolve a tarefa como ficou.
#[tauri::command]
pub fn task_complete(
    engine: State<'_, AppEngine>,
    stats: State<'_, Arc<Stats>>,
    id: i64,
    done: Option<bool>,
) -> Result<TaskDto, TaskError> {
    stats.task_complete(id, done.unwrap_or(true), engine.now())
}

/// `task_delete{id}` (M29).
#[tauri::command]
pub fn task_delete(stats: State<'_, Arc<Stats>>, id: i64) -> Result<(), TaskError> {
    stats.task_delete(id)
}
