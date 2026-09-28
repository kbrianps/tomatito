//! Janelas do app (PLANO.md, 3.4 e 5). Nenhuma janela vem do
//! `tauri.conf.json` (`app.windows: []`): todas nascem no `setup`.

pub mod main_window;
pub mod tomato;

use tauri::{AppHandle, Manager, Window};

use crate::settings::{SettingsStore, ThemePref};

/// Rótulo da janela do tomate (5.3; `tomato.rs`, M50).
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

/// Rota que o `show_main` aceita: `#/` e letras minúsculas ou hífen (as do
/// `src/router.js`, como `#/configuracoes`). O texto vai para um `eval` na
/// `main`, então nada fora disso passa.
pub fn rota_valida(rota: &str) -> bool {
    rota.len() <= 32
        && rota
            .strip_prefix("#/")
            .is_some_and(|r| !r.is_empty() && r.chars().all(|c| c.is_ascii_lowercase() || c == '-'))
}

/// `show_main{route}` (3.5 e 5.7): mostra a `main` sem fechar a `tomato`
/// (`show`, `unminimize` e `set_focus`) e, com uma rota, troca a tela pelo
/// hash (o roteador ouve o `hashchange`). Sem a `main` (fechada com "fechar
/// para a bandeja" desligado), ela nasce de novo pelo `build_main` e se
/// mostra sozinha, na primeira tela; recriar já na rota pedida é do M51, que
/// recria a `main` ao sair do Full. Chame fora da thread principal (num
/// comando async), como toda criação de janela (5.3).
pub fn mostrar_main(app: &AppHandle, rota: Option<&str>) -> tauri::Result<()> {
    let Some(w) = app.get_webview_window(main_window::LABEL) else {
        let s = app.state::<SettingsStore>().get();
        main_window::build_main(app, &s)?;
        return Ok(());
    };
    if let Some(r) = rota.filter(|r| rota_valida(r)) {
        w.eval(format!("location.hash={}", serde_json::Value::from(r)))?;
    }
    w.show()?;
    w.unminimize()?;
    w.set_focus()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rotas_do_show_main() {
        assert!(rota_valida("#/configuracoes"));
        assert!(rota_valida("#/foco"));
        for ruim in [
            "",
            "#/",
            "configuracoes",
            "#/Foco",
            "#/a'b",
            "#/a;b",
            "#/x\"#)",
        ] {
            assert!(!rota_valida(ruim), "{ruim}");
        }
        assert!(!rota_valida(&format!("#/{}", "a".repeat(40))));
    }
}
