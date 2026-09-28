// M11 e M22: tokens do Fluent gerados no build e o tingimento (PLANO.md, 4.5). O gerador é testado
// em memória e numa pasta temporária, sem depender do arquivo gerado no
// repositório (que fica fora do git). A troca de tema na página de verdade é
// conferida pelo scripts/preview/temas-fluent.mjs e pelo roteiro
// scripts/gnome-aninhado/roteiros/temas-fluent.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createDarkTheme, createLightTheme } from '@fluentui/tokens';
import { ancorasDoTema, ehNeutroTingivel, escrever, gerarCss, lerRampa, SAIDA, temasFluent, tintNeutrals } from './build-theme-css.mjs';
import { lerHex, oklabParaOklch, oklabParaSrgb, paraHex, srgbParaOklab } from './oklch.mjs';

const ler = (caminho) => readFileSync(new URL(`../${caminho}`, import.meta.url), 'utf8');
const tokensCss = ler('src/styles/tokens.css');
const pkg = JSON.parse(ler('package.json'));

// A rampa da seção 4.5 do plano.
const TOMATE = {
  10: '#210201', 20: '#350403', 30: '#4B0905', 40: '#610F09', 50: '#78180E', 60: '#902013',
  70: '#A52E1E', 80: '#B8402D', 90: '#CA523C', 100: '#DD634B', 110: '#F0745A', 120: '#F78F77',
  130: '#F8AA96', 140: '#FAC3B5', 150: '#FCDBD2', 160: '#FEF2EF',
};

/** As regras do CSS gerado: [{ seletores, decl: { nome: valor } }]. */
function regras(css) {
  return [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => ({
    seletores: m[1].trim().split(','),
    decl: Object.fromEntries(
      m[2]
        .split(';')
        .map((d) => d.trim())
        .filter(Boolean)
        .map((d) => [d.slice(2, d.indexOf(':')), d.slice(d.indexOf(':') + 1)]),
    ),
  }));
}

test('a rampa vem do :root do tokens.css e é a da seção 4.5', () => {
  assert.deepEqual(lerRampa(tokensCss), TOMATE);
  assert.throws(() => lerRampa(tokensCss.replace('--tt-tomato-90:#CA523C;', '')), /rampa --tt-tomato-\* incompleta/);
  assert.throws(() => lerRampa(tokensCss.replace('--tt-tomato-90:#CA523C;', '--tt-tomato-90:red;')), /não é #RRGGBB/);
});

test('M22: light recebe o createLightTheme e dark, o createDarkTheme; suave, lite e full, os tingidos', () => {
  const r = regras(gerarCss(tokensCss));
  assert.equal(r.length, 4, 'um bloco por fonte');
  assert.deepEqual(r.map((b) => b.seletores), [
    ['[data-theme="light"]'],
    ['[data-theme="suave"]'],
    ['[data-theme="dark"]'],
    ['[data-theme="lite"]', '[data-theme="full"]'],
  ]);
  const claro = createLightTheme(TOMATE);
  const escuro = createDarkTheme(TOMATE);
  const temas = temasFluent(tokensCss);
  for (const [bloco, tema] of [[r[0].decl, claro], [r[1].decl, temas.suave], [r[2].decl, escuro], [r[3].decl, temas.lite]]) {
    assert.deepEqual(Object.keys(bloco), Object.keys(tema), 'os mesmos tokens, na mesma ordem');
    for (const [k, v] of Object.entries(tema)) assert.equal(bloco[k], String(v), k);
  }
  assert.ok(Object.keys(claro).length > 400, `cerca de 470 tokens por tema (${Object.keys(claro).length})`);
  // Claro e Escuro continuam de fábrica (os valores que o M06 e o M11 anotaram).
  assert.equal(r[2].decl.colorNeutralForegroundInverted, '#242424');
  assert.equal(r[0].decl.colorNeutralForegroundInverted, '#ffffff');
  assert.equal(r[0].decl.borderRadiusCircular, '10000px');
  assert.match(gerarCss(tokensCss), /\/\* lite, full: tintNeutrals\(createDarkTheme\(--tt-tomato-\*\), cores do lite\) \*\//);
});

// Croma e matiz no OKLCH de uma cor opaca do gerado.
const lch = (valor) => oklabParaOklch(srgbParaOklab(lerHex(valor)));

test('M22: o tingimento só troca os neutros; o resto (rampa, status, sombras, medidas) fica igual', () => {
  const temas = temasFluent(tokensCss);
  for (const [fonte, base] of [['lite', createDarkTheme(TOMATE)], ['suave', createLightTheme(TOMATE)]]) {
    let trocados = 0;
    for (const [k, v] of Object.entries(base)) {
      if (ehNeutroTingivel(k, v)) trocados++;
      else assert.equal(temas[fonte][k], v, `${fonte}: ${k} não é neutro e não muda`);
    }
    assert.ok(trocados > 100, `${fonte}: ${trocados} neutros tingidos`);
    assert.equal(temas[fonte].colorNeutralShadowAmbient, base.colorNeutralShadowAmbient);
    assert.equal(temas[fonte].colorBrandBackground, base.colorBrandBackground);
    assert.equal(temas[fonte].colorTransparentBackgroundHover, 'transparent');
  }
  // o alfa dos rgba fica
  assert.equal(temas.lite.colorNeutralStrokeAlpha, 'rgba(255, 248, 246, 0.1)');
  assert.match(temas.lite.colorNeutralBackgroundAlpha, /^rgba\(\d+, \d+, \d+, 0\.5\)$/);
});

test('M22: as âncoras caem nas cores do tema, as mesmas da ponte', () => {
  const temas = temasFluent(tokensCss);
  const esperado = {
    lite: { colorNeutralBackground3: '#a5342b', colorNeutralBackground2: '#aa392f', colorNeutralBackground1: '#af4135',
      colorNeutralForeground3: '#fbe4dc', colorNeutralForeground1: '#fff8f6',
      // --tt-ctl-hover (branco a 10%) sobre o cartão, a âncora a mais do Lite
      colorNeutralBackground1Hover: '#b75449' },
    suave: { colorNeutralBackground3: '#f6ece9', colorNeutralBackground2: '#faf3f1', colorNeutralBackground1: '#fffaf9',
      colorNeutralForeground3: '#6a514c', colorNeutralForeground1: '#22110e' },
  };
  for (const [fonte, tokens] of Object.entries(esperado)) {
    for (const [k, v] of Object.entries(tokens)) assert.equal(temas[fonte][k], v, `${fonte}: ${k}`);
    assert.deepEqual(ancorasDoTema(tokensCss, fonte).map(([k]) => k), Object.keys(tokens));
  }
  // a âncora acompanha o tokens.css
  const outro = tokensCss.replace('--tt-bg-card:#AF4135;', '--tt-bg-card:#B04236;');
  assert.equal(temasFluent(outro).lite.colorNeutralBackground1, '#b04236');
});

test('M22, "Pronto quando": hover, pressionado e selecionado avermelhados no Lite e rosados no Suave, sem cinza', () => {
  const temas = temasFluent(tokensCss);
  const ESTADOS = [
    'colorNeutralBackground1Hover', 'colorNeutralBackground1Pressed', 'colorNeutralBackground1Selected',
    'colorSubtleBackgroundHover', 'colorSubtleBackgroundPressed', 'colorSubtleBackgroundSelected',
    'colorNeutralStroke1Hover', 'colorNeutralStroke1Pressed',
    'colorNeutralStrokeAccessibleHover', 'colorNeutralStrokeAccessiblePressed',
    'colorNeutralForeground3Hover', 'colorNeutralForeground3Pressed',
  ];
  for (const k of ESTADOS) {
    const [, cLite, hLite] = lch(temas.lite[k]);
    const [, cSuave, hSuave] = lch(temas.suave[k]);
    // Lite: os fundos são vermelhos (croma de 0,13 a 0,15, como o cartão); os traços e textos claros, cremes.
    assert.ok(cLite >= (k.includes('Background') ? 0.1 : 0.015), `Lite ${k} ${temas.lite[k]}: croma ${cLite.toFixed(3)}`);
    assert.ok(hLite >= 20 && hLite <= 45, `Lite ${k}: matiz ${hLite.toFixed(0)}°`);
    // Suave: croma baixo como o do próprio tema (o fundo #F6ECE9 tem 0,012), matiz rosado.
    assert.ok(cSuave >= 0.01, `Suave ${k} ${temas.suave[k]}: croma ${cSuave.toFixed(3)}`);
    assert.ok(hSuave >= 20 && hSuave <= 45, `Suave ${k}: matiz ${hSuave.toFixed(0)}°`);
    // e nenhum sobrou igual ao cinza de fábrica
    assert.notEqual(temas.lite[k], createDarkTheme(TOMATE)[k]);
    assert.notEqual(temas.suave[k], createLightTheme(TOMATE)[k]);
  }
  // Nenhum neutro opaco ficou cinza. O branco do Suave vira o cartão (#FFFAF9, croma 0,0055);
  // o preto puro (#000000, só no Suave: o foco de fábrica e véus a 5–50%) fica preto.
  for (const [fonte, base] of [['lite', createDarkTheme(TOMATE)], ['suave', createLightTheme(TOMATE)]]) {
    for (const [k, v] of Object.entries(base)) {
      if (!ehNeutroTingivel(k, v) || !/^#/.test(v)) continue;
      const [L, C, h] = lch(temas[fonte][k]);
      if (fonte === 'suave' && v === '#000000') {
        assert.equal(L < 0.01, true, k);
        continue;
      }
      assert.ok(C >= 0.005 && h >= 20 && h <= 45, `${fonte}: ${k} ${v} → ${temas[fonte][k]} (croma ${C.toFixed(4)}, ${h.toFixed(0)}°)`);
    }
  }
});

test('tintNeutrals: interpola entre as âncoras no OKLab e recusa âncoras que não servem', () => {
  const tema = { colorA: '#202020', colorB: '#808080', colorC: '#ffffff', colorD: 'rgba(128, 128, 128, 0.3)',
    colorE: '#123456', colorNeutralShadowKey: 'rgba(0,0,0,0.28)', colorF: 'transparent', fontSize: '14px' };
  const t = tintNeutrals(tema, [['colorA', '#a5342b'], ['colorC', '#fff8f6']]);
  assert.equal(t.colorA, '#a5342b');
  assert.equal(t.colorC, '#fff8f6');
  const [L, , h] = lch(t.colorB);
  const [La] = srgbParaOklab(lerHex('#a5342b'));
  assert.ok(L > La && L < 0.99 && h > 20 && h < 45, `o meio fica entre o vermelho e o creme (${t.colorB})`);
  assert.match(t.colorD, /^rgba\(\d+, \d+, \d+, 0\.3\)$/);
  assert.equal(t.colorD.replace(/, 0\.3\)$/, ')').replace('rgba', 'rgb'), `rgb(${lerHex(t.colorB).join(', ')})`);
  for (const k of ['colorE', 'colorNeutralShadowKey', 'colorF', 'fontSize']) assert.equal(t[k], tema[k], k);
  assert.throws(() => tintNeutrals(tema, [['colorA', '#a5342b'], ['colorE', '#fff8f6']]), /não é um neutro opaco/);
  assert.throws(() => tintNeutrals({ ...tema, colorG: '#202020' }, [['colorA', '#a5342b'], ['colorG', '#fff8f6']]), /mesmo L/);
});

test('OKLab à mão: valores de referência, ida e volta e croma reduzido fora da gama', () => {
  const perto = (a, b, tol = 2e-4) => a.forEach((v, k) => assert.ok(Math.abs(v - b[k]) < tol, `${a} ≈ ${b}`));
  perto(srgbParaOklab([255, 255, 255]), [1, 0, 0]);
  perto(srgbParaOklab([0, 0, 0]), [0, 0, 0]);
  perto(srgbParaOklab([255, 0, 0]), [0.62796, 0.22486, 0.12585]); // CSS Color 4
  for (const hex of ['#a5342b', '#fff8f6', '#22110e', '#f6ece9', '#123456']) {
    assert.equal(paraHex(oklabParaSrgb(srgbParaOklab(lerHex(hex)))), hex);
  }
  // um vermelho mais saturado que o sRGB: o L e o matiz ficam, o croma cai até caber
  const [L, C, h] = oklabParaOklch([0.6, 0.3, 0.15]);
  const [L2, C2, h2] = oklabParaOklch(srgbParaOklab(oklabParaSrgb([0.6, 0.3, 0.15])));
  assert.ok(Math.abs(L2 - L) < 0.01 && Math.abs(h2 - h) < 2 && C2 < C, `${L2} ${C2} ${h2}`);
});

test('o gerado só tem tokens do Fluent: nenhum --tt-*, nada que feche a regra, sem :root nem html', () => {
  const css = gerarCss(tokensCss);
  const semComentarios = css.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(semComentarios, /--tt-/);
  assert.doesNotMatch(semComentarios, /:root|\bhtml\b|@import|url\(/);
  for (const { decl } of regras(css)) {
    for (const [k, v] of Object.entries(decl)) {
      assert.match(k, /^[a-zA-Z][a-zA-Z0-9]*$/);
      assert.ok(v.length > 0, k);
    }
  }
  assert.match(css, /^\/\* Gerado por scripts\/build-theme-css\.mjs/, 'o arquivo avisa que é gerado');
});

test('a ponte vem depois do gerado e cobre os tokens da seção 4.3 com a mesma especificidade', () => {
  const indexHtml = ler('index.html');
  const links = [...indexHtml.matchAll(/<link rel="stylesheet" href="\/src\/styles\/([^"]+)"/g)].map((m) => m[1]);
  assert.equal(links[0], 'fluent-tokens.gen.css', 'o gerado é a primeira folha, logo depois do script de boot');
  assert.ok(links.indexOf('bridge.css') > links.indexOf('fluent-tokens.gen.css'));
  assert.match(ler('src/styles/bridge.css'), /^\[data-theme\]\{/m, 'a ponte usa [data-theme], (0,1,0), como o gerado');
});

test('escrever(): gera o arquivo que falta, não regrava o que já está em dia e acompanha a rampa', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'tomatito-tokens-'));
  try {
    mkdirSync(join(raiz, 'src/styles'), { recursive: true });
    writeFileSync(join(raiz, 'src/styles/tokens.css'), tokensCss);
    const url = pathToFileURL(raiz + sep);
    assert.equal(existsSync(join(raiz, SAIDA)), false);
    assert.deepEqual({ ...escrever(url), bytes: 0 }, { caminho: SAIDA, mudou: true, bytes: 0 });
    const primeiro = readFileSync(join(raiz, SAIDA), 'utf8');
    assert.equal(primeiro, gerarCss(tokensCss));
    assert.equal(escrever(url).mudou, false);
    writeFileSync(join(raiz, 'src/styles/tokens.css'), tokensCss.replace('--tt-tomato-80:#B8402D;', '--tt-tomato-80:#B8402E;'));
    assert.equal(escrever(url).mudou, true);
    assert.notEqual(readFileSync(join(raiz, SAIDA), 'utf8'), primeiro);
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});

test('a linha de comando grava o arquivo do repositório e diz o que fez', () => {
  const script = fileURLToPath(new URL('./build-theme-css.mjs', import.meta.url));
  const saida = execFileSync(process.execPath, [script], { encoding: 'utf8' });
  assert.match(saida, /^build-theme-css: src\/styles\/fluent-tokens\.gen\.css (gerado|já estava em dia) \(\d+ bytes\)\n$/);
});

test('roda no predev e no prebuild, que o tauri dev e o tauri build chamam; o gerado fica fora do git', () => {
  assert.equal(pkg.scripts.predev, 'node scripts/build-theme-css.mjs');
  assert.equal(pkg.scripts.prebuild, 'node scripts/build-theme-css.mjs');
  const tauri = JSON.parse(ler('src-tauri/tauri.conf.json'));
  assert.equal(tauri.build.beforeDevCommand, 'npm run dev');
  assert.equal(tauri.build.beforeBuildCommand, 'npm run build');
  assert.match(ler('.gitignore'), /^src\/styles\/fluent-tokens\.gen\.css$/m);
  // As prévias e o teste aninhado sobem o Vite sem o npm run dev: geram antes.
  assert.match(ler('scripts/preview/servidor.mjs'), /gerarTokensFluent\(\);\n/);
  assert.match(ler('scripts/gnome-aninhado/rodar.sh'), /node "\$RAIZ\/scripts\/build-theme-css\.mjs"/);
});

test('sem setTheme() do Fluent em runtime: nada do app importa o set-theme nem o @fluentui/tokens', () => {
  // O win.setTheme() do Tauri (tema nativo da janela, 4.6) é outra coisa e continua valendo.
  const src = new URL('../src/', import.meta.url);
  for (const arquivo of readdirSync(src, { recursive: true }).filter((a) => a.endsWith('.js'))) {
    const texto = readFileSync(new URL(arquivo, src), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(texto, /web-components\/theme|set-theme|@fluentui\/tokens|(?<![.\w])setTheme\(/, `src/${arquivo}`);
  }
  assert.ok(pkg.dependencies['@fluentui/tokens'], 'o @fluentui/tokens continua fixado (3.6): agora é o gerador que o usa');
});
