// Seletor de minutos (M17), feito à mão como o NumberBox do WinUI no Relógio
// (clock-focus-sessions-page.png): 160 × 87, com o campo de 111 px (o número
// e a unidade "min" embaixo) e a coluna de chevrons de 48, separados por 1 px,
// e o sublinhado em --tt-stroke-control. O desenho está no controls.css.
//
// Teclado e ARIA (PLANO.md, 3.8): o campo é o `role="spinbutton"`, com
// aria-valuemin, aria-valuemax, aria-valuenow e aria-valuetext ("25
// minutos"); ↑/↓ andam um passo, PageUp/PageDown 15 min e Home/End vão aos
// limites. Os chevrons ficam fora do Tab, como no NumberBox, e não roubam o
// foco ao clique; desabilitam no limite. A faixa e o passo vêm do preparo do
// Rust (de 5 a 240, de 5 em 5; no debug, de 1 em 1).
//
// Sem import do icon.js (que usa o import.meta.glob do Vite): quem desenha
// passa a função `icone`, e o módulo roda no node --test.
import t from '../lib/i18n/pt-BR.js';
import { minutosPorExtenso } from '../lib/format.js';

/** PageUp e PageDown andam 15 min (3.8), com qualquer passo. */
export const PAGINA = 15;

const p = t.foco.preparo;

/** `valor` dentro de [min, max]. */
export const limitar = (valor, { min, max }) => Math.min(max, Math.max(min, valor));

/**
 * Anda `delta` a partir de `valor` e para no ponto da grade do passo (min, min
 * + passo, ...) mais perto do alvo sem passar dele: com passo 5, 23 + 5 dá 25,
 * 23 − 5 dá 20 e 23 − 15 dá 10. Um valor na grade anda exatamente `delta`. O
 * resultado fica sempre na faixa.
 */
export function andar(valor, delta, { min, max, passo }) {
  const alvo = valor + delta;
  const k = (alvo - min) / passo;
  const naGrade = min + (delta >= 0 ? Math.floor(k) : Math.ceil(k)) * passo;
  return limitar(naGrade, { min, max });
}

/**
 * O valor novo para uma tecla, ou null se a tecla não é do seletor (ou se o
 * evento tem Ctrl, Alt ou Meta, que são de atalhos).
 * @param {number} valor
 * @param {{ key: string, ctrlKey?: boolean, altKey?: boolean, metaKey?: boolean }} e
 * @param {{ min: number, max: number, passo: number }} faixa
 */
export function valorDaTecla(valor, e, faixa) {
  if (e.ctrlKey || e.altKey || e.metaKey) return null;
  switch (e.key) {
    case 'ArrowUp':
      return andar(valor, faixa.passo, faixa);
    case 'ArrowDown':
      return andar(valor, -faixa.passo, faixa);
    case 'PageUp':
      return andar(valor, PAGINA, faixa);
    case 'PageDown':
      return andar(valor, -PAGINA, faixa);
    case 'Home':
      return faixa.min;
    case 'End':
      return faixa.max;
    default:
      return null;
  }
}

/** Os atributos ARIA do campo para um valor (os testes conferem). */
export function aria(valor, { min, max }) {
  return {
    'aria-valuemin': String(min),
    'aria-valuemax': String(max),
    'aria-valuenow': String(valor),
    'aria-valuetext': minutosPorExtenso(valor),
  };
}

/**
 * HTML do seletor. `descricao` é o id do texto que completa o valor (a frase
 * dos intervalos, lida junto com o campo). `icone(nome)` dá o SVG.
 */
export function marcacao({ valor, min, max, descricao = '' }, icone = () => '') {
  const attrs = Object.entries(aria(valor, { min, max }))
    .map(([k, v]) => ` ${k}="${v}"`)
    .join('');
  const chevron = (dir, nome, rotulo) =>
    `<button type="button" class="tt-seletor-chevron" data-passo="${dir}" tabindex="-1" aria-label="${rotulo}" data-dica>` +
    `${icone(nome)}</button>`;
  return (
    `<div class="tt-seletor">` +
    `<div class="tt-seletor-campo" role="spinbutton" tabindex="0" aria-label="${p.seletor}"${attrs}` +
    `${descricao ? ` aria-describedby="${descricao}"` : ''}>` +
    `<span class="tt-seletor-numero tt-num" aria-hidden="true" data-numero>${valor}</span>` +
    `<span class="tt-seletor-unidade" aria-hidden="true">${p.unidade}</span>` +
    `</div>` +
    `<div class="tt-seletor-chevrons">` +
    chevron('+1', 'chevron_up', p.aumentar) +
    chevron('-1', 'chevron_down', p.diminuir) +
    `</div></div>`
  );
}

/**
 * Liga um seletor já desenhado. `aoMudar(valor)` roda a cada mudança feita
 * pelo usuário. Devolve `{ valor, definir(valor), configurar(faixa),
 * desligar() }`: `configurar` troca a faixa e o passo (o preparo do Rust) e
 * traz o valor para dentro dela.
 */
export function ligarSeletor(raiz, { valor, min, max, passo, aoMudar = () => {} }) {
  const campo = raiz.querySelector('[role="spinbutton"]');
  const numero = raiz.querySelector('[data-numero]');
  const [mais, menos] = raiz.querySelectorAll('[data-passo]');
  let faixa = { min, max, passo };
  let atual = limitar(valor, faixa);

  const desenhar = () => {
    for (const [k, v] of Object.entries(aria(atual, faixa))) campo.setAttribute(k, v);
    numero.textContent = String(atual);
    mais.disabled = atual >= faixa.max;
    menos.disabled = atual <= faixa.min;
  };
  const mudar = (novo) => {
    if (novo === null || novo === atual) return;
    atual = novo;
    desenhar();
    aoMudar(atual);
  };
  const aoTeclar = (e) => {
    const novo = valorDaTecla(atual, e, faixa);
    if (novo === null) return;
    e.preventDefault();   // PageUp, Home e as setas não rolam a tela
    mudar(novo);
  };
  // O clique na coluna dos chevrons não tira o foco de onde ele está (o
  // campo, se o usuário vinha do teclado), como no NumberBox. A coluna, e não
  // só o botão: o chevron desabilitado não recebe o mouse (controls.css), e o
  // clique nele cai na coluna.
  const aoApertar = (e) => {
    if (e.target.closest('.tt-seletor-chevrons')) e.preventDefault();
  };
  const aoClicar = (e) => {
    const b = e.target.closest('[data-passo]');
    if (!b || b.disabled) return;
    mudar(andar(atual, Number(b.dataset.passo) * faixa.passo, faixa));
  };
  campo.addEventListener('keydown', aoTeclar);
  raiz.addEventListener('mousedown', aoApertar);
  raiz.addEventListener('click', aoClicar);
  desenhar();

  return {
    get valor() {
      return atual;
    },
    definir(v) {
      atual = limitar(v, faixa);
      desenhar();
    },
    configurar(nova) {
      faixa = { min: nova.min, max: nova.max, passo: nova.passo };
      const dentro = limitar(atual, faixa);
      const mudou = dentro !== atual;
      atual = dentro;
      desenhar();
      if (mudou) aoMudar(atual);
    },
    desligar() {
      campo.removeEventListener('keydown', aoTeclar);
      raiz.removeEventListener('mousedown', aoApertar);
      raiz.removeEventListener('click', aoClicar);
    },
  };
}
