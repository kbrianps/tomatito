//! O que vai para as janelas (PLANO.md, 3.5): os nomes dos eventos e o formato
//! JSON dos retratos, em camelCase.
//!
//! O núcleo (`tomatito-core`) não conhece o `serde`: os tipos daqui são a
//! tradução dos retratos dele para o fio, feita num lugar só. Assim o formato
//! que o JS lê (`src/lib/store.js`) fica todo neste arquivo, e mudar um nome
//! no núcleo não muda o contrato com as janelas sem passar por aqui.
//!
//! Horários em ms desde a época Unix (UTC), como no núcleo; durações em ms
//! (`remainingMs`) ou em s (`durationS`, `focusS`), com a unidade no nome.

use serde::Serialize;
use tomatito_core::{
    ChangeCause, EpochMs, FocusSnapshot, Phase, PhaseChange, PhaseKind, SessionSnapshot, Status,
    StopwatchSnapshot, StopwatchStatus, TimerSnapshot, TimerStatus, TimersSnapshot,
};

/// Retrato completo, a cada transição (iniciar, pausar, retomar, pular,
/// parar e fim de fase).
pub const STATE: &str = "tt://state";
/// 1 Hz com uma fase correndo: o prazo e o restante, só para corrigir desvio.
pub const TICK: &str = "tt://tick";
/// Troca de fase, para o anúncio `aria-live` (M19).
pub const PHASE: &str = "tt://phase";
/// Depois de cada gravação do `settings_set` (M23): as configurações
/// inteiras, no formato do `settings.json` (`settings.rs`).
pub const SETTINGS: &str = "tt://settings";
/// M32: o retrato de todos os temporizadores, a cada mudança (criar, editar,
/// excluir, iniciar, pausar, redefinir e cada fim). Fora da tabela da 3.5,
/// que só tem o retrato do foco (docs/decisoes.md, M32).
pub const TIMERS: &str = "tt://timers";
/// M34: o retrato do cronômetro, a cada transição (iniciar, pausar, volta e
/// redefinir). Sem tick: o JS conta os centésimos sozinho a partir do
/// `startedAt` (docs/decisoes.md, M34).
pub const STOPWATCH: &str = "tt://stopwatch";

fn ms(t: EpochMs) -> i64 {
    t.0
}

/// Estado do foco, na linguagem do fio. A fase de uma pausa vem em
/// `session.phase`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum StatusDto {
    Idle,
    Focus,
    Break,
    Paused,
    Completed,
}

impl From<Status> for StatusDto {
    fn from(s: Status) -> Self {
        match s {
            Status::Idle => Self::Idle,
            Status::Focus { .. } => Self::Focus,
            Status::Break { .. } => Self::Break,
            Status::Paused { .. } => Self::Paused,
            Status::Completed => Self::Completed,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum PhaseKindDto {
    Focus,
    Break,
}

impl From<PhaseKind> for PhaseKindDto {
    fn from(k: PhaseKind) -> Self {
        match k {
            PhaseKind::Focus => Self::Focus,
            PhaseKind::Break => Self::Break,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PhaseDto {
    pub kind: PhaseKindDto,
    pub n: u32,
    pub duration_s: u64,
}

impl From<Phase> for PhaseDto {
    fn from(p: Phase) -> Self {
        Self {
            kind: p.kind.into(),
            n: p.n,
            duration_s: p.duration_s,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionDto {
    pub id: i64,
    /// T, em minutos.
    pub minutes: u32,
    pub skip_breaks: bool,
    pub task_id: Option<i64>,
    pub focus_minutes: u32,
    pub break_minutes: u32,
    pub started_at: i64,
    pub blocks: u32,
    pub intervals: u32,
    pub phase_index: u32,
    pub phase: PhaseDto,
    pub phase_started_at: i64,
    /// O prazo, só com a fase correndo.
    pub ends_at: Option<i64>,
    /// Quanto falta em `at` (o instante do retrato).
    pub remaining_ms: u64,
    pub next: Option<PhaseDto>,
    pub focus_s: u64,
    pub completed_at: Option<i64>,
}

impl From<&SessionSnapshot> for SessionDto {
    fn from(s: &SessionSnapshot) -> Self {
        Self {
            id: s.id,
            minutes: s.config.minutes,
            skip_breaks: s.config.skip_breaks,
            task_id: s.config.task_id,
            focus_minutes: s.config.settings.focus_minutes,
            break_minutes: s.config.settings.break_minutes,
            started_at: ms(s.started_at),
            blocks: s.blocks,
            intervals: s.intervals,
            phase_index: s.phase_index,
            phase: s.phase.into(),
            phase_started_at: ms(s.phase_started_at),
            ends_at: s.ends_at.map(ms),
            remaining_ms: s.remaining_ms,
            next: s.next.map(Into::into),
            focus_s: s.focus_s,
            completed_at: s.completed_at.map(ms),
        }
    }
}

/// O retrato do foco (`tt://state` e o `focus` do `get_state`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FocusDto {
    /// Número da transição: cresce a cada `tt://state` do processo. O JS
    /// descarta um retrato mais velho que o que já tem (um evento que chegou
    /// depois da resposta de um `get_state`, por exemplo). Começa em 0.
    pub seq: u64,
    pub status: StatusDto,
    /// O instante do retrato, no relógio do motor.
    pub at: i64,
    pub session: Option<SessionDto>,
}

impl From<&FocusSnapshot> for FocusDto {
    fn from(s: &FocusSnapshot) -> Self {
        Self {
            seq: 0,
            status: s.status.into(),
            at: ms(s.at),
            session: s.session.as_ref().map(Into::into),
        }
    }
}

/// `tt://tick`: o prazo e a fase de quem corre (3.5), mais o instante e o
/// restante, para o JS corrigir a contagem sem pedir o retrato inteiro.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TickDto {
    /// O `seq` do último `tt://state`: um tick com `seq` maior que o do
    /// retrato do JS indica que ele perdeu uma transição.
    pub seq: u64,
    pub session_id: i64,
    pub phase_index: u32,
    pub phase: PhaseDto,
    pub at: i64,
    pub ends_at_ms: i64,
    pub remaining_ms: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum CauseDto {
    Started,
    Ended,
    Skipped,
    Stopped,
}

/// `tt://phase`.
///
/// M19: o evento basta para o anúncio `aria-live` ("Período de foco 2 de 2",
/// "Intervalo 1 de 1", "Sessão concluída"): leva a fase que começou e quantas
/// fases do mesmo tipo a sessão tem, tirados do retrato emitido logo antes,
/// cujo `seq` vai junto.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PhaseEventDto {
    /// O `seq` do `tt://state` desta troca (0 fora do motor).
    pub seq: u64,
    pub cause: CauseDto,
    /// Só em `ended`: a última fase venceu há mais de 60 s.
    pub late: bool,
    pub status: StatusDto,
    pub ended: Option<PhaseDto>,
    /// A fase atual depois da troca; `None` no ocioso e no concluído.
    pub phase: Option<PhaseDto>,
    /// Quantas fases do tipo de `phase` a sessão tem (os blocos de foco ou
    /// os intervalos): o "2" de "1 de 2".
    pub of: Option<u32>,
}

impl PhaseEventDto {
    /// Completa o evento com o retrato emitido logo antes (engine.rs).
    pub fn complete_with(&mut self, state: &FocusDto) {
        self.seq = state.seq;
        let session = state
            .session
            .as_ref()
            .filter(|_| !matches!(state.status, StatusDto::Idle | StatusDto::Completed));
        self.phase = session.map(|s| s.phase);
        self.of = session.map(|s| match s.phase.kind {
            PhaseKindDto::Focus => s.blocks,
            PhaseKindDto::Break => s.intervals,
        });
    }
}

impl From<&PhaseChange> for PhaseEventDto {
    fn from(c: &PhaseChange) -> Self {
        let (cause, late) = match c.cause {
            ChangeCause::Started => (CauseDto::Started, false),
            ChangeCause::Ended { late } => (CauseDto::Ended, late),
            ChangeCause::Skipped => (CauseDto::Skipped, false),
            ChangeCause::Stopped => (CauseDto::Stopped, false),
        };
        Self {
            seq: 0,
            cause,
            late,
            status: c.status.into(),
            ended: c.ended.map(Into::into),
            phase: None,
            of: None,
        }
    }
}

/// Estado de um temporizador no fio (M32).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum TimerStatusDto {
    /// Parado na duração cheia: o "Redefinir" fica desabilitado.
    Idle,
    Running,
    Paused,
}

impl From<TimerStatus> for TimerStatusDto {
    fn from(s: TimerStatus) -> Self {
        match s {
            TimerStatus::Idle => Self::Idle,
            TimerStatus::Running => Self::Running,
            TimerStatus::Paused => Self::Paused,
        }
    }
}

/// Um temporizador (M32), como o `countdown.rs` o descreve.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimerDto {
    pub id: u64,
    /// Pode ser vazio: a tela mostra a duração no lugar.
    pub name: String,
    pub duration_ms: u64,
    pub status: TimerStatusDto,
    /// O prazo, só enquanto corre.
    pub ends_at: Option<i64>,
    /// Quanto falta em `at`; negativo depois do zero.
    pub remaining_ms: i64,
    /// O fim já disparou (até redefinir).
    pub ended: bool,
    /// Passou do zero: o tempo aparece negativo, com "Encerrado há".
    pub overdue: bool,
}

impl From<&TimerSnapshot> for TimerDto {
    fn from(t: &TimerSnapshot) -> Self {
        Self {
            id: t.id,
            name: t.name.clone(),
            duration_ms: t.duration_ms,
            status: t.status.into(),
            ends_at: t.ends_at.map(ms),
            remaining_ms: t.remaining_ms,
            ended: t.ended,
            overdue: t.is_overdue(),
        }
    }
}

/// Todos os temporizadores (`tt://timers` e o `timers` do `get_state`), na
/// ordem de criação, que é a ordem dos cards.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimersDto {
    /// Cresce a cada `tt://timers` do processo (separado do `seq` do foco):
    /// o JS descarta um retrato mais velho que o que já tem.
    pub seq: u64,
    pub at: i64,
    pub timers: Vec<TimerDto>,
}

impl From<&TimersSnapshot> for TimersDto {
    fn from(s: &TimersSnapshot) -> Self {
        Self {
            seq: 0,
            at: ms(s.at),
            timers: s.timers.iter().map(Into::into).collect(),
        }
    }
}

/// Estado do cronômetro no fio (M34).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum StopwatchStatusDto {
    /// Zerado: "Voltas" e "Redefinir" desabilitados.
    Idle,
    Running,
    Paused,
}

impl From<StopwatchStatus> for StopwatchStatusDto {
    fn from(s: StopwatchStatus) -> Self {
        match s {
            StopwatchStatus::Idle => Self::Idle,
            StopwatchStatus::Running => Self::Running,
            StopwatchStatus::Paused => Self::Paused,
        }
    }
}

/// O cronômetro (M34; `tt://stopwatch` e o `stopwatch` do `get_state`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StopwatchDto {
    /// Cresce a cada `tt://stopwatch` do processo (separado dos outros).
    pub seq: u64,
    pub at: i64,
    pub status: StopwatchStatusDto,
    /// O começo do trecho atual (ms UTC), só correndo.
    pub started_at: Option<i64>,
    /// Os trechos já fechados.
    pub accumulated_ms: u64,
    /// O decorrido em `at`.
    pub elapsed_ms: u64,
    /// O decorrido total em cada volta, em ordem (a lista é do M35).
    pub laps: Vec<u64>,
}

impl From<&StopwatchSnapshot> for StopwatchDto {
    fn from(s: &StopwatchSnapshot) -> Self {
        Self {
            seq: 0,
            at: ms(s.at),
            status: s.status.into(),
            started_at: s.started_at.map(ms),
            accumulated_ms: s.accumulated_ms,
            elapsed_ms: s.elapsed_ms,
            laps: s.laps.clone(),
        }
    }
}

/// O retrato do motor. O `get_state` o manda junto com as configurações
/// (`commands.rs`); os `recursos` (M39) entram quando existirem.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StateDto {
    pub focus: FocusDto,
    /// Velocidade do relógio do motor: 1, ou a do `TOMATITO_SPEED` num build
    /// de debug. O JS a usa para contar entre dois ticks.
    pub speed: f64,
    /// M17: o que o cartão "Pronto para focar" precisa para montar uma sessão.
    pub setup: SetupDto,
    /// M32: os temporizadores.
    pub timers: TimersDto,
    /// M34: o cronômetro.
    pub stopwatch: StopwatchDto,
}

/// M17: a faixa e o passo do seletor de minutos (5 a 240, de 5 em 5; no
/// debug, de 1 em 1, a mesma faixa que o `focus_start` aceita) e o F e o B
/// que o próximo `focus_start` vai usar, para a frase "Você terá N
/// intervalos." seguir a regra do `plan.rs` sem uma segunda fonte para os
/// números. F e B vêm das configurações (M38).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetupDto {
    pub min_minutes: u32,
    pub max_minutes: u32,
    pub step_minutes: u32,
    pub focus_minutes: u32,
    pub break_minutes: u32,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use tomatito_core::{FakeEffects, Focus, SessionConfig};

    #[test]
    fn retrato_em_camel_case_com_as_unidades_no_nome() {
        let mut fx = FakeEffects::new();
        let mut focus = Focus::new();
        let t0 = EpochMs(1_790_000_000_000);
        focus.start(t0, SessionConfig::new(60), &mut fx).unwrap();
        let dto = FocusDto::from(&focus.snapshot(t0.plus_ms(1_500)));
        let v = serde_json::to_value(&dto).unwrap();
        assert_eq!(v["status"], "focus");
        assert_eq!(v["at"], 1_790_000_001_500i64);
        let s = &v["session"];
        assert_eq!(s["minutes"], 60);
        assert_eq!(s["skipBreaks"], false);
        assert_eq!(s["taskId"], json!(null));
        assert_eq!(s["blocks"], 2);
        assert_eq!(s["intervals"], 1);
        assert_eq!(
            s["phase"],
            json!({"kind": "focus", "n": 1, "durationS": 1650})
        );
        assert_eq!(s["endsAt"], 1_790_000_000_000i64 + 1_650_000);
        assert_eq!(s["remainingMs"], 1_650_000 - 1_500);
        assert_eq!(
            s["next"],
            json!({"kind": "break", "n": 1, "durationS": 300})
        );
        assert_eq!(s["focusMinutes"], 25);
        assert_eq!(s["breakMinutes"], 5);
    }

    #[test]
    fn ocioso_e_pausado() {
        let mut fx = FakeEffects::new();
        let mut focus = Focus::new();
        let t0 = EpochMs(1_000_000);
        let v = serde_json::to_value(FocusDto::from(&focus.snapshot(t0))).unwrap();
        assert_eq!(
            v,
            json!({"seq": 0, "status": "idle", "at": 1_000_000, "session": null})
        );
        focus.start(t0, SessionConfig::new(5), &mut fx).unwrap();
        focus.pause(t0.plus_ms(60_000), &mut fx).unwrap();
        let v = serde_json::to_value(FocusDto::from(&focus.snapshot(t0.plus_ms(90_000)))).unwrap();
        assert_eq!(v["status"], "paused");
        assert_eq!(v["session"]["endsAt"], json!(null));
        assert_eq!(v["session"]["remainingMs"], 240_000);
    }

    #[test]
    fn evento_de_fase() {
        let mut fx = FakeEffects::new();
        let mut focus = Focus::new();
        let t0 = EpochMs(0);
        focus.start(t0, SessionConfig::new(5), &mut fx).unwrap();
        focus.advance_to(t0.plus_ms(5 * 60_000 + 61_000), &mut fx);
        let c = fx.phase_changes();
        let v: Vec<_> = c
            .iter()
            .map(|c| serde_json::to_value(PhaseEventDto::from(c)).unwrap())
            .collect();
        assert_eq!(
            v[0],
            json!({"seq": 0, "cause": "started", "late": false, "status": "focus",
                   "ended": null, "phase": null, "of": null})
        );
        assert_eq!(
            v[1],
            json!({"seq": 0, "cause": "ended", "late": true, "status": "completed",
                   "ended": {"kind": "focus", "n": 1, "durationS": 300},
                   "phase": null, "of": null})
        );
    }

    #[test]
    fn temporizadores_em_camel_case() {
        use tomatito_core::{FakeCountdownEffects, Timers};
        let mut fx = FakeCountdownEffects::new();
        let mut timers = Timers::with_defaults();
        let t0 = EpochMs(1_000_000);
        timers.start(t0, 1, &mut fx).unwrap();
        let v =
            serde_json::to_value(TimersDto::from(&timers.snapshot(t0.plus_ms(72_000)))).unwrap();
        assert_eq!(v["seq"], 0);
        assert_eq!(v["at"], 1_072_000);
        assert_eq!(
            v["timers"][0],
            json!({"id": 1, "name": "", "durationMs": 60_000, "status": "running",
                   "endsAt": 1_060_000, "remainingMs": -12_000, "ended": false, "overdue": true})
        );
        assert_eq!(v["timers"][1]["status"], "idle");
        assert_eq!(v["timers"][1]["endsAt"], json!(null));
        assert_eq!(v["timers"][1]["overdue"], false);
        assert_eq!(v["timers"].as_array().unwrap().len(), 4);
    }

    #[test]
    fn cronometro_em_camel_case() {
        use tomatito_core::Stopwatch;
        let mut c = Stopwatch::new();
        let t0 = EpochMs(1_000_000);
        c.start(t0).unwrap();
        c.lap(t0.plus_ms(1_870)).unwrap();
        let v = serde_json::to_value(StopwatchDto::from(&c.snapshot(t0.plus_ms(2_000)))).unwrap();
        assert_eq!(
            v,
            json!({"seq": 0, "at": 1_002_000, "status": "running", "startedAt": 1_000_000,
                   "accumulatedMs": 0, "elapsedMs": 2_000, "laps": [1_870]})
        );
        c.pause(t0.plus_ms(2_000)).unwrap();
        let v = serde_json::to_value(StopwatchDto::from(&c.snapshot(t0.plus_ms(9_000)))).unwrap();
        assert_eq!(v["status"], "paused");
        assert_eq!(v["startedAt"], json!(null));
        assert_eq!(v["elapsedMs"], 2_000);
    }

    #[test]
    fn preparo_da_sessao_em_camel_case() {
        let dto = SetupDto {
            min_minutes: 5,
            max_minutes: 240,
            step_minutes: 5,
            focus_minutes: 25,
            break_minutes: 5,
        };
        assert_eq!(
            serde_json::to_value(dto).unwrap(),
            json!({
                "minMinutes": 5,
                "maxMinutes": 240,
                "stepMinutes": 5,
                "focusMinutes": 25,
                "breakMinutes": 5,
            })
        );
    }
}
