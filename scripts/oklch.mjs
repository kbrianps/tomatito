// OKLab e OKLCH à mão (PLANO.md, 4.5; marco M22), sem dependência nova.
//
// As matrizes são as de Björn Ottosson ("A perceptual color space for image
// processing", 2020), as mesmas do CSS Color 4. Aqui só o que o tingimento dos
// neutros precisa: sRGB 8 bits ↔ OKLab, OKLCH para ler croma e matiz, e a volta
// para o sRGB com o croma reduzido até caber na gama (o L e o matiz ficam).

const paraLinear = (c) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const deLinear = (c) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

/** [r, g, b] em 0–255 → [L, a, b] do OKLab. */
export function srgbParaOklab([r, g, b]) {
  const [lr, lg, lb] = [r, g, b].map(paraLinear);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** [L, a, b] do OKLab → [r, g, b] lineares (podem sair de 0–1 fora da gama). */
function oklabParaLinear([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const EPS = 1e-6;
const naGama = (lin) => lin.every((c) => c >= -EPS && c <= 1 + EPS);

/**
 * [L, a, b] → [r, g, b] inteiros em 0–255. Fora da gama, reduz o croma (a e b
 * na mesma proporção, o matiz fica) por bisseção até caber; o L é limitado a
 * 0–1 antes.
 */
export function oklabParaSrgb([L, a, b]) {
  const Lc = Math.min(1, Math.max(0, L));
  let lin = oklabParaLinear([Lc, a, b]);
  if (!naGama(lin)) {
    let dentro = 0;
    let fora = 1;
    for (let i = 0; i < 40; i++) {
      const meio = (dentro + fora) / 2;
      if (naGama(oklabParaLinear([Lc, a * meio, b * meio]))) dentro = meio;
      else fora = meio;
    }
    lin = oklabParaLinear([Lc, a * dentro, b * dentro]);
  }
  return lin.map((c) => Math.round(Math.min(255, Math.max(0, deLinear(Math.min(1, Math.max(0, c)))))));
}

/** [L, a, b] → [L, C, h] com h em graus, 0–360. */
export function oklabParaOklch([L, a, b]) {
  const h = (Math.atan2(b, a) * 180) / Math.PI;
  return [L, Math.hypot(a, b), h < 0 ? h + 360 : h];
}

/** "#rrggbb" → [r, g, b]. */
export function lerHex(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`não é #RRGGBB: ${hex}`);
  return [0, 2, 4].map((k) => parseInt(m[1].slice(k, k + 2), 16));
}

/** [r, g, b] → "#rrggbb" (minúsculas, como o @fluentui/tokens). */
export const paraHex = (rgb) => '#' + rgb.map((c) => c.toString(16).padStart(2, '0')).join('');
