// Testes da tela Cronômetro (M34) sem DOM: a aparência de cada estado
// (tempo, ação do botão de destaque, botões habilitados), o rótulo do número
// e o HTML. O desenho e o teclado são conferidos na prévia
// (scripts/preview/cronometro.mjs) e no app (roteiro aninhado cronometro).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acaoPrincipal, aparencia, marcacao, rotulo } from './stopwatch.js';

const c = (status, decorrido = 0) => ({ seq: 1, at: 0, status, startedAt: status === 'running' ? 0 : null, accumulatedMs: 0, elapsedMs: decorrido, laps: [] });

test('ação principal por estado', () => {
  assert.equal(acaoPrincipal('idle'), 'iniciar');
  assert.equal(acaoPrincipal('running'), 'pausar');
  assert.equal(acaoPrincipal('paused'), 'retomar');
  assert.equal(acaoPrincipal(undefined), 'iniciar');
});

test('zerado: volta e redefinir desabilitados', () => {
  const a = aparencia(c('idle'));
  assert.equal(a.tempo.texto, '00:00:00,00');
  assert.deepEqual([a.acao, a.podeVolta, a.podeRedefinir, a.rotulo], ['iniciar', false, false, 'Cronômetro zerado']);
  assert.deepEqual(aparencia(null).status, 'idle', 'sem retrato, zerado');
});

test('correndo: volta e redefinir habilitados, o decorrido de agora', () => {
  const a = aparencia(c('running', 1_000), 61_879);
  assert.equal(a.tempo.texto, '00:01:01,87');
  assert.deepEqual([a.acao, a.podeVolta, a.podeRedefinir], ['pausar', true, true]);
  assert.equal(a.rotulo, 'Cronômetro correndo, 1 minuto');
});

test('pausado: volta desabilitada, redefinir habilitado', () => {
  const a = aparencia(c('paused', 65_430));
  assert.deepEqual([a.acao, a.podeVolta, a.podeRedefinir], ['retomar', false, true]);
  assert.equal(a.rotulo, 'Cronômetro pausado em 00:01:05,43');
});

test('rótulo correndo muda só a cada minuto', () => {
  assert.equal(rotulo('running', 0), 'Cronômetro correndo, 0 minutos');
  assert.equal(rotulo('running', 59_999), 'Cronômetro correndo, 0 minutos');
  assert.equal(rotulo('running', 120_000), 'Cronômetro correndo, 2 minutos');
});

test('HTML: número com unidades, centésimos depois da vírgula e três botões de 64 px', () => {
  const html = marcacao(c('running'), { decorrido: 3_723_450, icone: (n, g) => `[${n}:${g}]` });
  assert.match(html, /role="img" aria-label="Cronômetro correndo, 62 minutos"/);
  assert.match(html, /data-horas>01<\/span><span class="tt-cronometro-unidade">h</);
  assert.match(html, /data-minutos>02<\/span><span class="tt-cronometro-unidade">min</);
  assert.match(html, /data-segundos>03<\/span><span class="tt-cronometro-unidade">s</);
  assert.match(html, /class="tt-cronometro-centesimos">,<span data-centesimos>45</);
  const botoes = [...html.matchAll(/<button[^>]*class="tt-circular tt-grande([^"]*)" data-acao="(\w+)" aria-label="([^"]+)"[^>]*?( disabled)?>(\[[^\]]+\])/g)].map((m) => [m[2], m[3], m[1].trim(), Boolean(m[4]), m[5]]);
  assert.deepEqual(botoes, [
    ['pausar', 'Pausar', 'tt-accent', false, '[pause:24]'],
    ['volta', 'Marcar volta', '', false, '[flag:24]'],
    ['redefinir', 'Redefinir', '', false, '[arrow_reset:24]'],
  ]);
  const zerado = marcacao(null);
  assert.match(zerado, /data-acao="volta"[^>]* disabled/);
  assert.match(zerado, /data-acao="redefinir"[^>]* disabled/);
});
