// Mock da API do Tauri, só para prévia no navegador (scripts/preview).
// Nunca é importado pelo app: entra na página apenas pelo vite.config.js
// desta pasta. Os comandos respondem com dados fixos; acrescente aqui os
// que as telas passarem a chamar.
//
// Parâmetros na URL (--path do shot.mjs):
//   ?maximizada=1               a janela começa maximizada
//   ?tema-do-sistema=dark|light o que o win.theme() responde (padrão: dark)
//   ?foco=N[&restante=ms][&pausado=1][&fase=i][&pular=1]
//                               M16: abre com uma sessão de N min correndo
//                               (ou pausada), com o restante dado; M18: com
//                               as fases do plan.rs, na fase i (0 = o
//                               primeiro foco) e com "Pular intervalos"
//   ?velocidade=60              M18: o relógio do motor 60 vezes mais rápido
//                               (o TOMATITO_SPEED do debug)
//   ?debug=1                    M17: o preparo do build de debug (seletor de
//                               1 em 1, a partir de 1 min)
// As globais do initialization_script (?pref, ?ultimo e ?plataforma) não são
// daqui: precisam existir antes do script de boot do <head>, e vêm do script
// clássico que o vite.config.js desta pasta põe antes dele.
import { emit } from '@tauri-apps/api/event';
import { mockIPC, mockWindows } from '@tauri-apps/api/mocks';
// Medidas do layout (M10): __ttMedidas, __ttMedir e __ttTema, para o --eval.
import './medidas.js';

const params = new URLSearchParams(location.search);

// Estado da janela simulada; os botões da barra de título o alteram.
const janela = { maximizada: params.get('maximizada') === '1', visivel: false };
const redimensionou = () =>
  emit('tauri://resize', janela.maximizada ? { width: 1920, height: 1080 } : { width: 1000, height: 700 });

// M16: um motor de foco simulado, só para a prévia, que emite tt://state como
// o Rust (src-tauri/src/events.rs). Não emite tt://tick: a contagem da prévia
// vive da estimativa do store. M18: a sessão tem as fases da regra do plan.rs
// (F = 25, B = 5; os blocos de foco repartem T·60 − intervalos·B·60 segundos,
// com o resto no último), a fase vence sozinha (um setTimeout no prazo) e o relógio
// pode andar mais rápido (?velocidade=60, como o TOMATITO_SPEED). O "Pular"
// passa para a fase seguinte, como no núcleo.
const velocidade = Number(params.get('velocidade')) > 0 ? Number(params.get('velocidade')) : 1;
const motor = { seq: 0, sessao: null, pausadoMs: null, prazo: null, faseAnterior: null };
const agoraMotor = (() => {
  const base = Date.now();
  return () => base + (Date.now() - base) * velocidade;
})();
function planejar(minutos, pular) {
  const F = 25;
  const B = 5;
  const intervalos = pular ? 0 : Math.floor((minutos - 1) / (F + B));
  const blocos = intervalos + 1;
  // Em segundos, como o plan.rs: blocos iguais e o resto no último.
  const focoS = minutos * 60 - intervalos * B * 60;
  const blocoS = Math.floor(focoS / blocos);
  const fases = [];
  for (let i = 0; i < blocos; i++) {
    fases.push({ kind: 'focus', n: i + 1, durationS: i === blocos - 1 ? focoS - blocoS * (blocos - 1) : blocoS });
    if (i < intervalos) fases.push({ kind: 'break', n: i + 1, durationS: B * 60 });
  }
  return { blocos, intervalos, fases };
}
function retratoFoco() {
  const agora = agoraMotor();
  const s = motor.sessao;
  if (!s) return { seq: motor.seq, status: 'idle', at: agora, session: null };
  const fase = s.fases[s.indice];
  const restante = motor.pausadoMs ?? Math.max(0, s.endsAt - agora);
  return {
    seq: motor.seq,
    status: motor.pausadoMs == null ? fase.kind : 'paused',
    at: agora,
    session: {
      id: s.id, minutes: s.minutos, skipBreaks: s.pular, taskId: null, focusMinutes: 25, breakMinutes: 5,
      startedAt: s.id, blocks: s.blocos, intervals: s.intervalos, phaseIndex: s.indice,
      phase: fase, phaseStartedAt: s.inicioDaFase,
      endsAt: motor.pausadoMs == null ? s.endsAt : null, remainingMs: restante,
      next: s.fases[s.indice + 1] ?? null, focusS: 0, completedAt: null,
    },
  };
}
// M19: com uma causa (started, ended, skipped, stopped), emite também o
// tt://phase, com o seq, a fase nova e o total do tipo, como o engine.rs.
function transicao(causa = null) {
  motor.seq++;
  const anterior = motor.faseAnterior;
  agendarFim();
  const r = retratoFoco();
  const s = r.session;
  const concluida = causa && causa !== 'started' && causa !== 'stopped' && !s;
  const fase = causa && {
    seq: r.seq, cause: causa, late: false,
    status: concluida ? 'completed' : r.status,
    ended: causa === 'started' ? null : anterior,
    phase: s ? s.phase : null,
    of: s ? (s.phase.kind === 'focus' ? s.blocks : s.intervals) : null,
  };
  window.__TOMATITO_PREVIEW_FASES__.push(fase || null);
  setTimeout(() => {
    emit('tt://state', r);
    if (fase) emit('tt://phase', fase);
  });
  return r;
}
window.__TOMATITO_PREVIEW_FASES__ = [];
// A fase vence no prazo: passa para a seguinte ou volta ao ocioso.
function agendarFim() {
  clearTimeout(motor.prazo);
  const s = motor.sessao;
  if (!s || motor.pausadoMs != null) return;
  motor.prazo = setTimeout(() => (proximaFase(), transicao('ended')), Math.max(0, (s.endsAt - agoraMotor()) / velocidade));
}
function proximaFase() {
  const s = motor.sessao;
  if (!s) return;
  motor.faseAnterior = s.fases[s.indice];
  if (s.indice + 1 >= s.fases.length) {
    motor.sessao = null;
    return;
  }
  s.indice++;
  s.inicioDaFase = agoraMotor();
  s.endsAt = s.inicioDaFase + s.fases[s.indice].durationS * 1000;
  motor.pausadoMs = null;
}
function iniciarFoco(minutos, restante = null, pular = false) {
  const agora = agoraMotor();
  const plano = planejar(minutos, pular);
  const d = plano.fases[0].durationS * 1000;
  motor.sessao = {
    id: Date.now(), minutos, pular, blocos: plano.blocos, intervalos: plano.intervalos, fases: plano.fases,
    indice: 0, inicioDaFase: agora - (d - Math.min(restante ?? d, d)), endsAt: agora + Math.min(restante ?? d, d),
  };
  motor.pausadoMs = null;
}
if (params.has('foco')) {
  const minutos = Number(params.get('foco'));
  const restante = params.has('restante') ? Number(params.get('restante')) : null;
  iniciarFoco(minutos, restante, params.get('pular') === '1');
  // ?fase=N começa na fase N (0 = o primeiro foco, 1 = o primeiro intervalo...).
  for (let i = Number(params.get('fase') ?? 0); i > 0; i--) proximaFase();
  if (restante != null) motor.sessao.endsAt = agoraMotor() + Math.min(restante, motor.sessao.fases[motor.sessao.indice].durationS * 1000);
  if (params.get('pausado') === '1') motor.pausadoMs = retratoFoco().session.remainingMs;
  motor.seq = 1;
  agendarFim();
}

// M17: o `setup` do get_state (src-tauri/src/events.rs, SetupDto).
const preparo =
  params.get('debug') === '1'
    ? { minMinutes: 1, maxMinutes: 240, stepMinutes: 1, focusMinutes: 25, breakMinutes: 5 }
    : { minMinutes: 5, maxMinutes: 240, stepMinutes: 5, focusMinutes: 25, breakMinutes: 5 };
// Os focus_start pedidos, para as conferências (--eval); M18: e os
// focus_skip e focus_stop.
window.__TOMATITO_PREVIEW_INICIOS__ = [];
window.__TOMATITO_PREVIEW_COMANDOS__ = [];

const handlers = {
  get_state: () => ({ focus: retratoFoco(), speed: velocidade, setup: preparo }),
  focus_start: ({ minutes, skipBreaks }) => {
    window.__TOMATITO_PREVIEW_INICIOS__.push({ minutes, skipBreaks });
    iniciarFoco(minutes, null, Boolean(skipBreaks));
    return transicao('started');
  },
  focus_pause: () => ((motor.pausadoMs = retratoFoco().session.remainingMs), transicao()),
  focus_resume: () => ((motor.sessao.endsAt = agoraMotor() + motor.pausadoMs), (motor.pausadoMs = null), transicao()),
  focus_skip: () => (window.__TOMATITO_PREVIEW_COMANDOS__.push('focus_skip'), proximaFase(), transicao('skipped')),
  focus_stop: () => {
    window.__TOMATITO_PREVIEW_COMANDOS__.push('focus_stop');
    motor.faseAnterior = motor.sessao?.fases[motor.sessao.indice] ?? null;
    motor.sessao = null;
    return transicao('stopped');
  },
  // M20: o som não toca na prévia; só anota o pedido.
  sound_test: ({ sound } = {}) => {
    window.__TOMATITO_PREVIEW_COMANDOS__.push(`sound_test:${sound ?? 'ambos'}`);
    return null;
  },
  'plugin:window|is_maximized': () => janela.maximizada,
  'plugin:window|toggle_maximize': () => {
    janela.maximizada = !janela.maximizada;
    setTimeout(redimensionou);
    return null;
  },
  'plugin:window|show': () => ((janela.visivel = true), null),
  'plugin:window|theme': () => params.get('tema-do-sistema') ?? 'dark',
  'plugin:window|minimize': () => (console.info('[prévia] minimizar'), null),
  'plugin:window|close': () => (console.info('[prévia] fechar'), null),
};

mockWindows('main');
mockIPC(
  (cmd, args) => {
    const h = handlers[cmd];
    if (!h) {
      console.warn('[prévia] comando sem mock:', cmd, args);
      return null;
    }
    return h(args);
  },
  { shouldMockEvents: true },
);

window.__TOMATITO_PREVIEW__ = true;
window.__TOMATITO_PREVIEW_JANELA__ = janela;
