// Região de entrada da janela `tomato` (PLANO.md, 5.4; M53): uma fonte única,
// em JS. A página rasteriza as mesmas formas do SVG do tomato.html (corpo,
// cabinho, as cinco sépalas e a elipse da base) num canvas fora da tela, com
// um traço em volta como folga, e devolve faixas horizontais, que o Rust
// aplica como região (M54 no Linux, M55 no Windows).
//
// Cada faixa é `[x, y, largura, altura]`, em pixels da região: no Linux, px
// lógicos (`scale` 1, o GTK escala sozinho); no Windows, px físicos (`scale`
// é o devicePixelRatio, e o SetWindowRgn recebe px de tela).
//
// O `mergeRows` junta, de linha em linha, faixas com o mesmo começo e a mesma
// largura num retângulo só. A união não muda: só diminui o número de
// retângulos (a 320 px, de 288 faixas de 1 px de altura para 162).

/** Lado do viewBox do desenho (5.10). */
export const LADO_DO_DESENHO = 320;

/**
 * As formas que a região cobre, no viewBox de 320 × 320, iguais às do
 * tomato.html (um teste confere): o corpo, o cabinho, as cinco sépalas e a
 * elipse da base (em (160,86), de 13 × 6,5), escrita como dois arcos. O anel,
 * o véu da base e os botões ficam dentro do corpo; a sombra fica de fora (o
 * clique atravessa a sombra, 5.6).
 */
export const SHAPES = Object.freeze([
  // Corpo.
  'M160 80 C190 64 236 62 268 86 C296 108 306 150 300 190 C293 252 236 298 160 298 C84 298 27 252 20 190 C14 150 24 108 52 86 C84 62 130 64 160 80 Z',
  // Cabinho.
  'M155.5 88 C155 74 157 60 160.5 47.5 Q163.5 43 169 45.5 C166 58 164.8 72 165.5 88 Z',
  // Sépalas.
  'M166 83 Q190 66 216 77 Q192 92 164 91 Z',
  'M154 83 Q130 66 104 77 Q128 92 156 91 Z',
  'M155 90 Q148 100 147 113 Q158 105 165 91 Z',
  'M165 82 Q176 64 192 60 Q186 76 168 87 Z',
  'M155 82 Q140 64 126 62 Q134 76 152 87 Z',
  // Elipse da base do cálice.
  'M147 86 A13 6.5 0 1 0 173 86 A13 6.5 0 1 0 147 86 Z',
]);

/**
 * Folga padrão em volta das formas, em px da região: o "traço de 2 px" da
 * 5.4, que passa 1 px para fora do contorno. Com os pixels da borda que o
 * traço toca (alfa acima de 0), a região fica de 1 a 2 px além do que a
 * página pinta. Com 2 (um traço de 4 px, o padrão do esboço da 5.4), ela
 * passava 3 px além em pontos das curvas (docs/decisoes.md, M53).
 */
export const FOLGA = 1;

/**
 * Faixas de 1 px de altura de uma máscara `n × n`: cada sequência de pixels
 * com alfa acima de 0, linha a linha, vira `[x, y, largura, 1]`. `rgba` é o
 * `ImageData.data` (4 bytes por pixel).
 */
export function faixasDaMascara(rgba, n) {
  const out = [];
  for (let y = 0; y < n; y++) {
    const linha = y * n * 4 + 3;
    let s = -1;
    for (let x = 0; x <= n; x++) {
      const on = x < n && rgba[linha + x * 4] > 0;
      if (on && s < 0) s = x;
      else if (!on && s >= 0) {
        out.push([s, y, x - s, 1]);
        s = -1;
      }
    }
  }
  return out;
}

/**
 * Junta faixas de linhas seguidas com o mesmo `x` e a mesma largura num
 * retângulo mais alto. Recebe faixas em ordem de linha (como as do
 * `faixasDaMascara`) e devolve retângulos `[x, y, largura, altura]` na ordem
 * em que começam. A união dos retângulos é a mesma das faixas.
 */
export function mergeRows(strips) {
  const out = [];
  // Os retângulos que ainda podem crescer, pela chave "x,largura".
  let abertos = new Map();
  let yAtual = null;
  let proximos = new Map();
  for (const [x, y, w, h] of strips) {
    if (y !== yAtual) {
      // Nova linha: só continua aberto o que a linha anterior estendeu.
      if (yAtual !== null) abertos = proximos;
      proximos = new Map();
      yAtual = y;
    }
    const chave = `${x},${w}`;
    const r = abertos.get(chave);
    if (r && r[1] + r[3] === y) {
      r[3] += h;
      proximos.set(chave, r);
    } else {
      const novo = [x, y, w, h];
      out.push(novo);
      proximos.set(chave, novo);
    }
  }
  return out;
}

/** Um canvas `n × n` para rasterizar: o OffscreenCanvas, ou um <canvas> sem ele. */
function canvasPadrao(n) {
  if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(n, n);
  const c = document.createElement('canvas');
  c.width = n;
  c.height = n;
  return c;
}

/**
 * As faixas da região para uma janela de `sizeCss` × `sizeCss` px CSS (240,
 * 280 ou 320), com `scale` px de região por px CSS (Linux: 1; Windows: o
 * devicePixelRatio) e `margin` px de folga em volta das formas.
 *
 * A folga é um traço de `2 × margin` px centrado no contorno: `margin` px
 * para fora. Um pixel entra se o preenchimento ou o traço o toca, mesmo que
 * pouco (alfa acima de 0), então a região cobre inteiros os pixels da borda,
 * que o SVG pinta com antisserrilhado. O canvas é do mesmo motor que pinta a
 * página (o WebKitGTK no Linux, o WebView2 no Windows).
 */
export function regionStrips(sizeCss, scale = 1, margin = FOLGA, { criarCanvas = canvasPadrao } = {}) {
  const n = Math.round(sizeCss * scale);
  if (!(n > 0)) return [];
  const k = n / LADO_DO_DESENHO;
  // willReadFrequently: canvas na CPU, sem copiar da GPU no getImageData.
  const g = criarCanvas(n).getContext('2d', { willReadFrequently: true });
  g.scale(k, k);
  g.lineWidth = (2 * margin) / k;
  g.lineJoin = 'round';
  for (const d of SHAPES) {
    const p = new Path2D(d);
    g.fill(p);
    if (margin > 0) g.stroke(p);
  }
  return mergeRows(faixasDaMascara(g.getImageData(0, 0, n, n).data, n));
}
