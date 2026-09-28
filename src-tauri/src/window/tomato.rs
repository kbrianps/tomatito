//! Janela `tomato` do Tomatito Full (PLANO.md, 5.3 e 5.10): o tomate
//! transparente, de 240, 280 ou 320 px, com a página `tomato.html`.
//!
//! M50: a janela é a da 5.3 (sem moldura, transparente, sem sombra, sem
//! redimensionar, tema nativo escuro), com o tamanho do `tomatoSize` e o
//! "sempre na frente" do `tomatoOnTop`, e nasce por um comando de debug
//! (`tomato_debug_open`), ainda sem região de entrada. Ficam para depois: a
//! troca normal ↔ Full com o `tt://tomato-ready` (M51), o modo opaco e o
//! `full_mode()` (B3, M52), a região (M53 a M55) e o menu nativo e os
//! atalhos (M56).

use tauri::window::Color;
use tauri::{AppHandle, Manager, Theme, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

use crate::settings::Settings;

/// Rótulo da janela; as permissões dela estão em `capabilities/tomato.json`.
pub use super::TOMATO_LABEL as LABEL;

/// Script de inicialização da `tomato` (5.3 e 4.7): só as globais que o
/// script de boot do `tomato.html` lê. A página do tomate é sempre `full`
/// (4.6), seja qual for o tema salvo. O `__TT_FULL_MODE__` ("opaque", B3)
/// entra com o `full_mode()` no M52.
pub fn init_script() -> String {
    let json = |valor: &str| serde_json::Value::from(valor).to_string();
    format!(
        "window.__TT_PREF__={};window.__TT_PLATFORM__={};",
        json("full"),
        json(std::env::consts::OS),
    )
}

/// Constrói a `tomato` escondida (5.3). Quem chama faz o `show()`; no M51,
/// depois do `tt://tomato-ready`, e no Linux, depois da região (M54).
///
/// Nasce com `visible(false)`: com `visible(true)` no builder, o tao mapeia a
/// janela ainda decorada no Wayland, e ela às vezes sai com 332 × 369 e para
/// de desenhar (docs/decisoes.md, M04, achado 1).
pub fn build_tomato(app: &AppHandle, s: &Settings) -> tauri::Result<WebviewWindow> {
    let size = f64::from(s.tomato_size);
    let builder = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("tomato.html".into()))
        .title("Tomatito")
        .inner_size(size, size)
        .decorations(false)
        .transparent(true)
        // `shadow(true)` desenha borda de 1 px e cantos no Windows 11.
        .shadow(false)
        // Sem a borda de 5 px de redimensionar e sem o TAURI_DRAG_RESIZE_WINDOW.
        .resizable(false)
        .maximizable(false)
        // Sem efeito no Wayland (3.8); no Windows, "Sempre na frente" (M56).
        .always_on_top(s.tomato_on_top)
        .theme(Some(Theme::Dark))
        .background_color(Color(0, 0, 0, 0))
        .visible(false)
        .initialization_script(init_script());
    // Teste A/B contra o blur-behind no Windows (M55).
    #[cfg(windows)]
    let builder = builder.no_redirection_bitmap(true);
    builder.build()
}

/// M50: abre o tomate, ou traz para a frente o que já está aberto
/// (`unminimize` e `set_focus`, sem `hide` nem `show`: no Linux, a `tomato`
/// nunca pode ser escondida e mostrada de novo, 5.3). O tomate lê o estado do
/// motor no boot (`get_state`), então fechar e abrir de novo não zera nada.
/// Chame fora da thread principal (num comando async): criar janela num
/// comando síncrono trava no Windows (5.3).
pub fn abrir(app: &AppHandle, s: &Settings) -> tauri::Result<WebviewWindow> {
    if let Some(w) = app.get_webview_window(LABEL) {
        w.unminimize()?;
        w.set_focus()?;
        return Ok(w);
    }
    let w = build_tomato(app, s)?;
    w.show()?;
    Ok(w)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn script_de_inicializacao_do_tomate_e_sempre_full() {
        assert_eq!(
            init_script(),
            format!(
                "window.__TT_PREF__=\"full\";window.__TT_PLATFORM__=\"{}\";",
                std::env::consts::OS
            )
        );
    }

    #[test]
    fn rotulo_e_o_das_permissoes() {
        assert_eq!(LABEL, "tomato");
    }
}
