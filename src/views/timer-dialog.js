// Diálogo "Adicionar temporizador" e "Editar temporizador" (M33), aberto
// pelo "+" da barra do canto inferior direito e pelo lápis de cada card no
// modo de edição (views/timers.js). Como o do Relógio: horas, minutos e
// segundos grandes, cada um com um chevron para cima e outro para baixo, o
// nome embaixo e os botões Salvar (destaque) e Cancelar, com a mesma largura.
// As medidas estão no controls.css (.tt-dialogo-temporizador).
//
// Os três números são campos de texto com `role="spinbutton"` (3.8): ↑/↓
// andam 1 (e dão a volta: 59 → 00), PageUp/PageDown andam 10, Home/End vão
// aos limites, e digitar troca o número (duas casas; o que passar do limite
// para no limite ao sair do campo). Os chevrons ficam fora do Tab e não
// roubam o foco, como os do seletor de minutos (M17). Enter salva.
//
// O resto segue o diálogo da meta (goal-dialog.js, M28): um fluent-dialog
// modal só, posto no <body> e redesenhado a cada abertura; o clique fora não
// fecha; Esc e Cancelar fecham sem gravar; se o Rust recusar, o diálogo fica
// aberto com o aviso; ao fechar, o foco volta a quem abriu.
import t from '../lib/i18n/pt-BR.js';

const D = t.temporizador.dialogo;

/** Os três campos: chave, rótulo e maior valor. */
export const CAMPOS = Object.freeze([
  Object.freeze({ id: 'h', rotulo: D.horas, max: 99 }),
  Object.freeze({ id: 'm', rotulo: D.minutos, max: 59 }),
  Object.freeze({ id: 's', rotulo: D.segundos, max: 59 }),
]);
const MAX = Object.freeze({ h: 99, m: 59, s: 59 });

/** A duração de um temporizador novo: 5 min. */
export const DURACAO_NOVA_MS = 5 * 60_000;
/** O mesmo limite do countdown.rs (MAX_NAME_CHARS). */
export const MAX_NOME = 255;

const semIcone = () => '';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const duas = (n) => String(n).padStart(2, '0');

/** Horas, minutos e segundos de uma duração em ms (arredonda para baixo). */
export function partes(ms) {
  const total = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  return { h: Math.min(99, Math.floor(total / 3600)), m: Math.floor(total / 60) % 60, s: total % 60 };
}

/** A duração em ms de `{ h, m, s }`. */
export const duracaoMs = ({ h, m, s }) => ((h * 60 + m) * 60 + s) * 1000;

/** O número de um campo a partir do texto digitado: só os algarismos, no limite. */
export function lerCampo(texto, max) {
  const n = Number.parseInt(String(texto).replace(/\D/g, '').slice(-2) || '0', 10);
  return Math.min(max, Math.max(0, n));
}

/**
 * O valor novo de um campo para uma tecla, ou null se a tecla não é do campo
 * (ou vem com Ctrl, Alt ou Meta). ↑/↓ dão a volta, como o seletor do Relógio.
 */
export function valorDaTecla(valor, e, max) {
  if (e.ctrlKey || e.altKey || e.metaKey) return null;
  const voltar = (v) => ((v % (max + 1)) + max + 1) % (max + 1);
  switch (e.key) {
    case 'ArrowUp':
      return voltar(valor + 1);
    case 'ArrowDown':
      return voltar(valor - 1);
    case 'PageUp':
      return Math.min(max, valor + 10);
    case 'PageDown':
      return Math.max(0, valor - 10);
    case 'Home':
      return 0;
    case 'End':
      return max;
    default:
      return null;
  }
}

/** O texto do aviso para o erro do Rust (`{ code }`, engine.rs). */
export const textoDoErro = (erro) =>
  erro?.code === 'nameTooLong' ? D.longo : erro?.code === 'invalidDuration' ? D.zero : D.erro;

const campoDeTempo = ({ id, rotulo, max }, valor, icone) =>
  `<div class="tt-duracao-campo">` +
  `<button type="button" class="tt-sutil" tabindex="-1" data-mais="${id}" aria-label="${D.mais(rotulo)}">${icone('chevron_up')}</button>` +
  `<input type="text" class="tt-texto tt-num tt-duracao-numero" data-campo="${id}" role="spinbutton" inputmode="numeric" maxlength="2" autocomplete="off" spellcheck="false"` +
  ` aria-label="${rotulo}" aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="${valor}" value="${duas(valor)}">` +
  `<button type="button" class="tt-sutil" tabindex="-1" data-menos="${id}" aria-label="${D.menos(rotulo)}">${icone('chevron_down')}</button>` +
  `<span class="tt-duracao-rotulo" aria-hidden="true">${rotulo}</span>` +
  `</div>`;

/**
 * O conteúdo do diálogo (dentro do fluent-dialog). `tm` é o temporizador que
 * se edita (`{ name, durationMs }`), ou null para um novo.
 */
export function marcacao(tm = null, icone = semIcone) {
  const p = partes(tm ? tm.durationMs : DURACAO_NOVA_MS);
  const sep = `<span class="tt-duracao-sep" aria-hidden="true">:</span>`;
  return (
    `<fluent-dialog-body>` +
    `<h2 slot="title">${tm ? D.editar : D.novo}</h2>` +
    `<div class="tt-dialogo-temporizador-campos">` +
    `<div class="tt-duracao" role="group" aria-label="${D.duracao}">` +
    CAMPOS.map((c) => campoDeTempo(c, p[c.id], icone)).join(sep) +
    `</div>` +
    `<input type="text" class="tt-texto tt-dialogo-temporizador-nome" data-nome maxlength="${MAX_NOME}" autocomplete="off"` +
    ` aria-label="${D.nome}" placeholder="${D.nome}" value="${esc(tm?.name ?? '')}">` +
    `<p class="tt-dialogo-meta-erro" role="alert" data-erro hidden>${icone('error_circle')}<span data-erro-texto></span></p>` +
    `</div>` +
    `<button type="button" slot="action" class="tt-accent" data-salvar>${icone('save')}${D.salvar}</button>` +
    `<button type="button" slot="action" data-cancelar>${icone('dismiss')}${D.cancelar}</button>` +
    `</fluent-dialog-body>`
  );
}

/**
 * Cria o diálogo no documento e devolve `{ elemento, aberto(), abrir(tm,
 * gatilho), desligar() }`. `aoSalvar({ id, nome, duracaoMs })` grava (o `id`
 * é null num novo) e devolve uma promessa; rejeitada com `{ code }`, o
 * diálogo continua aberto com o aviso.
 */
export function criar({ doc = document, icone = semIcone, aoSalvar = async () => {} } = {}) {
  const el = doc.createElement('fluent-dialog');
  el.className = 'tt-dialogo-temporizador';
  el.setAttribute('data-dialogo', 'temporizador');
  el.setAttribute('aria-label', D.novo);
  doc.body.append(el);
  const win = doc.defaultView ?? globalThis;
  let salvando = false;
  let desligado = false;
  let atual = null;
  let gatilho = null;

  const aberto = () => Boolean(el.dialog?.open);
  const campo = (id) => el.querySelector(`[data-campo="${id}"]`);
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
  const valor = (id) => lerCampo(campo(id)?.value ?? '0', MAX[id]);
  const escreverCampo = (id, v) => {
    const c = campo(id);
    if (!c) return;
    c.value = duas(v);
    c.setAttribute('aria-valuenow', String(v));
  };

  async function salvar() {
    if (salvando) return;
    for (const { id } of CAMPOS) escreverCampo(id, valor(id));
    const ms = duracaoMs({ h: valor('h'), m: valor('m'), s: valor('s') });
    const nome = el.querySelector('[data-nome]')?.value ?? '';
    if (ms < 1000) return avisar(D.zero);
    if ([...nome.trim()].length > MAX_NOME) return avisar(D.longo);
    avisar('');
    ocupar(true);
    try {
      await aoSalvar({ id: atual?.id ?? null, nome, duracaoMs: ms });
      if (desligado) return;
      ocupar(false);
      el.hide();
    } catch (erro) {
      console.warn('[temporizador]', erro);
      if (desligado) return;
      ocupar(false);
      avisar(textoDoErro(erro));
    }
  }

  const aoClicar = (ev) => {
    const alvo = ev.target?.closest?.('[data-salvar], [data-cancelar], [data-mais], [data-menos]');
    if (!alvo || alvo.disabled) return;
    if (alvo.hasAttribute('data-salvar')) return void salvar();
    if (alvo.hasAttribute('data-cancelar')) return el.hide();
    const id = alvo.getAttribute('data-mais') ?? alvo.getAttribute('data-menos');
    const novo = valorDaTecla(valor(id), { key: alvo.hasAttribute('data-mais') ? 'ArrowUp' : 'ArrowDown' }, MAX[id]);
    escreverCampo(id, novo);
  };
  // Os chevrons não tiram o foco do campo em que se está.
  const aoApertar = (ev) => {
    if (ev.target?.closest?.('[data-mais], [data-menos]')) ev.preventDefault();
  };
  const aoClicarNoFundo = (ev) => {
    if (ev.composedPath?.()[0] === el.dialog) ev.stopPropagation();
  };
  const aoTeclar = (ev) => {
    if (ev.key === 'Escape' && salvando) return ev.preventDefault();
    const id = ev.target?.getAttribute?.('data-campo');
    if (ev.key === 'Enter' && !ev.target?.closest?.('button')) {
      ev.preventDefault();
      return void salvar();
    }
    if (!id) return;
    const novo = valorDaTecla(valor(id), ev, MAX[id]);
    if (novo === null) return;
    ev.preventDefault();
    escreverCampo(id, novo);
    ev.target.select?.();
  };
  // Digitando: só algarismos, duas casas; o limite vale ao sair do campo.
  const aoDigitar = (ev) => {
    const id = ev.target?.getAttribute?.('data-campo');
    if (!id) return;
    const limpo = ev.target.value.replace(/\D/g, '').slice(-2);
    if (limpo !== ev.target.value) ev.target.value = limpo;
    ev.target.setAttribute('aria-valuenow', String(lerCampo(limpo, MAX[id])));
  };
  const aoSair = (ev) => {
    const id = ev.target?.getAttribute?.('data-campo');
    if (id) escreverCampo(id, valor(id));
  };
  const aoEntrar = (ev) => {
    if (ev.target?.getAttribute?.('data-campo')) ev.target.select?.();
  };
  const aoAlternar = (ev) => {
    if (ev.target !== el || ev.detail?.newState !== 'closed') return;
    if (gatilho?.isConnected !== false) gatilho?.focus?.();
  };
  el.addEventListener('click', aoClicarNoFundo, true);
  el.addEventListener('click', aoClicar);
  el.addEventListener('mousedown', aoApertar);
  el.addEventListener('keydown', aoTeclar, true);
  el.addEventListener('input', aoDigitar);
  el.addEventListener('focusout', aoSair);
  el.addEventListener('focusin', aoEntrar);
  el.addEventListener('toggle', aoAlternar);

  return {
    elemento: el,
    aberto,
    /** O temporizador em edição (null num novo). */
    get atual() {
      return atual;
    },
    /** Abre para `tm` (ou um novo, com null); aberto, não faz nada. */
    abrir(tm = null, quem = null) {
      if (desligado || aberto()) return;
      atual = tm;
      gatilho = quem;
      el.setAttribute('aria-label', tm ? D.editar : D.novo);
      el.innerHTML = marcacao(tm, icone);
      ocupar(false);
      el.show();
      win.requestAnimationFrame(() => {
        if (desligado || !aberto()) return;
        campo('h')?.focus();
      });
    },
    /** Troca quem recebe o foco ao fechar (o card redesenhado). */
    set gatilho(quem) {
      gatilho = quem;
    },
    desligar() {
      desligado = true;
      el.removeEventListener('click', aoClicarNoFundo, true);
      el.removeEventListener('click', aoClicar);
      el.removeEventListener('mousedown', aoApertar);
      el.removeEventListener('keydown', aoTeclar, true);
      el.removeEventListener('input', aoDigitar);
      el.removeEventListener('focusout', aoSair);
      el.removeEventListener('focusin', aoEntrar);
      el.removeEventListener('toggle', aoAlternar);
      if (aberto()) el.dialog.close();
      el.remove();
    },
  };
}
