// Tela Foco (#/foco). M10: a grade dos cartões, que se adapta à largura da
// área de conteúdo (shell.css): duas colunas independentes, como no Relógio,
// com a sessão e as tarefas na primeira e o progresso na segunda; numa coluna
// só, a mesma ordem do HTML. M17: o cartão de sessão ("Pronto para focar",
// card-session.js); o de progresso ganha o conteúdo no M27 e o de tarefas no
// M30.
import t from '../../lib/i18n/pt-BR.js';
import { PREPARO_PADRAO, store as storeDoApp } from '../../lib/store.js';
import * as sessao from './card-session.js';

// Colunas da grade, com os cartões na ordem de leitura (e do Tab).
export const COLUNAS = Object.freeze([Object.freeze(['sessao', 'tarefas']), Object.freeze(['progresso'])]);

const semIcone = () => '';

const cartao = (id, conteudo = '') =>
  `<section class="tt-card${id === 'sessao' ? ' tt-sessao' : ''}" data-cartao="${id}" aria-labelledby="foco-${id}">` +
  `<h2 id="foco-${id}" class="tt-t-subtitle">${t.foco[id]}</h2>${conteudo}</section>`;

/**
 * HTML da tela. `preparo` é o do store (a faixa do seletor); `icone(nome)`, o
 * do components/icon.js (o main.js o passa pelo roteador; os testes, um falso).
 */
export function marcacao({ preparo = PREPARO_PADRAO, icone = semIcone } = {}) {
  const conteudo = { sessao: () => sessao.marcacao(preparo, icone) };
  const colunas = COLUNAS.map(
    (ids) => `<div class="tt-foco-coluna">${ids.map((id) => cartao(id, conteudo[id]?.())).join('')}</div>`,
  ).join('');
  return (
    `<div class="tt-pagina"><h1 class="tt-t-title" tabindex="-1">${t.navegacao.foco}</h1>` +
    `<div class="tt-foco-grade">${colunas}</div></div>`
  );
}

/** `store` é o de lib/store.js; os testes passam outro, ou null para só desenhar. */
export function montar(raiz, { store = storeDoApp, icone = semIcone } = {}) {
  raiz.innerHTML = marcacao({ preparo: store?.preparo, icone });
  if (!store) return null;
  return sessao.ligar(raiz.querySelector('[data-cartao="sessao"]'), store, { icone });
}
