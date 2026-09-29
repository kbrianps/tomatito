// Diálogo dos avisos de terceiros e da licença da fonte (M46), aberto pelos
// botões do Sobre (settings.js). O texto é o do arquivo que vai no pacote
// (bundle.resources), lido pelo Rust (`notices_read`, src-tauri/src/avisos.rs):
// o THIRD_PARTY_NOTICES.md ou o OFL-Inter.txt. Vai como texto puro, num bloco
// com a quebra de linha do arquivo, e não como HTML: o Markdown dos avisos se
// lê bem assim, e nada do arquivo vira marcação.
//
// Comportamento (docs/decisoes.md, M46), como o diálogo da meta (M28):
//   - um fluent-dialog modal só, criado na primeira abertura e posto no
//     <body>; cada abertura redesenha o conteúdo com o título do documento;
//   - o texto chega pelo IPC e fica guardado enquanto o app roda; até chegar,
//     "Carregando…"; se a leitura falhar, o aviso de erro, com o motivo no
//     console;
//   - ao abrir, o foco vai para o bloco de texto (rolável pelo teclado); Esc e
//     "Fechar" fecham, o clique fora não (o ContentDialog); ao fechar, o foco
//     volta ao botão que abriu.
import t from '../lib/i18n/pt-BR.js';
import * as ipcDoApp from '../lib/ipc.js';

const d = t.configuracoes.sobre.dialogo;
const semIcone = () => '';

/** Os documentos que o diálogo mostra (o `doc` do `notices_read`). */
export const DOCUMENTOS = Object.freeze(['avisos', 'ofl']);

/** O conteúdo do diálogo (dentro do fluent-dialog) para o documento `doc`. */
export function marcacao(doc, icone = semIcone) {
  const titulo = d.titulos[doc];
  return (
    '<fluent-dialog-body>' +
    `<h2 slot="title" id="tt-avisos-titulo">${titulo}</h2>` +
    `<pre class="tt-dialogo-avisos-texto" data-texto tabindex="0" role="region" aria-label="${titulo}" aria-busy="true">${d.carregando}</pre>` +
    `<p class="tt-dialogo-meta-erro" role="alert" data-erro hidden>${icone('error_circle')}<span data-erro-texto>${d.erro}</span></p>` +
    `<button type="button" slot="action" data-fechar>${d.fechar}</button>` +
    '</fluent-dialog-body>'
  );
}

/**
 * Cria o diálogo no documento e devolve `{ elemento, aberto, abrir(doc, gatilho), desligar() }`.
 * `ipc` é o lib/ipc.js (`avisos.ler`).
 */
export function criar({ doc = document, icone = semIcone, ipc = ipcDoApp } = {}) {
  const el = doc.createElement('fluent-dialog');
  el.className = 'tt-dialogo-avisos';
  el.setAttribute('data-dialogo', 'avisos');
  doc.body.append(el);
  const win = doc.defaultView ?? globalThis;
  const textos = new Map();
  let gatilho = null;
  let pedido = 0;
  let desligado = false;

  const aberto = () => Boolean(el.dialog?.open);

  // Não pergunta se está aberto: o `show()` do fluent-dialog abre na fila de
  // atualização do FAST, depois de um texto já guardado chegar. Fechar conta
  // um pedido novo, e a resposta de uma abertura anterior não escreve nada.
  function mostrar(n, texto) {
    if (desligado || n !== pedido) return;
    const bloco = el.querySelector('[data-texto]');
    if (!bloco) return;
    if (texto === null) {
      bloco.hidden = true;
      el.querySelector('[data-erro]').hidden = false;
    } else {
      bloco.textContent = texto;
      bloco.scrollTop = 0;
    }
    bloco.removeAttribute('aria-busy');
  }

  async function carregar(n, qual) {
    if (textos.has(qual)) return mostrar(n, textos.get(qual));
    try {
      const texto = await ipc.avisos.ler(qual);
      if (typeof texto !== 'string') throw new Error('resposta sem texto');
      textos.set(qual, texto);
      mostrar(n, texto);
    } catch (erro) {
      console.error('[avisos]', erro);
      mostrar(n, null);
    }
  }

  const aoClicar = (ev) => {
    if (ev.target?.closest?.('[data-fechar]')) el.hide();
  };
  // O clique no fundo (o próprio <dialog>) não fecha, como no ContentDialog.
  const aoClicarNoFundo = (ev) => {
    if (ev.composedPath?.()[0] === el.dialog) ev.stopPropagation();
  };
  const aoAlternar = (ev) => {
    if (ev.target !== el || ev.detail?.newState !== 'closed') return;
    pedido++;
    gatilho?.focus?.();
  };
  el.addEventListener('click', aoClicarNoFundo, true);
  el.addEventListener('click', aoClicar);
  el.addEventListener('toggle', aoAlternar);

  return {
    elemento: el,
    aberto,
    /** Abre com o documento `qual` (`'avisos'` ou `'ofl'`); aberto, não faz nada. */
    abrir(qual, quem = null) {
      if (desligado || aberto() || !DOCUMENTOS.includes(qual)) return;
      gatilho = quem;
      const n = ++pedido;
      el.setAttribute('aria-label', d.titulos[qual]);
      el.innerHTML = marcacao(qual, icone);
      el.show();
      win.requestAnimationFrame(() => {
        if (!desligado && aberto()) el.querySelector('[data-texto]')?.focus();
      });
      void carregar(n, qual);
    },
    desligar() {
      desligado = true;
      el.removeEventListener('click', aoClicarNoFundo, true);
      el.removeEventListener('click', aoClicar);
      el.removeEventListener('toggle', aoAlternar);
      if (aberto()) el.dialog.close();
      el.remove();
    },
  };
}
