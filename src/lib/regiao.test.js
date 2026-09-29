// Testes das faixas da região do tomate (M53; PLANO.md, 5.4), sem DOM. A
// rasterização de verdade (a cobertura, a folga, a contagem e o tempo) é
// conferida no Chrome e no WebKitGTK pelo scripts/preview/regiao.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FOLGA, LADO_DO_DESENHO, SHAPES, faixasDaMascara, mergeRows, regionStrips } from './regiao.js';
import { caminhoDasFaixas, resumoDaRegiao } from './regiao-debug.js';

/** Uma máscara RGBA `n × n` a partir de linhas de texto ("#" = pintado). */
function mascara(linhas) {
  const n = linhas.length;
  const rgba = new Uint8ClampedArray(n * n * 4);
  linhas.forEach((l, y) => [...l].forEach((c, x) => (rgba[(y * n + x) * 4 + 3] = c === '#' ? 255 : 0)));
  return { rgba, n };
}

/** Os pixels cobertos por retângulos `[x, y, w, h]`, como "x,y". */
function pixels(retangulos) {
  const s = new Set();
  for (const [x, y, w, h] of retangulos) for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) s.add(`${i},${j}`);
  return s;
}

test('regiao: faixasDaMascara acha cada sequência pintada, linha a linha, até a borda', () => {
  const { rgba, n } = mascara(['.##.#', '.....', '#####', '..#..', '....#']);
  assert.deepEqual(faixasDaMascara(rgba, n), [
    [1, 0, 2, 1],
    [4, 0, 1, 1],
    [0, 2, 5, 1],
    [2, 3, 1, 1],
    [4, 4, 1, 1],
  ]);
});

test('regiao: faixasDaMascara conta qualquer alfa acima de 0 (a borda antisserrilhada)', () => {
  const rgba = new Uint8ClampedArray(3 * 3 * 4);
  rgba[(1 * 3 + 0) * 4 + 3] = 1;
  rgba[(1 * 3 + 1) * 4 + 3] = 255;
  rgba[(1 * 3 + 0) * 4 + 0] = 255; // cor sem alfa não conta
  rgba[(2 * 3 + 2) * 4 + 0] = 255;
  assert.deepEqual(faixasDaMascara(rgba, 3), [[0, 1, 2, 1]]);
});

test('regiao: mergeRows junta faixas iguais em linhas seguidas', () => {
  const { rgba, n } = mascara(['.##..', '.##..', '.##.#', '.###.', '.##..']);
  assert.deepEqual(mergeRows(faixasDaMascara(rgba, n)), [
    [1, 0, 2, 3],
    [4, 2, 1, 1],
    [1, 3, 3, 1],
    [1, 4, 2, 1],
  ]);
});

test('regiao: mergeRows não junta através de uma linha vazia nem com outro x ou outra largura', () => {
  const { rgba, n } = mascara(['##...', '.....', '##...', '.##..', '.###.']);
  assert.deepEqual(mergeRows(faixasDaMascara(rgba, n)), [
    [0, 0, 2, 1],
    [0, 2, 2, 1],
    [1, 3, 2, 1],
    [1, 4, 3, 1],
  ]);
  assert.deepEqual(mergeRows([]), []);
});

test('regiao: mergeRows mantém a união das faixas (máscaras aleatórias)', () => {
  let semente = 53;
  const aleatorio = () => ((semente = (semente * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  for (let k = 0; k < 50; k++) {
    const n = 12;
    // Linhas repetidas de propósito, para haver o que juntar.
    const base = Array.from({ length: 4 }, () => Array.from({ length: n }, () => (aleatorio() < 0.5 ? '#' : '.')).join(''));
    const linhas = Array.from({ length: n }, () => base[Math.floor(aleatorio() * base.length)]);
    const { rgba } = mascara(linhas);
    const faixas = faixasDaMascara(rgba, n);
    const juntas = mergeRows(faixas);
    assert.deepEqual(pixels(juntas), pixels(faixas));
    assert.ok(juntas.length <= faixas.length);
    // Sem sobreposição: a soma das áreas é o número de pixels.
    assert.equal(juntas.reduce((s, [, , w, h]) => s + w * h, 0), pixels(faixas).size);
  }
});

test('regiao: regionStrips rasteriza as formas com o traço de folga, no lado × escala', () => {
  const chamadas = [];
  const Path2DAntes = globalThis.Path2D;
  globalThis.Path2D = class {
    constructor(d) {
      this.d = d;
    }
  };
  try {
    const criarCanvas = (n) => ({
      getContext(tipo, opcoes) {
        chamadas.push(['getContext', tipo, opcoes, n]);
        return {
          scale: (a, b) => chamadas.push(['scale', a, b]),
          set lineWidth(v) {
            chamadas.push(['lineWidth', v]);
          },
          set lineJoin(v) {
            chamadas.push(['lineJoin', v]);
          },
          fill: (p) => chamadas.push(['fill', p.d]),
          stroke: (p) => chamadas.push(['stroke', p.d]),
          getImageData: (x, y, w, h) => {
            chamadas.push(['getImageData', x, y, w, h]);
            // Um quadrado pintado de 2 × 2 no meio.
            const data = new Uint8ClampedArray(w * h * 4);
            for (const [i, j] of [[1, 1], [2, 1], [1, 2], [2, 2]]) data[(j * w + i) * 4 + 3] = 200;
            return { data };
          },
        };
      },
    });
    const faixas = regionStrips(280, 1.5, 2, { criarCanvas });
    assert.deepEqual(faixas, [[1, 1, 2, 2]]);
    const n = 420;
    const k = n / LADO_DO_DESENHO;
    assert.deepEqual(chamadas.slice(0, 4), [
      ['getContext', '2d', { willReadFrequently: true }, n],
      ['scale', k, k],
      ['lineWidth', 4 / k],
      ['lineJoin', 'round'],
    ]);
    const formas = chamadas.filter(([c]) => c === 'fill' || c === 'stroke');
    assert.deepEqual(formas, SHAPES.flatMap((d) => [['fill', d], ['stroke', d]]));
    assert.deepEqual(chamadas.at(-1), ['getImageData', 0, 0, n, n]);
    // Sem janela (lado 0), nenhuma faixa e nenhum canvas.
    chamadas.length = 0;
    assert.deepEqual(regionStrips(0, 1, 2, { criarCanvas }), []);
    assert.equal(chamadas.length, 0);
    // Sem folga, só o preenchimento.
    regionStrips(240, 1, 0, { criarCanvas });
    assert.equal(chamadas.filter(([c]) => c === 'stroke').length, 0);
    // A folga padrão é o traço de 2 px da 5.4 (1 px para fora).
    chamadas.length = 0;
    regionStrips(240, 1, undefined, { criarCanvas });
    assert.deepEqual(chamadas.find(([c]) => c === 'lineWidth'), ['lineWidth', 2 / (240 / LADO_DO_DESENHO)]);
  } finally {
    globalThis.Path2D = Path2DAntes;
  }
  assert.equal(FOLGA, 1);
});

test('regiao: as formas são as do tomato.html (corpo, cabinho, cinco sépalas e a elipse da base)', () => {
  const html = readFileSync(new URL('../../tomato.html', import.meta.url), 'utf8');
  const d = (re) => [...html.matchAll(re)].map((m) => m[1]);
  const corpo = d(/id="body-shape"\s+d="([^"]+)"/g);
  const cabinho = d(/<path class="stem" d="([^"]+)"/g);
  const calice = html.slice(html.indexOf('<g class="calyx">'), html.indexOf('</g>', html.indexOf('<g class="calyx">')));
  const sepalas = d(/<path d="([^"]+)"/g).filter((x) => calice.includes(x));
  const elipse = /<ellipse cx="([\d.]+)" cy="([\d.]+)" rx="([\d.]+)" ry="([\d.]+)"/.exec(calice).slice(1).map(Number);
  assert.equal(corpo.length, 1);
  assert.equal(cabinho.length, 1);
  assert.equal(sepalas.length, 5);
  const [cx, cy, rx, ry] = elipse;
  const arco = `M${cx - rx} ${cy} A${rx} ${ry} 0 1 0 ${cx + rx} ${cy} A${rx} ${ry} 0 1 0 ${cx - rx} ${cy} Z`;
  assert.deepEqual([...SHAPES], [...corpo, ...cabinho, ...sepalas, arco]);
  assert.ok(Object.isFrozen(SHAPES));
});

test('regiao: a sobreposição de debug desenha um retângulo por faixa e resume a região', () => {
  assert.equal(caminhoDasFaixas([[1, 2, 3, 4], [0, 6, 10, 1]]), 'M1 2h3v4h-3ZM0 6h10v1h-10Z');
  assert.equal(caminhoDasFaixas([]), '');
  assert.equal(resumoDaRegiao({ faixas: new Array(167), ms: 0.74, lado: 320, escala: 1 }), '167 retângulos · 0,7 ms · 320 px');
  assert.equal(resumoDaRegiao({ faixas: [], ms: 3, lado: 280, escala: 1.5 }), '0 retângulos · 3 ms · 280 px × 1,5');
});
