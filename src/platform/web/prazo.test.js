import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MINUTO_MS,
  criarDeduplicador,
  idDaFase,
  minutosNoTitulo,
  proximaViradaDeMinuto,
  proximoPrazo,
} from './prazo.js';

const T0 = 1_790_000_000_000;

/** Um retrato mínimo no formato do `StateDto` (só o que o prazo.js lê). */
function retrato({ status = 'idle', endsAt = null, id = 7, phaseIndex = 0, timers = [] } = {}) {
  const session =
    status === 'idle'
      ? null
      : { id, phaseIndex, endsAt, phase: { kind: status === 'break' ? 'break' : 'focus', n: 1, durationS: 1500 } };
  return {
    focus: { seq: 1, status, at: T0, session },
    timers: { seq: 1, at: T0, timers },
    stopwatch: { seq: 1, at: T0, status: 'idle', startedAt: null, accumulatedMs: 0, elapsedMs: 0, laps: [] },
  };
}

const temporizador = (id, status, endsAt, extra = {}) => ({
  id,
  name: '',
  durationMs: 60_000,
  status,
  endsAt,
  remainingMs: 0,
  ended: false,
  overdue: false,
  ...extra,
});

// ---------------------------------------------------------------------------
// proximoPrazo
// ---------------------------------------------------------------------------

test('proximoPrazo: nada correndo dá null (ocioso, sem temporizador, e retrato ausente)', () => {
  assert.equal(proximoPrazo(retrato()), null);
  assert.equal(proximoPrazo(null), null);
  assert.equal(proximoPrazo(undefined), null);
  assert.equal(proximoPrazo({}), null);
  // Temporizadores parados ou em pausa não vencem.
  const parados = retrato({ timers: [temporizador(1, 'idle', null), temporizador(2, 'paused', null)] });
  assert.equal(proximoPrazo(parados), null);
});

test('proximoPrazo: foco e intervalo correndo dão o fim da fase', () => {
  assert.equal(proximoPrazo(retrato({ status: 'focus', endsAt: T0 + 25 * MINUTO_MS })), T0 + 25 * MINUTO_MS);
  assert.equal(proximoPrazo(retrato({ status: 'break', endsAt: T0 + 5 * MINUTO_MS })), T0 + 5 * MINUTO_MS);
});

test('proximoPrazo: em pausa (e concluída) a sessão não vence', () => {
  assert.equal(proximoPrazo(retrato({ status: 'paused', endsAt: null })), null);
  // Mesmo que viesse um endsAt, a pausa não corre.
  assert.equal(proximoPrazo(retrato({ status: 'paused', endsAt: T0 + 1000 })), null);
  assert.equal(proximoPrazo(retrato({ status: 'completed', endsAt: null })), null);
});

test('proximoPrazo: o menor entre a fase e os temporizadores que correm', () => {
  const r = retrato({
    status: 'focus',
    endsAt: T0 + 300_000,
    timers: [temporizador(1, 'running', T0 + 60_000), temporizador(2, 'running', T0 + 120_000)],
  });
  assert.equal(proximoPrazo(r), T0 + 60_000);
  // Sem sessão, só os temporizadores (o Engine::proximo_prazo faz o mesmo).
  const soTemporizador = retrato({ timers: [temporizador(3, 'running', T0 + 90_000)] });
  assert.equal(proximoPrazo(soTemporizador), T0 + 90_000);
  // Com a sessão em pausa, o temporizador continua valendo.
  const pausa = retrato({ status: 'paused', timers: [temporizador(3, 'running', T0 + 90_000)] });
  assert.equal(proximoPrazo(pausa), T0 + 90_000);
});

test('proximoPrazo: temporizador que já passou do zero (ended) sai da conta', () => {
  const r = retrato({
    status: 'focus',
    endsAt: T0 + 300_000,
    timers: [temporizador(1, 'running', T0 - 1000, { ended: true, overdue: true, remainingMs: -1000 })],
  });
  assert.equal(proximoPrazo(r), T0 + 300_000);
  const soVencido = retrato({
    timers: [temporizador(1, 'running', T0 - 1000, { ended: true, overdue: true })],
  });
  assert.equal(proximoPrazo(soVencido), null);
});

// ---------------------------------------------------------------------------
// proximaViradaDeMinuto
// ---------------------------------------------------------------------------

test('proximaViradaDeMinuto: no foco, o próximo múltiplo de 1 min do restante', () => {
  const fim = T0 + 25 * MINUTO_MS;
  const r = retrato({ status: 'focus', endsAt: fim });
  // 25:00 cheios: "25 min" até 24:00, que é daqui a 1 min.
  assert.equal(proximaViradaDeMinuto(r, T0), T0 + MINUTO_MS);
  // Com 24:13 faltando ("25 min"), a virada é aos 24:00.
  const agora = fim - (24 * MINUTO_MS + 13_000);
  assert.equal(proximaViradaDeMinuto(r, agora), fim - 24 * MINUTO_MS);
  assert.equal(minutosNoTitulo(r, agora), 25);
  assert.equal(minutosNoTitulo(r, fim - 24 * MINUTO_MS), 24);
  // Exatamente na virada, a seguinte é 1 min depois.
  assert.equal(proximaViradaDeMinuto(r, fim - 24 * MINUTO_MS), fim - 23 * MINUTO_MS);
  // No intervalo, a mesma regra.
  const b = retrato({ status: 'break', endsAt: T0 + 5 * MINUTO_MS });
  assert.equal(proximaViradaDeMinuto(b, T0 + 30_000), T0 + MINUTO_MS);
});

test('proximaViradaDeMinuto: em pausa, nenhuma (e ocioso ou concluído também)', () => {
  assert.equal(proximaViradaDeMinuto(retrato({ status: 'paused' }), T0), null);
  assert.equal(proximaViradaDeMinuto(retrato({ status: 'paused', endsAt: T0 + MINUTO_MS }), T0), null);
  assert.equal(proximaViradaDeMinuto(retrato(), T0), null);
  assert.equal(proximaViradaDeMinuto(retrato({ status: 'completed' }), T0), null);
  assert.equal(proximaViradaDeMinuto(null, T0), null);
});

test('proximaViradaDeMinuto: temporizador não muda o título (só a sessão, como a bandeja)', () => {
  const soTemporizador = retrato({ timers: [temporizador(1, 'running', T0 + 90_000)] });
  assert.equal(proximaViradaDeMinuto(soTemporizador, T0), null);
  assert.equal(minutosNoTitulo(soTemporizador, T0), null);
  // Com sessão, o temporizador que vence antes não entra na virada.
  const junto = retrato({ status: 'focus', endsAt: T0 + 10 * MINUTO_MS, timers: [temporizador(1, 'running', T0 + 5_000)] });
  assert.equal(proximaViradaDeMinuto(junto, T0 + 20_000), T0 + MINUTO_MS);
});

test('proximaViradaDeMinuto: fase que acaba antes da virada dá o fim da fase', () => {
  const fim = T0 + 40_000;
  const r = retrato({ status: 'focus', endsAt: fim });
  // 40 s faltando ("1 min"): não há virada de minuto antes do fim.
  assert.equal(proximaViradaDeMinuto(r, T0), fim);
  assert.equal(proximaViradaDeMinuto(r, fim - 1), fim);
  // Com a fase já vencida, nenhuma (o prazo a fecha).
  assert.equal(proximaViradaDeMinuto(r, fim), null);
  assert.equal(proximaViradaDeMinuto(r, fim + 5000), null);
  assert.equal(minutosNoTitulo(r, fim + 5000), 0);
});

// ---------------------------------------------------------------------------
// Deduplicação por fase.id
// ---------------------------------------------------------------------------

test('idDaFase: <sessão>:<índice> só com uma fase correndo', () => {
  assert.equal(idDaFase(retrato({ status: 'focus', endsAt: T0 + 1, id: 12, phaseIndex: 2 })), '12:2');
  assert.equal(idDaFase(retrato({ status: 'break', endsAt: T0 + 1, id: 12, phaseIndex: 1 })), '12:1');
  assert.equal(idDaFase(retrato({ status: 'paused', id: 12 })), null);
  assert.equal(idDaFase(retrato()), null);
});

test('criarDeduplicador: cada fase passa uma vez só', () => {
  const d = criarDeduplicador();
  const fase = idDaFase(retrato({ status: 'focus', endsAt: T0 + 1, id: 3, phaseIndex: 0 }));
  assert.equal(d.primeira(fase), true);
  assert.equal(d.primeira(fase), false);
  assert.equal(d.primeira('3:1'), true);
  assert.equal(d.primeira('3:1'), false);
  // Sem fase, nada passa.
  assert.equal(d.primeira(null), false);
  assert.equal(d.primeira(undefined), false);
  assert.equal(d.tamanho, 2);
});

test('criarDeduplicador: guarda só as mais recentes', () => {
  const d = criarDeduplicador(3);
  for (const k of ['a', 'b', 'c', 'd']) assert.equal(d.primeira(k), true);
  assert.equal(d.tamanho, 3);
  // 'a' saiu (a mais antiga); as outras continuam barradas.
  assert.equal(d.primeira('d'), false);
  assert.equal(d.primeira('a'), true);
});
