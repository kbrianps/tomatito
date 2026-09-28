//! Motor dos temporizadores (PLANO.md, 3.2 e M31).
//!
//! Um mapa de temporizadores ([`Timers`]), cada um com id, nome, duração,
//! prazo (`ends_at_ms`, enquanto corre) e restante (`remaining_ms`, quando
//! pausado). Vários correm ao mesmo tempo, e pausar um não mexe nos outros.
//!
//! **Prazo em relógio de parede**, como o foco: correr guarda o prazo;
//! pausar guarda o que falta; retomar faz `ends_at = agora + restante`. Nenhum
//! método lê o relógio: todos recebem o `now` de quem chama (o laço e os
//! comandos do app, M32), e os testes passam o `now` de um `FakeClock`.
//!
//! **Contagem negativa.** Depois do zero o temporizador continua correndo, e o
//! restante fica negativo (o "-00:00:12" com "Encerrado há" do M32). Pausar
//! num restante negativo guarda o negativo, e retomar continua dali.
//!
//! **O fim dispara uma única vez.** [`Timers::advance_to`] pede
//! [`CountdownEffects::timer_ended`] para cada temporizador que passou do zero
//! desde a última vez, e marca o temporizador como encerrado. Ticks seguintes,
//! pausar e retomar no negativo não disparam de novo; só "redefinir" (ou trocar
//! a duração) arma o fim outra vez.
//!
//! **Atraso.** Como no foco (3.2), um fim percebido mais de
//! [`LATE_AFTER_MS`] depois do prazo (suspensão ou app fechado) sai marcado
//! como atrasado, e o app não toca o som.
//!
//! **Relógio para trás** (aceito na v1): nada dispara, e o restante nunca
//! passa da duração.
//!
//! **Retomada (M40).** O app grava a lista no `state.json` a cada transição e,
//! ao abrir, a devolve com [`Timers::restore`] (sem efeito nenhum) e roda o
//! `advance_to(now)`: um temporizador que chegou a zero com o app fechado
//! dispara ali, atrasado (sem som); um que já tinha disparado não dispara de
//! novo.

use std::collections::BTreeMap;
use std::fmt;

use crate::clock::EpochMs;
use crate::focus::LATE_AFTER_MS;

/// O identificador de um temporizador, dado na criação e nunca reaproveitado
/// enquanto o [`Timers`] existe. A ordem dos ids é a ordem de criação, que é a
/// ordem dos cards na grade (M32).
pub type TimerId = u64;

/// Menor duração aceita: 1 s.
pub const MIN_DURATION_MS: u64 = 1000;

/// Maior duração aceita: 99:59:59, o máximo do diálogo de horas, minutos e
/// segundos do M33 (duas casas nas horas, como no Relógio).
pub const MAX_DURATION_MS: u64 = ((99 * 60 + 59) * 60 + 59) * 1000;

/// Maior nome aceito, em caracteres (o mesmo limite das tarefas, M29).
pub const MAX_NAME_CHARS: usize = 255;

/// Os temporizadores que já vêm na lista (M32): 1, 3, 5 e 10 min, sem nome.
pub const DEFAULT_MINUTES: [u64; 4] = [1, 3, 5, 10];

/// Comando recusado. Nenhum efeito é pedido na recusa (além dos fins que o
/// `advance_to` do começo do comando tenha disparado). Os textos são para o
/// registro do app.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CountdownError {
    /// Não existe temporizador com esse id.
    NotFound(TimerId),
    /// Duração fora de [`MIN_DURATION_MS`]..=[`MAX_DURATION_MS`].
    InvalidDuration,
    /// Nome com mais de [`MAX_NAME_CHARS`] caracteres.
    NameTooLong,
    /// Iniciar um que já corre.
    AlreadyRunning,
    /// Pausar um que não corre.
    NotRunning,
}

impl fmt::Display for CountdownError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NotFound(id) => write!(f, "não existe temporizador com o id {id}"),
            Self::InvalidDuration => write!(
                f,
                "a duração precisa ficar entre {} s e {} s",
                MIN_DURATION_MS / 1000,
                MAX_DURATION_MS / 1000
            ),
            Self::NameTooLong => write!(f, "o nome passa de {MAX_NAME_CHARS} caracteres"),
            Self::AlreadyRunning => f.write_str("o temporizador já está correndo"),
            Self::NotRunning => f.write_str("o temporizador não está correndo"),
        }
    }
}

impl std::error::Error for CountdownError {}

/// Como está um temporizador.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TimerStatus {
    /// Parado na duração cheia: novo ou redefinido. "Redefinir" fica
    /// desabilitado (M32).
    Idle,
    /// Correndo, antes ou depois do zero.
    Running,
    /// Pausado no meio, antes ou depois do zero.
    Paused,
}

/// Retrato de um temporizador num instante: o que vai para as janelas.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TimerSnapshot {
    pub id: TimerId,
    /// Pode ser vazio: a tela mostra a duração no lugar (M32).
    pub name: String,
    pub duration_ms: u64,
    pub status: TimerStatus,
    /// O prazo, só enquanto corre.
    pub ends_at: Option<EpochMs>,
    /// Quanto falta no instante do retrato; negativo depois do zero. Nunca
    /// passa da duração.
    pub remaining_ms: i64,
    /// Se o fim já disparou (e não foi rearmado por redefinir).
    pub ended: bool,
}

impl TimerSnapshot {
    /// Passou do zero: o tempo aparece negativo, com "Encerrado há" (M32).
    pub fn is_overdue(&self) -> bool {
        self.remaining_ms < 0 || (self.ended && self.remaining_ms == 0)
    }
}

/// Todos os temporizadores num instante, na ordem de criação.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TimersSnapshot {
    pub at: EpochMs,
    pub timers: Vec<TimerSnapshot>,
}

impl TimersSnapshot {
    pub fn get(&self, id: TimerId) -> Option<&TimerSnapshot> {
        self.timers.iter().find(|t| t.id == id)
    }
}

/// Um fim de temporizador: o app toca o som de fim de foco e notifica (M32),
/// ou só notifica, se atrasou.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TimerEnded {
    pub id: TimerId,
    pub name: String,
    pub duration_ms: u64,
    /// Quando chegou a zero (o prazo, não a hora em que o app percebeu).
    pub ended_at: EpochMs,
    /// Percebido mais de [`Timers::late_after_ms`] depois do prazo: sem som.
    pub late: bool,
}

/// O que os temporizadores pedem ao app. Cada método é chamado depois que o
/// estado já mudou.
///
/// Ordem num `advance_to` que dispara: um `timer_ended` por temporizador, na
/// ordem dos ids, e depois um `timers_changed`.
pub trait CountdownEffects {
    fn timer_ended(&mut self, ended: &TimerEnded);
    fn timers_changed(&mut self, snapshot: &TimersSnapshot);
}

/// `CountdownEffects` de teste: anota os pedidos, em ordem.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct FakeCountdownEffects {
    pub ended: Vec<TimerEnded>,
    pub changes: Vec<TimersSnapshot>,
}

impl FakeCountdownEffects {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn clear(&mut self) {
        self.ended.clear();
        self.changes.clear();
    }

    pub fn is_empty(&self) -> bool {
        self.ended.is_empty() && self.changes.is_empty()
    }

    /// Os ids que dispararam, em ordem.
    pub fn ended_ids(&self) -> Vec<TimerId> {
        self.ended.iter().map(|e| e.id).collect()
    }
}

impl CountdownEffects for FakeCountdownEffects {
    fn timer_ended(&mut self, ended: &TimerEnded) {
        self.ended.push(ended.clone());
    }

    fn timers_changed(&mut self, snapshot: &TimersSnapshot) {
        self.changes.push(snapshot.clone());
    }
}

/// M40: um temporizador como fica guardado (o `state.json` do app).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TimerRecord {
    pub id: TimerId,
    pub name: String,
    pub duration_ms: u64,
    pub run: TimerRunRecord,
    /// O fim já disparou: não dispara de novo ao abrir.
    pub ended: bool,
}

/// M40: como estava o temporizador quando foi guardado.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TimerRunRecord {
    /// Parado na duração cheia.
    Idle,
    /// Correndo: o prazo continua valendo com o app fechado.
    Running { ends_at: EpochMs },
    /// Pausado: o que faltava (negativo depois do zero).
    Paused { remaining_ms: i64 },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Run {
    Idle,
    Running { ends_at: EpochMs },
    Paused { remaining_ms: i64 },
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct Timer {
    name: String,
    duration_ms: u64,
    run: Run,
    ended: bool,
}

fn as_i64(ms: u64) -> i64 {
    i64::try_from(ms).unwrap_or(i64::MAX)
}

impl Timer {
    fn remaining_ms(&self, now: EpochMs) -> i64 {
        let cheio = as_i64(self.duration_ms);
        match self.run {
            Run::Idle => cheio,
            Run::Running { ends_at } => ends_at.ms_since(now).min(cheio),
            Run::Paused { remaining_ms } => remaining_ms.min(cheio),
        }
    }

    fn status(&self) -> TimerStatus {
        match self.run {
            Run::Idle => TimerStatus::Idle,
            Run::Running { .. } => TimerStatus::Running,
            Run::Paused { .. } => TimerStatus::Paused,
        }
    }

    fn snapshot(&self, id: TimerId, now: EpochMs) -> TimerSnapshot {
        TimerSnapshot {
            id,
            name: self.name.clone(),
            duration_ms: self.duration_ms,
            status: self.status(),
            ends_at: match self.run {
                Run::Running { ends_at } => Some(ends_at),
                _ => None,
            },
            remaining_ms: self.remaining_ms(now),
            ended: self.ended,
        }
    }
}

/// O nome como é guardado: controles viram espaço, sem espaços nas pontas.
/// Vazio é aceito (a tela mostra a duração).
pub fn clean_name(name: &str) -> Result<String, CountdownError> {
    let limpo: String = name
        .chars()
        .map(|c| if c.is_control() { ' ' } else { c })
        .collect();
    let limpo = limpo.trim();
    if limpo.chars().count() > MAX_NAME_CHARS {
        return Err(CountdownError::NameTooLong);
    }
    Ok(limpo.to_owned())
}

fn check_duration(duration_ms: u64) -> Result<(), CountdownError> {
    if (MIN_DURATION_MS..=MAX_DURATION_MS).contains(&duration_ms) {
        Ok(())
    } else {
        Err(CountdownError::InvalidDuration)
    }
}

/// O mapa de temporizadores.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Timers {
    timers: BTreeMap<TimerId, Timer>,
    last_id: TimerId,
    late_after_ms: u64,
}

impl Default for Timers {
    fn default() -> Self {
        Self::new()
    }
}

impl Timers {
    /// Sem nenhum temporizador, com a regra de atraso de 60 s.
    pub fn new() -> Self {
        Self {
            timers: BTreeMap::new(),
            last_id: 0,
            late_after_ms: LATE_AFTER_MS,
        }
    }

    /// Com os padrões de 1, 3, 5 e 10 min ([`DEFAULT_MINUTES`]), parados e
    /// sem nome, com os ids 1 a 4.
    pub fn with_defaults() -> Self {
        let mut timers = Self::new();
        for min in DEFAULT_MINUTES {
            timers.insert(String::new(), min * 60_000);
        }
        timers
    }

    /// Troca o limite do atraso, como o [`crate::Focus::with_late_after_ms`]
    /// (modo acelerado).
    #[must_use]
    pub fn with_late_after_ms(mut self, ms: u64) -> Self {
        self.late_after_ms = ms;
        self
    }

    pub fn late_after_ms(&self) -> u64 {
        self.late_after_ms
    }

    pub fn len(&self) -> usize {
        self.timers.len()
    }

    pub fn is_empty(&self) -> bool {
        self.timers.is_empty()
    }

    pub fn ids(&self) -> Vec<TimerId> {
        self.timers.keys().copied().collect()
    }

    /// Se algum corre. Com `false`, o laço do app pode dormir (3.2). Um
    /// temporizador no negativo continua correndo: a tela conta os segundos.
    pub fn any_running(&self) -> bool {
        self.timers
            .values()
            .any(|t| matches!(t.run, Run::Running { .. }))
    }

    /// O prazo mais próximo entre os que correm e ainda não dispararam.
    pub fn next_deadline(&self) -> Option<EpochMs> {
        self.timers
            .values()
            .filter(|t| !t.ended)
            .filter_map(|t| match t.run {
                Run::Running { ends_at } => Some(ends_at),
                _ => None,
            })
            .min()
    }

    pub fn get(&self, id: TimerId, now: EpochMs) -> Option<TimerSnapshot> {
        self.timers.get(&id).map(|t| t.snapshot(id, now))
    }

    pub fn snapshot(&self, now: EpochMs) -> TimersSnapshot {
        TimersSnapshot {
            at: now,
            timers: self
                .timers
                .iter()
                .map(|(id, t)| t.snapshot(*id, now))
                .collect(),
        }
    }

    fn insert(&mut self, name: String, duration_ms: u64) -> TimerId {
        self.last_id += 1;
        let id = self.last_id;
        self.timers.insert(
            id,
            Timer {
                name,
                duration_ms,
                run: Run::Idle,
                ended: false,
            },
        );
        id
    }

    fn timer_mut(&mut self, id: TimerId) -> Result<&mut Timer, CountdownError> {
        self.timers.get_mut(&id).ok_or(CountdownError::NotFound(id))
    }

    /// M40: troca a lista pela guardada, na ordem dos ids, sem pedir efeito
    /// nenhum e sem mexer no limite do atraso. Quem chama roda o
    /// [`Self::advance_to`] logo depois, com o "agora" da abertura.
    ///
    /// Cada registro passa pelas regras de criar: id 0 ou repetido, duração
    /// fora dos limites e nome longo demais são recusados (os outros entram), e
    /// a função devolve quantos foram. Os ids novos continuam depois do maior.
    /// Parado, o fim fica armado; pausado, o restante para na duração.
    pub fn restore(&mut self, records: Vec<TimerRecord>) -> usize {
        self.timers.clear();
        self.last_id = 0;
        let mut refused = 0;
        for r in records {
            let name = match clean_name(&r.name) {
                Ok(name) if r.id != 0 && !self.timers.contains_key(&r.id) => name,
                _ => {
                    refused += 1;
                    continue;
                }
            };
            if check_duration(r.duration_ms).is_err() {
                refused += 1;
                continue;
            }
            let run = match r.run {
                TimerRunRecord::Idle => Run::Idle,
                TimerRunRecord::Running { ends_at } => Run::Running { ends_at },
                TimerRunRecord::Paused { remaining_ms } => Run::Paused {
                    remaining_ms: remaining_ms.min(as_i64(r.duration_ms)),
                },
            };
            self.last_id = self.last_id.max(r.id);
            self.timers.insert(
                r.id,
                Timer {
                    name,
                    duration_ms: r.duration_ms,
                    ended: r.ended && run != Run::Idle,
                    run,
                },
            );
        }
        refused
    }

    /// Dispara o fim de cada temporizador que correndo chegou a zero até
    /// `now` e ainda não tinha disparado, e devolve quantos foram. Sem fim, não
    /// pede nenhum efeito; chamar de novo com o mesmo `now` não faz nada.
    pub fn advance_to(&mut self, now: EpochMs, fx: &mut dyn CountdownEffects) -> usize {
        let mut fins = Vec::new();
        for (id, t) in &mut self.timers {
            let Run::Running { ends_at } = t.run else {
                continue;
            };
            if t.ended || now < ends_at {
                continue;
            }
            t.ended = true;
            fins.push(TimerEnded {
                id: *id,
                name: t.name.clone(),
                duration_ms: t.duration_ms,
                ended_at: ends_at,
                late: now.ms_since_or_zero(ends_at) > self.late_after_ms,
            });
        }
        if fins.is_empty() {
            return 0;
        }
        for fim in &fins {
            fx.timer_ended(fim);
        }
        fx.timers_changed(&self.snapshot(now));
        fins.len()
    }

    /// Cria um temporizador parado (`timer_create`), no fim da lista.
    pub fn create(
        &mut self,
        now: EpochMs,
        name: &str,
        duration_ms: u64,
        fx: &mut dyn CountdownEffects,
    ) -> Result<TimerId, CountdownError> {
        self.advance_to(now, fx);
        check_duration(duration_ms)?;
        let name = clean_name(name)?;
        let id = self.insert(name, duration_ms);
        fx.timers_changed(&self.snapshot(now));
        Ok(id)
    }

    /// Troca nome e duração (`timer_update`). Só o nome mudando, o estado
    /// fica como está (correndo continua correndo). A duração mudando, o
    /// temporizador volta a parado na duração nova, com o fim rearmado.
    pub fn update(
        &mut self,
        now: EpochMs,
        id: TimerId,
        name: &str,
        duration_ms: u64,
        fx: &mut dyn CountdownEffects,
    ) -> Result<(), CountdownError> {
        self.advance_to(now, fx);
        check_duration(duration_ms)?;
        let name = clean_name(name)?;
        let t = self.timer_mut(id)?;
        t.name = name;
        if t.duration_ms != duration_ms {
            t.duration_ms = duration_ms;
            t.run = Run::Idle;
            t.ended = false;
        }
        fx.timers_changed(&self.snapshot(now));
        Ok(())
    }

    /// Exclui (`timer_delete`), em qualquer estado.
    pub fn delete(
        &mut self,
        now: EpochMs,
        id: TimerId,
        fx: &mut dyn CountdownEffects,
    ) -> Result<(), CountdownError> {
        self.advance_to(now, fx);
        self.timers
            .remove(&id)
            .ok_or(CountdownError::NotFound(id))?;
        fx.timers_changed(&self.snapshot(now));
        Ok(())
    }

    /// Inicia ou retoma (`timer_start`): o prazo vira agora + o que falta,
    /// inclusive negativo (retomar no negativo continua contando, sem
    /// disparar de novo).
    pub fn start(
        &mut self,
        now: EpochMs,
        id: TimerId,
        fx: &mut dyn CountdownEffects,
    ) -> Result<(), CountdownError> {
        self.advance_to(now, fx);
        let t = self.timer_mut(id)?;
        if matches!(t.run, Run::Running { .. }) {
            return Err(CountdownError::AlreadyRunning);
        }
        let restante = t.remaining_ms(now);
        t.run = Run::Running {
            ends_at: EpochMs(now.0.saturating_add(restante)),
        };
        fx.timers_changed(&self.snapshot(now));
        Ok(())
    }

    /// Pausa (`timer_pause`), guardando o que falta (negativo, se já passou
    /// do zero). Um fim vencido e ainda não percebido dispara antes.
    pub fn pause(
        &mut self,
        now: EpochMs,
        id: TimerId,
        fx: &mut dyn CountdownEffects,
    ) -> Result<(), CountdownError> {
        self.advance_to(now, fx);
        let t = self.timer_mut(id)?;
        if !matches!(t.run, Run::Running { .. }) {
            return Err(CountdownError::NotRunning);
        }
        t.run = Run::Paused {
            remaining_ms: t.remaining_ms(now),
        };
        fx.timers_changed(&self.snapshot(now));
        Ok(())
    }

    /// Redefine (`timer_reset`): parado na duração cheia, com o fim
    /// rearmado. Vale em qualquer estado; num parado, só confirma.
    pub fn reset(
        &mut self,
        now: EpochMs,
        id: TimerId,
        fx: &mut dyn CountdownEffects,
    ) -> Result<(), CountdownError> {
        self.advance_to(now, fx);
        let t = self.timer_mut(id)?;
        t.run = Run::Idle;
        t.ended = false;
        fx.timers_changed(&self.snapshot(now));
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nome_limpo_e_limite() {
        assert_eq!(clean_name("  Chá\tverde\n "), Ok("Chá verde".to_owned()));
        assert_eq!(clean_name(""), Ok(String::new()));
        assert_eq!(
            clean_name(&"á".repeat(255)).map(|n| n.chars().count()),
            Ok(255)
        );
        assert_eq!(
            clean_name(&"á".repeat(256)),
            Err(CountdownError::NameTooLong)
        );
    }

    #[test]
    fn limites_da_duracao() {
        assert_eq!(MAX_DURATION_MS, 359_999_000);
        assert!(check_duration(0).is_err());
        assert!(check_duration(999).is_err());
        assert!(check_duration(1000).is_ok());
        assert!(check_duration(MAX_DURATION_MS).is_ok());
        assert!(check_duration(MAX_DURATION_MS + 1).is_err());
    }

    #[test]
    fn textos_dos_erros() {
        assert!(CountdownError::NotFound(7).to_string().contains('7'));
        assert!(
            CountdownError::InvalidDuration
                .to_string()
                .contains("359999")
        );
    }
}
