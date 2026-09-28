// Anel de progresso em SVG (M27; PLANO.md, 3.7 e 3.8), o do cartão "Progresso
// diário" e, a partir do M31, o de cada temporizador. Feito à mão, como o
// mostrador (dial.js): um trilho (`--tt-ring-track`) e, por cima, o arco
// (`--tt-ring-progress`) com as pontas redondas.
//
// O arco começa às 12 h e cresce no sentido horário: o círculo do SVG começa
// às 3 h e corre no sentido horário da tela (o y cresce para baixo), então
// basta girá-lo −90° em torno do centro. O comprimento visível sai do
// `stroke-dasharray` (um traço do tamanho da circunferência) e do
// `stroke-dashoffset` (a parte que falta), que o CSS anima em 1 s, linear
// (shell.css, .tt-anel-arco). O primeiro valor vem no atributo; as mudanças,
// pela propriedade CSS (`style.setProperty`, que a CSP aceita, 3.8), que
// dispara a transição nos dois motores.
//
// Com a fração 0, o arco fica escondido (`data-vazio`): um traço de
// comprimento zero com ponta redonda ainda desenharia um ponto às 12 h.
//
// O conjunto é um `role="img"` com o rótulo por extenso; o SVG e o que for
// posto no centro ficam fora da árvore de acessibilidade.

/** Lado do viewBox e espessura padrão: as do anel do Relógio (206 e 18 px CSS, M27). */
export const LADO = 206;
export const ESPESSURA = 18;

const r3 = (n) => Math.round(n * 1000) / 1000;

/** O raio do meio do traço e a circunferência, para um lado e uma espessura. */
export function geometria(lado = LADO, espessura = ESPESSURA) {
  const raio = (lado - espessura) / 2;
  return { centro: lado / 2, raio, circunferencia: 2 * Math.PI * raio };
}

/** A fração entre 0 e 1 (inválida vale 0; acima de 1, o círculo cheio). */
export const fracaoValida = (f) => (Number.isFinite(f) ? Math.min(Math.max(f, 0), 1) : 0);

/** O `stroke-dashoffset` de uma fração: a circunferência vezes o que falta. */
export function deslocamento(fracao, circunferencia) {
  return r3(circunferencia * (1 - fracaoValida(fracao)));
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/**
 * HTML do anel. `centro` é o HTML posto no meio (fica `aria-hidden`); `classe`
 * vai no elemento de fora, junto com `tt-anel`.
 */
export function marcacao({ fracao = 0, rotulo = '', centro = '', classe = '', lado = LADO, espessura = ESPESSURA } = {}) {
  const g = geometria(lado, espessura);
  const f = fracaoValida(fracao);
  const c = r3(g.circunferencia);
  const circulo = `cx="${g.centro}" cy="${g.centro}" r="${r3(g.raio)}" stroke-width="${espessura}"`;
  return (
    `<div class="tt-anel${classe ? ` ${classe}` : ''}" role="img" aria-label="${esc(rotulo)}" data-anel>` +
    `<svg class="tt-anel-svg" viewBox="0 0 ${lado} ${lado}" aria-hidden="true" focusable="false">` +
    `<circle class="tt-anel-trilho" ${circulo}/>` +
    `<circle class="tt-anel-arco" ${circulo} transform="rotate(-90 ${g.centro} ${g.centro})" ` +
    `stroke-dasharray="${c}" stroke-dashoffset="${deslocamento(f, g.circunferencia)}"${f === 0 ? ' data-vazio' : ''}/>` +
    `</svg>` +
    (centro ? `<div class="tt-anel-centro" aria-hidden="true">${centro}</div>` : '') +
    `</div>`
  );
}

/**
 * Liga o anel já desenhado. Devolve `{ progresso(f, { animar }), rotular(texto) }`,
 * que só mexem no DOM quando o valor muda. Com `animar: false`, o arco vai
 * direto ao valor, sem a transição de 1 s (a primeira leitura do cartão, por
 * exemplo, não "enche" o anel ao abrir a tela).
 */
export function ligarAnel(raiz) {
  const el = raiz.matches?.('[data-anel]') ? raiz : raiz.querySelector('[data-anel]');
  const arco = el.querySelector('.tt-anel-arco');
  const lado = Number(el.querySelector('svg').getAttribute('viewBox').split(' ')[2]);
  const espessura = Number(arco.getAttribute('stroke-width'));
  const { circunferencia } = geometria(lado, espessura);
  let atual = String(arco.getAttribute('stroke-dashoffset'));
  return {
    progresso(fracao, { animar = true } = {}) {
      const f = fracaoValida(fracao);
      const d = String(deslocamento(f, circunferencia));
      if (f === 0 && !arco.hasAttribute('data-vazio')) arco.setAttribute('data-vazio', '');
      else if (f > 0 && arco.hasAttribute('data-vazio')) arco.removeAttribute('data-vazio');
      if (d === atual) return;
      if (!animar) {
        arco.setAttribute('data-sem-transicao', '');
        arco.style.setProperty('stroke-dashoffset', `${d}px`);
        // Força o estilo com o valor novo antes de devolver a transição.
        void arco.getBoundingClientRect?.();
        arco.removeAttribute('data-sem-transicao');
      } else {
        arco.style.setProperty('stroke-dashoffset', `${d}px`);
      }
      atual = d;
    },
    rotular(texto) {
      if (el.getAttribute('aria-label') !== texto) el.setAttribute('aria-label', texto);
    },
  };
}
