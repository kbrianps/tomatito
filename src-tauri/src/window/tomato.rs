//! Janela `tomato` do Tomatito Full (PLANO.md, 5.3).
//!
//! Spike A (M04, branch `spike/full`): a janela aparece logo, sem região de
//! entrada, só para conferir a transparência no GNOME Wayland. A região antes
//! do `show()` entra no spike B (M05); as preferências
//! (`tomatoSize`, `tomatoOnTop`, `fullMode`) e o script de inicialização, no M50.

use tauri::window::Color;
use tauri::{AppHandle, Theme, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

/// Rótulo da janela; as permissões dela estão em `capabilities/tomato.json`.
pub const LABEL: &str = "tomato";

/// Tamanho M (280 px), o padrão de `tomatoSize` (PLANO.md, 3.3).
const SIZE: f64 = 280.0;

/// Padrão de `tomatoOnTop` no Windows 11. No Wayland não tem efeito.
const ON_TOP: bool = true;

pub fn build(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    let builder = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("tomato.html".into()))
        .title("Tomatito")
        .inner_size(SIZE, SIZE)
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
        // Nasce escondida e só aparece no `show()` abaixo. Com `visible(true)`,
        // o tao chama `set_visible` antes de `set_decorated(false)` e do
        // `set_titlebar`: no Wayland, o GTK mapeia a janela ainda decorada, e às
        // vezes ela fica com 332 × 369 (barra de título vazia de 37 px mais a
        // sombra do CSD) e a página para de desenhar. Ver docs/decisoes.md (M04).
        .visible(false);
    // Teste A/B contra o blur-behind no Windows (M55).
    #[cfg(windows)]
    let builder = builder.no_redirection_bitmap(true);
    let window = builder.build()?;
    // Spike A: mostra já, sem região. O spike B (M05) aplica a região antes.
    window.show()?;
    Ok(window)
}
