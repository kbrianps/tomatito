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
//!
//! Junção com o Full (M50–M57): a `main` e a `tomato` ligam o mesmo anúncio
//! das fases (lib/a11y.js), e as duas chamam o comando a cada fase, com
//! `fase: true`. Desse anúncio, só a chamada da janela que está na frente
//! vale ([`vale`]): a `tomato` no Full, a `main` fora dele. Assim o Orca lê
//! uma vez só, e no início direto no Full (sem a `main`) ele lê pelo tomate.
//! Os demais anúncios (`fase: false`, como "Voltas copiadas" do cronômetro)
//! só existem numa janela e valem sempre: a `main` pode estar na tela com o
//! tomate aberto (Configurações do tomate), e o texto não pode sumir.

use tauri::{AppHandle, Manager, WebviewWindow};

use crate::settings::{SettingsStore, ThemePref};
use crate::window::{TOMATO_LABEL, main_window};

/// `a11y_announce{text}`: pede ao leitor de tela que leia `text` uma vez.
/// Postado na thread principal (a do GTK), sem esperar.
#[tauri::command]
pub fn a11y_announce(app: AppHandle, window: WebviewWindow, text: String, fase: Option<bool>) {
    let full = app
        .try_state::<SettingsStore>()
        .is_some_and(|s| s.get().theme == ThemePref::Full);
    let tomate = app.get_webview_window(TOMATO_LABEL).is_some();
    let fase = fase.unwrap_or(false);
    if !vale(fase, window.label(), full, tomate) {
        // Só no build de debug: o roteiro `full` do GNOME aninhado lê isto
        // no app.log (a junção com o Full).
        #[cfg(debug_assertions)]
        eprintln!(
            "[tomatito] anúncio descartado ({}, fase): {}",
            window.label(),
            text.trim()
        );
        return;
    }
    #[cfg(debug_assertions)]
    eprintln!(
        "[tomatito] anúncio ({}{}): {}",
        window.label(),
        if fase { ", fase" } else { "" },
        text.trim()
    );
    anunciar(&app, window.label().to_owned(), text);
}

/// Se o anúncio pedido pela janela `rotulo` vale: o das fases só pela janela
/// da frente ([`janela_do_anuncio`]); os demais, sempre.
pub fn vale(fase: bool, rotulo: &str, full: bool, tomate_aberto: bool) -> bool {
    !fase || rotulo == janela_do_anuncio(full, tomate_aberto)
}

/// A janela cujo anúncio das fases vale: a `tomato` no Full, se ela existe; senão, a
/// `main`.
pub fn janela_do_anuncio(full: bool, tomate_aberto: bool) -> &'static str {
    if full && tomate_aberto {
        TOMATO_LABEL
    } else {
        main_window::LABEL
    }
}

#[cfg(target_os = "linux")]
fn anunciar(app: &AppHandle, rotulo: String, text: String) {
    use gtk::glib::prelude::ObjectExt;
    use gtk::prelude::WidgetExt;

    let texto = text.trim().to_owned();
    if texto.is_empty() {
        return;
    }
    let alca = app.clone();
    let r = app.run_on_main_thread(move || {
        let Some(janela) = alca.get_webview_window(&rotulo) else {
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
fn anunciar(_app: &AppHandle, _rotulo: String, _text: String) {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn anuncio_pela_janela_da_frente() {
        assert_eq!(janela_do_anuncio(true, true), TOMATO_LABEL);
        // O tomate fechado pelo compositor: a `main`, se existir.
        assert_eq!(janela_do_anuncio(true, false), main_window::LABEL);
        assert_eq!(janela_do_anuncio(false, true), main_window::LABEL);
        assert_eq!(janela_do_anuncio(false, false), main_window::LABEL);
    }

    #[test]
    fn so_o_anuncio_das_fases_e_filtrado() {
        let main = main_window::LABEL;
        // Full com o tomate aberto: a fase só pelo tomate...
        assert!(vale(true, TOMATO_LABEL, true, true));
        assert!(!vale(true, main, true, true));
        // ...mas "Voltas copiadas" da `main` (na tela pelas Configurações
        // do tomate) vale.
        assert!(vale(false, main, true, true));
        assert!(vale(false, TOMATO_LABEL, true, true));
        // Fora do Full, a fase pela `main`.
        assert!(vale(true, main, false, false));
        assert!(!vale(true, TOMATO_LABEL, false, true));
    }
}
