// Sessão em andamento no cartão de sessão (M18), como no Relógio
// (~/dev/tomatito-ref/crop-insession.png): o mostrador (components/dial.js),
// os botões redondos (pausar, de destaque, e "..." com o menu "Encerrar
// sessão" e "Pular intervalo") e o rodapé "A seguir: intervalo de 5 min". O
// cabeçalho ("Período de foco (1 de 2)") toma o lugar do título do cartão; o
// card-session.js o escreve com `cabecalho()`.
//
// Substitui a contagem provisória do M16 (contagem.js). Do M16 fica o relógio
// de quadros: um requestAnimationFrame que só roda com uma fase correndo e só
// mexe no DOM quando o que se vê muda (o número, uma vez por minuto; o traço
// aceso, uma vez a cada 1/24 da fase, ou a cada 2,5 s no modo de uma volta por
// minuto). Parado, nenhum quadro é pedido.
//
// M19: os estados da sessão no mesmo bloco. Pausado: o glifo vira play, o
// cabeçalho ganha " · Pausado" e o número fica em --tt-fg-2. Intervalo: o
// cabeçalho "Intervalo", o traço aceso em --tt-fg-2 e o rodapé "A seguir:
// foco de 25 min". Os dois viram atributos do .tt-andamento (data-fase e
// data-pausado) e o shell.css pinta. O concluído volta ao preparo
// (card-session.js). O anúncio das fases é do lib/a11y.js, e o Espaço, do
// card-session.js.
import t from '../../lib/i18n/pt-BR.js';
import { minutosRestantes, plurais } from '../../lib/format.js';
import * as mostrador from '../../components/dial.js';

const a = t.foco.andamento;

/** O modo do traço aceso, lido do <html> (dial.js). */
const modoDoDocumento = () => globalThis.document?.documentElement?.dataset?.ttMostrador;

/** Fase atual: { kind, n, total }, ou null sem sessão. */
function fase(foco) {
  const s = foco?.session;
  if (!s) return null;
  const k = s.phase.kind;
  return { kind: k, n: s.phase.n, total: k === 'focus' ? s.blocks : s.intervals };
}

/**
 * O cabeçalho do cartão: `{ fase, contagem, estado }`. No foco, "Período de
 * foco" e "(1 de 2)"; no intervalo, só "Intervalo"; pausado, `estado` é
 * "Pausado" (M19), que o cartão escreve depois de um " · ". Null sem sessão.
 */
export function cabecalho(foco) {
  const f = fase(foco);
  if (!f) return null;
  return {
    fase: a[f.kind],
    contagem: f.kind === 'focus' ? a.contagem(f.n, f.total) : '',
    estado: foco.status === 'paused' ? a.pausado : '',
  };
}

/**
 * Os atributos do bloco para o CSS (M19): `fase` ('focus' ou 'break'; o
 * traço aceso do intervalo fica em --tt-fg-2) e `pausado` (o número em
 * --tt-fg-2). Sem sessão, `{ fase: null, pausado: false }`.
 */
export function aparencia(foco) {
  const f = fase(foco);
  return { fase: f?.kind ?? null, pausado: Boolean(f) && foco.status === 'paused' };
}

/**
 * O rodapé: "A seguir:" e a próxima fase ("intervalo de 5 min", "foco de 25
 * min"), ou null na última fase da sessão.
 */
export function rodape(foco) {
  const prox = foco?.session?.next;
  if (!prox) return null;
  // Minutos inteiros para baixo, como o plan.rs descreve os blocos (1650 s,
  // "27 min"); nunca menos de 1.
  return { rotulo: a.aSeguir, valor: a.proximo[prox.kind](Math.max(1, Math.floor(prox.durationS / 60))) };
}

/** Rótulo do mostrador: "27 minutos restantes, período de foco 1 de 2". */
export function rotuloDoMostrador(foco, minutos) {
  const f = fase(foco);
  if (!f) return '';
  // Em pt-BR, o 0 cai em "one" no PluralRules; "0 minutos restantes".
  const restantes = minutos === 0 ? a.restantes.other(0) : plurais(minutos, a.restantes);
  return `${restantes}, ${a.faseNoRotulo[f.kind](f.n, f.total)}`;
}

/** O que o botão de destaque faz: pausar (fase correndo) ou retomar. */
export const acaoPrincipal = (status) => (status === 'paused' ? 'retomar' : 'pausar');

/** "Pular intervalo" só vale num intervalo (correndo ou pausado). */
export const podePularIntervalo = (foco) => Boolean(foco?.session) && foco.session.phase.kind === 'break' && foco.status !== 'completed';

/**
 * O que o mostrador mostra agora: `{ minutos, aceso }`, a partir do store
 * (restante estimado) e do retrato (duração da fase). `modo` é o do traço
 * aceso (dial.js).
 */
export function leitura(store, modo) {
  const s = store.foco?.session;
  const restanteMs = store.restanteMs() ?? 0;
  return {
    minutos: minutosRestantes(restanteMs),
    aceso: mostrador.litTick({ duracaoMs: (s?.phase.durationS ?? 0) * 1000, restanteMs, modo }),
  };
}

/**
 * O relógio do mostrador, sem DOM: `escrever({ minutos, aceso })` só é
 * chamado quando um dos dois muda; `quadro`/`cancelar` são o
 * requestAnimationFrame e o cancelAnimationFrame (os testes passam falsos), e
 * `modo()` diz o modo do traço aceso a cada quadro. Devolve `{ atualizar,
 * desligar }`: `atualizar()` depois de cada retrato novo.
 */
export function criarRelogio({ store, escrever, quadro, cancelar, modo = modoDoDocumento }) {
  let ultimo = null;
  let pedido = null;
  const desenhar = () => {
    const novo = leitura(store, modo());
    if (!ultimo || novo.minutos !== ultimo.minutos || novo.aceso !== ultimo.aceso) {
      ultimo = novo;
      escrever(novo);
    }
  };
  const passo = () => {
    pedido = null;
    desenhar();
    if (store.correndo) pedido = quadro(passo);
  };
  return {
    atualizar() {
      desenhar();
      if (store.correndo && pedido === null) pedido = quadro(passo);
      if (!store.correndo && pedido !== null) {
        cancelar(pedido);
        pedido = null;
      }
    },
    desligar() {
      if (pedido !== null) cancelar(pedido);
      pedido = null;
    },
  };
}

/** HTML do bloco (sem o cabeçalho, que é o título do cartão). */
export function marcacao(icone = () => '') {
  const deIcone = (classe, acao, rotulo, nome) =>
    `<button type="button" class="tt-circular${classe}" data-acao="${acao}" aria-label="${rotulo}" data-dica>${icone(nome)}</button>`;
  return (
    `<div class="tt-andamento">` +
    mostrador.marcacao({ unidade: a.unidade }) +
    `<div class="tt-andamento-botoes">` +
    deIcone(' tt-accent', 'pausar', a.pausar, 'pause') +
    `<fluent-menu class="tt-andamento-menu" data-menu-sessao>` +
    `<button type="button" slot="trigger" class="tt-circular" data-mais aria-label="${a.mais}" data-dica>${icone('more_horizontal')}</button>` +
    `<fluent-menu-list>` +
    `<fluent-menu-item data-item="parar">${a.encerrar}</fluent-menu-item>` +
    `<fluent-menu-item data-item="pular">${a.pularIntervalo}</fluent-menu-item>` +
    `</fluent-menu-list></fluent-menu></div>` +
    `<p class="tt-andamento-rodape" data-rodape><span data-rodape-rotulo></span> <strong data-rodape-valor></strong></p>` +
    `</div>`
  );
}

/**
 * Liga o bloco já desenhado ao store. `icone` troca o glifo do botão de
 * destaque (pause e play). Devolve a função de limpeza.
 */
export function ligar(raiz, store, { icone = () => '' } = {}) {
  const dial = mostrador.ligarMostrador(raiz);
  const principal = raiz.querySelector('button[data-acao]');
  const pular = raiz.querySelector('fluent-menu-item[data-item="pular"]');
  const rodapeEl = raiz.querySelector('[data-rodape]');
  const rodapeRotulo = raiz.querySelector('[data-rodape-rotulo]');
  const rodapeValor = raiz.querySelector('[data-rodape-valor]');
  const bloco = raiz.querySelector('.tt-andamento');
  const menu = raiz.querySelector('[data-menu-sessao]');
  let minutosDoRotulo = null;
  let faseDoRotulo = null;

  // O rótulo do role="img" muda uma vez por minuto, ou quando a fase muda.
  const rotular = (minutos) => {
    const s = store.foco?.session;
    const chave = s ? `${s.id}:${s.phaseIndex}` : null;
    if (minutos === minutosDoRotulo && chave === faseDoRotulo) return;
    minutosDoRotulo = minutos;
    faseDoRotulo = chave;
    dial.rotular(rotuloDoMostrador(store.foco, minutos));
  };
  const relogio = criarRelogio({
    store,
    escrever: ({ minutos, aceso }) => {
      dial.minutos(minutos);
      dial.acender(aceso);
      rotular(minutos);
    },
    quadro: (f) => requestAnimationFrame(f),
    cancelar: (id) => cancelAnimationFrame(id),
  });

  let acaoAtual = null;
  const aoMudar = (foco) => {
    const acao = acaoPrincipal(foco?.status);
    if (acao !== acaoAtual) {
      acaoAtual = acao;
      principal.dataset.acao = acao;
      principal.setAttribute('aria-label', a[acao]);
      principal.innerHTML = icone(acao === 'retomar' ? 'play' : 'pause');
    }
    const ap = aparencia(foco);
    if (ap.fase) bloco.dataset.fase = ap.fase;
    else delete bloco.dataset.fase;
    bloco.toggleAttribute('data-pausado', ap.pausado);
    // A sessão acabou (concluída ou encerrada) com o menu aberto: a lista é um
    // popover na camada de cima e ficaria na tela sem o bloco.
    if (!foco?.session || foco.status === 'completed') menu.closeMenu?.();
    if (podePularIntervalo(foco)) pular.removeAttribute('disabled');
    else pular.setAttribute('disabled', '');
    const r = rodape(foco);
    rodapeEl.toggleAttribute('data-vazio', !r);
    rodapeRotulo.textContent = r?.rotulo ?? '';
    rodapeValor.textContent = r?.valor ?? '';
    relogio.atualizar();
    rotular(minutosRestantes(store.restanteMs() ?? 0));
  };
  const comando = (nome) => store.comando(nome).catch((erro) => console.warn('[foco]', erro));
  const aoClicar = (e) => {
    const b = e.target.closest?.('button[data-acao]');
    if (b && raiz.contains(b)) comando(b.dataset.acao);
  };
  // Um item do menu escolhido (clique, Enter ou Espaço) emite `change`; o
  // fluent-menu fecha a lista sozinho.
  const aoEscolher = (e) => {
    const item = e.target.closest?.('fluent-menu-item[data-item]');
    if (item && raiz.contains(item) && !item.hasAttribute('disabled')) comando(item.dataset.item);
  };
  raiz.addEventListener('click', aoClicar);
  raiz.addEventListener('change', aoEscolher);
  const desassinar = store.assinar(aoMudar);
  aoMudar(store.foco);
  return () => {
    desassinar();
    relogio.desligar();
    raiz.removeEventListener('click', aoClicar);
    raiz.removeEventListener('change', aoEscolher);
  };
}
