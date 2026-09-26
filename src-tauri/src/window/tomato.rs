//! Janela `tomato` do Tomatito Full (PLANO.md, 5.3).
//!
//! Spike (M04–M05, branch `spike/full`). A janela nasce escondida, recebe a
//! região de entrada aproximada (spike B, M05) e só então aparece. As
//! preferências (`tomatoSize`, `tomatoOnTop`, `fullMode`) e o script de
//! inicialização entram no M50; a região exata, no M53 e no M54; a do
//! Windows, no M55.

use super::region_approx;
#[cfg(target_os = "linux")]
use super::region_linux::apply_region;
use tauri::window::Color;
use tauri::{AppHandle, Theme, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

/// Rótulo da janela; as permissões dela estão em `capabilities/tomato.json`.
pub const LABEL: &str = "tomato";

/// Tamanho M (280 px), o padrão de `tomatoSize` (PLANO.md, 3.3).
const SIZE: u32 = 280;

/// Padrão de `tomatoOnTop` no Windows 11. No Wayland não tem efeito.
const ON_TOP: bool = true;

pub fn build(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    let builder = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("tomato.html".into()))
        .title("Tomatito")
        .inner_size(f64::from(SIZE), f64::from(SIZE))
        .decorations(false)
        .transparent(true)
        // `shadow(true)` desenha borda de 1 px e cantos no Windows 11.
        .shadow(false)
        // Sem a borda de 5 px de redimensionar e sem o TAURI_DRAG_RESIZE_WINDOW.
        .resizable(false)
        .maximizable(false)
        .always_on_top(ON_TOP)
        .theme(Some(Theme::Dark))
        .background_color(Color(0, 0, 0, 0))
        // Nasce escondida: no Wayland, a região precisa estar no widget antes do
        // mapeamento (PLANO.md, 5.6). Além disso, com `visible(true)`,
        // o tao chama `set_visible` antes de `set_decorated(false)` e do
        // `set_titlebar`: no Wayland, o GTK mapeia a janela ainda decorada, e às
        // vezes ela fica com 332 × 369 (barra de título vazia de 37 px mais a
        // sombra do CSD) e a página para de desenhar. Ver docs/decisoes.md (M04).
        .visible(false);
    // Teste A/B contra o blur-behind no Windows (M55).
    #[cfg(windows)]
    let builder = builder.no_redirection_bitmap(true);
    let window = builder.build()?;
    let strips = region_approx::strips(SIZE);
    // Só para o teste aninhado (scripts/aninhado) comparar com o que o GTK
    // mandou ao compositor. Sai com o spike.
    #[cfg(debug_assertions)]
    eprintln!(
        "[tomato] região: {} retângulos em {SIZE} px: {strips:?}",
        strips.len()
    );
    apply_region(&window, strips)?;
    window.show()?;
    Ok(window)
}

/// Fora do Linux o spike não aplica região: a do Windows (`SetWindowRgn`,
/// PLANO.md, 5.5) é do M55.
#[cfg(not(target_os = "linux"))]
fn apply_region(_window: &WebviewWindow, _strips: Vec<region_approx::Strip>) -> tauri::Result<()> {
    Ok(())
}
