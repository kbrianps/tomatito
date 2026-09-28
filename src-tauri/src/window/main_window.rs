//! Janela `main` (PLANO.md, 3.4 e 4.7): telas e Configurações, opaca, sem a
//! moldura do sistema e com a barra de título própria do
//! `src/components/title-bar.js`.
//!
//! A janela nasce escondida e com a cor de fundo do tema, e só aparece quando
//! o JS chama `show()`. As preferências de tema vêm do `settings.json`
//! (`settings.rs`, M23), lido no `setup` antes de a janela existir.

use tauri::window::Color;
use tauri::{AppHandle, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

use crate::settings::{ResolvedTheme, Settings};

/// Rótulo da janela; as permissões dela estão em `capabilities/main.json`.
pub const LABEL: &str = "main";

/// Cor da janela antes da primeira pintura do WebView: o `--tt-bg-app` do tema
/// resolvido (`src/styles/tokens.css`). O `contrast.mjs` passa a conferir esta
/// tabela no M24.
pub fn background_for(resolved_theme: ResolvedTheme) -> Color {
    match resolved_theme {
        ResolvedTheme::Light => Color(0xF3, 0xF3, 0xF3, 0xFF),
        ResolvedTheme::Dark => Color(0x20, 0x20, 0x20, 0xFF),
        ResolvedTheme::Suave => Color(0xF6, 0xEC, 0xE9, 0xFF),
        ResolvedTheme::Lite => Color(0xA5, 0x34, 0x2B, 0xFF),
    }
}

/// Script de inicialização: roda antes do parse do HTML, quando o `<html>`
/// ainda não existe, então só define variáveis globais. Quem grava os
/// atributos `data-*` é o script do `<head>` (M08): com `theme = full`, ele
/// usa o `__TT_LAST__`; com `system`, o `prefers-color-scheme`.
pub fn init_script(s: &Settings) -> String {
    let json = |valor: &str| serde_json::Value::from(valor).to_string();
    format!(
        "window.__TT_PREF__={};window.__TT_LAST__={};window.__TT_PLATFORM__={};",
        json(s.theme.as_str()),
        json(s.last_normal_theme.as_str()),
        json(std::env::consts::OS),
    )
}

pub fn build_main(app: &AppHandle, s: &Settings) -> tauri::Result<WebviewWindow> {
    let win = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("index.html".into()))
        .title("Tomatito")
        .inner_size(1000.0, 700.0)
        .min_inner_size(480.0, 500.0)
        // Barra de título própria (32 px). No Linux, a borda de 1 px vem do shell.css.
        .decorations(false)
        // Windows 11: borda do DWM e cantos arredondados. Linux: sem efeito.
        .shadow(true)
        // Ctrl+ / Ctrl− / Ctrl+0 (PLANO.md, 3.8). No Linux, o Tauri injeta um
        // script que pede `set_webview_zoom`, liberado em capabilities/main.json.
        .zoom_hotkeys_enabled(true)
        .background_color(background_for(s.resolved_theme))
        // Aparece quando o JS chamar `show()`, já pintada.
        .visible(false)
        .initialization_script(init_script(s))
        .build()?;
    // A borda do DWM na cor do tema (`window::dwm::set_border`) entra no M48.
    Ok(win)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fundo_de_cada_tema_e_o_bg_app_do_tokens_css() {
        let hex = |c: Color| format!("#{:02X}{:02X}{:02X}{:02X}", c.0, c.1, c.2, c.3);
        assert_eq!(hex(background_for(ResolvedTheme::Lite)), "#A5342BFF");
        assert_eq!(hex(background_for(ResolvedTheme::Suave)), "#F6ECE9FF");
        assert_eq!(hex(background_for(ResolvedTheme::Light)), "#F3F3F3FF");
        assert_eq!(hex(background_for(ResolvedTheme::Dark)), "#202020FF");
    }

    #[test]
    fn script_de_inicializacao_so_define_as_tres_globais() {
        let script = init_script(&Settings::default());
        let esperado = format!(
            "window.__TT_PREF__=\"lite\";window.__TT_LAST__=\"lite\";window.__TT_PLATFORM__=\"{}\";",
            std::env::consts::OS
        );
        assert_eq!(script, esperado);
    }

    #[test]
    fn script_de_inicializacao_le_as_preferencias() {
        use crate::settings::{NormalTheme, ThemePref};
        let mut s = Settings {
            theme: ThemePref::Full,
            last_normal_theme: NormalTheme::System,
            ..Settings::default()
        };
        s.normalize();
        assert!(
            init_script(&s)
                .starts_with(r#"window.__TT_PREF__="full";window.__TT_LAST__="system";"#)
        );
        let s = Settings {
            theme: ThemePref::Suave,
            ..Settings::default()
        };
        assert!(
            init_script(&s).starts_with(r#"window.__TT_PREF__="suave";window.__TT_LAST__="lite";"#)
        );
    }
}
