//! Máquina de estados da sessão de foco (PLANO.md, 3.2).
//!
//! Estados, na linguagem do plano: Ocioso, Foco{n}, Intervalo{n}, Pausado e
//! Concluído ([`Status`]). A sessão segue as fases do [`Plan`] (foco 1,
//! intervalo 1, foco 2, ..., foco final).
//!
//! **Prazo em relógio de parede.** A fase que corre guarda o prazo
//! (`ends_at`, em [`EpochMs`]); pausar guarda o que falta (`remaining_ms`), e
//! retomar faz `ends_at = agora + remaining`. Nenhum método lê o relógio: todos
//! recebem o `now` de quem chama (o laço e os comandos do app, M16), e os
//! testes passam o `now` de um `FakeClock`.
//!
//! **Recuperação.** [`Focus::advance_to`] percorre **todas** as fases vencidas
//! até `now`, em ordem, e grava cada uma com o próprio prazo como fim. Uma
//! sessão de 60 min com 2 h de suspensão termina Concluída, com 2 focos e 1
//! intervalo gravados.
//!
//! **Atraso.** Um `advance_to` que fecha fases dá **um** aviso só, sobre a
//! última fase vencida. Se ela venceu há mais de [`LATE_AFTER_MS`] (60 s), o
//! aviso é [`Notice::Late`] e não há som; até 60 s, é o fim normal, com som. As
//! fases anteriores a ela (mais antigas ainda) são gravadas em silêncio.
//!
//! **Comandos.** Iniciar, pausar, retomar, pular e parar rodam o `advance_to`
//! antes: um comando que chega depois de um prazo vencido (o laço ainda não
//! passou) primeiro fecha as fases vencidas e depois age sobre o estado certo.
//!
//! **Relógio para trás** (mudado à mão ou pelo NTP; aceito na v1): nada vence,
//! e o tempo restante nunca passa da duração da fase.

use std::fmt;

use crate::clock::EpochMs;
use crate::effects::{ChangeCause, Effects, Notice, Period, PhaseChange, Sound};
use crate::plan::{Phase, PhaseKind, Plan, PlanError, PlanSettings};

/// Até quanto tempo depois do prazo um fim de fase ainda é "normal", com som
/// e o aviso da fase (PLANO.md, 3.2: "Até 60 s de atraso, o fim é tratado como
/// normal").
pub const LATE_AFTER_MS: u64 = 60_000;

/// O pedido de `focus_start{minutes, skip_breaks, task_id}` (3.5), mais F e B
/// das configurações no momento do início. A sessão guarda uma cópia: mudar F
/// ou B nas configurações não mexe numa sessão em andamento.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SessionConfig {
    /// T, em minutos.
    pub minutes: u32,
    /// F e B.
    pub settings: PlanSettings,
    /// "Pular intervalos": um bloco único de T.
    pub skip_breaks: bool,
    /// A tarefa escolhida no card "Tarefas" (M30), gravada em cada período.
    pub task_id: Option<i64>,
}

impl SessionConfig {
    /// Uma sessão de `minutes`, com F e B padrão (25 e 5), com intervalos e
    /// sem tarefa.
    pub fn new(minutes: u32) -> Self {
        Self {
            minutes,
            settings: PlanSettings::DEFAULT,
            skip_breaks: false,
            task_id: None,
        }
    }
}

/// Os estados do plano. `n` numera a fase entre as do mesmo tipo, a partir de
/// 1 (o "1" de "Período de foco (1 de 2)").
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Status {
    /// Ocioso: nenhuma sessão.
    Idle,
    /// Foco{n}: um período de foco correndo.
    Focus { n: u32 },
    /// Intervalo{n}: um intervalo correndo.
    Break { n: u32 },
    /// Pausado, no meio da fase `kind` `n`.
    Paused { kind: PhaseKind, n: u32 },
    /// Concluído: a última fase venceu ou foi pulada. A tela trata como
    /// ocioso (M19); iniciar começa outra sessão.
    Completed,
}

/// Comando que não cabe no estado atual. Nenhum efeito é pedido quando o
/// comando é recusado (além dos fins de fase que o `advance_to` do começo do
/// comando tenha fechado). Os textos são para o registro do app.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FocusError {
    /// Iniciar com uma sessão correndo ou pausada.
    AlreadyActive,
    /// Pausar sem uma fase correndo.
    NotRunning,
    /// Retomar sem estar pausado.
    NotPaused,
    /// Pular ou parar sem sessão correndo nem pausada.
    NoSession,
    /// O plano da sessão foi recusado (T, F ou B iguais a zero).
    Plan(PlanError),
}

impl fmt::Display for FocusError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::AlreadyActive => f.write_str("já existe uma sessão de foco em andamento"),
            Self::NotRunning => f.write_str("não há fase correndo para pausar"),
            Self::NotPaused => f.write_str("a sessão não está pausada"),
            Self::NoSession => f.write_str("não há sessão de foco em andamento"),
            Self::Plan(erro) => write!(f, "plano da sessão recusado: {erro}"),
        }
    }
}

impl std::error::Error for FocusError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Plan(erro) => Some(erro),
            _ => None,
        }
    }
}

impl From<PlanError> for FocusError {
    fn from(erro: PlanError) -> Self {
        Self::Plan(erro)
    }
}

/// Retrato do foco num instante: o que `get_state` e `tt://state` levam para
/// as janelas (M16).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FocusSnapshot {
    pub status: Status,
    /// O instante do retrato (o `now` de quem pediu).
    pub at: EpochMs,
    /// `None` só no estado ocioso.
    pub session: Option<SessionSnapshot>,
}

/// A sessão no retrato. Em Concluído, a fase é a última, e o restante é 0.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SessionSnapshot {
    pub id: i64,
    pub config: SessionConfig,
    pub started_at: EpochMs,
    /// Quantos períodos de foco a sessão tem.
    pub blocks: u32,
    /// Quantos intervalos.
    pub intervals: u32,
    /// Índice da fase atual no plano, a partir de 0.
    pub phase_index: u32,
    pub phase: Phase,
    pub phase_started_at: EpochMs,
    /// O prazo da fase, só enquanto ela corre (nem pausada, nem concluída).
    pub ends_at: Option<EpochMs>,
    /// Quanto falta da fase em `at`, sem passar da duração dela.
    pub remaining_ms: u64,
    /// A fase seguinte ("A seguir: intervalo de 5 min"); `None` na última e
    /// em Concluído.
    pub next: Option<Phase>,
    /// Foco já feito nesta sessão, somando os períodos de foco fechados.
    pub focus_s: u64,
    /// Quando a sessão terminou, em Concluído.
    pub completed_at: Option<EpochMs>,
}

/// Como está a fase atual da sessão.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Run {
    Running { ends_at: EpochMs },
    Paused { remaining_ms: u64 },
    Completed { at: EpochMs },
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct Session {
    id: i64,
    config: SessionConfig,
    plan: Plan,
    started_at: EpochMs,
    /// Índice da fase atual; em Concluído, o da última.
    index: u32,
    phase_started_at: EpochMs,
    run: Run,
    focus_s: u64,
}

fn duration_ms(phase: Phase) -> u64 {
    phase.duration_s.saturating_mul(1000)
}

impl Session {
    fn phase(&self) -> Phase {
        self.plan
            .phase(self.index)
            .expect("o índice da fase fica dentro do plano")
    }

    fn next(&self) -> Option<Phase> {
        self.plan.phase(self.index + 1)
    }

    fn is_completed(&self) -> bool {
        matches!(self.run, Run::Completed { .. })
    }

    fn status(&self) -> Status {
        let Phase { kind, n, .. } = self.phase();
        match self.run {
            Run::Running { .. } => match kind {
                PhaseKind::Focus => Status::Focus { n },
                PhaseKind::Break => Status::Break { n },
            },
            Run::Paused { .. } => Status::Paused { kind, n },
            Run::Completed { .. } => Status::Completed,
        }
    }

    /// Quanto falta da fase atual em `now`. Com o relógio para trás, o prazo
    /// pode ficar mais longe que a duração da fase; o restante para nela.
    fn remaining_ms(&self, now: EpochMs) -> u64 {
        match self.run {
            Run::Running { ends_at } => {
                ends_at.ms_since_or_zero(now).min(duration_ms(self.phase()))
            }
            Run::Paused { remaining_ms } => remaining_ms,
            Run::Completed { .. } => 0,
        }
    }

    /// Quanto da fase atual já correu, sem as pausas.
    fn elapsed_ms(&self, now: EpochMs) -> u64 {
        duration_ms(self.phase()) - self.remaining_ms(now)
    }

    /// Fecha a fase atual (grava o período e soma o foco), sem trocar de fase.
    fn close(&mut self, ended_at: EpochMs, actual_s: u64, completed: bool, fx: &mut dyn Effects) {
        let phase = self.phase();
        if phase.kind == PhaseKind::Focus {
            self.focus_s += actual_s;
        }
        fx.record_period(&Period {
            session_id: self.id,
            kind: phase.kind,
            n: phase.n,
            started_at: self.phase_started_at,
            ended_at,
            planned_s: phase.duration_s,
            actual_s,
            completed,
            task_id: self.config.task_id,
        });
    }

    /// Começa a fase seguinte em `at`, correndo. Sem fase seguinte, a sessão
    /// fica Concluída em `at`.
    fn begin_next(&mut self, at: EpochMs) {
        match self.next() {
            Some(next) => {
                self.index += 1;
                self.phase_started_at = at;
                self.run = Run::Running {
                    ends_at: at.plus_ms(duration_ms(next)),
                };
            }
            None => self.run = Run::Completed { at },
        }
    }

    /// O aviso de um fim de fase no horário, depois do `begin_next`.
    fn notice_after(&self, ended: Phase) -> Notice {
        let blocks = self.plan.blocks();
        if self.is_completed() {
            return Notice::SessionCompleted {
                total_minutes: self.config.minutes,
                focus_s: self.focus_s,
            };
        }
        let current = self.phase();
        match ended.kind {
            PhaseKind::Focus => Notice::FocusEnded {
                n: ended.n,
                blocks,
                break_s: current.duration_s,
                next_focus_at: self.phase_started_at.plus_ms(duration_ms(current)),
            },
            PhaseKind::Break => Notice::BreakEnded {
                next_n: current.n,
                blocks,
                next_focus_s: current.duration_s,
            },
        }
    }

    fn snapshot(&self, now: EpochMs) -> SessionSnapshot {
        SessionSnapshot {
            id: self.id,
            config: self.config,
            started_at: self.started_at,
            blocks: self.plan.blocks(),
            intervals: self.plan.intervals(),
            phase_index: self.index,
            phase: self.phase(),
            phase_started_at: self.phase_started_at,
            ends_at: match self.run {
                Run::Running { ends_at } => Some(ends_at),
                _ => None,
            },
            remaining_ms: self.remaining_ms(now),
            next: if self.is_completed() {
                None
            } else {
                self.next()
            },
            focus_s: self.focus_s,
            completed_at: match self.run {
                Run::Completed { at } => Some(at),
                _ => None,
            },
        }
    }
}

/// A sessão de foco: no máximo uma por vez.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Focus {
    session: Option<Session>,
    last_session_id: i64,
    late_after_ms: u64,
}

impl Default for Focus {
    fn default() -> Self {
        Self::new()
    }
}

impl Focus {
    /// Ocioso, com a regra de atraso de 60 s.
    pub fn new() -> Self {
        Self {
            session: None,
            last_session_id: 0,
            late_after_ms: LATE_AFTER_MS,
        }
    }

    /// Troca o limite do atraso. Serve ao modo acelerado (M16): com
    /// `TOMATITO_SPEED=240` ou mais, o intervalo de 250 ms do laço passa de
    /// 60 s no relógio acelerado, e todo fim de fase sairia "atrasado".
    #[must_use]
    pub fn with_late_after_ms(mut self, ms: u64) -> Self {
        self.late_after_ms = ms;
        self
    }

    pub fn late_after_ms(&self) -> u64 {
        self.late_after_ms
    }

    pub fn status(&self) -> Status {
        self.session.as_ref().map_or(Status::Idle, Session::status)
    }

    /// O prazo da fase que corre; `None` se nada corre (ocioso, pausado ou
    /// concluído). Com `None`, o laço do app pode dormir até o próximo
    /// comando (3.2).
    pub fn deadline(&self) -> Option<EpochMs> {
        match self.session.as_ref()?.run {
            Run::Running { ends_at } => Some(ends_at),
            _ => None,
        }
    }

    pub fn is_running(&self) -> bool {
        self.deadline().is_some()
    }

    pub fn snapshot(&self, now: EpochMs) -> FocusSnapshot {
        FocusSnapshot {
            status: self.status(),
            at: now,
            session: self.session.as_ref().map(|s| s.snapshot(now)),
        }
    }

    /// Fecha todas as fases vencidas até `now`, em ordem, e devolve quantas
    /// foram. Sem fase vencida, não pede nenhum efeito. Chamar de novo com o
    /// mesmo `now` não faz nada.
    ///
    /// Efeitos: um `record_period` por fase vencida (com o prazo como fim),
    /// depois um `state_changed`, um `phase_changed`, o som (só se a última
    /// fase vencida venceu há até [`Self::late_after_ms`]) e um aviso só.
    pub fn advance_to(&mut self, now: EpochMs, fx: &mut dyn Effects) -> u32 {
        let Some(s) = self.session.as_mut() else {
            return 0;
        };
        let mut count = 0;
        let mut last = None;
        while let Run::Running { ends_at } = s.run {
            if now < ends_at {
                break;
            }
            let phase = s.phase();
            s.close(ends_at, phase.duration_s, true, fx);
            s.begin_next(ends_at);
            count += 1;
            last = Some((phase, ends_at));
        }
        let Some((ended, ended_at)) = last else {
            return 0;
        };

        let late = now.ms_since_or_zero(ended_at) > self.late_after_ms;
        let notice = if late {
            Notice::Late {
                ended,
                ended_at,
                session_completed: s.is_completed(),
            }
        } else {
            s.notice_after(ended)
        };

        let snapshot = self.snapshot(now);
        fx.state_changed(&snapshot);
        fx.phase_changed(&PhaseChange {
            cause: ChangeCause::Ended { late },
            status: snapshot.status,
            ended: Some(ended),
        });
        if !late {
            fx.play_sound(match ended.kind {
                PhaseKind::Focus => Sound::FocusEnd,
                PhaseKind::Break => Sound::BreakEnd,
            });
        }
        fx.notify(notice);
        count
    }

    /// Inicia uma sessão (`focus_start`). Vale no estado ocioso e em
    /// Concluído. O id da sessão é o `now` em ms, ou o anterior + 1 se o
    /// relógio não andou (ou andou para trás).
    pub fn start(
        &mut self,
        now: EpochMs,
        config: SessionConfig,
        fx: &mut dyn Effects,
    ) -> Result<(), FocusError> {
        self.advance_to(now, fx);
        if self.session.as_ref().is_some_and(|s| !s.is_completed()) {
            return Err(FocusError::AlreadyActive);
        }
        let plan = Plan::new(config.minutes, config.settings, config.skip_breaks)?;
        let first = plan.phase(0).expect("todo plano tem ao menos um foco");
        let id = now.0.max(self.last_session_id.saturating_add(1));
        self.last_session_id = id;
        self.session = Some(Session {
            id,
            config,
            plan,
            started_at: now,
            index: 0,
            phase_started_at: now,
            run: Run::Running {
                ends_at: now.plus_ms(duration_ms(first)),
            },
            focus_s: 0,
        });
        self.announce(now, ChangeCause::Started, None, fx);
        Ok(())
    }

    /// Pausa a fase que corre (`focus_pause`), guardando o que falta.
    pub fn pause(&mut self, now: EpochMs, fx: &mut dyn Effects) -> Result<(), FocusError> {
        self.advance_to(now, fx);
        let s = self.session.as_mut().ok_or(FocusError::NotRunning)?;
        if !matches!(s.run, Run::Running { .. }) {
            return Err(FocusError::NotRunning);
        }
        let remaining_ms = s.remaining_ms(now);
        s.run = Run::Paused { remaining_ms };
        fx.state_changed(&self.snapshot(now));
        Ok(())
    }

    /// Retoma a fase pausada (`focus_resume`): o prazo vira agora + o que
    /// faltava.
    pub fn resume(&mut self, now: EpochMs, fx: &mut dyn Effects) -> Result<(), FocusError> {
        self.advance_to(now, fx);
        let s = self.session.as_mut().ok_or(FocusError::NotPaused)?;
        let Run::Paused { remaining_ms } = s.run else {
            return Err(FocusError::NotPaused);
        };
        s.run = Run::Running {
            ends_at: now.plus_ms(remaining_ms),
        };
        fx.state_changed(&self.snapshot(now));
        Ok(())
    }

    /// Pula a fase atual (`focus_skip`): no foco, "Pular para o intervalo";
    /// no intervalo, "Pular intervalo". A fase é gravada como interrompida, com
    /// o tempo que correu, e a seguinte começa agora, correndo (também quando a
    /// pulada estava pausada). Pular o último foco conclui a sessão. Sem som e
    /// sem aviso: foi o usuário que pediu.
    pub fn skip(&mut self, now: EpochMs, fx: &mut dyn Effects) -> Result<(), FocusError> {
        self.advance_to(now, fx);
        let s = self
            .session
            .as_mut()
            .filter(|s| !s.is_completed())
            .ok_or(FocusError::NoSession)?;
        let ended = s.phase();
        let actual_s = s.elapsed_ms(now) / 1000;
        s.close(now, actual_s, false, fx);
        s.begin_next(now);
        self.announce(now, ChangeCause::Skipped, Some(ended), fx);
        Ok(())
    }

    /// Encerra a sessão (`focus_stop`, "Encerrar sessão" e Sair): grava a fase
    /// atual como interrompida, com o tempo que correu, e volta ao ocioso.
    pub fn stop(&mut self, now: EpochMs, fx: &mut dyn Effects) -> Result<(), FocusError> {
        self.advance_to(now, fx);
        let s = self
            .session
            .as_mut()
            .filter(|s| !s.is_completed())
            .ok_or(FocusError::NoSession)?;
        let ended = s.phase();
        let actual_s = s.elapsed_ms(now) / 1000;
        s.close(now, actual_s, false, fx);
        self.session = None;
        self.announce(now, ChangeCause::Stopped, Some(ended), fx);
        Ok(())
    }

    /// `state_changed` e `phase_changed` de uma troca de fase pedida pelo
    /// usuário.
    fn announce(
        &self,
        now: EpochMs,
        cause: ChangeCause,
        ended: Option<Phase>,
        fx: &mut dyn Effects,
    ) {
        let snapshot = self.snapshot(now);
        fx.state_changed(&snapshot);
        fx.phase_changed(&PhaseChange {
            cause,
            status: snapshot.status,
            ended,
        });
    }
}
