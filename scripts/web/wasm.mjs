// `npm run wasm` (PLANO-WEB, 3.3 e 3.9; marco W01a): compila o
// src-tauri/tomatito-wasm para wasm32 e gera o pacote JS em
// src/platform/web/pkg/ (fora do git), com o perfil `wasm-release` e o
// `wasm-opt -Oz`.
//
// Em Node, e não em shell, para funcionar também no Git Bash do Windows.
//
// Pasta do target, nesta ordem (PLANO-WEB, 1.1): TOMATITO_WASM_TARGET_DIR,
// depois CARGO_TARGET_DIR, e por fim src-tauri/target-wasm (no .gitignore).
// Nesta máquina, o ~/.profile exporta TOMATITO_WASM_TARGET_DIR para o `/`
// (o /home tem pouco espaço). Nunca exportar CARGO_TARGET_DIR no perfil: ele
// passaria na frente do .cargo/config.toml das worktrees.
import { spawnSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('../../', import.meta.url));
const CRATE = fileURLToPath(new URL('../../src-tauri/tomatito-wasm', import.meta.url));
const WASM = fileURLToPath(new URL('../../src/platform/web/pkg/tomatito_wasm_bg.wasm', import.meta.url));

const alvo =
  process.env.TOMATITO_WASM_TARGET_DIR ||
  process.env.CARGO_TARGET_DIR ||
  fileURLToPath(new URL('../../src-tauri/target-wasm', import.meta.url));

// O --out-dir é relativo à pasta do crate.
const args = [
  'build', CRATE, '--target', 'web', '--out-dir', '../../src/platform/web/pkg',
  '--profile', 'wasm-release', '--no-pack',
];
console.log(`wasm-pack ${args.join(' ')}\n(CARGO_TARGET_DIR=${alvo})`);
const r = spawnSync('wasm-pack', args, {
  cwd: RAIZ,
  stdio: 'inherit',
  env: { ...process.env, CARGO_TARGET_DIR: alvo },
  shell: process.platform === 'win32',
});
if (r.error) {
  console.error(`não foi possível rodar o wasm-pack: ${r.error.message}`);
  process.exit(1);
}
if (r.status !== 0) process.exit(r.status ?? 1);
console.log(`${WASM}: ${statSync(WASM).size} bytes`);
