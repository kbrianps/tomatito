//! Tarefas (PLANO.md, 3.3 e M29), a parte sem banco (PLANO-WEB, 3.3): o
//! título limpo, a virada do dia da lista e o erro dos comandos `task_*`. O
//! SQL fica no desktop (`src-tauri/src/tasks.rs`, sobre o `stats.sqlite`); a
//! web guarda as tarefas no IndexedDB com as mesmas regras.
//!
//! - **A lista** traz as pendentes e as concluídas desde a última virada do
//!   dia (a hora de zerar, no fuso do sistema, pelo relógio do motor):
//!   [`visible_since`].
//! - **Título:** sem espaços nas pontas, com quebras de linha e outros
//!   caracteres de controle trocados por espaço, e de 1 a
//!   [`MAX_TITLE_CHARS`] caracteres: [`clean_title`].

use serde::Serialize;
use tomatito_core::{EpochMs, TimeZone, day_range, logical_date};

/// Tamanho máximo do título, em caracteres (o do Microsoft To Do, de onde
/// vêm as tarefas do Relógio).
pub const MAX_TITLE_CHARS: usize = 255;

/// Erro de um comando `task_*`, no mesmo formato do `CommandError` do motor:
/// `{ code, message }`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct TaskError {
    pub code: TaskErrorCode,
    pub message: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum TaskErrorCode {
    /// Título vazio (ou só espaços).
    EmptyTitle,
    /// Título com mais de [`MAX_TITLE_CHARS`] caracteres.
    TitleTooLong,
    /// Não existe tarefa com esse id.
    NotFound,
    /// O banco recusou a leitura ou a gravação.
    Storage,
}

impl TaskError {
    pub fn new(code: TaskErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }

    pub fn not_found(id: i64) -> Self {
        Self::new(TaskErrorCode::NotFound, format!("não existe a tarefa {id}"))
    }
}

impl std::fmt::Display for TaskError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message)
    }
}

/// O título como é gravado: controles viram espaço, sem espaços nas pontas.
pub fn clean_title(title: &str) -> Result<String, TaskError> {
    let limpo: String = title
        .chars()
        .map(|c| if c.is_control() { ' ' } else { c })
        .collect();
    let limpo = limpo.trim();
    if limpo.is_empty() {
        return Err(TaskError::new(
            TaskErrorCode::EmptyTitle,
            "o título da tarefa está vazio",
        ));
    }
    let n = limpo.chars().count();
    if n > MAX_TITLE_CHARS {
        return Err(TaskError::new(
            TaskErrorCode::TitleTooLong,
            format!("o título tem {n} caracteres; o máximo é {MAX_TITLE_CHARS}"),
        ));
    }
    Ok(limpo.to_owned())
}

/// A última virada do dia antes de `now` (a hora de zerar, no fuso `tz`): as
/// concluídas antes dela saem da lista. Com uma data fora da faixa do `jiff`
/// (não acontece com um relógio de verdade), vale 24 h antes de `now`.
pub fn visible_since(now: EpochMs, tz: &TimeZone, reset_hour: u8) -> EpochMs {
    logical_date(now, tz, reset_hour)
        .and_then(|d| day_range(d, tz, reset_hour))
        .map_or(EpochMs(now.0.saturating_sub(24 * 60 * 60 * 1000)), |r| {
            r.start
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 2026-09-28 00:00 em -03:00 (uma segunda), como nos testes do `stats.rs`.
    const SEG_0H: EpochMs = EpochMs(1_790_564_400_000);
    const H: i64 = 60 * 60 * 1000;
    const DIA: i64 = 24 * H;

    fn sp() -> TimeZone {
        TimeZone::fixed(jiff::tz::offset(-3))
    }

    fn at(ms: i64) -> EpochMs {
        EpochMs(SEG_0H.0 + ms)
    }

    #[test]
    fn visible_since_e_a_virada_de_hoje() {
        assert_eq!(visible_since(at(10 * H), &sp(), 0), at(0));
        assert_eq!(visible_since(at(10 * H), &sp(), 4), at(4 * H));
        assert_eq!(visible_since(at(3 * H), &sp(), 4), at(4 * H - DIA));
    }
}
