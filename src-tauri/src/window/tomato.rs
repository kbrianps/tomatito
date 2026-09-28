//! Janela `tomato` do Tomatito Full (PLANO.md, 5.3, 5.7 e 5.10): o tomate
//! transparente, de 240, 280 ou 320 px, com a página `tomato.html`.
//!
//! M50: a janela é a da 5.3 (sem moldura, transparente, sem sombra, sem
//! redimensionar, tema nativo escuro), com o tamanho do `tomatoSize` e o
//! "sempre na frente" do `tomatoOnTop`.
//!
//! M51: a troca normal ↔ Full (5.7). [`entrar`] grava `theme = full`, cria a
//! `tomato` escondida e só a mostra quando a página avisa `tt://tomato-ready`
//! (ou depois de 2 s), e só esconde a `main` quando a página, já na tela,
//! avisa de novo que pintou (docs/decisoes.md, M51, item 13). [`sair`] grava o
//! `lastNormalTheme`, mostra a `main` (recriada se não existir) e fecha a
//! `tomato`. As duas passam pela mesma trava, então duas trocas nunca se
//! cruzam. Com `theme = full`, o `setup` cria só a `tomato` ([`abrir_no_inicio`]).
//!
//! Ficam para depois: o modo opaco, o `full_mode()` e a validação com
//! reversão (B3, M52), a região (M53 a M55) e o menu nativo e os atalhos
//! (M56).

use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde::Deserialize;
use serde_json::json;
use tauri::window::Color;
use tauri::{AppHandle, Listener, Manager, Theme, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tokio::sync::mpsc;

use super::main_window;
use crate::settings::{Settings, SettingsStore, ThemePref};

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

/// Constrói a `tomato` escondida (5.3). Quem chama faz o `show()`, depois do
/// `tt://tomato-ready` (M51) e, no Linux, depois da região (M54).
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

/// Evento da página do tomate para o Rust (3.5): a página está pronta (o
/// retrato do motor escrito e as fontes carregadas), com o userAgent e o
/// renderizador WebGL. Libera o `show()` e alimenta a validação (5.7, M52).
pub const EVENTO_PRONTO: &str = "tt://tomato-ready";

/// Quanto o `show()` espera pelo `tt://tomato-ready` (5.7, passo 4).
pub const ESPERA_DO_PRONTO: Duration = Duration::from_secs(2);

/// Quanto a `main` espera, depois do `show()` do tomate, o aviso de que ele
/// pintou (docs/decisoes.md, M51, item 13). A página, já na tela, avisa de
/// novo (`pintado: true`) depois de dois quadros; só então a `main` se
/// esconde, e assim nunca fica um instante sem nenhuma das duas, nem quando o
/// tomate aparece pelo limite de 2 s, ainda vazio. Passado este prazo, a
/// `main` se esconde assim mesmo.
pub const ESPERA_DA_PINTURA: Duration = Duration::from_secs(8);

/// Quanto a saída espera a `main` recriada aparecer antes de fechar o tomate.
/// A `main` se mostra sozinha (main.js), com o próprio limite de 2 s.
const ESPERA_DA_MAIN: Duration = Duration::from_secs(3);

/// O conteúdo do `tt://tomato-ready`. A página avisa uma vez escondida
/// (`pintado: false`, libera o `show()`) e outra já na tela, depois de dois
/// quadros (`pintado: true`, libera o `hide()` da `main`); se já nasce na
/// tela (o `show()` pelo limite), só a segunda.
#[derive(Debug, Clone, Default, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Pronto {
    pub user_agent: String,
    pub renderer: String,
    pub pintado: bool,
}

/// Estado da troca (no `app.manage`): a trava que põe as trocas em fila e
/// quem espera os próximos `tt://tomato-ready` (os dois avisos de uma página).
#[derive(Default)]
pub struct Troca {
    trava: Arc<tokio::sync::Mutex<()>>,
    esperando: Mutex<Option<mpsc::UnboundedSender<Pronto>>>,
}

impl Troca {
    /// Os avisos daqui em diante vão para o receptor devolvido; o anterior
    /// fica sem nenhum.
    fn esperar_pronto(&self) -> mpsc::UnboundedReceiver<Pronto> {
        let (tx, rx) = mpsc::unbounded_channel();
        *self.esperando.lock().unwrap_or_else(|e| e.into_inner()) = Some(tx);
        rx
    }

    fn pronto(&self, p: Pronto) {
        let esperando = self.esperando.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(tx) = esperando.as_ref() {
            let _ = tx.send(p);
        }
    }
}

/// No `setup`, antes de qualquer janela: guarda o estado da troca e ouve o
/// `tt://tomato-ready`. O ouvinte é um só e vale para todas as `tomato`.
pub fn ligar(app: &AppHandle) {
    app.manage(Troca::default());
    let h = app.clone();
    app.listen_any(EVENTO_PRONTO, move |ev| {
        let p: Pronto = serde_json::from_str(ev.payload()).unwrap_or_default();
        if cfg!(debug_assertions) {
            eprintln!(
                "[tomatito] tomate pronto{}: {}",
                if p.pintado { " e pintado" } else { "" },
                chave_de_validacao(&p, &Ambiente::atual())
            );
        }
        if let Some(t) = h.try_state::<Troca>() {
            t.pronto(p);
        }
    });
}

/// O que, além do `tt://tomato-ready`, entra na chave do `fullValidated`
/// (5.9; docs/decisoes.md, M51): a versão do WebView e, no Linux, os drivers
/// de vídeo e o backend do GDK. O WebKitGTK mascara o renderizador WebGL
/// ("Apple GPU", M04, achado 3), então só o userAgent e o renderizador não
/// distinguem a Intel da NVIDIA nem uma troca de driver.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Ambiente {
    pub webview: String,
    pub video: Vec<String>,
}

impl Ambiente {
    pub fn atual() -> Self {
        Self {
            webview: tauri::webview_version().unwrap_or_default(),
            video: video(),
        }
    }
}

/// Os drivers das placas de vídeo (`/sys/class/drm/cardN/device/driver`), a
/// versão do módulo da NVIDIA e as variáveis que mudam a GPU ou o backend
/// (PRIME, o fornecedor do EGL, o `GDK_BACKEND` e o `WEBKIT_DISABLE_*`).
#[cfg(target_os = "linux")]
fn video() -> Vec<String> {
    let mut v: Vec<String> = std::fs::read_dir("/sys/class/drm")
        .into_iter()
        .flatten()
        .flatten()
        .filter(|e| {
            let n = e.file_name();
            let n = n.to_string_lossy();
            n.starts_with("card") && !n.contains('-')
        })
        .filter_map(|e| std::fs::read_link(e.path().join("device/driver")).ok())
        .filter_map(|p| p.file_name().map(|n| n.to_string_lossy().into_owned()))
        .collect();
    v.sort();
    v.dedup();
    if let Ok(nv) = std::fs::read_to_string("/sys/module/nvidia/version") {
        v.push(format!("nvidia {}", nv.trim()));
    }
    for var in [
        "GDK_BACKEND",
        "__NV_PRIME_RENDER_OFFLOAD",
        "DRI_PRIME",
        "__EGL_VENDOR_LIBRARY_FILENAMES",
        "WEBKIT_DISABLE_DMABUF_RENDERER",
        "WEBKIT_DISABLE_COMPOSITING_MODE",
    ] {
        if let Ok(val) = std::env::var(var) {
            v.push(format!("{var}={val}"));
        }
    }
    v
}

/// No Windows, o renderizador WebGL do WebView2 já traz a placa e o driver
/// ("ANGLE (Intel, …)"); nada a mais.
#[cfg(not(target_os = "linux"))]
fn video() -> Vec<String> {
    Vec::new()
}

/// A combinação que o `fullValidated` guarda (5.9): o que a página informou
/// mais o ambiente lido no Rust. Uma linha, com as partes em ordem fixa.
pub fn chave_de_validacao(p: &Pronto, a: &Ambiente) -> String {
    let mut partes = vec![
        p.user_agent.trim().to_owned(),
        p.renderer.trim().to_owned(),
        format!("webview {}", a.webview.trim()),
    ];
    partes.extend(a.video.iter().cloned());
    partes.join(" | ")
}

/// Grava o tema pelo caminho do `settings_set` (3.3 e 5.7): emite
/// `tt://settings` para as duas janelas. Não grava nada se já for o mesmo.
fn gravar_tema(app: &AppHandle, tema: &str) -> Result<Settings, String> {
    let store = app.state::<SettingsStore>();
    let s = store.get();
    if s.theme.as_str() == tema {
        return Ok(s);
    }
    crate::commands::gravar_configuracoes(app, &store, &json!({ "theme": tema }))
        .map_err(|e| format!("{:?}: {}", e.code, e.message))
}

/// Cria a `tomato` escondida e a mostra quando a página avisar que está pronta
/// (ou depois de [`ESPERA_DO_PRONTO`]), e então espera o aviso de que ela
/// pintou, já na tela (até [`ESPERA_DA_PINTURA`]): quem chama esconde a
/// `main` em seguida. Devolve o primeiro aviso da página.
async fn criar_e_mostrar(
    app: &AppHandle,
    s: &Settings,
) -> tauri::Result<(WebviewWindow, Option<Pronto>)> {
    let t0 = Instant::now();
    // O ouvinte antes da janela: a página pode ficar pronta antes do `await`.
    let mut rx = app.state::<Troca>().esperar_pronto();
    let w = build_tomato(app, s)?;
    let criada = t0.elapsed();
    let pronto = tokio::time::timeout(ESPERA_DO_PRONTO, rx.recv())
        .await
        .ok()
        .flatten();
    if pronto.is_none() {
        eprintln!(
            "[tomatito] o tomate não avisou {EVENTO_PRONTO} em {} s; mostrando assim mesmo, com a main na tela até ele pintar",
            ESPERA_DO_PRONTO.as_secs()
        );
    }
    let mostrada = t0.elapsed();
    w.show()?;
    // O foco do teclado vai para o tomate (Esc sai do Full). O GNOME pode só
    // avisar "Tomatito está pronto" (prevenção de roubo de foco; 3.4).
    let _ = w.set_focus();
    // A main só some com o tomate pintado: a página, já na tela, avisa de novo
    // depois de dois quadros. Pelo limite, a página ainda carrega, e o
    // primeiro aviso dela pode ser o de pintado.
    let mut pintado = pronto.as_ref().is_some_and(|p| p.pintado);
    let fim = tokio::time::Instant::now() + ESPERA_DA_PINTURA;
    while !pintado {
        match tokio::time::timeout_at(fim, rx.recv()).await {
            Ok(Some(p)) => pintado = p.pintado,
            _ => break,
        }
    }
    if !pintado {
        eprintln!(
            "[tomatito] o tomate não avisou que pintou em {} s; escondendo a main assim mesmo",
            ESPERA_DA_PINTURA.as_secs()
        );
    }
    if cfg!(debug_assertions) {
        eprintln!(
            "[tomatito] entrada no Full: janela criada em {} ms, mostrada {} em {} ms, {} em {} ms",
            criada.as_millis(),
            if pronto.is_some() {
                "a tempo"
            } else {
                "pelo limite"
            },
            mostrada.as_millis(),
            if pintado {
                "pintada"
            } else {
                "sem aviso de pintura"
            },
            t0.elapsed().as_millis()
        );
    }
    Ok((w, pronto))
}

/// Entrar no Full (5.7, "Entrar"): grava `theme = full` (o `lastNormalTheme`
/// fica como estava), cria a `tomato` escondida, espera o `tt://tomato-ready`
/// por até 2 s, mostra o tomate e esconde a `main`. Com o tomate já aberto,
/// só o traz para a frente (`unminimize` e `set_focus`, sem `hide` nem
/// `show`: no Linux, a `tomato` nunca pode ser escondida; 5.3) e deixa a
/// `main` como está: é o "Mostrar Tomatito" da 3.4, e a `main` pode estar
/// aberta nas Configurações.
pub async fn entrar(app: &AppHandle) -> Result<(), String> {
    let troca = app.state::<Troca>();
    let _vez = troca.trava.lock().await;
    let s = gravar_tema(app, ThemePref::Full.as_str())?;
    if let Some(t) = app.get_webview_window(LABEL) {
        let _ = t.unminimize();
        let _ = t.set_focus();
        return Ok(());
    }
    criar_e_mostrar(app, &s).await.map_err(|e| e.to_string())?;
    if let Some(m) = app.get_webview_window(main_window::LABEL) {
        m.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Sair do Full (5.7, "Sair"): grava `theme = lastNormalTheme`, mostra a
/// `main` (recriada, se não existir, e então espera ela aparecer) e fecha a
/// `tomato`. O `destroy()` não passa pelo `CloseRequested`: um fechar do
/// usuário que o M56 trate de outro jeito não segura a saída.
pub async fn sair(app: &AppHandle) -> Result<(), String> {
    let troca = app.state::<Troca>();
    let _vez = troca.trava.lock().await;
    let atual = app.state::<SettingsStore>().get();
    let s = gravar_tema(app, atual.last_normal_theme.as_str())?;
    match app.get_webview_window(main_window::LABEL) {
        Some(m) => {
            m.show().map_err(|e| e.to_string())?;
            let _ = m.unminimize();
            let _ = m.set_focus();
        }
        None => {
            let m = main_window::build_main(app, &s).map_err(|e| e.to_string())?;
            esperar_visivel(&m, ESPERA_DA_MAIN).await;
        }
    }
    if let Some(t) = app.get_webview_window(LABEL) {
        t.destroy().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Espera a janela aparecer (o main.js chama `show()` quando a página está
/// pronta), olhando a cada 20 ms, até `limite`.
async fn esperar_visivel(w: &WebviewWindow, limite: Duration) {
    let t0 = std::time::Instant::now();
    while t0.elapsed() < limite {
        if w.is_visible().unwrap_or(true) {
            return;
        }
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
}

/// Início com `theme = full` (4.7 e 5.7): o `setup` cria só a `tomato`, e a
/// `main` nasce sob demanda. A janela é criada aqui (no `setup`, pode ser
/// síncrona; 5.3) e aparece quando a página avisar, como na troca.
pub fn abrir_no_inicio(app: &AppHandle, s: &Settings) -> tauri::Result<()> {
    let troca = app.state::<Troca>();
    // A vez fica com a abertura até o `show()`: um "Mostrar Tomatito" nesse
    // meio-tempo (que passa pelo `entrar`) espera, e não mostra a janela antes
    // da página. No `setup` ninguém mais tem a trava.
    let vez = troca.trava.clone().try_lock_owned().ok();
    let mut rx = troca.esperar_pronto();
    let w = build_tomato(app, s)?;
    tauri::async_runtime::spawn(async move {
        let _vez = vez;
        if tokio::time::timeout(ESPERA_DO_PRONTO, rx.recv())
            .await
            .is_err()
        {
            eprintln!(
                "[tomatito] o tomate não avisou {EVENTO_PRONTO} em 2 s; mostrando assim mesmo"
            );
        }
        if let Err(e) = w.show() {
            eprintln!("[tomatito] tomate não mostrado: {e}");
        }
        let _ = w.set_focus();
    });
    Ok(())
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

    #[test]
    fn pronto_le_o_que_a_pagina_manda_e_tolera_o_que_falta() {
        let p: Pronto =
            serde_json::from_str(r#"{"userAgent":"Mozilla/5.0 X","renderer":"Apple GPU"}"#)
                .unwrap();
        assert_eq!(p.user_agent, "Mozilla/5.0 X");
        assert_eq!(p.renderer, "Apple GPU");
        assert!(!p.pintado);
        let pintado: Pronto = serde_json::from_str(r#"{"pintado":true}"#).unwrap();
        assert!(pintado.pintado);
        let vazio: Pronto = serde_json::from_str("{}").unwrap();
        assert_eq!(vazio, Pronto::default());
        assert!(serde_json::from_str::<Pronto>("null").is_err());
    }

    #[test]
    fn chave_de_validacao_junta_a_pagina_e_o_ambiente_em_ordem_fixa() {
        let p = Pronto {
            user_agent: " Mozilla/5.0 X ".into(),
            renderer: "Apple GPU".into(),
            ..Pronto::default()
        };
        let intel = Ambiente {
            webview: "2.52.6".into(),
            video: vec!["i915".into()],
        };
        assert_eq!(
            chave_de_validacao(&p, &intel),
            "Mozilla/5.0 X | Apple GPU | webview 2.52.6 | i915"
        );
        // O mesmo userAgent e o mesmo renderizador mascarado, outra GPU ou
        // outro WebKitGTK: outra chave (M04, achado 3).
        let nvidia = Ambiente {
            video: vec!["i915".into(), "nvidia".into(), "nvidia 580.95".into()],
            ..intel.clone()
        };
        assert_ne!(
            chave_de_validacao(&p, &intel),
            chave_de_validacao(&p, &nvidia)
        );
        let outro_webkit = Ambiente {
            webview: "2.54.0".into(),
            ..intel.clone()
        };
        assert_ne!(
            chave_de_validacao(&p, &intel),
            chave_de_validacao(&p, &outro_webkit)
        );
    }

    #[test]
    fn so_um_espera_o_pronto_e_o_ultimo_pedido_vale() {
        let t = Troca::default();
        // Um aviso sem ninguém esperando (um F5 na página) não quebra nada.
        t.pronto(Pronto::default());
        let mut velho = t.esperar_pronto();
        let mut novo = t.esperar_pronto();
        t.pronto(Pronto {
            renderer: "r".into(),
            ..Pronto::default()
        });
        assert!(velho.try_recv().is_err());
        assert_eq!(novo.try_recv().unwrap().renderer, "r");
        // Os dois avisos da mesma página chegam ao mesmo receptor, em ordem.
        t.pronto(Pronto {
            pintado: true,
            ..Pronto::default()
        });
        assert!(novo.try_recv().unwrap().pintado);
        assert!(novo.try_recv().is_err());
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn video_no_linux_le_os_drivers_sem_falhar() {
        let v = video();
        assert!(v.iter().all(|x| !x.is_empty()));
    }
}
