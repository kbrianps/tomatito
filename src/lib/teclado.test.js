import assert from 'node:assert/strict';
import test from 'node:test';
import { ligarTeclado, tecladoAberto } from './teclado.js';

test('W37: o teclado conta como aberto abaixo de 75% da altura da tela', () => {
  assert.equal(tecladoAberto(544, 844), true);
  assert.equal(tecladoAberto(700, 844), false);
  assert.equal(tecladoAberto(0, 0), false);
});

function ambiente() {
  const ouvintes = { vv: {}, doc: {} };
  const atributos = new Set();
  const campo = { matches: () => true, scrollIntoView: () => (campo.trazido = true), trazido: false };
  const doc = {
    activeElement: null,
    documentElement: {
      hasAttribute: (a) => atributos.has(a),
      setAttribute: (a) => atributos.add(a),
      removeAttribute: (a) => atributos.delete(a),
    },
    addEventListener: (e, f) => (ouvintes.doc[e] = f),
    removeEventListener: () => {},
  };
  const vv = { width: 390, height: 844, addEventListener: (e, f) => (ouvintes.vv[e] = f), removeEventListener: () => {} };
  const win = { visualViewport: vv, requestAnimationFrame: (f) => f(), setTimeout: (f) => f() };
  return { win, doc, vv, campo, atributos, ouvintes };
}

test('W37: data-teclado liga com campo focado e viewport encolhida, e desliga ao fechar', () => {
  const a = ambiente();
  ligarTeclado({ win: a.win, doc: a.doc });
  assert.equal(a.atributos.has('data-teclado'), false);

  // Viewport encolhida sem campo focado (ex.: barra do navegador): não liga.
  a.vv.height = 544;
  a.ouvintes.vv.resize();
  assert.equal(a.atributos.has('data-teclado'), false);
  a.vv.height = 844;
  a.ouvintes.vv.resize();

  a.doc.activeElement = a.campo;
  a.ouvintes.doc.focusin();
  assert.equal(a.atributos.has('data-teclado'), false, 'campo focado, teclado ainda fechado');
  a.vv.height = 544;
  a.ouvintes.vv.resize();
  assert.equal(a.atributos.has('data-teclado'), true);
  assert.equal(a.campo.trazido, true, 'o campo é trazido para a vista');

  a.vv.height = 844;
  a.ouvintes.vv.resize();
  assert.equal(a.atributos.has('data-teclado'), false);
});

test('W37: ao girar o aparelho, a altura de referência recomeça', () => {
  const a = ambiente();
  ligarTeclado({ win: a.win, doc: a.doc });
  a.vv.width = 844;
  a.vv.height = 390;
  a.ouvintes.vv.resize();
  a.doc.activeElement = a.campo;
  a.ouvintes.doc.focusin();
  assert.equal(a.atributos.has('data-teclado'), false, 'deitado, sem teclado: 390 é a tela cheia');
});
