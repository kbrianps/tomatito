// Testes da barra de título (M07) que não precisam de janela: a marcação e os
// glifos. O comportamento na janela de verdade é conferido pelo roteiro
// scripts/gnome-aninhado/roteiros/barra-de-titulo.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GLIFOS, estadoDoMaximizar, marcacao } from './title-bar.js';
import t from '../lib/i18n/pt-BR.js';

const botoes = (html) =>
  [...html.matchAll(/<button\b([^>]*)>(.*?)<\/button>/g)].map(([, attrs, dentro]) => ({
    acao: attrs.match(/data-acao="([^"]+)"/)?.[1],
    rotulo: attrs.match(/aria-label="([^"]+)"/)?.[1],
    title: attrs.match(/title="([^"]+)"/)?.[1],
    tabindex: attrs.match(/tabindex="([^"]+)"/)?.[1],
    dentro,
  }));

test('três botões na ordem do sistema, com aria-label do catálogo e fora do Tab', () => {
  const b = botoes(marcacao(false));
  assert.deepEqual(b.map((x) => x.acao), ['minimizar', 'maximizar', 'fechar']);
  assert.deepEqual(b.map((x) => x.rotulo), ['Minimizar', 'Maximizar', 'Fechar']);
  for (const x of b) {
    assert.equal(x.tabindex, '-1', `${x.acao} fora do Tab`);
    assert.equal(x.title, x.rotulo, `${x.acao} com dica igual ao rótulo`);
  }
});

test('maximizada, o botão do meio vira Restaurar, com o glifo de dois quadrados', () => {
  const [, meio] = botoes(marcacao(true));
  assert.equal(meio.rotulo, t.barraDeTitulo.restaurar);
  assert.ok(meio.dentro.includes(GLIFOS.restaurar));
  assert.deepEqual(estadoDoMaximizar(false), { rotulo: 'Maximizar', glifo: GLIFOS.maximizar });
  assert.deepEqual(estadoDoMaximizar(true), { rotulo: 'Restaurar', glifo: GLIFOS.restaurar });
});

test('glifos em SVG inline de 10 × 10, sem fonte de ícones', () => {
  for (const { dentro } of botoes(marcacao(false))) {
    assert.match(dentro, /^<svg viewBox="0 0 10 10" aria-hidden="true" focusable="false">.+<\/svg>$/);
  }
  // Todas as coordenadas dos glifos ficam dentro da caixa de 10 px.
  for (const [nome, glifo] of Object.entries(GLIFOS)) {
    const numeros = [...glifo.matchAll(/-?\d*\.?\d+/g)].map((m) => Number(m[0]));
    assert.ok(numeros.every((n) => n >= -10 && n <= 10), `${nome}: ${numeros}`);
  }
});

test('ícone de 16 px e título do catálogo antes dos botões', () => {
  const html = marcacao(false);
  assert.match(html, /^<svg class="tt-titlebar-icone" viewBox="0 0 16 16" aria-hidden="true"/);
  assert.ok(html.indexOf(`<span class="tt-titlebar-titulo">${t.app.nome}</span>`) < html.indexOf('<button'));
});
