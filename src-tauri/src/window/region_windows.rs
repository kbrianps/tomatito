//! Região da janela `tomato` no Windows (PLANO.md, 5.5; M55).
//!
//! No Windows, a região é a da janela inteira (`SetWindowRgn`): fora dela, o
//! sistema não desenha nem entrega clique, e o clique vai para a janela de
//! trás. As faixas chegam em px físicos (a página multiplica pelo
//! `devicePixelRatio`) e relativas à janela; com `decorations(false)` e
//! `shadow(false)`, a janela coincide com a área cliente.
//!
//! Junto, a borda do DWM: no Windows 11, ela pode continuar desenhada mesmo
//! com a região (5.5, devlog do jwno). [`sem_borda`] pede a cor `COLOR_NONE`
//! e os cantos sem arredondar; no Windows 10, os dois atributos não existem,
//! e o erro é ignorado.

use tauri::WebviewWindow;

/// Aplica as faixas (`[x, y, largura, altura]`, em px físicos da janela).
/// Na thread principal: o `SetWindowRgn` manda `WM_WINDOWPOS*` de forma
/// síncrona para a janela. Chamada de novo, a região nova substitui a antiga
/// (o sistema apaga a antiga).
pub fn apply_region(win: &WebviewWindow, strips: Vec<[i32; 4]>) -> tauri::Result<()> {
    // `HWND` não é `Send`: passa como número.
    let raw = win.hwnd()?.0 as isize;
    win.run_on_main_thread(move || {
        use windows::Win32::Foundation::HWND;
        use windows::Win32::Graphics::Gdi::{
            CombineRgn, CreateRectRgn, DeleteObject, RGN_ERROR, RGN_OR, SetWindowRgn,
        };
        // SAFETY: chamadas ao GDI com regiões criadas aqui mesmo; o `HWND` é
        // o da `tomato`, e a tarefa roda na thread dona dela.
        unsafe {
            let rgn = CreateRectRgn(0, 0, 0, 0);
            if rgn.is_invalid() {
                eprintln!("[tomatito] região: CreateRectRgn falhou");
                return;
            }
            for [x, y, largura, altura] in strips {
                let r = CreateRectRgn(x, y, x + largura, y + altura);
                if r.is_invalid() {
                    eprintln!("[tomatito] região: CreateRectRgn falhou em {x},{y}");
                    continue;
                }
                if CombineRgn(Some(rgn), Some(rgn), Some(r), RGN_OR) == RGN_ERROR {
                    eprintln!("[tomatito] região: CombineRgn falhou em {x},{y}");
                }
                // Só as temporárias.
                let _ = DeleteObject(r.into());
            }
            // Com sucesso, o sistema passa a ser dono da `rgn`: NUNCA apagar.
            // Só na falha ela continua nossa.
            if SetWindowRgn(HWND(raw as _), Some(rgn), true) == 0 {
                eprintln!("[tomatito] região: SetWindowRgn falhou");
                let _ = DeleteObject(rgn.into());
            }
        }
    })
}

/// Tira a borda do DWM da `tomato` (5.5): `DWMWA_BORDER_COLOR =
/// DWMWA_COLOR_NONE` e `DWMWCP_DONOTROUND`. Só existem a partir do Windows
/// 11 (build 22000); no 10, o `DwmSetWindowAttribute` devolve erro, e nada
/// muda. Chamada logo depois do `build()`, com a janela ainda escondida.
pub fn sem_borda(win: &WebviewWindow) -> tauri::Result<()> {
    let raw = win.hwnd()?.0 as isize;
    win.run_on_main_thread(move || {
        use windows::Win32::Foundation::HWND;
        use windows::Win32::Graphics::Dwm::{
            DWMWA_BORDER_COLOR, DWMWA_COLOR_NONE, DWMWA_WINDOW_CORNER_PREFERENCE,
            DWMWCP_DONOTROUND, DwmSetWindowAttribute,
        };
        let hwnd = HWND(raw as _);
        let cor: u32 = DWMWA_COLOR_NONE;
        let cantos = DWMWCP_DONOTROUND;
        // SAFETY: ponteiros para variáveis locais vivas durante a chamada,
        // com o tamanho de cada uma.
        unsafe {
            if let Err(e) = DwmSetWindowAttribute(
                hwnd,
                DWMWA_BORDER_COLOR,
                (&raw const cor).cast(),
                size_of_val(&cor) as u32,
            ) {
                eprintln!("[tomatito] borda do DWM mantida (Windows 10?): {e}");
            }
            if let Err(e) = DwmSetWindowAttribute(
                hwnd,
                DWMWA_WINDOW_CORNER_PREFERENCE,
                (&raw const cantos).cast(),
                size_of_val(&cantos) as u32,
            ) {
                eprintln!("[tomatito] cantos do DWM mantidos (Windows 10?): {e}");
            }
        }
    })
}
