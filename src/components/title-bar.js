// Barra de título própria da janela main (PLANO.md, M07 e 3.8).
//
// - 32 px de altura, arrastável (data-tauri-drag-region="deep" no elemento
//   raiz, no index.html): arrastar move a janela, e o duplo clique maximiza ou
//   restaura. Os <button> bloqueiam o arraste (drag.js do Tauri).
// - Ícone de 16 px em x=16 e o título em Caption a partir de x=46.
// - Botões de 46 × 32 com aria-label e fora do Tab. Os glifos são desenho
//   próprio, em SVG inline com traços de 10 px (mockup tomatito-lite-AxB.html),
//   e nunca vêm das fontes Segoe Fluent Icons ou Segoe MDL2 Assets.
// - O glifo e o rótulo de maximizar/restaurar acompanham o onResized e o
//   isMaximized. O <html> ganha data-maximized, que o shell.css usa para tirar a
//   borda de 1 px do Linux com a janela maximizada.
import { getCurrentWindow } from '@tauri-apps/api/window';
import t from '../lib/i18n/pt-BR.js';
import { marcaDoApp } from './app-mark.js';

// Glifos de 10 × 10, com traço de 1 px (stroke no shell.css).
export const GLIFOS = Object.freeze({
  minimizar: '<path d="M0 5.5h10"/>',
  maximizar: '<rect x=".5" y=".5" width="9" height="9" rx="1.5"/>',
  // Dois quadrados: o da frente embaixo à esquerda e o de trás 2 px acima e à direita.
  restaurar:
    '<rect x=".5" y="2.5" width="7" height="7" rx="1.5"/>' +
    '<path d="M2.5 2.5V2A1.5 1.5 0 0 1 4 .5h4A1.5 1.5 0 0 1 9.5 2v4A1.5 1.5 0 0 1 8 7.5h-.5"/>',
  fechar: '<path d="M0 0l10 10M10 0 0 10"/>',
});

// Ícone de 16 px: a marca do app (M44), na cor de destaque do tema.
const ICONE = marcaDoApp('tt-titlebar-icone');

const botao = (acao, rotulo, glifo, classe = '') =>
  `<button type="button" class="tt-caption-btn${classe}" data-acao="${acao}" tabindex="-1" ` +
  `aria-label="${rotulo}" title="${rotulo}">` +
  `<svg viewBox="0 0 10 10" aria-hidden="true" focusable="false">${glifo}</svg></button>`;

/** Rótulo e glifo do botão do meio para o estado da janela. */
export function estadoDoMaximizar(maximizada) {
  return maximizada
    ? { rotulo: t.barraDeTitulo.restaurar, glifo: GLIFOS.restaurar }
    : { rotulo: t.barraDeTitulo.maximizar, glifo: GLIFOS.maximizar };
}

/** HTML interno da barra. Só usa textos do catálogo e glifos fixos. */
export function marcacao(maximizada = false) {
  const b = t.barraDeTitulo;
  const meio = estadoDoMaximizar(maximizada);
  return (
    `${ICONE}<span class="tt-titlebar-titulo">${t.app.nome}</span>` +
    '<div class="tt-caption">' +
    botao('minimizar', b.minimizar, GLIFOS.minimizar) +
    botao('maximizar', meio.rotulo, meio.glifo) +
    botao('fechar', b.fechar, GLIFOS.fechar, ' tt-caption-fechar') +
    '</div>'
  );
}

/**
 * Desenha a barra em `raiz` e liga os botões à janela. Resolve depois de
 * conhecer o estado inicial (maximizada ou não), para a janela aparecer já com
 * o glifo certo.
 */
export async function montarBarraDeTitulo(raiz, win = getCurrentWindow()) {
  raiz.innerHTML = marcacao(false);
  const h = document.documentElement;
  const meio = raiz.querySelector('[data-acao="maximizar"]');

  const aplicar = (maximizada) => {
    const e = estadoDoMaximizar(maximizada);
    h.toggleAttribute('data-maximized', maximizada);
    meio.setAttribute('aria-label', e.rotulo);
    meio.title = e.rotulo;
    meio.querySelector('svg').innerHTML = e.glifo;
  };

  const acoes = {
    minimizar: () => win.minimize(),
    maximizar: () => win.toggleMaximize(),
    fechar: () => win.close(),
  };
  // Como na barra do sistema, os botões não tomam o foco do teclado ao clicar.
  raiz.addEventListener('mousedown', (e) => {
    if (e.target.closest('.tt-caption-btn')) e.preventDefault();
  });
  raiz.addEventListener('click', (e) => {
    const b = e.target.closest('.tt-caption-btn');
    if (b) acoes[b.dataset.acao]();
  });

  // Cada redimensionamento pergunta o estado de novo; respostas atrasadas de
  // pedidos antigos são descartadas.
  let pedido = 0;
  const sincronizar = async () => {
    const n = ++pedido;
    const maximizada = await win.isMaximized();
    if (n === pedido) aplicar(maximizada);
  };
  await win.onResized(sincronizar);
  await sincronizar();
}
