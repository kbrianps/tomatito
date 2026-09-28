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
//   ?hoje=&ontem=&semana=       M26: os segundos de foco do stats_get
//   ?meta=N                     M27: a meta diária (dailyGoalMinutes; 0 =
//                               desativada)
//   ?zerar=H                    M28: a hora de zerar (resetHour)
//   ?tarefas=A|B*|C             M29: as tarefas iniciais, separadas por "|";
//                               um "*" no fim marca a concluída
//   ?tarefa=N                   M30: com ?foco=, a sessão já aberta tem a
//                               tarefa N (taskId)
//   ?tempos=1@-12000,2@150000,3~40000
//                               M32: os temporizadores padrão (1, 3, 5 e 10
//                               min) com o estado dado: id@restante correndo,
//                               id~restante pausado (ms; negativo depois do
//                               zero, já com o fim disparado)
//   ?validacao=asking|timeout|revert
//                               M52: o retrato da validação do Full que o
//                               full_validation_get devolve: a pergunta (10 s
//                               a partir da abertura) ou a oferta do modo
//                               opaco (depois do prazo ou do Reverter)
//   ?cronometro=running@1870[&voltas=900,1500]
//                               M34: o cronômetro correndo (ou paused@ms,
//                               pausado) com o decorrido dado, em ms, e as
//                               voltas (o total em cada uma)
// M28: com window.__TOMATITO_PREVIEW_RECUSAR_CONFIGURACOES__ = true (pelo
// --eval), o settings_set rejeita como o Rust quando não consegue gravar.
// As globais do initialization_script (?pref, ?ultimo e ?plataforma) não são
// daqui: precisam existir antes do script de boot do <head>, e vêm do script
// clássico que o vite.config.js desta pasta põe antes dele.
import { emit } from '@tauri-apps/api/event';
import { mockIPC, mockWindows } from '@tauri-apps/api/mocks';
// Medidas do layout (M10): __ttMedidas, __ttMedir e __ttTema, para o --eval.
import './medidas.js';

const params = new URLSearchParams(location.search);

// Estado da janela simulada; os botões da barra de título o alteram.
const janela = { maximizada: params.get('maximizada') === '1', visivel: false, temaNativo: null };
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
      id: s.id, minutes: s.minutos, skipBreaks: s.pular, taskId: s.tarefa ?? null, focusMinutes: 25, breakMinutes: 5,
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
// M27: o que o stats_get soma, como o stats.rs: cada foco que termina conta o
// tempo corrido, se completo ou com pelo menos 1 min (3.3). Começa nos
// números da URL (?hoje=, ?ontem=, ?semana=, em segundos).
const somas = {
  ontem: Number(params.get('ontem') ?? 0),
  hoje: Number(params.get('hoje') ?? 0),
  semana: Number(params.get('semana') ?? params.get('hoje') ?? 0),
};
function registrarFoco(completo) {
  const s = motor.sessao;
  const fase = s?.fases[s.indice];
  if (!fase || fase.kind !== 'focus') return;
  const restante = motor.pausadoMs ?? Math.max(0, s.endsAt - agoraMotor());
  const corrido = completo ? fase.durationS : Math.floor((fase.durationS * 1000 - restante) / 1000);
  if (!completo && corrido < 60) return;
  window.__TOMATITO_PREVIEW_PERIODOS__.push({ kind: 'focus', actualS: corrido, completed: completo, taskId: s.tarefa ?? null });
  somas.hoje += corrido;
  somas.semana += corrido;
}
// A fase vence no prazo: passa para a seguinte ou volta ao ocioso.
function agendarFim() {
  clearTimeout(motor.prazo);
  const s = motor.sessao;
  if (!s || motor.pausadoMs != null) return;
  motor.prazo = setTimeout(
    () => (registrarFoco(true), proximaFase(), transicao('ended')),
    Math.max(0, (s.endsAt - agoraMotor()) / velocidade),
  );
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
// M30: os períodos de foco que o motor simulado grava, com o task_id, como o
// stats.rs (só os focos; para as conferências do cartão de tarefas).
window.__TOMATITO_PREVIEW_PERIODOS__ = [];
function iniciarFoco(minutos, restante = null, pular = false, tarefa = null) {
  const agora = agoraMotor();
  const plano = planejar(minutos, pular);
  const d = plano.fases[0].durationS * 1000;
  motor.sessao = {
    id: Date.now(), minutos, pular, tarefa, blocos: plano.blocos, intervalos: plano.intervalos, fases: plano.fases,
    indice: 0, inicioDaFase: agora - (d - Math.min(restante ?? d, d)), endsAt: agora + Math.min(restante ?? d, d),
  };
  motor.pausadoMs = null;
}
if (params.has('foco')) {
  const minutos = Number(params.get('foco'));
  const restante = params.has('restante') ? Number(params.get('restante')) : null;
  iniciarFoco(minutos, restante, params.get('pular') === '1', params.has('tarefa') ? Number(params.get('tarefa')) : null);
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

// M23: as configurações (src-tauri/src/settings.rs), com os padrões da 3.3 e
// o tema das globais da prévia. O settings_set faz a mesma fusão e as mesmas
// regras de tema do Rust, mas sem conferir faixas; emite tt://settings.
const configuracoes = {
  schemaVersion: 1, theme: window.__TT_PREF__ ?? 'lite', lastNormalTheme: window.__TT_LAST__ ?? 'lite',
  resolvedTheme: 'lite', focusMinutes: 25, breakMinutes: 5, sounds: { focusEnd: true, breakEnd: true },
  volume: 80, closeToTray: true, trayTime: false, dailyGoalMinutes: 120, resetHour: 0, tomatoSize: 280,
  tomatoOnTop: true, fullMode: 'auto', fullValidated: '', linuxX11: false,
};
function normalizarConfiguracoes(c) {
  if (c.theme !== 'full') c.lastNormalTheme = c.theme;
  const fixo = ['lite', 'suave', 'light', 'dark'].includes(c.lastNormalTheme) ? c.lastNormalTheme : null;
  c.resolvedTheme = fixo ?? (c.resolvedTheme === 'dark' ? 'dark' : 'light');
}
if (params.has('meta')) configuracoes.dailyGoalMinutes = Number(params.get('meta'));
if (params.has('zerar')) configuracoes.resetHour = Number(params.get('zerar'));
normalizarConfiguracoes(configuracoes);
window.__TOMATITO_PREVIEW_CONFIGURACOES__ = configuracoes;

// M29: as tarefas da prévia (?tarefas=A|B*|C).
const tarefas = { proximo: 1, lista: [] };
function tarefa(titulo, agora) {
  const limpo = String(titulo ?? '').replace(/\p{Cc}/gu, ' ').trim();
  if (!limpo) throw { code: 'emptyTitle', message: 'o título da tarefa está vazio' };
  if ([...limpo].length > 255) throw { code: 'titleTooLong', message: 'o título passou de 255 caracteres' };
  return { id: tarefas.proximo++, title: limpo, createdAt: agora, doneAt: null };
}
function acharTarefa(id) {
  const t = tarefas.lista.find((x) => x.id === id);
  if (!t) throw { code: 'notFound', message: `não existe a tarefa ${id}` };
  return t;
}
for (const item of (params.get('tarefas') ?? '').split('|').filter(Boolean)) {
  const feita = item.endsWith('*');
  const t = tarefa(feita ? item.slice(0, -1) : item, Date.now());
  if (feita) t.doneAt = Date.now();
  tarefas.lista.push(t);
}
window.__TOMATITO_PREVIEW_TAREFAS__ = tarefas;

// M32: os temporizadores, como o countdown.rs e o engine.rs: prazo no relógio
// do motor, fim disparado uma vez (um setTimeout no prazo), contagem negativa
// e o tt://timers a cada mudança. O som e a notificação do fim ficam
// anotados em __TOMATITO_PREVIEW_FINS__ (a prévia não toca nem notifica).
const tempos = { seq: 0, proximo: 1, lista: [] };
window.__TOMATITO_PREVIEW_FINS__ = [];
for (const min of [1, 3, 5, 10]) tempos.lista.push({ id: tempos.proximo++, name: '', durationMs: min * 60_000, run: 'idle', endsAt: null, restante: null, ended: false, prazo: null });
const restanteDo = (tm, agora = agoraMotor()) =>
  Math.min(tm.durationMs, tm.run === 'running' ? tm.endsAt - agora : tm.run === 'paused' ? tm.restante : tm.durationMs);
function retratoDosTempos() {
  const at = agoraMotor();
  return {
    seq: tempos.seq, at,
    timers: tempos.lista.map((tm) => {
      const r = restanteDo(tm, at);
      return { id: tm.id, name: tm.name, durationMs: tm.durationMs, status: tm.run, endsAt: tm.run === 'running' ? tm.endsAt : null,
        remainingMs: r, ended: tm.ended, overdue: r < 0 || (tm.ended && r === 0) };
    }),
  };
}
function mudouTempos() {
  tempos.seq++;
  for (const tm of tempos.lista) {
    clearTimeout(tm.prazo);
    if (tm.run === 'running' && !tm.ended) {
      tm.prazo = setTimeout(() => {
        tm.ended = true;
        window.__TOMATITO_PREVIEW_FINS__.push({ id: tm.id, som: 'focusEnd', notificacao: true });
        mudouTempos();
      }, Math.max(0, (tm.endsAt - agoraMotor()) / velocidade));
    }
  }
  const r = retratoDosTempos();
  setTimeout(() => emit('tt://timers', r));
  return r;
}
const acharTempo = (id) => {
  const tm = tempos.lista.find((x) => x.id === id);
  if (!tm) throw { code: 'notFound', message: `não existe temporizador com o id ${id}` };
  return tm;
};
for (const item of (params.get('tempos') ?? '').split(',').filter(Boolean)) {
  const m = /^(\d+)([@~])(-?\d+)$/.exec(item);
  if (!m) continue;
  const tm = acharTempo(Number(m[1]));
  const r = Number(m[3]);
  if (m[2] === '@') Object.assign(tm, { run: 'running', endsAt: agoraMotor() + r });
  else Object.assign(tm, { run: 'paused', restante: r });
  tm.ended = r <= 0;
}
if (params.has('tempos')) mudouTempos();
window.__TOMATITO_PREVIEW_TEMPOS__ = tempos;
function nomeDoTempo(name, durationMs) {
  if (!(durationMs >= 1000 && durationMs <= 359_999_000)) throw { code: 'invalidDuration', message: 'duração fora da faixa' };
  const limpo = String(name ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  if ([...limpo].length > 255) throw { code: 'nameTooLong', message: 'o nome passa de 255 caracteres' };
  return limpo;
}
const comandoDoTempo = (nome, f) => (args) => {
  window.__TOMATITO_PREVIEW_COMANDOS__.push(`${nome}:${args?.id ?? ''}`);
  f(args);
  return mudouTempos();
};

// M34: o cronômetro, como o stopwatch.rs e o engine.rs: started_at mais o
// acumulado, no relógio do motor, com o tt://stopwatch a cada transição.
const crono = { seq: 0, run: 'idle', inicio: null, acumulado: 0, voltas: [] };
const decorridoDoCrono = (agora = agoraMotor()) => crono.acumulado + (crono.run === 'running' ? Math.max(0, agora - crono.inicio) : 0);
function retratoDoCrono() {
  const at = agoraMotor();
  return { seq: crono.seq, at, status: crono.run, startedAt: crono.run === 'running' ? crono.inicio : null,
    accumulatedMs: crono.acumulado, elapsedMs: decorridoDoCrono(at), laps: [...crono.voltas] };
}
{
  const m = /^(running|paused)@(\d+)$/.exec(params.get('cronometro') ?? '');
  if (m) {
    Object.assign(crono, { seq: 1, run: m[1], acumulado: m[1] === 'paused' ? Number(m[2]) : 0, inicio: m[1] === 'running' ? agoraMotor() - Number(m[2]) : null });
    crono.voltas = (params.get('voltas') ?? '').split(',').filter(Boolean).map(Number);
  }
}
window.__TOMATITO_PREVIEW_CRONOMETRO__ = crono;
const comandoDoCrono = (nome, f) => () => {
  window.__TOMATITO_PREVIEW_COMANDOS__.push(nome);
  f();
  crono.seq++;
  const r = retratoDoCrono();
  setTimeout(() => emit('tt://stopwatch', r));
  return r;
};

const handlers = {
  get_state: () => ({ focus: retratoFoco(), speed: velocidade, setup: preparo, timers: retratoDosTempos(), stopwatch: retratoDoCrono(), settings: structuredClone(configuracoes) }),
  stopwatch_start: comandoDoCrono('stopwatch_start', () => {
    if (crono.run === 'running') throw { code: 'alreadyRunning', message: 'o cronômetro já está correndo' };
    Object.assign(crono, { run: 'running', inicio: agoraMotor() });
  }),
  stopwatch_pause: comandoDoCrono('stopwatch_pause', () => {
    if (crono.run !== 'running') throw { code: 'notRunning', message: 'o cronômetro não está correndo' };
    Object.assign(crono, { acumulado: decorridoDoCrono(), run: 'paused', inicio: null });
  }),
  stopwatch_lap: comandoDoCrono('stopwatch_lap', () => {
    if (crono.run !== 'running') throw { code: 'notRunning', message: 'o cronômetro não está correndo' };
    crono.voltas.push(decorridoDoCrono());
  }),
  stopwatch_reset: comandoDoCrono('stopwatch_reset', () => Object.assign(crono, { run: 'idle', inicio: null, acumulado: 0, voltas: [] })),
  timer_start: comandoDoTempo('timer_start', ({ id }) => {
    const tm = acharTempo(id);
    if (tm.run === 'running') throw { code: 'alreadyRunning', message: 'o temporizador já está correndo' };
    Object.assign(tm, { endsAt: agoraMotor() + restanteDo(tm), run: 'running' });
  }),
  timer_pause: comandoDoTempo('timer_pause', ({ id }) => {
    const tm = acharTempo(id);
    if (tm.run !== 'running') throw { code: 'notRunning', message: 'o temporizador não está correndo' };
    Object.assign(tm, { restante: restanteDo(tm), run: 'paused' });
  }),
  timer_reset: comandoDoTempo('timer_reset', ({ id }) => Object.assign(acharTempo(id), { run: 'idle', ended: false })),
  // M33: criar, editar e excluir, com as regras do countdown.rs: duração de
  // 1 s a 99:59:59, nome limpo de até 255 caracteres, e trocar a duração
  // volta o temporizador a parado. O nome gravado vai para o registro de
  // comandos, para a conferência ver o que chegou ao "Rust".
  timer_create: comandoDoTempo('timer_create', ({ name, durationMs }) => {
    const nome = nomeDoTempo(name, durationMs);
    tempos.lista.push({ id: tempos.proximo++, name: nome, durationMs, run: 'idle', endsAt: null, restante: null, ended: false, prazo: null });
    window.__TOMATITO_PREVIEW_COMANDOS__.push(`timer_create:${JSON.stringify({ name: nome, durationMs })}`);
  }),
  timer_update: comandoDoTempo('timer_update', ({ id, name, durationMs }) => {
    const tm = acharTempo(id);
    tm.name = nomeDoTempo(name, durationMs);
    if (tm.durationMs !== durationMs) Object.assign(tm, { durationMs, run: 'idle', ended: false });
    window.__TOMATITO_PREVIEW_COMANDOS__.push(`timer_update:${JSON.stringify({ id, name: tm.name, durationMs })}`);
  }),
  timer_delete: comandoDoTempo('timer_delete', ({ id }) => {
    const tm = acharTempo(id);
    clearTimeout(tm.prazo);
    tempos.lista.splice(tempos.lista.indexOf(tm), 1);
  }),
  settings_get: () => structuredClone(configuracoes),
  settings_set: ({ patch }) => {
    if (window.__TOMATITO_PREVIEW_RECUSAR_CONFIGURACOES__) {
      window.__TOMATITO_PREVIEW_COMANDOS__.push(`settings_set:recusado`);
      throw { code: 'writeFailed', message: 'prévia: gravação recusada' };
    }
    const { sounds, ...resto } = patch ?? {};
    Object.assign(configuracoes, resto);
    if (sounds) Object.assign(configuracoes.sounds, sounds);
    normalizarConfiguracoes(configuracoes);
    window.__TOMATITO_PREVIEW_COMANDOS__.push(`settings_set:${JSON.stringify(patch)}`);
    setTimeout(() => emit('tt://settings', structuredClone(configuracoes)));
    return structuredClone(configuracoes);
  },
  focus_start: ({ minutes, skipBreaks, taskId = null }) => {
    window.__TOMATITO_PREVIEW_INICIOS__.push({ minutes, skipBreaks, taskId });
    iniciarFoco(minutes, null, Boolean(skipBreaks), taskId);
    return transicao('started');
  },
  focus_pause: () => ((motor.pausadoMs = retratoFoco().session.remainingMs), transicao()),
  focus_resume: () => ((motor.sessao.endsAt = agoraMotor() + motor.pausadoMs), (motor.pausadoMs = null), transicao()),
  focus_skip: () => (window.__TOMATITO_PREVIEW_COMANDOS__.push('focus_skip'), registrarFoco(false), proximaFase(), transicao('skipped')),
  focus_stop: () => {
    window.__TOMATITO_PREVIEW_COMANDOS__.push('focus_stop');
    registrarFoco(false);
    motor.faseAnterior = motor.sessao?.fases[motor.sessao.indice] ?? null;
    motor.sessao = null;
    return transicao('stopped');
  },
  // M20: o som não toca na prévia; só anota o pedido.
  sound_test: ({ sound } = {}) => {
    window.__TOMATITO_PREVIEW_COMANDOS__.push(`sound_test:${sound ?? 'ambos'}`);
    return null;
  },
  // M26: os números da URL (?hoje=1500&ontem=...&semana=..., em segundos),
  // com a meta e a hora de zerar das configurações. M27: mais os focos que o
  // motor simulado termina (registrarFoco).
  stats_get: () => {
    window.__TOMATITO_PREVIEW_COMANDOS__.push('stats_get');
    return {
      yesterdayS: somas.ontem,
      todayS: somas.hoje,
      weekS: somas.semana,
      dailyGoalMinutes: configuracoes.dailyGoalMinutes,
      resetHour: configuracoes.resetHour,
    };
  },
  // M29: as tarefas numa lista em memória, com as regras do tasks.rs (título
  // limpo, de 1 a 255 caracteres; ordem de criação). A virada do dia não é
  // simulada: as concluídas ficam na lista.
  task_list: () => (window.__TOMATITO_PREVIEW_COMANDOS__.push('task_list'), structuredClone(tarefas.lista)),
  task_add: ({ title }) => {
    window.__TOMATITO_PREVIEW_COMANDOS__.push(`task_add:${title}`);
    const t = tarefa(title, agoraMotor());
    tarefas.lista.push(t);
    return structuredClone(t);
  },
  task_complete: ({ id, done = true }) => {
    window.__TOMATITO_PREVIEW_COMANDOS__.push(`task_complete:${id}:${done}`);
    const t = acharTarefa(id);
    t.doneAt = done ? (t.doneAt ?? agoraMotor()) : null;
    return structuredClone(t);
  },
  task_delete: ({ id }) => {
    window.__TOMATITO_PREVIEW_COMANDOS__.push(`task_delete:${id}`);
    acharTarefa(id);
    tarefas.lista = tarefas.lista.filter((t) => t.id !== id);
    return null;
  },
  'plugin:window|is_maximized': () => janela.maximizada,
  'plugin:window|toggle_maximize': () => {
    janela.maximizada = !janela.maximizada;
    setTimeout(redimensionou);
    return null;
  },
  'plugin:window|show': () => ((janela.visivel = true), null),
  // M24: como o tao no Linux, o theme() responde o tema fixado pelo
  // setTheme, e o do sistema quando não há um (setTheme(null)).
  'plugin:window|theme': () => janela.temaNativo ?? params.get('tema-do-sistema') ?? 'dark',
  'plugin:window|set_theme': ({ value }) => {
    janela.temaNativo = value ?? null;
    window.__TOMATITO_PREVIEW_COMANDOS__.push(`set_theme:${value ?? 'null'}`);
    return null;
  },
  'plugin:window|minimize': () => (console.info('[prévia] minimizar'), null),
  'plugin:window|close': () => (console.info('[prévia] fechar'), null),
  // M50: os comandos do Full só anotam o pedido.
  show_main: ({ route = null } = {}) => (window.__TOMATITO_PREVIEW_COMANDOS__.push(`show_main:${route}`), null),
  // M51: o switch_window_mode grava o tema como o Rust (full, ou o
  // lastNormalTheme na saída) e emite tt://settings; não há outra janela.
  switch_window_mode: ({ full }) => {
    window.__TOMATITO_PREVIEW_COMANDOS__.push(`switch_window_mode:${full}`);
    configuracoes.theme = full ? 'full' : configuracoes.lastNormalTheme;
    normalizarConfiguracoes(configuracoes);
    setTimeout(() => emit('tt://settings', structuredClone(configuracoes)));
    return null;
  },
  // M52: a validação do Full (window/validacao.rs), sem o prazo: a pergunta
  // fica até a resposta. As respostas seguem o Rust (Manter e o modo opaco
  // fecham; Reverter vira a oferta do B3; "Agora não" fecha a oferta).
  full_validation_get: () => structuredClone(validacao.retrato),
  full_validation_answer: ({ answer }) => {
    window.__TOMATITO_PREVIEW_COMANDOS__.push(`full_validation_answer:${answer}`);
    const estado = validacao.retrato.state;
    const trocar = (r) => {
      validacao.retrato = { seq: validacao.retrato.seq + 1, ...r };
      setTimeout(() => emit('tt://full-validation', structuredClone(validacao.retrato)));
    };
    if (answer === 'keep' && estado === 'asking') trocar({ state: 'none' });
    else if (answer === 'revert' && estado === 'asking') trocar({ state: 'reverted', reason: 'revert' });
    else if (answer === 'dismiss' && estado === 'reverted') trocar({ state: 'none' });
    else if (answer === 'opaque') {
      configuracoes.fullMode = 'opaque';
      trocar({ state: 'none' });
    }
    return structuredClone(validacao.retrato);
  },
};

// M52: o retrato inicial da validação (?validacao=).
const validacao = {
  retrato: (() => {
    const p = params.get('validacao');
    if (p === 'asking') return { seq: 1, state: 'asking', deadlineMs: Date.now() + 10000, seconds: 10 };
    if (p === 'timeout' || p === 'revert') return { seq: 1, state: 'reverted', reason: p };
    return { seq: 0, state: 'none' };
  })(),
};

// M50: a página do tomate (/tomato.html) é a janela `tomato`.
mockWindows(location.pathname.includes('tomato') ? 'tomato' : 'main');
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
