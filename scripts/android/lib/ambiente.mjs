// Ambiente e adb para os scripts/android/*.mjs (PLANO-ANDROID, 6).
//
// O ambiente vem do mesmo scripts/android/ambiente.sh que o terminal usa: um
// bash lê o ~/.config/tomatito/android.env, confere o kit e devolve as
// variáveis. Assim há uma fonte só para caminhos e portas (adb na 5041,
// emulador na 5620; ver o ambiente.sh).
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const AMBIENTE_SH = fileURLToPath(new URL('../ambiente.sh', import.meta.url));

export function carregarAmbiente({ emulador = false } = {}) {
  const r = spawnSync(
    'bash',
    ['-c', `source "$1" ${emulador ? '--emulador' : ''} >&2 && env -0`, 'ambiente', AMBIENTE_SH],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  if (r.status !== 0) {
    throw new Error(r.stderr.trim() || `ambiente.sh saiu com ${r.status}`);
  }
  const env = {};
  for (const par of r.stdout.split('\0')) {
    const i = par.indexOf('=');
    if (i > 0) env[par.slice(0, i)] = par.slice(i + 1);
  }
  return env;
}

// adb do kit, sempre no servidor desta faixa e no emulador desta faixa.
export function criarAdb(env) {
  const base = { env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 };
  const adb = (args, opcoes = {}) =>
    execFileSync('adb', ['-s', env.ANDROID_SERIAL, ...args], { ...base, ...opcoes });
  // Sem -s (devices, start-server, kill-server) e sem lançar exceção.
  adb.solto = (args, opcoes = {}) => spawnSync('adb', args, { ...base, timeout: 30_000, ...opcoes });
  // Binário (screencap).
  adb.bruto = (args) => execFileSync('adb', ['-s', env.ANDROID_SERIAL, ...args], { env, maxBuffer: 64 * 1024 * 1024 });
  adb.shell = (comando, opcoes) => adb(['shell', comando], opcoes).trim();
  return adb;
}

export const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
