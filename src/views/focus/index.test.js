// Testes da tela Foco que não precisam de janela (M10: a grade). O arranjo em
// uma ou duas colunas conforme a largura é conferido nos motores de verdade
// pelo scripts/preview/responsivo.mjs e pelo roteiro
// scripts/gnome-aninhado/roteiros/responsivo.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COLUNAS, marcacao, montar } from './index.js';
import t from '../../lib/i18n/pt-BR.js';

test('grade com duas colunas: sessão e tarefas na primeira, progresso na segunda', () => {
  assert.deepEqual(COLUNAS, [['sessao', 'tarefas'], ['progresso']]);
  const html = marcacao();
  const grade = html.match(/<div class="tt-foco-grade">(.*)<\/div><\/div>$/)?.[1];
  assert.ok(grade, 'a grade fica dentro da página, depois do título');
  const colunas = grade.split('<div class="tt-foco-coluna">').slice(1);
  assert.equal(colunas.length, 2);
  const ids = (col) => [...col.matchAll(/data-cartao="(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(colunas.map(ids), [['sessao', 'tarefas'], ['progresso']]);
});

test('ordem do HTML (e do Tab) é a da leitura numa coluna só: sessão, tarefas, progresso', () => {
  const ordem = [...marcacao().matchAll(/data-cartao="(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(ordem, ['sessao', 'tarefas', 'progresso']);
});

test('cada cartão é uma <section> com o título do catálogo em Subtitle, e a tela tem o <h1> focável', () => {
  const html = marcacao();
  assert.match(html, /^<div class="tt-pagina"><h1 class="tt-t-title" tabindex="-1">Foco<\/h1>/);
  for (const id of ['sessao', 'tarefas', 'progresso']) {
    const re = new RegExp(
      `<section class="tt-card${id === 'sessao' ? ' tt-sessao' : ''}" data-cartao="${id}" aria-labelledby="foco-${id}">` +
        `<h2 id="foco-${id}" class="tt-t-subtitle">${t.foco[id]}</h2>` +
        // M17: só o cartão de sessão tem conteúdo (o preparo e, durante a
        // sessão, o mostrador do M18).
        (id === 'sessao' ? '<div class="tt-preparo" data-preparo>.*</div><div data-andamento hidden>.*</div>' : '') +
        '</section>',
    );
    assert.match(html, re);
  }
  const { andamento, preparo, fases, ...titulos } = t.foco;
  assert.ok(andamento && preparo && fases);
  assert.deepEqual(titulos, { sessao: 'Pronto para focar', progresso: 'Progresso diário', tarefas: 'Tarefas' });
});

test('montar(raiz) desenha a marcação', () => {
  const raiz = { innerHTML: '' };
  assert.equal(montar(raiz, { store: null }), null);
  assert.equal(raiz.innerHTML, marcacao());
});

test('M17: os ícones vêm do contexto (play no botão, chevrons no seletor; M18: pause e "..." na sessão)', () => {
  const icone = (nome) => `<svg data-icone="${nome}"></svg>`;
  const html = marcacao({ icone });
  assert.deepEqual([...html.matchAll(/data-icone="(\w+)"/g)].map((m) => m[1]), ['chevron_up', 'chevron_down', 'play', 'pause', 'more_horizontal']);
  assert.doesNotMatch(marcacao().replace(/<svg class="tt-mostrador-svg".*?<\/svg>/, ''), /<svg/, 'sem contexto, sem ícone (node --test); o SVG do mostrador é do dial.js');
});
