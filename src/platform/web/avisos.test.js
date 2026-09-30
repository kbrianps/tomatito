// Testes do avisos.js (W13), no Node, com o navegador de mentira.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ATRASO_COM_HORA_MS,
  TAG_DA_FASE,
  TAG_DO_TEMPORIZADOR,
  criarAvisos,
  escolherTexto,
  historico,
  opcoesDoAviso,
  registrarServiceWorker,
  registroAtivo,
} from './avisos.js';

const PRAZO = 1_790_011_800_000;
const FIM_DO_FOCO = Object.freeze({
  kind: 'focusEnded',
  n: 1,
  blocks: 2,
  breakS: 300,
  nextFocusAt: PRAZO + 300_000,
  prazo: PRAZO,
  texto: { title: 'Período de foco concluído', body: 'Intervalo de 5 min. Próximo foco às 14:35.' },
  textoComAtraso: { title: 'Período de foco concluído às 14:30', body: 'Intervalo de 5 min. Próximo foco às 14:35.' },
});
const ATRASADO = Object.freeze({
  kind: 'late',
  ended: { kind: 'focus', n: 1, durationS: 1500 },
  endedAt: PRAZO,
  sessionCompleted: true,
  prazo: PRAZO,
  texto: { title: 'Sessão concluída às 14:30', body: null },
  textoComAtraso: null,
});
const FIM_DO_TEMPORIZADOR = Object.freeze({
  id: 3,
  name: 'Chá',
  durationMs: 240_000,
  endedAt: PRAZO,
  late: false,
  texto: { title: 'Temporizador encerrado', body: 'Chá · 4 min' },
  textoComAtraso: { title: 'Temporizador encerrado às 14:30', body: 'Chá · 4 min' },
});

function navegador({ permissao = 'granted', semRegistro = false, falha = null } = {}) {
  const mostrados = [];
  const reg = {
    async showNotification(titulo, opcoes) {
      if (falha) throw falha;
      mostrados.push({ titulo, opcoes });
    },
  };
  return {
    mostrados,
    deps: { permissao: () => permissao, registro: async () => (semRegistro ? null : reg) },
  };
}

// O console.info/warn do módulo não suja a saída do teste.
for (const nivel of ['info', 'warn']) console[nivel] = () => {};

test('o texto normal até 10 s depois do prazo; de 10 s em diante, com a hora do prazo', () => {
  assert.equal(escolherTexto(FIM_DO_FOCO, PRAZO), FIM_DO_FOCO.texto);
  assert.equal(escolherTexto(FIM_DO_FOCO, PRAZO + ATRASO_COM_HORA_MS - 1), FIM_DO_FOCO.texto);
  assert.equal(escolherTexto(FIM_DO_FOCO, PRAZO + ATRASO_COM_HORA_MS), FIM_DO_FOCO.textoComAtraso);
  assert.equal(escolherTexto(FIM_DO_FOCO, PRAZO + 30_000), FIM_DO_FOCO.textoComAtraso);
  // O atrasado (mais de 60 s) já tem a hora no texto.
  assert.equal(escolherTexto(ATRASADO, PRAZO + 120_000), ATRASADO.texto);
  // O temporizador mede pelo endedAt.
  assert.equal(escolherTexto(FIM_DO_TEMPORIZADOR, PRAZO + 1_000), FIM_DO_TEMPORIZADOR.texto);
  assert.equal(escolherTexto(FIM_DO_TEMPORIZADOR, PRAZO + 20_000), FIM_DO_TEMPORIZADOR.textoComAtraso);
  // Sem prazo, o texto normal.
  assert.equal(escolherTexto({ ...FIM_DO_FOCO, prazo: null }, PRAZO + 30_000), FIM_DO_FOCO.texto);
});

test('silent e renotify nunca juntos; sem corpo, sem body', () => {
  assert.deepEqual(opcoesDoAviso({ texto: FIM_DO_FOCO.texto, tag: TAG_DA_FASE, silent: true, timestamp: PRAZO }), {
    tag: TAG_DA_FASE,
    silent: true,
    renotify: false,
    lang: 'pt-BR',
    body: FIM_DO_FOCO.texto.body,
    timestamp: PRAZO,
  });
  const o = opcoesDoAviso({ texto: ATRASADO.texto, tag: TAG_DA_FASE, silent: false, timestamp: undefined });
  assert.equal(o.renotify, true);
  assert.ok(!('body' in o) && !('timestamp' in o));
});

test('fim de fase: tag da fase, silent quando o som tocou, o prazo como timestamp', async () => {
  const n = navegador();
  const avisos = criarAvisos({ ...n.deps, agora: () => PRAZO + 500 });
  assert.equal(await avisos.fase(FIM_DO_FOCO, Promise.resolve(true)), true);
  assert.deepEqual(n.mostrados, [
    {
      titulo: 'Período de foco concluído',
      opcoes: {
        tag: TAG_DA_FASE,
        silent: true,
        renotify: false,
        lang: 'pt-BR',
        body: 'Intervalo de 5 min. Próximo foco às 14:35.',
        timestamp: PRAZO,
      },
    },
  ]);
  // O som não tocou (contexto suspenso) ou não houve som: o aviso alerta.
  await avisos.fase(FIM_DO_FOCO, Promise.resolve(false));
  await avisos.fase(ATRASADO, null);
  assert.deepEqual(
    n.mostrados.slice(1).map((m) => [m.titulo, m.opcoes.silent, m.opcoes.renotify]),
    [
      ['Período de foco concluído', false, true],
      ['Sessão concluída às 14:30', false, true],
    ],
  );
  // Um som que falhou conta como não tocado.
  await avisos.fase(FIM_DO_FOCO, Promise.reject(new Error('x')));
  assert.equal(n.mostrados.at(-1).opcoes.silent, false);
});

test('fim de temporizador: tag do temporizador e a hora com 10 s ou mais de atraso', async () => {
  const n = navegador();
  const avisos = criarAvisos({ ...n.deps, agora: () => PRAZO + 15_000 });
  await avisos.temporizador(FIM_DO_TEMPORIZADOR, Promise.resolve(true));
  assert.equal(n.mostrados[0].titulo, 'Temporizador encerrado às 14:30');
  assert.equal(n.mostrados[0].opcoes.tag, TAG_DO_TEMPORIZADOR);
  assert.equal(n.mostrados[0].opcoes.body, 'Chá · 4 min');
});

test('sem permissão, sem service worker ou com erro: nada aparece, nada lança, fica o motivo', async () => {
  for (const permissao of ['denied', 'default', 'sem suporte']) {
    const n = navegador({ permissao });
    assert.equal(await criarAvisos(n.deps).fase(FIM_DO_FOCO), false);
    assert.deepEqual(n.mostrados, []);
    assert.equal(historico.at(-1).mostrado, false);
    assert.equal(historico.at(-1).motivo, `permissão: ${permissao}`);
  }
  const semSw = navegador({ semRegistro: true });
  assert.equal(await criarAvisos(semSw.deps).fase(FIM_DO_FOCO), false);
  assert.equal(historico.at(-1).motivo, 'sem service worker ativo');
  const quebrado = navegador({ falha: new TypeError('recusado') });
  assert.equal(await criarAvisos(quebrado.deps).temporizador(FIM_DO_TEMPORIZADOR), false);
  assert.equal(historico.at(-1).motivo, 'recusado');
  assert.equal(historico.at(-1).tipo, 'timerNotice');
});

test('o histórico guarda os dados, o título e o corpo, até 50', async () => {
  const n = navegador();
  const avisos = criarAvisos({ ...n.deps, agora: () => PRAZO });
  for (let i = 0; i < 60; i++) await avisos.fase(FIM_DO_FOCO);
  assert.equal(historico.length, 50);
  const ultimo = historico.at(-1);
  assert.equal(ultimo.dados, FIM_DO_FOCO);
  assert.equal(ultimo.titulo, 'Período de foco concluído');
  assert.equal(ultimo.corpo, FIM_DO_FOCO.texto.body);
  assert.equal(ultimo.mostrado, true);
});

test('registro do sw.js na raiz do site; sem suporte ou com erro, null', async () => {
  const pedidos = [];
  const nav = {
    serviceWorker: {
      register: async (url, opcoes) => {
        pedidos.push([url, opcoes]);
        return 'reg';
      },
    },
  };
  assert.equal(await registrarServiceWorker('/', nav), 'reg');
  assert.deepEqual(pedidos, [['/sw.js', { scope: '/' }]]);
  assert.equal(await registrarServiceWorker('/', {}), null);
  const ruim = { serviceWorker: { register: async () => Promise.reject(new Error('não')) } };
  assert.equal(await registrarServiceWorker('/', ruim), null);
});

test('o registro ativo espera o ready, até o limite', async () => {
  assert.equal(await registroAtivo(50, { serviceWorker: { ready: Promise.resolve('reg') } }), 'reg');
  assert.equal(await registroAtivo(20, { serviceWorker: { ready: new Promise(() => {}) } }), null);
  assert.equal(await registroAtivo(20, {}), null);
});
