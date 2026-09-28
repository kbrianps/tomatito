// Cartão "Progresso diário" da tela Foco (M27), como o do Relógio
// (clock-focus-sessions-page.png e windows-11-focus-sessions-progress.png):
// três colunas (Ontem, o anel com a meta dentro, e Esta semana) e o rodapé
// "Concluído: X minutos". As posições são as da captura (shell.css,
// .tt-progresso; docs/decisoes.md, M27).
//
// Os números vêm do `stats_get` (stats.rs, M26), que soma os períodos gravados
// no SQLite pela hora de zerar. O cartão pede de novo:
//   - a cada retrato do foco (um fim de fase grava um período antes de o
//     Rust emitir o `tt://state`, decisoes.md, M26, item 6); o store também
//     reenvia o retrato ao voltar a janela ou ganhar foco;
//   - a cada `tt://settings` (a meta e a hora de zerar, M28);
//   - uma vez por minuto com a janela visível, para a virada do dia na hora
//     de zerar aparecer sem mexer no app.
// Pedidos que se cruzam valem pela ordem em que foram feitos.
//
// Com a meta desativada (0), o anel e a meta somem (M28), e ficam Ontem, Esta
// semana e o rodapé. Até a primeira resposta (a tela aberta pela primeira vez),
// o cartão já tem o tamanho final, com os números escondidos
// (`data-carregando`), para nada pular quando eles chegam.
import t from '../../lib/i18n/pt-BR.js';
import { duracao, minutosInteiros } from '../../lib/format.js';
import * as anel from '../../components/ring.js';
import * as ipcDoApp from '../../lib/ipc.js';

const d = t.foco.diario;
/** Intervalo da releitura periódica, em ms (a virada do dia). */
export const RELEITURA_MS = 60_000;

// Os últimos números lidos, para a tela abrir já com eles ao voltar à Foco.
let ultimo = null;
/** Só para os testes: esquece os últimos números. */
export const esquecer = () => {
  ultimo = null;
};

/** Os números que o cartão mostra, a partir da resposta do `stats_get`. */
export function numeros(s) {
  const meta = Number.isInteger(s?.dailyGoalMinutes) && s.dailyGoalMinutes > 0 ? s.dailyGoalMinutes : 0;
  const hoje = Math.max(0, Number(s?.todayS) || 0);
  const fracao = meta ? hoje / (meta * 60) : 0;
  const pct = Math.floor(fracao * 100);
  return {
    ontem: duracao(s?.yesterdayS),
    semana: duracao(s?.weekS),
    meta: meta ? duracao(meta * 60) : null,
    fracao: Math.min(fracao, 1),
    concluido: d.concluido(minutosInteiros(hoje)),
    rotulo: meta ? d.anel(duracao(meta * 60).texto, minutosInteiros(hoje), pct) : '',
  };
}

const coluna = (id, titulo, v) =>
  `<div class="tt-progresso-coluna" data-coluna="${id}"><dt>${titulo}</dt>` +
  `<dd><span class="tt-progresso-numero tt-num" data-numero>${v?.numero ?? '0'}</span>` +
  `<span class="tt-progresso-unidade" data-unidade>${v?.unidade ?? ''}</span></dd></div>`;

/** HTML do conteúdo do cartão (depois do título). */
export function marcacao(s = ultimo) {
  const n = numeros(s);
  const centro =
    `<span class="tt-progresso-rotulo">${d.meta}</span>` +
    `<span class="tt-progresso-numero tt-num" data-numero>${n.meta?.numero ?? ''}</span>` +
    `<span class="tt-progresso-unidade" data-unidade>${n.meta?.unidade ?? ''}</span>`;
  return (
    `<div class="tt-progresso-corpo"${s && !n.meta ? ' data-sem-meta' : ''}${s ? '' : ' data-carregando'} data-progresso>` +
    `<dl class="tt-progresso-lado">${coluna('ontem', d.ontem, n.ontem)}</dl>` +
    anel.marcacao({ fracao: n.fracao, rotulo: n.rotulo, centro, classe: 'tt-progresso-anel' }) +
    `<dl class="tt-progresso-lado">${coluna('semana', d.semana, n.semana)}</dl>` +
    `</div>` +
    `<p class="tt-progresso-rodape" data-concluido>${n.concluido}</p>`
  );
}

const escrever = (el, texto) => {
  if (el && el.textContent !== texto) el.textContent = texto;
};

/**
 * Liga o cartão já desenhado. `store` é o do lib/store.js (só o `assinar`);
 * `ipc`, o lib/ipc.js (`estatisticas.obter`, `ouvir` e `EVENTOS`). Devolve a
 * função de limpeza.
 */
export function ligar(cartao, store, { ipc = ipcDoApp, doc = cartao.ownerDocument, relogio = globalThis } = {}) {
  const corpo = cartao.querySelector('[data-progresso]');
  const rodape = cartao.querySelector('[data-concluido]');
  const a = anel.ligarAnel(corpo);
  const partes = (sel) => ({
    numero: corpo.querySelector(`${sel} [data-numero]`),
    unidade: corpo.querySelector(`${sel} [data-unidade]`),
  });
  const campos = { ontem: partes('[data-coluna="ontem"]'), semana: partes('[data-coluna="semana"]'), meta: partes('.tt-anel-centro') };
  let desligado = false;
  let pedidos = 0;
  let aplicado = 0;

  const aplicar = (s) => {
    const n = numeros(s);
    // A primeira leitura desta montagem vai direto ao valor; as seguintes
    // (um fim de fase, uma meta nova) andam em 1 s.
    const animar = !corpo.hasAttribute('data-carregando') && aplicado > 0;
    for (const id of ['ontem', 'semana', 'meta']) {
      escrever(campos[id].numero, n[id]?.numero ?? '');
      escrever(campos[id].unidade, n[id]?.unidade ?? '');
    }
    corpo.toggleAttribute('data-sem-meta', !n.meta);
    corpo.removeAttribute('data-carregando');
    a.progresso(n.fracao, { animar });
    a.rotular(n.rotulo);
    escrever(rodape, n.concluido);
  };

  const atualizar = async () => {
    const meu = ++pedidos;
    try {
      const s = await ipc.estatisticas.obter();
      if (desligado || meu < aplicado) return;
      ultimo = s;
      aplicar(s);
      aplicado = meu;
    } catch (erro) {
      console.warn('[progresso]', erro);
    }
  };

  const desassinar = store?.assinar(() => void atualizar()) ?? (() => {});
  let pararDeOuvir = null;
  Promise.resolve(ipc.ouvir(ipc.EVENTOS.configuracoes, () => void atualizar()))
    .then((f) => (desligado ? f?.() : (pararDeOuvir = f)))
    .catch((erro) => console.warn('[progresso]', erro));
  const periodico = relogio.setInterval(() => {
    if (doc?.visibilityState !== 'hidden') void atualizar();
  }, RELEITURA_MS);
  void atualizar();

  return () => {
    desligado = true;
    desassinar();
    pararDeOuvir?.();
    relogio.clearInterval(periodico);
  };
}
