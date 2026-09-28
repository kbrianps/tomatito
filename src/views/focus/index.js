// Tela Foco (#/foco). M10: a grade dos cartões, que se adapta à largura da
// área de conteúdo (shell.css): duas colunas independentes, como no Relógio,
// com a sessão e as tarefas na primeira e o progresso na segunda; numa coluna
// só, a mesma ordem do HTML. M17: o cartão de sessão ("Pronto para focar",
// card-session.js). M27: o de progresso (card-progress.js). O de tarefas
// ganha o conteúdo no M30.
import t from '../../lib/i18n/pt-BR.js';
import { PREPARO_PADRAO, store as storeDoApp } from '../../lib/store.js';
import * as sessao from './card-session.js';
import * as progresso from './card-progress.js';

// Colunas da grade, com os cartões na ordem de leitura (e do Tab).
export const COLUNAS = Object.freeze([Object.freeze(['sessao', 'tarefas']), Object.freeze(['progresso'])]);

const semIcone = () => '';

// Classe própria de cada cartão com conteúdo (as medidas do shell.css).
const CLASSES = Object.freeze({ sessao: ' tt-sessao', progresso: ' tt-progresso' });

const cartao = (id, conteudo = '') =>
  `<section class="tt-card${CLASSES[id] ?? ''}" data-cartao="${id}" aria-labelledby="foco-${id}">` +
  `<h2 id="foco-${id}" class="tt-t-subtitle">${t.foco[id]}</h2>${conteudo}</section>`;

/**
 * HTML da tela. `preparo` é o do store (a faixa do seletor); `icone(nome)`, o
 * do components/icon.js (o main.js o passa pelo roteador; os testes, um falso).
 */
export function marcacao({ preparo = PREPARO_PADRAO, icone = semIcone } = {}) {
  const conteudo = { sessao: () => sessao.marcacao(preparo, icone), progresso: () => progresso.marcacao() };
  const colunas = COLUNAS.map(
    (ids) => `<div class="tt-foco-coluna">${ids.map((id) => cartao(id, conteudo[id]?.())).join('')}</div>`,
  ).join('');
  return (
    `<div class="tt-pagina"><h1 class="tt-t-title" tabindex="-1">${t.navegacao.foco}</h1>` +
    `<div class="tt-foco-grade">${colunas}</div></div>`
  );
}

/**
 * `store` é o de lib/store.js; os testes passam outro, ou null para só
 * desenhar. `ipc` (M27) é o lib/ipc.js do cartão de progresso.
 */
export function montar(raiz, { store = storeDoApp, icone = semIcone, ipc } = {}) {
  raiz.innerHTML = marcacao({ preparo: store?.preparo, icone });
  if (!store) return null;
  const limpar = [
    sessao.ligar(raiz.querySelector('[data-cartao="sessao"]'), store, { icone }),
    progresso.ligar(raiz.querySelector('[data-cartao="progresso"]'), store, ipc ? { ipc } : {}),
  ];
  return () => limpar.forEach((f) => f());
}
