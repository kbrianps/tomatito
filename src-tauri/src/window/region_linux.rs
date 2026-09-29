//! Região de entrada da janela `tomato` no Linux (PLANO.md, 5.6; M54).
//!
//! A região vai no nível do `GtkWidget`, nunca na `GdkWindow`: no Wayland, o
//! tao liga o CSD, e o GTK reescreve a região da `GdkWindow` a cada alocação
//! (e ela nem existe antes do `show`). A do widget é guardada pelo GTK,
//! cruzada com a do CSD e enviada no mapeamento e a cada `configure`
//! (`wl_surface.set_input_region`). Chamada de novo, ela substitui a
//! anterior, o que cobre a troca entre P, M e G.

use tauri::WebviewWindow;

/// Aplica as faixas (`[x, y, largura, altura]`, em px lógicos da janela). A
/// tarefa entra na fila da thread principal, a mesma do `show()`: pedida
/// antes dele, a região já está no widget quando a janela é mapeada.
pub fn apply_region(win: &WebviewWindow, strips: Vec<[i32; 4]>) -> tauri::Result<()> {
    let w = win.clone();
    // `gtk_window()` só na thread principal, e `cairo::Region` não é `Send`:
    // a região é montada aqui dentro.
    win.run_on_main_thread(move || {
        use gtk::cairo::{RectangleInt, Region};
        use gtk::prelude::*;
        let region = Region::create();
        for [x, y, largura, altura] in strips {
            if let Err(e) = region.union_rectangle(&RectangleInt::new(x, y, largura, altura)) {
                eprintln!("[tomatito] região: falha ao somar um retângulo: {e}");
            }
        }
        match w.gtk_window() {
            Ok(gw) => gw.input_shape_combine_region(Some(&region)),
            Err(e) => eprintln!("[tomatito] região: sem a GtkWindow: {e}"),
        }
    })
}

/// Troca o lado da `tomato` (P/M/G). A janela não é redimensionável, e o GTK 3
/// prende uma janela assim em `max(tamanho padrão, pedido)`
/// (`gtk_window_update_fixed_size`): o tamanho padrão, que o tao define na
/// criação, precisa mudar junto, senão ela nunca encolhe. O `resize` sozinho
/// (o `set_size` do Tauri) não basta. A região vem depois, pelo `Resized`.
pub fn resize(win: &WebviewWindow, lado: i32) -> tauri::Result<()> {
    let w = win.clone();
    win.run_on_main_thread(move || {
        use gtk::prelude::*;
        match w.gtk_window() {
            Ok(gw) => {
                gw.set_default_size(lado, lado);
                gw.resize(lado, lado);
            }
            Err(e) => eprintln!("[tomatito] tamanho: sem a GtkWindow: {e}"),
        }
    })
}
