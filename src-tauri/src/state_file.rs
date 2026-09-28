//! O `state.json` (PLANO.md, 3.3): o que está em andamento, para sobreviver a
//! fechar e reabrir o app.
//!
//! - guarda os temporizadores (desde o M33), o cronômetro (M34) e a sessão de
//!   foco (M40);
//! - é gravado a cada transição (criar, editar, excluir, iniciar, pausar,
//!   redefinir e o fim de um temporizador; iniciar, pausar, volta e redefinir
//!   do cronômetro; cada `tt://state` do foco), nunca a cada tick;
//! - a gravação é atômica, pelo `persist.rs`;
//! - leva `schemaVersion`.
//!
//! **Carregar ao abrir (M40).** O [`StateStore::load`] lê o arquivo antes do
//! motor e entrega as partes no formato do núcleo ([`Restored`]); o motor as
//! devolve às máquinas e roda o `advance_to(now)` (`Engine::restaurar`). Cada
//! parte vale sozinha: ausente ou ilegível, fica o padrão dela (a sessão
//! ociosa, os temporizadores de 1, 3, 5 e 10 min, o cronômetro zerado), e as
//! outras entram. Um arquivo que não abre como objeto JSON é guardado como
//! `state.corrompido.json` (a regra do `settings.json`); uma `schemaVersion`
//! desconhecida é ignorada inteira.
//!
//! As partes ficam guardadas aqui em memória, para a gravação de uma (os
//! temporizadores) não apagar as outras (o cronômetro e o foco).
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

use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard, PoisonError};

use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use tomatito_core::{
    EpochMs, PlanSettings, RunRecord, SessionConfig, SessionRecord, StopwatchRecord,
    StopwatchStatus, TimerRecord, TimerRunRecord,
};

use crate::events::{
    FocusDto, StateDto, StatusDto, StopwatchDto, StopwatchStatusDto, TimerStatusDto, TimersDto,
};

/// O nome do arquivo, na pasta de dados do app.
pub const FILE: &str = "state.json";

/// M40: onde fica o original de um `state.json` ilegível.
pub const CORRUPTED_FILE: &str = "state.corrompido.json";

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
    fn from_dto(dto: &FocusDto) -> Option<Self> {
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
    fn record(&self) -> Option<SessionRecord> {
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
    fn from_dto(dto: &FocusDto, anterior: i64) -> Self {
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
    fn from_dto(t: &crate::events::TimerDto) -> Self {
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
    fn record(&self) -> Option<TimerRecord> {
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
    fn record(&self) -> StopwatchRecord {
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

/// Lê a parte `chave` do objeto; ilegível, registra e devolve `None`.
fn parte<T: DeserializeOwned>(objeto: &Map<String, Value>, chave: &str) -> Option<T> {
    let v = objeto.get(chave)?;
    match T::deserialize(v) {
        Ok(t) => Some(t),
        Err(e) => {
            eprintln!("[tomatito] state.json: \"{chave}\" ilegível ({e}); fica o padrão");
            None
        }
    }
}

/// O dono do `state.json` no processo.
pub struct StateStore {
    arquivo: PathBuf,
    atual: Mutex<StateFile>,
}

impl StateStore {
    /// `pasta` é a pasta de dados do app (a mesma do `settings.json`).
    pub fn new(pasta: &Path) -> Self {
        Self {
            arquivo: pasta.join(FILE),
            atual: Mutex::new(StateFile::default()),
        }
    }

    #[cfg(test)]
    pub fn path(&self) -> &Path {
        &self.arquivo
    }

    fn lock(&self) -> MutexGuard<'_, StateFile> {
        self.atual.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// M40: lê o arquivo ao abrir, antes do motor. As partes lidas também
    /// ficam na memória (a próxima gravação de uma não apaga as outras, e o
    /// `lastSessionId` continua mesmo sem sessão). Nada é gravado aqui.
    pub fn load(&self) -> Restored {
        let bytes = match fs::read(&self.arquivo) {
            Ok(b) => b,
            Err(e) if e.kind() == io::ErrorKind::NotFound => return Restored::default(),
            Err(e) => {
                eprintln!(
                    "[tomatito] state.json: não deu para ler {}: {e}",
                    self.arquivo.display()
                );
                return Restored::default();
            }
        };
        let objeto = match serde_json::from_slice::<Value>(&bytes) {
            Ok(Value::Object(m)) => m,
            outro => {
                let motivo = match outro {
                    Err(e) => e.to_string(),
                    Ok(_) => "não é um objeto JSON".to_owned(),
                };
                let guarda = self.arquivo.with_file_name(CORRUPTED_FILE);
                match fs::rename(&self.arquivo, &guarda) {
                    Ok(()) => eprintln!(
                        "[tomatito] state.json ilegível ({motivo}); abrindo sem ele, e o original ficou em {}",
                        guarda.display()
                    ),
                    Err(e) => eprintln!(
                        "[tomatito] state.json ilegível ({motivo}); abrindo sem ele (não deu para guardar o original: {e})"
                    ),
                }
                return Restored::default();
            }
        };
        let versao = objeto.get("schemaVersion").and_then(Value::as_u64);
        if versao != Some(u64::from(SCHEMA_VERSION)) {
            eprintln!(
                "[tomatito] state.json na versão {versao:?}, que este app não lê; abrindo sem ele"
            );
            return Restored::default();
        }
        let focus: Option<SavedFocus> = parte(&objeto, "focus");
        let timers: Option<Vec<SavedTimer>> = parte(&objeto, "timers");
        let stopwatch: Option<SavedStopwatch> = parte(&objeto, "stopwatch");
        {
            let mut g = self.lock();
            g.saved_at = objeto.get("savedAt").and_then(Value::as_i64).unwrap_or(0);
            g.focus.clone_from(&focus);
            g.timers.clone_from(&timers);
            g.stopwatch.clone_from(&stopwatch);
        }
        let sessao = |f: &SavedFocus| {
            let s = f.session.as_ref()?;
            let r = s.record();
            if r.is_none() {
                eprintln!(
                    "[tomatito] state.json: sessão {} sem o campo do estado; fica ociosa",
                    s.id
                );
            }
            r
        };
        Restored {
            focus: focus.as_ref().map(|f| (f.last_session_id, sessao(f))),
            timers: timers.map(|lista| {
                lista
                    .iter()
                    .filter_map(|t| {
                        let r = t.record();
                        if r.is_none() {
                            eprintln!(
                                "[tomatito] state.json: temporizador {} sem o campo do estado; fica de fora",
                                t.id
                            );
                        }
                        r
                    })
                    .collect()
            }),
            stopwatch: stopwatch.as_ref().map(SavedStopwatch::record),
        }
    }

    /// Troca a lista de temporizadores pelo retrato `dto` e grava o arquivo.
    /// Uma falha de disco vai para o registro e não interrompe o motor.
    pub fn save_timers(&self, dto: &TimersDto) {
        let mut g = self.lock();
        g.saved_at = dto.at;
        g.timers = Some(dto.timers.iter().map(SavedTimer::from_dto).collect());
        self.gravar(&g);
    }

    /// M34: troca o cronômetro pelo retrato `dto` e grava o arquivo, sem
    /// mexer nos temporizadores.
    pub fn save_stopwatch(&self, dto: &StopwatchDto) {
        let mut g = self.lock();
        g.saved_at = dto.at;
        g.stopwatch = Some(dto.into());
        self.gravar(&g);
    }

    /// M40: troca a sessão de foco pelo retrato `dto` (cada `tt://state`) e
    /// grava o arquivo, sem mexer nas outras partes.
    pub fn save_focus(&self, dto: &FocusDto) {
        let mut g = self.lock();
        g.saved_at = dto.at;
        let anterior = g.focus.as_ref().map_or(0, |f| f.last_session_id);
        g.focus = Some(SavedFocus::from_dto(dto, anterior));
        self.gravar(&g);
    }

    /// M40: as três partes de uma vez, numa gravação só: ao abrir, depois da
    /// retomada (o arquivo passa a ser o que o motor tem), e no "Sair" (M37).
    pub fn save_all(&self, estado: &StateDto) {
        let mut g = self.lock();
        g.saved_at = estado.focus.at;
        let anterior = g.focus.as_ref().map_or(0, |f| f.last_session_id);
        g.focus = Some(SavedFocus::from_dto(&estado.focus, anterior));
        g.timers = Some(
            estado
                .timers
                .timers
                .iter()
                .map(SavedTimer::from_dto)
                .collect(),
        );
        g.stopwatch = Some((&estado.stopwatch).into());
        self.gravar(&g);
    }

    fn gravar(&self, conteudo: &StateFile) {
        if let Err(e) = crate::persist::write_json_atomic(&self.arquivo, conteudo) {
            eprintln!(
                "[tomatito] state.json não gravado ({e}): {}",
                self.arquivo.display()
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::events::TimerDto;
    use crate::persist::tests::PastaDeTeste;

    fn timer(id: u64, name: &str, status: TimerStatusDto, remaining_ms: i64) -> TimerDto {
        TimerDto {
            id,
            name: name.into(),
            duration_ms: 240_000,
            status,
            ends_at: (status == TimerStatusDto::Running).then_some(1_000 + remaining_ms),
            remaining_ms,
            ended: remaining_ms < 0,
            overdue: remaining_ms < 0,
        }
    }

    fn ler(store: &StateStore) -> serde_json::Value {
        serde_json::from_str(&std::fs::read_to_string(store.path()).unwrap()).unwrap()
    }

    #[test]
    fn grava_a_lista_com_a_versao_e_so_o_que_cada_estado_precisa() {
        let d = PastaDeTeste::nova("estado");
        let store = StateStore::new(&d.0);
        store.save_timers(&TimersDto {
            seq: 3,
            at: 1_000,
            timers: vec![
                timer(1, "", TimerStatusDto::Idle, 240_000),
                timer(5, "Chá", TimerStatusDto::Running, 90_000),
                timer(6, "Forno", TimerStatusDto::Paused, -12_000),
            ],
        });
        assert_eq!(
            ler(&store),
            serde_json::json!({
                "schemaVersion": 1,
                "savedAt": 1_000,
                "timers": [
                    { "id": 1, "name": "", "durationMs": 240_000, "status": "idle", "ended": false },
                    { "id": 5, "name": "Chá", "durationMs": 240_000, "status": "running", "endsAt": 91_000, "ended": false },
                    { "id": 6, "name": "Forno", "durationMs": 240_000, "status": "paused", "remainingMs": -12_000, "ended": true },
                ],
            })
        );
    }

    #[test]
    fn cada_gravacao_substitui_a_lista_inteira() {
        let d = PastaDeTeste::nova("estado-troca");
        let store = StateStore::new(&d.0);
        store.save_timers(&TimersDto {
            seq: 1,
            at: 1,
            timers: vec![timer(1, "a", TimerStatusDto::Idle, 240_000)],
        });
        store.save_timers(&TimersDto {
            seq: 2,
            at: 2,
            timers: vec![],
        });
        assert_eq!(
            ler(&store),
            serde_json::json!({ "schemaVersion": 1, "savedAt": 2, "timers": [] })
        );
    }

    fn cronometro(status: StopwatchStatusDto, at: i64) -> StopwatchDto {
        StopwatchDto {
            seq: 1,
            at,
            status,
            started_at: (status == StopwatchStatusDto::Running).then_some(500),
            accumulated_ms: 1_250,
            elapsed_ms: 1_750,
            laps: vec![900],
        }
    }

    #[test]
    fn cronometro_ao_lado_dos_temporizadores_sem_apagar_um_ao_outro() {
        let d = PastaDeTeste::nova("estado-cronometro");
        let store = StateStore::new(&d.0);
        store.save_stopwatch(&cronometro(StopwatchStatusDto::Running, 1_000));
        assert_eq!(
            ler(&store),
            serde_json::json!({
                "schemaVersion": 1,
                "savedAt": 1_000,
                "stopwatch": { "status": "running", "startedAt": 500, "accumulatedMs": 1_250, "laps": [900] },
            })
        );
        store.save_timers(&TimersDto {
            seq: 1,
            at: 2_000,
            timers: vec![],
        });
        store.save_stopwatch(&cronometro(StopwatchStatusDto::Paused, 3_000));
        assert_eq!(
            ler(&store),
            serde_json::json!({
                "schemaVersion": 1,
                "savedAt": 3_000,
                "timers": [],
                "stopwatch": { "status": "paused", "accumulatedMs": 1_250, "laps": [900] },
            })
        );
    }

    #[test]
    fn falha_de_disco_nao_entra_em_panico() {
        let d = PastaDeTeste::nova("estado-falha");
        std::fs::create_dir_all(&d.0).unwrap();
        // A pasta de dados é um arquivo: a gravação falha e só registra.
        let pasta = d.0.join("arquivo");
        std::fs::write(&pasta, b"x").unwrap();
        let store = StateStore::new(&pasta);
        store.save_timers(&TimersDto {
            seq: 1,
            at: 1,
            timers: vec![],
        });
        assert!(!store.path().exists());
    }

    // --- M40: o foco no arquivo e a leitura ao abrir.

    const T0: i64 = 1_790_000_000_000;

    fn foco(
        f: impl FnOnce(&mut tomatito_core::Focus, &mut tomatito_core::FakeEffects),
        at: i64,
    ) -> FocusDto {
        let mut focus = tomatito_core::Focus::new();
        let mut fx = tomatito_core::FakeEffects::new();
        f(&mut focus, &mut fx);
        FocusDto::from(&focus.snapshot(EpochMs(at)))
    }

    fn correndo() -> FocusDto {
        foco(
            |f, fx| {
                let mut c = SessionConfig::new(60);
                c.task_id = Some(3);
                f.start(EpochMs(T0), c, fx).unwrap();
            },
            T0 + 60_000,
        )
    }

    #[test]
    fn foco_em_cada_estado_e_o_ultimo_id_sem_sessao() {
        let d = PastaDeTeste::nova("estado-foco");
        let store = StateStore::new(&d.0);
        store.save_focus(&correndo());
        assert_eq!(
            ler(&store),
            serde_json::json!({
                "schemaVersion": 1,
                "savedAt": T0 + 60_000,
                "focus": {
                    "lastSessionId": T0,
                    "session": {
                        "id": T0, "minutes": 60, "focusMinutes": 25, "breakMinutes": 5,
                        "skipBreaks": false, "taskId": 3, "startedAt": T0, "phaseIndex": 0,
                        "phaseStartedAt": T0, "status": "running", "endsAt": T0 + 1_650_000,
                        "focusS": 0,
                    },
                },
            })
        );
        let pausado = foco(
            |f, fx| {
                f.start(EpochMs(T0), SessionConfig::new(25), fx).unwrap();
                f.pause(EpochMs(T0 + 60_000), fx).unwrap();
            },
            T0 + 90_000,
        );
        store.save_focus(&pausado);
        let v = ler(&store);
        assert_eq!(v["focus"]["session"]["status"], "paused");
        assert_eq!(v["focus"]["session"]["remainingMs"], 1_440_000);
        assert!(v["focus"]["session"].get("endsAt").is_none());
        // Ocioso: sem sessão, e o id da última continua.
        store.save_focus(&foco(|_, _| {}, T0 + 120_000));
        assert_eq!(
            ler(&store)["focus"],
            serde_json::json!({ "lastSessionId": T0, "session": null })
        );
    }

    #[test]
    fn o_que_foi_gravado_volta_no_formato_do_nucleo() {
        let d = PastaDeTeste::nova("estado-volta");
        let store = StateStore::new(&d.0);
        store.save_timers(&TimersDto {
            seq: 1,
            at: 1_000,
            timers: vec![
                timer(1, "", TimerStatusDto::Idle, 240_000),
                timer(5, "Chá", TimerStatusDto::Running, 90_000),
                timer(6, "Forno", TimerStatusDto::Paused, -12_000),
            ],
        });
        store.save_stopwatch(&cronometro(StopwatchStatusDto::Running, 2_000));
        store.save_focus(&correndo());

        let lido = StateStore::new(&d.0).load();
        let (ultimo, sessao) = lido.focus.unwrap();
        assert_eq!(ultimo, T0);
        let sessao = sessao.unwrap();
        assert_eq!(
            sessao.run,
            RunRecord::Running {
                ends_at: EpochMs(T0 + 1_650_000)
            }
        );
        assert_eq!(sessao.config.task_id, Some(3));
        assert_eq!(sessao.config.minutes, 60);
        let timers = lido.timers.unwrap();
        assert_eq!(timers.len(), 3);
        assert_eq!(timers[0].run, TimerRunRecord::Idle);
        assert_eq!(
            timers[1].run,
            TimerRunRecord::Running {
                ends_at: EpochMs(91_000)
            }
        );
        assert_eq!(timers[1].name, "Chá");
        assert_eq!(
            timers[2].run,
            TimerRunRecord::Paused {
                remaining_ms: -12_000
            }
        );
        assert!(timers[2].ended);
        assert_eq!(
            lido.stopwatch.unwrap(),
            StopwatchRecord {
                status: StopwatchStatus::Running,
                started_at: Some(EpochMs(500)),
                accumulated_ms: 1_250,
                laps: vec![900],
            }
        );
    }

    #[test]
    fn a_leitura_guarda_as_partes_e_o_ultimo_id() {
        // Lido um arquivo com o foco ocioso e o cronômetro, a gravação dos
        // temporizadores não apaga os dois, e o id da última sessão continua.
        let d = PastaDeTeste::nova("estado-memoria");
        std::fs::create_dir_all(&d.0).unwrap();
        std::fs::write(
            d.0.join(FILE),
            r#"{"schemaVersion":1,"savedAt":5,"focus":{"lastSessionId":42,"session":null},
                "stopwatch":{"status":"paused","accumulatedMs":7,"laps":[]}}"#,
        )
        .unwrap();
        let store = StateStore::new(&d.0);
        assert_eq!(store.load().focus, Some((42, None)));
        store.save_timers(&TimersDto {
            seq: 1,
            at: 9,
            timers: vec![],
        });
        let v = ler(&store);
        assert_eq!(v["focus"]["lastSessionId"], 42);
        assert_eq!(v["stopwatch"]["accumulatedMs"], 7);
        store.save_focus(&foco(|_, _| {}, 10));
        assert_eq!(ler(&store)["focus"]["lastSessionId"], 42);
    }

    #[test]
    fn sem_arquivo_versao_desconhecida_e_parte_ilegivel() {
        let d = PastaDeTeste::nova("estado-leitura");
        let store = StateStore::new(&d.0);
        assert_eq!(store.load(), Restored::default(), "sem arquivo");
        std::fs::create_dir_all(&d.0).unwrap();

        std::fs::write(store.path(), r#"{"schemaVersion":2,"timers":[]}"#).unwrap();
        assert_eq!(
            store.load(),
            Restored::default(),
            "versão que este app não lê"
        );
        assert!(store.path().exists(), "não é dado como corrompido");

        // O foco ilegível fica no padrão; os temporizadores entram, menos o
        // que corre sem prazo.
        std::fs::write(
            store.path(),
            r#"{"schemaVersion":1,"focus":{"session":7},
                "timers":[{"id":2,"name":"","durationMs":60000,"status":"idle","ended":false},
                          {"id":3,"name":"","durationMs":60000,"status":"running","ended":false}]}"#,
        )
        .unwrap();
        let lido = store.load();
        assert_eq!(lido.focus, None);
        assert_eq!(lido.stopwatch, None);
        assert_eq!(
            lido.timers
                .unwrap()
                .iter()
                .map(|t| t.id)
                .collect::<Vec<_>>(),
            [2]
        );

        // Sessão correndo sem o prazo: ociosa, com o id guardado.
        std::fs::write(
            store.path(),
            format!(
                r#"{{"schemaVersion":1,"focus":{{"lastSessionId":9,"session":{}}}}}"#,
                serde_json::json!({
                    "id": 9, "minutes": 25, "focusMinutes": 25, "breakMinutes": 5,
                    "skipBreaks": false, "startedAt": 1, "phaseIndex": 0,
                    "phaseStartedAt": 1, "status": "running", "focusS": 0,
                })
            ),
        )
        .unwrap();
        assert_eq!(store.load().focus, Some((9, None)));
    }

    #[test]
    fn arquivo_ilegivel_vira_padrao_e_e_guardado() {
        for (n, conteudo) in ["{\"schemaVersion\":1,", "[1, 2]", ""]
            .into_iter()
            .enumerate()
        {
            let d = PastaDeTeste::nova(&format!("estado-corrompido{n}"));
            std::fs::create_dir_all(&d.0).unwrap();
            let store = StateStore::new(&d.0);
            std::fs::write(store.path(), conteudo).unwrap();
            assert_eq!(store.load(), Restored::default());
            assert!(!store.path().exists());
            assert_eq!(
                std::fs::read_to_string(d.0.join(CORRUPTED_FILE)).unwrap(),
                conteudo
            );
        }
    }

    #[test]
    fn save_all_grava_as_tres_partes_de_uma_vez() {
        let d = PastaDeTeste::nova("estado-tudo");
        let store = StateStore::new(&d.0);
        let focus = correndo();
        store.save_all(&StateDto {
            focus: focus.clone(),
            speed: 1.0,
            setup: crate::events::SetupDto {
                min_minutes: 1,
                max_minutes: 240,
                step_minutes: 1,
                focus_minutes: 25,
                break_minutes: 5,
            },
            timers: TimersDto {
                seq: 0,
                at: focus.at,
                timers: vec![timer(1, "", TimerStatusDto::Idle, 240_000)],
            },
            stopwatch: cronometro(StopwatchStatusDto::Idle, focus.at),
        });
        let v = ler(&store);
        assert_eq!(v["savedAt"], T0 + 60_000);
        assert_eq!(v["focus"]["session"]["status"], "running");
        assert_eq!(v["timers"].as_array().unwrap().len(), 1);
        assert_eq!(v["stopwatch"]["status"], "idle");
    }
}
