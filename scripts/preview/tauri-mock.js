// Mock da API do Tauri, só para prévia no navegador (scripts/preview).
// Nunca é importado pelo app: entra na página apenas pelo vite.config.js
// desta pasta. Os comandos respondem com dados fixos; acrescente aqui os
// que as telas passarem a chamar.
//
// Parâmetros na URL (--path do shot.mjs):
//   ?maximizada=1               a janela começa maximizada
//   ?tema-do-sistema=dark|light o que o win.theme() responde (padrão: dark)
//   ?foco=N[&restante=ms][&pausado=1]
//                               M16: abre com uma sessão de foco de N min
//                               correndo (ou pausada), com o restante dado
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

// M16: um motor de foco simulado, só para a prévia: uma sessão de um bloco
// só, sem intervalos, que emite tt://state como o Rust (src-tauri/src/events.rs).
// Não emite tt://tick: a contagem da prévia vive da estimativa do store.
const motor = { seq: 0, sessao: null, pausadoMs: null };
function retratoFoco() {
  const agora = Date.now();
  const s = motor.sessao;
  if (!s) return { seq: motor.seq, status: 'idle', at: agora, session: null };
  const restante = motor.pausadoMs ?? Math.max(0, s.endsAt - agora);
  return {
    seq: motor.seq,
    status: motor.pausadoMs == null ? 'focus' : 'paused',
    at: agora,
    session: {
      id: s.id, minutes: s.minutos, skipBreaks: false, taskId: null, focusMinutes: 25, breakMinutes: 5,
      startedAt: s.id, blocks: 1, intervals: 0, phaseIndex: 0,
      phase: { kind: 'focus', n: 1, durationS: s.minutos * 60 }, phaseStartedAt: s.id,
      endsAt: motor.pausadoMs == null ? s.endsAt : null, remainingMs: restante,
      next: null, focusS: 0, completedAt: null,
    },
  };
}
function transicao() {
  motor.seq++;
  const r = retratoFoco();
  setTimeout(() => emit('tt://state', r));
  return r;
}
function iniciarFoco(minutos, restante = minutos * 60_000) {
  const agora = Date.now();
  motor.sessao = { id: agora, minutos, endsAt: agora + restante };
  motor.pausadoMs = null;
}
if (params.has('foco')) {
  const minutos = Number(params.get('foco'));
  iniciarFoco(minutos, Number(params.get('restante') ?? minutos * 60_000));
  if (params.get('pausado') === '1') motor.pausadoMs = Number(params.get('restante') ?? minutos * 60_000);
  motor.seq = 1;
}

const handlers = {
  get_state: () => ({ focus: retratoFoco(), speed: 1 }),
  focus_start: ({ minutes }) => (iniciarFoco(minutes), transicao()),
  focus_pause: () => ((motor.pausadoMs = retratoFoco().session.remainingMs), transicao()),
  focus_resume: () => ((motor.sessao.endsAt = Date.now() + motor.pausadoMs), (motor.pausadoMs = null), transicao()),
  focus_skip: () => ((motor.sessao = null), transicao()),
  focus_stop: () => ((motor.sessao = null), transicao()),
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
