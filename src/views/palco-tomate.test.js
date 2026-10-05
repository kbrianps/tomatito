import assert from 'node:assert/strict';
import test from 'node:test';
import { LADO_DO_MINI, marcacao, recursosDoPalco } from './palco-tomate.js';

test('marcação: o desenho e a barra só com o que o navegador oferece', () => {
  const tudo = marcacao('<div class="stage"></div>', { telaCheia: true, mini: true });
  assert.match(tudo, /^<div class="tt-palco-tomate"><div class="stage"><\/div><\/div><div class="tt-palco-barra">/);
  assert.deepEqual([...tudo.matchAll(/data-palco="([\w-]+)"/g)].map((m) => m[1]), ['tela-cheia', 'mini', 'voltar']);
  assert.match(tudo, /<button type="button" data-palco="tela-cheia" aria-pressed="false">Tela cheia<\/button>/);
  assert.match(tudo, />Mini tomate<\/button>/);
  const minimo = marcacao('<div class="stage"></div>');
  assert.deepEqual([...minimo.matchAll(/data-palco="([\w-]+)"/g)].map((m) => m[1]), ['voltar']);
  assert.match(minimo, />Voltar ao modo normal<\/button>/);
  assert.equal(LADO_DO_MINI, 300);
});

test('recursosDoPalco: tela cheia, mini tomate e tela acesa pelo que a janela tem', () => {
  assert.deepEqual(recursosDoPalco({}), { telaCheia: false, mini: false, telaAcesa: false });
  const janela = {
    document: { fullscreenEnabled: true, documentElement: { requestFullscreen() {} } },
    documentPictureInPicture: {},
    navigator: { wakeLock: { request() {} } },
  };
  assert.deepEqual(recursosDoPalco(janela), { telaCheia: true, mini: true, telaAcesa: true });
  // iPhone: sem a Fullscreen API em elementos.
  assert.equal(recursosDoPalco({ document: { fullscreenEnabled: false, documentElement: {} } }).telaCheia, false);
});
