// Testes da contagem provisória (M16) sem DOM: o relógio de quadros e os
// textos. O desenho na tela é conferido na prévia e no teste aninhado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acoesVisiveis, criarRelogio, marcacao, rotuloDaFase } from './contagem.js';

function quadros() {
  const fila = new Map();
  let id = 0;
  return {
    quadro: (f) => (fila.set(++id, f), id),
    cancelar: (i) => fila.delete(i),
    get pendentes() {
      return fila.size;
    },
    rodar() {
      const agora = [...fila.values()];
      fila.clear();
      agora.forEach((f) => f());
    },
  };
}

test('o DOM só é tocado quando o segundo mostrado muda', () => {
  const q = quadros();
  const store = { correndo: true, ms: 300_000, restanteMs() { return this.ms; } };
  const escritas = [];
  const r = criarRelogio({ store, escrever: (t) => escritas.push(t), ...q });
  r.atualizar();
  assert.deepEqual(escritas, ['05:00']);
  // 60 quadros por segundo durante 2 s.
  for (let i = 0; i < 120; i++) {
    store.ms -= 1000 / 60;
    q.rodar();
  }
  assert.deepEqual(escritas, ['05:00', '04:59', '04:58']);
  assert.equal(q.pendentes, 1);
});

test('parado, nenhum quadro é pedido; retomar volta a pedir', () => {
  const q = quadros();
  const store = { correndo: true, ms: 10_000, restanteMs() { return this.ms; } };
  const escritas = [];
  const r = criarRelogio({ store, escrever: (t) => escritas.push(t), ...q });
  r.atualizar();
  assert.equal(q.pendentes, 1);
  store.correndo = false;
  r.atualizar();
  assert.equal(q.pendentes, 0, 'pausado: o quadro pendente é cancelado');
  store.correndo = true;
  r.atualizar();
  r.atualizar();
  assert.equal(q.pendentes, 1, 'um quadro por vez');
  store.correndo = false;
  q.rodar();
  assert.equal(q.pendentes, 0, 'o passo não pede outro quadro quando parou');
  r.desligar();
  assert.deepEqual(escritas, ['00:10']);
});

test('sem sessão, 00:00', () => {
  const q = quadros();
  const escritas = [];
  criarRelogio({ store: { correndo: false, restanteMs: () => null }, escrever: (t) => escritas.push(t), ...q }).atualizar();
  assert.deepEqual(escritas, ['00:00']);
  assert.equal(q.pendentes, 0);
});

test('botões por estado', () => {
  // M17: iniciar é do preparo (card-session.js).
  assert.deepEqual(acoesVisiveis(null), []);
  assert.deepEqual(acoesVisiveis('idle'), []);
  assert.deepEqual(acoesVisiveis('completed'), []);
  assert.deepEqual(acoesVisiveis('focus'), ['pausar', 'pular', 'parar']);
  assert.deepEqual(acoesVisiveis('break'), ['pausar', 'pular', 'parar']);
  assert.deepEqual(acoesVisiveis('paused'), ['retomar', 'pular', 'parar']);
});

test('rótulo da fase', () => {
  const s = (kind, n) => ({ blocks: 2, intervals: 1, phase: { kind, n } });
  assert.equal(rotuloDaFase(null), 'Nenhuma sessão em andamento');
  assert.equal(rotuloDaFase({ status: 'idle', session: null }), 'Nenhuma sessão em andamento');
  assert.equal(rotuloDaFase({ status: 'focus', session: s('focus', 1) }), 'Período de foco 1 de 2');
  assert.equal(rotuloDaFase({ status: 'break', session: s('break', 1) }), 'Intervalo 1 de 1');
  assert.equal(rotuloDaFase({ status: 'paused', session: s('focus', 2) }), 'Pausado: Período de foco 2 de 2');
  assert.equal(rotuloDaFase({ status: 'completed', session: s('focus', 2) }), 'Sessão concluída');
});

test('marcação: tempo, fase e os botões escondidos até o primeiro retrato', () => {
  const html = marcacao();
  assert.match(html, /<p class="tt-contagem-tempo tt-num" data-tempo>00:00<\/p>/);
  const acoes = [...html.matchAll(/<button type="button" data-acao="(\w+)"[^>]* hidden>/g)].map((m) => m[1]);
  assert.deepEqual(acoes, ['pausar', 'retomar', 'pular', 'parar']);
  assert.doesNotMatch(html, /aria-live/, 'números que mudam a cada segundo ficam sem aria-live (3.8)');
});
