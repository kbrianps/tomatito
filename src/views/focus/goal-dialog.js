// Diálogo "Editar meta diária" (M28), aberto pelo lápis do cartão "Progresso
// diário" (card-progress.js), como o do Relógio
// (windows-11-focus-sessions-targets.png): título, a lista "Meta diária", a
// lista "Zerar progresso às" (de 00:00 a 23:00) e os botões Salvar (destaque)
// e Cancelar, com a mesma largura. As medidas estão no controls.css
// (.tt-dialogo-meta).
//
// Comportamento (docs/decisoes.md, M28):
//   - um fluent-dialog modal só, criado ao ligar o cartão e posto no <body>
//     (fica na camada de cima quando aberto); cada abertura redesenha o
//     conteúdo com os valores atuais, então Cancelar e Esc não deixam nada
//     para trás;
//   - Salvar grava as duas chaves de uma vez pelo `settings_set` (o Rust
//     confere as faixas e emite `tt://settings`, que faz o cartão reler os
//     números); se o Rust recusar, o diálogo continua aberto com o aviso;
//   - Esc e Cancelar fecham sem gravar (o Esc numa lista aberta fecha só a
//     lista, keys.js, M12); o clique fora não fecha, como no ContentDialog;
//   - ao abrir, o foco vai para a primeira lista; ao fechar, volta ao lápis.
import t from '../../lib/i18n/pt-BR.js';
import * as ipcDoApp from '../../lib/ipc.js';

const m = t.foco.metaDiaria;

/** As metas da seção 3.3 (settings.rs, DAILY_GOALS), em minutos; 0 é "Desativada". */
export const METAS = Object.freeze([0, 30, 60, 90, 120, 180, 240, 360, 480]);
/** As horas de zerar, de 0 a 23. */
export const HORAS = Object.freeze(Array.from({ length: 24 }, (_, h) => h));

/** "00:00" … "23:00". */
export const textoDaHora = (h) => `${String(h).padStart(2, '0')}:00`;

const semIcone = () => '';
const opcoes = (valores, texto, atual) =>
  valores
    .map((v) => `<fluent-option value="${v}"${v === atual ? ' selected' : ''}>${texto(v)}</fluent-option>`)
    .join('');

const campo = (id, rotulo, conteudo) =>
  `<div class="tt-campo"><span id="tt-meta-${id}-rotulo" class="tt-campo-rotulo">${rotulo}</span>` +
  `<fluent-dropdown data-campo="${id}" data-rotulo="tt-meta-${id}-rotulo"><fluent-listbox>${conteudo}</fluent-listbox></fluent-dropdown></div>`;

/**
 * O conteúdo do diálogo (dentro do fluent-dialog), com a meta e a hora de
 * zerar escolhidas. Um valor fora das listas deixa a lista sem escolha (o
 * Rust nunca devolve um).
 */
export function marcacao({ dailyGoalMinutes = 0, resetHour = 0 } = {}, icone = semIcone) {
  return (
    `<fluent-dialog-body>` +
    `<h2 slot="title" id="tt-meta-titulo">${m.titulo}</h2>` +
    `<div class="tt-dialogo-meta-campos">` +
    campo('meta', m.meta, opcoes(METAS, (v) => m.opcoes[v], dailyGoalMinutes)) +
    campo('hora', m.zerar, opcoes(HORAS, textoDaHora, resetHour)) +
    `<p class="tt-dialogo-meta-erro" role="alert" data-erro hidden>${icone('error_circle')}<span data-erro-texto></span></p>` +
    `</div>` +
    `<button type="button" slot="action" class="tt-accent" data-salvar>${icone('save')}${m.salvar}</button>` +
    `<button type="button" slot="action" data-cancelar>${icone('dismiss')}${m.cancelar}</button>` +
    `</fluent-dialog-body>`
  );
}

/**
 * O patch do `settings_set` a partir dos valores das listas (texto, como o
 * `value` do fluent-dropdown). Devolve null se algum não for um valor das
 * listas.
 */
export function patch(meta, hora) {
  const g = Number(meta);
  const h = Number(hora);
  if (meta === '' || hora === '' || !METAS.includes(g) || !HORAS.includes(h)) return null;
  return { dailyGoalMinutes: g, resetHour: h };
}

/**
 * Cria o diálogo no documento e devolve `{ elemento, abrir(valores), desligar() }`.
 * `gatilho` é o lápis (o foco volta para ele); `aoSalvar(configuracoes)` é
 * chamado depois de gravar; `ipc` é o lib/ipc.js (`configuracoes.gravar`).
 */
export function criar({ doc = document, gatilho = null, icone = semIcone, ipc = ipcDoApp, aoSalvar = () => {} } = {}) {
  const el = doc.createElement('fluent-dialog');
  el.className = 'tt-dialogo-meta';
  // O nome do diálogo vai por aria-label: o <dialog> de verdade fica na
  // sombra do componente, e um aria-labelledby apontando para o título (no
  // DOM de fora) não atravessa a sombra.
  el.setAttribute('aria-label', m.titulo);
  el.setAttribute('data-dialogo', 'meta');
  doc.body.append(el);
  const win = doc.defaultView ?? globalThis;
  let salvando = false;
  let desligado = false;

  const aberto = () => Boolean(el.dialog?.open);
  const listas = () => [...el.querySelectorAll('fluent-dropdown[data-campo]')];
  const avisar = (texto) => {
    const erro = el.querySelector('[data-erro]');
    if (!erro) return;
    erro.querySelector('[data-erro-texto]').textContent = texto;
    erro.hidden = !texto;
  };
  const ocupar = (sim) => {
    salvando = sim;
    for (const b of el.querySelectorAll('[data-salvar], [data-cancelar]')) b.disabled = sim;
  };

  async function salvar() {
    if (salvando) return;
    const [meta, hora] = ['meta', 'hora'].map((id) => el.querySelector(`[data-campo="${id}"]`)?.value ?? '');
    const p = patch(meta, hora);
    if (!p) return avisar(m.erro);
    avisar('');
    ocupar(true);
    try {
      const novas = await ipc.configuracoes.gravar(p);
      if (desligado) return;
      ocupar(false);
      el.hide();
      aoSalvar(novas);
    } catch (erro) {
      console.warn('[meta diária]', erro);
      if (desligado) return;
      ocupar(false);
      avisar(m.erro);
    }
  }

  const aoClicar = (ev) => {
    const alvo = ev.target?.closest?.('[data-salvar], [data-cancelar]');
    if (!alvo || alvo.disabled) return;
    if (alvo.hasAttribute('data-salvar')) void salvar();
    else el.hide();
  };
  // O fluent-dialog modal fecha com um clique no fundo (o próprio <dialog>
  // é o alvo). O ContentDialog não: o clique para aqui, na captura do host,
  // antes de chegar ao <dialog> de dentro.
  const aoClicarNoFundo = (ev) => {
    if (ev.composedPath?.()[0] === el.dialog) ev.stopPropagation();
  };
  // Esc durante a gravação: espera a resposta (o <dialog> cancelaria).
  const aoTeclar = (ev) => {
    if (ev.key === 'Escape' && salvando) ev.preventDefault();
  };
  const aoAlternar = (ev) => {
    if (ev.target !== el || ev.detail?.newState !== 'closed') return;
    gatilho?.focus?.();
  };
  el.addEventListener('click', aoClicarNoFundo, true);
  el.addEventListener('click', aoClicar);
  el.addEventListener('keydown', aoTeclar, true);
  el.addEventListener('toggle', aoAlternar);

  return {
    elemento: el,
    aberto,
    /** Abre com `{ dailyGoalMinutes, resetHour }`; aberto, não faz nada. */
    abrir(valores) {
      if (desligado || aberto()) return;
      el.innerHTML = marcacao(valores, icone);
      ocupar(false);
      el.show();
      // O <button role="combobox"> de cada lista nasce numa fila de
      // atualização do FAST: no quadro seguinte ele já existe, recebe o
      // rótulo visível como nome (o modelo do M12) e a primeira ganha o foco,
      // como no ContentDialog.
      win.requestAnimationFrame(() => {
        if (desligado || !aberto()) return;
        for (const dd of listas()) dd.control?.setAttribute('aria-labelledby', dd.dataset.rotulo);
        listas()[0]?.control?.focus();
      });
    },
    desligar() {
      desligado = true;
      el.removeEventListener('click', aoClicarNoFundo, true);
      el.removeEventListener('click', aoClicar);
      el.removeEventListener('keydown', aoTeclar, true);
      el.removeEventListener('toggle', aoAlternar);
      if (aberto()) el.dialog.close();
      el.remove();
    },
  };
}
