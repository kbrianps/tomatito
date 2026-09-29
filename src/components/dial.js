// Mostrador da sessão em andamento (M18), feito à mão em SVG (PLANO.md, 1.1 e
// 3.8), como o do Relógio (~/dev/tomatito-ref/crop-insession.png): um disco
// com 24 traços em volta, um deles aceso, e no centro os minutos restantes.
//
// Medidas da captura (a 175%), em px CSS: o disco tem 280 de diâmetro num
// cartão de 448 (62%); cada traço tem 23 × 6 com as pontas redondas, de 98 a
// 121 do centro. O SVG usa essas medidas no viewBox (280 × 280) e o CSS
// escala o conjunto com o cartão (shell.css, .tt-mostrador): os traços, o
// número e a unidade crescem e encolhem juntos.
//
// O traço aceso (`litTick`) tem dois modos, para comparar a olho (o marco
// pede): o progresso do período (padrão; anda um traço a cada 1/24 da fase) e
// uma volta por minuto (um traço a cada 2,5 s). O modo vem do atributo
// `data-tt-mostrador` do <html>: no DevTools,
// `document.documentElement.dataset.ttMostrador = 'minuto'` troca na hora;
// sem o atributo, ou com 'periodo', vale o progresso. Não é gravado.

export const TRACOS = 24;
/** Lado do viewBox, em px CSS da captura. */
export const LADO = 280;
const CENTRO = LADO / 2;
/** Raio do disco: meio pixel para dentro, para a borda de 1 px caber. */
export const RAIO_DISCO = CENTRO - 0.5;
/**
 * Um traço: a linha vai de `de` a `ate` (distâncias do centro) e a ponta
 * redonda soma meia largura em cada lado, o que dá 23 × 6 de 98 a 121.
 */
export const TRACO = Object.freeze({ de: 101, ate: 118, largura: 6 });

export const MODOS = Object.freeze(['periodo', 'minuto']);
export const MODO_PADRAO = 'periodo';

const r3 = (n) => Math.round(n * 1000) / 1000;

/**
 * As pontas das linhas dos 24 traços, no viewBox: o 0 em cima (12 h) e os
 * demais no sentido horário, a cada 15°.
 */
export function tracos() {
  return Array.from({ length: TRACOS }, (_, i) => {
    const a = (i / TRACOS) * 2 * Math.PI;
    const [sen, cos] = [Math.sin(a), Math.cos(a)];
    return {
      x1: r3(CENTRO + TRACO.de * sen),
      y1: r3(CENTRO - TRACO.de * cos),
      x2: r3(CENTRO + TRACO.ate * sen),
      y2: r3(CENTRO - TRACO.ate * cos),
    };
  });
}

/** O modo pedido, ou o padrão para um valor desconhecido. */
export const modoValido = (modo) => (MODOS.includes(modo) ? modo : MODO_PADRAO);

/**
 * Qual dos 24 traços fica aceso (0 em cima, sentido horário).
 *   - 'periodo': o progresso da fase, ⌊decorrido / duração × 24⌋, de 0 no
 *     início a 23 no último 1/24;
 *   - 'minuto': uma volta por minuto de fase decorrido, ⌊(decorrido mod 60 s)
 *     / 60 s × 24⌋.
 * `duracaoMs` e `restanteMs` estão no relógio do motor (o mesmo do
 * `remainingMs`). Duração inválida dá o traço 0; o restante fica entre 0 e a
 * duração.
 */
export function litTick({ duracaoMs, restanteMs, modo = MODO_PADRAO }) {
  if (!Number.isFinite(duracaoMs) || duracaoMs <= 0) return 0;
  const restante = Number.isFinite(restanteMs) ? Math.min(Math.max(restanteMs, 0), duracaoMs) : duracaoMs;
  const decorrido = duracaoMs - restante;
  if (modoValido(modo) === 'minuto') return Math.floor(((decorrido % 60_000) / 60_000) * TRACOS) % TRACOS;
  return Math.min(TRACOS - 1, Math.floor((decorrido / duracaoMs) * TRACOS));
}

/**
 * HTML do mostrador. O conjunto é um `role="img"` com o rótulo por extenso
 * (quem chama o atualiza uma vez por minuto); o SVG e o número ficam fora da
 * árvore de acessibilidade (o número muda sozinho e não tem aria-live, 3.8).
 */
export function marcacao({ aceso = 0, minutos = 0, unidade = 'min', rotulo = '' } = {}) {
  const linhas = tracos()
    .map(
      (t, i) =>
        `<line class="tt-mostrador-traco" data-traco="${i}"${i === aceso ? ' data-aceso' : ''} ` +
        `x1="${t.x1}" y1="${t.y1}" x2="${t.x2}" y2="${t.y2}"/>`,
    )
    .join('');
  return (
    `<div class="tt-mostrador" role="img" aria-label="${rotulo}" data-mostrador data-largura="--tt-larg-mostrador">` +
    `<svg class="tt-mostrador-svg" viewBox="0 0 ${LADO} ${LADO}" aria-hidden="true" focusable="false">` +
    `<circle class="tt-mostrador-disco" cx="${CENTRO}" cy="${CENTRO}" r="${RAIO_DISCO}"/>${linhas}</svg>` +
    `<p class="tt-mostrador-centro" aria-hidden="true">` +
    `<span class="tt-mostrador-numero tt-num" data-minutos>${minutos}</span>` +
    `<span class="tt-mostrador-unidade"> ${unidade}</span></p></div>`
  );
}

/**
 * Liga o mostrador já desenhado. Devolve `{ acender(i), minutos(n),
 * rotular(texto) }`, que só mexem no DOM quando o valor muda.
 */
export function ligarMostrador(raiz) {
  const el = raiz.matches?.('[data-mostrador]') ? raiz : raiz.querySelector('[data-mostrador]');
  const linhas = [...el.querySelectorAll('[data-traco]')];
  const numero = el.querySelector('[data-minutos]');
  let aceso = linhas.findIndex((l) => l.hasAttribute('data-aceso'));
  return {
    acender(i) {
      if (i === aceso) return;
      linhas[aceso]?.removeAttribute('data-aceso');
      linhas[i]?.setAttribute('data-aceso', '');
      aceso = i;
    },
    minutos(n) {
      const texto = String(n);
      if (numero.textContent !== texto) numero.textContent = texto;
    },
    rotular(texto) {
      if (el.getAttribute('aria-label') !== texto) el.setAttribute('aria-label', texto);
    },
  };
}
