// Diálogo da validação com reversão do Tomatito Full (PLANO.md, 5.7, passo 5,
// e 5.9; M52), na janela principal, no padrão da troca de resolução de tela:
//   - "O tomate aparece com o fundo transparente?", Manter (destaque) ou
//     Reverter, com a contagem de 10 s;
//   - depois de voltar ao tema anterior (Reverter ou sem resposta), a oferta
//     do plano B3: "Usar o modo opaco" (destaque) ou "Agora não".
//
// O Rust é o dono da validação (src-tauri/src/window/validacao.rs): o prazo
// corre lá, e a reversão acontece mesmo que esta página não desenhe nada.
// Aqui só se mostra o retrato (o `full_validation_get` ao ligar e o
// `tt://full-validation` a cada mudança; um `seq` menor que o último é
// descartado) e se manda a resposta (`full_validation_answer`).
//
// Comportamento:
//   - um fluent-dialog `type="alert"` (role alertdialog, sem fechar pelo
//     clique no fundo), criado ao ligar e posto no <body>, como o da meta
//     (goal-dialog.js, M28), e reusado nas duas perguntas;
//   - o Esc responde Reverter na pergunta e "Agora não" na oferta; se o
//     <dialog> fechar por outro caminho, vale o mesmo;
//   - ao abrir, o foco vai para o botão de destaque (o `autofocus`, que o
//     fluent-dialog foca depois do showModal); ao fechar, para o <body>, e
//     não para o rádio "Tomatito Full" do clique (ver `aplicar`);
//   - a contagem só troca o texto quando o segundo muda, e fica fora de
//     qualquer região aria-live (seria um anúncio por segundo).
import t from '../lib/i18n/pt-BR.js';
import * as ipcDoApp from '../lib/ipc.js';

const v = t.tomate.validacao;

/** Os segundos inteiros que faltam até `prazoMs` (para cima; nunca negativo). */
export const segundosAte = (prazoMs, agora) => Math.max(0, Math.ceil((Number(prazoMs) - agora) / 1000));

const botao = (resposta, texto, destaque) =>
  `<button type="button" slot="action"${destaque ? ' class="tt-accent" autofocus' : ''} data-resposta="${resposta}">${texto}</button>`;

/**
 * O conteúdo do diálogo (dentro do fluent-dialog) para um retrato da
 * validação: a pergunta (`asking`) ou a oferta do modo opaco (`reverted`).
 * Nos outros, vazio.
 */
export function marcacao(r, { agora = Date.now() } = {}) {
  if (r?.state === 'asking') {
    return (
      '<fluent-dialog-body>' +
      `<h2 slot="title">${v.titulo}</h2>` +
      '<div class="tt-dialogo-validacao-texto">' +
      `<p>${v.explicacao}</p>` +
      `<p class="tt-dialogo-validacao-prazo" data-prazo>${v.prazo(segundosAte(r.deadlineMs, agora))}</p>` +
      '</div>' +
      botao('keep', v.manter, true) +
      botao('revert', v.reverter, false) +
      '</fluent-dialog-body>'
    );
  }
  if (r?.state === 'reverted') {
    return (
      '<fluent-dialog-body>' +
      `<h2 slot="title">${v.opacoTitulo}</h2>` +
      '<div class="tt-dialogo-validacao-texto">' +
      `<p data-motivo>${v.revertida[r.reason] ?? v.revertida.revert}</p>` +
      `<p>${v.opacoExplicacao}</p>` +
      '</div>' +
      botao('opaque', v.usarOpaco, true) +
      botao('dismiss', v.agoraNao, false) +
      '</fluent-dialog-body>'
    );
  }
  return '';
}

/** O nome do diálogo (aria-label: o <dialog> de verdade fica na sombra). */
export const nomeDo = (r) => (r?.state === 'asking' ? v.titulo : v.opacoTitulo);

/** A resposta do Esc (ou de um fechamento que não veio daqui) em cada retrato. */
export const respostaDoEsc = (r) => (r?.state === 'asking' ? 'revert' : r?.state === 'reverted' ? 'dismiss' : null);

/**
 * Cria o diálogo no documento e liga ao Rust. Devolve
 * `{ elemento, pronto, aplicar(retrato), desligar() }`: `pronto` resolve
 * depois de ouvir o evento e aplicar o retrato do `full_validation_get`.
 * `deps`: `ipc` (o lib/ipc.js), `doc`, `agora()` (ms desde a época) e
 * `relogio` ({ setInterval, clearInterval }).
 */
export function ligar({
  ipc = ipcDoApp,
  doc = globalThis.document,
  agora = () => Date.now(),
  relogio = { setInterval: (f, ms) => setInterval(f, ms), clearInterval: (id) => clearInterval(id) },
  log = globalThis.console,
} = {}) {
  const el = doc.createElement('fluent-dialog');
  el.className = 'tt-dialogo-validacao';
  el.setAttribute('type', 'alert');
  el.setAttribute('data-dialogo', 'validacao-full');
  doc.body.append(el);
  let seq = -1;
  let atual = null;
  let tique = null;
  let enviando = false;
  let desligado = false;
  let fechandoDaqui = false;
  let desligarEvento = null;

  const aberto = () => Boolean(el.dialog?.open);
  const ocupar = (sim) => {
    enviando = sim;
    for (const b of el.querySelectorAll('[data-resposta]')) b.disabled = sim;
  };
  const pararContagem = () => {
    if (tique === null) return;
    relogio.clearInterval(tique);
    tique = null;
  };
  function contar() {
    pararContagem();
    let ultimo = null;
    const passo = () => {
      const p = el.querySelector('[data-prazo]');
      if (!p || atual?.state !== 'asking') return pararContagem();
      const s = segundosAte(atual.deadlineMs, agora());
      if (s === ultimo) return;
      ultimo = s;
      p.textContent = v.prazo(s);
    };
    passo();
    tique = relogio.setInterval(passo, 200);
  }
  function fechar() {
    pararContagem();
    if (!aberto()) return;
    fechandoDaqui = true;
    try {
      el.hide();
    } finally {
      fechandoDaqui = false;
    }
  }

  /** Mostra um retrato (do evento, do get ou da resposta); os velhos ficam de fora. */
  function aplicar(r) {
    if (desligado || typeof r?.seq !== 'number' || r.seq <= seq) return false;
    seq = r.seq;
    atual = r;
    if (r.state !== 'asking' && r.state !== 'reverted') {
      fechar();
      return true;
    }
    el.setAttribute('aria-label', nomeDo(r));
    el.innerHTML = marcacao(r, { agora: agora() });
    ocupar(false);
    if (r.state === 'asking') contar();
    else pararContagem();
    // Fechado, o fluent-dialog foca o [autofocus] depois do showModal; já
    // aberto (a pergunta virou a oferta), o foco vai para o destaque aqui.
    if (aberto()) {
      el.querySelector('[autofocus]')?.focus?.();
      return true;
    }
    // Ao fechar, o <dialog> devolve o foco a quem o tinha antes de abrir. Na
    // Aparência, esse é o rádio "Tomatito Full" do clique, e o fluent-radio-group
    // marca o rádio que recebe o foco (focusinHandler): a devolução entraria
    // no Full de novo. Sem foco antes de abrir, o foco volta ao <body>.
    doc.activeElement?.blur?.();
    el.show();
    return true;
  }

  async function responder(resposta) {
    if (enviando || !resposta || desligado) return;
    ocupar(true);
    try {
      aplicar(await ipc.full.responderValidacao(resposta));
    } catch (erro) {
      log.warn?.('[validação do Full]', erro);
    } finally {
      if (!desligado) ocupar(false);
    }
  }

  const aoClicar = (ev) => {
    const b = ev.target?.closest?.('[data-resposta]');
    if (!b || b.disabled) return;
    void responder(b.dataset.resposta);
  };
  // O Esc responde (o <dialog> fecharia sozinho, sem avisar o Rust).
  const aoTeclar = (ev) => {
    if (ev.key !== 'Escape') return;
    ev.preventDefault();
    ev.stopPropagation();
    void responder(respostaDoEsc(atual));
  };
  // Fechado por outro caminho (a pergunta continua no Rust): vale o Esc.
  const aoAlternar = (ev) => {
    if (ev.target !== el || ev.detail?.newState !== 'closed' || fechandoDaqui) return;
    const r = respostaDoEsc(atual);
    if (r) void responder(r);
  };
  el.addEventListener('click', aoClicar);
  el.addEventListener('keydown', aoTeclar, true);
  el.addEventListener('toggle', aoAlternar);

  const pronto = (async () => {
    desligarEvento = await ipc.ouvir(ipc.full.EVENTO_VALIDACAO, aplicar);
    if (desligado) return desligarEvento?.();
    aplicar(await ipc.full.validacao());
  })();

  return {
    elemento: el,
    pronto,
    aplicar,
    responder,
    desligar() {
      desligado = true;
      pararContagem();
      desligarEvento?.();
      el.removeEventListener('click', aoClicar);
      el.removeEventListener('keydown', aoTeclar, true);
      el.removeEventListener('toggle', aoAlternar);
      if (aberto()) el.dialog.close();
      el.remove();
    },
  };
}
