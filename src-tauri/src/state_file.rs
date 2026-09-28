//! O `state.json` (PLANO.md, 3.3): o que está em andamento, para sobreviver a
//! fechar e reabrir o app.
//!
//! - guarda os temporizadores (desde o M33); o cronômetro entra no M34 e o
//!   foco, quando o M40 passar a carregar o arquivo ao abrir;
//! - é gravado a cada transição (criar, editar, excluir, iniciar, pausar,
//!   redefinir e o fim de um temporizador), nunca a cada tick;
//! - a gravação é atômica, pelo `persist.rs`;
//! - leva `schemaVersion`.
//!
//! Até o M40, o arquivo só é escrito: o app abre com os padrões, e a primeira
//! transição o regrava inteiro. As partes ficam guardadas aqui em memória, para
//! a gravação de uma (os temporizadores) não apagar a outra (o cronômetro).
//!
//! Cada temporizador é gravado com o que basta para retomar do ponto certo
//! depois de fechado: correndo, o prazo (`endsAt`, em ms UTC), que continua
//! valendo com o app fechado; pausado, o que faltava (`remainingMs`, negativo
//! depois do zero); parado, só a duração.

use std::path::{Path, PathBuf};
use std::sync::{Mutex, PoisonError};

use serde::Serialize;

use crate::events::{TimerStatusDto, TimersDto};

/// O nome do arquivo, na pasta de dados do app.
pub const FILE: &str = "state.json";

/// A versão do formato. Sobe quando um campo muda de sentido; o M40 lê as
/// versões conhecidas e ignora o resto.
pub const SCHEMA_VERSION: u32 = 1;

/// Um temporizador como fica no arquivo.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedTimer {
    pub id: u64,
    pub name: String,
    pub duration_ms: u64,
    pub status: TimerStatusDto,
    /// O prazo, só correndo.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ends_at: Option<i64>,
    /// O que falta, só pausado (negativo depois do zero).
    #[serde(skip_serializing_if = "Option::is_none")]
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
}

/// O conteúdo do `state.json`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StateFile {
    pub schema_version: u32,
    /// Quando foi gravado, em ms UTC.
    pub saved_at: i64,
    /// A lista inteira, na ordem dos cards. Ausente até a primeira transição
    /// dos temporizadores neste processo.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timers: Option<Vec<SavedTimer>>,
}

impl Default for StateFile {
    fn default() -> Self {
        Self {
            schema_version: SCHEMA_VERSION,
            saved_at: 0,
            timers: None,
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

    /// Troca a lista de temporizadores pelo retrato `dto` e grava o arquivo.
    /// Uma falha de disco vai para o registro e não interrompe o motor.
    pub fn save_timers(&self, dto: &TimersDto) {
        let mut g = self.atual.lock().unwrap_or_else(PoisonError::into_inner);
        g.saved_at = dto.at;
        g.timers = Some(dto.timers.iter().map(SavedTimer::from_dto).collect());
        if let Err(e) = crate::persist::write_json_atomic(&self.arquivo, &*g) {
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
}
