//! Janela `main` (PLANO.md, 3.4 e 4.7): telas e Configurações, opaca, sem a
//! moldura do sistema e com a barra de título própria do
//! `src/components/title-bar.js`.
//!
//! A janela nasce escondida e com a cor de fundo do tema, e só aparece quando
//! o JS chama `show()`. As preferências de tema vêm do `settings.json`
//! (`settings.rs`, M23), lido no `setup` antes de a janela existir.

use tauri::window::Color;
use tauri::{AppHandle, Theme, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

use crate::settings::{NormalTheme, ResolvedTheme, Settings};

/// Rótulo da janela; as permissões dela estão em `capabilities/main.json`.
pub const LABEL: &str = "main";

/// Cor da janela antes da primeira pintura do WebView: o `--tt-bg-app` do tema
/// resolvido (`src/styles/tokens.css`). O `scripts/contrast.mjs` lê esta
/// função e confere cada braço contra o token (M24): mudar uma cor aqui ou lá
/// sem mudar a outra reprova o `npm test`.
pub fn background_for(resolved_theme: ResolvedTheme) -> Color {
    match resolved_theme {
        ResolvedTheme::Light => Color(0xF3, 0xF3, 0xF3, 0xFF),
        ResolvedTheme::Dark => Color(0x20, 0x20, 0x20, 0xFF),
        ResolvedTheme::Suave => Color(0xF6, 0xEC, 0xE9, 0xFF),
        ResolvedTheme::Lite => Color(0xA5, 0x34, 0x2B, 0xFF),
    }
}

/// Tema nativo da janela (menus e diálogos do sistema, e o `theme()` do JS):
/// o do `color-scheme` do tema resolvido (4.1: o Lite é escuro, o Suave é
/// claro), ou nenhum no modo Sistema, que segue o sistema. É o mesmo
/// `NATIVE` do `applyTheme` (4.6, `src/lib/theme.js`), aplicado já na
/// criação, para a janela nascer com o tema nativo certo (M24).
pub fn native_theme(s: &Settings) -> Option<Theme> {
    if s.last_normal_theme == NormalTheme::System {
        return None;
    }
    Some(match s.resolved_theme {
        ResolvedTheme::Lite | ResolvedTheme::Dark => Theme::Dark,
        ResolvedTheme::Suave | ResolvedTheme::Light => Theme::Light,
    })
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
        // Windows: o tema do builder vale. Linux: o tao ignora o do builder e
        // começa pelo do portal; o `set_theme` logo abaixo corrige.
        .theme(native_theme(s))
        // Aparece quando o JS chamar `show()`, já pintada.
        .visible(false)
        .initialization_script(init_script(s))
        .build()?;
    // No Linux, o tao ignora o `theme` do builder (a janela nasce com o
    // `color-scheme` do portal): sem isto, o Suave abriria com `theme()` =
    // `dark` e menus GTK escuros num sistema escuro. A janela ainda está
    // escondida. No modo Sistema, nada: o `setTheme(null)` do tao gravaria
    // `prefer-dark = false` (4.6, pegadinhas), e o JS resolve no boot.
    #[cfg(target_os = "linux")]
    if let Some(t) = native_theme(s) {
        win.set_theme(Some(t))?;
    }
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
    fn tema_nativo_segue_o_color_scheme_e_some_no_sistema() {
        use crate::settings::ThemePref;
        let nativo = |theme: ThemePref| {
            let mut s = Settings {
                theme,
                ..Settings::default()
            };
            s.normalize();
            native_theme(&s)
        };
        assert_eq!(nativo(ThemePref::Lite), Some(Theme::Dark));
        assert_eq!(nativo(ThemePref::Suave), Some(Theme::Light));
        assert_eq!(nativo(ThemePref::Light), Some(Theme::Light));
        assert_eq!(nativo(ThemePref::Dark), Some(Theme::Dark));
        assert_eq!(nativo(ThemePref::System), None);
        // No Full, a main mostra o tema normal: o do lastNormalTheme.
        let mut s = Settings {
            theme: ThemePref::Full,
            last_normal_theme: NormalTheme::Suave,
            ..Settings::default()
        };
        s.normalize();
        assert_eq!(native_theme(&s), Some(Theme::Light));
        s.last_normal_theme = NormalTheme::System;
        s.normalize();
        assert_eq!(native_theme(&s), None);
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
