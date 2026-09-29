// Testes do mostrador (M18) sem DOM: a geometria dos 24 traços, o traço aceso
// nos dois modos e a marcação. O desenho na tela é conferido na prévia
// (scripts/preview/mostrador.mjs) e no teste aninhado (roteiro mostrador).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LADO, litTick, marcacao, modoValido, RAIO_DISCO, TRACO, TRACOS, tracos } from './dial.js';

test('24 traços de 23 × 6 com ponta redonda, de 98 a 121 do centro, a cada 15° a partir das 12 h', () => {
  const ts = tracos();
  assert.equal(ts.length, TRACOS);
  assert.equal(TRACOS, 24);
  // Comprimento visível: a linha mais meia largura em cada ponta.
  assert.equal(TRACO.ate - TRACO.de + TRACO.largura, 23);
  assert.equal(TRACO.largura, 6);
  assert.equal(TRACO.de - TRACO.largura / 2, 98);
  assert.equal(TRACO.ate + TRACO.largura / 2, 121);
  const c = LADO / 2;
  // 0 em cima, 6 à direita (3 h), 12 embaixo e 18 à esquerda.
  assert.deepEqual(ts[0], { x1: c, y1: c - TRACO.de, x2: c, y2: c - TRACO.ate });
  assert.deepEqual(ts[6], { x1: c + TRACO.de, y1: c, x2: c + TRACO.ate, y2: c });
  assert.deepEqual(ts[12], { x1: c, y1: c + TRACO.de, x2: c, y2: c + TRACO.ate });
  assert.deepEqual(ts[18], { x1: c - TRACO.de, y1: c, x2: c - TRACO.ate, y2: c });
  for (const [i, t] of ts.entries()) {
    const ang = (Math.atan2(t.x2 - c, c - t.y2) * 180) / Math.PI;
    assert.ok(Math.abs(((ang + 360) % 360) - i * 15) < 0.01, `traço ${i} a ${ang}°`);
    assert.ok(Math.abs(Math.hypot(t.x2 - t.x1, t.y2 - t.y1) - 17) < 0.01);
  }
  // O traço cabe no disco, com folga até a borda.
  assert.ok(TRACO.ate + TRACO.largura / 2 < RAIO_DISCO);
  // O disco tem 62% do cartão da captura (280 de 448).
  assert.ok(Math.abs(LADO / 448 - 0.625) < 0.01);
});

test('litTick, modo período (padrão): ⌊decorrido / duração × 24⌋, de 0 a 23', () => {
  const d = 25 * 60_000;
  const em = (decorrido, modo) => litTick({ duracaoMs: d, restanteMs: d - decorrido, modo });
  assert.equal(em(0), 0);
  assert.equal(em(d / 24 - 1), 0);
  assert.equal(em(d / 24), 1);
  assert.equal(em(d / 4), 6, 'um quarto: 3 h');
  assert.equal(em(d / 2), 12);
  assert.equal(em(d - 1), 23);
  assert.equal(em(d), 23, 'no fim, continua no último');
  assert.equal(em(d / 2, 'periodo'), 12);
  assert.equal(em(d / 2, 'qualquer'), 12, 'modo desconhecido vale o padrão');
  // Numa sessão de 25 min, o traço avança a cada 62,5 s: 24 passos.
  const vistos = new Set();
  for (let ms = 0; ms <= d; ms += 1000) vistos.add(em(ms));
  assert.equal(vistos.size, 24);
  assert.deepEqual([...vistos], [...vistos].sort((a, b) => a - b), 'só avança');
});

test('litTick, modo minuto: uma volta por minuto de fase decorrido', () => {
  const d = 25 * 60_000;
  const em = (decorrido) => litTick({ duracaoMs: d, restanteMs: d - decorrido, modo: 'minuto' });
  assert.equal(em(0), 0);
  assert.equal(em(2_499), 0);
  assert.equal(em(2_500), 1);
  assert.equal(em(15_000), 6);
  assert.equal(em(59_999), 23);
  assert.equal(em(60_000), 0, 'volta ao topo a cada minuto');
  assert.equal(em(60_000 + 30_000), 12);
});

test('litTick: entradas fora da faixa', () => {
  assert.equal(litTick({ duracaoMs: 0, restanteMs: 0 }), 0);
  assert.equal(litTick({ duracaoMs: NaN, restanteMs: 10 }), 0);
  assert.equal(litTick({ duracaoMs: 60_000, restanteMs: null }), 0, 'sem restante: o início');
  assert.equal(litTick({ duracaoMs: 60_000, restanteMs: 120_000 }), 0, 'restante maior que a duração');
  assert.equal(litTick({ duracaoMs: 60_000, restanteMs: -5 }), 23, 'restante negativo: o fim');
  assert.equal(modoValido('minuto'), 'minuto');
  assert.equal(modoValido(undefined), 'periodo');
});

test('marcação: role="img" com rótulo, SVG e número fora da árvore de acessibilidade, um traço aceso', () => {
  const html = marcacao({ aceso: 6, minutos: 27, rotulo: '27 minutos restantes, período de foco 1 de 2' });
  assert.match(html, /^<div class="tt-mostrador" role="img" aria-label="27 minutos restantes, período de foco 1 de 2" data-mostrador data-largura="--tt-larg-mostrador">/);
  assert.match(html, /<svg class="tt-mostrador-svg" viewBox="0 0 280 280" aria-hidden="true" focusable="false">/);
  assert.match(html, /<p class="tt-mostrador-centro" aria-hidden="true">/);
  assert.match(html, /<span class="tt-mostrador-numero tt-num" data-minutos>27<\/span><span class="tt-mostrador-unidade"> min<\/span>/);
  assert.equal([...html.matchAll(/<line class="tt-mostrador-traco"/g)].length, 24);
  assert.deepEqual([...html.matchAll(/data-traco="(\d+)" data-aceso/g)].map((m) => m[1]), ['6']);
  assert.doesNotMatch(html, /aria-live|style=/, 'sem aria-live (3.8) e sem style inline (CSP)');
});
