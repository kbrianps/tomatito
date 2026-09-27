// Testes dos atalhos de navegação (M09, seção 3.8 do plano).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ligarAtalhosDeNavegacao, rotaDoAtalho } from './keys.js';

const tecla = (code, key, mods = {}) => ({ code, key, ctrlKey: true, altKey: false, shiftKey: false, metaKey: false, ...mods });

test('Ctrl+1/2/3 e Ctrl+, abrem Foco, Temporizador, Cronômetro e Configurações', () => {
  assert.equal(rotaDoAtalho(tecla('Digit1', '1')), 'foco');
  assert.equal(rotaDoAtalho(tecla('Digit2', '2')), 'temporizador');
  assert.equal(rotaDoAtalho(tecla('Digit3', '3')), 'cronometro');
  assert.equal(rotaDoAtalho(tecla('Comma', ',')), 'configuracoes');
});

test('dígitos pela posição (AZERTY e teclado numérico) e vírgula pelo caractere', () => {
  assert.equal(rotaDoAtalho(tecla('Digit1', '&')), 'foco', 'AZERTY: a tecla do 1 dá "&"');
  assert.equal(rotaDoAtalho(tecla('Numpad3', '3')), 'cronometro');
  assert.equal(rotaDoAtalho(tecla('KeyM', ',')), 'configuracoes', 'AZERTY: a vírgula fica na tecla do M');
});

test('sem Ctrl, com outro modificador ou outra tecla, não é atalho', () => {
  assert.equal(rotaDoAtalho(tecla('Digit1', '1', { ctrlKey: false })), null);
  assert.equal(rotaDoAtalho(tecla('Digit1', '!', { shiftKey: true })), null);
  assert.equal(rotaDoAtalho(tecla('Digit2', '2', { altKey: true })), null);
  assert.equal(rotaDoAtalho(tecla('Digit3', '3', { metaKey: true })), null);
  assert.equal(rotaDoAtalho(tecla('Digit4', '4')), null);
  assert.equal(rotaDoAtalho(tecla('Digit0', '0')), null, 'Ctrl+0 é do zoom');
  assert.equal(rotaDoAtalho(tecla('Equal', '=')), null, 'Ctrl+= é do zoom');
});

test('o ouvinte navega, cancela o padrão e respeita quem já cancelou', () => {
  let ouvinte;
  const alvo = { addEventListener: (_t, fn) => (ouvinte = fn), removeEventListener: () => (ouvinte = null) };
  const rotas = [];
  const desligar = ligarAtalhosDeNavegacao((r) => rotas.push(r), alvo);
  const evento = (e) => ({ defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...e });
  const e1 = evento(tecla('Digit2', '2'));
  ouvinte(e1);
  assert.deepEqual(rotas, ['temporizador']);
  assert.equal(e1.defaultPrevented, true);
  ouvinte(evento({ ...tecla('Digit3', '3'), defaultPrevented: true }));
  const e2 = evento(tecla('KeyA', 'a'));
  ouvinte(e2);
  assert.deepEqual(rotas, ['temporizador']);
  assert.equal(e2.defaultPrevented, false);
  desligar();
  assert.equal(ouvinte, null);
});
