// Tela Foco (#/foco). M10: a grade dos cartões, que se adapta à largura da
// área de conteúdo (shell.css): duas colunas independentes, como no Relógio,
// com a sessão e as tarefas na primeira e o progresso na segunda; numa coluna
// só, a mesma ordem do HTML. M17: o cartão de sessão ("Pronto para focar",
// card-session.js). M27: o de progresso (card-progress.js), que no M28 ganha
// o lápis e o diálogo da meta (goal-dialog.js). M30: o de tarefas
// (card-tasks.js), com o ícone no título; a tarefa escolhida nele vai no
// "Iniciar sessão de foco" do cartão de sessão. W14: na web, o InfoBar do
// pedido de avisos no cartão de sessão (pedido-de-avisos.js).
import * as compacto from './compacto.js';
import t from '../../lib/i18n/pt-BR.js';
import { PREPARO_PADRAO, store as storeDoApp } from '../../lib/store.js';
import * as sessao from './card-session.js';
import * as progresso from './card-progress.js';
import * as tarefas from './card-tasks.js';
import * as pedidoDeAvisos from './pedido-de-avisos.js';

// Colunas da grade, com os cartões na ordem de leitura (e do Tab).
export const COLUNAS = Object.freeze([Object.freeze(['sessao', 'tarefas']), Object.freeze(['progresso'])]);

const semIcone = () => '';

// Classe própria de cada cartão com conteúdo (as medidas do shell.css).
const CLASSES = Object.freeze({ sessao: ' tt-sessao', progresso: ' tt-progresso', tarefas: ' tt-tarefas' });

// M30: o ícone antes do título (o cabeçalho do cartão de tarefas do Relógio).
const ICONES_DO_TITULO = Object.freeze({ tarefas: (icone) => icone('checkmark_circle', 20) });

const cartao = (id, conteudo = '', icone = semIcone) =>
  `<section class="tt-card${CLASSES[id] ?? ''}" data-cartao="${id}" aria-labelledby="foco-${id}">` +
  `<h2 id="foco-${id}" class="tt-t-subtitle">${ICONES_DO_TITULO[id]?.(icone) ?? ''}${t.foco[id]}</h2>${conteudo}</section>`;

/**
 * HTML da tela. `preparo` é o do store (a faixa do seletor); `icone(nome)`, o
 * do components/icon.js (o main.js o passa pelo roteador; os testes, um falso).
 */
export function marcacao({ preparo = PREPARO_PADRAO, icone = semIcone } = {}) {
  const conteudo = {
    sessao: () => sessao.marcacao(preparo, icone),
    tarefas: () => tarefas.marcacao({ icone }),
    progresso: () => progresso.marcacao(undefined, { icone }),
  };
  const colunas = COLUNAS.map(
    (ids) => `<div class="tt-foco-coluna">${ids.map((id) => cartao(id, conteudo[id]?.(), icone)).join('')}</div>`,
  ).join('');
  return (
    `<div class="tt-pagina"><h1 class="tt-t-title tt-so-leitor" tabindex="-1">${t.navegacao.foco}</h1>` +
    `<div class="tt-foco-grade">${colunas}</div></div>`
  );
}

/**
 * `store` é o de lib/store.js; os testes passam outro, ou null para só
 * desenhar. `ipc` (M27) é o lib/ipc.js dos cartões de progresso e de
 * tarefas (M30).
 */
export function montar(raiz, { store = storeDoApp, icone = semIcone, ipc } = {}) {
  raiz.innerHTML = marcacao({ preparo: store?.preparo, icone });
  if (!store) return null;
  const limpar = [
    sessao.ligar(raiz.querySelector('[data-cartao="sessao"]'), store, { icone, tarefa: tarefas.escolhida }),
    tarefas.ligar(raiz.querySelector('[data-cartao="tarefas"]'), store, ipc ? { ipc, icone } : { icone }),
    progresso.ligar(raiz.querySelector('[data-cartao="progresso"]'), store, ipc ? { ipc, icone } : { icone }),
    pedidoDeAvisos.ligar(raiz.querySelector('[data-cartao="sessao"]'), { icone }),
    // v0.4: o botão "Modo compacto", só no desktop (compacto.js).
    compacto.ligar(raiz.querySelector('[data-cartao="sessao"]'), { icone }),
  ];
  return () => limpar.forEach((f) => f());
}
