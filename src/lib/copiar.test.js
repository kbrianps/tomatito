// Testes do copiarTexto (M35) sem DOM: a API assíncrona primeiro, o
// execCommand quando ela falta ou recusa, e nunca uma rejeição.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copiarTexto } from './copiar.js';

function docFalso({ aceita = true, lanca = false } = {}) {
  const doc = {
    copiado: null,
    focados: 0,
    anexados: [],
    activeElement: { focus: () => doc.focados++ },
    body: { append: (el) => doc.anexados.push(el) },
    createElement: () => {
      const el = { value: '', style: {}, attrs: {}, selecionado: false, removido: false,
        setAttribute: (k, v) => (el.attrs[k] = v), select: () => (el.selecionado = true), remove: () => (el.removido = true) };
      return el;
    },
    execCommand: (cmd) => {
      if (lanca) throw new Error('não');
      const el = doc.anexados.at(-1);
      if (cmd === 'copy' && el.selecionado && aceita) doc.copiado = el.value;
      return aceita;
    },
  };
  return doc;
}

test('usa o navigator.clipboard quando existe', async () => {
  let escrito = null;
  const nav = { clipboard: { writeText: async (t) => void (escrito = t) } };
  const doc = docFalso();
  assert.equal(await copiarTexto('a\tb', { nav, doc }), true);
  assert.equal(escrito, 'a\tb');
  assert.equal(doc.anexados.length, 0, 'sem a via antiga');
});

test('API recusada: cai no execCommand com um textarea que some depois', async () => {
  const nav = { clipboard: { writeText: async () => { throw new Error('NotAllowedError'); } } };
  const doc = docFalso();
  assert.equal(await copiarTexto('1\t00:00:02,34', { nav, doc }), true);
  assert.equal(doc.copiado, '1\t00:00:02,34');
  assert.equal(doc.anexados[0].removido, true);
  assert.equal(doc.focados, 1, 'o foco volta para onde estava');
});

test('sem API: execCommand; recusado ou com erro, resolve false', async () => {
  assert.equal(await copiarTexto('x', { nav: {}, doc: docFalso() }), true);
  assert.equal(await copiarTexto('x', { nav: {}, doc: docFalso({ aceita: false }) }), false);
  assert.equal(await copiarTexto('x', { nav: {}, doc: docFalso({ lanca: true }) }), false);
  assert.equal(await copiarTexto('x', { nav: undefined, doc: undefined }), false);
});
