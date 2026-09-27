import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fraseDosIntervalos, intervalos, minutosPorExtenso, minutosRestantes, mmss, plurais } from './format.js';

test('mm:ss arredonda o segundo para cima', () => {
  assert.equal(mmss(25 * 60_000), '25:00');
  assert.equal(mmss(25 * 60_000 - 1), '25:00');
  assert.equal(mmss(25 * 60_000 - 1000), '24:59');
  assert.equal(mmss(1650_000), '27:30');
  assert.equal(mmss(1), '00:01');
  assert.equal(mmss(999), '00:01');
  assert.equal(mmss(1000), '00:01');
  assert.equal(mmss(1001), '00:02');
});

test('mm:ss no fim e com valores fora da faixa', () => {
  assert.equal(mmss(0), '00:00');
  assert.equal(mmss(-5000), '00:00');
  assert.equal(mmss(NaN), '00:00');
  assert.equal(mmss(undefined), '00:00');
  assert.equal(mmss(null), '00:00');
});

test('mm:ss não para em 59 minutos', () => {
  assert.equal(mmss(60 * 60_000), '60:00');
  assert.equal(mmss(240 * 60_000), '240:00');
});

// M17: plurais e a frase dos intervalos.
const PADRAO = { focusMinutes: 25, breakMinutes: 5 };

test('intervalos: os exemplos do plan.rs (30, 45, 60, 90 e 185 min, com F = 25 e B = 5)', () => {
  // Os mesmos de exemplos_da_regra e cento_e_oitenta_e_cinco_min_... (plan.rs).
  assert.equal(intervalos(30, PADRAO), 0);
  assert.equal(intervalos(45, PADRAO), 1);
  assert.equal(intervalos(60, PADRAO), 1);
  assert.equal(intervalos(90, PADRAO), 2);
  assert.equal(intervalos(185, PADRAO), 6);
});

test('intervalos: as bordas da regra, a faixa inteira e o "Pular intervalos"', () => {
  assert.equal(intervalos(1, PADRAO), 0);
  assert.equal(intervalos(31, PADRAO), 1, 'T − 1 = F + B: o primeiro intervalo');
  assert.equal(intervalos(61, PADRAO), 2);
  assert.equal(intervalos(240, PADRAO), 7);
  for (let m = 1; m <= 240; m++) {
    const n = intervalos(m, PADRAO);
    // intervalos·(F + B) ≤ T − 1 < (intervalos + 1)·(F + B): sobra foco em cada bloco.
    assert.ok(n * 30 <= m - 1 && m - 1 < (n + 1) * 30, `T = ${m}`);
    assert.equal(intervalos(m, PADRAO, true), 0);
  }
  assert.equal(intervalos(60, { focusMinutes: 50, breakMinutes: 10 }), 0);
  assert.equal(intervalos(120, { focusMinutes: 50, breakMinutes: 10 }), 1);
});

test('intervalos: entrada inválida dá 0', () => {
  assert.equal(intervalos(0, PADRAO), 0);
  assert.equal(intervalos(60, { focusMinutes: 25, breakMinutes: 0 }), 0);
  assert.equal(intervalos(60, { focusMinutes: 0, breakMinutes: 5 }), 0);
  assert.equal(intervalos(NaN, PADRAO), 0);
  assert.equal(intervalos(60.5, PADRAO), 0);
});

test('frase dos intervalos com PluralRules, e "Sem intervalos." no zero', () => {
  assert.equal(fraseDosIntervalos(0), 'Sem intervalos.');
  assert.equal(fraseDosIntervalos(1), 'Você terá 1 intervalo.');
  assert.equal(fraseDosIntervalos(2), 'Você terá 2 intervalos.');
  assert.equal(fraseDosIntervalos(7), 'Você terá 7 intervalos.');
  assert.equal(fraseDosIntervalos(intervalos(60, PADRAO)), 'Você terá 1 intervalo.');
  assert.equal(fraseDosIntervalos(intervalos(60, PADRAO, true)), 'Sem intervalos.');
});

test('minutos por extenso e a escolha da forma', () => {
  assert.equal(minutosPorExtenso(1), '1 minuto');
  assert.equal(minutosPorExtenso(5), '5 minutos');
  assert.equal(minutosPorExtenso(25), '25 minutos');
  assert.equal(minutosPorExtenso(240), '240 minutos');
  // Em pt-BR, o 0 é "one" no Intl.PluralRules: por isso a frase trata o zero à parte.
  assert.equal(new Intl.PluralRules('pt-BR').select(0), 'one');
  assert.equal(plurais(3, { other: (n) => `${n}x` }), '3x', 'sem a forma da categoria, usa a other');
});

test('M18: minutos restantes do mostrador, arredondados para cima', () => {
  assert.equal(minutosRestantes(25 * 60_000), 25);
  assert.equal(minutosRestantes(25 * 60_000 - 1), 25);
  assert.equal(minutosRestantes(24 * 60_000), 24);
  assert.equal(minutosRestantes(24 * 60_000 + 1), 25);
  assert.equal(minutosRestantes(1), 1);
  assert.equal(minutosRestantes(59_999), 1);
  assert.equal(minutosRestantes(240 * 60_000), 240);
  for (const v of [0, -5, NaN, null, undefined, Infinity]) assert.equal(minutosRestantes(v), 0, String(v));
});
