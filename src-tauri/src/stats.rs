//! Estatísticas (PLANO.md, 3.3): o `stats.sqlite` em `app_data_dir()`.
//!
//! - **Migrações** por `PRAGMA user_version`. A 1 cria `periods` (um bloco de
//!   foco ou de intervalo por linha) e `tasks` (as tarefas, usadas a partir do
//!   M29). Um banco de uma versão mais nova que este app não é tocado: o app
//!   segue com um banco em memória e avisa no registro.
//! - **Gravação:** o motor chama `Effects::record_period` a cada fase que
//!   termina (vencida, pulada ou encerrada), e o `TauriSink` (`engine.rs`)
//!   passa o período para [`Stats::record`]. Horários em ms UTC.
//! - **Soma** (3.3, "Regra de soma"): "Concluído" e "Esta semana" somam o
//!   `actual_s` dos períodos de foco, inclusive os interrompidos com pelo
//!   menos 1 min. Cada período conta no dia do seu `ended_at`. Os dias e a
//!   semana vêm do `tomatito_core::days`, com a hora de zerar.
//!
//! Um banco ilegível (arquivo corrompido, que não é SQLite) é guardado como
//! `stats.corrompido.sqlite`, como o `settings.json` (3.3), e o app começa um
//! novo. Se nem isso der, segue em memória: o foco nunca para por causa das
//! estatísticas.

use std::path::Path;
use std::sync::{Mutex, MutexGuard, PoisonError};

use rusqlite::{Connection, params};
use serde::Serialize;
use tomatito_core::{DayRange, EpochMs, FocusEntry, Period, PhaseKind, TimeZone, stats_ranges};

use crate::events::HistoryDto;

/// Nome do arquivo em `app_data_dir()`.
pub const FILE_NAME: &str = "stats.sqlite";
/// Para onde vai um banco ilegível.
pub const CORRUPT_NAME: &str = "stats.corrompido.sqlite";

/// Um período interrompido só conta a partir de 1 min (3.3).
pub const MIN_INTERRUPTED_S: u64 = 60;

/// As migrações, em ordem: a de índice `i` leva o banco da versão `i` para a
/// `i + 1`. Cada uma roda numa transação, junto com o novo `user_version`.
const MIGRATIONS: &[&str] = &[
    // 1 (M26): períodos e tarefas. `task_id` não tem chave estrangeira: um
    // período nunca pode deixar de ser gravado por causa de uma tarefa
    // apagada ou de um id que o JS mandou errado.
    "CREATE TABLE periods (
        id          INTEGER PRIMARY KEY,
        session_id  INTEGER NOT NULL,
        kind        TEXT    NOT NULL CHECK (kind IN ('focus', 'break')),
        started_at  INTEGER NOT NULL,
        ended_at    INTEGER NOT NULL,
        planned_s   INTEGER NOT NULL,
        actual_s    INTEGER NOT NULL,
        completed   INTEGER NOT NULL CHECK (completed IN (0, 1)),
        task_id     INTEGER
    );
    CREATE INDEX periods_ended_at ON periods (ended_at);
    CREATE TABLE tasks (
        id          INTEGER PRIMARY KEY,
        title       TEXT    NOT NULL,
        created_at  INTEGER NOT NULL,
        done_at     INTEGER
    );",
];

/// A versão que este app conhece.
pub const SCHEMA_VERSION: i64 = MIGRATIONS.len() as i64;

/// Erro ao abrir ou migrar o banco.
#[derive(Debug)]
pub enum OpenError {
    /// O banco é de um app mais novo (`user_version` maior que o nosso).
    Newer(i64),
    Sqlite(rusqlite::Error),
}

impl std::fmt::Display for OpenError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Newer(v) => write!(
                f,
                "o banco está na versão {v}, e este app conhece até a {SCHEMA_VERSION}"
            ),
            Self::Sqlite(e) => write!(f, "{e}"),
        }
    }
}

impl From<rusqlite::Error> for OpenError {
    fn from(e: rusqlite::Error) -> Self {
        Self::Sqlite(e)
    }
}

/// Leva `conn` até a [`SCHEMA_VERSION`]. Rodar de novo não faz nada.
pub fn migrate(conn: &mut Connection) -> Result<i64, OpenError> {
    let atual: i64 = conn.pragma_query_value(None, "user_version", |r| r.get(0))?;
    if atual > SCHEMA_VERSION {
        return Err(OpenError::Newer(atual));
    }
    for (i, sql) in MIGRATIONS.iter().enumerate().skip(atual.max(0) as usize) {
        let tx = conn.transaction()?;
        tx.execute_batch(sql)?;
        tx.pragma_update(None, "user_version", i as i64 + 1)?;
        tx.commit()?;
    }
    Ok(SCHEMA_VERSION)
}

fn abrir(arquivo: &Path) -> Result<Connection, OpenError> {
    let mut conn = Connection::open(arquivo)?;
    conn.busy_timeout(std::time::Duration::from_secs(2))?;
    migrate(&mut conn)?;
    Ok(conn)
}

fn em_memoria() -> Connection {
    let mut conn = Connection::open_in_memory().expect("SQLite em memória");
    migrate(&mut conn).expect("migração em memória");
    conn
}

/// O que o `stats_get` devolve ao JS (M27 e M28), em camelCase. Os tempos são
/// em segundos; o JS formata ("N minutos", "2,5 horas").
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatsDto {
    /// Foco de ontem.
    pub yesterday_s: u64,
    /// Foco de hoje (o "Concluído").
    pub today_s: u64,
    /// Foco desta semana, de segunda até agora.
    pub week_s: u64,
    /// A meta, das configurações (0 = desativada).
    pub daily_goal_minutes: u32,
    /// A hora de zerar, das configurações.
    pub reset_hour: u8,
}

/// O banco das estatísticas, um por processo (`app.manage`).
pub struct Stats {
    conn: Mutex<Connection>,
}

impl Stats {
    /// Abre (ou cria) `pasta/stats.sqlite` e aplica as migrações. Não falha:
    /// um banco ilegível vira `stats.corrompido.sqlite` e começa outro; se
    /// nem assim abrir, ou se o banco for de um app mais novo, segue em
    /// memória.
    pub fn open(pasta: &Path) -> Self {
        let arquivo = pasta.join(FILE_NAME);
        if let Err(e) = std::fs::create_dir_all(pasta) {
            eprintln!(
                "[tomatito] estatísticas: não criei {}: {e}",
                pasta.display()
            );
        }
        match abrir(&arquivo) {
            Ok(conn) => return Self::com(conn),
            Err(OpenError::Newer(v)) => {
                eprintln!(
                    "[tomatito] estatísticas: {} está na versão {v} (a deste app é {SCHEMA_VERSION}); \
                     seguindo em memória, sem mexer nele",
                    arquivo.display()
                );
                return Self::in_memory();
            }
            Err(e) => {
                eprintln!(
                    "[tomatito] estatísticas: {} ilegível: {e}",
                    arquivo.display()
                );
            }
        }
        let guardado = pasta.join(CORRUPT_NAME);
        if let Err(e) = std::fs::rename(&arquivo, &guardado) {
            eprintln!("[tomatito] estatísticas: não guardei o banco ilegível: {e}");
        } else {
            eprintln!(
                "[tomatito] estatísticas: o banco antigo ficou em {}",
                guardado.display()
            );
        }
        match abrir(&arquivo) {
            Ok(conn) => Self::com(conn),
            Err(e) => {
                eprintln!("[tomatito] estatísticas: seguindo em memória: {e}");
                Self::in_memory()
            }
        }
    }

    /// Um banco só em memória (testes, ou o reserva do [`Self::open`]).
    pub fn in_memory() -> Self {
        Self::com(em_memoria())
    }

    fn com(conn: Connection) -> Self {
        Self {
            conn: Mutex::new(conn),
        }
    }

    pub(crate) fn lock(&self) -> MutexGuard<'_, Connection> {
        self.conn.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// Grava uma linha em `periods`.
    pub fn record(&self, p: &Period) -> rusqlite::Result<()> {
        let kind = match p.kind {
            PhaseKind::Focus => "focus",
            PhaseKind::Break => "break",
        };
        let seg = |s: u64| i64::try_from(s).unwrap_or(i64::MAX);
        self.lock().execute(
            "INSERT INTO periods
                (session_id, kind, started_at, ended_at, planned_s, actual_s, completed, task_id)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                p.session_id,
                kind,
                p.started_at.0,
                p.ended_at.0,
                seg(p.planned_s),
                seg(p.actual_s),
                p.completed,
                p.task_id,
            ],
        )?;
        Ok(())
    }

    /// Segundos de foco que contam (3.3) com o fim dentro de `range`.
    pub fn focus_seconds(&self, range: DayRange) -> rusqlite::Result<u64> {
        let s: i64 = self.lock().query_row(
            "SELECT COALESCE(SUM(actual_s), 0) FROM periods
             WHERE kind = 'focus'
               AND (completed = 1 OR actual_s >= ?3)
               AND ended_at >= ?1 AND ended_at < ?2",
            params![range.start.0, range.end.0, MIN_INTERRUPTED_S as i64],
            |r| r.get(0),
        )?;
        Ok(u64::try_from(s).unwrap_or(0))
    }

    /// Todos os períodos de foco que contam (a regra do [`Stats::focus_seconds`]),
    /// do mais antigo ao mais novo.
    pub fn focus_entries(&self) -> rusqlite::Result<Vec<FocusEntry>> {
        let conn = self.lock();
        let mut stmt = conn.prepare(
            "SELECT ended_at, actual_s FROM periods
             WHERE kind = 'focus' AND (completed = 1 OR actual_s >= ?1)
             ORDER BY ended_at",
        )?;
        let linhas = stmt.query_map(params![MIN_INTERRUPTED_S as i64], |r| {
            let fim: i64 = r.get(0)?;
            let s: i64 = r.get(1)?;
            Ok(FocusEntry {
                ended_at: EpochMs(fim),
                seconds: u64::try_from(s).unwrap_or(0),
            })
        })?;
        linhas.collect()
    }

    /// O histórico (v0.3): os totais de todo o tempo e o foco por semana. Um
    /// erro de leitura vira o histórico vazio (e vai para o registro), como
    /// no [`Stats::summary`].
    pub fn history(&self, now: EpochMs, tz: &TimeZone, reset_hour: u8) -> HistoryDto {
        let entradas = self.focus_entries().unwrap_or_else(|e| {
            eprintln!("[tomatito] estatísticas: falha ao ler o histórico: {e}");
            Vec::new()
        });
        tomatito_core::history(&entradas, now, tz, reset_hour).into()
    }

    /// Ontem, hoje e esta semana, vistos de `now` no fuso `tz`. Um erro de
    /// leitura vira 0 (e vai para o registro): o card mostra zero, não quebra.
    pub fn summary(
        &self,
        now: EpochMs,
        tz: &TimeZone,
        reset_hour: u8,
        daily_goal_minutes: u32,
    ) -> StatsDto {
        let somar = |r: Option<DayRange>| {
            r.map_or(0, |r| {
                self.focus_seconds(r).unwrap_or_else(|e| {
                    eprintln!("[tomatito] estatísticas: falha ao somar: {e}");
                    0
                })
            })
        };
        let r = stats_ranges(now, tz, reset_hour);
        StatsDto {
            yesterday_s: somar(r.map(|r| r.yesterday)),
            today_s: somar(r.map(|r| r.today)),
            week_s: somar(r.map(|r| r.week)),
            daily_goal_minutes,
            reset_hour,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::{Engine, Sink};
    use crate::events::{FocusDto, PhaseEventDto, TickDto};
    use std::path::PathBuf;
    use std::sync::Arc;
    use tomatito_core::{Clock, FakeClock, Notice, Sound};

    /// 2026-09-28 00:00 em -03:00 (uma segunda).
    const SEG_0H: EpochMs = EpochMs(1_790_564_400_000);
    const S: i64 = 1000;
    const MIN: i64 = 60 * S;
    const H: i64 = 60 * MIN;
    const DIA: i64 = 24 * H;

    fn sp() -> TimeZone {
        TimeZone::fixed(jiff::tz::offset(-3))
    }

    fn at(ms: i64) -> EpochMs {
        EpochMs(SEG_0H.0 + ms)
    }

    fn periodo(kind: PhaseKind, fim: EpochMs, actual_s: u64, completed: bool) -> Period {
        Period {
            session_id: fim.0,
            kind,
            n: 1,
            started_at: EpochMs(fim.0 - actual_s as i64 * S),
            ended_at: fim,
            planned_s: actual_s.max(1500),
            actual_s,
            completed,
            task_id: None,
        }
    }

    /// Uma pasta nova em `temp_dir`, apagada no fim do teste.
    struct Pasta(PathBuf);
    impl Pasta {
        fn nova(nome: &str) -> Self {
            let p = std::env::temp_dir().join(format!(
                "tomatito-stats-{nome}-{}-{}",
                std::process::id(),
                tomatito_core::SystemClock.now().0
            ));
            let _ = std::fs::remove_dir_all(&p);
            Self(p)
        }
    }
    impl Drop for Pasta {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn migracao_cria_as_tabelas_e_e_idempotente() {
        let mut conn = Connection::open_in_memory().unwrap();
        assert_eq!(migrate(&mut conn).unwrap(), 1);
        assert_eq!(migrate(&mut conn).unwrap(), 1);
        let v: i64 = conn
            .pragma_query_value(None, "user_version", |r| r.get(0))
            .unwrap();
        assert_eq!(v, 1);
        let mut tabelas: Vec<String> = conn
            .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
            .unwrap()
            .query_map([], |r| r.get(0))
            .unwrap()
            .map(Result::unwrap)
            .collect();
        tabelas.sort();
        assert_eq!(tabelas, ["periods", "tasks"]);
        let colunas = |t: &str| -> Vec<String> {
            conn.prepare(&format!("PRAGMA table_info({t})"))
                .unwrap()
                .query_map([], |r| r.get(1))
                .unwrap()
                .map(Result::unwrap)
                .collect()
        };
        assert_eq!(
            colunas("periods"),
            [
                "id",
                "session_id",
                "kind",
                "started_at",
                "ended_at",
                "planned_s",
                "actual_s",
                "completed",
                "task_id"
            ]
        );
        assert_eq!(colunas("tasks"), ["id", "title", "created_at", "done_at"]);
    }

    #[test]
    fn banco_de_versao_mais_nova_nao_e_tocado() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "user_version", 7).unwrap();
        assert!(matches!(migrate(&mut conn), Err(OpenError::Newer(7))));
    }

    #[test]
    fn periodo_que_cruza_a_meia_noite_conta_no_dia_em_que_terminou() {
        let st = Stats::in_memory();
        // Domingo 23:50 até segunda 00:20: 30 min, todos na segunda.
        st.record(&periodo(PhaseKind::Focus, at(20 * MIN), 1800, true))
            .unwrap();
        let r = st.summary(at(9 * H), &sp(), 0, 120);
        assert_eq!((r.yesterday_s, r.today_s, r.week_s), (0, 1800, 1800));
        // Na terça, virou ontem.
        let r = st.summary(at(DIA + 9 * H), &sp(), 0, 120);
        assert_eq!((r.yesterday_s, r.today_s, r.week_s), (1800, 0, 1800));
        assert_eq!((r.daily_goal_minutes, r.reset_hour), (120, 0));
    }

    #[test]
    fn hora_de_zerar_as_quatro() {
        let st = Stats::in_memory();
        // Segunda 03:30 (ainda domingo com a virada às 04:00) e 04:30.
        st.record(&periodo(PhaseKind::Focus, at(3 * H + 30 * MIN), 600, true))
            .unwrap();
        st.record(&periodo(PhaseKind::Focus, at(4 * H + 30 * MIN), 900, true))
            .unwrap();
        let r = st.summary(at(10 * H), &sp(), 4, 60);
        assert_eq!((r.yesterday_s, r.today_s), (600, 900));
        // O domingo é da semana anterior; a semana nova começa segunda 04:00.
        assert_eq!(r.week_s, 900);
        // Sem hora de zerar, os dois são de segunda.
        let r = st.summary(at(10 * H), &sp(), 0, 60);
        assert_eq!((r.yesterday_s, r.today_s, r.week_s), (0, 1500, 1500));
        // Terça 02:00 com virada às 04:00: ainda é segunda.
        let r = st.summary(at(DIA + 2 * H), &sp(), 4, 60);
        assert_eq!((r.yesterday_s, r.today_s), (600, 900));
    }

    #[test]
    fn semana_comeca_na_segunda() {
        let st = Stats::in_memory();
        // Domingo 27/09 12:00 (semana anterior), e segunda, quarta e domingo
        // 04/10 desta semana.
        for (fim, s) in [
            (-12 * H, 100),
            (10 * H, 200),
            (2 * DIA + 10 * H, 400),
            (6 * DIA + 10 * H, 800),
        ] {
            st.record(&periodo(PhaseKind::Focus, at(fim), s, true))
                .unwrap();
        }
        let domingo = st.summary(at(6 * DIA + 20 * H), &sp(), 0, 0);
        assert_eq!(domingo.week_s, 1400);
        assert_eq!(domingo.today_s, 800);
        // Segunda seguinte: semana nova, zerada; ontem é o domingo.
        let segunda = st.summary(at(7 * DIA + H), &sp(), 0, 0);
        assert_eq!(
            (segunda.yesterday_s, segunda.today_s, segunda.week_s),
            (800, 0, 0)
        );
        // Na segunda 28/09, o domingo 27 é ontem, mas não é desta semana (a
        // semana soma até o domingo seguinte; aqui os dias depois de segunda
        // já têm linhas porque o teste as gravou antes).
        let r = st.summary(at(11 * H), &sp(), 0, 0);
        assert_eq!((r.yesterday_s, r.today_s, r.week_s), (100, 200, 1400));
    }

    #[test]
    fn regra_de_soma() {
        let st = Stats::in_memory();
        let fim = at(10 * H);
        // Conta: foco completo e foco interrompido com 1 min ou mais.
        st.record(&periodo(PhaseKind::Focus, fim, 1500, true))
            .unwrap();
        st.record(&periodo(PhaseKind::Focus, fim, 60, false))
            .unwrap();
        // Não conta: interrompido com menos de 1 min, e intervalos.
        st.record(&periodo(PhaseKind::Focus, fim, 59, false))
            .unwrap();
        st.record(&periodo(PhaseKind::Break, fim, 300, true))
            .unwrap();
        st.record(&periodo(PhaseKind::Break, fim, 200, false))
            .unwrap();
        assert_eq!(st.summary(at(11 * H), &sp(), 0, 0).today_s, 1560);
        let linhas: i64 = st
            .lock()
            .query_row("SELECT COUNT(*) FROM periods", [], |r| r.get(0))
            .unwrap();
        assert_eq!(linhas, 5, "todos os períodos são gravados");
    }

    #[test]
    fn fechar_e_reabrir_mantem_os_numeros() {
        let pasta = Pasta::nova("reabrir");
        {
            let st = Stats::open(&pasta.0);
            assert!(pasta.0.join(FILE_NAME).is_file());
            st.record(&periodo(PhaseKind::Focus, at(10 * H), 1500, true))
                .unwrap();
        }
        let st = Stats::open(&pasta.0);
        assert_eq!(st.summary(at(11 * H), &sp(), 0, 0).today_s, 1500);
    }

    #[test]
    fn banco_ilegivel_e_guardado_e_comeca_outro() {
        let pasta = Pasta::nova("corrompido");
        std::fs::create_dir_all(&pasta.0).unwrap();
        let lixo = b"isto nao e um banco SQLite, so texto qualquer, repetido. ".repeat(200);
        std::fs::write(pasta.0.join(FILE_NAME), &lixo).unwrap();
        let st = Stats::open(&pasta.0);
        assert!(pasta.0.join(FILE_NAME).is_file());
        assert_eq!(std::fs::read(pasta.0.join(CORRUPT_NAME)).unwrap(), lixo);
        st.record(&periodo(PhaseKind::Focus, at(10 * H), 1500, true))
            .unwrap();
        assert_eq!(st.summary(at(11 * H), &sp(), 0, 0).today_s, 1500);
    }

    /// Um `Sink` que só grava os períodos, como o `TauriSink`.
    struct SoGrava(Stats);
    impl Sink for SoGrava {
        fn state(&self, _: &FocusDto) {}
        fn tick(&self, _: &TickDto) {}
        fn phase(&self, _: &PhaseEventDto) {}
        fn sound(&self, _: Sound) {}
        fn notice(&self, _: Notice) {}
        fn period(&self, p: &Period) {
            self.0.record(p).unwrap();
        }
        fn timers(&self, _: &crate::events::TimersDto) {}
        fn timer_notice(&self, _: &tomatito_core::TimerEnded) {}
        fn stopwatch(&self, _: &crate::events::StopwatchDto) {}
    }

    /// Do motor ao banco: o `Effects` grava os períodos, e a sessão que
    /// termina depois da meia-noite conta na segunda.
    #[test]
    fn o_motor_grava_os_periodos_pelo_effects() {
        let relogio = FakeClock::new(at(-10 * MIN)); // domingo 23:50
        let motor = Arc::new(Engine::new(
            Box::new(relogio.clone()),
            1.0,
            SoGrava(Stats::in_memory()),
        ));
        // 60 min: foco de 27, intervalo de 5, foco de 28.
        motor.start(60, false, Some(7)).unwrap();
        relogio.advance_min(61);
        motor.tick();
        let st = &motor.sink().0;
        let linhas: Vec<(String, i64, i64, bool, Option<i64>)> = st
            .lock()
            .prepare("SELECT kind, ended_at, actual_s, completed, task_id FROM periods ORDER BY id")
            .unwrap()
            .query_map([], |r| {
                Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?))
            })
            .unwrap()
            .map(Result::unwrap)
            .collect();
        assert_eq!(linhas.len(), 3, "{linhas:?}");
        assert_eq!(
            linhas.iter().map(|l| l.0.as_str()).collect::<Vec<_>>(),
            ["focus", "break", "focus"]
        );
        assert!(linhas.iter().all(|l| l.3 && l.4 == Some(7)));
        assert_eq!(linhas[2].1, at(50 * MIN).0, "a sessão termina às 00:50");
        // O primeiro foco (23:50 às 00:17) já terminou na segunda: os dois contam.
        let r = st.summary(relogio.now(), &sp(), 0, 60);
        assert_eq!(r.today_s, 3300);
        assert_eq!(r.yesterday_s, 0);
        // Com a virada às 04:00, tudo é do domingo, que também é "hoje".
        let r = st.summary(relogio.now(), &sp(), 4, 60);
        assert_eq!((r.yesterday_s, r.today_s), (0, 3300));
        // Parar no meio grava o foco interrompido.
        motor.start(30, false, None).unwrap();
        relogio.advance_min(10);
        motor.stop().unwrap();
        let r = st.summary(relogio.now(), &sp(), 0, 60);
        assert_eq!(r.today_s, 3300 + 600);
    }

    #[test]
    fn historico_usa_a_regra_do_que_conta_e_agrupa_por_semana() {
        let stats = Stats::in_memory();
        // Segunda 28/09: um período completo e um interrompido curto (não conta).
        stats
            .record(&periodo(PhaseKind::Focus, at(10 * H), 1500, true))
            .unwrap();
        stats
            .record(&periodo(PhaseKind::Focus, at(11 * H), 30, false))
            .unwrap();
        // Um intervalo nunca conta.
        stats
            .record(&periodo(PhaseKind::Break, at(12 * H), 300, true))
            .unwrap();
        // Segunda seguinte (05/10): um interrompido longo (conta).
        stats
            .record(&periodo(PhaseKind::Focus, at(7 * DIA + 9 * H), 900, false))
            .unwrap();
        let h = stats.history(at(7 * DIA + 10 * H), &sp(), 0);
        assert_eq!(h.total_s, 2400);
        assert_eq!(h.periods, 2);
        assert_eq!(h.days, 2);
        assert_eq!(h.since.as_deref(), Some("2026-09-28"));
        let semanas: Vec<_> = h
            .weeks
            .iter()
            .map(|w| (w.monday.as_str(), w.focus_s))
            .collect();
        assert_eq!(semanas, vec![("2026-09-28", 1500), ("2026-10-05", 900)]);
        // Em JSON, camelCase.
        let json = serde_json::to_value(&h).unwrap();
        assert_eq!(json["totalS"], 2400);
        assert_eq!(json["weeks"][0]["focusS"], 1500);
    }
}
