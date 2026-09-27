// M11: tokens do Fluent gerados no build (PLANO.md, 4.5). O gerador é testado
// em memória e numa pasta temporária, sem depender do arquivo gerado no
// repositório (que fica fora do git). A troca de tema na página de verdade é
// conferida pelo scripts/preview/temas-fluent.mjs e pelo roteiro
// scripts/gnome-aninhado/roteiros/temas-fluent.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDarkTheme, createLightTheme } from '@fluentui/tokens';
import { escrever, gerarCss, lerRampa, SAIDA } from './build-theme-css.mjs';

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

test('M11: light e suave recebem o createLightTheme; dark, lite e full, o createDarkTheme, sem tingir', () => {
  const r = regras(gerarCss(tokensCss));
  assert.equal(r.length, 2, 'um bloco por tema do Fluent');
  assert.deepEqual(r[0].seletores, ['[data-theme="light"]', '[data-theme="suave"]']);
  assert.deepEqual(r[1].seletores, ['[data-theme="dark"]', '[data-theme="lite"]', '[data-theme="full"]']);
  const claro = createLightTheme(TOMATE);
  const escuro = createDarkTheme(TOMATE);
  for (const [bloco, tema] of [[r[0].decl, claro], [r[1].decl, escuro]]) {
    assert.deepEqual(Object.keys(bloco), Object.keys(tema), 'os mesmos tokens, na mesma ordem');
    for (const [k, v] of Object.entries(tema)) assert.equal(bloco[k], String(v), k);
  }
  assert.ok(Object.keys(claro).length > 400, `cerca de 470 tokens por tema (${Object.keys(claro).length})`);
  // Os valores que a ponte não cobre e que o M06 anotou (docs/decisoes.md, M06, item 5).
  assert.equal(r[1].decl.colorNeutralForegroundInverted, '#242424');
  assert.equal(r[0].decl.colorNeutralForegroundInverted, '#ffffff');
  assert.equal(r[0].decl.borderRadiusCircular, '10000px');
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
    const url = new URL(`file://${raiz}/`);
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
  const script = new URL('./build-theme-css.mjs', import.meta.url).pathname;
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
