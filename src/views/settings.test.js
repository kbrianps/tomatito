// Testes da tela Configurações que não precisam de janela (M24: a seção
// Aparência). O desenho das prévias, o clique e as setas são conferidos no
// Chrome pelo scripts/preview/aparencia.mjs e no WebKitGTK pelo roteiro
// scripts/gnome-aninhado/roteiros/aparencia.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escolhaDe, marcacao, previa } from './settings.js';
import t from '../lib/i18n/pt-BR.js';

const opcoes = (html) => [...html.matchAll(/<label class="tt-tema" data-tema="(\w+)"/g)].map((m) => m[1]);

test('Aparência: cinco opções na ordem da 4.1, com o nome do catálogo, e o Full escondido até o M51', () => {
  const html = marcacao();
  assert.deepEqual(opcoes(html), ['lite', 'suave', 'light', 'dark', 'system']);
  assert.doesNotMatch(html, /full/);
  for (const [tema, nome] of [
    ['lite', 'Tomatito Lite'],
    ['suave', 'Tomatito Suave'],
    ['light', 'Claro'],
    ['dark', 'Escuro'],
    ['system', 'Usar configuração do sistema'],
  ]) {
    assert.equal(t.configuracoes.temas[tema], nome);
    assert.match(html, new RegExp(`<fluent-radio value="${tema}"></fluent-radio>${nome}</span></label>`));
  }
});

test('cada prévia é um elemento data-theme do próprio tema, decorativa; o Sistema mostra o Claro e o Escuro', () => {
  for (const tema of ['lite', 'suave', 'light', 'dark']) {
    const p = previa(tema);
    assert.match(p, /^<span class="tt-previa-moldura" aria-hidden="true">/);
    assert.deepEqual([...p.matchAll(/data-theme="(\w+)"/g)].map((m) => m[1]), [tema]);
  }
  const s = previa('system');
  assert.match(s, /tt-previa-dupla" aria-hidden="true"/);
  assert.deepEqual([...s.matchAll(/data-theme="(\w+)"/g)].map((m) => m[1]), ['light', 'dark']);
  // Só formas: nenhum texto dentro das prévias, para o nome da opção ser só o do rótulo
  assert.equal(s.replace(/<[^>]+>/g, ''), '');
});

test('o grupo de rádios tem nome e descrição do cartão e marca a preferência atual (nenhuma no Full)', () => {
  const html = marcacao({ pref: 'dark', icone: (n, g) => `<svg data-icone="${n}" data-grade="${g}"></svg>` });
  assert.match(html, /<fluent-radio-group class="tt-temas" name="tema" orientation="horizontal" aria-labelledby="config-tema" aria-describedby="config-tema-desc" value="dark">/);
  assert.match(html, /<span id="config-tema" class="tt-config-titulo">Tema do aplicativo<\/span>/);
  assert.match(html, /<span id="config-tema-desc" class="tt-config-descricao tt-t-caption">Escolha as cores do Tomatito\.<\/span>/);
  assert.match(html, /<svg data-icone="paint_brush" data-grade="20"><\/svg>/);
  assert.deepEqual([...html.matchAll(/data-tema="(\w+)" data-marcado/g)].map((m) => m[1]), ['dark']);
  assert.match(html, /^<div class="tt-pagina"><h1 class="tt-t-title" tabindex="-1">Configurações<\/h1><section class="tt-config-secao" aria-labelledby="config-aparencia"><h2 id="config-aparencia" class="tt-t-body-strong">Aparência<\/h2>/);

  const full = marcacao({ pref: 'full' });
  assert.doesNotMatch(full, /data-marcado/);
  assert.doesNotMatch(full, /<fluent-radio-group[^>]* value="/);
  assert.equal(escolhaDe('full'), null);
  assert.equal(escolhaDe('system'), 'system');
});
