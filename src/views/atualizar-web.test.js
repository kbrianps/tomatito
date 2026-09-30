// Testes do cartão Atualizar da web (W16), sem DOM: os dois textos, o botão
// e a seção que não aparece no desktop.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ligarAtualizarWeb, marcacao, marcacaoDoCartao } from './atualizar-web.js';
import t from '../lib/i18n/pt-BR.js';

const a = t.configuracoes.atualizar;

test('com nada correndo: "a página recarrega" e o botão habilitado', () => {
  const html = marcacaoDoCartao(true);
  assert.match(html, new RegExp(a.pronta.replace('.', '\\.')));
  assert.match(html, /<button type="button" class="tt-accent" data-atualizar aria-describedby="config-atualizar config-atualizar-desc">Atualizar<\/button>/);
});

test('com algo correndo: pede para encerrar, e o botão desabilitado', () => {
  const html = marcacaoDoCartao(false);
  assert.match(html, /encerre a sessão e os temporizadores/);
  assert.match(html, /data-atualizar [^>]* disabled>Atualizar<\/button>/);
});

test('a seção: "Atualização", com o cartão "Nova versão disponível"', () => {
  const html = marcacao(true);
  assert.match(html, /^<section class="tt-config-secao" aria-labelledby="config-atualizacao-web" data-secao="atualizacao"><h2 id="config-atualizacao-web" class="tt-t-body-strong">Atualização<\/h2>/);
  assert.match(html, /data-cartao="atualizar" data-pode-aplicar="true"/);
  assert.match(html, /Nova versão disponível/);
  assert.doesNotMatch(html + marcacao(false), new RegExp(['pomo', 'doro'].join(''), 'i'));
});

test('ligarAtualizarWeb: no desktop (casca.web falso ou sem atualizacaoDaCasca) não põe nada na página', async () => {
  let mexeu = false;
  const pagina = {
    querySelector: () => null,
    insertAdjacentHTML: () => {
      mexeu = true;
    },
  };
  const pronta = { estado: () => 'pronta', podeAplicar: () => true, assinar: () => () => {} };
  const d1 = ligarAtualizarWeb(pagina, { plataforma: async () => ({ casca: { web: false }, atualizacaoDaCasca: pronta }) });
  const d2 = ligarAtualizarWeb(pagina, { plataforma: async () => ({ casca: { web: true }, atualizacaoDaCasca: null }) });
  // Na web, sem versão nova: também nada.
  const d3 = ligarAtualizarWeb(pagina, {
    plataforma: async () => ({ casca: { web: true }, atualizacaoDaCasca: { ...pronta, estado: () => 'nenhuma' } }),
  });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(mexeu, false);
  d1();
  d2();
  d3();
});
