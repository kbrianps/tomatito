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
  // M26: a pasta de dados é lida uma vez (`dados`) e serve ao stats.sqlite também.
  assert.match(lib, /let dados = app\.path\(\)\.app_data_dir\(\)\?;[\s\S]*SettingsStore::load\(dados(?:\.clone\(\))?\)[\s\S]*build_main\(app\.handle\(\), &s\)/,
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

// M36: bandeja pela feature do Tauri (3.6), fechar para a bandeja (3.4).
test('bandeja: tray-icon e image-png, ícone depois do motor e CloseRequested só esconde', () => {
  assert.match(ler('src-tauri/Cargo.toml'), /^tauri = \{ version = "=2\.12\.0", features = \["tray-icon", "image-png"\] \}$/m);
  const lib = ler('src-tauri/src/lib.rs');
  assert.match(lib, /tray::Bandeja::new\([\s\S]*engine::Engine::new\([\s\S]*bandeja\.criar_icone\(/,
    'a bandeja nasce antes do motor, e o ícone depois dele');
  assert.match(lib, /WindowEvent::CloseRequested \{ api, \.\. \}[\s\S]*fechar_para_bandeja\(window\)[\s\S]*api\.prevent_close\(\);/);
  const tray = ler('src-tauri/src/tray.rs');
  // Nada de texto solto: os itens vêm do i18n.rs (3.8).
  const codigo = tray.split('#[cfg(test)]')[0].split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  assert.doesNotMatch(codigo, /"(Iniciar|Pausar|Retomar) foco"|"Mostrar Tomatito"/);
  assert.match(tray, /run_on_main_thread\(move \|\|/, 'a bandeja posta na thread principal, sem esperar');
  const i18n = ler('src-tauri/src/i18n.rs');
  for (const txt of ['Iniciar foco', 'Pausar foco', 'Mostrar Tomatito', 'Sair']) assert.ok(i18n.includes(`"${txt}"`), txt);
  // "Mostrar Tomatito" segue a 3.4: show, unminimize e set_focus na main.
  assert.match(ler('src-tauri/src/window/mod.rs'), /w\.show\(\);\s*let _ = w\.unminimize\(\);\s*let _ = w\.set_focus\(\);/);
});

// M26: estatísticas no SQLite do Rust (3.3), sem o tauri-plugin-sql.
test('estatísticas: rusqlite com bundled, banco aberto antes do motor e stats_get registrado', () => {
  const cargo = ler('src-tauri/Cargo.toml');
  assert.match(cargo, /^rusqlite = \{ version = "=0\.40\.2", features = \["bundled"\] \}$/m);
  assert.doesNotMatch(cargo, /tauri-plugin-sql/);
  assert.ok(!pkg.dependencies['@tauri-apps/plugin-sql'] && !pkg.devDependencies['@tauri-apps/plugin-sql']);
  const lib = ler('src-tauri/src/lib.rs');
  assert.match(lib, /stats::Stats::open\(&dados\)[\s\S]*engine::Engine::new\(/, 'o banco abre antes do motor');
  assert.match(lib, /TauriSink::new\(\s*app\.handle\(\)\.clone\(\),\s*som,\s*stats,/);
  assert.match(lib, /commands::stats_get,/);
  // Os dias ficam no núcleo, com o jiff; o app não calcula datas por conta própria.
  assert.match(ler('src-tauri/tomatito-core/src/days.rs'), /use jiff::/);
  assert.match(ler('src-tauri/src/stats.rs'), /PRAGMA user_version|"user_version"/);
  assert.match(ler('src/lib/ipc.js'), /invoke\('stats_get'\)/);
});

// M29: as tarefas na tabela `tasks` do mesmo stats.sqlite, com os comandos task_* da 3.5.
test('tarefas: tasks.rs no banco das estatísticas e os quatro comandos task_* registrados', () => {
  const lib = ler('src-tauri/src/lib.rs');
  assert.match(lib, /^mod tasks;$/m);
  for (const c of ['task_list', 'task_add', 'task_complete', 'task_delete']) {
    assert.match(lib, new RegExp(`commands::${c},`), `${c} registrado`);
    assert.match(ler('src-tauri/src/commands.rs'), new RegExp(`pub fn ${c}\\(`));
  }
  const tasks = ler('src-tauri/src/tasks.rs');
  assert.match(tasks, /impl Stats \{/, 'as tarefas usam a conexão do stats.sqlite');
  assert.match(tasks, /done_at IS NULL OR done_at >= \?1/, 'as concluídas saem na virada do dia');
  const ipcJs = ler('src/lib/ipc.js');
  assert.match(ipcJs, /invoke\('task_list'\)/);
  assert.match(ipcJs, /invoke\('task_add', \{ title: titulo \}\)/);
  assert.match(ipcJs, /invoke\('task_complete', \{ id, done: feita \}\)/);
  assert.match(ipcJs, /invoke\('task_delete', \{ id \}\)/);
});

// M30: o cartão "Tarefas" na tela Foco, e a tarefa escolhida indo no focus_start.
test('cartão Tarefas: card-tasks.js ligado na tela Foco e a escolhida no focus_start', () => {
  const index = ler('src/views/focus/index.js');
  assert.match(index, /import \* as tarefas from '\.\/card-tasks\.js';/);
  assert.match(index, /tarefas\.ligar\(raiz\.querySelector\('\[data-cartao="tarefas"\]'\)/);
  assert.match(index, /sessao\.ligar\(.*\{ icone, tarefa: tarefas\.escolhida \}\)/);
  assert.match(ler('src/views/focus/card-session.js'), /store\.comando\('iniciar', sel\.valor, \{ pularIntervalos: marcado\(\), tarefa: tarefa\(\) \?\? null \}\)/);
  const cartao = ler('src/views/focus/card-tasks.js');
  // O título vem do usuário: só entra no HTML escapado.
  assert.match(cartao, /\$\{escapar\(tarefa\.title\)\}/);
  assert.doesNotMatch(cartao.replace(/escapar\(tarefa\.title\)/g, ''), /\$\{[^}]*\.title\b/);
  assert.doesNotMatch(cartao, /Pomodoro/i);
});

// M32: os temporizadores do núcleo no motor do app, os seis comandos timer_*
// da 3.5 registrados, o tt://timers e o fim com o som de fim de foco.
test('temporizadores: comandos timer_*, tt://timers e o fim com som e notificação', () => {
  const lib = ler('src-tauri/src/lib.rs');
  const comandos = ler('src-tauri/src/commands.rs');
  const ipcJs = ler('src/lib/ipc.js');
  for (const c of ['timer_create', 'timer_update', 'timer_delete', 'timer_start', 'timer_pause', 'timer_reset']) {
    assert.match(lib, new RegExp(`commands::${c},`), `${c} registrado`);
    assert.match(comandos, new RegExp(`pub fn ${c}\\(`));
    assert.match(ipcJs, new RegExp(`invoke\\('${c}'`), `${c} no ipc.js`);
  }
  assert.match(ler('src-tauri/src/events.rs'), /pub const TIMERS: &str = "tt:\/\/timers";/);
  assert.match(ipcJs, /temporizadores: 'tt:\/\/timers'/);
  const motor = ler('src-tauri/src/engine.rs');
  assert.match(motor, /impl<S: Sink> CountdownEffects for TimersOutbox/);
  assert.match(motor, /if !ended\.late \{\s*self\.sink\.sound\(Sound::FocusEnd\);/);
  assert.match(motor, /Timers::with_defaults\(\)/);
  const tela = ler('src/views/timers.js');
  assert.match(tela, /store\.comandoDoTemporizador\(comando, id\)/);
  assert.doesNotMatch(tela, /Pomodoro/i);
  // O nome vem do usuário: só entra no HTML escapado.
  assert.match(tela, /\$\{esc\(titulo\(tm\)\)\}/);
});

// M33: criar, editar e excluir pela barra e pelo diálogo, e a lista gravada
// no state.json pelo persist.rs a cada transição (3.3).
test('temporizadores: barra, diálogo e state.json gravado pelo persist.rs a cada transição', () => {
  const estado = ler('src-tauri/src/state_file.rs');
  assert.match(estado, /pub const FILE: &str = "state\.json";/);
  assert.match(estado, /pub const SCHEMA_VERSION: u32 = 1;/);
  assert.match(estado, /crate::persist::write_json_atomic\(/, 'gravação atômica');
  assert.match(ler('src-tauri/src/lib.rs'), /^mod state_file;$/m);
  assert.match(ler('src-tauri/src/lib.rs'), /state_file::StateStore::new\(&dados\)/);
  // O tt://timers sai a cada transição, nunca a cada tick; a gravação vai junto.
  assert.match(ler('src-tauri/src/engine.rs'), /self\.emit\(events::TIMERS, timers\);\s*(\/\/[^\n]*\n\s*)*self\.estado\.save_timers\(timers\);/);
  const tela = ler('src/views/timers.js');
  assert.match(tela, /comandoDoTemporizador\('criar', nome, duracaoMs\)/);
  assert.match(tela, /comandoDoTemporizador\('editar', id, nome, duracaoMs\)/);
  assert.match(tela, /comandoDoTemporizador\('excluir', id\)/);
  const dialogo = ler('src/views/timer-dialog.js');
  assert.match(dialogo, /value="\$\{esc\(tm\?\.name \?\? ''\)\}"/, 'o nome só entra escapado');
  assert.doesNotMatch(dialogo + tela, /Pomodoro/i);
});

// M34: o cronômetro do núcleo (started_at mais o acumulado) no motor do app,
// os quatro comandos stopwatch_* da 3.5, o tt://stopwatch e a gravação no
// state.json a cada transição; na tela, o número em clamp(68px, 8vw, 110px)
// e os três botões circulares de 64 px.
test('cronômetro: comandos stopwatch_*, tt://stopwatch, state.json e a tela', () => {
  const lib = ler('src-tauri/src/lib.rs');
  const comandos = ler('src-tauri/src/commands.rs');
  const ipcJs = ler('src/lib/ipc.js');
  for (const c of ['stopwatch_start', 'stopwatch_pause', 'stopwatch_lap', 'stopwatch_reset']) {
    assert.match(lib, new RegExp(`commands::${c},`), `${c} registrado`);
    assert.match(comandos, new RegExp(`pub fn ${c}\\(`));
    assert.match(ipcJs, new RegExp(`invoke\\('${c}'\\)`), `${c} no ipc.js`);
  }
  assert.match(ler('src-tauri/tomatito-core/src/lib.rs'), /^pub mod stopwatch;$/m);
  assert.match(ler('src-tauri/src/events.rs'), /pub const STOPWATCH: &str = "tt:\/\/stopwatch";/);
  assert.match(ipcJs, /cronometro: 'tt:\/\/stopwatch'/);
  assert.match(ler('src-tauri/src/engine.rs'), /self\.emit\(events::STOPWATCH, stopwatch\);\s*(\/\/[^\n]*\n\s*)*self\.estado\.save_stopwatch\(stopwatch\);/);
  const shell = ler('src/styles/shell.css');
  assert.match(shell, /font-size:clamp\(68px, 8vw, 110px\)/);
  assert.match(shell, /\.tt-cronometro-centesimos\{ font-size:\.7em; \}/);
  const tela = ler('src/views/stopwatch.js');
  assert.equal((tela.match(/botao\(/g) ?? []).length, 3, 'os três botões');
  assert.match(tela, /tt-circular tt-grande/);
  assert.doesNotMatch(tela, /Pomodoro/i);
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

// M50: o tomate definitivo (seções 3.7, 3.8, 4.2, 5.3 e 5.10).
test('tomate: tomato.html em pt-BR, sem estilo em linha, com o boot do index.html e as folhas da 4.2', () => {
  const tomato = ler('tomato.html');
  assert.match(tomato, /<html lang="pt-BR">/);
  assert.doesNotMatch(tomato, /<style[\s>]/i);
  assert.doesNotMatch(tomato, /\sstyle\s*=/i);
  assert.doesNotMatch(tomato, new RegExp(['pomo', 'doro'].join(''), 'i'));
  const boot = (html) => html.match(/<script>([\s\S]*?)<\/script>/)[1];
  assert.equal(boot(tomato), boot(indexHtml), 'o mesmo script de boot (4.7)');
  const links = [...tomato.matchAll(/<link rel="stylesheet" href="\/src\/styles\/([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(links, ['fluent-tokens.gen.css', 'tokens.css', 'bridge.css', 'fonts.css', 'base.css', 'tomato.css']);
  assert.ok(tomato.indexOf('<link') > tomato.indexOf('<script>'), 'as folhas depois do boot');
  // Arraste pelo corpo, pelo texto e pelo cálice (5.10); sombra com a classe .shadowed (ajuste 3).
  assert.match(tomato, /<div class="stage"[^>]*data-tauri-drag-region="deep"/);
  assert.match(tomato, /<g class="shadowed" filter="url\(#f-shadow\)">/);
  assert.equal((tomato.match(/<g class="calyx">[\s\S]*?<\/g>/)[0].match(/<path /g) ?? []).length, 5, 'cinco sépalas');
  assert.match(tomato, /role="timer" aria-live="off"/);
  assert.match(tomato, /aria-live="polite"[^>]*data-anuncio/);
  assert.doesNotMatch(tomato, /<select[\s>]/i, 'sem <select>: o popup do WebView2 não é recortado (5.3)');
  // Os textos saem do catálogo (ajuste 7): os <p> do rosto e os botões nascem vazios.
  for (const m of tomato.matchAll(/<p class="(label|time[^"]*|count)"[^>]*>([^<]*)<\/p>/g)) assert.equal(m[2], '', m[0]);
  assert.doesNotMatch(tomato, /aria-label=|title=/, 'rótulos pelo tomato.js, do catálogo');
});

test('tomate: tomato.css com os tokens --tt-tomato-*, sem as variáveis do protótipo', () => {
  const css = ler('src/styles/tomato.css');
  assert.match(css, /--size:\s*100vw/);
  assert.doesNotMatch(css, /var\(--(body-|ring\b|ring-track|btn-|calyx|stem|shadow|ink|font-ui|font-num)/, 'variáveis do protótipo');
  for (const token of ['--tt-tomato-body-hi', '--tt-tomato-ring', '--tt-tomato-btn-bg', '--tt-tomato-calyx', '--tt-font-display']) {
    assert.ok(css.includes(`var(${token})`), token);
  }
  assert.match(css, /@media \(forced-colors: active\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /\.btn:focus-visible \{\s*outline: 2px solid/);
  const js = ler('src/tomato.js');
  assert.doesNotMatch(js, /\.style\.(?!setProperty|removeProperty)/, 'variáveis dinâmicas só por setProperty (3.8)');
  assert.match(js, /addEventListener\('contextmenu', \(e\) => e\.preventDefault\(\)\)/);
});

test('tomate: duas entradas no Vite, janela da 5.3 e comandos async (M50 e M51)', () => {
  const vite = ler('vite.config.js');
  assert.match(vite, /rolldownOptions:\s*\{\s*input:\s*\{\s*main: entrada\('index\.html'\),\s*tomato: entrada\('tomato\.html'\),/);
  const tomato = ler('src-tauri/src/window/tomato.rs');
  const chamadas = [
    'WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("tomato.html".into()))',
    '.title("Tomatito")',
    '.inner_size(size, size)',
    '.decorations(false)',
    // M52: transparente, salvo no B3 (a janela opaca, com o fundo --tt-tomato-10).
    '.transparent(!opaca)',
    '.shadow(false)',
    '.resizable(false)',
    '.maximizable(false)',
    '.always_on_top(s.tomato_on_top)',
    '.theme(Some(Theme::Dark))',
    '.background_color(fundo)',
    '.visible(false)',
    '.initialization_script(init_script(modo))',
    'builder.no_redirection_bitmap(!opaca)',
  ];
  for (const c of chamadas) assert.ok(tomato.includes(c), `tomato.rs sem ${c}`);
  assert.match(tomato, /let fundo = if opaca \{\s*FUNDO_OPACO\s*\} else \{\s*Color\(0, 0, 0, 0\)\s*\};/);
  assert.match(tomato, /let size = f64::from\(s\.tomato_size\);/);
  const comandos = ler('src-tauri/src/commands.rs');
  assert.match(comandos, /pub async fn switch_window_mode\(app: AppHandle, full: bool\)/, 'criar janela num comando síncrono trava no Windows (5.3)');
  assert.match(comandos, /pub async fn show_main\(/);
  assert.doesNotMatch(comandos, /tomato_debug_open/, 'o comando de debug do M50 saiu no M51');
  const lib = ler('src-tauri/src/lib.rs');
  assert.match(lib, /commands::switch_window_mode,/);
  assert.match(lib, /commands::show_main,/);
  for (const arquivo of ['src-tauri/src/window/tomato.rs', 'src-tauri/src/window/mod.rs', 'src/tomato.js']) {
    assert.doesNotMatch(ler(arquivo), /set_ignore_cursor_events|setIgnoreCursorEvents/, `${arquivo}: nunca (5.3)`);
  }
});

// M51: a troca normal ↔ Full (5.7) e o início direto no Full (4.7).
test('Full: switch_window_mode pelo caminho do settings_set, tt://tomato-ready com limite de 2 s, início só com a tomato', () => {
  const tomato = ler('src-tauri/src/window/tomato.rs');
  assert.match(tomato, /pub const EVENTO_PRONTO: &str = "tt:\/\/tomato-ready";/);
  assert.match(tomato, /pub const ESPERA_DO_PRONTO: Duration = Duration::from_secs\(2\);/);
  // Entrar: grava o tema, cria escondida, espera o pronto, mostra, e só então esconde a main.
  const entrar = tomato.slice(tomato.indexOf('pub async fn entrar('), tomato.indexOf('pub async fn sair('));
  const ordem = (texto, partes) => partes.map((p) => texto.indexOf(p)).every((i, k, a) => i >= 0 && (k === 0 || i > a[k - 1]));
  // M52: o modo do full_mode() e, na primeira entrada em cada combinação, a pergunta no lugar do hide.
  assert.ok(
    ordem(entrar, ['trava.lock().await', 'gravar_tema(app, ThemePref::Full.as_str())', 'let modo = full_mode(&s);', 'criar_e_mostrar(app, &s, modo)', 'chave_a_validar(&s, modo)', 'validacao::perguntar(app, chave)', 'e.esperar_pintura().await', 'm.hide()']),
    'a ordem do "Entrar" (5.7)',
  );
  const criar = tomato.slice(tomato.indexOf('async fn criar_e_mostrar('), tomato.indexOf('pub async fn entrar('));
  assert.ok(ordem(criar, ['esperar_pronto()', 'build_tomato(app, s, modo)', 'Entrada::mostrar(w, rx, t0)']), 'o ouvinte antes da janela');
  const mostrar = tomato.slice(tomato.indexOf('async fn mostrar('), tomato.indexOf('async fn esperar_pintura('));
  assert.ok(ordem(mostrar, ['tokio::time::timeout(ESPERA_DO_PRONTO, rx.recv())', 'janela.show()', 'tokio::time::Instant::now() + ESPERA_DA_PINTURA']), 'o show depois do pronto ou do limite');
  // A main só some quando o tomate avisa, já na tela, que pintou (docs/decisoes.md, M51, item 13).
  assert.match(tomato, /pub const ESPERA_DA_PINTURA: Duration = Duration::from_secs\(8\);/);
  const pintura = tomato.slice(tomato.indexOf('async fn esperar_pintura('), tomato.indexOf('async fn chave_a_validar('));
  assert.ok(ordem(pintura, ['while !self.pintado', 'timeout_at(self.fim_da_pintura, self.rx.recv())']), 'depois do show, a espera do aviso de pintado');
  // Sair: grava o lastNormalTheme, mostra a main (recriada se preciso) e fecha a tomato.
  const sair = tomato.slice(tomato.indexOf('pub async fn sair('), tomato.indexOf('async fn esperar_visivel('));
  assert.ok(ordem(sair, ['trava.lock().await', 'gravar_tema(app, atual.last_normal_theme.as_str())', 'm.show()', 'build_main(app, &s)', 't.destroy()']), 'a ordem do "Sair" (5.7)');
  assert.match(tomato, /crate::commands::gravar_configuracoes\(app, &store, &json!\(\{ "theme": tema \}\)\)/, 'pelo caminho do settings_set (3.3)');
  assert.doesNotMatch(tomato, /\.hide\(\)[^;]*;[^\n]*LABEL|t\.hide\(\)/, 'a tomato nunca se esconde (5.3)');
  const comandos = ler('src-tauri/src/commands.rs');
  assert.match(comandos, /pub fn settings_set\([\s\S]*?\{\s*gravar_configuracoes\(&app, &settings, &patch\)\s*\}/);
  // Início com theme = full: só a tomato (4.7).
  const lib = ler('src-tauri/src/lib.rs');
  assert.match(lib, /window::tomato::ligar\(app\.handle\(\)\);\s*if s\.theme == settings::ThemePref::Full \{\s*window::tomato::abrir_no_inicio\(app\.handle\(\), &s\)\?;\s*\} else \{\s*window::main_window::build_main\(app\.handle\(\), &s\)\?;/);
  // A página avisa o pronto, e o Esc e o "Voltar ao modo normal" saem pelo mesmo comando.
  const js = ler('src/tomato.js');
  assert.match(js, /const dados = \{ userAgent: navigator\.userAgent, renderer: renderizador\(\) \};/);
  assert.match(js, /ipc\.full\.avisarPronto\(\{ \.\.\.dados, pintado \}\)/);
  assert.match(js, /if \(document\.visibilityState !== 'visible'\) avisar\(false\);\s*await naTela\(\);\s*await quadroPintado\(\);\s*avisar\(true\);/, 'escondida, o primeiro aviso; na tela, o de pintado depois de dois quadros');
  assert.match(js, /e\.key !== 'Escape'/);
  assert.match(js, /voltar: \(\) => sair\(\)/);
  assert.match(js, /ipc\.full\.trocarModo\(false\)/);
  assert.match(ler('src/lib/ipc.js'), /trocarModo: \(entrar\) => invoke\('switch_window_mode', \{ full: entrar \}\)/);
  assert.match(ler('src/main.js'), /trocarModo: ipc\.full\.trocarModo,/);
});

// M52: a validação com reversão (5.9) e o plano B3 (fullMode=opaque e a variável do DMA-BUF, 5.6).
test('Full: validação de 10 s pelo fullValidated, full_mode() com o WEBKIT_DISABLE_DMABUF_RENDERER e a tomato opaca', () => {
  const tomato = ler('src-tauri/src/window/tomato.rs');
  // O full_mode() da 5.6: lê a variável do ambiente, compara com "0" e decide só o modo.
  assert.match(tomato, /pub fn full_mode\(s: &Settings\) -> FullMode \{\s*full_mode_com\(s, std::env::var_os\(VARIAVEL_DMABUF\)\.as_deref\(\)\)/);
  assert.match(tomato, /pub const VARIAVEL_DMABUF: &str = "WEBKIT_DISABLE_DMABUF_RENDERER";/);
  assert.match(tomato, /cfg!\(target_os = "linux"\) && dmabuf\.is_some_and\(\|v\| v\.to_str\(\) != Some\("0"\)\)/);
  assert.match(tomato, /dmabuf_off \|\| s\.full_mode == settings::FullMode::Opaque/);
  // Nunca exportar nem apagar a variável do usuário (5.6).
  for (const arq of readdirSync(new URL('../src-tauri/src/', import.meta.url), { recursive: true }).filter((a) => a.endsWith('.rs'))) {
    assert.doesNotMatch(ler(`src-tauri/src/${arq}`), /(set_var|remove_var)\((VARIAVEL_DMABUF|"WEBKIT_DISABLE_DMABUF_RENDERER")/, arq);
  }
  // O fundo da tomato opaca é o --tt-tomato-10 do tokens.css, e o B3 do tokens.css pinta o <html>.
  const tokens = ler('src/styles/tokens.css');
  const t10 = /--tt-tomato-10:#([0-9A-F]{2})([0-9A-F]{2})([0-9A-F]{2});/i.exec(tokens).slice(1).map((h) => `0x${h.toUpperCase()}`);
  assert.ok(tomato.includes(`pub const FUNDO_OPACO: Color = Color(${t10.join(', ')}, 0xFF);`), `FUNDO_OPACO = --tt-tomato-10 (${t10})`);
  assert.match(tokens, /\[data-theme="full"\]\[data-full-mode="opaque"\]\{ --tt-bg-app:var\(--tt-tomato-10\); \}/);
  assert.match(ler('src/styles/tomato.css'), /\[data-full-mode='opaque'\] \.stage \{\s*pointer-events: auto;/);
  assert.match(tomato, /FullMode::Opaque => format!\("window\.__TT_FULL_MODE__=\{\};", json\("opaque"\)\)/);
  // O início direto no Full também passa pelo full_mode() e pela validação.
  const inicio = tomato.slice(tomato.indexOf('pub fn abrir_no_inicio('));
  const ordem = (texto, partes) => partes.map((p) => texto.indexOf(p)).every((i, k, a) => i >= 0 && (k === 0 || i > a[k - 1]));
  assert.ok(ordem(inicio, ['let modo = full_mode(s);', 'build_tomato(app, s, modo)', 'Entrada::mostrar(w, rx, t0)', 'drop(vez)', 'chave_a_validar(&s, modo)', 'validacao::perguntar(&app, chave)']));
  // Só a janela transparente é validada, e só quando a chave difere do fullValidated (5.7, passo 5).
  const chave = tomato.slice(tomato.indexOf('async fn chave_a_validar('), tomato.indexOf('fn registrar('));
  assert.ok(ordem(chave, ['if modo == FullMode::Opaque', 'return None;', 'chave_de_validacao(', '(chave != s.full_validated).then_some(chave)']));
  // Sair no meio cancela a pergunta.
  const sair = tomato.slice(tomato.indexOf('pub async fn sair('), tomato.indexOf('async fn esperar_visivel('));
  assert.ok(ordem(sair, ['trava.lock().await', 'validacao::cancelar(app)', 'gravar_tema(']));
  // O prazo corre no Rust (10 s), e a reversão é o "Sair" da 5.7, antes da oferta do B3.
  const val = ler('src-tauri/src/window/validacao.rs');
  assert.match(val, /pub const PRAZO: Duration = Duration::from_secs\(10\);/);
  assert.match(val, /pub const EVENTO: &str = "tt:\/\/full-validation";/);
  assert.ok(ordem(val, ['tokio::time::sleep(PRAZO).await;', 'expirar(&app, id).await;']));
  const reverter = val.slice(val.indexOf('async fn reverter('));
  assert.ok(ordem(reverter, ['tomato::sair(app).await', 'avisar(app, Fase::Revertida(motivo))']));
  assert.match(val, /gravar_configuracoes\(\s*app,\s*&store,\s*&json!\(\{ "fullValidated": chave \}\),?\s*\)/, 'Manter grava pelo caminho do settings_set');
  assert.match(val, /gravar_configuracoes\(app, &store, &json!\(\{ "fullMode": "opaque" \}\)\)/, 'o B3 grava pelo caminho do settings_set');
  const lib = ler('src-tauri/src/lib.rs');
  assert.match(lib, /commands::full_validation_get,\s*commands::full_validation_answer,/);
  assert.match(ler('src-tauri/src/commands.rs'), /pub async fn full_validation_answer\(/);
  // A main liga o diálogo antes de aparecer (a pergunta de uma main recriada chega pelo get).
  const main = ler('src/main.js');
  assert.ok(main.indexOf('ligarValidacaoDoFull({ ipc })') > 0 && main.indexOf('ligarValidacaoDoFull({ ipc })') < main.indexOf('await win.show()'));
  const ipc = ler('src/lib/ipc.js');
  assert.match(ipc, /EVENTO_VALIDACAO: 'tt:\/\/full-validation'/);
  assert.match(ipc, /responderValidacao: \(resposta\) => invoke\('full_validation_answer', \{ answer: resposta \}\)/);
});

test('capabilities/tomato.json com as permissões da seção 3.8, só para a tomato', () => {
  const cap = JSON.parse(ler('src-tauri/capabilities/tomato.json'));
  assert.deepEqual(cap.windows, ['tomato']);
  assert.deepEqual([...cap.permissions].sort(), [
    'core:default',
    'core:menu:default',
    'core:window:allow-close',
    'core:window:allow-minimize',
    'core:window:allow-set-always-on-top',
    'core:window:allow-show',
    'core:window:allow-start-dragging',
  ]);
});

test('Full: faixas da região calculadas pela página antes do aviso, e a sobreposição só no dev (M53)', () => {
  const js = ler('src/tomato.js');
  assert.match(js, /import \{ regionStrips \} from '\.\/lib\/regiao\.js';/);
  // Linux: px lógicos (escala 1); Windows: px físicos (5.4).
  assert.match(js, /h\.dataset\.platform === 'windows' \? window\.devicePixelRatio \|\| 1 : 1/);
  // M54: o cálculo vem pelo envio (enviarRegiao chama o calcularRegiao).
  assert.match(js, /addEventListener\('resize', \(\) => enviarRegiao\(\)\)/);
  assert.match(js, /function enviarRegiao\(\) \{[\s\S]*?const r = calcularRegiao\(\);/);
  const fim = js.slice(js.lastIndexOf('} finally {'));
  assert.ok(fim.indexOf('await enviarRegiao();') > 0 && fim.indexOf('await enviarRegiao();') < fim.indexOf('avisar(false)'), 'antes do tt://tomato-ready');
  // A sobreposição entra só pelo import dinâmico dentro do DEV.
  assert.match(js, /if \(import\.meta\.env\.DEV\) \{\s*import\('\.\/lib\/regiao-debug\.js'\)/);
  assert.equal(js.match(/regiao-debug/g).length, 2, 'só o import do DEV (e o comentário)');
  // Uma fonte única (5.4): a região não é calculada no Rust.
  assert.doesNotMatch(ler('src-tauri/src/window/tomato.rs'), /region_approx|fn strips/);
});

test('Full: região de entrada no Linux pelo set_tomato_region, antes do show e a cada troca de tamanho (M54)', () => {
  // Linux (5.6): o gtk da mesma versão do Tauri, só no Linux; a região no
  // widget (gtk_window), nunca na GdkWindow, e montada na thread principal.
  const cargo = ler('src-tauri/Cargo.toml');
  const linux = cargo.slice(cargo.indexOf(`[target.'cfg(target_os = "linux")'.dependencies]`));
  assert.match(linux.split(/\n\[/)[0], /^gtk = "0\.18"$/m);
  assert.equal(cargo.match(/^gtk = /gm).length, 1, 'gtk só na seção do Linux');
  const rl = ler('src-tauri/src/window/region_linux.rs');
  assert.match(rl, /run_on_main_thread\(move \|\| \{[\s\S]*Region::create\(\)[\s\S]*w\.gtk_window\(\)[\s\S]*input_shape_combine_region\(Some\(&region\)\)/);
  assert.doesNotMatch(rl, /\.window\(\)/, 'nunca a GdkWindow (5.6, "Proibido")');
  assert.match(ler('src-tauri/src/window/mod.rs'), /#\[cfg\(target_os = "linux"\)\]\npub mod region_linux;/);
  // Nunca setIgnoreCursorEvents (5.3): apagaria a região no Linux.
  for (const arq of ['src-tauri/src/window/tomato.rs', 'src-tauri/src/window/region_linux.rs', 'src-tauri/src/lib.rs', 'src/tomato.js']) {
    assert.doesNotMatch(ler(arq), /set_ignore_cursor_events|setIgnoreCursorEvents/, arq);
  }
  // O comando: só a tomato, faixas validadas, ignorado no modo opaco (B3).
  const rs = ler('src-tauri/src/window/tomato.rs');
  const definir = rs.slice(rs.indexOf('pub fn definir_regiao'), rs.indexOf('fn aplicar('));
  assert.ok(definir.indexOf('janela.label() != LABEL') < definir.indexOf('faixas_validas(&strips)?'));
  assert.ok(definir.indexOf('FullMode::Opaque') < definir.indexOf('aplicar(janela, strips)'), 'opaca: sem região');
  assert.match(rs, /#\[cfg\(target_os = "linux"\)\]\nfn aplicar\([\s\S]*?region_linux::apply_region/);
  assert.match(rs, /#\[cfg\(not\(target_os = "linux"\)\)\]\nfn aplicar\(/);
  // O modo vem da janela construída (build_tomato), e não das configurações.
  const build = rs.slice(rs.indexOf('pub fn build_tomato'), rs.indexOf('pub const EVENTO_PRONTO'));
  assert.ok(build.indexOf('builder.build()?') < build.indexOf('t.nova_janela(modo)'));
  // A cada troca de tamanho: o Resized da tomato pede a região de novo.
  const lib = ler('src-tauri/src/lib.rs');
  assert.match(lib, /if let tauri::WindowEvent::Resized\(tamanho\) = event \{\s*window::tomato::redimensionada\(window, \*tamanho\);/);
  assert.match(lib, /commands::set_tomato_region,\s*commands::tomato_debug_size,/);
  assert.match(rs, /pub const EVENTO_REGIAO: &str = "tt:\/\/tomato-region";/);
  assert.match(rs, /t\.tamanho_mudou\(tamanho\)[\s\S]{0,40}janela\.emit_to\(LABEL, EVENTO_REGIAO/);
  const cmds = ler('src-tauri/src/commands.rs');
  assert.match(cmds, /pub fn set_tomato_region\(\s*webview_window: tauri::WebviewWindow,\s*strips: Vec<\[i32; 4\]>,/);
  assert.match(cmds, /pub async fn tomato_debug_size[\s\S]*?if !cfg!\(debug_assertions\) \{\s*return Err/);
  // A página: o envio antes do aviso (e portanto antes do show), a cada
  // resize e a cada pedido do Rust; nada no modo opaco.
  const js = ler('src/tomato.js');
  assert.match(js, /ipc\.ouvir\(ipc\.full\.EVENTO_REGIAO, \(\) => enviarRegiao\(\)\)/);
  assert.match(js, /h\.dataset\.fullMode === 'opaque' \|\| !r/);
  assert.match(js, /await ipc\.full\.definirRegiao\(r\.faixas\)/);
  // Escondida, o innerWidth é 0: o lado vem do Rust, e a região vai antes do show.
  assert.match(js, /const ladoDaJanela = \(\) => window\.innerWidth \|\| Number\(window\.__TT_TOMATO_SIZE__\) \|\| 0;/);
  assert.match(js, /const lado = ladoDaJanela\(\);/);
  assert.match(build, /\.initialization_script\(init_lado\(s\.tomato_size\)\)/);
  const ipcJs = ler('src/lib/ipc.js');
  assert.match(ipcJs, /EVENTO_REGIAO: 'tt:\/\/tomato-region'/);
  assert.match(ipcJs, /definirRegiao: \(faixas\) => invoke\('set_tomato_region', \{ strips: faixas \}\)/);
});
