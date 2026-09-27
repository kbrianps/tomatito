// Contagem provisória da tela Foco (M16): o restante da fase em mm:ss, a fase
// e botões de texto (sem ícone, para o módulo rodar no node --test) para
// pausar, retomar, pular e encerrar. M17: iniciar passou para o cartão "Pronto
// para focar" (card-session.js), que mostra este bloco só com uma sessão em
// andamento. O mostrador e os botões redondos chegam no M18, e este bloco sai.
//
// O texto é desenhado num requestAnimationFrame que só roda com uma fase
// correndo e só mexe no DOM quando o segundo mostrado muda (PLANO.md, 3.1).
// Parado, nenhum quadro é pedido. Com a janela escondida, o WebView não dá
// quadros; na volta, o primeiro quadro já lê o restante certo do store.
import t from '../../lib/i18n/pt-BR.js';
import { mmss } from '../../lib/format.js';

const p = t.foco.provisorio;

/** Os botões que valem em cada estado do foco (null: ainda sem retrato). */
export function acoesVisiveis(status) {
  switch (status) {
    case 'focus':
    case 'break':
      return ['pausar', 'pular', 'parar'];
    case 'paused':
      return ['retomar', 'pular', 'parar'];
    default:
      return [];
  }
}

/** A linha abaixo do tempo: a fase e em que ponto da sessão ela está. */
export function rotuloDaFase(foco) {
  const s = foco?.session;
  if (!foco || !s) return p.ocioso;
  if (foco.status === 'completed') return p.concluida;
  const total = s.phase.kind === 'focus' ? s.blocks : s.intervals;
  const nome = p[s.phase.kind](s.phase.n, total);
  return foco.status === 'paused' ? p.pausado(nome) : nome;
}

/**
 * O relógio da contagem, sem DOM: `escrever(texto)` só é chamado quando o
 * texto muda, e `quadro`/`cancelar` são o requestAnimationFrame e o
 * cancelAnimationFrame (os testes passam falsos). Devolve `{ atualizar,
 * desligar }`: `atualizar()` depois de cada retrato novo.
 */
export function criarRelogio({ store, escrever, quadro, cancelar }) {
  let texto = null;
  let pedido = null;
  const desenhar = () => {
    const novo = mmss(store.restanteMs() ?? 0);
    if (novo !== texto) {
      texto = novo;
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

export function marcacao() {
  const botao = (acao, texto) => `<button type="button" data-acao="${acao}" hidden>${texto}</button>`;
  return (
    `<div class="tt-contagem">` +
    `<p class="tt-contagem-tempo tt-num" data-tempo>${mmss(0)}</p>` +
    `<p class="tt-fg-2" data-fase>${p.ocioso}</p>` +
    `<div class="tt-linha">` +
    botao('pausar', p.pausar) +
    botao('retomar', p.retomar) +
    botao('pular', p.pular) +
    botao('parar', p.parar) +
    `</div></div>`
  );
}

/** Liga o bloco já desenhado ao store. Devolve a função de limpeza. */
export function ligar(raiz, store) {
  const tempo = raiz.querySelector('[data-tempo]');
  const fase = raiz.querySelector('[data-fase]');
  const botoes = [...raiz.querySelectorAll('button[data-acao]')];
  const relogio = criarRelogio({
    store,
    escrever: (texto) => (tempo.textContent = texto),
    quadro: (f) => requestAnimationFrame(f),
    cancelar: (id) => cancelAnimationFrame(id),
  });
  const aoMudar = (foco) => {
    const acoes = acoesVisiveis(foco?.status ?? null);
    for (const b of botoes) b.hidden = !acoes.includes(b.dataset.acao);
    fase.textContent = rotuloDaFase(foco);
    relogio.atualizar();
  };
  const aoClicar = (e) => {
    const b = e.target.closest('button[data-acao]');
    if (!b || !raiz.contains(b)) return;
    store.comando(b.dataset.acao).catch((erro) => console.warn('[foco]', erro));
  };
  raiz.addEventListener('click', aoClicar);
  const desassinar = store.assinar(aoMudar);
  aoMudar(store.foco);
  return () => {
    desassinar();
    relogio.desligar();
    raiz.removeEventListener('click', aoClicar);
  };
}
