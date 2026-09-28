import { test } from 'node:test';
import assert from 'node:assert/strict';
import { categoria, duracao, fraseDosIntervalos, intervalos, minutosInteiros, minutosPorExtenso, minutosRestantes, mmss, plurais } from './format.js';

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

// M27: as durações do cartão "Progresso diário" (PLANO.md, 3.8).
test('duração: até 59 min, "N minutos"; o zero no plural', () => {
  const d = (s) => duracao(s).texto;
  assert.equal(d(0), '0 minutos');
  assert.equal(d(59), '0 minutos', 'minutos inteiros, para baixo');
  assert.equal(d(60), '1 minuto');
  assert.equal(d(45 * 60), '45 minutos');
  assert.equal(d(59 * 60 + 59), '59 minutos');
  for (const v of [-5, NaN, null, undefined]) assert.equal(d(v), '0 minutos', String(v));
});

test('duração: a partir de 60 min, horas com uma casa decimal, sem o ",0", arredondadas para baixo', () => {
  const d = (s) => duracao(s).texto;
  assert.equal(d(60 * 60), '1 hora');
  assert.equal(d(90 * 60), '1,5 hora', 'CLDR: 1,5 fica no singular (docs/decisoes.md, M27)');
  assert.equal(d(119 * 60), '1,9 hora', 'nunca mostra mais do que foi feito');
  assert.equal(d(120 * 60), '2 horas');
  assert.equal(d(150 * 60), '2,5 horas');
  assert.equal(d(155 * 60), '2,5 horas');
  assert.equal(d(1200 * 60), '20 horas');
  assert.equal(d(100_000 * 60), '1666,6 horas', 'sem separador de milhar');
});

test('duração: número e unidade separados, para empilhar no cartão', () => {
  assert.deepEqual(duracao(150 * 60), { numero: '2,5', unidade: 'horas', texto: '2,5 horas' });
  assert.deepEqual(duracao(0), { numero: '0', unidade: 'minutos', texto: '0 minutos' });
});

test('minutos inteiros e a categoria com o zero no plural', () => {
  assert.equal(minutosInteiros(0), '0 minutos');
  assert.equal(minutosInteiros(60), '1 minuto');
  assert.equal(minutosInteiros(135 * 60 + 59), '135 minutos');
  assert.equal(categoria(0), 'other');
  assert.equal(categoria(1), 'one');
  assert.equal(categoria(2), 'other');
});

test('M32: tempo do temporizador, positivo e negativo', async () => {
  const { tempoDoTemporizador: f } = await import('./format.js');
  assert.equal(f(60_000), '00:01:00');
  assert.equal(f(59_001), '00:01:00');
  assert.equal(f(1), '00:00:01');
  assert.equal(f(0), '00:00:00');
  assert.equal(f(0, true), '-00:00:00');
  assert.equal(f(-400), '-00:00:00');
  assert.equal(f(-12_000), '-00:00:12');
  assert.equal(f(-12_999), '-00:00:12');
  assert.equal(f(-3_723_000), '-01:02:03');
  assert.equal(f(359_999_000), '99:59:59');
  assert.equal(f(-360_000_000 - 1000), '-100:00:01');
  assert.equal(f(NaN), '00:00:00');
});

test('M32: duração curta (os exemplos do timer_duration do i18n.rs)', async () => {
  const { duracaoCurta: f } = await import('./format.js');
  assert.equal(f(60_000), '1 min');
  assert.equal(f(600_000), '10 min');
  assert.equal(f(45_000), '45 s');
  assert.equal(f(90_000), '1 min 30 s');
  assert.equal(f(5_400_000), '1 h 30 min');
  assert.equal(f(3_600_000), '1 h');
  assert.equal(f(3_601_000), '1 h 1 s');
  assert.equal(f(359_999_000), '99 h 59 min 59 s');
  assert.equal(f(0), '0 s');
});

test('M34: tempoDoCronometro corta para baixo e separa os centésimos com vírgula', async () => {
  const { tempoDoCronometro } = await import('./format.js');
  assert.equal(tempoDoCronometro(0).texto, '00:00:00,00');
  assert.equal(tempoDoCronometro(1_879).texto, '00:00:01,87');
  assert.equal(tempoDoCronometro(9).texto, '00:00:00,00');
  assert.equal(tempoDoCronometro(59_999).texto, '00:00:59,99');
  assert.equal(tempoDoCronometro(60_000).texto, '00:01:00,00');
  assert.equal(tempoDoCronometro(3_723_450).texto, '01:02:03,45');
  assert.equal(tempoDoCronometro(100 * 3_600_000).texto, '100:00:00,00');
  assert.equal(tempoDoCronometro(-5).texto, '00:00:00,00');
  assert.equal(tempoDoCronometro(NaN).texto, '00:00:00,00');
  assert.deepEqual(tempoDoCronometro(1_879), { horas: '00', minutos: '00', segundos: '01', centesimos: '87', texto: '00:00:01,87' });
});
