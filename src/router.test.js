// Testes do roteador por hash (M09) que não precisam de janela. A troca de tela
// na janela de verdade é conferida pelo roteiro
// scripts/gnome-aninhado/roteiros/navegacao.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROTAS, ROTA_PADRAO, hashDaRota, iniciarRoteador, rotaDoHash } from './router.js';

test('as cinco rotas da seção 3.7, com a Foco como padrão', () => {
  assert.deepEqual(ROTAS, ['foco', 'temporizador', 'cronometro', 'configuracoes', 'dev']);
  assert.equal(ROTA_PADRAO, 'foco');
  for (const r of ROTAS) assert.equal(rotaDoHash(hashDaRota(r)), r);
});

test('hash vazio, desconhecido ou fora do formato #/rota não é rota', () => {
  for (const h of ['', '#', '#/', '#foco', '#/Foco', '#/foco/', '#/foco?x=1', '#/inexistente', '/foco', undefined, null]) {
    assert.equal(rotaDoHash(h), null, String(h));
  }
});

// Um DOM mínimo, só com o que o roteador usa.
function ambiente(hashInicial) {
  const ouvintes = {};
  const loc = {
    hash: hashInicial,
    replace(url) {
      loc.hash = url;
      ouvintes.hashchange?.();
    },
  };
  const hist = {
    state: null,
    replaceState(_s, _t, url) {
      loc.hash = url; // sem hashchange, como no navegador
    },
  };
  const titulo = { focado: false, focus() { this.focado = true; } };
  const raiz = {
    filhos: 0,
    scrollTop: 40,
    replaceChildren() { this.filhos = 0; },
    contains: (el) => el === 'dentro',
    querySelector: (sel) => (sel === 'h1[tabindex="-1"]' ? titulo : null),
  };
  const doc = { activeElement: 'fora' };
  Object.assign(globalThis, {
    location: loc,
    history: hist,
    document: doc,
    addEventListener: (tipo, fn) => (ouvintes[tipo] = fn),
  });
  return { loc, raiz, titulo, doc, ouvintes };
}

test('sem hash, abre a Foco sem criar entrada no histórico, e troca de tela com location.replace', (t) => {
  t.after(() => {
    for (const k of ['location', 'history', 'document', 'addEventListener']) delete globalThis[k];
  });
  const { loc, raiz, titulo, doc } = ambiente('');
  const montadas = [];
  const limpas = [];
  const telas = Object.fromEntries(
    ROTAS.map((r) => [r, { montar: () => (montadas.push(r), () => limpas.push(r)) }]),
  );
  const mudancas = [];
  const roteador = iniciarRoteador({ raiz, telas, aoMudar: (r, a) => mudancas.push([r, a]) });
  assert.equal(loc.hash, '#/foco');
  assert.equal(roteador.atual, 'foco');
  assert.deepEqual(montadas, ['foco']);
  assert.deepEqual(mudancas, [['foco', null]]);
  assert.equal(raiz.scrollTop, 0);

  roteador.navegar('cronometro');
  assert.equal(loc.hash, '#/cronometro');
  assert.deepEqual(limpas, ['foco'], 'a tela que sai é limpa');
  assert.deepEqual(mudancas.at(-1), ['cronometro', 'foco']);
  assert.equal(titulo.focado, false, 'o foco estava fora da tela: fica onde está');

  roteador.navegar('cronometro');
  assert.equal(montadas.length, 2, 'a mesma rota não redesenha a tela');

  doc.activeElement = 'dentro';
  roteador.navegar('dev');
  assert.equal(titulo.focado, true, 'com o foco dentro da tela que saiu, ele vai para o título da nova');
  assert.throws(() => roteador.navegar('inexistente'), /rota desconhecida/);
});
