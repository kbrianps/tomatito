import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ESPERA_DO_RESUME_MS, SEGURAR_S, SUSPENDER_DEPOIS_MS, criarSom, ganho, historico } from './som.js';

/** Um AudioContext de mentira: anota o que o som.js faz com ele. */
class ContextoFalso {
  constructor({ resumeFunciona = true } = {}) {
    this.state = 'suspended';
    this.currentTime = 10;
    this.resumeFunciona = resumeFunciona;
    this.resumes = 0;
    this.suspends = 0;
    this.inicios = [];
    this.ganhos = [];
    this.destination = { destino: true };
  }
  resume() {
    this.resumes++;
    if (!this.resumeFunciona) return new Promise(() => {}); // o Chrome sem ativação: pendente
    this.state = 'running';
    return Promise.resolve();
  }
  suspend() {
    this.suspends++;
    this.state = 'suspended';
    return Promise.resolve();
  }
  createGain() {
    const g = { gain: { value: 1 }, connect: () => {} };
    return g;
  }
  createBufferSource() {
    const ctx = this;
    const fonte = {
      buffer: null,
      destino: null,
      connect(g) {
        fonte.destino = g;
      },
      start(quando) {
        ctx.inicios.push({ som: fonte.buffer.nome, quando });
        ctx.ganhos.push(fonte.destino.gain.value);
      },
    };
    return fonte;
  }
}

/** Temporizadores manuais: `rodar(ms)` dispara o que vence em até ms. */
function relogio() {
  let agora = 0;
  let id = 0;
  const fila = new Map();
  return {
    agendar: (f, ms) => (fila.set(++id, { f, em: agora + ms }), id),
    cancelar: (t) => fila.delete(t),
    pendentes: () => fila.size,
    rodar(ms) {
      agora += ms;
      for (const [k, v] of [...fila].sort((a, b) => a[1].em - b[1].em)) {
        if (v.em <= agora) {
          fila.delete(k);
          v.f();
        }
      }
    },
  };
}

const esvaziar = () => new Promise((r) => setImmediate(r));

function montar({ correndo = false, volume = 80, resumeFunciona = true } = {}) {
  const estado = { correndo, volume, contextos: [] };
  const r = relogio();
  const som = criarSom({
    urls: { focusEnd: '/f.wav', breakEnd: '/b.wav' },
    novoContexto: () => {
      const c = new ContextoFalso({ resumeFunciona });
      estado.contextos.push(c);
      return c;
    },
    decodificar: async (url) => ({ nome: url === '/f.wav' ? 'focusEnd' : 'breakEnd', duration: 1 }),
    correndo: () => estado.correndo,
    volume: () => estado.volume,
    agendar: r.agendar,
    cancelar: r.cancelar,
  });
  return { som, estado, r, ctx: () => estado.contextos[0] };
}

test('ganho: linear de 0 a 100, como o Pedido::ganho do audio.rs', () => {
  assert.equal(ganho(0), 0);
  assert.equal(ganho(35), 0.35);
  assert.equal(ganho(100), 1);
  assert.equal(ganho(250), 1);
  assert.equal(ganho(-3), 0);
});

test('sem gesto, nenhum AudioContext; o despertar cria e retoma', async () => {
  const { som, ctx } = montar({ correndo: true });
  assert.equal(som.contexto(), null);
  som.despertar();
  assert.equal(ctx().resumes, 1);
  assert.equal(ctx().state, 'running');
  som.despertar();
  assert.equal(ctx().resumes, 1, 'já running: sem outro resume');
});

test('fim de fase toca uma vez, com o volume das configurações', async () => {
  const { som, estado, ctx } = montar({ correndo: true, volume: 35 });
  som.despertar();
  assert.equal(await som.tocar('focusEnd'), true);
  assert.deepEqual(ctx().inicios.map((i) => i.som), ['focusEnd']);
  assert.deepEqual(ctx().ganhos, [0.35]);
  estado.volume = 0;
  await som.tocar('breakEnd');
  assert.deepEqual(ctx().ganhos, [0.35, 0]);
  assert.equal(historico.at(-1).som, 'breakEnd');
  assert.equal(historico.at(-1).tocou, true);
});

test('dois sons seguidos: o segundo começa 1,5 s depois do primeiro (a fila do audio.rs)', async () => {
  const { som, ctx } = montar({ correndo: true });
  som.testar();
  await esvaziar();
  await esvaziar();
  const [a, b] = ctx().inicios;
  assert.deepEqual([a.som, b.som], ['focusEnd', 'breakEnd']);
  assert.equal(b.quando - a.quando, SEGURAR_S);
});

test('testar rejeita um som desconhecido com invalidArgs', () => {
  const { som } = montar();
  assert.throws(() => som.testar('outro'), { code: 'invalidArgs' });
});

test('parado por 30 s: suspend uma vez; algo correndo cancela', async () => {
  const { som, estado, r, ctx } = montar({ correndo: true });
  som.despertar();
  estado.correndo = false;
  som.revisar();
  som.revisar(); // um agendamento só
  assert.equal(r.pendentes(), 1);
  r.rodar(SUSPENDER_DEPOIS_MS - 1);
  assert.equal(ctx().suspends, 0);
  r.rodar(1);
  assert.equal(ctx().suspends, 1);
  assert.equal(ctx().state, 'suspended');

  // Retomar (gesto) leva a running e cancela uma suspensão pendente.
  estado.correndo = true;
  som.despertar();
  assert.equal(ctx().state, 'running');
  estado.correndo = false;
  som.revisar();
  estado.correndo = true;
  som.revisar();
  r.rodar(SUSPENDER_DEPOIS_MS * 2);
  assert.equal(ctx().suspends, 1);
});

test('fim de fase com o contexto suspenso: tenta o resume e toca', async () => {
  const { som, estado, r, ctx } = montar({ correndo: true });
  som.despertar();
  estado.correndo = false;
  som.revisar();
  r.rodar(SUSPENDER_DEPOIS_MS);
  assert.equal(ctx().state, 'suspended');
  assert.equal(await som.tocar('focusEnd'), true);
  assert.equal(ctx().resumes, 2);
  assert.equal(ctx().inicios.length, 1);
});

test('sem ativação (o resume fica pendente): não toca, e o histórico diz por quê', async () => {
  const { som, r, ctx } = montar({ correndo: true, resumeFunciona: false });
  const tocou = som.tocar('focusEnd');
  await esvaziar();
  r.rodar(ESPERA_DO_RESUME_MS);
  assert.equal(await tocou, false);
  assert.equal(ctx().inicios.length, 0);
  assert.equal(historico.at(-1).tocou, false);
  assert.match(historico.at(-1).motivo, /suspended/);
});

test('um WAV que não carrega vira log, e o outro toca', async () => {
  const contextos = [];
  const som = criarSom({
    urls: { focusEnd: '/f.wav', breakEnd: '/b.wav' },
    novoContexto: () => (contextos.push(new ContextoFalso()), contextos.at(-1)),
    decodificar: async (url) => {
      if (url === '/f.wav') throw new Error('404');
      return { nome: 'breakEnd', duration: 1 };
    },
    correndo: () => true,
    volume: () => 80,
  });
  const erro = console.error;
  console.error = () => {};
  try {
    som.despertar();
    assert.equal(await som.tocar('focusEnd'), false);
    assert.equal(await som.tocar('breakEnd'), true);
  } finally {
    console.error = erro;
  }
  assert.deepEqual(contextos[0].inicios.map((i) => i.som), ['breakEnd']);
});
