//! Motor do cronômetro (M34), pela API pública, como o app usa: o relógio é
//! um `FakeClock`, e cada comando recebe o "agora" dele.
//!
//! O "Pronto quando" do M34 pede que o cronômetro não divirja do relógio do
//! celular em 10 min e que esconder e mostrar a janela mantenha o tempo. O
//! lado do núcleo: o decorrido é só `acumulado + (agora − started_at)`, sem
//! somar ticks (`dez_minutos_*`, `sem_ticks_*`), e uma lacuna qualquer no meio
//! (janela escondida, suspensão) já sai contada na primeira leitura
//! (`lacuna_*`).

#[cfg(target_family = "wasm")]
use wasm_bindgen_test::wasm_bindgen_test as test;

use tomatito_core::{
    Clock, EpochMs, FakeClock, MAX_LAPS, Stopwatch, StopwatchError, StopwatchStatus,
};

const INICIO: EpochMs = EpochMs(1_790_000_000_000);
const S: u64 = 1000;
const MIN: u64 = 60 * S;

#[test]
fn dez_minutos_de_relogio_sao_dez_minutos_de_cronometro() {
    let relogio = FakeClock::new(INICIO);
    let mut c = Stopwatch::new();
    c.start(relogio.now()).unwrap();
    relogio.advance_ms(10 * MIN);
    assert_eq!(c.elapsed_ms(relogio.now()), 10 * MIN);
    let r = c.snapshot(relogio.now());
    assert_eq!(r.status, StopwatchStatus::Running);
    assert_eq!(r.started_at, Some(INICIO));
    assert_eq!(r.accumulated_ms, 0);
    assert_eq!(r.elapsed_ms, 600_000);
}

#[test]
fn sem_ticks_nao_ha_desvio_acumulado() {
    // Mil leituras em passos quebrados (16,667 ms, um quadro a 60 Hz) não
    // mudam nada: o decorrido não é uma soma de passos.
    let relogio = FakeClock::new(INICIO);
    let mut c = Stopwatch::new();
    c.start(relogio.now()).unwrap();
    let mut andado = 0u64;
    for i in 0..36_000u64 {
        let passo = if i % 3 == 2 { 16 } else { 17 };
        andado += passo;
        relogio.advance_ms(passo);
        assert_eq!(c.elapsed_ms(relogio.now()), andado);
    }
    assert_eq!(andado, 600_000);
}

#[test]
fn lacuna_de_janela_escondida_sai_contada_na_primeira_leitura() {
    let relogio = FakeClock::new(INICIO);
    let mut c = Stopwatch::new();
    c.start(relogio.now()).unwrap();
    relogio.advance_ms(1_234);
    // A janela some por 7 min e 3,21 s; ninguém lê o cronômetro nesse tempo.
    relogio.advance_ms(7 * MIN + 3_210);
    assert_eq!(c.elapsed_ms(relogio.now()), 7 * MIN + 4_444);
}

#[test]
fn pausar_guarda_e_retomar_continua() {
    let relogio = FakeClock::new(INICIO);
    let mut c = Stopwatch::new();
    c.start(relogio.now()).unwrap();
    relogio.advance_ms(90 * S + 250);
    c.pause(relogio.now()).unwrap();
    // Pausado, o tempo não anda.
    relogio.advance_ms(5 * MIN);
    let r = c.snapshot(relogio.now());
    assert_eq!(r.status, StopwatchStatus::Paused);
    assert_eq!(r.started_at, None);
    assert_eq!((r.accumulated_ms, r.elapsed_ms), (90_250, 90_250));
    // Retomar abre um trecho novo e soma ao acumulado.
    c.start(relogio.now()).unwrap();
    relogio.advance_ms(9_750);
    let r = c.snapshot(relogio.now());
    assert_eq!(r.started_at, Some(INICIO.plus_ms(90_250 + 5 * MIN)));
    assert_eq!((r.accumulated_ms, r.elapsed_ms), (90_250, 100_000));
}

#[test]
fn voltas_guardam_o_total_e_so_correndo() {
    let relogio = FakeClock::new(INICIO);
    let mut c = Stopwatch::new();
    assert_eq!(c.lap(relogio.now()), Err(StopwatchError::NotRunning));
    c.start(relogio.now()).unwrap();
    relogio.advance_ms(12_340);
    assert_eq!(c.lap(relogio.now()), Ok(1));
    relogio.advance_ms(10_000);
    assert_eq!(c.lap(relogio.now()), Ok(2));
    c.pause(relogio.now()).unwrap();
    assert_eq!(c.lap(relogio.now()), Err(StopwatchError::NotRunning));
    assert_eq!(c.snapshot(relogio.now()).laps, vec![12_340, 22_340]);
}

// M35: a tela deriva o tempo de cada volta da diferença entre os totais;
// pausar no meio não apaga as voltas nem entra no total da seguinte.
#[test]
fn voltas_atravessam_a_pausa_sem_contar_o_tempo_parado() {
    let relogio = FakeClock::new(INICIO);
    let mut c = Stopwatch::new();
    c.start(relogio.now()).unwrap();
    relogio.advance_ms(2_345);
    c.lap(relogio.now()).unwrap();
    relogio.advance_ms(1_000);
    c.pause(relogio.now()).unwrap();
    relogio.advance_ms(60 * S);
    assert_eq!(c.snapshot(relogio.now()).laps, vec![2_345]);
    c.start(relogio.now()).unwrap();
    relogio.advance_ms(3_655);
    assert_eq!(c.lap(relogio.now()), Ok(2));
    let laps = c.snapshot(relogio.now()).laps;
    assert_eq!(laps, vec![2_345, 7_000]);
    assert_eq!(laps[1] - laps[0], 4_655);
}

#[test]
fn limite_de_voltas() {
    let relogio = FakeClock::new(INICIO);
    let mut c = Stopwatch::new();
    c.start(relogio.now()).unwrap();
    for _ in 0..MAX_LAPS {
        relogio.advance_ms(1);
        c.lap(relogio.now()).unwrap();
    }
    assert_eq!(c.lap(relogio.now()), Err(StopwatchError::TooManyLaps));
}

#[test]
fn redefinir_zera_para_e_apaga_as_voltas() {
    let relogio = FakeClock::new(INICIO);
    let mut c = Stopwatch::new();
    c.start(relogio.now()).unwrap();
    relogio.advance_ms(3 * S);
    c.lap(relogio.now()).unwrap();
    c.reset();
    let r = c.snapshot(relogio.now());
    assert_eq!(r.status, StopwatchStatus::Idle);
    assert_eq!((r.elapsed_ms, r.accumulated_ms), (0, 0));
    assert!(r.laps.is_empty());
    // Zerado, iniciar começa do zero de novo.
    c.start(relogio.now()).unwrap();
    relogio.advance_ms(S);
    assert_eq!(c.elapsed_ms(relogio.now()), S);
}

#[test]
fn erros_de_estado() {
    let relogio = FakeClock::new(INICIO);
    let mut c = Stopwatch::new();
    assert_eq!(c.pause(relogio.now()), Err(StopwatchError::NotRunning));
    c.start(relogio.now()).unwrap();
    assert_eq!(c.start(relogio.now()), Err(StopwatchError::AlreadyRunning));
}

#[test]
fn relogio_para_tras_nao_deixa_o_trecho_negativo() {
    let relogio = FakeClock::new(INICIO);
    let mut c = Stopwatch::new();
    c.start(relogio.now()).unwrap();
    relogio.advance_ms(5 * S);
    c.lap(relogio.now()).unwrap();
    relogio.set(INICIO.plus_ms(S));
    assert_eq!(c.elapsed_ms(relogio.now()), S);
    relogio.set(EpochMs(INICIO.0 - 60_000));
    assert_eq!(c.elapsed_ms(relogio.now()), 0);
    // A volta seguinte nunca fica antes da anterior.
    c.lap(relogio.now()).unwrap();
    assert_eq!(c.snapshot(relogio.now()).laps, vec![5_000, 5_000]);
}
