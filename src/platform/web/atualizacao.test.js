// Testes do atualizacao.js (W16), no Node, com o service worker de mentira.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarAtualizacao } from './atualizacao.js';

class Alvo {
  #ouvintes = new Map();
  addEventListener(tipo, fn) {
    if (!this.#ouvintes.has(tipo)) this.#ouvintes.set(tipo, new Set());
    this.#ouvintes.get(tipo).add(fn);
  }
  disparar(tipo) {
    for (const fn of this.#ouvintes.get(tipo) ?? []) fn();
  }
}

class SW extends Alvo {
  constructor(state) {
    super();
    this.state = state;
    this.mensagens = [];
  }
  postMessage(m) {
    this.mensagens.push(m);
  }
  mudar(state) {
    this.state = state;
    this.disparar('statechange');
  }
}

function cenario({ controlada = true, correndo = false, esperando = null } = {}) {
  const servico = new Alvo();
  servico.controller = controlada ? new SW('activated') : null;
  const reg = new Alvo();
  reg.waiting = esperando;
  reg.installing = null;
  const estado = { correndo, recargas: 0, avisos: 0 };
  const at = criarAtualizacao({ servico, correndo: () => estado.correndo, recarregar: () => estado.recargas++ });
  at.assinar(() => estado.avisos++);
  /** Um SW novo chega: instala e fica em `waiting`. */
  const chegar = () => {
    const novo = new SW('installing');
    reg.installing = novo;
    reg.disparar('updatefound');
    reg.installing = null;
    reg.waiting = novo;
    novo.mudar('installed');
    return novo;
  };
  return { servico, reg, estado, at, chegar };
}

test('nada correndo: o SW novo recebe SKIP_WAITING na hora e a página recarrega uma vez quando ele assume', () => {
  const c = cenario();
  c.at.acompanhar(c.reg);
  const novo = c.chegar();
  assert.deepEqual(novo.mensagens, [{ type: 'SKIP_WAITING' }]);
  c.servico.disparar('controllerchange');
  c.servico.disparar('controllerchange');
  assert.equal(c.estado.recargas, 1);
});

test('com algo correndo: fica pronta, sem mensagem e sem recarga; o botão só aplica com nada correndo', () => {
  const c = cenario({ correndo: true });
  c.at.acompanhar(c.reg);
  const novo = c.chegar();
  assert.equal(c.at.estado(), 'pronta');
  assert.equal(c.at.podeAplicar(), false);
  assert.deepEqual(novo.mensagens, []);
  assert.ok(c.estado.avisos >= 1);
  // O botão com a fase correndo: recusa.
  assert.equal(c.at.aplicar(), false);
  assert.deepEqual(novo.mensagens, []);
  // A fase parou: nada acontece sozinho (o cartão continua), o botão aplica.
  c.estado.correndo = false;
  c.at.revisar();
  assert.deepEqual(novo.mensagens, []);
  assert.equal(c.at.podeAplicar(), true);
  assert.equal(c.at.aplicar(), true);
  assert.deepEqual(novo.mensagens, [{ type: 'SKIP_WAITING' }]);
  c.servico.disparar('controllerchange');
  assert.equal(c.estado.recargas, 1);
});

test('um SW já em waiting na carga: aplicado com nada correndo, pronto com algo correndo', () => {
  const parado = cenario({ esperando: new SW('installed') });
  parado.at.acompanhar(parado.reg);
  assert.deepEqual(parado.reg.waiting.mensagens, [{ type: 'SKIP_WAITING' }]);

  const correndo = cenario({ esperando: new SW('installed'), correndo: true });
  correndo.at.acompanhar(correndo.reg);
  assert.deepEqual(correndo.reg.waiting.mensagens, []);
  assert.equal(correndo.at.estado(), 'pronta');
});

test('primeira instalação (nenhum SW controlando): não é atualização, e um controllerchange não recarrega', () => {
  const c = cenario({ controlada: false });
  c.at.acompanhar(c.reg);
  const novo = new SW('installing');
  c.reg.installing = novo;
  c.reg.disparar('updatefound');
  novo.mudar('installed');
  assert.deepEqual(novo.mensagens, []);
  c.servico.disparar('controllerchange');
  assert.equal(c.estado.recargas, 0);
  assert.equal(c.at.estado(), 'nenhuma');
});
