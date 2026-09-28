//! Motor do cronômetro (PLANO.md, 3.2 e M34).
//!
//! **`started_at` mais o acumulado.** Correndo, o cronômetro guarda quando
//! começou o trecho atual (`started_at`, em ms desde a época Unix) e quanto já
//! tinha acumulado antes dele; o decorrido é `acumulado + (agora −
//! started_at)`. Pausar soma o trecho ao acumulado e apaga o `started_at`;
//! retomar abre um trecho novo. Como no foco, o tempo é de relógio de parede:
//! uma suspensão ou a janela escondida não fazem o cronômetro perder tempo, e
//! nada depende de ticks (o laço do app não precisa rodar por causa dele).
//!
//! Nenhum método lê o relógio: todos recebem o `now` de quem chama, e os
//! testes passam o `now` de um `FakeClock`.
//!
//! **Voltas.** O plano guarda as voltas no Rust (M35). Desde o M34 o botão e
//! a tecla L existem, então o núcleo já anota, a cada volta, o decorrido
//! total naquele instante; a lista na tela e o "Copiar" são do M35. Só se marca
//! volta correndo (o botão fica desabilitado parado e pausado).
//!
//! **Relógio para trás** (aceito na v1): o trecho atual nunca fica negativo,
//! e o decorrido nunca diminui dentro de um trecho medido pelo mesmo relógio.

use std::fmt;

use crate::clock::EpochMs;

/// Maior número de voltas guardadas. Um limite só para a memória e o
/// `state.json` não crescerem sem fim; o Relógio não tem limite visível.
pub const MAX_LAPS: usize = 999;

/// Comando recusado. Os textos são para o registro do app.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StopwatchError {
    /// Iniciar com o cronômetro já correndo.
    AlreadyRunning,
    /// Pausar ou marcar volta com o cronômetro parado ou pausado.
    NotRunning,
    /// Mais de [`MAX_LAPS`] voltas.
    TooManyLaps,
}

impl fmt::Display for StopwatchError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::AlreadyRunning => f.write_str("o cronômetro já está correndo"),
            Self::NotRunning => f.write_str("o cronômetro não está correndo"),
            Self::TooManyLaps => write!(f, "o cronômetro já tem {MAX_LAPS} voltas"),
        }
    }
}

impl std::error::Error for StopwatchError {}

/// Como está o cronômetro.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StopwatchStatus {
    /// Zerado: novo ou redefinido.
    Idle,
    Running,
    Paused,
}

/// Retrato do cronômetro num instante: o que vai para as janelas e para o
/// `state.json`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StopwatchSnapshot {
    pub at: EpochMs,
    pub status: StopwatchStatus,
    /// O começo do trecho atual, só correndo.
    pub started_at: Option<EpochMs>,
    /// O tempo dos trechos já fechados (pausados).
    pub accumulated_ms: u64,
    /// O decorrido em `at`: o acumulado mais o trecho atual.
    pub elapsed_ms: u64,
    /// O decorrido total em cada volta marcada, em ordem.
    pub laps: Vec<u64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Run {
    Idle,
    Running { started_at: EpochMs },
    Paused,
}

/// O cronômetro.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Stopwatch {
    run: Run,
    accumulated_ms: u64,
    laps: Vec<u64>,
}

impl Default for Stopwatch {
    fn default() -> Self {
        Self::new()
    }
}

impl Stopwatch {
    /// Zerado.
    pub fn new() -> Self {
        Self {
            run: Run::Idle,
            accumulated_ms: 0,
            laps: Vec::new(),
        }
    }

    pub fn status(&self) -> StopwatchStatus {
        match self.run {
            Run::Idle => StopwatchStatus::Idle,
            Run::Running { .. } => StopwatchStatus::Running,
            Run::Paused => StopwatchStatus::Paused,
        }
    }

    pub fn is_running(&self) -> bool {
        matches!(self.run, Run::Running { .. })
    }

    /// O decorrido em `now`.
    pub fn elapsed_ms(&self, now: EpochMs) -> u64 {
        match self.run {
            Run::Running { started_at } => self
                .accumulated_ms
                .saturating_add(now.ms_since_or_zero(started_at)),
            _ => self.accumulated_ms,
        }
    }

    pub fn snapshot(&self, now: EpochMs) -> StopwatchSnapshot {
        StopwatchSnapshot {
            at: now,
            status: self.status(),
            started_at: match self.run {
                Run::Running { started_at } => Some(started_at),
                _ => None,
            },
            accumulated_ms: self.accumulated_ms,
            elapsed_ms: self.elapsed_ms(now),
            laps: self.laps.clone(),
        }
    }

    /// Inicia (zerado) ou retoma (pausado) (`stopwatch_start`).
    pub fn start(&mut self, now: EpochMs) -> Result<(), StopwatchError> {
        if self.is_running() {
            return Err(StopwatchError::AlreadyRunning);
        }
        self.run = Run::Running { started_at: now };
        Ok(())
    }

    /// Pausa (`stopwatch_pause`): o trecho atual vai para o acumulado.
    pub fn pause(&mut self, now: EpochMs) -> Result<(), StopwatchError> {
        if !self.is_running() {
            return Err(StopwatchError::NotRunning);
        }
        self.accumulated_ms = self.elapsed_ms(now);
        self.run = Run::Paused;
        Ok(())
    }

    /// Marca uma volta (`stopwatch_lap`): anota o decorrido total agora e
    /// devolve o número da volta (a partir de 1).
    pub fn lap(&mut self, now: EpochMs) -> Result<usize, StopwatchError> {
        if !self.is_running() {
            return Err(StopwatchError::NotRunning);
        }
        if self.laps.len() >= MAX_LAPS {
            return Err(StopwatchError::TooManyLaps);
        }
        // Com o relógio para trás, uma volta nunca fica antes da anterior.
        let total = self
            .elapsed_ms(now)
            .max(self.laps.last().copied().unwrap_or(0));
        self.laps.push(total);
        Ok(self.laps.len())
    }

    /// Zera (`stopwatch_reset`), em qualquer estado, e apaga as voltas.
    /// Correndo, para: como no Relógio, redefinir deixa o cronômetro zerado e
    /// parado.
    pub fn reset(&mut self) {
        *self = Self::new();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const T0: EpochMs = EpochMs(1_790_000_000_000);

    #[test]
    fn zerado_por_padrao() {
        let s = Stopwatch::new();
        let r = s.snapshot(T0);
        assert_eq!(r.status, StopwatchStatus::Idle);
        assert_eq!(r.elapsed_ms, 0);
        assert_eq!(r.started_at, None);
        assert!(r.laps.is_empty());
    }

    #[test]
    fn textos_dos_erros() {
        assert!(StopwatchError::TooManyLaps.to_string().contains("999"));
        assert!(StopwatchError::NotRunning.to_string().contains("não"));
    }
}
