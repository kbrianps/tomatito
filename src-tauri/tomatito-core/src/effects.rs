//! O que o motor pede ao mundo (PLANO.md, 3.1 e 3.2): som, notificação,
//! gravação, bandeja e `emit`.
//!
//! O núcleo não conhece o Tauri, o SQLite nem o áudio. A máquina de estados
//! (`focus.rs`) decide **o que** acontece num fim de fase e chama o trait
//! [`Effects`]; o app (M16 em diante) decide **como**:
//!
//! | Método | No app |
//! |---|---|
//! | [`Effects::play_sound`] | `audio.rs` (M20), se o som estiver ligado nas configurações |
//! | [`Effects::notify`] | `notify.rs` (M21), com os textos do `i18n.rs` |
//! | [`Effects::record_period`] | `stats.rs` (M26), uma linha em `periods` |
//! | [`Effects::state_changed`] | `emit("tt://state")` (M16), a bandeja (M36) e o `state.json` (M40) |
//! | [`Effects::phase_changed`] | `emit("tt://phase")`, que alimenta o anúncio `aria-live` (M19) |
//!
//! Os testes usam o [`FakeEffects`], que só anota os pedidos, em ordem.

use crate::clock::EpochMs;
use crate::focus::{FocusSnapshot, Status};
use crate::plan::{Phase, PhaseKind};

/// Qual som tocar. O fim da sessão é o fim de um foco e toca o mesmo som.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Sound {
    /// `focus-end.wav` (M20): duas notas.
    FocusEnd,
    /// `break-end.wav` (M20): uma nota.
    BreakEnd,
}

/// Uma notificação do sistema. Leva os dados, não o texto: os textos ficam no
/// catálogo do app (`i18n.rs`, M21).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Notice {
    /// Fim de um período de foco, com um intervalo a seguir. No M21:
    /// "Período de foco concluído" / "Intervalo de 5 min. Próximo foco às 14:35."
    FocusEnded {
        /// O foco que terminou (o `n` de "1 de 2").
        n: u32,
        /// Quantos períodos de foco a sessão tem.
        blocks: u32,
        /// Duração do intervalo que começou.
        break_s: u64,
        /// Quando o intervalo termina e o próximo foco começa.
        next_focus_at: EpochMs,
    },
    /// Fim de um intervalo. No M21: "Intervalo concluído" /
    /// "Período de foco 2 de 2, 27 min."
    BreakEnded {
        /// O foco que começou.
        next_n: u32,
        blocks: u32,
        /// Duração do foco que começou.
        next_focus_s: u64,
    },
    /// Fim do último período de foco. No M21: "Sessão de foco concluída" /
    /// "60 min de foco."
    SessionCompleted {
        /// T, o tamanho da sessão escolhido no seletor.
        total_minutes: u32,
        /// Tempo de foco de fato, somando os períodos de foco da sessão
        /// (sem os intervalos e sem o que foi pulado).
        focus_s: u64,
    },
    /// A última fase vencida terminou há mais de 60 s (suspensão ou app
    /// fechado): um aviso só, sem som, por mais fases que tenham vencido. No
    /// M21, com a sessão concluída: "Sessão concluída às 14:32".
    Late {
        /// A última fase que venceu.
        ended: Phase,
        /// Quando ela venceu (o prazo, não a hora em que o app percebeu).
        ended_at: EpochMs,
        /// Se a fase que venceu era a última da sessão.
        session_completed: bool,
    },
}

/// Uma linha da tabela `periods` (PLANO.md, 3.3): um bloco de foco ou um
/// intervalo, completo ou interrompido.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Period {
    pub session_id: i64,
    pub kind: PhaseKind,
    /// Número da fase entre as do mesmo tipo, a partir de 1.
    pub n: u32,
    /// Quando a fase começou.
    pub started_at: EpochMs,
    /// Quando terminou: o prazo, se venceu; a hora do comando, se foi pulada
    /// ou encerrada. O período conta no dia do `ended_at` (3.3).
    pub ended_at: EpochMs,
    /// Duração planejada da fase.
    pub planned_s: u64,
    /// Tempo que de fato correu, sem as pausas. Igual a `planned_s` se a
    /// fase venceu; menor se foi pulada ou encerrada.
    pub actual_s: u64,
    /// `true` só quando a fase venceu.
    pub completed: bool,
    pub task_id: Option<i64>,
}

/// Por que a fase mudou.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ChangeCause {
    /// A sessão começou (primeiro foco).
    Started,
    /// Uma ou mais fases venceram. `late` segue a regra do atraso (mais de
    /// 60 s) aplicada à última delas.
    Ended { late: bool },
    /// O usuário pulou a fase.
    Skipped,
    /// O usuário encerrou a sessão.
    Stopped,
}

/// Uma troca de fase (`tt://phase`), para o anúncio `aria-live`. Pausar e
/// retomar não trocam de fase: só aparecem em [`Effects::state_changed`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PhaseChange {
    pub cause: ChangeCause,
    /// O estado depois da troca.
    pub status: Status,
    /// A fase que terminou (a última, se foram várias); `None` no início.
    pub ended: Option<Phase>,
}

/// O que a máquina de estados pede ao app. Cada método é chamado depois que
/// o estado já mudou, então um [`Effects::state_changed`] sempre recebe o
/// estado novo.
///
/// Ordem num fim de fase: `record_period` (uma vez por fase vencida, em
/// ordem), `state_changed`, `phase_changed`, `play_sound` (se não atrasou) e
/// `notify` (um aviso só).
pub trait Effects {
    fn play_sound(&mut self, sound: Sound);
    fn notify(&mut self, notice: Notice);
    fn record_period(&mut self, period: &Period);
    fn state_changed(&mut self, snapshot: &FocusSnapshot);
    fn phase_changed(&mut self, change: &PhaseChange);
}

/// Um pedido anotado pelo [`FakeEffects`].
#[derive(Debug, Clone, PartialEq)]
pub enum Effect {
    Sound(Sound),
    Notice(Notice),
    Period(Period),
    State(FocusSnapshot),
    Phase(PhaseChange),
}

/// `Effects` de teste: anota cada pedido em `log`, na ordem em que chegou,
/// sem tocar, notificar nem gravar nada.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct FakeEffects {
    pub log: Vec<Effect>,
}

impl FakeEffects {
    pub fn new() -> Self {
        Self::default()
    }

    /// Esquece o que foi anotado até aqui.
    pub fn clear(&mut self) {
        self.log.clear();
    }

    pub fn is_empty(&self) -> bool {
        self.log.is_empty()
    }

    pub fn sounds(&self) -> Vec<Sound> {
        self.log
            .iter()
            .filter_map(|e| match e {
                Effect::Sound(s) => Some(*s),
                _ => None,
            })
            .collect()
    }

    pub fn notices(&self) -> Vec<Notice> {
        self.log
            .iter()
            .filter_map(|e| match e {
                Effect::Notice(n) => Some(*n),
                _ => None,
            })
            .collect()
    }

    pub fn periods(&self) -> Vec<Period> {
        self.log
            .iter()
            .filter_map(|e| match e {
                Effect::Period(p) => Some(*p),
                _ => None,
            })
            .collect()
    }

    pub fn states(&self) -> Vec<&FocusSnapshot> {
        self.log
            .iter()
            .filter_map(|e| match e {
                Effect::State(s) => Some(s),
                _ => None,
            })
            .collect()
    }

    pub fn phase_changes(&self) -> Vec<PhaseChange> {
        self.log
            .iter()
            .filter_map(|e| match e {
                Effect::Phase(c) => Some(*c),
                _ => None,
            })
            .collect()
    }

    /// Os tipos dos pedidos, em ordem, para conferir a sequência sem os dados.
    pub fn kinds(&self) -> Vec<&'static str> {
        self.log
            .iter()
            .map(|e| match e {
                Effect::Sound(_) => "som",
                Effect::Notice(_) => "aviso",
                Effect::Period(_) => "período",
                Effect::State(_) => "estado",
                Effect::Phase(_) => "fase",
            })
            .collect()
    }
}

impl Effects for FakeEffects {
    fn play_sound(&mut self, sound: Sound) {
        self.log.push(Effect::Sound(sound));
    }

    fn notify(&mut self, notice: Notice) {
        self.log.push(Effect::Notice(notice));
    }

    fn record_period(&mut self, period: &Period) {
        self.log.push(Effect::Period(*period));
    }

    fn state_changed(&mut self, snapshot: &FocusSnapshot) {
        self.log.push(Effect::State(snapshot.clone()));
    }

    fn phase_changed(&mut self, change: &PhaseChange) {
        self.log.push(Effect::Phase(*change));
    }
}
