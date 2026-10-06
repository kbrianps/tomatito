import assert from 'node:assert/strict';
import test from 'node:test';
import { COMANDOS, ligarAcoesDoAndroid } from './acoes-android.js';

function ambiente(pedidos) {
  const chamadas = [];
  const ouvintes = {};
  const alvo = (nome) => ({
    visibilityState: 'visible',
    addEventListener: (ev, f) => (ouvintes[`${nome}:${ev}`] = f),
    removeEventListener: (ev) => delete ouvintes[`${nome}:${ev}`],
  });
  return {
    chamadas,
    ouvintes,
    doc: alvo('doc'),
    janela: alvo('janela'),
    api: {
      acaoPendente: async () => pedidos.shift() ?? { acao: null, voltar: false },
      paraOFundo: async () => chamadas.push('paraOFundo'),
    },
    store: {
      comando: async (c) => {
        chamadas.push(c);
        if (c === 'pular') throw { code: 'noSession' };
      },
    },
  };
}
const calado = async (f) => {
  const { warn } = console;
  console.warn = () => {};
  try {
    return await f();
  } finally {
    console.warn = warn;
  }
};

test('os comandos do store de cada botão', () => {
  assert.deepEqual(COMANDOS, { pausar: 'pausar', retomar: 'retomar', pular: 'pular', encerrar: 'parar' });
});

test('executa a ação guardada e volta ao segundo plano só se o app estava lá', async () => {
  const a = ambiente([{ acao: 'pausar', voltar: true }, { acao: 'encerrar', voltar: false }, { acao: 'outra', voltar: true }]);
  const l = ligarAcoesDoAndroid(a);
  assert.equal(await l.buscar(), 'pausar');
  assert.equal(await l.buscar(), 'encerrar');
  assert.equal(await l.buscar(), null);
  assert.equal(await l.buscar(), null);
  assert.deepEqual(a.chamadas, ['pausar', 'paraOFundo', 'parar']);
});

test('um comando recusado não impede a volta ao segundo plano', async () => {
  const a = ambiente([{ acao: 'pular', voltar: true }]);
  const l = ligarAcoesDoAndroid(a);
  assert.equal(await calado(() => l.buscar()), 'pular');
  assert.deepEqual(a.chamadas, ['pular', 'paraOFundo']);
});

test('busca de novo quando a página volta a ficar visível ou ganha o foco; desligar tira os ouvintes', async () => {
  const a = ambiente([{ acao: 'retomar', voltar: false }, { acao: 'pausar', voltar: false }]);
  const l = ligarAcoesDoAndroid(a);
  a.ouvintes['doc:visibilitychange']();
  await new Promise((r) => setTimeout(r, 0));
  a.doc.visibilityState = 'hidden';
  a.ouvintes['doc:visibilitychange']();
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(a.chamadas, ['retomar']);
  a.doc.visibilityState = 'visible';
  a.ouvintes['janela:focus']();
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(a.chamadas, ['retomar', 'pausar']);
  l.desligar();
  assert.deepEqual(Object.keys(a.ouvintes), []);
});
