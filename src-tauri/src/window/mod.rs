//! Janelas do app (PLANO.md, 3.4 e 5). Nenhuma janela vem do
//! `tauri.conf.json` (`app.windows: []`): todas nascem no `setup`.

pub mod main_window;

use std::sync::Arc;

use tauri::{AppHandle, Manager, Window};
use tauri_plugin_window_state::StateFlags;

use crate::commands::AppEngine;
use crate::settings::{SettingsStore, ThemePref};
use crate::state_file::StateStore;

/// Rótulo da janela do tomate (5.3), que nasce no M50.
pub const TOMATO_LABEL: &str = "tomato";

/// O que o `window-state` guarda da `main` (3.4, M37): tamanho, posição e
/// maximizada. O padrão do plugin (`all()`) inclui `VISIBLE`, e sair com a
/// janela escondida na bandeja faria o app reabrir invisível; `DECORATIONS`
/// também fica de fora.
pub const ESTADO_DA_JANELA: StateFlags = StateFlags::SIZE
    .union(StateFlags::POSITION)
    .union(StateFlags::MAXIMIZED);

/// "Mostrar Tomatito" (3.4), da bandeja (M36) e da segunda instância (M37).
/// Com `theme = full`, `unminimize` e `set_focus` na `tomato`, sem `hide` nem
/// `show` (no Linux, ela nunca pode ser escondida e mostrada de novo; 5.3).
/// Nos outros temas, ou enquanto a `tomato` não existe, `show`,
/// `unminimize` e `set_focus` na `main`. O GNOME pode só avisar "Tomatito
/// está pronto" (prevenção de roubo de foco); é aceito.
pub fn mostrar(app: &AppHandle) {
    let full = app
        .try_state::<SettingsStore>()
        .is_some_and(|s| s.get().theme == ThemePref::Full);
    if full && let Some(w) = app.get_webview_window(TOMATO_LABEL) {
        let _ = w.unminimize();
        let _ = w.set_focus();
        return;
    }
    if let Some(w) = app.get_webview_window(main_window::LABEL) {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

/// `CloseRequested` (3.4, "Fechar"): com "fechar para a bandeja" ligado (o
/// padrão), a `main` só se esconde, e o motor, o som e as notificações
/// seguem. Desligado, a janela fecha e, sendo a última, o app sai. Devolve
/// se o fechamento foi impedido.
pub fn fechar_para_bandeja(window: &Window) -> bool {
    if window.label() != main_window::LABEL {
        return false;
    }
    let ligado = window
        .try_state::<SettingsStore>()
        .is_none_or(|s| s.get().close_to_tray);
    if ligado && let Err(e) = window.hide() {
        eprintln!("[tomatito] janela não escondida: {e}");
    }
    ligado
}

/// "Sair" (3.4, "Fechar e sair"): o item da bandeja (M36), o `app_quit` do
/// Ctrl+Q (M37) e o "Sair do Tomatito" das Configurações (M39).
/// 1. Encerra a sessão de foco e registra o parcial (o `stop` do núcleo, o
///    mesmo do "Encerrar sessão"). Sem sessão, o núcleo responde `NoSession`:
///    nada a gravar.
/// 2. Grava o foco (sem sessão em andamento), os temporizadores e o
///    cronômetro no `state.json`. Cada transição já os grava (M33, M34 e
///    M40); esta gravação leva o retrato do momento da saída.
/// 3. Fecha o app com código 0. O `RunEvent::Exit` que o `exit` dispara faz o
///    `window-state` gravar o tamanho da janela (mesmo escondida) e o
///    `single-instance` soltar o nome no D-Bus.
pub fn sair(app: &AppHandle) {
    if let Some(motor) = app.try_state::<AppEngine>() {
        let _ = motor.stop();
        if let Some(estado) = app.try_state::<Arc<StateStore>>() {
            // M40: as três partes numa gravação só (o foco já sem sessão em
            // andamento).
            estado.save_all(&motor.state());
        }
    }
    app.exit(0);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn estado_da_janela_sem_visivel_nem_decoracoes() {
        // O `StateFlags` não tem `PartialEq`: compara os bits.
        assert_eq!(
            ESTADO_DA_JANELA.bits(),
            (StateFlags::SIZE | StateFlags::POSITION | StateFlags::MAXIMIZED).bits()
        );
        assert!(!ESTADO_DA_JANELA.contains(StateFlags::VISIBLE));
        assert!(!ESTADO_DA_JANELA.contains(StateFlags::DECORATIONS));
        assert!(!ESTADO_DA_JANELA.contains(StateFlags::FULLSCREEN));
    }
}
