// Regras do repositório que valem desde o M02 (PLANO.md, 1.1, 3.6 e 3.8).
// Rodam no `npm test` junto com os testes do JS que vierem depois.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const ler = (caminho) => readFileSync(new URL(`../${caminho}`, import.meta.url), 'utf8');

const pkg = JSON.parse(ler('package.json'));
const cargoApp = ler('src-tauri/Cargo.toml');
const tauriConf = JSON.parse(ler('src-tauri/tauri.conf.json'));
const indexHtml = ler('index.html');

test('dependências npm com versão exata (sem ^, ~ nem faixas)', () => {
  const exata = /^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/;
  for (const grupo of ['dependencies', 'devDependencies']) {
    for (const [nome, versao] of Object.entries(pkg[grupo] ?? {})) {
      assert.match(versao, exata, `${grupo}.${nome} = "${versao}"`);
    }
  }
});

test('crates do Tauri fixados com "=" e no mesmo major.minor dos pacotes @tauri-apps/*', () => {
  const versaoCrate = (nome) => {
    const m = cargoApp.match(new RegExp(`^${nome}\\s*=\\s*\\{[^}]*version\\s*=\\s*"=(\\d+\\.\\d+)\\.\\d+"`, 'm'));
    assert.ok(m, `${nome} precisa de version = "=x.y.z" no src-tauri/Cargo.toml`);
    return m[1];
  };
  versaoCrate('tauri-build');
  const tauri = versaoCrate('tauri');
  const majorMinor = (v) => v.split('.').slice(0, 2).join('.');
  assert.equal(majorMinor(pkg.dependencies['@tauri-apps/api']), tauri);
  assert.equal(majorMinor(pkg.devDependencies['@tauri-apps/cli']), tauri);
});

test('a versão vive só no Cargo.toml', () => {
  assert.equal(tauriConf.version, undefined, 'tauri.conf.json não pode ter "version"');
  assert.equal(pkg.version, undefined, 'package.json não precisa de "version"');
});

test('CSP da seção 3.8 no tauri.conf.json', () => {
  assert.equal(
    tauriConf.app.security.csp,
    "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'",
  );
});

test('HTML em pt-BR, sem <style> nem style="..." (senão o nonce anula o unsafe-inline)', () => {
  assert.match(indexHtml, /<html lang="pt-BR"[\s>]/);
  assert.doesNotMatch(indexHtml, /<style[\s>]/i);
  assert.doesNotMatch(indexHtml, /\sstyle\s*=/i);
});

test('a palavra proibida não aparece no nome, na descrição, no README nem na interface', () => {
  const proibida = new RegExp(['pomo', 'doro'].join(''), 'i');
  const textos = {
    'package.json': ler('package.json'),
    'src-tauri/Cargo.toml': cargoApp,
    'src-tauri/tauri.conf.json': ler('src-tauri/tauri.conf.json'),
    'README.md': ler('README.md'),
    'index.html': indexHtml,
  };
  for (const arquivo of readdirSync(new URL('../src', import.meta.url), { recursive: true })) {
    if (/\.(js|html|css)$/.test(arquivo)) textos[`src/${arquivo}`] = ler(`src/${arquivo}`);
  }
  for (const [arquivo, texto] of Object.entries(textos)) {
    assert.doesNotMatch(texto, proibida, arquivo);
  }
});

test('CI do M03: Linux e Windows, com os seis passos na ordem do plano', () => {
  const ci = ler('.github/workflows/ci.yml');
  assert.match(ci, /^on:\s*\n\s+push:/m, 'o CI roda em todo push');
  assert.match(ci, /os: \[ubuntu-24\.04, windows-latest\]/);
  assert.doesNotMatch(ci, /ubuntu-22\.04\b(?! fica de fora)/, 'ubuntu-22.04 está sendo descontinuado');
  for (const acao of ['actions/checkout@v7', 'actions/setup-node@v7', 'Swatinem/rust-cache@v2']) {
    assert.ok(ci.includes(`uses: ${acao}\n`), `usa ${acao}`);
  }
  assert.ok(ci.includes("workspaces: 'src-tauri -> target'"));
  const passos = [
    'run: npm ci',
    'run: npm run build',
    'run: cargo fmt --all --check',
    'run: cargo clippy --workspace -- -D warnings',
    'run: cargo test --workspace',
    'run: npm test',
  ];
  const posicoes = passos.map((p) => ci.indexOf(p));
  posicoes.forEach((pos, i) => assert.notEqual(pos, -1, `falta "${passos[i]}"`));
  assert.deepEqual([...posicoes].sort((a, b) => a - b), posicoes, 'passos fora da ordem');
  for (const p of passos.slice(2, 5)) {
    const antes = ci.slice(0, ci.indexOf(p)).trimEnd().split('\n').at(-1);
    assert.match(antes, /working-directory: src-tauri$/, `"${p}" roda em src-tauri`);
  }
});

test('manifesto do Windows (Common Controls v6) que o build.rs passa ao linker', () => {
  const manifesto = ler('src-tauri/windows-app-manifest.xml');
  assert.match(manifesto, /name="Microsoft\.Windows\.Common-Controls"\s+version="6\.0\.0\.0"/);
  const build = ler('src-tauri/build.rs');
  assert.match(build, /WindowsAttributes::new_without_app_manifest\(\)/);
  assert.match(build, /\/MANIFESTINPUT:/);
});

// M06: folhas de estilo, componentes Fluent e fonte (seções 3.7, 4.2 e 1.1).
const jsDoApp = readdirSync(new URL('../src', import.meta.url), { recursive: true })
  .filter((arquivo) => arquivo.endsWith('.js'))
  .map((arquivo) => ({ arquivo: `src/${arquivo}`, texto: ler(`src/${arquivo}`) }));

test('folhas de estilo como <link> no index.html, na ordem da seção 4.2, e nunca por import no JS', () => {
  const ordem = ['fluent-tokens.gen.css', 'tokens.css', 'bridge.css', 'fonts.css', 'base.css', 'shell.css', 'controls.css'];
  const links = [...indexHtml.matchAll(/<link rel="stylesheet" href="\/src\/styles\/([^"]+)"/g)].map((m) => m[1]);
  for (const folha of ['tokens.css', 'bridge.css', 'fonts.css', 'base.css']) {
    assert.ok(links.includes(folha), `falta o <link> do ${folha}`);
  }
  assert.deepEqual(links, ordem.filter((folha) => links.includes(folha)), 'ordem diferente da seção 4.2');
  const head = indexHtml.slice(0, indexHtml.indexOf('</head>'));
  assert.equal(links.length, [...head.matchAll(/<link rel="stylesheet"/g)].length, 'todas as folhas ficam no <head>');
  for (const { arquivo, texto } of jsDoApp) {
    assert.doesNotMatch(texto, /import\s*['"][^'"]+\.css['"]/, `${arquivo} importa CSS (no dev, entraria depois do script)`);
  }
});

test('todo fluent-* usado tem o seu import (o base.css esconde o que não foi definido)', () => {
  const importados = new Set();
  for (const { texto } of jsDoApp) {
    for (const m of texto.matchAll(/['"]@fluentui\/web-components\/([a-z-]+)\.js['"]/g)) importados.add(`fluent-${m[1]}`);
  }
  const usados = new Set();
  for (const texto of [indexHtml, ...jsDoApp.map((j) => j.texto)]) {
    for (const m of texto.matchAll(/<(fluent-[a-z-]+)/g)) usados.add(m[1]);
  }
  assert.ok(usados.size > 0);
  for (const tag of usados) assert.ok(importados.has(tag), `<${tag}> sem import de @fluentui/web-components/${tag.slice(7)}.js`);
  assert.match(ler('src/styles/base.css'), /:not\(:defined\)\s*\{\s*visibility:\s*hidden;?\s*\}/);
});

test('fonts.css só com a Inter latin e latin-ext em opsz (sem cirílico, grego nem vietnamita)', () => {
  const css = ler('src/styles/fonts.css');
  const urls = [...css.matchAll(/url\("([^"]+)"\)/g)].map((m) => m[1]).sort();
  assert.deepEqual(urls, [
    '@fontsource-variable/inter/files/inter-latin-ext-opsz-normal.woff2',
    '@fontsource-variable/inter/files/inter-latin-opsz-normal.woff2',
  ]);
  assert.doesNotMatch(css, /@import/);
  for (const { arquivo, texto } of jsDoApp) {
    assert.doesNotMatch(texto, /@fontsource/, `${arquivo} importa o pacote inteiro da fonte`);
  }
  assert.ok(pkg.dependencies['@fontsource-variable/inter'], 'a fonte vem do @fontsource-variable/inter');
});

// M07: janela main criada em Rust e barra de título própria (seções 3.4, 3.8 e 4.7).
test('nenhuma janela no tauri.conf.json: a main nasce no setup, com o builder da seção 4.7', () => {
  assert.deepEqual(tauriConf.app.windows, [], 'app.windows precisa ser []');
  const lib = ler('src-tauri/src/lib.rs');
  assert.match(lib, /\.setup\(\|app\|[\s\S]*main_window::build_main\(/);
  const main = ler('src-tauri/src/window/main_window.rs');
  const chamadas = [
    'WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("index.html".into()))',
    '.title("Tomatito")',
    '.inner_size(1000.0, 700.0)',
    '.min_inner_size(480.0, 500.0)',
    '.decorations(false)',
    '.shadow(true)',
    '.zoom_hotkeys_enabled(true)',
    '.background_color(background_for(prefs.resolved_theme))',
    '.visible(false)',
    '.initialization_script(init_script(prefs))',
  ];
  for (const c of chamadas) assert.ok(main.includes(c), `main_window.rs sem ${c}`);
  assert.match(main, /pub const LABEL: &str = "main";/);
});

test('capabilities/main.json com as permissões da seção 3.8, só para a main', () => {
  const arquivos = readdirSync(new URL('../src-tauri/capabilities', import.meta.url)).sort();
  assert.ok(!arquivos.includes('default.json'), 'o default.json do template sai');
  const cap = JSON.parse(ler('src-tauri/capabilities/main.json'));
  assert.deepEqual(cap.windows, ['main']);
  assert.deepEqual([...cap.permissions].sort(), [
    'core:default',
    'core:webview:allow-set-webview-zoom',
    'core:window:allow-close',
    'core:window:allow-hide',
    'core:window:allow-minimize',
    'core:window:allow-set-focus',
    'core:window:allow-set-theme',
    'core:window:allow-show',
    'core:window:allow-start-dragging',
    'core:window:allow-toggle-maximize',
  ]);
});

test('barra de título: região de arraste no index.html, borda do Linux e glifos sem fonte de ícones', () => {
  assert.match(indexHtml, /<div class="tt-titlebar" data-tauri-drag-region="deep"><\/div>/);
  const shell = ler('src/styles/shell.css');
  assert.match(shell, /\[data-platform="linux"\] \.tt-janela::after\{[^}]*border:1px solid var\(--tt-border\)/);
  assert.match(shell, /\.tt-caption-btn\{[^}]*width:46px; height:32px;/);
  assert.match(shell, /\.tt-caption-fechar:hover\{ background:var\(--tt-caption-close\); color:#FFFFFF; \}/);
  // Os glifos da barra são desenho próprio (PLANO.md, 9): nada das fontes da
  // Microsoft fora dos comentários (que explicam justamente isso).
  const fontesProibidas = /Segoe (Fluent Icons|MDL2 Assets)/i;
  const semComentarios = (texto) =>
    texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const arquivo of readdirSync(new URL('../src', import.meta.url), { recursive: true })) {
    if (/\.(js|css|html)$/.test(arquivo)) {
      assert.doesNotMatch(semComentarios(ler(`src/${arquivo}`)), fontesProibidas, `src/${arquivo}`);
    }
  }
  assert.doesNotMatch(semComentarios(indexHtml), fontesProibidas);
});
