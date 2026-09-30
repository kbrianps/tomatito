//! O `state.json` (PLANO.md, 3.3), a parte sem arquivo (PLANO-WEB, 3.3): o
//! formato ([`StateFile`] e as partes), a [`SCHEMA_VERSION`] e as conversões
//! entre os retratos do motor (`events`), o arquivo e os registros do
//! núcleo ([`Restored`]). O desktop (`src-tauri/src/state_file.rs`) guarda o
//! nome do arquivo, a carga ao abrir e a gravação atômica; a web guarda no
//! navegador.
//!
//! Cada temporizador é gravado com o que basta para retomar do ponto certo
//! depois de fechado: correndo, o prazo (`endsAt`, em ms UTC), que continua
//! valendo com o app fechado; pausado, o que faltava (`remainingMs`, negativo
//! depois do zero); parado, só a duração.
//!
//! O cronômetro (M34) é gravado como `started_at` mais o acumulado: correndo,
//! o `startedAt` (ms UTC) continua valendo com o app fechado, e o decorrido
//! ao reabrir é `accumulatedMs + (agora − startedAt)`; pausado, só o
//! acumulado. As voltas vão junto (o decorrido total em cada uma).
//!
//! A sessão de foco (M40) vai com o pedido (T, F, B, "pular intervalos" e a
//! tarefa), o índice e o início da fase atual, o foco já feito e, conforme o
//! estado, o prazo (correndo), o que faltava (pausada) ou a hora da
//! conclusão. O `lastSessionId` fica mesmo sem sessão, para o id da próxima
//! não repetir o de uma já gravada no `periods` (M15, item 15).

use serde::{Deserialize, Serialize};
use tomatito_core::{
    EpochMs, PlanSettings, RunRecord, SessionConfig, SessionRecord, StopwatchRecord,
    StopwatchStatus, TimerRecord, TimerRunRecord,
};

use crate::events::{FocusDto, StatusDto, StopwatchDto, StopwatchStatusDto, TimerStatusDto};

/// A versão do formato. Sobe quando um campo muda de sentido; o M40 lê só
/// esta e ignora o arquivo de outra.
pub const SCHEMA_VERSION: u32 = 1;

/// M40: como estava a fase atual da sessão guardada.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SavedRunStatus {
    Running,
    Paused,
    Completed,
}

/// M40: a sessão de foco como fica no arquivo.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedSession {
    pub id: i64,
    /// T, em minutos.
    pub minutes: u32,
    pub focus_minutes: u32,
    pub break_minutes: u32,
    pub skip_breaks: bool,
    #[serde(default)]
    pub task_id: Option<i64>,
    pub started_at: i64,
    pub phase_index: u32,
    pub phase_started_at: i64,
    pub status: SavedRunStatus,
    /// O prazo, só correndo.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ends_at: Option<i64>,
    /// O que faltava, só pausada.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub remaining_ms: Option<u64>,
    /// Só concluída.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub completed_at: Option<i64>,
    pub focus_s: u64,
}

impl SavedSession {
    pub fn from_dto(dto: &FocusDto) -> Option<Self> {
        let s = dto.session.as_ref()?;
        let status = match dto.status {
            StatusDto::Idle => return None,
            StatusDto::Focus | StatusDto::Break => SavedRunStatus::Running,
            StatusDto::Paused => SavedRunStatus::Paused,
            StatusDto::Completed => SavedRunStatus::Completed,
        };
        Some(Self {
            id: s.id,
            minutes: s.minutes,
            focus_minutes: s.focus_minutes,
            break_minutes: s.break_minutes,
            skip_breaks: s.skip_breaks,
            task_id: s.task_id,
            started_at: s.started_at,
            phase_index: s.phase_index,
            phase_started_at: s.phase_started_at,
            status,
            ends_at: s.ends_at.filter(|_| status == SavedRunStatus::Running),
            remaining_ms: (status == SavedRunStatus::Paused).then_some(s.remaining_ms),
            completed_at: s
                .completed_at
                .filter(|_| status == SavedRunStatus::Completed),
            focus_s: s.focus_s,
        })
    }

    /// O registro do núcleo; `None` se falta o campo do estado (o prazo de
    /// uma sessão correndo, por exemplo).
    pub fn record(&self) -> Option<SessionRecord> {
        let run = match self.status {
            SavedRunStatus::Running => RunRecord::Running {
                ends_at: EpochMs(self.ends_at?),
            },
            SavedRunStatus::Paused => RunRecord::Paused {
                remaining_ms: self.remaining_ms?,
            },
            SavedRunStatus::Completed => RunRecord::Completed {
                at: EpochMs(self.completed_at?),
            },
        };
        Some(SessionRecord {
            id: self.id,
            config: SessionConfig {
                minutes: self.minutes,
                settings: PlanSettings {
                    focus_minutes: self.focus_minutes,
                    break_minutes: self.break_minutes,
                },
                skip_breaks: self.skip_breaks,
                task_id: self.task_id,
            },
            started_at: EpochMs(self.started_at),
            phase_index: self.phase_index,
            phase_started_at: EpochMs(self.phase_started_at),
            run,
            focus_s: self.focus_s,
        })
    }
}

/// M40: o foco no arquivo: a sessão (`null` no ocioso) e o id da última.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedFocus {
    pub last_session_id: i64,
    #[serde(default)]
    pub session: Option<SavedSession>,
}

impl SavedFocus {
    /// `anterior` é o `lastSessionId` já guardado: o retrato não o leva, e no
    /// ocioso ele não pode voltar a 0.
    pub fn from_dto(dto: &FocusDto, anterior: i64) -> Self {
        let session = SavedSession::from_dto(dto);
        Self {
            last_session_id: session.as_ref().map_or(anterior, |s| anterior.max(s.id)),
            session,
        }
    }
}

/// Um temporizador como fica no arquivo.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedTimer {
    pub id: u64,
    pub name: String,
    pub duration_ms: u64,
    pub status: TimerStatusDto,
    /// O prazo, só correndo.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ends_at: Option<i64>,
    /// O que falta, só pausado (negativo depois do zero).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub remaining_ms: Option<i64>,
    /// O fim já disparou: reabrir não toca o som de novo.
    pub ended: bool,
}

impl SavedTimer {
    pub fn from_dto(t: &crate::events::TimerDto) -> Self {
        Self {
            id: t.id,
            name: t.name.clone(),
            duration_ms: t.duration_ms,
            status: t.status,
            ends_at: match t.status {
                TimerStatusDto::Running => t.ends_at,
                _ => None,
            },
            remaining_ms: match t.status {
                TimerStatusDto::Paused => Some(t.remaining_ms),
                _ => None,
            },
            ended: t.ended,
        }
    }

    /// M40: o registro do núcleo; `None` se falta o campo do estado.
    pub fn record(&self) -> Option<TimerRecord> {
        let run = match self.status {
            TimerStatusDto::Idle => TimerRunRecord::Idle,
            TimerStatusDto::Running => TimerRunRecord::Running {
                ends_at: EpochMs(self.ends_at?),
            },
            TimerStatusDto::Paused => TimerRunRecord::Paused {
                remaining_ms: self.remaining_ms?,
            },
        };
        Some(TimerRecord {
            id: self.id,
            name: self.name.clone(),
            duration_ms: self.duration_ms,
            run,
            ended: self.ended,
        })
    }
}

/// O cronômetro como fica no arquivo (M34).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedStopwatch {
    pub status: StopwatchStatusDto,
    /// O começo do trecho atual, só correndo.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub started_at: Option<i64>,
    /// Os trechos já fechados.
    pub accumulated_ms: u64,
    /// O decorrido total em cada volta.
    pub laps: Vec<u64>,
}

impl From<&StopwatchDto> for SavedStopwatch {
    fn from(c: &StopwatchDto) -> Self {
        Self {
            status: c.status,
            started_at: c.started_at,
            accumulated_ms: c.accumulated_ms,
            laps: c.laps.clone(),
        }
    }
}

impl SavedStopwatch {
    /// M40: o registro do núcleo (o núcleo confere a coerência).
    pub fn record(&self) -> StopwatchRecord {
        StopwatchRecord {
            status: match self.status {
                StopwatchStatusDto::Idle => StopwatchStatus::Idle,
                StopwatchStatusDto::Running => StopwatchStatus::Running,
                StopwatchStatusDto::Paused => StopwatchStatus::Paused,
            },
            started_at: self.started_at.map(EpochMs),
            accumulated_ms: self.accumulated_ms,
            laps: self.laps.clone(),
        }
    }
}

/// O conteúdo do `state.json`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StateFile {
    pub schema_version: u32,
    /// Quando foi gravado, em ms UTC.
    pub saved_at: i64,
    /// M40: ausente até a primeira transição do foco (ou o primeiro
    /// `save_all`).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub focus: Option<SavedFocus>,
    /// A lista inteira, na ordem dos cards. Ausente até a primeira transição
    /// dos temporizadores neste processo.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timers: Option<Vec<SavedTimer>>,
    /// M34: ausente até a primeira transição do cronômetro neste processo.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stopwatch: Option<SavedStopwatch>,
}

impl Default for StateFile {
    fn default() -> Self {
        Self {
            schema_version: SCHEMA_VERSION,
            saved_at: 0,
            focus: None,
            timers: None,
            stopwatch: None,
        }
    }
}

/// M40: o que o arquivo trouxe ao abrir, no formato do núcleo. Cada parte é
/// `None` quando ausente ou ilegível: o motor fica com o padrão dela.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Restored {
    /// O `lastSessionId` e a sessão (`None` dentro: ocioso).
    pub focus: Option<(i64, Option<SessionRecord>)>,
    /// A lista inteira, na ordem do arquivo (pode ser vazia).
    pub timers: Option<Vec<TimerRecord>>,
    pub stopwatch: Option<StopwatchRecord>,
}
