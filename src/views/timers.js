// Tela Temporizador (#/temporizador), M32. Como a do Relógio
// (timers-in-clock-app.png): uma grade centrada de cards de 313 × 321, que
// quebra de linha conforme a largura, um card por temporizador, na ordem de
// criação. Cada card tem o nome (ou a duração, sem nome) em cima, o anel de
// 210 px com traço de 12 e o tempo `hh:mm:ss` no meio, e os botões redondos
// de iniciar/pausar e redefinir embaixo. "Expandir" e "Manter no topo" do
// Relógio não entram (sem botões mortos, 2.1).
//
// Quem conta é o Rust (engine.rs e o countdown.rs do núcleo): o card lê o
// retrato do store (`tt://timers`, o get_state e a resposta dos comandos) e
// estima o restante entre um retrato e outro pelo relógio de parede. O
// requestAnimationFrame só roda com algum temporizador correndo, e só mexe no
// DOM quando o segundo mostrado muda (3.1).
//
// Cores do tempo (M32): `--tt-fg-2` parado (e pausado), `--tt-fg-1` correndo
// e `--tt-timer-overdue` depois do zero, com o rótulo "Encerrado há" acima do
// tempo, que marca o estado sem depender da cor (no Lite, a cor é a mesma do
// correndo; 4.2). O fim (som e notificação) sai do Rust, mesmo com a tela
// fechada ou a janela escondida.
//
// M33: a barra do canto inferior direito, com o lápis (modo de edição) e o
// "+" (diálogo de adicionar, views/timer-dialog.js). No modo de edição, o
// lápis vira "Concluído", e cada card ganha "Editar" e "Excluir" no canto de
// cima, onde o Relógio põe "Expandir" e "Manter no topo". Criar, editar e
// excluir vão para o Rust, que regrava o state.json (state_file.rs).
import t from '../lib/i18n/pt-BR.js';
import { categoria, duracaoCurta, plurais, tempoDoTemporizador } from '../lib/format.js';
import { store as storeDoApp } from '../lib/store.js';
import * as anel from '../components/ring.js';
import * as dialogoDoTemporizador from './timer-dialog.js';

const T = t.temporizador;
/** O anel do card: 210 px CSS, com traço de 12 (o viewBox tem o mesmo lado). */
export const LADO_DO_ANEL = 210;
export const TRACO_DO_ANEL = 12;

const semIcone = () => '';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** O título do card: o nome, ou a duração curta sem nome ("1 min"). */
export const titulo = (tm) => (tm?.name ? tm.name : duracaoCurta(tm?.durationMs));

/** Passou do zero: pelo restante estimado, ou pelo fim já disparado no zero exato. */
export const vencido = (tm, restante) => restante < 0 || (Boolean(tm?.ended) && restante <= 0);

/** A ação do botão de destaque: iniciar (parado), pausar (correndo) ou retomar (pausado). */
export const acaoPrincipal = (status) => (status === 'running' ? 'pausar' : status === 'paused' ? 'retomar' : 'iniciar');

/**
 * O que o card mostra de um temporizador com `restante` ms (estimado agora):
 * o tempo, se venceu, o estado das cores, a fração do anel e os botões.
 * Parado, o anel fica só com o trilho, como no Relógio; correndo ou pausado,
 * o arco é o que falta (pelo segundo mostrado); depois do zero, vazio.
 */
export function aparencia(tm, restante = tm?.remainingMs) {
  const v = vencido(tm, restante);
  const segundo = restante > 0 ? Math.ceil(restante / 1000) * 1000 : 0;
  const fracao = tm?.status === 'idle' || v || !(tm?.durationMs > 0) ? 0 : Math.min(segundo / tm.durationMs, 1);
  return {
    tempo: tempoDoTemporizador(restante, v),
    vencido: v,
    estado: tm?.status ?? 'idle',
    fracao,
    acao: acaoPrincipal(tm?.status),
    // "Redefinir" só quando algo mudou: parado na duração cheia, desabilitado.
    podeRedefinir: tm?.status !== 'idle',
  };
}

/**
 * O rótulo do anel (role="img"), que muda no máximo uma vez por minuto
 * (3.8): "Parado", "3 minutos restantes", "Pausado, 1 minuto restante" ou
 * "Encerrado há 2 minutos". Os minutos restantes arredondam para cima, e os
 * passados, para baixo.
 */
export function rotuloDoAnel(tm, restante = tm?.remainingMs) {
  const a = T.anel;
  if (vencido(tm, restante)) {
    const n = Math.floor(-Math.min(restante, 0) / 60_000);
    return (a.encerrado[categoria(n)] ?? a.encerrado.other)(n);
  }
  if (tm?.status === 'idle') return a.parado;
  const n = Math.ceil(Math.max(restante, 0) / 60_000);
  const resto = plurais(n, a.restantes);
  return tm?.status === 'paused' ? a.pausado(resto) : resto;
}

const botao = (classe, acao, rotulo, conteudo, extra = '') =>
  `<button type="button" class="tt-circular${classe}" data-acao="${acao}" aria-label="${rotulo}" data-dica${extra}>${conteudo}</button>`;

/** HTML de um card. `icone(nome)` é o do components/icon.js. */
export function cartao(tm, { icone = semIcone, restante = tm.remainingMs } = {}) {
  const ap = aparencia(tm, restante);
  const id = `temporizador-${tm.id}`;
  const centro =
    `<span class="tt-temporizador-encerrado" data-encerrado${ap.vencido ? '' : ' hidden'}>${T.encerradoHa}</span>` +
    `<span class="tt-temporizador-tempo tt-num" data-tempo>${ap.tempo}</span>`;
  return (
    `<section class="tt-card tt-temporizador" data-temporizador="${tm.id}" data-estado="${ap.estado}"${ap.vencido ? ' data-vencido' : ''} aria-labelledby="${id}">` +
    `<h2 id="${id}" class="tt-temporizador-titulo" data-titulo>${esc(titulo(tm))}</h2>` +
    // M33: só aparecem no modo de edição (o CSS esconde fora dele, e fora
    // do Tab). O aria-describedby diz de qual card é o botão.
    `<div class="tt-temporizador-edicao">` +
    `<button type="button" class="tt-sutil" data-acao="editar" aria-label="${T.editar}" aria-describedby="${id}" data-dica>${icone('edit')}</button>` +
    `<button type="button" class="tt-sutil" data-acao="excluir" aria-label="${T.excluir}" aria-describedby="${id}" data-dica>${icone('delete')}</button>` +
    `</div>` +
    anel.marcacao({
      fracao: ap.fracao,
      rotulo: rotuloDoAnel(tm, restante),
      centro,
      classe: 'tt-temporizador-anel',
      lado: LADO_DO_ANEL,
      espessura: TRACO_DO_ANEL,
    }) +
    `<div class="tt-temporizador-botoes">` +
    botao(' tt-accent', ap.acao, T[ap.acao], icone(ap.acao === 'pausar' ? 'pause' : 'play')) +
    botao('', 'redefinir', T.redefinir, icone('arrow_reset'), ap.podeRedefinir ? '' : ' disabled') +
    `</div></section>`
  );
}

/** HTML da barra do canto inferior direito (M33): o lápis (ou "Concluído") e o "+". */
export function barra({ editando = false, vazia = false, icone = semIcone } = {}) {
  return (
    `<div class="tt-temporizadores-barra" role="toolbar" aria-label="${T.barra}" data-barra>` +
    `<button type="button" class="tt-sutil" data-editar-lista aria-label="${editando ? T.concluido : T.editarLista}" data-dica${vazia && !editando ? ' disabled' : ''}>` +
    `${icone(editando ? 'checkmark' : 'edit')}</button>` +
    `<button type="button" class="tt-sutil" data-adicionar aria-label="${T.adicionar}" data-dica>${icone('add')}</button>` +
    `</div>`
  );
}

/** HTML da tela: o título, a grade (vazia até o primeiro retrato) e a barra. */
export function marcacao(retrato = null, { icone = semIcone } = {}) {
  const timers = retrato?.timers ?? [];
  const cards = timers.map((tm) => cartao(tm, { icone })).join('');
  const vazia = Boolean(retrato) && timers.length === 0;
  return (
    `<div class="tt-pagina tt-pagina-temporizador"><h1 class="tt-t-title" tabindex="-1">${t.navegacao.temporizador}</h1>` +
    `<div class="tt-temporizadores" data-temporizadores>${cards}</div>` +
    `<p class="tt-temporizadores-vazio" data-vazio${vazia ? '' : ' hidden'}>${T.vazio}</p>` +
    barra({ vazia, icone }) +
    `</div>`
  );
}

const escrever = (el, texto) => {
  if (el && el.textContent !== texto) el.textContent = texto;
};

/** Liga um card já desenhado. Devolve `{ atualizar(tm), pintar(restante) }`. */
function ligarCartao(el, icone) {
  const tempo = el.querySelector('[data-tempo]');
  const encerrado = el.querySelector('[data-encerrado]');
  const tituloEl = el.querySelector('[data-titulo]');
  // M33: o principal é o primeiro dos botões de baixo (os de edição, em cima, também têm data-acao).
  const principal = el.querySelector('.tt-temporizador-botoes button[data-acao]:not([data-acao="redefinir"])');
  const redefinir = el.querySelector('button[data-acao="redefinir"]');
  const a = anel.ligarAnel(el);
  let tm = null;
  let pintado = null;
  let estadoAnterior = null;

  const pintar = (restante) => {
    const ap = aparencia(tm, restante);
    const chave = `${tm.status}|${ap.tempo}|${ap.vencido}`;
    if (chave === pintado) return;
    pintado = chave;
    escrever(tempo, ap.tempo);
    encerrado.hidden = !ap.vencido;
    el.toggleAttribute('data-vencido', ap.vencido);
    // O arco anda em 1 s a cada segundo com o temporizador correndo; nas
    // trocas de estado (iniciar, redefinir), vai direto ao valor.
    const animar = estadoAnterior === 'running' && tm.status === 'running';
    estadoAnterior = tm.status;
    a.progresso(ap.fracao, { animar });
    a.rotular(rotuloDoAnel(tm, restante));
  };

  return {
    get tm() {
      return tm;
    },
    atualizar(novo, restante) {
      tm = novo;
      const ap = aparencia(tm, restante);
      el.dataset.estado = ap.estado;
      escrever(tituloEl, titulo(tm));
      if (principal.dataset.acao !== ap.acao) {
        principal.dataset.acao = ap.acao;
        principal.setAttribute('aria-label', T[ap.acao]);
        principal.innerHTML = icone(ap.acao === 'pausar' ? 'pause' : 'play');
      }
      if (redefinir.disabled === ap.podeRedefinir) {
        // O foco não pode cair no <body> quando o botão com foco se desabilita.
        const tinhaFoco = el.ownerDocument?.activeElement === redefinir;
        redefinir.disabled = !ap.podeRedefinir;
        if (tinhaFoco && redefinir.disabled) principal.focus();
      }
      pintado = null;
      pintar(restante);
    },
    pintar,
  };
}

/**
 * `store` é o de lib/store.js (`temporizadores`, `restanteDoTemporizador`,
 * `assinarTemporizadores` e `comandoDoTemporizador`); os testes passam
 * outro, ou null para só desenhar. `quadro` e `cancelar` são o
 * requestAnimationFrame e o cancelAnimationFrame. Devolve a limpeza.
 */
export function montar(raiz, {
  store = storeDoApp,
  icone = semIcone,
  quadro = (f) => requestAnimationFrame(f),
  cancelar = (id) => cancelAnimationFrame(id),
  dialogo = dialogoDoTemporizador,
  doc = raiz.ownerDocument,
} = {}) {
  raiz.innerHTML = marcacao(store?.temporizadores, { icone });
  if (!store) return null;
  const grade = raiz.querySelector('[data-temporizadores]');
  const vazio = raiz.querySelector('[data-vazio]');
  const lapis = raiz.querySelector('[data-editar-lista]');
  const mais = raiz.querySelector('[data-adicionar]');
  let editando = false;
  let janela = null;
  // Depois de excluir: a posição do card, para o foco ir ao vizinho.
  let focarApos = null;
  let cards = new Map();
  let ids = '';
  let pedido = null;

  const restante = (tm) => store.restanteDoTemporizador(tm.id) ?? tm.remainingMs;

  const redesenhar = (retrato) => {
    grade.innerHTML = retrato.timers.map((tm) => cartao(tm, { icone, restante: restante(tm) })).join('');
    cards = new Map();
    for (const el of grade.querySelectorAll('[data-temporizador]')) {
      cards.set(Number(el.dataset.temporizador), ligarCartao(el, icone));
    }
  };

  const passo = () => {
    pedido = null;
    let algum = false;
    for (const c of cards.values()) {
      if (c.tm?.status !== 'running') continue;
      algum = true;
      c.pintar(restante(c.tm));
    }
    if (algum) pedido = quadro(passo);
  };

  // M33: o modo de edição. O lápis vira "Concluído" (e volta), e a grade
  // ganha o atributo que mostra "Editar" e "Excluir" em cada card.
  const editar = (sim) => {
    const vazia = cards.size === 0;
    editando = sim && !vazia;
    grade.toggleAttribute('data-editando', editando);
    lapis.setAttribute('aria-label', editando ? T.concluido : T.editarLista);
    lapis.innerHTML = icone(editando ? 'checkmark' : 'edit');
    const tinhaFoco = doc?.activeElement === lapis;
    lapis.disabled = vazia;
    if (tinhaFoco && lapis.disabled) mais.focus();
  };

  const focarDepoisDeExcluir = () => {
    if (focarApos === null) return;
    const lista = [...grade.querySelectorAll('[data-temporizador]')];
    const alvo = lista[Math.min(focarApos, lista.length - 1)];
    focarApos = null;
    (alvo?.querySelector('button[data-acao="excluir"]') ?? mais).focus();
  };

  const aplicar = (retrato) => {
    if (!retrato) return;
    const novos = retrato.timers.map((tm) => tm.id).join(',');
    if (novos !== ids) {
      ids = novos;
      redesenhar(retrato);
      vazio.hidden = retrato.timers.length > 0;
      editar(editando);
      focarDepoisDeExcluir();
    }
    for (const tm of retrato.timers) cards.get(tm.id)?.atualizar(tm, restante(tm));
    if (pedido === null && retrato.timers.some((tm) => tm.status === 'running')) pedido = quadro(passo);
  };

  const abrirDialogo = (tm, quem) => {
    janela ??= dialogo.criar({
      doc,
      icone,
      aoSalvar: ({ id, nome, duracaoMs }) =>
        id === null
          ? store.comandoDoTemporizador('criar', nome, duracaoMs)
          : store.comandoDoTemporizador('editar', id, nome, duracaoMs),
    });
    janela.abrir(tm, quem);
  };

  const aoClicarNaBarra = (ev) => {
    const b = ev.target.closest?.('button');
    if (!b || b.disabled) return;
    if (b.hasAttribute('data-editar-lista')) editar(!editando);
    else if (b.hasAttribute('data-adicionar')) abrirDialogo(null, mais);
  };
  raiz.querySelector('[data-barra]').addEventListener('click', aoClicarNaBarra);

  const aoClicar = (ev) => {
    const b = ev.target.closest?.('button[data-acao]');
    const el = b?.closest('[data-temporizador]');
    if (!b || !el || b.disabled) return;
    const id = Number(el.dataset.temporizador);
    if (b.dataset.acao === 'editar') return abrirDialogo(cards.get(id)?.tm ?? null, b);
    if (b.dataset.acao === 'excluir') {
      focarApos = [...grade.querySelectorAll('[data-temporizador]')].indexOf(el);
      store.comandoDoTemporizador('excluir', id).catch((erro) => {
        focarApos = null;
        console.warn('[temporizador]', erro);
      });
      return;
    }
    const comando = { iniciar: 'iniciar', retomar: 'iniciar', pausar: 'pausar', redefinir: 'redefinir' }[b.dataset.acao];
    if (!comando) return;
    store.comandoDoTemporizador(comando, id).catch((erro) => console.warn('[temporizador]', erro));
  };
  grade.addEventListener('click', aoClicar);

  const desassinar = store.assinarTemporizadores(aplicar);
  aplicar(store.temporizadores);
  if (!store.temporizadores) void store.sincronizar?.();

  return () => {
    desassinar();
    grade.removeEventListener('click', aoClicar);
    raiz.querySelector('[data-barra]')?.removeEventListener('click', aoClicarNaBarra);
    janela?.desligar();
    janela = null;
    if (pedido !== null) cancelar(pedido);
    pedido = null;
  };
}
