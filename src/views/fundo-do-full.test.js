import assert from 'node:assert/strict';
import test from 'node:test';
import t from '../lib/i18n/pt-BR.js';
import { deveMostrar, ligarFundoDoFull, marcacao } from './fundo-do-full.js';

const f = t.configuracoes.fundoDoFull;

function secaoFalsa() {
  const filhos = [];
  const ouvintes = [];
  const botao = { disabled: false, removido: false, remove() { this.removido = true; }, closest: (s) => (s === '[data-fundo-transparente]' ? botao : null) };
  const texto = { textContent: f.descricao };
  const cartao = {
    addEventListener: (_n, fn) => ouvintes.push(fn),
    removeEventListener: () => {},
    querySelector: (s) => (s === '[data-fundo-texto]' ? texto : null),
  };
  return {
    filhos, botao, texto, ouvintes,
    insertAdjacentHTML: (_onde, html) => filhos.push(html),
    querySelector: (s) => (s === '[data-cartao="fundo-do-full"]' && filhos.length ? cartao : null),
  };
}

function storeFalso(configuracoes) {
  const assinantes = [];
  return {
    configuracoes,
    gravados: [],
    assinantes,
    async gravarConfiguracoes(patch) {
      this.gravados.push(patch);
    },
    assinarConfiguracoes: (fn) => {
      assinantes.push(fn);
      return () => {};
    },
  };
}

test('fundo do Full: só aparece com o modo opaco gravado', () => {
  assert.equal(deveMostrar({ fullMode: 'opaque' }), true);
  assert.equal(deveMostrar({ fullMode: 'auto' }), false);
  assert.equal(deveMostrar(null), false);
  assert.match(marcacao(), /data-cartao="fundo-do-full"/);
  assert.match(marcacao(), new RegExp(`<button type="button" data-fundo-transparente[^>]*>${f.botao}</button>`));
  const secao = secaoFalsa();
  ligarFundoDoFull(secao, { store: storeFalso({ fullMode: 'auto' }) });
  assert.equal(secao.filhos.length, 0);
});

test('fundo do Full: o botão volta ao transparente e apaga a validação, para a próxima entrada perguntar de novo', async () => {
  const secao = secaoFalsa();
  const store = storeFalso({ fullMode: 'opaque' });
  ligarFundoDoFull(secao, { store });
  assert.equal(secao.filhos.length, 1);
  await secao.ouvintes[0]({ target: secao.botao });
  assert.deepEqual(store.gravados, [{ fullMode: 'auto', fullValidated: '' }]);
  assert.equal(secao.texto.textContent, f.feito);
  assert.equal(secao.botao.removido, true);
  store.assinantes[0]({ fullMode: 'opaque' });
  assert.equal(secao.filhos.length, 1, 'não duplica o cartão');
});

test('fundo do Full: o cartão aparece quando o modo opaco é escolhido com a tela aberta', () => {
  const secao = secaoFalsa();
  const store = storeFalso({ fullMode: 'auto' });
  ligarFundoDoFull(secao, { store });
  store.assinantes[0]({ fullMode: 'opaque' });
  assert.equal(secao.filhos.length, 1);
});
