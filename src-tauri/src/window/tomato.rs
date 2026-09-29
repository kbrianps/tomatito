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
//! M54: a região de entrada no Linux ([`definir_regiao`]). A página calcula
//! as faixas (5.4, `src/lib/regiao.js`) e as manda pelo `set_tomato_region`
//! antes do primeiro aviso, então a região chega ao widget antes do `show()`.
//! A cada troca de tamanho, o `WindowEvent::Resized` pede a região de novo
//! ([`redimensionada`], evento [`EVENTO_REGIAO`]).
//!
//! M55: a região no Windows, pelo mesmo comando e pelo mesmo evento
//! (`region_windows.rs`, `SetWindowRgn` em px físicos), a borda do DWM
//! desligada e o teste A/B do `no_redirection_bitmap`
//! ([`sem_redirecionamento`], pela variável [`VAR_AB_NRB`] no build de debug).
//!
//! Ficam para depois: o menu nativo, os atalhos e a escolha de P/M/G (M56;
//! até lá, [`trocar_tamanho`] só pelo comando de debug).

use std::ffi::OsStr;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde::Deserialize;
use serde_json::json;
use tauri::window::Color;
use tauri::{
    AppHandle, Emitter, Listener, Manager, PhysicalSize, Theme, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder,
};
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

/// Segundo script de inicialização da `tomato` (M54): o lado pedido, em px
/// lógicos. A página calcula a região com ele enquanto a janela está
/// escondida e o `innerWidth` ainda é 0; depois, vale o `innerWidth`.
pub fn init_lado(lado: u32) -> String {
    format!("window.__TT_TOMATO_SIZE__={lado};")
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
        .initialization_script(init_script(modo))
        // M54: o lado da janela, para a região antes do show (5.6). Escondida,
        // a página do WebKitGTK tem `innerWidth` 0 (docs/decisoes.md, M54).
        .initialization_script(init_lado(s.tomato_size));
    // Teste A/B contra o blur-behind no Windows (M55): ligado por padrão;
    // no build de debug, `TOMATITO_AB_NRB=0` desliga (o lado B).
    #[cfg(windows)]
    let builder = builder.no_redirection_bitmap(sem_redirecionamento(
        opaca,
        std::env::var_os(VAR_AB_NRB).as_deref(),
        cfg!(debug_assertions),
    ));
    let w = builder.build()?;
    // M55: sem a borda de 1 px e sem os cantos arredondados do DWM (5.5), com
    // a janela ainda escondida. Uma falha não impede o tomate.
    #[cfg(windows)]
    if let Err(e) = super::region_windows::sem_borda(&w) {
        eprintln!("[tomatito] borda do DWM não desligada: {e}");
    }
    // M54: o modo desta `tomato` (a região só vale na transparente) e nenhum
    // tamanho visto ainda.
    if let Some(t) = app.try_state::<Troca>() {
        t.nova_janela(modo);
    }
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

/// A variável do teste A/B do `no_redirection_bitmap` no Windows (M55; 5.3 e
/// seção 8). Só vale no build de debug (o `npm run dev:app`): `0` desliga o
/// `no_redirection_bitmap`, e qualquer outro valor (ou nenhum) o deixa ligado.
pub const VAR_AB_NRB: &str = "TOMATITO_AB_NRB";

/// Se a `tomato` nasce com o `no_redirection_bitmap` (Windows; M55). Na
/// transparente, sim (o lado A, o padrão), salvo com [`VAR_AB_NRB`] em `0`
/// num build de debug (o lado B do teste). Na opaca (B3), nunca: ele só
/// serve à transparência (docs/decisoes.md, M52).
#[cfg_attr(not(windows), allow(dead_code))]
pub fn sem_redirecionamento(opaca: bool, var: Option<&OsStr>, debug: bool) -> bool {
    let lado_b = debug && var == Some(OsStr::new("0"));
    !opaca && !lado_b
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
    /// M54: o modo da `tomato` aberta (a região só vale na transparente) e
    /// o último tamanho visto no `Resized` (o tao manda um a cada
    /// `configure`, com ou sem troca de tamanho).
    modo: Mutex<Option<FullMode>>,
    tamanho: Mutex<Option<PhysicalSize<u32>>>,
}

impl Troca {
    fn nova_janela(&self, modo: FullMode) {
        *self.modo.lock().unwrap_or_else(|e| e.into_inner()) = Some(modo);
        *self.tamanho.lock().unwrap_or_else(|e| e.into_inner()) = None;
    }

    fn modo(&self) -> Option<FullMode> {
        *self.modo.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// Guarda o tamanho e diz se ele mudou desde o último `Resized`. O
    /// primeiro de cada janela não conta: a página manda a região na partida.
    fn tamanho_mudou(&self, novo: PhysicalSize<u32>) -> bool {
        let mut t = self.tamanho.lock().unwrap_or_else(|e| e.into_inner());
        let mudou = t.is_some_and(|antes| antes != novo);
        *t = Some(novo);
        mudou
    }

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
                "[tomatito] tomate pronto{}: {}{}",
                if p.pintado { " e pintado" } else { "" },
                chave_de_validacao(&p, &Ambiente::atual()),
                lado_do_ab()
            );
        }
        if let Some(t) = h.try_state::<Troca>() {
            t.pronto(p);
        }
    });
}

/// No Windows, o lado do teste A/B no registro do build de debug (M55): o
/// roteiro da `docs/verificacao-manual.md` confere por ele qual lado rodou.
fn lado_do_ab() -> &'static str {
    if !cfg!(windows) {
        ""
    } else if sem_redirecionamento(false, std::env::var_os(VAR_AB_NRB).as_deref(), true) {
        " (A/B: com no_redirection_bitmap)"
    } else {
        " (A/B: sem no_redirection_bitmap)"
    }
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

/// Evento do Rust para a página do tomate (M54): o tamanho da janela mudou
/// (P/M/G ou, no Windows, o DPI), e a região precisa ir de novo (5.4). O
/// conteúdo é o tamanho novo, em px físicos. Fora da tabela da 3.5
/// (docs/decisoes.md, M54).
pub const EVENTO_REGIAO: &str = "tt://tomato-region";

/// O máximo de retângulos aceitos pelo `set_tomato_region`. A página manda
/// de 125 a 250 (docs/decisoes.md, M53, item 4); o limite só barra um pedido
/// absurdo.
pub const MAX_FAIXAS: usize = 1000;

/// O maior lado aceito, em px: o G (320) a 800% de escala, com folga.
pub const MAX_LADO: i32 = 4096;

/// Os tamanhos do tomate (5.3 e M56): P, M e G.
pub const TAMANHOS: [u32; 3] = [240, 280, 320];

/// O que o [`definir_regiao`] fez com as faixas.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Regiao {
    /// Entregues ao compositor (Linux) ou à janela (Windows, M55).
    #[cfg_attr(not(any(target_os = "linux", windows)), allow(dead_code))]
    Aplicada,
    /// Ignoradas: a `tomato` é opaca (B3; docs/decisoes.md, M52, item 8) ou
    /// a plataforma não tem região (nem Linux nem Windows).
    Ignorada,
}

impl Regiao {
    pub fn as_str(self) -> &'static str {
        match self {
            Regiao::Aplicada => "applied",
            Regiao::Ignorada => "ignored",
        }
    }
}

/// Faixas aceitáveis: ao menos uma, até [`MAX_FAIXAS`], cada uma com largura
/// e altura positivas e dentro de `0..=MAX_LADO`.
pub fn faixas_validas(strips: &[[i32; 4]]) -> Result<(), String> {
    if strips.is_empty() || strips.len() > MAX_FAIXAS {
        return Err(format!(
            "a região precisa ter de 1 a {MAX_FAIXAS} retângulos (veio com {})",
            strips.len()
        ));
    }
    let dentro =
        |a: i32, d: i32| a >= 0 && d > 0 && a.checked_add(d).is_some_and(|f| f <= MAX_LADO);
    match strips
        .iter()
        .find(|[x, y, w, h]| !(dentro(*x, *w) && dentro(*y, *h)))
    {
        Some(r) => Err(format!("retângulo fora da janela: {r:?}")),
        None => Ok(()),
    }
}

/// `set_tomato_region{strips}` (3.5, 5.4 e 5.6; M54): a região de entrada da
/// `tomato`, pedida pela própria página. Só a `tomato` pode pedir. No modo
/// opaco (B3), a janela é quadrada e fica sem região. No Linux, as faixas
/// vão para o widget (`region_linux.rs`) pela fila da thread principal, a
/// mesma do `show()`; no Windows, pelo `SetWindowRgn` (`region_windows.rs`,
/// M55), em px físicos.
pub fn definir_regiao(janela: &WebviewWindow, strips: Vec<[i32; 4]>) -> Result<Regiao, String> {
    if janela.label() != LABEL {
        return Err(format!("só a janela {LABEL} tem região"));
    }
    faixas_validas(&strips)?;
    let modo = janela.try_state::<Troca>().and_then(|t| t.modo());
    if modo == Some(FullMode::Opaque) {
        return Ok(Regiao::Ignorada);
    }
    if cfg!(debug_assertions) {
        // Os roteiros aninhados comparam com o que o GTK manda ao compositor.
        eprintln!(
            "[tomatito] região do tomate: {} retângulos: {}",
            strips.len(),
            serde_json::to_string(&strips).unwrap_or_default()
        );
    }
    aplicar(janela, strips)
}

#[cfg(target_os = "linux")]
fn aplicar(janela: &WebviewWindow, strips: Vec<[i32; 4]>) -> Result<Regiao, String> {
    super::region_linux::apply_region(janela, strips).map_err(|e| e.to_string())?;
    Ok(Regiao::Aplicada)
}

/// No Windows (5.5; M55): a região da janela inteira, pela thread principal.
#[cfg(windows)]
fn aplicar(janela: &WebviewWindow, strips: Vec<[i32; 4]>) -> Result<Regiao, String> {
    super::region_windows::apply_region(janela, strips).map_err(|e| e.to_string())?;
    Ok(Regiao::Aplicada)
}

/// Fora do Linux e do Windows, sem região.
#[cfg(not(any(target_os = "linux", windows)))]
fn aplicar(_janela: &WebviewWindow, _strips: Vec<[i32; 4]>) -> Result<Regiao, String> {
    Ok(Regiao::Ignorada)
}

/// `WindowEvent::Resized` da `tomato` (5.4; M54): com o tamanho mudado de
/// verdade, pede à página a região de novo ([`EVENTO_REGIAO`]). Cobre a troca
/// entre P, M e G e, no Windows, a de DPI (o `ScaleFactorChanged` é
/// redundante). Os `Resized` sem troca (um a cada `configure` no Linux: foco,
/// arraste) não pedem nada.
pub fn redimensionada(janela: &tauri::Window, tamanho: PhysicalSize<u32>) {
    if janela.label() != LABEL {
        return;
    }
    let Some(t) = janela.try_state::<Troca>() else {
        return;
    };
    if t.tamanho_mudou(tamanho)
        && let Err(e) = janela.emit_to(LABEL, EVENTO_REGIAO, [tamanho.width, tamanho.height])
    {
        eprintln!("[tomatito] {EVENTO_REGIAO} não saiu: {e}");
    }
}

/// Troca o lado da `tomato` para P, M ou G ([`TAMANHOS`]), em px lógicos. A
/// região vem depois, pelo `Resized` ([`redimensionada`]) e pelo `resize` da
/// página. No M54, só pelo comando de debug `tomato_debug_size`; a escolha
/// na interface, a gravação do `tomatoSize` e o menu são do M56.
pub fn trocar_tamanho(app: &AppHandle, lado: u32) -> Result<(), String> {
    if !TAMANHOS.contains(&lado) {
        return Err(format!("tamanho fora de {TAMANHOS:?}: {lado}"));
    }
    let t = app
        .get_webview_window(LABEL)
        .ok_or_else(|| format!("sem a janela {LABEL}"))?;
    redimensionar(&t, lado).map_err(|e| e.to_string())
}

/// No Linux, pelo GTK: o `set_size` do Tauri não encolhe uma janela que não é
/// redimensionável (`region_linux.rs`, `resize`).
#[cfg(target_os = "linux")]
fn redimensionar(t: &WebviewWindow, lado: u32) -> tauri::Result<()> {
    super::region_linux::resize(t, lado as i32)
}

/// No Windows, o `set_size` vale mesmo com `resizable(false)` (o tao só tira
/// a borda de arrastar; a conferir na ida ao Windows do M55). A região vem
/// depois, pelo `Resized`, como no Linux.
#[cfg(not(target_os = "linux"))]
fn redimensionar(t: &WebviewWindow, lado: u32) -> tauri::Result<()> {
    let lado = f64::from(lado);
    t.set_size(tauri::LogicalSize::new(lado, lado))
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
    fn ab_do_no_redirection_bitmap() {
        let zero = Some(OsStr::new("0"));
        // O lado A é o padrão, no debug e no release.
        assert!(sem_redirecionamento(false, None, true));
        assert!(sem_redirecionamento(false, None, false));
        // O lado B: só com "0" e só no build de debug.
        assert!(!sem_redirecionamento(false, zero, true));
        assert!(sem_redirecionamento(false, zero, false));
        for v in ["1", "", "00", "false"] {
            assert!(
                sem_redirecionamento(false, Some(OsStr::new(v)), true),
                "{v}"
            );
        }
        // Na opaca (B3), nunca.
        for (var, debug) in [(None, true), (None, false), (zero, true)] {
            assert!(!sem_redirecionamento(true, var, debug));
        }
    }

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

    #[test]
    fn faixas_da_regiao_validas_e_recusadas() {
        assert!(faixas_validas(&[[0, 0, 280, 1], [10, 1, 5, 3]]).is_ok());
        assert!(faixas_validas(&[[0, 0, MAX_LADO, MAX_LADO]]).is_ok());
        assert!(faixas_validas(&[]).is_err(), "vazia");
        assert!(faixas_validas(&vec![[0, 0, 1, 1]; MAX_FAIXAS]).is_ok());
        assert!(faixas_validas(&vec![[0, 0, 1, 1]; MAX_FAIXAS + 1]).is_err());
        for ruim in [
            [-1, 0, 5, 5],
            [0, -1, 5, 5],
            [0, 0, 0, 5],
            [0, 0, 5, 0],
            [0, 0, -5, 5],
            [MAX_LADO, 0, 1, 1],
            [0, 0, MAX_LADO + 1, 1],
            [i32::MAX, 0, i32::MAX, 1],
        ] {
            assert!(faixas_validas(&[[0, 0, 1, 1], ruim]).is_err(), "{ruim:?}");
        }
    }

    #[test]
    fn so_troca_de_tamanho_de_verdade_pede_a_regiao() {
        let t = Troca::default();
        t.nova_janela(FullMode::Transparent);
        assert_eq!(t.modo(), Some(FullMode::Transparent));
        let p = PhysicalSize::new(240, 240);
        let g = PhysicalSize::new(320, 320);
        // O primeiro `Resized` de cada janela não pede: a página já manda.
        assert!(!t.tamanho_mudou(p));
        // Os `configure` do foco e do arraste repetem o tamanho.
        assert!(!t.tamanho_mudou(p));
        assert!(t.tamanho_mudou(g));
        assert!(!t.tamanho_mudou(g));
        assert!(t.tamanho_mudou(p));
        // Uma janela nova (e opaca) começa do zero.
        t.nova_janela(FullMode::Opaque);
        assert_eq!(t.modo(), Some(FullMode::Opaque));
        assert!(!t.tamanho_mudou(g));
    }

    #[test]
    fn lado_para_a_regiao_antes_do_show() {
        assert_eq!(init_lado(280), "window.__TT_TOMATO_SIZE__=280;");
    }

    #[test]
    fn tamanhos_do_tomate_e_o_texto_da_resposta() {
        assert_eq!(TAMANHOS, [240, 280, 320]);
        assert_eq!(Regiao::Aplicada.as_str(), "applied");
        assert_eq!(Regiao::Ignorada.as_str(), "ignored");
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn video_no_linux_le_os_drivers_sem_falhar() {
        let v = video();
        assert!(v.iter().all(|x| !x.is_empty()));
    }
}
