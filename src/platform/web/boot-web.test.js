// W07a: o boot-web.js (rodado de verdade num contexto do node:vm) e o <head>
// que o plugin-web.mjs monta. A página real é conferida pelo caso config do
// verificar.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { COR_INICIAL, montarHead, politica, scriptsInline, VIEWPORT } from '../../../scripts/web/plugin-web.mjs';

const ler = (caminho) => readFileSync(new URL(`../../../${caminho}`, import.meta.url), 'utf8');
const BOOT_WEB = ler('src/platform/web/boot-web.js');
const CONSULTA = '(width < 600px) or ((pointer: coarse) and (height < 500px))';

/** Roda o boot-web.js com um localStorage e uma consulta de forma falsos. */
function rodar({ config = null, celular = false, semStorage = false } = {}) {
  const dataset = {};
  const ouvintesDaForma = [];
  const observadores = [];
  const forma = {
    matches: celular,
    addEventListener: (tipo, f) => tipo === 'change' && ouvintesDaForma.push(f),
  };
  const meta = { name: 'theme-color', content: COR_INICIAL };
  const contexto = {
    document: {
      documentElement: { dataset },
      head: { appendChild: () => assert.fail('a meta do plugin já existe') },
      querySelector: (sel) => (sel === 'meta[name="theme-color"]' ? meta : null),
      createElement: () => ({}),
    },
    localStorage: {
      getItem: (k) => {
        if (semStorage) throw new Error('bloqueado');
        assert.equal(k, 'tomatito:config');
        return config === null ? null : JSON.stringify(config);
      },
    },
    matchMedia: (q) => {
      assert.equal(q, CONSULTA);
      return forma;
    },
    MutationObserver: class {
      constructor(f) {
        observadores.push(f);
      }
      observe(alvo, opcoes) {
        assert.deepEqual([...opcoes.attributeFilter], ['data-theme']);
      }
    },
  };
  contexto.window = contexto;
  vm.runInNewContext(BOOT_WEB, contexto);
  return {
    contexto,
    dataset,
    meta,
    mudarForma(v) {
      forma.matches = v;
      for (const f of ouvintesDaForma) f();
    },
    mudarTema(t) {
      dataset.theme = t;
      for (const f of observadores) f();
    },
  };
}

test('boot-web: data-casca e as globais do tema a partir do tomatito:config', () => {
  const r = rodar({ config: { theme: 'full', lastNormalTheme: 'suave' } });
  assert.equal(r.dataset.casca, 'web');
  assert.equal(r.contexto.__TT_PREF__, 'full');
  assert.equal(r.contexto.__TT_LAST__, 'suave');
  // Sem nada salvo, ou com o localStorage bloqueado: as globais ficam de fora
  // (o boot do index.html cai no Lite).
  for (const opcoes of [{}, { semStorage: true }]) {
    const s = rodar(opcoes);
    assert.equal(s.dataset.casca, 'web');
    assert.equal(s.contexto.__TT_PREF__, undefined);
  }
});

test('boot-web: data-forma="celular" segue a consulta da 5.1, ligando e desligando', () => {
  const r = rodar({ celular: true });
  assert.equal(r.dataset.forma, 'celular');
  r.mudarForma(false);
  assert.equal('forma' in r.dataset, false);
  r.mudarForma(true);
  assert.equal(r.dataset.forma, 'celular');
  assert.equal('forma' in rodar().dataset, false);
});

test('boot-web: theme-color com o --tt-bg-app de cada tema do tokens.css', () => {
  const tokens = ler('src/styles/tokens.css');
  const fundo = (seletor) => {
    const i = tokens.indexOf(seletor);
    assert.ok(i >= 0, seletor);
    return /--tt-bg-app:(#[0-9A-F]{6})/i.exec(tokens.slice(i))[1].toUpperCase();
  };
  const esperado = {
    lite: fundo(':is([data-theme="lite"],[data-theme="full"])'),
    suave: fundo('[data-theme="suave"]{'),
    light: fundo('[data-theme="light"]{'),
    dark: fundo('[data-theme="dark"]{'),
  };
  assert.deepEqual(esperado, { lite: '#A5342B', suave: '#F6ECE9', light: '#F3F3F3', dark: '#202020' });
  const r = rodar();
  for (const [tema, cor] of Object.entries(esperado)) {
    r.mudarTema(tema);
    assert.equal(r.meta.content, cor, tema);
  }
  assert.equal(COR_INICIAL, esperado.lite);
});

test('plugin-web: CSP primeiro, theme-color e boot-web antes do boot do index.html, e a viewport da 5.1', () => {
  const index = ler('index.html');
  const html = montarHead(index, { bootSrc: '/assets/boot-web-0.js', csp: true });
  const head = html.slice(0, html.indexOf('</head>'));
  const ordem = [
    '<meta charset="UTF-8" />',
    '<meta http-equiv="Content-Security-Policy"',
    `<meta name="theme-color" content="${COR_INICIAL}" />`,
    '<script src="/assets/boot-web-0.js"></script>',
    '<script>(function(){',
    `<meta name="viewport" content="${VIEWPORT}" />`,
  ].map((s) => head.indexOf(s));
  assert.ok(ordem.every((p) => p >= 0), JSON.stringify(ordem));
  assert.deepEqual([...ordem].sort((a, b) => a - b), ordem);
  assert.match(VIEWPORT, /viewport-fit=cover/);
  assert.match(VIEWPORT, /interactive-widget=resizes-content/);
  // O hash é o do script inline de boot, exatamente como está no index.html.
  const inline = scriptsInline(index);
  assert.equal(inline.length, 1);
  const hash = createHash('sha256').update(inline[0]).digest('base64');
  assert.equal(
    politica(index),
    `default-src 'self'; script-src 'self' 'wasm-unsafe-eval' 'sha256-${hash}'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'`,
  );
  // Sem CSP (o dev), o resto igual.
  assert.doesNotMatch(montarHead(index, { bootSrc: '/x.js', csp: false }), /Content-Security-Policy/);
});
