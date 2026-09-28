// Testes dos bloqueios do app de produção (M37, PLANO.md, 3.8).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ligarBloqueiosDeProducao, ligarRecargaDoDev, menuPermitido, teclaDeRecarga } from './producao.js';

const tecla = (code, key, mods = {}) => ({ code, key, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...mods });
const elemento = (seletorQueCasa) => ({ closest: (s) => (seletorQueCasa && s.split(',').map((x) => x.trim()).includes(seletorQueCasa) ? {} : null) });

test('F5 e Ctrl+R (e as variantes do Chromium) são recarga', () => {
  assert.equal(teclaDeRecarga(tecla('F5', 'F5')), true);
  assert.equal(teclaDeRecarga(tecla('F5', 'F5', { shiftKey: true })), true);
  assert.equal(teclaDeRecarga(tecla('F5', 'F5', { ctrlKey: true })), true);
  assert.equal(teclaDeRecarga(tecla('KeyR', 'r', { ctrlKey: true })), true);
  assert.equal(teclaDeRecarga(tecla('KeyR', 'R', { ctrlKey: true, shiftKey: true })), true);
  assert.equal(teclaDeRecarga(tecla('', 'BrowserRefresh')), true);
  assert.equal(teclaDeRecarga(tecla('KeyR', 'к', { ctrlKey: true })), true, 'cirílico: vale a posição');
});

test('o resto não é recarga', () => {
  assert.equal(teclaDeRecarga(tecla('KeyR', 'r')), false, 'R sozinho (digitar)');
  assert.equal(teclaDeRecarga(tecla('KeyR', 'r', { ctrlKey: true, altKey: true })), false);
  assert.equal(teclaDeRecarga(tecla('KeyP', 'r', { ctrlKey: true })) , true, 'Dvorak: o R pelo caractere');
  assert.equal(teclaDeRecarga(tecla('KeyR', 'p', { ctrlKey: true })), false, 'Dvorak: a tecla do R dá P');
  assert.equal(teclaDeRecarga(tecla('F6', 'F6')), false);
  assert.equal(teclaDeRecarga(tecla('Digit1', '1', { ctrlKey: true })), false);
});

test('o menu do WebView só nos campos de texto', () => {
  assert.equal(menuPermitido(elemento('input')), true);
  assert.equal(menuPermitido(elemento('textarea')), true);
  assert.equal(menuPermitido(elemento(null)), false);
  assert.equal(menuPermitido(null), false);
  assert.equal(menuPermitido({}), false);
});

test('ligarBloqueiosDeProducao cancela o menu fora dos campos e a recarga, e desliga', () => {
  const alvo = new EventTarget();
  const desligar = ligarBloqueiosDeProducao(alvo);
  const menu = (target) => {
    const e = new Event('contextmenu', { cancelable: true });
    Object.defineProperty(e, 'target', { value: target });
    alvo.dispatchEvent(e);
    return e.defaultPrevented;
  };
  const teclar = (ev) => {
    const e = Object.assign(new Event('keydown', { cancelable: true }), ev);
    alvo.dispatchEvent(e);
    return e.defaultPrevented;
  };
  assert.equal(menu(elemento(null)), true);
  assert.equal(menu(elemento('input')), false);
  assert.equal(menu(elemento('textarea')), false);
  assert.equal(teclar(tecla('F5', 'F5')), true);
  assert.equal(teclar(tecla('KeyR', 'r', { ctrlKey: true })), true);
  assert.equal(teclar(tecla('KeyA', 'a', { ctrlKey: true })), false, 'Ctrl+A continua selecionando');
  desligar();
  assert.equal(menu(elemento(null)), false);
  assert.equal(teclar(tecla('F5', 'F5')), false);
});

test('no dev, F5 e Ctrl+R recarregam (o WebKitGTK não tem esses atalhos), uma vez por tecla', () => {
  const alvo = new EventTarget();
  let recargas = 0;
  const desligar = ligarRecargaDoDev(alvo, () => recargas++);
  const teclar = (ev) => {
    const e = Object.assign(new Event('keydown', { cancelable: true }), ev);
    alvo.dispatchEvent(e);
    return e.defaultPrevented;
  };
  assert.equal(teclar(tecla('F5', 'F5')), true);
  assert.equal(teclar(tecla('KeyR', 'r', { ctrlKey: true })), true);
  assert.equal(recargas, 2);
  assert.equal(teclar(tecla('KeyR', 'r')), false, 'R sozinho não recarrega');
  assert.equal(teclar(tecla('F5', 'F5', { repeat: true })), false, 'tecla segurada não recarrega de novo');
  assert.equal(recargas, 2);
  desligar();
  assert.equal(teclar(tecla('F5', 'F5')), false);
  assert.equal(recargas, 2);
});
