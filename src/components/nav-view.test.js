// Testes do painel de navegação (M09) que não precisam de janela: a marcação e
// a definição do grupo de foco. O comportamento na janela de verdade (clique,
// atalhos, Tab e setas, indicador deslizando) é conferido pelo roteiro
// scripts/gnome-aninhado/roteiros/navegacao.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFINICAO, FOCUSGROUP, ITENS, RODAPE, marcacao } from './nav-view.js';
import t from '../lib/i18n/pt-BR.js';

const iconeFalso = (nome) => `<svg data-icone="${nome}"></svg>`;
const links = (html) =>
  [...html.matchAll(/<a\b([^>]*)>(.*?)<\/a>/g)].map(([, attrs, dentro]) => ({
    href: attrs.match(/href="([^"]+)"/)?.[1],
    rota: attrs.match(/data-rota="([^"]+)"/)?.[1],
    atual: attrs.match(/aria-current="([^"]+)"/)?.[1] ?? null,
    inicio: /\sfocusgroupstart\b/.test(attrs),
    arrastavel: attrs.match(/draggable="([^"]+)"/)?.[1],
    icone: dentro.match(/data-icone="([^"]+)"/)?.[1],
    rotulo: dentro.match(/<span class="tt-nav-rotulo">([^<]*)<\/span>/)?.[1],
    indicador: /<span class="tt-nav-indicador" aria-hidden="true"><\/span>/.test(dentro),
  }));

test('Foco, Temporizador e Cronômetro em cima e Configurações no rodapé, como links', () => {
  const html = marcacao('foco', iconeFalso);
  const [cima, rodape] = html.split('tt-nav-rodape');
  assert.deepEqual(links(cima).map((l) => l.rota), ['foco', 'temporizador', 'cronometro']);
  assert.deepEqual(links(rodape).map((l) => l.rota), ['configuracoes']);
  for (const l of links(html)) {
    assert.equal(l.href, `#/${l.rota}`);
    assert.equal(l.rotulo, t.navegacao[l.rota], 'rótulo do catálogo');
    assert.equal(l.arrastavel, 'false', 'link que não se arrasta para fora');
    assert.ok(l.indicador, 'cada item tem o seu indicador, decorativo');
  }
  assert.deepEqual(links(html).map((l) => l.icone), ['target', 'hourglass_half', 'timer', 'settings']);
  assert.deepEqual([...ITENS, ...RODAPE].map((i) => i.rota), ['foco', 'temporizador', 'cronometro', 'configuracoes']);
});

test('aria-current="page" e focusgroupstart só no item da tela atual (nenhum no #/dev)', () => {
  for (const atual of ['foco', 'temporizador', 'cronometro', 'configuracoes']) {
    const l = links(marcacao(atual, iconeFalso));
    assert.deepEqual(l.filter((x) => x.atual).map((x) => [x.rota, x.atual]), [[atual, 'page']]);
    assert.deepEqual(l.filter((x) => x.inicio).map((x) => x.rota), [atual]);
  }
  const dev = links(marcacao('dev', iconeFalso));
  assert.equal(dev.filter((x) => x.atual || x.inicio).length, 0);
});

test('o atributo focusgroup e a definição do polyfill dizem a mesma coisa', () => {
  // Leitura do atributo como o polyfill faz (parseDefinition, @microsoft/focusgroup-polyfill 1.6.0).
  const tokens = FOCUSGROUP.split(' ');
  assert.equal(tokens[0], DEFINICAO.behavior);
  assert.equal(tokens.includes('block') ? 'block' : tokens.includes('inline') ? 'inline' : undefined, DEFINICAO.axis);
  assert.equal(tokens.includes('wrap'), DEFINICAO.wrap);
  assert.equal(!tokens.includes('nomemory'), DEFINICAO.memory);
  assert.deepEqual(DEFINICAO, { behavior: 'toolbar', axis: 'block', wrap: false, memory: false });
});
