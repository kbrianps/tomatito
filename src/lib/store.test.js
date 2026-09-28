// Testes do store (M16) com um IPC falso e um relógio de parede falso.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarStore, PREPARO_PADRAO } from './store.js';

const EVENTOS = { estado: 'tt://state', tick: 'tt://tick' };
const T0 = 1_790_000_000_000;

function sessao({ id = T0, fase = 0, restante = 300_000, correndo = true, kind = 'focus', n = 1 } = {}) {
  return {
    id, minutes: 5, skipBreaks: false, taskId: null, focusMinutes: 25, breakMinutes: 5,
    startedAt: T0, blocks: 1, intervals: 0, phaseIndex: fase,
    phase: { kind, n, durationS: 300 }, phaseStartedAt: T0,
    endsAt: correndo ? T0 + restante : null, remainingMs: restante, next: null, focusS: 0, completedAt: null,
  };
}
const retrato = (seq, status, s = null, at = T0) => ({ seq, status, at, session: s });

function montar({ estado = { focus: retrato(0, 'idle'), speed: 1 } } = {}) {
  const relogio = { agora: T0 };
  const ouvidos = {};
  const chamadas = [];
  const ipc = {
    obterEstado: async () => (chamadas.push('get_state'), typeof estado === 'function' ? estado() : estado),
    ouvir: async (ev, cb) => ((ouvidos[ev] = cb), () => {}),
    foco: {
      iniciar: async (m) => (chamadas.push(`iniciar ${m}`), retrato(1, 'focus', sessao())),
      pausar: async () => {
        chamadas.push('pausar');
        throw { code: 'notRunning', message: 'x' };
      },
    },
  };
  const store = criarStore({ ipc, eventos: EVENTOS, agora: () => relogio.agora });
  return { store, relogio, ouvidos, chamadas, set estado(e) { estado = e; } };
}

// Um EventTarget mínimo, como o document e a window.
function alvo(extra = {}) {
  const ouv = {};
  return Object.assign(
    { addEventListener: (tipo, f) => ((ouv[tipo] ??= []).push(f)), disparar: (tipo) => ouv[tipo]?.forEach((f) => f()) },
    extra,
  );
}

test('ligar ouve os dois eventos e faz o primeiro get_state', async () => {
  const m = montar({ estado: { focus: retrato(3, 'focus', sessao({ restante: 200_000 })), speed: 1 } });
  await m.store.ligar({ doc: alvo(), janela: alvo() });
  assert.deepEqual(Object.keys(m.ouvidos).sort(), ['tt://state', 'tt://tick']);
  assert.deepEqual(m.chamadas, ['get_state']);
  assert.equal(m.store.foco.seq, 3);
  assert.equal(m.store.restanteMs(), 200_000);
  assert.equal(m.store.correndo, true);
});

test('entre ticks, o restante desconta o relógio de parede (minimizar, suspender)', () => {
  const m = montar();
  m.store.aplicarFoco(retrato(1, 'focus', sessao()));
  m.relogio.agora += 1_500;
  assert.equal(m.store.restanteMs(), 298_500);
  // 6 min sem tick nenhum (janela minimizada, WebView sem timers): a leitura
  // já sai certa, e a contagem para em 0.
  m.relogio.agora += 6 * 60_000;
  assert.equal(m.store.restanteMs(), 0);
});

test('o tick corrige o desvio; tick velho é ignorado; tick de outra fase pede get_state', async () => {
  const m = montar({ estado: { focus: retrato(2, 'break', sessao({ fase: 1, kind: 'break' })), speed: 1 } });
  m.store.aplicarFoco(retrato(1, 'focus', sessao()));
  m.relogio.agora += 10_000;
  m.store.aplicarTick({ seq: 1, sessionId: T0, phaseIndex: 0, remainingMs: 289_000, at: 0, endsAtMs: 0 });
  assert.equal(m.store.restanteMs(), 289_000);
  m.store.aplicarTick({ seq: 0, sessionId: T0, phaseIndex: 0, remainingMs: 1, at: 0, endsAtMs: 0 });
  assert.equal(m.store.restanteMs(), 289_000, 'seq menor: ignorado');
  assert.deepEqual(m.chamadas, []);
  m.store.aplicarTick({ seq: 2, sessionId: T0, phaseIndex: 1, remainingMs: 300_000, at: 0, endsAtMs: 0 });
  await m.store.sincronizar();
  assert.deepEqual(m.chamadas, ['get_state']);
  assert.equal(m.store.foco.status, 'break');
});

test('retrato mais velho que o atual é descartado; o de mesmo seq entra', () => {
  const m = montar();
  const avisos = [];
  m.store.assinar((f) => avisos.push(f.seq));
  assert.equal(m.store.aplicarFoco(retrato(5, 'focus', sessao())), true);
  assert.equal(m.store.aplicarFoco(retrato(4, 'idle')), false);
  assert.equal(m.store.aplicarFoco(retrato(5, 'focus', sessao({ restante: 100_000 }))), true);
  assert.deepEqual(avisos, [5, 5]);
  assert.equal(m.store.restanteMs(), 100_000);
});

test('pausado e ocioso não contam', () => {
  const m = montar();
  m.store.aplicarFoco(retrato(1, 'paused', sessao({ correndo: false, restante: 123_456 })));
  m.relogio.agora += 60_000;
  assert.equal(m.store.correndo, false);
  assert.equal(m.store.restanteMs(), 123_456);
  m.store.aplicarFoco(retrato(2, 'idle'));
  assert.equal(m.store.restanteMs(), null);
});

test('a velocidade do get_state acelera a estimativa (TOMATITO_SPEED)', async () => {
  const m = montar({ estado: { focus: retrato(1, 'focus', sessao()), speed: 60 } });
  await m.store.sincronizar();
  m.relogio.agora += 1_000;
  assert.equal(m.store.restanteMs(), 240_000);
});

test('visibilitychange (visível) e foco da janela ressincronizam', async () => {
  const m = montar();
  const doc = alvo({ visibilityState: 'visible' });
  const janela = alvo();
  await m.store.ligar({ doc, janela });
  m.chamadas.length = 0;
  doc.visibilityState = 'hidden';
  doc.disparar('visibilitychange');
  await m.store.sincronizar().catch(() => {});
  assert.deepEqual(m.chamadas, ['get_state'], 'escondida: só o sincronizar explícito');
  m.chamadas.length = 0;
  doc.visibilityState = 'visible';
  doc.disparar('visibilitychange');
  await m.store.sincronizar();
  janela.disparar('focus');
  await m.store.sincronizar();
  assert.deepEqual(m.chamadas, ['get_state', 'get_state']);
});

test('chamadas seguidas de sincronizar dividem um pedido', async () => {
  const m = montar();
  await Promise.all([m.store.sincronizar(), m.store.sincronizar(), m.store.sincronizar()]);
  assert.deepEqual(m.chamadas, ['get_state']);
});

test('comando aplica a resposta; comando recusado ressincroniza e rejeita', async () => {
  const m = montar();
  await m.store.comando('iniciar', 5);
  assert.equal(m.store.foco.status, 'focus');
  await assert.rejects(m.store.comando('pausar'), { code: 'notRunning' });
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(m.chamadas, ['iniciar 5', 'pausar', 'get_state']);
});

test('M17: o preparo vem do get_state, com o padrão antes e diante de um setup inválido', async () => {
  const debug = { minMinutes: 1, maxMinutes: 240, stepMinutes: 1, focusMinutes: 25, breakMinutes: 5 };
  const m = montar({ estado: { focus: retrato(0, 'idle'), speed: 1, setup: debug } });
  assert.deepEqual(m.store.preparo, PREPARO_PADRAO);
  assert.deepEqual(PREPARO_PADRAO, { minMinutes: 5, maxMinutes: 240, stepMinutes: 5, focusMinutes: 25, breakMinutes: 5 });
  await m.store.sincronizar();
  assert.deepEqual(m.store.preparo, debug);
  assert.ok(Object.isFrozen(m.store.preparo));
  for (const ruim of [null, { ...debug, breakMinutes: 0 }, { ...debug, minMinutes: 300 }, { ...debug, stepMinutes: 1.5 }]) {
    m.estado = { focus: retrato(0, 'idle'), speed: 1, setup: ruim };
    await m.store.sincronizar();
    assert.deepEqual(m.store.preparo, debug, `ignora ${JSON.stringify(ruim)}`);
  }
});

// M32: os temporizadores.
const temporizador = (id, { status = 'idle', restante = 60_000, duracao = 60_000, ended = false } = {}) => ({
  id, name: '', durationMs: duracao, status,
  endsAt: status === 'running' ? T0 + restante : null,
  remainingMs: restante, ended, overdue: restante < 0 || (ended && restante === 0),
});
const temporizadores = (seq, ...timers) => ({ seq, at: T0, timers });

test('temporizadores: o get_state traz o retrato, e o evento é ouvido quando existe', async () => {
  const m = montar({ estado: { focus: retrato(0, 'idle'), speed: 1, timers: temporizadores(0, temporizador(1)) } });
  m.store.ligar({ doc: alvo(), janela: alvo() });
  await new Promise((r) => setTimeout(r));
  assert.equal(m.store.temporizadores.timers.length, 1);
  assert.equal(m.store.restanteDoTemporizador(1), 60_000);
  assert.equal(m.store.restanteDoTemporizador(9), null);

  const m2 = montar();
  const ouvidos = {};
  const ipc = { obterEstado: async () => ({ focus: retrato(0, 'idle'), speed: 1 }), ouvir: async (ev, cb) => ((ouvidos[ev] = cb), () => {}) };
  const s2 = criarStore({ ipc, eventos: { ...EVENTOS, temporizadores: 'tt://timers' }, agora: () => m2.relogio.agora });
  await s2.ligar({ doc: alvo(), janela: alvo() });
  assert.deepEqual(Object.keys(ouvidos).sort(), ['tt://state', 'tt://tick', 'tt://timers']);
});

test('temporizadores: dois correndo descontam o relógio, passam do zero e o pausado fica parado', () => {
  const m = montar();
  m.store.aplicarTemporizadores(
    temporizadores(2, temporizador(1, { status: 'running', restante: 10_000 }), temporizador(2, { status: 'running', restante: 180_000, duracao: 180_000 }), temporizador(3, { status: 'paused', restante: 5_000 })),
  );
  m.relogio.agora += 22_000;
  assert.equal(m.store.restanteDoTemporizador(1), -12_000);
  assert.equal(m.store.restanteDoTemporizador(2), 158_000);
  assert.equal(m.store.restanteDoTemporizador(3), 5_000);
});

test('temporizadores: retrato velho é descartado e os ouvintes recebem o novo', () => {
  const m = montar();
  const vistos = [];
  const parar = m.store.assinarTemporizadores((t) => vistos.push(t.seq));
  assert.equal(m.store.aplicarTemporizadores(temporizadores(3, temporizador(1))), true);
  assert.equal(m.store.aplicarTemporizadores(temporizadores(2, temporizador(1))), false);
  assert.equal(m.store.aplicarTemporizadores(temporizadores(3, temporizador(1))), true);
  parar();
  m.store.aplicarTemporizadores(temporizadores(4, temporizador(1)));
  assert.deepEqual(vistos, [3, 3]);
  assert.equal(m.store.aplicarTemporizadores({ seq: 9 }), false, 'sem a lista, ignora');
});

test('temporizadores: comando aplica a resposta; recusado, ressincroniza e rejeita', async () => {
  const m = montar();
  const ipc = {
    obterEstado: async () => (m.chamadas.push('get_state'), { focus: retrato(0, 'idle'), speed: 1, timers: temporizadores(7, temporizador(1)) }),
    ouvir: async () => () => {},
    temporizadores: {
      iniciar: async (id) => temporizadores(5, temporizador(id, { status: 'running' })),
      pausar: async () => {
        throw { code: 'notRunning', message: 'x' };
      },
    },
  };
  const s = criarStore({ ipc, eventos: EVENTOS, agora: () => m.relogio.agora });
  await s.comandoDoTemporizador('iniciar', 1);
  assert.equal(s.temporizadores.timers[0].status, 'running');
  await assert.rejects(s.comandoDoTemporizador('pausar', 1), { code: 'notRunning' });
  await new Promise((r) => setTimeout(r));
  assert.equal(s.temporizadores.seq, 7);
});

// M34: o cronômetro.
const cronometro = (seq, { status = 'idle', inicio = null, acumulado = 0, decorrido = acumulado, at = T0, voltas = [] } = {}) => ({
  seq, at, status, startedAt: inicio, accumulatedMs: acumulado, elapsedMs: decorrido, laps: voltas,
});

test('cronômetro: o get_state traz o retrato, e o evento é ouvido quando existe', async () => {
  const ouvidos = {};
  const relogio = { agora: T0 };
  const ipc = {
    obterEstado: async () => ({ focus: retrato(0, 'idle'), speed: 1, stopwatch: cronometro(2, { status: 'paused', acumulado: 1_870 }) }),
    ouvir: async (ev, cb) => ((ouvidos[ev] = cb), () => {}),
  };
  const s = criarStore({ ipc, eventos: { ...EVENTOS, cronometro: 'tt://stopwatch' }, agora: () => relogio.agora });
  assert.equal(s.decorridoDoCronometro(), null);
  await s.ligar({ doc: alvo(), janela: alvo() });
  assert.ok('tt://stopwatch' in ouvidos);
  assert.equal(s.cronometro.seq, 2);
  relogio.agora += 60_000;
  assert.equal(s.decorridoDoCronometro(), 1_870, 'pausado não anda');
});

test('cronômetro: correndo, o decorrido sai do startedAt pelo relógio de parede, sem desviar', () => {
  const m = montar();
  // O retrato chega 40 ms depois do instante dele (a viagem do IPC).
  m.relogio.agora = T0 + 5_040;
  m.store.aplicarCronometro(cronometro(1, { status: 'running', inicio: T0, acumulado: 2_000, decorrido: 7_000, at: T0 + 5_000 }));
  assert.equal(m.store.decorridoDoCronometro(), 7_040, 'a viagem do IPC não atrasa o número');
  // Dez minutos depois, com a janela escondida no meio: nada se perde.
  m.relogio.agora = T0 + 5_000 + 600_000;
  assert.equal(m.store.decorridoDoCronometro(), 607_000);
});

test('cronômetro: nunca menos que o retrato, mesmo com o relógio do JS atrás', () => {
  const m = montar();
  m.relogio.agora = T0 - 1_000;
  m.store.aplicarCronometro(cronometro(1, { status: 'running', inicio: T0, decorrido: 500, at: T0 + 500 }));
  assert.equal(m.store.decorridoDoCronometro(), 500);
});

test('cronômetro: no relógio acelerado, estima pela velocidade a partir do retrato', async () => {
  const m = montar({ estado: { focus: retrato(0, 'idle'), speed: 10, stopwatch: cronometro(1, { status: 'running', inicio: T0, decorrido: 3_000 }) } });
  await m.store.sincronizar();
  m.relogio.agora += 1_000;
  assert.equal(m.store.decorridoDoCronometro(), 13_000);
});

test('cronômetro: retrato velho é descartado, e o comando recusado ressincroniza', async () => {
  const m = montar();
  const vistos = [];
  m.store.assinarCronometro((c) => vistos.push(c.seq));
  assert.equal(m.store.aplicarCronometro(cronometro(3)), true);
  assert.equal(m.store.aplicarCronometro(cronometro(2)), false);
  assert.equal(m.store.aplicarCronometro({ seq: 9 }), false, 'sem status, ignora');
  assert.deepEqual(vistos, [3]);

  const chamadas = [];
  const ipc = {
    obterEstado: async () => (chamadas.push('get_state'), { focus: retrato(0, 'idle'), speed: 1, stopwatch: cronometro(8) }),
    ouvir: async () => () => {},
    cronometro: {
      iniciar: async () => (chamadas.push('iniciar'), cronometro(5, { status: 'running', inicio: T0 })),
      volta: async () => {
        chamadas.push('volta');
        throw { code: 'notRunning', message: 'x' };
      },
    },
  };
  const s = criarStore({ ipc, eventos: EVENTOS, agora: () => T0 });
  await s.comandoDoCronometro('iniciar');
  assert.equal(s.cronometro.status, 'running');
  await assert.rejects(s.comandoDoCronometro('volta'), { code: 'notRunning' });
  await new Promise((r) => setTimeout(r));
  assert.deepEqual(chamadas, ['iniciar', 'volta', 'get_state']);
  assert.equal(s.cronometro.seq, 8);
});

// M38: as configurações.
const CONFIG = Object.freeze({ focusMinutes: 25, breakMinutes: 5, sounds: { focusEnd: true, breakEnd: true }, volume: 80 });

test('M38: o get_state traz as configurações; o tt://settings as troca, e o F e o B entram no preparo', async () => {
  const ouvidos = {};
  const store = criarStore({
    ipc: {
      obterEstado: async () => ({ focus: retrato(0, 'idle'), speed: 1, settings: CONFIG }),
      ouvir: async (ev, cb) => ((ouvidos[ev] = cb), () => {}),
    },
    eventos: { ...EVENTOS, configuracoes: 'tt://settings' },
  });
  const vistas = [];
  store.assinarConfiguracoes((c) => vistas.push(c.focusMinutes));
  assert.equal(store.configuracoes, null);
  await store.ligar({ doc: alvo(), janela: alvo() });
  assert.deepEqual(Object.keys(ouvidos).sort(), ['tt://settings', 'tt://state', 'tt://tick']);
  assert.deepEqual(store.configuracoes, CONFIG);
  assert.equal(store.preparo.focusMinutes, 25);
  ouvidos['tt://settings']({ ...CONFIG, focusMinutes: 50, breakMinutes: 10 });
  assert.deepEqual([store.preparo.focusMinutes, store.preparo.breakMinutes], [50, 10]);
  assert.ok(Object.isFrozen(store.preparo));
  assert.equal(store.preparo.stepMinutes, PREPARO_PADRAO.stepMinutes, 'a faixa do seletor não muda');
  assert.deepEqual(vistas, [25, 50]);
});

test('M38: gravarConfiguracoes aplica a resposta; recusado, rejeita e nada muda', async () => {
  const gravados = [];
  let recusar = false;
  const store = criarStore({
    ipc: {
      obterEstado: async () => ({ focus: retrato(0, 'idle'), speed: 1, settings: CONFIG }),
      ouvir: async () => () => {},
      configuracoes: {
        gravar: async (patch) => {
          gravados.push(patch);
          if (recusar) throw { code: 'invalidValue', message: 'x' };
          return { ...CONFIG, ...patch, sounds: { ...CONFIG.sounds, ...patch.sounds } };
        },
      },
    },
    eventos: EVENTOS,
  });
  await store.sincronizar();
  const vistas = [];
  store.assinarConfiguracoes((c) => vistas.push(c));
  const novas = await store.gravarConfiguracoes({ sounds: { focusEnd: false } });
  assert.equal(novas.sounds.focusEnd, false);
  assert.equal(store.configuracoes.sounds.focusEnd, false);
  assert.equal(vistas.length, 1);
  recusar = true;
  await assert.rejects(store.gravarConfiguracoes({ volume: 300 }), { code: 'invalidValue' });
  assert.equal(store.configuracoes.volume, 80);
  assert.equal(vistas.length, 1);
  assert.deepEqual(gravados, [{ sounds: { focusEnd: false } }, { volume: 300 }]);
});

test('M38: configurações inválidas são ignoradas, e F ou B fora do lugar não mexem no preparo', () => {
  const m = montar();
  for (const ruim of [null, 3, [], 'x']) assert.equal(m.store.aplicarConfiguracoes(ruim), false);
  assert.equal(m.store.configuracoes, null);
  m.store.aplicarConfiguracoes({ ...CONFIG, focusMinutes: 0 });
  assert.deepEqual(m.store.preparo, PREPARO_PADRAO);
});

test('M39: cada get_state entrega os recursos ao aoReceberRecursos, antes de avisar quem assina as configurações', async () => {
  const ordem = [];
  const recursos = { bandeja: true, sempreNaFrente: false, regiaoDeEntrada: true };
  const store = criarStore({
    ipc: { obterEstado: async () => ({ focus: retrato(0, 'idle'), speed: 1, settings: { focusMinutes: 25, breakMinutes: 5 }, recursos }) },
    eventos: EVENTOS,
    aoReceberRecursos: (r) => ordem.push(['recursos', r]),
  });
  store.assinarConfiguracoes(() => ordem.push(['configurações']));
  await store.sincronizar();
  await store.sincronizar();
  assert.deepEqual(ordem, [['recursos', recursos], ['configurações'], ['recursos', recursos], ['configurações']]);
  // Sem o aoReceberRecursos (os outros testes), nada quebra.
  await montar().store.sincronizar();
});
