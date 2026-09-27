//! Janela `main` (PLANO.md, 3.4 e 4.7): telas e Configurações, opaca, sem a
//! moldura do sistema e com a barra de título própria do
//! `src/components/title-bar.js`.
//!
//! A janela nasce escondida e com a cor de fundo do tema, e só aparece quando
//! o JS chama `show()`. O `settings.rs` ainda não existe: até ele chegar, as
//! preferências de tema vêm de [`ThemePrefs::LITE`], fixas (M07).

use tauri::window::Color;
use tauri::{AppHandle, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

/// Rótulo da janela; as permissões dela estão em `capabilities/main.json`.
pub const LABEL: &str = "main";

/// As três chaves de tema do `settings.json` que a `main` precisa antes do
/// JS (PLANO.md, 3.3). Os nomes são os dos campos da futura `Settings`, para a
/// troca por `&Settings` ser só de tipo.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ThemePrefs<'a> {
    /// `lite`, `suave`, `light`, `dark`, `system` ou `full`.
    pub theme: &'a str,
    /// Tema normal para onde "Voltar ao modo normal" leva.
    pub last_normal_theme: &'a str,
    /// Tema que a `main` mostra: `lite`, `suave`, `light` ou `dark`.
    pub resolved_theme: &'a str,
}

impl ThemePrefs<'static> {
    /// Padrão da seção 3.3 e, até o `settings.rs`, o único valor usado.
    pub const LITE: Self = Self {
        theme: "lite",
        last_normal_theme: "lite",
        resolved_theme: "lite",
    };
}

/// Cor da janela antes da primeira pintura do WebView: o `--tt-bg-app` do tema
/// resolvido (`src/styles/tokens.css`). O `contrast.mjs` passa a conferir esta
/// tabela no M24.
pub fn background_for(resolved_theme: &str) -> Color {
    match resolved_theme {
        "light" => Color(0xF3, 0xF3, 0xF3, 0xFF),
        "dark" => Color(0x20, 0x20, 0x20, 0xFF),
        "suave" => Color(0xF6, 0xEC, 0xE9, 0xFF),
        _ => Color(0xA5, 0x34, 0x2B, 0xFF), // lite
    }
}

/// Script de inicialização: roda antes do parse do HTML, quando o `<html>`
/// ainda não existe, então só define variáveis globais. Quem grava os
/// atributos `data-*` é o script do `<head>` (M08).
pub fn init_script(prefs: &ThemePrefs) -> String {
    let json = |valor: &str| serde_json::Value::from(valor).to_string();
    format!(
        "window.__TT_PREF__={};window.__TT_LAST__={};window.__TT_PLATFORM__={};",
        json(prefs.theme),
        json(prefs.last_normal_theme),
        json(std::env::consts::OS),
    )
}

pub fn build_main(app: &AppHandle, prefs: &ThemePrefs) -> tauri::Result<WebviewWindow> {
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
        .background_color(background_for(prefs.resolved_theme))
        // Aparece quando o JS chamar `show()`, já pintada.
        .visible(false)
        .initialization_script(init_script(prefs))
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
        assert_eq!(hex(background_for("lite")), "#A5342BFF");
        assert_eq!(hex(background_for("suave")), "#F6ECE9FF");
        assert_eq!(hex(background_for("light")), "#F3F3F3FF");
        assert_eq!(hex(background_for("dark")), "#202020FF");
        // Valor desconhecido cai no padrão (Lite), nunca numa janela transparente.
        assert_eq!(hex(background_for("")), "#A5342BFF");
    }

    #[test]
    fn script_de_inicializacao_so_define_as_tres_globais() {
        let script = init_script(&ThemePrefs::LITE);
        let esperado = format!(
            "window.__TT_PREF__=\"lite\";window.__TT_LAST__=\"lite\";window.__TT_PLATFORM__=\"{}\";",
            std::env::consts::OS
        );
        assert_eq!(script, esperado);
    }

    #[test]
    fn script_de_inicializacao_escapa_os_valores_como_json() {
        let prefs = ThemePrefs {
            theme: "a\"b",
            last_normal_theme: "c\\d",
            resolved_theme: "lite",
        };
        let script = init_script(&prefs);
        assert!(script.starts_with(r#"window.__TT_PREF__="a\"b";window.__TT_LAST__="c\\d";"#));
    }
}
