//! Comandos chamados pelo JS com `invoke` (PLANO.md, 3.5). Cada um só
//! repassa ao motor (`engine.rs`), que tem as regras e os testes.
//!
//! Os comandos do foco devolvem o retrato novo, e o motor também o emite em
//! `tt://state`: quem chamou atualiza na hora, e as outras janelas pelo evento.

use std::sync::Arc;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager, State};
use tomatito_core::{Sound, TimeZone};

use crate::audio::Som;
use crate::engine::{CommandError, Engine, Preferencias, TauriSink};
use crate::events::{self, FocusDto, StateDto, StopwatchDto, TimersDto};
use crate::recursos::Recursos;
use crate::settings::{Settings, SettingsError, SettingsStore};
use crate::stats::{Stats, StatsDto};
use crate::tasks::{TaskDto, TaskError};
use crate::tray::Bandeja;

pub type AppEngine = Arc<Engine<TauriSink>>;

/// A resposta dos comandos que só existem no desktop (a janela, o tomate, a
/// região e a validação do Full), chamados no Android (A03, PLANO-ANDROID
/// 4.1). A tela do Android nem os oferece (a `casca`, A05).
#[cfg(mobile)]
const INDISPONIVEL: &str = "não disponível no Android";

/// Resposta do `get_state`: o retrato do motor (`focus`, `speed`, `setup`)
/// e, a partir do M23, as configurações em `settings`; no M39, os
/// `recursos` da plataforma (3.5 e 3.8, `recursos.rs`).
#[derive(Debug, Clone, Serialize)]
pub struct GetStateDto {
    #[serde(flatten)]
    pub state: StateDto,
    pub settings: Settings,
    pub recursos: Recursos,
}

/// O retrato inteiro. O JS sempre começa por aqui (3.1) e chama de novo no
/// `visibilitychange` e quando a janela ganha foco.
#[tauri::command]
pub fn get_state(
    engine: State<'_, AppEngine>,
    settings: State<'_, SettingsStore>,
    bandeja: State<'_, Arc<Bandeja>>,
) -> GetStateDto {
    GetStateDto {
        state: engine.state(),
        settings: settings.get(),
        recursos: crate::recursos::agora(bandeja.existe()),
    }
}

/// `app_quit` (3.5): "Sair", pelo Ctrl+Q (M37) e pelo "Sair do Tomatito" das
/// Configurações (M39). O mesmo caminho do item da bandeja
/// (`window::sair`, 3.4): encerra a sessão com o parcial, grava o
/// `state.json` e fecha o app.
#[cfg(desktop)]
#[tauri::command]
pub fn app_quit(app: AppHandle) {
    crate::window::sair(&app);
}

/// No Android, quem fecha o app é o sistema: não há "Sair".
#[cfg(mobile)]
#[tauri::command]
pub fn app_quit() -> Result<(), String> {
    Err(INDISPONIVEL.into())
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
    gravar_configuracoes(&app, &settings, &patch)
}

/// O caminho do `settings_set`, também para o `switch_window_mode` (5.7, M51):
/// grava, emite `tt://settings`, avisa a bandeja e, com a `tomato` aberta,
/// aplica o `tomatoSize` e o `tomatoOnTop` (M56).
pub fn gravar_configuracoes(
    app: &AppHandle,
    settings: &SettingsStore,
    patch: &Value,
) -> Result<Settings, SettingsError> {
    #[cfg(desktop)]
    let antes = settings.get();
    let depois = settings.set(patch, |s| {
        if let Err(e) = app.emit(events::SETTINGS, s) {
            eprintln!("[tomatito] {} não saiu: {e}", events::SETTINGS);
        }
        // M36: ligar ou desligar o tempo na bandeja vale na hora.
        if let Some(b) = app.try_state::<Arc<Bandeja>>() {
            b.tray_time(s.tray_time);
        }
        // M38: F e B (a próxima sessão), os sons de fim de fase (o próximo
        // fim) e o volume (o próximo som) também. Sem trava invertida: o
        // motor nunca lê as configurações com a própria trava.
        if let Some(motor) = app.try_state::<AppEngine>() {
            motor.configurar(Preferencias::from(s));
        }
        if let Some(som) = app.try_state::<Arc<Som>>() {
            som.definir_volume(s.volume);
        }
    })?;
    // M56: o tamanho e o "Sempre na frente" do tomate valem na hora.
    #[cfg(desktop)]
    crate::window::tomato::aplicar_preferencias(app, &antes, &depois);
    Ok(depois)
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
/// Toca mesmo com o som desligado nas configurações: o "Testar" é para ouvir
/// o som. Volta na hora; um erro de áudio só vai para o log (`audio.rs`).
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

// M32: os temporizadores (3.5, `timer_create/update/delete/start/pause/reset`).
// Cada um devolve o retrato de todos, e o motor também o emite em
// `tt://timers`. No JS, `durationMs` em ms.

/// `timer_create{name, duration_ms}`.
#[tauri::command]
pub fn timer_create(
    engine: State<'_, AppEngine>,
    name: Option<String>,
    duration_ms: u64,
) -> Result<TimersDto, CommandError> {
    engine.timer_create(name.as_deref().unwrap_or(""), duration_ms)
}

/// `timer_update{id, name, duration_ms}`.
#[tauri::command]
pub fn timer_update(
    engine: State<'_, AppEngine>,
    id: u64,
    name: Option<String>,
    duration_ms: u64,
) -> Result<TimersDto, CommandError> {
    engine.timer_update(id, name.as_deref().unwrap_or(""), duration_ms)
}

#[tauri::command]
pub fn timer_delete(engine: State<'_, AppEngine>, id: u64) -> Result<TimersDto, CommandError> {
    engine.timer_delete(id)
}

#[tauri::command]
pub fn timer_start(engine: State<'_, AppEngine>, id: u64) -> Result<TimersDto, CommandError> {
    engine.timer_start(id)
}

#[tauri::command]
pub fn timer_pause(engine: State<'_, AppEngine>, id: u64) -> Result<TimersDto, CommandError> {
    engine.timer_pause(id)
}

#[tauri::command]
pub fn timer_reset(engine: State<'_, AppEngine>, id: u64) -> Result<TimersDto, CommandError> {
    engine.timer_reset(id)
}

// M34: o cronômetro (3.5, `stopwatch_start/pause/lap/reset`). Cada um devolve
// o retrato novo, e o motor também o emite em `tt://stopwatch`.

#[tauri::command]
pub fn stopwatch_start(engine: State<'_, AppEngine>) -> Result<StopwatchDto, CommandError> {
    engine.stopwatch_start()
}

#[tauri::command]
pub fn stopwatch_pause(engine: State<'_, AppEngine>) -> Result<StopwatchDto, CommandError> {
    engine.stopwatch_pause()
}

#[tauri::command]
pub fn stopwatch_lap(engine: State<'_, AppEngine>) -> Result<StopwatchDto, CommandError> {
    engine.stopwatch_lap()
}

#[tauri::command]
pub fn stopwatch_reset(engine: State<'_, AppEngine>) -> Result<StopwatchDto, CommandError> {
    engine.stopwatch_reset()
}

/// `switch_window_mode{full}` (3.5 e 5.7, M51): entra no Full (grava
/// `theme = full`, cria a `tomato` escondida, espera o `tt://tomato-ready`
/// por até 2 s, mostra o tomate e esconde a `main`) ou sai dele (grava
/// `theme = lastNormalTheme`, mostra a `main`, recriada se preciso, e fecha
/// a `tomato`). Async: criar janela num comando síncrono trava no Windows
/// (5.3). Os detalhes estão em `window/tomato.rs`.
#[cfg(desktop)]
#[tauri::command]
pub async fn switch_window_mode(app: AppHandle, full: bool) -> Result<(), String> {
    if full {
        crate::window::tomato::entrar(&app).await
    } else {
        crate::window::tomato::sair(&app).await
    }
}

/// `show_main{route}` (3.5 e 5.7): o botão Configurações do tomate mostra a
/// `main` sem fechar a `tomato`, já na rota (`#/configuracoes`). Uma rota fora
/// do formato do roteador é ignorada (`window::rota_valida`). Async pelo
/// mesmo motivo do `switch_window_mode`: sem a `main`, ela nasce de novo (já
/// na rota, M51).
#[tauri::command]
pub async fn show_main(app: AppHandle, route: Option<String>) -> Result<(), String> {
    crate::window::mostrar_main(&app, route.as_deref()).map_err(|e| e.to_string())
}

/// `full_validation_get` (M52): o retrato da validação com reversão do Full
/// (5.9), que a `main` pede ao ligar (depois, ela segue o
/// `tt://full-validation`). Ver `window/validacao.rs`.
#[cfg(desktop)]
#[tauri::command]
pub fn full_validation_get(app: AppHandle) -> Value {
    crate::window::validacao::atual(&app)
}

/// `full_validation_answer{answer}` (M52): `keep` ou `revert` na pergunta,
/// `opaque` ou `dismiss` na oferta do B3. Async: reverter fecha a `tomato`, e
/// o modo opaco a cria de novo (5.3). Devolve o retrato depois da resposta.
#[cfg(desktop)]
#[tauri::command]
pub async fn full_validation_answer(
    app: AppHandle,
    answer: crate::window::validacao::Resposta,
) -> Result<Value, String> {
    crate::window::validacao::responder(&app, answer).await
}

/// `set_tomato_region{strips}` (3.5, 5.4 e 5.6; M54): a região de entrada da
/// `tomato`, em faixas `[x, y, largura, altura]` calculadas pela página. Só a
/// `tomato` pode pedir. Devolve `"applied"` ou `"ignored"` (modo opaco, ou o
/// Windows até o M55). Ver `window/tomato.rs`, `definir_regiao`.
#[cfg(desktop)]
#[tauri::command]
pub fn set_tomato_region(
    webview_window: tauri::WebviewWindow,
    strips: Vec<[i32; 4]>,
) -> Result<&'static str, String> {
    crate::window::tomato::definir_regiao(&webview_window, strips).map(|r| r.as_str())
}

/// `tomato_debug_size{size}` (M54, só no build de debug): troca o lado da
/// `tomato` para 240, 280 ou 320, sem gravar o `tomatoSize`. Serve para
/// conferir a região depois da troca de P para G; a escolha de verdade (menu
/// e preferência) é do M56. Async, como os outros comandos que mexem em
/// janela.
#[cfg(desktop)]
#[tauri::command]
pub async fn tomato_debug_size(app: AppHandle, size: u32) -> Result<(), String> {
    if !cfg!(debug_assertions) {
        return Err("tomato_debug_size só existe no build de debug".into());
    }
    crate::window::tomato::trocar_tamanho(&app, size)
}

/// `tomato_on_top_available` (M56): se o "Sempre na frente" do tomate
/// funciona por código (Windows e X11). No Wayland, não: o menu do tomate não
/// mostra o item, e as Configurações mostram uma vez a dica do Alt+Espaço.
#[cfg(desktop)]
#[tauri::command]
pub fn tomato_on_top_available() -> bool {
    crate::window::tomato::sempre_na_frente_por_codigo()
}

// A03: os mesmos comandos no Android, para o `generate_handler!` ser um só.
// O tomate em tela cheia do Android (A16a) troca o `switch_window_mode`.

#[cfg(mobile)]
#[tauri::command]
pub async fn switch_window_mode() -> Result<(), String> {
    Err(INDISPONIVEL.into())
}

/// Sem Full de desktop, nunca há validação: o retrato "nenhuma", o mesmo do
/// `window::validacao::retrato(0, &Fase::Nenhuma)`.
#[cfg(mobile)]
#[tauri::command]
pub fn full_validation_get() -> Value {
    serde_json::json!({ "seq": 0, "state": "none" })
}

#[cfg(mobile)]
#[tauri::command]
pub async fn full_validation_answer() -> Result<Value, String> {
    Err(INDISPONIVEL.into())
}

#[cfg(mobile)]
#[tauri::command]
pub fn set_tomato_region() -> Result<&'static str, String> {
    Err(INDISPONIVEL.into())
}

#[cfg(mobile)]
#[tauri::command]
pub async fn tomato_debug_size() -> Result<(), String> {
    Err(INDISPONIVEL.into())
}

#[cfg(mobile)]
#[tauri::command]
pub fn tomato_on_top_available() -> bool {
    false
}
