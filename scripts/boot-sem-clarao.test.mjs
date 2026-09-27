// M08: boot sem clarão (PLANO.md, 4.7 e 3.8). O script do <head> é o único que
// grava os atributos de tema e de plataforma no <html>, antes de qualquer
// folha de estilo. Estes testes rodam o script de verdade (tirado do
// index.html) num contexto isolado do node:vm, com as globais que o
// initialization_script do Rust definiria, e conferem a ordem do <head> e o
// main.js. A janela de verdade (quadros e console) é conferida pelo roteiro
// scripts/gnome-aninhado/roteiros/partida-a-frio.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ler = (caminho) => readFileSync(new URL(`../${caminho}`, import.meta.url), 'utf8');
const indexHtml = ler('index.html');
const head = indexHtml.slice(indexHtml.indexOf('<head>') + 6, indexHtml.indexOf('</head>'));

// Os elementos do <head>, na ordem, sem os comentários.
const elementos = [...head.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<(meta|script|link|title|style)\b([^>]*)>/g)].map(
  (m) => ({ tag: m[1], attrs: m[2], pos: m.index }),
);
const inline = [...head.matchAll(/<script>([\s\S]*?)<\/script>/g)];
const BOOT = inline[0]?.[1];

/** Roda o script de boot e devolve o que ele gravou no <html>. */
function boot({ globais = {}, caminho = '/', escuro = true } = {}) {
  const dataset = {};
  const contexto = {
    document: { documentElement: { dataset } },
    location: { pathname: caminho },
    matchMedia: (q) => {
      assert.equal(q, '(prefers-color-scheme: dark)');
      return { matches: escuro };
    },
    ...globais,
  };
  contexto.window = contexto;
  vm.runInNewContext(BOOT, contexto);
  return { ...dataset };
}

test('o <head> abre com o charset e logo depois o script de boot, antes de qualquer folha e de qualquer outro script', () => {
  assert.equal(inline.length, 1, 'um único script inline no index.html (o Tauri gera o hash dele para a CSP)');
  assert.deepEqual(
    elementos.slice(0, 2).map((e) => e.tag),
    ['meta', 'script'],
    'primeiro o <meta charset>, depois o script de boot',
  );
  assert.match(elementos[0].attrs, /charset="UTF-8"/);
  assert.equal(elementos[1].attrs, '', 'script clássico e inline: sem src, type nem defer');
  const folhas = elementos.filter((e) => e.tag === 'link' && /rel="stylesheet"/.test(e.attrs));
  assert.ok(folhas.length > 0);
  for (const f of folhas) assert.ok(f.pos > elementos[1].pos, `folha antes do boot: ${f.attrs}`);
  // O charset precisa estar nos primeiros 1024 bytes do arquivo (pré-varredura do HTML).
  assert.ok(Buffer.byteLength(indexHtml.slice(0, indexHtml.indexOf('<meta charset'))) < 1024);
  assert.match(BOOT, /^[\x20-\x7e\n]*$/, 'script só em ASCII (o hash da CSP não depende da codificação)');
});

test('o <html> não traz tema nem plataforma fixos: quem grava é o script de boot', () => {
  const html = indexHtml.match(/<html\b[^>]*>/)[0];
  assert.equal(html, '<html lang="pt-BR">');
});

test('as globais lidas pelo boot são as que o initialization_script do Rust define', () => {
  const rust = ler('src-tauri/src/window/main_window.rs');
  const doRust = [...new Set([...rust.matchAll(/window\.(__TT_[A-Z_]+__)=/g)].map((m) => m[1]))];
  assert.deepEqual(doRust, ['__TT_PREF__', '__TT_LAST__', '__TT_PLATFORM__']);
  for (const g of doRust) assert.ok(BOOT.includes(`w.${g}`), `o boot não lê ${g}`);
});

test('sem globais (navegador comum): Lite e plataforma web', () => {
  assert.deepEqual(boot(), { themePref: 'lite', theme: 'lite', platform: 'web' });
});

test('temas normais: o data-theme é a própria preferência', () => {
  for (const pref of ['lite', 'suave', 'light', 'dark']) {
    assert.deepEqual(boot({ globais: { __TT_PREF__: pref, __TT_PLATFORM__: 'linux' } }), {
      themePref: pref,
      theme: pref,
      platform: 'linux',
    });
  }
  assert.equal(boot({ globais: { __TT_PLATFORM__: 'windows' } }).platform, 'windows');
});

test('Sistema resolve para Claro ou Escuro pelo prefers-color-scheme, nunca para Lite nem Suave', () => {
  const g = { __TT_PREF__: 'system', __TT_PLATFORM__: 'linux' };
  assert.deepEqual(boot({ globais: g, escuro: true }), { themePref: 'system', theme: 'dark', platform: 'linux' });
  assert.deepEqual(boot({ globais: g, escuro: false }), { themePref: 'system', theme: 'light', platform: 'linux' });
});

test('Full na main: mostra o último tema normal (as Configurações abertas do tomate ficam opacas)', () => {
  assert.deepEqual(boot({ globais: { __TT_PREF__: 'full', __TT_LAST__: 'suave' } }), {
    themePref: 'full',
    theme: 'suave',
    platform: 'web',
  });
  assert.equal(boot({ globais: { __TT_PREF__: 'full' } }).theme, 'lite', 'sem __TT_LAST__, o Lite');
  assert.equal(boot({ globais: { __TT_PREF__: 'full', __TT_LAST__: 'system' }, escuro: false }).theme, 'light');
  assert.equal(boot({ globais: { __TT_PREF__: 'full', __TT_FULL_MODE__: 'opaque' } }).fullMode, undefined);
});

test('janela tomato: sempre "full", e data-full-mode só no plano B3', () => {
  for (const pref of ['lite', 'dark', 'full', undefined]) {
    const r = boot({ caminho: '/tomato.html', globais: { __TT_PREF__: pref, __TT_PLATFORM__: 'linux' } });
    assert.equal(r.theme, 'full');
    assert.equal(r.fullMode, undefined);
  }
  const b3 = boot({ caminho: '/tomato.html', globais: { __TT_PREF__: 'full', __TT_FULL_MODE__: 'opaque' } });
  assert.equal(b3.fullMode, 'opaque');
});

test('main.js: espera só as tags importadas e as fontes, com prazo, e mostra a janela sem requestAnimationFrame', () => {
  const main = ler('src/main.js');
  const importadas = [...main.matchAll(/^import '@fluentui\/web-components\/([a-z-]+)\.js';$/gm)].map((m) => `fluent-${m[1]}`);
  const usados = main.match(/const USADOS = \[([^\]]*)\]/);
  assert.ok(usados, 'falta a lista USADOS');
  const lista = [...usados[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual([...lista].sort(), [...importadas].sort(), 'USADOS difere dos imports de @fluentui/web-components');
  assert.match(main, /customElements\.whenDefined/);
  assert.match(main, /document\.fonts\.ready/);
  assert.match(main, /Promise\.race\(\[pronto, new Promise\(\(r\) => setTimeout\(r, 2000\)\)\]\)/);
  // Com a main escondida, o WebKitGTK não gera quadros: um show() dentro de um
  // requestAnimationFrame nunca rodaria (docs/decisoes.md, M07 e M08).
  assert.doesNotMatch(main, /requestAnimationFrame\([^;]*show\(/);
  assert.match(main, /finally \{[\s\S]*await win\.show\(\);\s*\}/);
  // O data-platform provisório do M07 sai: agora é do script de boot.
  assert.doesNotMatch(main, /dataset\.platform\s*=/);
});
