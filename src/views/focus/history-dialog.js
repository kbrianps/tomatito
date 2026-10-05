// A janela "Histórico" (v0.3), aberta pelo botão "Ver histórico" do cartão
// "Progresso diário": os totais de todo o tempo e o foco por semana.
//
// - "Todo o tempo": o tempo de foco, os períodos de foco e os dias com foco,
//   e a data do primeiro registro.
// - "Por semana": um gráfico de barras das últimas 12 semanas (decorativo
//   para o leitor de tela: o rótulo resume, e a tabela embaixo traz os
//   números) e a tabela de todas as semanas, da mais nova à mais antiga. A
//   semana vai de segunda a domingo, com a hora de zerar do cartão.
// - Sem sequência, recorde nem comparação (plano, 1.1: sem gamificação).
//
// Os dados vêm do `estatisticas.historico` (o `stats_history` do Rust no
// desktop e no Android, e o IndexedDB com o mesmo cálculo em wasm na web). O
// molde é o do diálogo da meta (goal-dialog.js): um fluent-dialog modal, que
// não fecha com clique no fundo, e devolve o foco ao botão que o abriu.
import t from '../../lib/i18n/pt-BR.js';
import { horasEMinutos } from '../../lib/format.js';
import * as ipcDoApp from '../../lib/ipc.js';

const h = t.foco.historico;
const semIcone = () => '';
const numero = new Intl.NumberFormat('pt-BR');

/** Quantas semanas o gráfico mostra (as mais novas). */
export const SEMANAS_DO_GRAFICO = 12;

/** `AAAA-MM-DD` → a data, ao meio-dia UTC (sem fuso: só para somar dias e ler dia e mês). */
const data = (iso) => new Date(`${iso}T12:00:00Z`);
const dois = (n) => String(n).padStart(2, '0');
const diaMes = (d) => `${dois(d.getUTCDate())}/${dois(d.getUTCMonth() + 1)}`;
/** `14/09/2026`. */
export const dataPorExtenso = (iso) => {
  const d = data(iso);
  return `${diaMes(d)}/${d.getUTCFullYear()}`;
};

/**
 * O nome de uma semana pela segunda-feira dela: "29/09 a 05/10", com o ano
 * nas duas pontas quando não é o ano de `anoAtual` ("28/12/2025 a 03/01/2026").
 */
export function nomeDaSemana(monday, anoAtual) {
  const de = data(monday);
  const ate = new Date(de.getTime() + 6 * 86_400_000);
  const comAno = de.getUTCFullYear() !== anoAtual || ate.getUTCFullYear() !== anoAtual;
  const f = (d) => (comAno ? `${diaMes(d)}/${d.getUTCFullYear()}` : diaMes(d));
  return h.semana(f(de), f(ate));
}

/**
 * O que a janela mostra a partir do `historico` do ipc: os três totais, a
 * frase do "desde", as barras (as últimas 12 semanas, em ordem, com a fração
 * da maior) e as linhas da tabela (todas as semanas, a mais nova primeiro; a
 * última semana da lista do Rust é a atual).
 */
export function modelo(hist) {
  const semanas = Array.isArray(hist?.weeks) ? hist.weeks : [];
  if (!hist || !semanas.length) return { vazio: true };
  const anoAtual = data(semanas.at(-1).monday).getUTCFullYear();
  const recentes = semanas.slice(-SEMANAS_DO_GRAFICO);
  const maior = Math.max(...recentes.map((s) => s.focusS), 0);
  return {
    vazio: false,
    totais: [
      { rotulo: h.tempo, valor: horasEMinutos(hist.totalS) },
      { rotulo: h.periodos, valor: numero.format(hist.periods) },
      { rotulo: h.dias, valor: numero.format(hist.days) },
    ],
    desde: hist.since ? h.desde(dataPorExtenso(hist.since)) : '',
    barras: recentes.map((s) => ({ fracao: maior > 0 ? s.focusS / maior : 0, vazia: s.focusS === 0 })),
    rotuloDoGrafico: h.grafico(recentes.length, horasEMinutos(maior)),
    linhas: semanas
      .map((s, i) => ({
        nome: i === semanas.length - 1 ? h.estaSemana : nomeDaSemana(s.monday, anoAtual),
        foco: horasEMinutos(s.focusS),
        vazia: s.focusS === 0,
      }))
      .reverse(),
  };
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** O conteúdo da janela (dentro do fluent-dialog). `estado`: 'lendo', 'erro' ou o `modelo`. */
export function marcacao(estado, icone = semIcone) {
  let corpo;
  if (estado === 'lendo') corpo = '<p class="tt-historico-nota" data-lendo aria-busy="true"></p>';
  else if (estado === 'erro') corpo = `<p class="tt-historico-nota" role="alert">${h.erro}</p>`;
  else if (estado.vazio) corpo = `<p class="tt-historico-nota" data-vazio>${h.vazio}</p>`;
  else {
    const totais = estado.totais
      .map((x) => `<div class="tt-historico-total"><dt>${x.rotulo}</dt><dd class="tt-num">${esc(x.valor)}</dd></div>`)
      .join('');
    const barras = estado.barras
      .map((b) => `<span class="tt-historico-barra"${b.vazia ? ' data-vazia' : ''} data-fracao="${b.fracao.toFixed(4)}"></span>`)
      .join('');
    const linhas = estado.linhas
      .map((l) => `<tr${l.vazia ? ' data-vazia' : ''}><th scope="row">${esc(l.nome)}</th><td class="tt-num">${esc(l.foco)}</td></tr>`)
      .join('');
    corpo =
      `<section aria-labelledby="tt-historico-total"><h3 id="tt-historico-total" class="tt-t-body-strong">${h.total}</h3>` +
      `<dl class="tt-historico-totais">${totais}</dl>` +
      (estado.desde ? `<p class="tt-historico-desde tt-t-caption">${esc(estado.desde)}</p>` : '') +
      `</section>` +
      `<section aria-labelledby="tt-historico-semanas"><h3 id="tt-historico-semanas" class="tt-t-body-strong">${h.semanas}</h3>` +
      `<div class="tt-historico-grafico" role="img" aria-label="${esc(estado.rotuloDoGrafico)}">${barras}</div>` +
      `<div class="tt-historico-rolagem" tabindex="0" role="group" aria-labelledby="tt-historico-semanas">` +
      `<table class="tt-historico-tabela"><thead><tr><th scope="col">${h.colunaSemana}</th><th scope="col">${h.colunaFoco}</th></tr></thead>` +
      `<tbody>${linhas}</tbody></table></div></section>`;
  }
  return (
    `<fluent-dialog-body>` +
    `<h2 slot="title" id="tt-historico-titulo">${h.titulo}</h2>` +
    `<div class="tt-historico" data-historico-corpo>${corpo}</div>` +
    `<button type="button" slot="action" data-fechar>${icone('dismiss')}${h.fechar}</button>` +
    `</fluent-dialog-body>`
  );
}

/**
 * Cria a janela no documento e devolve `{ elemento, aberto(), abrir(), desligar() }`.
 * `gatilho` é o botão "Ver histórico" (o foco volta para ele); `ipc` é o
 * lib/ipc.js (`estatisticas.historico`).
 */
export function criar({ doc = document, gatilho = null, icone = semIcone, ipc = ipcDoApp } = {}) {
  const el = doc.createElement('fluent-dialog');
  el.className = 'tt-dialogo-historico';
  // O nome vai por aria-label: o <dialog> de verdade fica na sombra do
  // componente (o motivo está no goal-dialog.js).
  el.setAttribute('aria-label', h.titulo);
  el.setAttribute('data-dialogo', 'historico');
  doc.body.append(el);
  let desligado = false;
  let pedido = 0;

  const aberto = () => Boolean(el.dialog?.open);
  // A altura de cada barra é a fração da maior semana: uma propriedade CSS
  // posta aqui, e não um style="" na marcação.
  const pintar = () => {
    for (const b of el.querySelectorAll('.tt-historico-barra')) b.style.setProperty('--tt-fracao', b.dataset.fracao);
  };
  const mostrar = (estado) => {
    el.innerHTML = marcacao(estado, icone);
    pintar();
  };

  const aoClicar = (ev) => {
    if (ev.target?.closest?.('[data-fechar]')) el.hide();
  };
  const aoClicarNoFundo = (ev) => {
    if (ev.composedPath?.()[0] === el.dialog) ev.stopPropagation();
  };
  const aoAlternar = (ev) => {
    if (ev.target !== el || ev.detail?.newState !== 'closed') return;
    // Fechada antes da resposta: a leitura em curso é descartada.
    pedido += 1;
    gatilho?.focus?.();
  };
  el.addEventListener('click', aoClicarNoFundo, true);
  el.addEventListener('click', aoClicar);
  el.addEventListener('toggle', aoAlternar);

  return {
    elemento: el,
    aberto,
    /** Abre e lê o histórico; aberto, não faz nada. */
    async abrir() {
      if (desligado || aberto()) return;
      const meu = ++pedido;
      mostrar('lendo');
      el.show();
      let estado;
      try {
        estado = modelo(await ipc.estatisticas.historico());
      } catch (erro) {
        console.warn('[histórico]', erro);
        estado = 'erro';
      }
      // O show() do Fluent só abre o <dialog> um instante depois: a resposta
      // confere o pedido (que o fechamento invalida), e não o aberto().
      if (desligado || meu !== pedido) return;
      mostrar(estado);
      el.querySelector('[data-fechar]')?.focus();
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
