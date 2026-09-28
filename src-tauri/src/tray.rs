//! A bandeja (PLANO.md, 3.4, 3.8 e M36): o ícone com o menu "Iniciar foco"
//! (que vira "Pausar foco" durante a sessão, e "Retomar foco" no pausado),
//! "Mostrar Tomatito" e "Sair", e o tempo na bandeja, se ligado.
//!
//! **Quem atualiza.** O motor avisa a [`Bandeja`] a cada `tt://state` e a cada
//! `tt://tick` (pelo `TauriSink`), e o `settings_set` avisa quando o
//! `trayTime` muda. A bandeja calcula o que mostrar ([`vista`], pura e
//! testada) e só mexe no ícone quando o texto muda: o item do menu a cada
//! transição, o tempo uma vez por minuto.
//!
//! **Sem travar o motor.** O `set_text` e o `set_title` do Tauri rodam na
//! thread principal e, chamados de outra thread, esperam por ela. O motor
//! avisa com a trava pega, e a thread principal pode estar esperando essa
//! mesma trava (um comando do JS ou um clique no menu): esperar ali seria um
//! impasse. Por isso a bandeja só *posta* a mudança na thread principal
//! (`run_on_main_thread`, que não espera) e segue.
//!
//! **Plataformas (3.8).** No Linux, o ícone vem pelo AppIndicator; o tempo
//! vai no `set_title` (o rótulo ao lado do ícone), porque o `set_tooltip` não
//! funciona lá. No Windows, o tempo vai na dica (`set_tooltip`), porque o
//! `set_title` não funciona lá. Sem o AppIndicator (GNOME puro), o ícone não
//! aparece, e fechar continua escondendo a janela: abrir o app de novo a traz
//! de volta (M37).

use std::sync::{Mutex, OnceLock, PoisonError};

use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{TrayIcon, TrayIconBuilder};
use tauri::{AppHandle, Manager, Wry};

use crate::commands::AppEngine;
use crate::events::{FocusDto, PhaseKindDto, StatusDto, TickDto};
use crate::i18n::{self, TrayPhase, bandeja as t};

/// Id do ícone (`app.tray_by_id`).
pub const ID: &str = "tomatito";
const ITEM_ACAO: &str = "acao";
const ITEM_MOSTRAR: &str = "mostrar";
const ITEM_SAIR: &str = "sair";

/// T do "Iniciar foco" da bandeja: a duração com que o seletor da tela Foco
/// abre (`MINUTOS_INICIAIS`, `src/views/focus/card-session.js`). A escolha
/// que a tela guarda fica no JS e não chega aqui (docs/decisoes.md, M36).
pub const MINUTOS_AO_INICIAR: u32 = 30;

/// O item de ação do menu.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Acao {
    Iniciar,
    Pausar,
    Retomar,
}

impl Acao {
    pub fn texto(self) -> &'static str {
        match self {
            Acao::Iniciar => t::INICIAR,
            Acao::Pausar => t::PAUSAR,
            Acao::Retomar => t::RETOMAR,
        }
    }

    /// A ação que vale para o estado do foco agora (o clique relê o estado:
    /// o texto do menu pode estar um instante atrás).
    pub fn para(status: StatusDto) -> Self {
        match status {
            StatusDto::Idle | StatusDto::Completed => Acao::Iniciar,
            StatusDto::Focus | StatusDto::Break => Acao::Pausar,
            StatusDto::Paused => Acao::Retomar,
        }
    }
}

/// O que a bandeja sabe da sessão: a fase (nenhuma sem sessão em andamento)
/// e quanto falta.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct Contagem {
    pub fase: Option<TrayPhase>,
    pub restante_ms: u64,
}

impl Contagem {
    pub fn do_foco(f: &FocusDto) -> Self {
        let fase = match f.status {
            StatusDto::Idle | StatusDto::Completed => None,
            StatusDto::Focus => Some(TrayPhase::Focus),
            StatusDto::Break => Some(TrayPhase::Break),
            StatusDto::Paused => Some(TrayPhase::Paused),
        };
        Self {
            fase,
            restante_ms: f.session.as_ref().map_or(0, |s| s.remaining_ms),
        }
    }

    /// O tick só sai com uma fase correndo.
    pub fn do_tick(t: &TickDto) -> Self {
        Self {
            fase: Some(match t.phase.kind {
                PhaseKindDto::Focus => TrayPhase::Focus,
                PhaseKindDto::Break => TrayPhase::Break,
            }),
            restante_ms: t.remaining_ms,
        }
    }

    fn acao(&self) -> Acao {
        match self.fase {
            None => Acao::Iniciar,
            Some(TrayPhase::Paused) => Acao::Retomar,
            Some(_) => Acao::Pausar,
        }
    }
}

/// O que o ícone mostra.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Vista {
    pub acao: Acao,
    /// O tempo na bandeja ("24 min"), só com a opção ligada e uma sessão em
    /// andamento.
    pub tempo: Option<String>,
}

/// A vista para uma contagem. Os minutos são arredondados para cima, como no
/// mostrador: com 24:13 faltando, "25 min"; o texto muda uma vez por minuto.
pub fn vista(c: &Contagem, tray_time: bool) -> Vista {
    let tempo = match c.fase {
        Some(fase) if tray_time => Some(i18n::tray_time(fase, c.restante_ms.div_ceil(60_000))),
        _ => None,
    };
    Vista {
        acao: c.acao(),
        tempo,
    }
}

struct Estado {
    contagem: Contagem,
    tray_time: bool,
    /// A última vista mandada ao ícone.
    aplicada: Option<Vista>,
}

struct Alcas {
    icone: TrayIcon<Wry>,
    acao: MenuItem<Wry>,
}

/// A bandeja no app. Nasce antes do motor (o `TauriSink` a guarda) e ganha
/// o ícone logo depois ([`Bandeja::criar_icone`]).
pub struct Bandeja {
    app: AppHandle,
    alcas: OnceLock<Alcas>,
    estado: Mutex<Estado>,
}

impl Bandeja {
    pub fn new(app: AppHandle, tray_time: bool) -> Self {
        Self {
            app,
            alcas: OnceLock::new(),
            estado: Mutex::new(Estado {
                contagem: Contagem::default(),
                tray_time,
                aplicada: None,
            }),
        }
    }

    /// Cria o ícone e o menu e aplica a vista de `foco`. Um erro (sem
    /// AppIndicator, por exemplo) só vai para o registro: o app segue sem
    /// bandeja.
    pub fn criar_icone(&self, foco: &FocusDto) {
        match montar(&self.app) {
            Ok(alcas) => {
                let _ = self.alcas.set(alcas);
            }
            Err(e) => eprintln!("[tomatito] bandeja não criada: {e}"),
        }
        self.mudar(|e| e.contagem = Contagem::do_foco(foco));
    }

    /// `tt://state`.
    pub fn foco(&self, foco: &FocusDto) {
        self.mudar(|e| e.contagem = Contagem::do_foco(foco));
    }

    /// `tt://tick`.
    pub fn tick(&self, tick: &TickDto) {
        self.mudar(|e| e.contagem = Contagem::do_tick(tick));
    }

    /// `trayTime` depois de um `settings_set`.
    pub fn tray_time(&self, ligado: bool) {
        self.mudar(|e| e.tray_time = ligado);
    }

    fn mudar(&self, f: impl FnOnce(&mut Estado)) {
        let mut e = self.estado.lock().unwrap_or_else(PoisonError::into_inner);
        f(&mut e);
        let nova = vista(&e.contagem, e.tray_time);
        if e.aplicada.as_ref() == Some(&nova) {
            return;
        }
        let Some(alcas) = self.alcas.get() else {
            return;
        };
        let anterior = e.aplicada.replace(nova.clone());
        let mudou_acao = anterior.as_ref().map(|a| a.acao) != Some(nova.acao);
        let mudou_tempo = anterior.as_ref().map(|a| &a.tempo) != Some(&nova.tempo);
        let (icone, acao) = (alcas.icone.clone(), alcas.acao.clone());
        // Postado, sem esperar (ver o topo do arquivo). As postagens saem na
        // ordem, e esta é feita com a trava da bandeja pega.
        let r = self.app.run_on_main_thread(move || {
            if mudou_acao && let Err(e) = acao.set_text(nova.acao.texto()) {
                eprintln!("[tomatito] bandeja: item não atualizado: {e}");
            }
            if mudou_tempo {
                mostrar_tempo(&icone, nova.tempo.as_deref());
            }
        });
        if let Err(e) = r {
            eprintln!("[tomatito] bandeja: atualização não postada: {e}");
        }
    }
}

/// O tempo no Linux: o rótulo ao lado do ícone.
#[cfg(not(windows))]
fn mostrar_tempo(icone: &TrayIcon<Wry>, tempo: Option<&str>) {
    if let Err(e) = icone.set_title(tempo) {
        eprintln!("[tomatito] bandeja: tempo não atualizado: {e}");
    }
}

/// O tempo no Windows: a dica do ícone.
#[cfg(windows)]
fn mostrar_tempo(icone: &TrayIcon<Wry>, tempo: Option<&str>) {
    if let Err(e) = icone.set_tooltip(Some(i18n::tray_tooltip(tempo))) {
        eprintln!("[tomatito] bandeja: dica não atualizada: {e}");
    }
}

fn montar(app: &AppHandle) -> tauri::Result<Alcas> {
    let acao = MenuItem::with_id(app, ITEM_ACAO, t::INICIAR, true, None::<&str>)?;
    let mostrar = MenuItem::with_id(app, ITEM_MOSTRAR, t::MOSTRAR, true, None::<&str>)?;
    let item_sair = MenuItem::with_id(app, ITEM_SAIR, t::SAIR, true, None::<&str>)?;
    let separador = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&acao, &mostrar, &separador, &item_sair])?;
    // PNG de 128 px (3.8: pelo menos 64 px, legível entre 16 e 22 px).
    let imagem = Image::from_bytes(include_bytes!("../icons/128x128.png"))?;
    let icone = TrayIconBuilder::with_id(ID)
        .icon(imagem)
        .tooltip(i18n::tray_tooltip(None))
        .menu(&menu)
        // No Windows, o clique esquerdo também abre o menu (no Linux, o
        // clique no ícone sempre abre o menu e não gera evento; 3.8).
        .show_menu_on_left_click(true)
        .on_menu_event(|app, ev| match ev.id().as_ref() {
            ITEM_ACAO => alternar_foco(app),
            ITEM_MOSTRAR => crate::window::mostrar(app),
            ITEM_SAIR => sair(app),
            _ => {}
        })
        .build(app)?;
    Ok(Alcas { icone, acao })
}

/// "Iniciar foco", "Pausar foco" ou "Retomar foco", conforme o estado de
/// agora. Roda na thread principal; o motor emite o `tt://state`, e a tela
/// e o próprio menu se atualizam por ele.
fn alternar_foco(app: &AppHandle) {
    let Some(motor) = app.try_state::<AppEngine>() else {
        return;
    };
    let r = match Acao::para(motor.state().focus.status) {
        Acao::Iniciar => motor.start(MINUTOS_AO_INICIAR, false, None),
        Acao::Pausar => motor.pause(),
        Acao::Retomar => motor.resume(),
    };
    if let Err(e) = r {
        eprintln!("[tomatito] bandeja: {e:?}");
    }
}

/// "Sair" (3.4): encerra a sessão de foco, registrando o parcial, e fecha o
/// app. Os temporizadores e o cronômetro já estão no `state.json` (gravado a
/// cada transição, M33 e M34). O `app_quit`, o Ctrl+Q e "Fechar e sair" são
/// do M37 e vão chamar esta mesma função.
pub fn sair(app: &AppHandle) {
    if let Some(motor) = app.try_state::<AppEngine>() {
        // Sem sessão, o núcleo responde `NoSession`: nada a gravar.
        let _ = motor.stop();
    }
    app.exit(0);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn c(fase: Option<TrayPhase>, restante_ms: u64) -> Contagem {
        Contagem { fase, restante_ms }
    }

    #[test]
    fn acao_segue_o_estado() {
        assert_eq!(Acao::para(StatusDto::Idle), Acao::Iniciar);
        assert_eq!(Acao::para(StatusDto::Completed), Acao::Iniciar);
        assert_eq!(Acao::para(StatusDto::Focus), Acao::Pausar);
        assert_eq!(Acao::para(StatusDto::Break), Acao::Pausar);
        assert_eq!(Acao::para(StatusDto::Paused), Acao::Retomar);
        assert_eq!(Acao::Iniciar.texto(), "Iniciar foco");
        assert_eq!(Acao::Pausar.texto(), "Pausar foco");
        assert_eq!(Acao::Retomar.texto(), "Retomar foco");
    }

    #[test]
    fn sem_tempo_na_bandeja_so_o_item_muda() {
        assert_eq!(
            vista(&c(Some(TrayPhase::Focus), 1_453_000), false),
            Vista {
                acao: Acao::Pausar,
                tempo: None
            }
        );
        assert_eq!(vista(&c(None, 0), false).acao, Acao::Iniciar);
        assert_eq!(
            vista(&c(Some(TrayPhase::Paused), 60_000), false).acao,
            Acao::Retomar
        );
    }

    #[test]
    fn tempo_na_bandeja_em_minutos_para_cima() {
        let tempo = |fase, ms| vista(&c(Some(fase), ms), true).tempo;
        // 24:13 faltando: 25 min, como o mostrador.
        assert_eq!(tempo(TrayPhase::Focus, 1_453_000), Some("25 min".into()));
        assert_eq!(tempo(TrayPhase::Focus, 1_440_000), Some("24 min".into()));
        assert_eq!(tempo(TrayPhase::Focus, 1), Some("1 min".into()));
        assert_eq!(
            tempo(TrayPhase::Break, 240_000),
            Some("Intervalo · 4 min".into())
        );
        assert_eq!(
            tempo(TrayPhase::Paused, 1_453_000),
            Some("Pausado · 25 min".into())
        );
        // Sem sessão, nada, mesmo ligado.
        assert_eq!(vista(&c(None, 0), true).tempo, None);
    }

    #[test]
    fn a_vista_so_muda_uma_vez_por_minuto() {
        let v = |ms| vista(&c(Some(TrayPhase::Focus), ms), true);
        // De 24:59 a 24:01 é o mesmo texto; em 24:00, muda.
        assert_eq!(v(1_499_000), v(1_441_000));
        assert_ne!(v(1_441_000), v(1_440_000));
    }

    #[test]
    fn contagem_do_tick_e_do_retrato() {
        use crate::events::PhaseDto;
        let tick = TickDto {
            seq: 3,
            session_id: 1,
            phase_index: 1,
            phase: PhaseDto {
                kind: PhaseKindDto::Break,
                n: 1,
                duration_s: 300,
            },
            at: 0,
            ends_at_ms: 0,
            remaining_ms: 200_000,
        };
        assert_eq!(Contagem::do_tick(&tick), c(Some(TrayPhase::Break), 200_000));
        let ocioso = FocusDto {
            seq: 0,
            status: StatusDto::Idle,
            at: 0,
            session: None,
        };
        assert_eq!(Contagem::do_foco(&ocioso), c(None, 0));
    }

    #[test]
    fn dica_do_windows() {
        assert_eq!(i18n::tray_tooltip(None), "Tomatito");
        assert_eq!(i18n::tray_tooltip(Some("25 min")), "Tomatito · 25 min");
    }
}
