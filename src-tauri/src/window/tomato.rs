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
//! M52: o modo da janela ([`full_mode`]: transparente ou opaca, o plano B3
//! da 5.9) e, na primeira entrada em cada combinação de navegador e placa de
//! vídeo, a validação com reversão (`validacao.rs`): a `main` fica na tela
//! com a pergunta, em vez de se esconder.
//!
//! Ficam para depois: a região (M53 a M55) e o menu nativo e os atalhos
//! (M56).

use std::ffi::OsStr;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde::Deserialize;
use serde_json::json;
use tauri::window::Color;
use tauri::{AppHandle, Listener, Manager, Theme, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tokio::sync::mpsc;

use super::{main_window, validacao};
use crate::settings::{self, Settings, SettingsStore, ThemePref};

/// Rótulo da janela; as permissões dela estão em `capabilities/tomato.json`.
pub use super::TOMATO_LABEL as LABEL;

/// O modo da janela `tomato` (5.3 e 5.6): transparente, com a forma do
/// tomate, ou opaca e quadrada (o plano B3 da 5.9). Não confundir com o
/// `fullMode` das configurações (`settings::FullMode`, `auto` ou `opaque`),
/// que é uma das entradas do [`full_mode`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FullMode {
    Transparent,
    Opaque,
}

/// A variável que desliga o renderizador DMA-BUF do WebKitGTK (3.8 e 5.6).
pub const VARIAVEL_DMABUF: &str = "WEBKIT_DISABLE_DMABUF_RENDERER";

/// O fundo da `tomato` opaca, antes da primeira pintura: o `--tt-tomato-10`
/// (4.1, 4.2 e 5.3). Um teste confere contra o `tokens.css`.
pub const FUNDO_OPACO: Color = Color(0x21, 0x02, 0x01, 0xFF);

/// O modo da `tomato` (5.6), que decide só o modo: o Full continua ativo.
/// Opaco com `fullMode = opaque` ou, no Linux, com a
/// `WEBKIT_DISABLE_DMABUF_RENDERER` do ambiente definida e diferente de
/// `"0"`: sem o DMA-BUF, a janela transparente pode não pintar (WebKit bug
/// 324543). A variável é do usuário (pode ser o contorno dele para o Error
/// 71): o app só a lê, nunca a define nem a apaga.
pub fn full_mode(s: &Settings) -> FullMode {
    full_mode_com(s, std::env::var_os(VARIAVEL_DMABUF).as_deref())
}

/// O [`full_mode`] com o valor da variável dado (os testes não mexem no
/// ambiente do processo). Um valor que não é UTF-8 conta como diferente de
/// `"0"`, como no `getenv` do WebKitGTK.
pub fn full_mode_com(s: &Settings, dmabuf: Option<&OsStr>) -> FullMode {
    let dmabuf_off = cfg!(target_os = "linux") && dmabuf.is_some_and(|v| v.to_str() != Some("0"));
    if dmabuf_off || s.full_mode == settings::FullMode::Opaque {
        FullMode::Opaque
    } else {
        FullMode::Transparent
    }
}

/// Script de inicialização da `tomato` (5.3 e 4.7): só as globais que o
/// script de boot do `tomato.html` lê. A página do tomate é sempre `full`
/// (4.6), seja qual for o tema salvo; no B3, o `__TT_FULL_MODE__ = "opaque"`
/// vira o `data-full-mode="opaque"` do `<html>` (M52).
pub fn init_script(modo: FullMode) -> String {
    let json = |valor: &str| serde_json::Value::from(valor).to_string();
    let opaco = match modo {
        FullMode::Opaque => format!("window.__TT_FULL_MODE__={};", json("opaque")),
        FullMode::Transparent => String::new(),
    };
    format!(
        "window.__TT_PREF__={};window.__TT_PLATFORM__={};{opaco}",
        json("full"),
        json(std::env::consts::OS),
    )
}

/// Constrói a `tomato` escondida (5.3), no modo dado por [`full_mode`]. Quem
/// chama faz o `show()`, depois do `tt://tomato-ready` (M51) e, no Linux,
/// depois da região (M54).
///
/// Nasce com `visible(false)`: com `visible(true)` no builder, o tao mapeia a
/// janela ainda decorada no Wayland, e ela às vezes sai com 332 × 369 e para
/// de desenhar (docs/decisoes.md, M04, achado 1).
///
/// No B3 (M52), a janela é opaca e quadrada, com o fundo `--tt-tomato-10` e
/// o tomate desenhado dentro, e sem o `no_redirection_bitmap` no Windows, que
/// só serve à transparência (docs/decisoes.md, M52).
pub fn build_tomato(app: &AppHandle, s: &Settings, modo: FullMode) -> tauri::Result<WebviewWindow> {
    let opaca = modo == FullMode::Opaque;
    let size = f64::from(s.tomato_size);
    let fundo = if opaca {
        FUNDO_OPACO
    } else {
        Color(0, 0, 0, 0)
    };
    let builder = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("tomato.html".into()))
        .title("Tomatito")
        .inner_size(size, size)
        .decorations(false)
        .transparent(!opaca)
        // `shadow(true)` desenha borda de 1 px e cantos no Windows 11.
        .shadow(false)
        // Sem a borda de 5 px de redimensionar e sem o TAURI_DRAG_RESIZE_WINDOW.
        .resizable(false)
        .maximizable(false)
        // Sem efeito no Wayland (3.8); no Windows, "Sempre na frente" (M56).
        .always_on_top(s.tomato_on_top)
        .theme(Some(Theme::Dark))
        .background_color(fundo)
        .visible(false)
        .initialization_script(init_script(modo));
    // Teste A/B contra o blur-behind no Windows (M55).
    #[cfg(windows)]
    let builder = builder.no_redirection_bitmap(!opaca);
    let w = builder.build()?;
    // No Linux, o tao grava o `color-scheme` do portal no `GtkSettings` do
    // processo a cada janela nova (tao 0.37.1, `window.rs`, "Set initial
    // `preferred_theme`"), o que troca o tema nativo da `main` (M24) quando
    // o do sistema é outro: o Lite num sistema claro, o Suave num escuro.
    // Com a `main` na tela (a pergunta da validação, M52), duas entradas em
    // menos de 2 s faziam a guarda (b) da 4.6 desistir. Aqui o tema nativo da
    // `main` volta na hora; no modo Sistema, o do portal já é o certo.
    #[cfg(target_os = "linux")]
    if let (Some(m), Some(t)) = (
        app.get_webview_window(main_window::LABEL),
        main_window::native_theme(s),
    ) && let Err(e) = m.set_theme(Some(t))
    {
        eprintln!("[tomatito] tema nativo da main não reaplicado: {e}");
    }
    Ok(w)
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

/// Quanto a saída espera a `main` recriada aparecer antes de fechar o tomate
/// (e a validação, antes de perguntar; M52). A `main` se mostra sozinha
/// (main.js), com o próprio limite de 2 s.
pub(super) const ESPERA_DA_MAIN: Duration = Duration::from_secs(3);

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

/// No `setup`, antes de qualquer janela: guarda o estado da troca e o da
/// validação (M52) e ouve o `tt://tomato-ready`. O ouvinte é um só e vale
/// para todas as `tomato`.
pub fn ligar(app: &AppHandle) {
    app.manage(Troca::default());
    app.manage(validacao::Validacao::default());
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

/// Uma entrada no Full depois do `build()` (5.7, passos 3 a 5): os avisos da
/// página, o que eles trouxeram e os tempos para o registro do build de debug.
struct Entrada {
    rx: mpsc::UnboundedReceiver<Pronto>,
    /// O primeiro aviso da página, com o userAgent e o renderizador (a chave
    /// da validação, M52). Pelo limite de 2 s, pode ser já o de pintado.
    pronto: Option<Pronto>,
    a_tempo: bool,
    pintado: bool,
    t0: Instant,
    criada: Duration,
    mostrada: Duration,
    /// Até quando a `main` espera o aviso de pintado ([`ESPERA_DA_PINTURA`],
    /// contado do `show()`).
    fim_da_pintura: tokio::time::Instant,
}

impl Entrada {
    /// Espera o `tt://tomato-ready` por até [`ESPERA_DO_PRONTO`] e mostra a
    /// janela, com o foco do teclado (Esc sai do Full; o GNOME pode só avisar
    /// "Tomatito está pronto", pela prevenção de roubo de foco; 3.4).
    async fn mostrar(
        janela: WebviewWindow,
        mut rx: mpsc::UnboundedReceiver<Pronto>,
        t0: Instant,
    ) -> tauri::Result<Self> {
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
        janela.show()?;
        let _ = janela.set_focus();
        Ok(Self {
            rx,
            a_tempo: pronto.is_some(),
            pintado: pronto.as_ref().is_some_and(|p| p.pintado),
            pronto,
            t0,
            criada,
            mostrada,
            fim_da_pintura: tokio::time::Instant::now() + ESPERA_DA_PINTURA,
        })
    }

    /// Espera a página, já na tela, avisar que pintou (M51, item 13): só
    /// então a `main` pode sumir. Pelo limite, a página ainda carrega, e o
    /// primeiro aviso dela pode ser o de pintado. Devolve se pintou.
    async fn esperar_pintura(&mut self) -> bool {
        while !self.pintado {
            match tokio::time::timeout_at(self.fim_da_pintura, self.rx.recv()).await {
                Ok(Some(p)) => {
                    self.pintado = p.pintado;
                    self.pronto.get_or_insert(p);
                }
                _ => break,
            }
        }
        self.pintado
    }

    /// M52 (5.7, passo 5): a chave desta combinação, se ela ainda precisa da
    /// validação com o seu olho. Só a janela transparente é validada: a
    /// opaca (B3) é o próprio plano de reserva. Sem o primeiro aviso (a
    /// página passou do limite), espera o de pintado, que traz os mesmos
    /// dados; se nem ele vier, a chave sai sem o userAgent e o renderizador,
    /// e não bate com nenhuma validada: uma página que não carrega é
    /// justamente o que a pergunta cobre.
    async fn chave_a_validar(&mut self, s: &Settings, modo: FullMode) -> Option<String> {
        if modo == FullMode::Opaque {
            return None;
        }
        if self.pronto.is_none() {
            self.esperar_pintura().await;
        }
        let chave =
            chave_de_validacao(&self.pronto.clone().unwrap_or_default(), &Ambiente::atual());
        (chave != s.full_validated).then_some(chave)
    }

    /// A linha do build de debug que os roteiros aninhados leem (M51, item 13).
    fn registrar(&self, fim: &str, modo: FullMode) {
        if !self.pintado && fim != "validação pedida" {
            eprintln!(
                "[tomatito] o tomate não avisou que pintou em {} s; escondendo a main assim mesmo",
                ESPERA_DA_PINTURA.as_secs()
            );
        }
        if cfg!(debug_assertions) {
            eprintln!(
                "[tomatito] entrada no Full: janela criada em {} ms, mostrada {} em {} ms, {fim} em {} ms, {}",
                self.criada.as_millis(),
                if self.a_tempo {
                    "a tempo"
                } else {
                    "pelo limite"
                },
                self.mostrada.as_millis(),
                self.t0.elapsed().as_millis(),
                match modo {
                    FullMode::Transparent => "transparente",
                    FullMode::Opaque => "opaca",
                }
            );
        }
    }
}

/// Cria a `tomato` escondida, no modo dado, e a mostra quando a página avisar
/// que está pronta (ou depois de [`ESPERA_DO_PRONTO`]).
async fn criar_e_mostrar(app: &AppHandle, s: &Settings, modo: FullMode) -> tauri::Result<Entrada> {
    let t0 = Instant::now();
    // O ouvinte antes da janela: a página pode ficar pronta antes do `await`.
    let rx = app.state::<Troca>().esperar_pronto();
    let w = build_tomato(app, s, modo)?;
    Entrada::mostrar(w, rx, t0).await
}

/// Entrar no Full (5.7, "Entrar"): grava `theme = full` (o `lastNormalTheme`
/// fica como estava), cria a `tomato` escondida no modo do [`full_mode`],
/// espera o `tt://tomato-ready` por até 2 s, mostra o tomate e, com ele
/// pintado, esconde a `main`. Na primeira entrada em cada combinação (M52), a
/// `main` fica (ou é criada) com a pergunta da validação, e só se esconde no
/// "Manter". Com o tomate já aberto, só o traz para a frente (`unminimize` e
/// `set_focus`, sem `hide` nem `show`: no Linux, a `tomato` nunca pode ser
/// escondida; 5.3) e deixa a `main` como está: é o "Mostrar Tomatito" da
/// 3.4, e a `main` pode estar aberta nas Configurações.
pub async fn entrar(app: &AppHandle) -> Result<(), String> {
    let troca = app.state::<Troca>();
    let _vez = troca.trava.lock().await;
    let s = gravar_tema(app, ThemePref::Full.as_str())?;
    if let Some(t) = app.get_webview_window(LABEL) {
        let _ = t.unminimize();
        let _ = t.set_focus();
        return Ok(());
    }
    let modo = full_mode(&s);
    let mut e = criar_e_mostrar(app, &s, modo)
        .await
        .map_err(|e| e.to_string())?;
    if let Some(chave) = e.chave_a_validar(&s, modo).await {
        e.registrar("validação pedida", modo);
        validacao::perguntar(app, chave).await;
        return Ok(());
    }
    let pintado = e.esperar_pintura().await;
    e.registrar(
        if pintado {
            "pintada"
        } else {
            "sem aviso de pintura"
        },
        modo,
    );
    if let Some(m) = app.get_webview_window(main_window::LABEL) {
        m.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// "Manter" na validação (M52): termina a entrada que a pergunta segurou.
/// Com o Full ainda ativo e o tomate aberto, a `main` se esconde e o tomate
/// fica com o foco; senão (o tomate fechado pelo compositor ou uma saída no
/// meio), nada muda. Na vez das trocas.
pub async fn concluir_entrada(app: &AppHandle) {
    let troca = app.state::<Troca>();
    let _vez = troca.trava.lock().await;
    let full = app.state::<SettingsStore>().get().theme == ThemePref::Full;
    let Some(t) = app.get_webview_window(LABEL).filter(|_| full) else {
        return;
    };
    if let Some(m) = app.get_webview_window(main_window::LABEL)
        && let Err(e) = m.hide()
    {
        eprintln!("[tomatito] main não escondida: {e}");
    }
    let _ = t.set_focus();
}

/// Sair do Full (5.7, "Sair"): grava `theme = lastNormalTheme`, mostra a
/// `main` (recriada, se não existir, e então espera ela aparecer) e fecha a
/// `tomato`. O `destroy()` não passa pelo `CloseRequested`: um fechar do
/// usuário que o M56 trate de outro jeito não segura a saída. Uma validação
/// em curso (M52) é cancelada, sem gravar nada: a próxima entrada pergunta
/// de novo.
pub async fn sair(app: &AppHandle) -> Result<(), String> {
    let troca = app.state::<Troca>();
    let _vez = troca.trava.lock().await;
    validacao::cancelar(app);
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
pub(super) async fn esperar_visivel(w: &WebviewWindow, limite: Duration) {
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
/// síncrona; 5.3) e aparece quando a página avisar, como na troca. Na
/// primeira vez em cada combinação (M52), a `main` nasce com a pergunta da
/// validação, como pede o passo 5 da 5.7.
pub fn abrir_no_inicio(app: &AppHandle, s: &Settings) -> tauri::Result<()> {
    let t0 = Instant::now();
    let troca = app.state::<Troca>();
    // A vez fica com a abertura até o `show()`: um "Mostrar Tomatito" nesse
    // meio-tempo (que passa pelo `entrar`) espera, e não mostra a janela antes
    // da página. No `setup` ninguém mais tem a trava.
    let vez = troca.trava.clone().try_lock_owned().ok();
    let rx = troca.esperar_pronto();
    let modo = full_mode(s);
    let w = build_tomato(app, s, modo)?;
    let app = app.clone();
    let s = s.clone();
    tauri::async_runtime::spawn(async move {
        let mut e = match Entrada::mostrar(w, rx, t0).await {
            Ok(e) => e,
            Err(erro) => {
                eprintln!("[tomatito] tomate não mostrado: {erro}");
                return;
            }
        };
        drop(vez);
        if let Some(chave) = e.chave_a_validar(&s, modo).await {
            e.registrar("validação pedida", modo);
            validacao::perguntar(&app, chave).await;
        }
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn script_de_inicializacao_do_tomate_e_sempre_full() {
        assert_eq!(
            init_script(FullMode::Transparent),
            format!(
                "window.__TT_PREF__=\"full\";window.__TT_PLATFORM__=\"{}\";",
                std::env::consts::OS
            )
        );
        // B3 (M52): o boot do tomato.html põe o data-full-mode="opaque".
        assert_eq!(
            init_script(FullMode::Opaque),
            format!(
                "window.__TT_PREF__=\"full\";window.__TT_PLATFORM__=\"{}\";window.__TT_FULL_MODE__=\"opaque\";",
                std::env::consts::OS
            )
        );
    }

    #[test]
    fn full_mode_pelas_configuracoes_e_pela_variavel_do_dmabuf() {
        let auto = Settings::default();
        let opaco = Settings {
            full_mode: settings::FullMode::Opaque,
            ..Settings::default()
        };
        fn var(v: &str) -> Option<&OsStr> {
            Some(OsStr::new(v))
        }
        assert_eq!(full_mode_com(&auto, None), FullMode::Transparent);
        assert_eq!(full_mode_com(&opaco, None), FullMode::Opaque);
        assert_eq!(full_mode_com(&opaco, var("0")), FullMode::Opaque);
        assert_eq!(full_mode_com(&auto, var("0")), FullMode::Transparent);
        // Definida e diferente de "0", como no WebKitGTK (5.6): "1", "true" e
        // até vazia. Só no Linux: no Windows, a variável não existe para o
        // WebView2.
        for v in ["1", "true", "", "00"] {
            let esperado = if cfg!(target_os = "linux") {
                FullMode::Opaque
            } else {
                FullMode::Transparent
            };
            assert_eq!(full_mode_com(&auto, var(v)), esperado, "{v:?}");
        }
        #[cfg(unix)]
        {
            use std::os::unix::ffi::OsStrExt;
            assert_eq!(
                full_mode_com(&auto, Some(OsStr::from_bytes(b"\xff"))),
                FullMode::Opaque,
                "um valor que não é UTF-8 também desliga"
            );
        }
        assert_eq!(VARIAVEL_DMABUF, "WEBKIT_DISABLE_DMABUF_RENDERER");
    }

    #[test]
    fn fundo_opaco_e_o_tomato_10() {
        // O --tt-tomato-10 do tokens.css (o teste do repo confere o texto).
        assert_eq!(FUNDO_OPACO, Color(0x21, 0x02, 0x01, 0xFF));
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
