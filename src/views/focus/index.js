// Tela Foco (#/foco). M10: a grade dos cartões, que se adapta à largura da
// área de conteúdo (shell.css): duas colunas independentes, como no Relógio,
// com a sessão e as tarefas na primeira e o progresso na segunda; numa coluna
// só, a mesma ordem do HTML. Por enquanto, cada cartão tem só o título: o de
// sessão ganha o conteúdo no M17, o de progresso no M27 e o de tarefas no M30.
import t from '../../lib/i18n/pt-BR.js';

// Colunas da grade, com os cartões na ordem de leitura (e do Tab).
export const COLUNAS = Object.freeze([Object.freeze(['sessao', 'tarefas']), Object.freeze(['progresso'])]);

const cartao = (id) =>
  `<section class="tt-card" data-cartao="${id}" aria-labelledby="foco-${id}">` +
  `<h2 id="foco-${id}" class="tt-t-subtitle">${t.foco[id]}</h2></section>`;

/** HTML da tela. */
export function marcacao() {
  const colunas = COLUNAS.map((ids) => `<div class="tt-foco-coluna">${ids.map(cartao).join('')}</div>`).join('');
  return (
    `<div class="tt-pagina"><h1 class="tt-t-title" tabindex="-1">${t.navegacao.foco}</h1>` +
    `<div class="tt-foco-grade">${colunas}</div></div>`
  );
}

export function montar(raiz) {
  raiz.innerHTML = marcacao();
}
