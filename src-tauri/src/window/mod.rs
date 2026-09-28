//! Janelas do app (PLANO.md, 3.4 e 5). Nenhuma janela vem do
//! `tauri.conf.json` (`app.windows: []`): todas nascem no `setup`.

pub mod main_window;

use tauri::{AppHandle, Manager, Window};

use crate::settings::{SettingsStore, ThemePref};

/// Rótulo da janela do tomate (5.3), que nasce no M50.
pub const TOMATO_LABEL: &str = "tomato";

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
