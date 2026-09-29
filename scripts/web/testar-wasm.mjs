// `npm run test:wasm` (PLANO-WEB, 3.9; PLANO-WEB-V1, marco W02): roda os
// testes do tomatito-core compilados para wasm32, primeiro no Node e depois
// no Chrome headless, pelo wasm-bindgen-test-runner 0.2.129.
//
//   node scripts/web/testar-wasm.mjs [--node | --chrome]
//
// Fora do `npm test` de propósito: o nome não casa com a descoberta do
// `node --test` (regra 3 da 3.2 do PLANO-WEB, no regras-do-repo.test.mjs).
//
// Onde fica cada coisa (tudo fora do /home, que tem pouco espaço):
// - runner: $TOMATITO_WBG (o executável, ou a pasta do `cargo install
//   --root`), senão <ferramentas>/wbg/bin/wasm-bindgen-test-runner, o do W00a;
// - chromedriver: $CHROMEDRIVER, senão <ferramentas>/chromedriver-<versão>/,
//   com a versão do Chrome que vai rodar ($TOMATITO_CHROME, senão
//   google-chrome). Se faltar, vem da semente ($TOMATITO_CHROMEDRIVER_SEMENTE,
//   senão ~/dev/tomatito-ref/web/chromedriver-linux64, 153.0.8010.52) quando
//   a versão bate, ou do Chrome for Testing
//   (known-good-versions-with-downloads.json) quando o Chrome muda de versão;
// - <ferramentas> = $TOMATITO_FERRAMENTAS, senão /opt/cargo-target/ferramentas;
// - target do cargo: TOMATITO_WASM_TARGET_DIR, depois CARGO_TARGET_DIR, e por
//   fim src-tauri/target-wasm (a mesma ordem do wasm.mjs).
//
// Perfil de debug (o padrão do `cargo test`): o módulo `tests_acelerado` do
// clock.rs só existe com `debug_assertions`, e a conta do linha-de-base.md
// (87 passando e 3 ignorados) conta com ele.
import { spawnSync } from 'node:child_process';
import {
  chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const VERSAO_WBG = '0.2.129';
// W04a acrescenta o tomatito-motor (os testes que sobem do desktop).
const PACOTES = ['tomatito-core'];
const WIN = process.platform === 'win32';

const RAIZ = fileURLToPath(new URL('../../', import.meta.url));
const SRC_TAURI = fileURLToPath(new URL('../../src-tauri', import.meta.url));
const FERRAMENTAS = process.env.TOMATITO_FERRAMENTAS || '/opt/cargo-target/ferramentas';
const SEMENTE =
  process.env.TOMATITO_CHROMEDRIVER_SEMENTE ||
  join(homedir(), 'dev', 'tomatito-ref', 'web', 'chromedriver-linux64');
const CFT =
  'https://googlechromelabs.github.io/chrome-for-testing/known-good-versions-with-downloads.json';

function falhar(msg) {
  console.error(`testar-wasm: ${msg}`);
  process.exit(1);
}

function saida(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', shell: WIN });
  if (r.error || r.status !== 0) return null;
  return `${r.stdout}${r.stderr}`.trim();
}

const versaoDe = (texto) => texto?.match(/(\d+\.\d+\.\d+\.\d+)/)?.[1] ?? null;

function acharRunner() {
  const env = process.env.TOMATITO_WBG;
  const nome = `wasm-bindgen-test-runner${WIN ? '.exe' : ''}`;
  let runner = join(FERRAMENTAS, 'wbg', 'bin', nome);
  if (env) {
    runner = env;
    if (existsSync(env) && statSync(env).isDirectory()) {
      runner = [join(env, 'bin', nome), join(env, nome)].find((p) => existsSync(p)) ?? join(env, nome);
    }
  }
  if (!existsSync(runner)) {
    falhar(
      `runner não encontrado em ${runner}.\n` +
        `  cargo install wasm-bindgen-cli --version ${VERSAO_WBG} --locked --root ${join(FERRAMENTAS, 'wbg')}\n` +
        '  (ou aponte TOMATITO_WBG para ele)',
    );
  }
  const v = saida(runner, ['--version']);
  if (!v?.endsWith(` ${VERSAO_WBG}`)) {
    falhar(`${runner} é "${v}", mas o crate wasm-bindgen está fixado em ${VERSAO_WBG}`);
  }
  return runner;
}

function plataformaCft() {
  if (process.platform === 'linux') return 'linux64';
  if (WIN) return 'win64';
  if (process.platform === 'darwin') return process.arch === 'arm64' ? 'mac-arm64' : 'mac-x64';
  falhar(`sistema sem chromedriver no Chrome for Testing: ${process.platform}`);
}

function extrairZip(zip, destino) {
  const r = WIN
    ? spawnSync('tar', ['-xf', zip, '-C', destino], { stdio: 'inherit' })
    : spawnSync('unzip', ['-q', zip, '-d', destino], { stdio: 'inherit' });
  if (r.status === 0) return;
  const py = spawnSync('python3', ['-m', 'zipfile', '-e', zip, destino], { stdio: 'inherit' });
  if (py.status !== 0) falhar(`não foi possível extrair ${zip}`);
}

async function baixarChromedriver(versao, pasta) {
  const plat = plataformaCft();
  console.log(`testar-wasm: baixando o chromedriver ${versao} (${plat}) do Chrome for Testing`);
  const lista = await (await fetch(CFT)).json();
  const item = lista.versions.find((v) => v.version === versao);
  const url = item?.downloads?.chromedriver?.find((d) => d.platform === plat)?.url;
  if (!url) falhar(`o Chrome for Testing não tem chromedriver ${versao} para ${plat}`);
  const resp = await fetch(url);
  if (!resp.ok) falhar(`download do chromedriver: HTTP ${resp.status} em ${url}`);
  mkdirSync(FERRAMENTAS, { recursive: true });
  const tmp = mkdtempSync(join(FERRAMENTAS, `.chromedriver-${versao}-`));
  try {
    const zip = join(tmp, 'chromedriver.zip');
    writeFileSync(zip, Buffer.from(await resp.arrayBuffer()));
    extrairZip(zip, tmp);
    // O zip traz uma pasta chromedriver-<plataforma>/; ela vira a pasta final.
    renameSync(join(tmp, `chromedriver-${plat}`), pasta);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

async function acharChromedriver() {
  const chrome = process.env.TOMATITO_CHROME || 'google-chrome';
  const versaoChrome = versaoDe(saida(chrome, ['--version']));
  if (!versaoChrome) falhar(`não consegui ler a versão do Chrome (${chrome} --version)`);
  const nome = `chromedriver${WIN ? '.exe' : ''}`;

  let driver = process.env.CHROMEDRIVER;
  if (!driver) {
    const pasta = join(FERRAMENTAS, `chromedriver-${versaoChrome}`);
    driver = join(pasta, nome);
    if (!existsSync(driver)) {
      const semente = join(SEMENTE, nome);
      if (existsSync(semente) && versaoDe(saida(semente, ['--version'])) === versaoChrome) {
        console.log(`testar-wasm: copiando o chromedriver ${versaoChrome} da semente ${SEMENTE}`);
        cpSync(SEMENTE, pasta, { recursive: true });
      } else {
        await baixarChromedriver(versaoChrome, pasta);
      }
      if (!WIN) chmodSync(driver, 0o755);
    }
  }
  const versaoDriver = versaoDe(saida(driver, ['--version']));
  if (versaoDriver !== versaoChrome) {
    falhar(`chromedriver ${versaoDriver} (${driver}) não casa com o Chrome ${versaoChrome} (${chrome})`);
  }
  return { driver, chrome, versaoChrome };
}

// O chromedriver não procura o Chrome pelo PATH (acha o da instalação
// padrão). Para o Chrome que roda ser o mesmo cuja versão escolheu o
// chromedriver, o caminho absoluto dele vai no `goog:chromeOptions.binary`,
// por um webdriver.json temporário (WASM_BINDGEN_TEST_WEBDRIVER_JSON, que o
// runner lê no lugar do webdriver.json da pasta atual).
function caminhoAbsoluto(bin) {
  if (bin.includes('/') || bin.includes('\\')) return resolve(bin);
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    for (const ext of WIN ? ['.exe', ''] : ['']) {
      const p = join(dir, bin + ext);
      if (existsSync(p) && statSync(p).isFile()) return p;
    }
  }
  falhar(`${bin} não está no PATH`);
}

function capacidadesDoChrome(chrome) {
  const pasta = mkdtempSync(join(tmpdir(), 'tomatito-wasm-webdriver-'));
  const arquivo = join(pasta, 'webdriver.json');
  writeFileSync(arquivo, JSON.stringify({ 'goog:chromeOptions': { binary: caminhoAbsoluto(chrome) } }));
  return { arquivo, limpar: () => rmSync(pasta, { recursive: true, force: true }) };
}

function rodar(rotulo, extra) {
  const env = { ...process.env };
  delete env.WASM_BINDGEN_USE_BROWSER;
  delete env.CHROMEDRIVER;
  delete env.WASM_BINDGEN_TEST_WEBDRIVER_JSON;
  Object.assign(env, extra);
  const args = ['test', '--target', 'wasm32-unknown-unknown', ...PACOTES.flatMap((p) => ['-p', p])];
  console.log(`\n== ${rotulo}: cargo ${args.join(' ')}`);
  const r = spawnSync('cargo', args, {
    cwd: SRC_TAURI,
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: WIN,
    maxBuffer: 64 * 1024 * 1024,
  });
  process.stdout.write(r.stdout ?? '');
  process.stderr.write(r.stderr ?? '');
  const texto = `${r.stdout}\n${r.stderr}`;
  const soma = { passed: 0, failed: 0, ignored: 0 };
  for (const m of texto.matchAll(/test result: \w+\. (\d+) passed; (\d+) failed; (\d+) ignored/g)) {
    soma.passed += Number(m[1]);
    soma.failed += Number(m[2]);
    soma.ignored += Number(m[3]);
  }
  const ok = r.status === 0 && soma.failed === 0;
  console.log(
    `${ok ? 'ok' : 'FALHOU'} ${rotulo}: ${soma.passed} passaram, ${soma.failed} falharam, ` +
      `${soma.ignored} ignorados (saída ${r.status})`,
  );
  return ok;
}

const so = process.argv.includes('--node') ? 'node' : process.argv.includes('--chrome') ? 'chrome' : null;
for (const a of process.argv.slice(2)) {
  if (a !== '--node' && a !== '--chrome') falhar(`opção desconhecida: ${a} (uso: [--node | --chrome])`);
}

const runner = acharRunner();
const alvo =
  process.env.TOMATITO_WASM_TARGET_DIR ||
  process.env.CARGO_TARGET_DIR ||
  fileURLToPath(new URL('../../src-tauri/target-wasm', import.meta.url));
const base = {
  CARGO_TARGET_DIR: alvo,
  CARGO_TARGET_WASM32_UNKNOWN_UNKNOWN_RUNNER: runner,
};
console.log(`testar-wasm: runner ${runner}\n  CARGO_TARGET_DIR=${alvo}\n  raiz ${RAIZ}`);

let tudoOk = true;
if (so !== 'chrome') {
  tudoOk = rodar('node', base) && tudoOk;
}
if (so !== 'node') {
  const { driver, chrome, versaoChrome } = await acharChromedriver();
  console.log(`testar-wasm: Chrome ${versaoChrome} (${chrome}), chromedriver ${driver}`);
  const caps = capacidadesDoChrome(chrome);
  try {
    tudoOk =
      rodar('chrome', {
        ...base,
        WASM_BINDGEN_USE_BROWSER: '1',
        CHROMEDRIVER: driver,
        WASM_BINDGEN_TEST_WEBDRIVER_JSON: caps.arquivo,
      }) && tudoOk;
  } finally {
    caps.limpar();
  }
}
process.exit(tudoOk ? 0 : 1);
