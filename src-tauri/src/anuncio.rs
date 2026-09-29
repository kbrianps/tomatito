//! Anúncio para o leitor de tela pelo lado nativo (M43).
//!
//! No Linux, o WebKitGTK 2.52 não entrega ao Orca o texto que entra numa
//! região `aria-live`: nenhuma mudança de texto fora de campos editáveis vira
//! `object:text-changed:insert`, que é o único evento que o Orca 50 lê como
//! mensagem de região viva (live_region_presenter.py), e o `ariaNotify` não
//! existe no WebKitGTK. Medido no GNOME aninhado com o Orca (docs/decisoes.md,
//! M43). O caminho que o Orca lê é o sinal `announcement` do ATK no objeto
//! acessível da janela GTK, que a ponte at-spi2-atk repassa como
//! `object:announcement`. O JS decide o texto (lib/a11y.js) e chama este
//! comando só no Linux; no Windows, a região `aria-live` do WebView2 fala com
//! o Narrador, e o comando não faz nada.

use tauri::AppHandle;

/// `a11y_announce{text}`: pede ao leitor de tela que leia `text` uma vez.
/// Postado na thread principal (a do GTK), sem esperar.
#[tauri::command]
pub fn a11y_announce(app: AppHandle, text: String) {
    anunciar(&app, text);
}

#[cfg(target_os = "linux")]
fn anunciar(app: &AppHandle, text: String) {
    use gtk::glib::prelude::ObjectExt;
    use gtk::prelude::WidgetExt;
    use tauri::Manager;

    let texto = text.trim().to_owned();
    if texto.is_empty() {
        return;
    }
    let alca = app.clone();
    let r = app.run_on_main_thread(move || {
        let Some(janela) = alca.get_webview_window("main") else {
            return;
        };
        let Ok(gtk) = janela.gtk_window() else {
            return;
        };
        // Sem barramento de acessibilidade (nenhum leitor de tela), o objeto
        // existe e o sinal não vai a lugar nenhum.
        if let Some(acessivel) = gtk.accessible() {
            acessivel.emit_by_name::<()>("announcement", &[&texto]);
        }
    });
    if let Err(e) = r {
        eprintln!("[tomatito] anúncio não postado: {e}");
    }
}

#[cfg(not(target_os = "linux"))]
fn anunciar(_app: &AppHandle, _text: String) {}
