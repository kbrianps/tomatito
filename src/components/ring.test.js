// Testes do anel de progresso (M27) sem DOM: a geometria, o deslocamento do
// arco, a marcação e o `ligarAnel` com elementos falsos. O desenho na tela é
// conferido na prévia (scripts/preview/progresso.mjs) e no app (roteiro
// aninhado progresso).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ESPESSURA, LADO, deslocamento, fracaoValida, geometria, ligarAnel, marcacao } from './ring.js';

test('geometria: o anel do Relógio, 206 px com traço de 18 (raio do meio 94)', () => {
  assert.equal(LADO, 206);
  assert.equal(ESPESSURA, 18);
  const g = geometria();
  assert.equal(g.centro, 103);
  assert.equal(g.raio, 94);
  assert.ok(Math.abs(g.circunferencia - 2 * Math.PI * 94) < 1e-9);
});

test('deslocamento: a circunferência vezes o que falta, com a fração entre 0 e 1', () => {
  const c = 100;
  assert.equal(deslocamento(0, c), 100);
  assert.equal(deslocamento(0.25, c), 75);
  assert.equal(deslocamento(1, c), 0);
  assert.equal(deslocamento(1.25, c), 0, 'acima da meta, o círculo cheio');
  for (const v of [-1, NaN, undefined, null, Infinity]) assert.equal(fracaoValida(v), 0, String(v));
  assert.equal(deslocamento(0.375, geometria().circunferencia), 369.137);
});

test('marcação: role="img" com rótulo, trilho e arco girado para começar às 12 h, SVG fora da árvore', () => {
  const html = marcacao({ fracao: 0.5, rotulo: 'Meta "x" & <y>', centro: '<span>2</span>', classe: 'extra' });
  assert.match(html, /^<div class="tt-anel extra" role="img" aria-label="Meta &quot;x&quot; &amp; &lt;y>" data-anel>/);
  assert.match(html, /<svg class="tt-anel-svg" viewBox="0 0 206 206" aria-hidden="true" focusable="false">/);
  assert.match(html, /<circle class="tt-anel-trilho" cx="103" cy="103" r="94" stroke-width="18"\/>/);
  assert.match(html, /<circle class="tt-anel-arco" [^>]*transform="rotate\(-90 103 103\)" stroke-dasharray="590\.619" stroke-dashoffset="295\.31"\/>/);
  assert.match(html, /<div class="tt-anel-centro" aria-hidden="true"><span>2<\/span><\/div><\/div>$/);
  assert.doesNotMatch(html, /style=/, 'nada de style="..." (CSP, 3.8)');
});

test('marcação: com a fração 0, o arco fica escondido (a ponta redonda desenharia um ponto)', () => {
  assert.match(marcacao({ fracao: 0 }), /stroke-dashoffset="590\.619" data-vazio\/>/);
  assert.doesNotMatch(marcacao({ fracao: 0.01 }), /data-vazio/);
  assert.doesNotMatch(marcacao(), /tt-anel-centro/, 'sem centro, sem o bloco do meio');
});

function falso(html) {
  const attrs = (tag) => Object.fromEntries([...html.match(new RegExp(`<${tag}[^>]*>`))[0].matchAll(/([\w-]+)(?:="([^"]*)")?/g)].slice(1).map((m) => [m[1], m[2] ?? '']));
  const elemento = (a, eventos) => {
    const props = new Map();
    return {
      a,
      props,
      getAttribute: (n) => (n in a ? a[n] : null),
      setAttribute: (n, v) => (eventos.push(`set ${n}=${v}`), (a[n] = String(v))),
      removeAttribute: (n) => (n in a && eventos.push(`remove ${n}`), delete a[n]),
      hasAttribute: (n) => n in a,
      style: { setProperty: (n, v) => (eventos.push(`style ${n}=${v}`), props.set(n, v)) },
      getBoundingClientRect: () => (eventos.push('estilo calculado'), {}),
    };
  };
  const eventos = [];
  const anel = elemento(attrs('div'), eventos);
  const svg = elemento(attrs('svg'), eventos);
  const arco = elemento(attrs('circle class="tt-anel-arco"'), eventos);
  anel.matches = (s) => s === '[data-anel]';
  anel.querySelector = (s) => ({ svg, '.tt-anel-arco': arco })[s];
  return { anel, arco, eventos };
}

test('ligarAnel: anima pela propriedade CSS, só quando muda, e vai direto com animar: false', () => {
  const { anel, arco, eventos } = falso(marcacao({ fracao: 0 }));
  const a = ligarAnel(anel);
  a.progresso(0);
  assert.deepEqual(eventos, [], 'mesma fração, nada muda');
  a.progresso(0.5);
  assert.deepEqual(eventos, ['remove data-vazio', 'style stroke-dashoffset=295.31px']);
  eventos.length = 0;
  a.progresso(0.75, { animar: false });
  assert.deepEqual(eventos, [
    'set data-sem-transicao=',
    'style stroke-dashoffset=147.655px',
    'estilo calculado',
    'remove data-sem-transicao',
  ]);
  eventos.length = 0;
  a.progresso(0);
  assert.deepEqual(eventos, ['set data-vazio=', 'style stroke-dashoffset=590.619px']);
  assert.ok(arco.hasAttribute('data-vazio'));
  eventos.length = 0;
  a.rotular('Meta diária de 2 horas.');
  a.rotular('Meta diária de 2 horas.');
  assert.deepEqual(eventos, ['set aria-label=Meta diária de 2 horas.']);
});
