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

test('build de desenvolvimento com ID próprio (M21b)', () => {
  // O `.dev` tem pasta de dados própria; o de uso diário nunca muda de ID (1.1).
  assert.equal(tauriConf.identifier, 'io.github.kbrianps.tomatito');
  const dev = JSON.parse(ler('src-tauri/tauri.dev.conf.json'));
  assert.deepEqual(dev, { identifier: 'io.github.kbrianps.tomatito.dev' });
  assert.equal(pkg.scripts['dev:app'], 'tauri dev --config src-tauri/tauri.dev.conf.json');
  assert.equal(pkg.scripts['build:debug'], 'tauri build --debug --no-bundle --config src-tauri/tauri.dev.conf.json');
});

test('CSP da seção 3.8 no tauri.conf.json, mais o connect-src do IPC (M08)', () => {
  // O Tauri 2.12 só acrescenta hashes e nonces ao script-src e ao style-src.
  // Sem o connect-src, o fetch do IPC (ipc://localhost no Linux,
  // http://ipc.localhost no Windows) é recusado e cai no postMessage, com um
  // "Refused to connect" no console (docs/decisoes.md, M08).
  assert.equal(
    tauriConf.app.security.csp,
    "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; " +
      "connect-src 'self' ipc: http://ipc.localhost",
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
  // M11: o fluent-tokens.gen.css entra como primeira folha (scripts/build-theme-css.test.mjs).
  for (const folha of ['fluent-tokens.gen.css', 'tokens.css', 'bridge.css', 'fonts.css', 'base.css']) {
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
    '.background_color(background_for(s.resolved_theme))',
    '.visible(false)',
    '.initialization_script(init_script(s))',
  ];
  for (const c of chamadas) assert.ok(main.includes(c), `main_window.rs sem ${c}`);
  assert.match(main, /pub const LABEL: &str = "main";/);
});

// M23: configurações só no Rust (seção 3.3), lidas antes da main (4.7).
test('configurações no Rust: settings_get, settings_set e tt://settings, sem o plugin do store', () => {
  const lib = ler('src-tauri/src/lib.rs');
  assert.match(lib, /SettingsStore::load\(app\.path\(\)\.app_data_dir\(\)\?\)[\s\S]*build_main\(app\.handle\(\), &s\)/,
    'o settings.json é lido antes de a main nascer, e ela recebe as configurações');
  assert.match(lib, /commands::settings_get,\s*commands::settings_set,/);
  // Um generate_context! só (ele embute a página), e o linuxX11 lido antes do Builder.
  assert.equal(lib.match(/generate_context!\(\)/g)?.length, 1);
  assert.match(lib, /usar_x11_se_pedido\(&context\.config\(\)\.identifier\);\s*let builder = tauri::Builder::default\(\);/);
  assert.match(ler('src-tauri/src/events.rs'), /pub const SETTINGS: &str = "tt:\/\/settings";/);
  const ipcJs = ler('src/lib/ipc.js');
  assert.match(ipcJs, /configuracoes: 'tt:\/\/settings'/);
  assert.match(ipcJs, /invoke\('settings_set', \{ patch \}\)/);
  assert.doesNotMatch(ler('src-tauri/Cargo.toml'), /tauri-plugin-store/);
  assert.ok(!pkg.dependencies['@tauri-apps/plugin-store'] && !pkg.devDependencies['@tauri-apps/plugin-store']);
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

// M09: navegação (seções 3.7, 3.8 e o marco M09).
test('navegação: <nav> e <main> vazios no index.html, com a amostra do M06 fora dele (vai para o #/dev)', () => {
  assert.match(indexHtml, /<nav class="tt-nav"><\/nav>\s*<main class="tt-conteudo"><div class="tt-rolagem"><\/div><\/main>/);
  assert.doesNotMatch(indexHtml, /tt-amostra|<fluent-/, 'a amostra mora no src/views/dev-catalog.js');
  const main = ler('src/main.js');
  const telas = main.match(/telas: \{ ([^}]+) \}/);
  assert.ok(telas, 'o main.js passa as telas ao roteador');
  assert.deepEqual(telas[1].split(', '), ['foco', 'temporizador', 'cronometro', 'configuracoes', 'dev']);
  for (const arquivo of ['views/focus/index.js', 'views/timers.js', 'views/stopwatch.js', 'views/settings.js', 'views/dev-catalog.js']) {
    // M16: a Foco aceita um segundo argumento opcional (o store, para os testes).
    assert.match(ler(`src/${arquivo}`), /^export function montar\(raiz(\)|, \{)/m, `${arquivo} exporta montar(raiz)`);
  }
});

test('navegação: medidas do NavigationView e tokens da seção M09 no shell.css e no nav-view.js', () => {
  const css = ler('src/styles/shell.css');
  const regra = (sel) => {
    const m = css.match(new RegExp(`(?:^|\\n)${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\{([^}]*)\\}`));
    assert.ok(m, `falta a regra ${sel}`);
    return m[1];
  };
  assert.match(regra('.tt-nav'), /width:280px/);
  const item = regra('.tt-nav-item');
  assert.match(item, /height:36px/);
  assert.match(item, /margin:2px 4px/);
  assert.match(item, /border-radius:var\(--tt-r-ctl\)/);
  assert.match(regra('.tt-nav-item:hover'), /background:var\(--tt-subtle-hover\)/);
  assert.match(regra('.tt-nav-item[aria-current="page"]'), /background:var\(--tt-subtle-selected\)/);
  const ind = regra('.tt-nav-indicador');
  assert.match(ind, /width:3px; height:16px/);
  assert.match(ind, /background:var\(--tt-nav-indicator\)/);
  const nav = ler('src/components/nav-view.js');
  assert.match(nav, /duration: duracao\('--tt-dur-in'\)/, 'o indicador desliza em --tt-dur-in (250 ms)');
  assert.match(nav, /getPropertyValue\('--tt-ease-point'\)/, 'com --tt-ease-point');
  assert.match(nav, /prefers-reduced-motion: reduce[\s\S]*duracao\('--tt-dur-fast'\)/, 'e vira fade de 83 ms com movimento reduzido');
  assert.doesNotMatch(nav, /\.style\.(?!setProperty)/, 'sem estilo em linha além de variáveis (3.8)');
});

// M10: camada de conteúdo e responsivo.
test('camada de conteúdo: fundo, borda de 1 px em cima e à esquerda, canto de 8 px, e a rolagem por dentro', () => {
  const css = ler('src/styles/shell.css');
  const regra = (sel) => {
    const m = css.match(new RegExp(`(?:^|\\n)${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\{([^}]*)\\}`));
    assert.ok(m, `falta a regra ${sel}`);
    return m[1];
  };
  const camada = regra('.tt-conteudo');
  assert.match(camada, /background:var\(--tt-bg-surface\)/);
  assert.match(camada, /border-top:1px solid var\(--tt-border\); border-left:1px solid var\(--tt-border\)/);
  assert.doesNotMatch(camada, /border-(right|bottom)|border:/, 'sem borda à direita nem embaixo');
  assert.match(camada, /border-top-left-radius:var\(--tt-r-card\)/);
  assert.match(ler('src/styles/tokens.css'), /--tt-r-card:8px;/);
  // A camada é o contêiner das consultas e não rola; quem rola é a .tt-rolagem
  // (docs/decisoes.md, M10): a largura consultada não muda com a barra.
  assert.match(camada, /overflow:hidden/);
  assert.match(camada, /container:conteudo \/ inline-size/);
  assert.match(regra('.tt-rolagem'), /overflow:auto/);
  assert.match(ler('src/main.js'), /raiz: document\.querySelector\('\.tt-rolagem'\)/, 'o roteador desenha as telas na área que rola');
});

test('responsivo: painel compacto de 48 px abaixo de 860 px e grade da Foco em 2 colunas a partir de 560 px de área', () => {
  const css = ler('src/styles/shell.css');
  const bloco = (inicio) => {
    const i = css.indexOf(inicio);
    assert.ok(i >= 0, `falta ${inicio}`);
    let nivel = 0;
    for (let j = css.indexOf('{', i); j < css.length; j++) {
      if (css[j] === '{') nivel++;
      else if (css[j] === '}' && --nivel === 0) return css.slice(i, j + 1);
    }
    throw new Error(`bloco sem fim: ${inicio}`);
  };
  const compacto = bloco('@media (width < 860px){');
  assert.match(compacto, /\.tt-nav\{ width:48px; \}/);
  assert.match(compacto, /\.tt-nav-rotulo\{[^}]*clip-path:inset\(50%\)/, 'o rótulo sai da tela, mas não da árvore de acessibilidade');
  assert.doesNotMatch(compacto, /\.tt-nav-rotulo\{[^}]*display:none/);
  assert.match(compacto, /\.tt-nav-dica\{[^}]*display:block/);
  assert.match(css, /(?:^|\n)\.tt-nav-dica\{ display:none; \}/, 'fora do painel compacto, a dica não existe');
  assert.equal(css.match(/@media \(width < 860px\)/g).length, 1, 'um limite só para o painel');
  const grade = bloco('@container conteudo (width >= 560px){');
  assert.match(grade, /\.tt-foco-grade\{ grid-template-columns:repeat\(2, minmax\(0,1fr\)\); \}/);
  assert.match(css, /\.tt-foco-grade\{[^}]*grid-template-columns:minmax\(0,1fr\)[^}]*gap:var\(--tt-gap\)/, 'uma coluna abaixo, com gap de 16');
  assert.match(ler('src/styles/tokens.css'), /--tt-gap:16px;/);
});

test('caminhos de arquivo nos scripts do Node saem do fileURLToPath e do pathToFileURL (o CI também roda no Windows)', () => {
  // No windows-latest, o .pathname da URL do módulo dá '/D:/a/...', que o Node
  // resolve como 'D:\D:\a\...'; e a URL montada à mão com o prefixo file:// e o
  // caminho interpolado erra com as barras invertidas e os '%' do Windows.
  const scripts = readdirSync(new URL('.', import.meta.url), { recursive: true })
    .filter((arquivo) => /\.m?js$/.test(arquivo) && !arquivo.includes('node_modules'));
  assert.ok(scripts.length > 10);
  for (const arquivo of scripts) {
    const texto = ler(`scripts/${arquivo}`);
    assert.doesNotMatch(texto, /import\.meta\.url\)\s*\.pathname/, `scripts/${arquivo}: use fileURLToPath(new URL(...))`);
    assert.doesNotMatch(texto, /['"`]file:\/\/\$\{/, `scripts/${arquivo}: use pathToFileURL(caminho)`);
  }
});

// M12: controles Fluent e posicionamento.
test('controles do M12: o #/dev tem todos os componentes Fluent da seção 1.1, e a ponte e o controls.css os ajustam ao tema', () => {
  const catalogo = ler('src/views/dev-catalog.js');
  const usados = new Set([...catalogo.matchAll(/<(fluent-[a-z-]+)/g)].map((m) => m[1]));
  for (const tag of [
    'fluent-switch', 'fluent-radio-group', 'fluent-radio', 'fluent-checkbox', 'fluent-dropdown', 'fluent-listbox',
    'fluent-option', 'fluent-dialog', 'fluent-dialog-body', 'fluent-menu', 'fluent-menu-list', 'fluent-menu-item', 'fluent-tooltip',
  ]) {
    assert.ok(usados.has(tag), `o catálogo não mostra <${tag}>`);
  }
  assert.equal((catalogo.match(/<fluent-menu[\s>]/g) ?? []).length, 2, 'dois menus: cada um precisa abrir no próprio botão');
  // Um import por arquivo, com o especificador do pacote (e não o define-all).
  const main = ler('src/main.js');
  assert.doesNotMatch(main, /web-components\/(?:define-all|web-components(?:-all)?(?:\.min)?)\.js|from '@fluentui\/web-components'/);
  for (const nome of ['checkbox', 'dropdown', 'listbox', 'option', 'dialog', 'dialog-body', 'menu', 'menu-list', 'menu-item', 'tooltip']) {
    assert.match(main, new RegExp(`^import '@fluentui/web-components/${nome}\\.js';$`, 'm'));
  }
  // Ponte: a borda do checkbox marcado no hover e no clique, e o texto dos
  // itens de menu e das opções (3,98:1 no Lite com o cinza do Fluent).
  const ponte = ler('src/styles/bridge.css');
  for (const [token, tt] of [
    ['colorCompoundBrandStrokeHover', 'tt-accent-hover'],
    ['colorCompoundBrandStrokePressed', 'tt-accent-pressed'],
    ['colorNeutralForeground2', 'tt-fg-1'],
    ['colorNeutralForeground2Hover', 'tt-fg-1'],
    ['colorNeutralForeground2Pressed', 'tt-fg-2-on-ctl'],
  ]) {
    assert.match(ponte, new RegExp(`--${token}:var\\(--${tt}\\);`), `a ponte liga --${token} a --${tt}`);
  }
  const controles = ler('src/styles/controls.css');
  assert.match(controles, /fluent-dropdown > button\[slot="control"\]\{ all:unset; flex:1 1 auto; \}/, 'o botão de dentro do dropdown não recebe o estilo de button');
  assert.match(controles, /fluent-listbox,fluent-menu-list,fluent-tooltip\{ border-color:var\(--tt-border\); \}/);
  assert.match(controles, /fluent-dialog\{ --dialog-backdrop:var\(--tt-smoke\); \}/);
  // Esc numa lista aberta fecha só a lista (keys.js), ligado no main.js.
  assert.match(main, /^ {2}ligarEscDasListas\(\);$/m);
});

// M13: botões próprios, foco e ícones.
test('botões do M13 no controls.css: padrão, destaque, sutil, circular, desabilitados e o anel duplo', () => {
  const css = ler('src/styles/controls.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const regras = [...css.matchAll(/(^|\n)([^{}\n@][^{}]*?)\{([^}]*)\}/g)].map((m) => ({ sel: m[2].trim(), corpo: m[3] }));
  const regra = (sel) => {
    const r = regras.find((x) => x.sel === sel);
    assert.ok(r, `falta a regra ${sel}`);
    return r.corpo;
  };
  const indice = (sel) => regras.findIndex((x) => x.sel === sel);
  const base = regra('button');
  assert.match(base, /height:32px/);
  assert.match(base, /border-radius:var\(--tt-r-ctl\)/);
  assert.match(base, /background:var\(--tt-ctl\)/);
  assert.match(base, /border:1px solid var\(--tt-ctl-stroke-top\); border-bottom-color:var\(--tt-ctl-stroke-bottom\)/);
  assert.match(regra('button:hover'), /background:var\(--tt-ctl-hover\)/);
  assert.match(regra('button:active'), /background:var\(--tt-ctl-press\)/);
  assert.match(regra('button.tt-accent'), /background:var\(--tt-accent\); color:var\(--tt-fg-on-accent\)/);
  assert.match(regra('button.tt-accent:disabled'), /background:var\(--tt-accent-disabled\)/);
  assert.match(regra('button.tt-sutil'), /width:32px/);
  assert.match(regra('button.tt-sutil'), /background:transparent/);
  assert.match(regra('button.tt-sutil:hover'), /background:var\(--tt-subtle-hover\)/);
  assert.match(regra('button.tt-circular'), /width:32px[\s\S]*border-radius:50%/);
  assert.match(regra('button.tt-circular.tt-grande'), /width:64px; height:64px/);
  assert.match(regra('button:disabled'), /color:var\(--tt-fg-disabled\)/);
  // O desabilitado vence o hover e o pressionado pela ordem (mesma especificidade).
  for (const [antes, depois] of [
    ['button:hover', 'button:disabled'],
    ['button:active', 'button:disabled'],
    ['button.tt-accent:hover', 'button.tt-accent:disabled'],
    ['button.tt-sutil:hover', 'button.tt-sutil:disabled'],
  ]) {
    assert.ok(indice(antes) < indice(depois), `${depois} precisa vir depois de ${antes}`);
  }
  // Anel duplo: 2 px de --tt-focus-outer por fora e 1 px de --tt-focus-inner colado ao botão.
  const foco = regra('button:focus-visible');
  assert.match(foco, /outline:2px solid var\(--tt-focus-outer\); outline-offset:1px/);
  assert.match(foco, /box-shadow:0 0 0 1px var\(--tt-focus-inner\)/);
  assert.match(ler('src/styles/bridge.css'), /--tt-focus-outer:var\(--tt-fg-1\); --tt-focus-inner:var\(--tt-bg-card\);/);
  // Nenhuma regra de botão vence a do botão de dentro do fluent-dropdown (0,1,2): sem :not().
  for (const { sel } of regras.filter((r) => /^button/.test(r.sel))) assert.doesNotMatch(sel, /:not\(/, sel);
});

test('desabilitados e foco dos componentes Fluent pela ponte (M13)', () => {
  const ponte = ler('src/styles/bridge.css');
  for (const [token, tt] of [
    ['colorNeutralBackgroundDisabled', 'tt-ctl'],
    ['colorNeutralForegroundDisabled', 'tt-fg-disabled'],
    ['colorNeutralStrokeDisabled', 'tt-fg-disabled'],
    ['colorStrokeFocus1', 'tt-focus-inner'],
  ]) {
    assert.match(ponte, new RegExp(`--${token}:var\\(--${tt}\\);`), `a ponte liga --${token} a --${tt}`);
  }
  const controles = ler('src/styles/controls.css');
  assert.match(controles, /fluent-menu-item\[disabled\]\{ background:transparent; \}/);
  assert.match(controles, /fluent-dropdown\[disabled\]\{ --colorNeutralBackgroundDisabled:transparent; \}/);
  assert.match(controles, /\.tt-opcao:has\(> :is\(\[disabled\], :disabled\)\)/);
});

test('ícones só da pasta copiada: nada do @fluentui/svg-icons no código do app', () => {
  const semComentarios = (texto) => texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const { arquivo, texto } of jsDoApp) {
    assert.doesNotMatch(semComentarios(texto), /@fluentui\/svg-icons/, `${arquivo} importa do pacote de ícones`);
  }
  for (const arquivo of readdirSync(new URL('../src', import.meta.url), { recursive: true })) {
    if (/\.(css|html)$/.test(arquivo)) assert.doesNotMatch(ler(`src/${arquivo}`), /svg-icons/, `src/${arquivo}`);
  }
  assert.doesNotMatch(indexHtml, /svg-icons/);
  const icon = ler('src/components/icon.js');
  assert.match(icon, /import\.meta\.glob\('\.\.\/assets\/icons\/\*\.svg', \{ query: '\?raw', import: 'default', eager: true \}\)/);
  assert.ok(pkg.devDependencies['@fluentui/svg-icons'], 'o pacote continua só em devDependencies');
  assert.equal(pkg.dependencies['@fluentui/svg-icons'], undefined);
  // Todo ícone pedido no código existe na pasta.
  const disponiveis = new Set(readdirSync(new URL('../src/assets/icons', import.meta.url)).map((a) => a.replace(/_\d+_(regular|filled)\.svg$/, '')));
  for (const { arquivo, texto } of jsDoApp) {
    for (const m of texto.matchAll(/icone\('([a-z_]+)'/g)) assert.ok(disponiveis.has(m[1]), `${arquivo}: ícone ${m[1]} fora da pasta`);
  }
  for (const { rota, icone: nome } of [{ icone: 'target' }, { icone: 'hourglass_half' }, { icone: 'timer' }, { icone: 'settings' }]) {
    assert.ok(disponiveis.has(nome), rota);
  }
});

test('dica dos botões só de ícone: ligada no main.js, e todo data-dica do catálogo com aria-label', () => {
  assert.match(ler('src/main.js'), /^ {2}ligarDicas\(\);$/m);
  const catalogo = ler('src/views/dev-catalog.js');
  const comDica = [...catalogo.matchAll(/<button[^>]*data-dica[^>]*>/g)].map((m) => m[0]);
  assert.ok(comDica.length >= 1);
  for (const b of comDica) assert.match(b, /aria-label="[^"]+"/, b);
  assert.ok((catalogo.match(/deIcone\(/g) ?? []).length >= 12, 'os botões de ícone do catálogo');
  const css = ler('src/styles/controls.css');
  assert.match(css, /\.tt-dica\{[^}]*position-anchor:--tt-dica-alvo; position-area:block-start; position-try-fallbacks:flip-block;/);
  assert.match(ler('src/components/dica.js'), /export const ANCORA = '--tt-dica-alvo';/);
  assert.match(ler('src/components/dica.js'), /setAttribute\('popover', 'manual'\)/, 'popover manual: não fecha um menu aberto');
  assert.doesNotMatch(ler('src/components/dica.js'), /\.style\.(?!setProperty|removeProperty)/, 'sem estilo em linha além do anchor-name (3.8)');
});
