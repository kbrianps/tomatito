import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decidir, JANELA_MS, MARCA, TEXTOS } from './panico.js';

test('sem marca, o pânico recarrega a página', () => {
  assert.equal(decidir(null, 1_000_000), 'recarregar');
  assert.equal(decidir(undefined, 1_000_000), 'recarregar');
  assert.equal(decidir('', 1_000_000), 'recarregar');
  assert.equal(decidir('lixo', 1_000_000), 'recarregar');
});

test('um pânico até 10 s depois da recarga mostra o aviso', () => {
  const t = 1_790_000_000_000;
  assert.equal(decidir(String(t), t), 'mostrar');
  assert.equal(decidir(String(t), t + 3_000), 'mostrar');
  assert.equal(decidir(String(t), t + JANELA_MS), 'mostrar');
});

test('passados os 10 s (ou com a marca no futuro), recarrega de novo', () => {
  const t = 1_790_000_000_000;
  assert.equal(decidir(String(t), t + JANELA_MS + 1), 'recarregar');
  assert.equal(decidir(String(t), t - 1), 'recarregar');
});

test('a marca é do Tomatito e o texto é o do plano', () => {
  assert.equal(JANELA_MS, 10_000);
  assert.match(MARCA, /^tomatito:/);
  assert.equal(TEXTOS.mensagem, 'O Tomatito encontrou um erro. Recarregue a página.');
  assert.equal(TEXTOS.recarregar, 'Recarregar');
});
