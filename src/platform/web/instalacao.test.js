// Testes do instalacao.js (W18), no Node, com a janela de mentira.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarInstalacao } from './instalacao.js';

function janela() {
  const ouvintes = new Map();
  return {
    addEventListener: (tipo, f) => ouvintes.set(tipo, f),
    disparar: (tipo, e = {}) => ouvintes.get(tipo)?.(e),
  };
}

function convite(outcome = 'accepted') {
  const c = { prevenido: 0, pedidos: 0 };
  c.preventDefault = () => c.prevenido++;
  c.prompt = async () => {
    c.pedidos++;
  };
  c.userChoice = Promise.resolve({ outcome, platform: 'web' });
  return c;
}

test('sem o beforeinstallprompt, nada a instalar, e instalar() resolve com null', async () => {
  const inst = criarInstalacao({ janela: janela() });
  assert.equal(inst.disponivel(), false);
  assert.equal(await inst.instalar(), null);
});

test('o beforeinstallprompt é guardado (com preventDefault) e avisado a quem assinou', () => {
  const j = janela();
  const inst = criarInstalacao({ janela: j });
  const vistos = [];
  inst.assinar((d) => vistos.push(d));
  const c = convite();
  j.disparar('beforeinstallprompt', c);
  assert.equal(inst.disponivel(), true);
  assert.equal(c.prevenido, 1);
  assert.deepEqual(vistos, [true]);
});

test('instalar() chama o prompt uma vez, devolve a resposta e descarta o convite', async () => {
  const j = janela();
  const inst = criarInstalacao({ janela: j });
  const vistos = [];
  inst.assinar((d) => vistos.push(d));
  const c = convite('dismissed');
  j.disparar('beforeinstallprompt', c);
  assert.equal(await inst.instalar(), 'dismissed');
  assert.equal(c.pedidos, 1);
  assert.equal(inst.disponivel(), false);
  assert.equal(await inst.instalar(), null);
  assert.equal(c.pedidos, 1);
  assert.deepEqual(vistos, [true, false]);
});

test('o appinstalled descarta o convite; o cancelamento do assinar para os avisos', () => {
  const j = janela();
  const inst = criarInstalacao({ janela: j });
  const vistos = [];
  const cancelar = inst.assinar((d) => vistos.push(d));
  j.disparar('beforeinstallprompt', convite());
  j.disparar('appinstalled');
  assert.equal(inst.disponivel(), false);
  cancelar();
  j.disparar('beforeinstallprompt', convite());
  assert.deepEqual(vistos, [true, false]);
});

test('um prompt que falha não lança: resolve com null e descarta o convite', async () => {
  const j = janela();
  const inst = criarInstalacao({ janela: j });
  const c = convite();
  c.prompt = async () => {
    throw new Error('NotAllowedError');
  };
  j.disparar('beforeinstallprompt', c);
  const avisos = [];
  const original = console.warn;
  console.warn = (...a) => avisos.push(a);
  try {
    assert.equal(await inst.instalar(), null);
  } finally {
    console.warn = original;
  }
  assert.equal(inst.disponivel(), false);
  assert.equal(avisos.length, 1);
});
