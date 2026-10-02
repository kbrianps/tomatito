// Testes da seção Navegador da web (W18), sem DOM: os dois cartões, o
// Instalar só com o convite e a seção que não aparece no desktop.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ligarNavegadorWeb, marcacao, marcacaoDoInstalar, marcacaoDoTempo } from './navegador-web.js';
import t from '../lib/i18n/pt-BR.js';

const n = t.configuracoes.navegador;
const icone = (nome, g) => `<svg data-icone="${nome}" data-grade="${g}"></svg>`;

test('Tempo na aba: switch com o nome e a descrição do cartão, marcado quando ligado', () => {
  const ligado = marcacaoDoTempo(true, icone);
  assert.match(ligado, /<span id="config-tempo-aba" class="tt-config-titulo">Tempo na aba<\/span>/);
  assert.ok(ligado.includes(n.tempoNaAba.descricao));
  assert.match(ligado, /data-icone="clock" data-grade="20"/);
  assert.match(
    ligado,
    /<span class="tt-config-estado" data-estado aria-hidden="true">Ativado<\/span><fluent-switch data-tempo-aba aria-labelledby="config-tempo-aba" aria-describedby="config-tempo-aba-desc" checked><\/fluent-switch>/,
  );
  const desligado = marcacaoDoTempo(false, icone);
  assert.match(desligado, />Desativado<\/span><fluent-switch data-tempo-aba [^>]*"><\/fluent-switch>/);
});

test('Instalar o Tomatito: botão com o nome do cartão, sem citar atalhos', () => {
  const html = marcacaoDoInstalar(icone);
  assert.match(html, /<span id="config-instalar" class="tt-config-titulo">Instalar o Tomatito<\/span>/);
  assert.match(html, /<button type="button" data-instalar aria-labelledby="config-instalar" aria-describedby="config-instalar-desc">Instalar<\/button>/);
  assert.match(html, /data-icone="arrow_download" data-grade="20"/);
  assert.doesNotMatch(html, /Ctrl/);
});

test('a seção: "Navegador", com o Instalar só quando instalável', () => {
  const sem = marcacao({ ligado: true, instalavel: false });
  assert.match(sem, /^<section class="tt-config-secao" aria-labelledby="config-navegador-web" data-secao="navegador"><h2 id="config-navegador-web" class="tt-t-body-strong">Navegador<\/h2>/);
  assert.match(sem, /data-cartao="tempo-aba"/);
  assert.doesNotMatch(sem, /data-cartao="instalar"/);
  const com = marcacao({ ligado: true, instalavel: true });
  assert.deepEqual([...com.matchAll(/data-cartao="([\w-]+)"/g)].map((m) => m[1]), ['tempo-aba', 'instalar']);
  assert.doesNotMatch(sem + com, new RegExp(['pomo', 'doro'].join(''), 'i'));
});

test('ligarNavegadorWeb: no desktop (casca.web falso) não põe nada na página', async () => {
  let mexeu = false;
  const pagina = {
    querySelector: () => null,
    insertAdjacentHTML: () => {
      mexeu = true;
    },
  };
  const desligar = ligarNavegadorWeb(pagina, {
    plataforma: async () => ({ casca: { web: false }, abaDaCasca: null, instalacaoDaCasca: null }),
  });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(mexeu, false);
  desligar();
});

test('ligarNavegadorWeb: na web, entra antes da Atualização (ou do Sobre), com o estado da chave e do convite', async () => {
  const inseridos = [];
  const secao = { querySelector: () => null, addEventListener: () => {}, remove: () => inseridos.push('removida') };
  const atualizacao = {
    insertAdjacentHTML: (onde, html) => inseridos.push({ onde, html }),
    previousElementSibling: secao,
  };
  const pagina = { querySelector: (sel) => (sel === '[data-secao="atualizacao"]' ? atualizacao : null) };
  let assinado = null;
  const desligar = ligarNavegadorWeb(pagina, {
    plataforma: async () => ({
      casca: { web: true },
      abaDaCasca: { ligado: () => false, definir: () => {} },
      instalacaoDaCasca: { disponivel: () => true, instalar: async () => 'accepted', assinar: (f) => ((assinado = f), () => (assinado = null)) },
    }),
  });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(inseridos.length, 1);
  assert.equal(inseridos[0].onde, 'beforebegin');
  assert.match(inseridos[0].html, />Desativado<\/span><fluent-switch data-tempo-aba/);
  assert.match(inseridos[0].html, /data-cartao="instalar"/);
  assert.equal(typeof assinado, 'function');
  desligar();
  assert.equal(assinado, null);
  assert.equal(inseridos.at(-1), 'removida');
});
