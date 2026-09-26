//! Região de entrada da janela `tomato` no Linux (PLANO.md, 5.6).
//!
//! A região vai no nível do `GtkWidget`, nunca na `GdkWindow`: no Wayland o
//! tao liga o CSD, e o GTK reescreve a região da `GdkWindow` a cada alocação
//! (e ela nem existe antes do `show`). A do widget é guardada pelo GTK,
//! cruzada com a do CSD e enviada no mapeamento (`wl_surface.set_input_region`).

use super::region_approx::Strip;
use tauri::WebviewWindow;

/// Aplica a região. Chame antes do primeiro `show()`: no `setup`, que já roda
/// na thread principal, a tarefa executa na hora; fora dele, ela entra na
/// fila da thread principal antes do `show()`, que vai pela mesma fila.
pub fn apply_region(win: &WebviewWindow, strips: Vec<Strip>) -> tauri::Result<()> {
    let w = win.clone();
    // `gtk_window()` só na thread principal, e `cairo::Region` não é `Send`:
    // a região é montada aqui dentro.
    win.run_on_main_thread(move || {
        use gtk::cairo::{RectangleInt, Region};
        use gtk::prelude::*;
        let region = Region::create();
        for [x, y, width, height] in strips {
            if let Err(e) = region.union_rectangle(&RectangleInt::new(x, y, width, height)) {
                eprintln!("[tomato] região: falha ao somar um retângulo: {e}");
            }
        }
        match w.gtk_window() {
            Ok(gw) => gw.input_shape_combine_region(Some(&region)),
            Err(e) => eprintln!("[tomato] região: sem a GtkWindow: {e}"),
        }
    })
}
