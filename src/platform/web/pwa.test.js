// Testes do PWA (W16): o manifest, a lista do precache, o nome do cache e o
// sw.js do build, montados pelo plugin-web.mjs, e os ícones do
// scripts/web/icones.mjs. A instalação e o offline de verdade são do caso pwa
// (scripts/web/casos/pwa.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  COR_INICIAL,
  ICONES,
  MANIFESTO,
  listaDoPrecache,
  manifesto,
  montarHead,
  nomeDoCache,
  nomeDoIcone,
  swDoBuild,
  versaoDoCargo,
} from '../../../scripts/web/plugin-web.mjs';
import { RAIO_SEGURO, icones, svgMaskable, tamanhoDoPng } from '../../../scripts/web/icones.mjs';

const ler = (arquivo) => readFileSync(fileURLToPath(new URL(`../../../${arquivo}`, import.meta.url)));
const fonteDoSw = ler('src/platform/web/sw.js').toString('utf8');

test('manifest: nome, base, standalone, cor do Lite, focus-existing e os 3 ícones', () => {
  const m = manifesto({
    base: '/',
    icones: ICONES.map((i) => ({ src: nomeDoIcone(i.fonte, Buffer.from(i.fonte)), lado: i.lado, proposito: i.proposito })),
  });
  assert.equal(MANIFESTO, 'manifest.webmanifest');
  assert.equal(m.name, 'Tomatito');
  assert.equal(m.short_name, 'Tomatito');
  assert.equal(m.lang, 'pt-BR');
  assert.deepEqual([m.id, m.start_url, m.scope], ['/', '/', '/']);
  assert.equal(m.display, 'standalone');
  assert.equal(m.theme_color, '#A5342B');
  assert.equal(m.background_color, COR_INICIAL);
  assert.deepEqual(m.launch_handler, { client_mode: 'focus-existing' });
  assert.deepEqual(
    m.icons.map((i) => [i.sizes, i.purpose, i.type]),
    [
      ['192x192', 'any', 'image/png'],
      ['512x512', 'any', 'image/png'],
      ['512x512', 'maskable', 'image/png'],
    ],
  );
  for (const i of m.icons) assert.match(i.src, /^\/assets\/icone-(192|512|maskable-512)-[0-9a-f]{8}\.png$/);
  // A palavra proibida não entra no manifest.
  assert.doesNotMatch(JSON.stringify(m), new RegExp(['pomo', 'doro'].join(''), 'i'));
});

test('ícones: os PNG do repositório têm o lado do manifest; o maskable pinta o quadrado e o anel cabe na zona segura', () => {
  for (const i of ICONES) {
    const { largura, altura } = tamanhoDoPng(ler(i.fonte));
    assert.deepEqual([largura, altura], [i.lado, i.lado], i.fonte);
  }
  assert.deepEqual(
    icones().map((i) => [i.nome, i.lado, i.proposito]),
    ICONES.map((i) => [i.fonte.split('/').pop(), i.lado, i.proposito]),
  );
  const svg = svgMaskable(ler('src-tauri/icons/icon.svg').toString('utf8'));
  assert.match(svg, /<rect width="1024" height="1024" fill="url\(#corpo\)"\/>/);
  // O anel do mestre: raio 264, traço de 96 (raio externo 312), escalado.
  const escala = Number(/scale\(([\d.]+)\)/.exec(svg)[1]);
  assert.ok(312 * escala <= RAIO_SEGURO * 1024, `anel com raio externo ${312 * escala}`);
});

test('precache: a página entra como ./ (nunca pelo nome do arquivo), sem o sw.js, em ordem', () => {
  const lista = listaDoPrecache(['sw.js', 'index.html', 'assets/b.js', 'manifest.webmanifest', 'assets/a.css', 'assets/a.css.map']);
  assert.deepEqual(lista, ['./', 'assets/a.css', 'assets/b.js', 'manifest.webmanifest']);
  assert.ok(!lista.some((u) => u.includes('index.html')));
});

test('nome do cache: tomatito-<versão>-<hash8>, que muda com o conteúdo e com o TOMATITO_WEB_BUILD', () => {
  const conteudos = { './': 'pagina', 'assets/a.js': 'a' };
  const um = nomeDoCache({ versao: '0.1.0', conteudos });
  assert.match(um, /^tomatito-0\.1\.0-[0-9a-f]{8}$/);
  assert.equal(nomeDoCache({ versao: '0.1.0', conteudos: { 'assets/a.js': 'a', './': 'pagina' } }), um);
  assert.notEqual(nomeDoCache({ versao: '0.1.0', conteudos, build: 'teste2' }), um);
  // A página (sem hash no nome) mudou: o nome também.
  assert.notEqual(nomeDoCache({ versao: '0.1.0', conteudos: { ...conteudos, './': 'outra' } }), um);
  assert.equal(versaoDoCargo(), /^version = "([^"]+)"/m.exec(ler('src-tauri/Cargo.toml').toString('utf8'))[1]);
});

test('sw.js do build: as três marcas trocadas; a fonte sem precache e sem citar o arquivo da página', () => {
  assert.match(fonteDoSw, /^const PRECACHE = \[\]; \/\/ tomatito:precache$/m);
  assert.doesNotMatch(fonteDoSw, /index\.html/);
  // Sem skipWaiting no install: só pela mensagem da página.
  assert.equal((fonteDoSw.match(/skipWaiting\(\)/g) ?? []).length, 1);
  assert.match(fonteDoSw, /evento\.data\?\.type === 'SKIP_WAITING'\) self\.skipWaiting\(\)/);
  const sw = swDoBuild(fonteDoSw, { precache: ['./', 'assets/a.js'], cache: 'tomatito-0.1.0-0123abcd', build: 'teste2' });
  assert.match(sw, /^const PRECACHE = \["\.\/","assets\/a\.js"\];$/m);
  assert.match(sw, /^const CACHE = "tomatito-0\.1\.0-0123abcd";$/m);
  assert.match(sw, /^const BUILD = "teste2";$/m);
  assert.doesNotMatch(sw, /tomatito:(precache|cache|build)/);
  assert.throws(() => swDoBuild('const X = 1;', { precache: [], cache: 'c' }), /marca do sw\.js/);
});

test('head: o <link rel="manifest"> depois do theme-color e antes do boot-web', () => {
  const index = ler('index.html').toString('utf8');
  const html = montarHead(index, { bootSrc: '/assets/boot-web-0.js', csp: false, manifestHref: '/manifest.webmanifest' });
  const tema = html.indexOf('<meta name="theme-color"');
  const link = html.indexOf('<link rel="manifest" href="/manifest.webmanifest" />');
  const boot = html.indexOf('<script src="/assets/boot-web-0.js"></script>');
  assert.ok(tema >= 0 && tema < link && link < boot, JSON.stringify({ tema, link, boot }));
  assert.doesNotMatch(montarHead(index, { bootSrc: '/x.js', csp: false }), /rel="manifest"/);
});
