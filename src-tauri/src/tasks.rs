//! Tarefas (PLANO.md, 3.3 e M29): a tabela `tasks` do `stats.sqlite`, criada
//! pela migração 1 (`stats.rs`), e as operações dos comandos `task_*`.
//!
//! - **A lista** traz as pendentes e as concluídas desde a última virada do
//!   dia (a hora de zerar, no fuso do sistema, pelo relógio do motor). Uma
//!   concluída continua na lista, marcada, até a virada seguinte, e aí some
//!   (1.1: o comportamento do Relógio desde a nota Insider 11.2606.11.0).
//! - **Sumir não apaga:** a linha fica no banco, porque os períodos guardam o
//!   `task_id` (M30). Só o `task_delete` apaga, e os períodos daquela tarefa
//!   ficam com o id solto, de propósito (`stats.rs`, migração 1).
//! - **Ordem:** a de criação (`id`). Concluir não muda a posição da linha.
//! - **Título:** sem espaços nas pontas, com quebras de linha e outros
//!   caracteres de controle trocados por espaço, e de 1 a
//!   [`MAX_TITLE_CHARS`] caracteres.
//!
//! As funções recebem o "agora" e a hora de zerar de fora: os testes usam
//! instantes fixos, e o `commands.rs` passa o relógio do motor e as
//! configurações.
//!
//! O título limpo, a virada do dia e o erro (`TaskError`) ficam no motor
//! (`tomatito_motor::tasks`, PLANO-WEB 3.3), que a versão web também usa;
//! este módulo os reexporta e guarda o SQL.

use rusqlite::{OptionalExtension, Row, params};
use serde::Serialize;
use tomatito_core::{EpochMs, TimeZone};

pub use tomatito_motor::tasks::*;

use crate::stats::Stats;

/// Uma tarefa, como o JS a lê (camelCase). Horários em ms UTC.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskDto {
    pub id: i64,
    pub title: String,
    pub created_at: i64,
    /// Quando foi concluída; `null` se está pendente.
    pub done_at: Option<i64>,
}

impl TaskDto {
    fn from_row(r: &Row<'_>) -> rusqlite::Result<Self> {
        Ok(Self {
            id: r.get(0)?,
            title: r.get(1)?,
            created_at: r.get(2)?,
            done_at: r.get(3)?,
        })
    }
}

/// O erro do banco como erro de tarefa (`storage`). É função, e não um
/// `From<rusqlite::Error>`, porque o `TaskError` é do motor (E0117).
fn armazenamento(e: rusqlite::Error) -> TaskError {
    eprintln!("[tomatito] tarefas: {e}");
    TaskError::new(TaskErrorCode::Storage, e.to_string())
}

const COLUNAS: &str = "id, title, created_at, done_at";

impl Stats {
    fn task(&self, id: i64) -> Result<TaskDto, TaskError> {
        self.lock()
            .query_row(
                &format!("SELECT {COLUNAS} FROM tasks WHERE id = ?1"),
                [id],
                TaskDto::from_row,
            )
            .optional()
            .map_err(armazenamento)?
            .ok_or_else(|| TaskError::not_found(id))
    }

    /// `task_list`: as pendentes e as concluídas desde a virada de hoje, na
    /// ordem de criação.
    pub fn task_list(
        &self,
        now: EpochMs,
        tz: &TimeZone,
        reset_hour: u8,
    ) -> Result<Vec<TaskDto>, TaskError> {
        let desde = visible_since(now, tz, reset_hour);
        let conn = self.lock();
        let mut st = conn
            .prepare_cached(&format!(
                "SELECT {COLUNAS} FROM tasks
             WHERE done_at IS NULL OR done_at >= ?1
             ORDER BY id"
            ))
            .map_err(armazenamento)?;
        let lista = st
            .query_map([desde.0], TaskDto::from_row)
            .map_err(armazenamento)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(armazenamento)?;
        Ok(lista)
    }

    /// `task_add{title}`: cria uma tarefa pendente, criada em `now`.
    pub fn task_add(&self, title: &str, now: EpochMs) -> Result<TaskDto, TaskError> {
        let title = clean_title(title)?;
        let id = {
            let conn = self.lock();
            conn.execute(
                "INSERT INTO tasks (title, created_at, done_at) VALUES (?1, ?2, NULL)",
                params![title, now.0],
            )
            .map_err(armazenamento)?;
            conn.last_insert_rowid()
        };
        self.task(id)
    }

    /// `task_complete{id, done}`: com `done`, marca como concluída em `now`
    /// (uma que já estava concluída guarda o horário de antes); sem `done`,
    /// volta a pendente.
    pub fn task_complete(&self, id: i64, done: bool, now: EpochMs) -> Result<TaskDto, TaskError> {
        let mudou = if done {
            self.lock()
                .execute(
                    "UPDATE tasks SET done_at = COALESCE(done_at, ?2) WHERE id = ?1",
                    params![id, now.0],
                )
                .map_err(armazenamento)?
        } else {
            self.lock()
                .execute("UPDATE tasks SET done_at = NULL WHERE id = ?1", [id])
                .map_err(armazenamento)?
        };
        if mudou == 0 {
            return Err(TaskError::not_found(id));
        }
        self.task(id)
    }

    /// `task_delete{id}`: apaga a linha. Os períodos com esse `task_id`
    /// ficam como estão.
    pub fn task_delete(&self, id: i64) -> Result<(), TaskError> {
        let n = self
            .lock()
            .execute("DELETE FROM tasks WHERE id = ?1", [id])
            .map_err(armazenamento)?;
        if n == 0 {
            return Err(TaskError::not_found(id));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tomatito_core::{Period, PhaseKind};

    /// 2026-09-28 00:00 em -03:00 (uma segunda), como nos testes do `stats.rs`.
    const SEG_0H: EpochMs = EpochMs(1_790_564_400_000);
    const MIN: i64 = 60 * 1000;
    const H: i64 = 60 * MIN;
    const DIA: i64 = 24 * H;

    fn sp() -> TimeZone {
        TimeZone::fixed(jiff::tz::offset(-3))
    }

    fn at(ms: i64) -> EpochMs {
        EpochMs(SEG_0H.0 + ms)
    }

    fn titulos(st: &Stats, now: EpochMs, reset_hour: u8) -> Vec<(String, bool)> {
        st.task_list(now, &sp(), reset_hour)
            .unwrap()
            .into_iter()
            .map(|t| (t.title, t.done_at.is_some()))
            .collect()
    }

    fn par(t: &str, feita: bool) -> (String, bool) {
        (t.to_owned(), feita)
    }

    #[test]
    fn adicionar() {
        let st = Stats::in_memory();
        assert!(st.task_list(at(9 * H), &sp(), 0).unwrap().is_empty());
        let a = st.task_add("Ler o capítulo 3", at(9 * H)).unwrap();
        assert_eq!(
            a,
            TaskDto {
                id: a.id,
                title: "Ler o capítulo 3".into(),
                created_at: at(9 * H).0,
                done_at: None,
            }
        );
        st.task_add("  Revisar\nas notas\t ", at(9 * H + MIN))
            .unwrap();
        st.task_add("Lista 2", at(9 * H + 2 * MIN)).unwrap();
        // Na ordem de criação, e o título limpo.
        assert_eq!(
            titulos(&st, at(10 * H), 0),
            [
                par("Ler o capítulo 3", false),
                par("Revisar as notas", false),
                par("Lista 2", false)
            ]
        );
        // Pendentes não somem na virada: continuam dias depois.
        assert_eq!(titulos(&st, at(5 * DIA), 0).len(), 3);
    }

    #[test]
    fn titulo_vazio_ou_longo_e_recusado() {
        let st = Stats::in_memory();
        for t in ["", "   ", "\n\t"] {
            assert_eq!(
                st.task_add(t, at(0)).unwrap_err().code,
                TaskErrorCode::EmptyTitle
            );
        }
        let longo = "á".repeat(MAX_TITLE_CHARS + 1);
        assert_eq!(
            st.task_add(&longo, at(0)).unwrap_err().code,
            TaskErrorCode::TitleTooLong
        );
        // O limite é em caracteres, não em bytes.
        let no_limite = "á".repeat(MAX_TITLE_CHARS);
        assert_eq!(st.task_add(&no_limite, at(0)).unwrap().title, no_limite);
        assert_eq!(st.task_list(at(0), &sp(), 0).unwrap().len(), 1);
    }

    #[test]
    fn concluir() {
        let st = Stats::in_memory();
        let a = st.task_add("A", at(9 * H)).unwrap();
        st.task_add("B", at(9 * H)).unwrap();
        let feita = st.task_complete(a.id, true, at(10 * H)).unwrap();
        assert_eq!(feita.done_at, Some(at(10 * H).0));
        // Concluída fica na lista, no mesmo lugar, marcada.
        assert_eq!(
            titulos(&st, at(11 * H), 0),
            [par("A", true), par("B", false)]
        );
        // Concluir de novo guarda o primeiro horário.
        let de_novo = st.task_complete(a.id, true, at(12 * H)).unwrap();
        assert_eq!(de_novo.done_at, Some(at(10 * H).0));
        // Desmarcar volta a pendente.
        assert_eq!(
            st.task_complete(a.id, false, at(12 * H)).unwrap().done_at,
            None
        );
        assert_eq!(
            titulos(&st, at(12 * H), 0),
            [par("A", false), par("B", false)]
        );
        assert_eq!(
            st.task_complete(999, true, at(0)).unwrap_err().code,
            TaskErrorCode::NotFound
        );
    }

    #[test]
    fn concluidas_somem_na_virada_do_dia() {
        let st = Stats::in_memory();
        let a = st.task_add("Feita cedo", at(8 * H)).unwrap();
        let b = st.task_add("Feita tarde", at(8 * H)).unwrap();
        st.task_add("Pendente", at(8 * H)).unwrap();
        st.task_complete(a.id, true, at(9 * H)).unwrap();
        st.task_complete(b.id, true, at(23 * H + 59 * MIN)).unwrap();
        // Segunda 23:59:59: as duas concluídas ainda aparecem.
        assert_eq!(titulos(&st, at(DIA - 1000), 0).len(), 3);
        // Terça 00:00: só a pendente.
        assert_eq!(titulos(&st, at(DIA), 0), [par("Pendente", false)]);
        // Sumir não apaga: a linha continua no banco.
        let linhas: i64 = st
            .lock()
            .query_row("SELECT COUNT(*) FROM tasks", [], |r| r.get(0))
            .unwrap();
        assert_eq!(linhas, 3);
        // Desmarcar uma que sumiu a traz de volta, pendente.
        st.task_complete(a.id, false, at(DIA + H)).unwrap();
        assert_eq!(
            titulos(&st, at(DIA + H), 0),
            [par("Feita cedo", false), par("Pendente", false)]
        );
    }

    #[test]
    fn virada_pela_hora_de_zerar() {
        let st = Stats::in_memory();
        let a = st.task_add("Madrugada", at(0)).unwrap();
        let b = st.task_add("Manhã", at(0)).unwrap();
        // Segunda 02:00 (ainda domingo, com a virada às 04:00) e 05:00.
        st.task_complete(a.id, true, at(2 * H)).unwrap();
        st.task_complete(b.id, true, at(5 * H)).unwrap();
        // Segunda 03:00, virada às 04:00: o dia lógico é o domingo; as duas aparecem
        // (a das 05:00 só existe no teste, que grava fora de ordem).
        assert_eq!(titulos(&st, at(3 * H), 4).len(), 2);
        // Segunda 04:00: a das 02:00 é de ontem e some.
        assert_eq!(titulos(&st, at(4 * H), 4), [par("Manhã", true)]);
        // Terça 03:59: ainda é segunda; a das 05:00 continua.
        assert_eq!(
            titulos(&st, at(DIA + 3 * H + 59 * MIN), 4),
            [par("Manhã", true)]
        );
        // Terça 04:00: some também.
        assert!(titulos(&st, at(DIA + 4 * H), 4).is_empty());
        // Com a virada à meia-noite, a das 02:00 já é de hoje na segunda.
        assert_eq!(titulos(&st, at(10 * H), 0).len(), 2);
    }

    #[test]
    fn apagar() {
        let st = Stats::in_memory();
        let a = st.task_add("A", at(0)).unwrap();
        st.task_add("B", at(0)).unwrap();
        // Um período gravado com a tarefa não impede apagá-la, e continua.
        st.record(&Period {
            session_id: 1,
            kind: PhaseKind::Focus,
            n: 1,
            started_at: at(0),
            ended_at: at(25 * MIN),
            planned_s: 1500,
            actual_s: 1500,
            completed: true,
            task_id: Some(a.id),
        })
        .unwrap();
        st.task_delete(a.id).unwrap();
        assert_eq!(titulos(&st, at(H), 0), [par("B", false)]);
        assert_eq!(
            st.task_delete(a.id).unwrap_err().code,
            TaskErrorCode::NotFound
        );
        let com_tarefa: i64 = st
            .lock()
            .query_row(
                "SELECT COUNT(*) FROM periods WHERE task_id = ?1",
                [a.id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(com_tarefa, 1);
    }

    #[test]
    fn sobrevive_ao_reinicio() {
        let pasta = std::env::temp_dir().join(format!(
            "tomatito-tasks-reinicio-{}-{}",
            std::process::id(),
            tomatito_core::epoch_ms(std::time::SystemTime::now()).0
        ));
        let _ = std::fs::remove_dir_all(&pasta);
        {
            let st = Stats::open(&pasta);
            let a = st.task_add("A", at(9 * H)).unwrap();
            st.task_add("B", at(9 * H)).unwrap();
            st.task_complete(a.id, true, at(10 * H)).unwrap();
        }
        let st = Stats::open(&pasta);
        assert_eq!(
            titulos(&st, at(11 * H), 0),
            [par("A", true), par("B", false)]
        );
        drop(st);
        let _ = std::fs::remove_dir_all(&pasta);
    }

    #[test]
    fn formato_do_fio() {
        let t = TaskDto {
            id: 3,
            title: "A".into(),
            created_at: 10,
            done_at: None,
        };
        assert_eq!(
            serde_json::to_value(&t).unwrap(),
            serde_json::json!({ "id": 3, "title": "A", "createdAt": 10, "doneAt": null })
        );
        let e = TaskError::not_found(3);
        assert_eq!(
            serde_json::to_value(&e).unwrap(),
            serde_json::json!({ "code": "notFound", "message": "não existe a tarefa 3" })
        );
    }
}
