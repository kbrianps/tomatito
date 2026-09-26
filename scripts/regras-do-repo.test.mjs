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
const tomatoHtml = ler('tomato.html');

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
  for (const [arquivo, html] of Object.entries({ 'index.html': indexHtml, 'tomato.html': tomatoHtml })) {
    assert.match(html, /<html lang="pt-BR">/, arquivo);
    assert.doesNotMatch(html, /<style[\s>]/i, arquivo);
    assert.doesNotMatch(html, /\sstyle\s*=/i, arquivo);
  }
});

test('a palavra proibida não aparece no nome, na descrição, no README nem na interface', () => {
  const proibida = new RegExp(['pomo', 'doro'].join(''), 'i');
  const textos = {
    'package.json': ler('package.json'),
    'src-tauri/Cargo.toml': cargoApp,
    'src-tauri/tauri.conf.json': ler('src-tauri/tauri.conf.json'),
    'README.md': ler('README.md'),
    'index.html': indexHtml,
    'tomato.html': tomatoHtml,
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

test('spike A (M04): tomato.html é a segunda entrada do Vite e arrasta pelo .stage', async () => {
  const { default: vite } = await import('../vite.config.js');
  const entradas = Object.values(vite.build.rolldownOptions.input).map((c) => c.split(/[\\/]/).at(-1));
  assert.deepEqual(entradas.sort(), ['index.html', 'tomato.html']);
  assert.match(tomatoHtml, /<div class="stage"[^>]*data-tauri-drag-region="deep"/);
  const cap = JSON.parse(ler('src-tauri/capabilities/tomato.json'));
  assert.deepEqual(cap.windows, ['tomato']);
  assert.ok(cap.permissions.includes('core:window:allow-start-dragging'), 'o arraste precisa de allow-start-dragging');
});

test('spike B (M05): gtk 0.18 só no Linux, e a região entre o build() e o show()', () => {
  const secoes = cargoApp.split(/^\[/m);
  const linux = secoes.find((b) => b.startsWith(`target.'cfg(target_os = "linux")'.dependencies]`));
  assert.ok(linux, 'falta a seção [target.\'cfg(target_os = "linux")\'.dependencies]');
  assert.match(linux, /^gtk = "0\.18"$/m);
  for (const b of secoes.filter((b) => b !== linux)) assert.doesNotMatch(b, /^gtk\s*=/m, 'gtk fora da seção do Linux');

  const tomato = ler('src-tauri/src/window/tomato.rs');
  assert.match(tomato, /\.visible\(false\)/);
  const [build, regiao, show] = ['builder.build()', 'apply_region(&window', 'window.show()'].map((t) => tomato.indexOf(t));
  assert.ok(build >= 0 && build < regiao && regiao < show, 'a região vai depois do build() e antes do show()');

  // Região no GtkWidget; nunca na GdkWindow (PLANO.md, 5.6).
  const linuxRs = ler('src-tauri/src/window/region_linux.rs');
  assert.match(linuxRs, /gw\.input_shape_combine_region\(/);
  assert.doesNotMatch(linuxRs, /\.window\(\)/);
});

test('ninguém chama setIgnoreCursorEvents (apaga a região no Linux; PLANO.md, 5.3)', () => {
  const pastas = { 'src-tauri/src': /set_ignore_cursor_events/, src: /setIgnoreCursorEvents/ };
  for (const [pasta, proibido] of Object.entries(pastas)) {
    for (const arquivo of readdirSync(new URL(`../${pasta}`, import.meta.url), { recursive: true })) {
      if (/\.(rs|js)$/.test(arquivo)) assert.doesNotMatch(ler(`${pasta}/${arquivo}`), proibido, `${pasta}/${arquivo}`);
    }
  }
});
