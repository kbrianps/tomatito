// Publica a versão web no Cloudflare Pages (PLANO-WEB-V1, 4.1; marcos W40b e
// W41).
//
//   node scripts/web/publicar.mjs
//
// 1. `npm run build:web` (gera o dist-web, com o _headers e a privacidade).
// 2. Confere o login (`wrangler whoami`). Sem login, explica como entrar e sai
//    com o código 3, sem publicar nada.
// 3. Cria o projeto `tomatito` no Pages, se ainda não existir, e publica o
//    dist-web no ramo de produção.
//
// O wrangler fica fora do repositório e do /home (W40b):
//   npm install --cache /opt/cargo-target/npm-cache \
//     --prefix /opt/cargo-target/ferramentas/wrangler wrangler@4.143.1
// Outro lugar: TOMATITO_WRANGLER=/caminho/para/wrangler.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('../../', import.meta.url));
const WRANGLER = process.env.TOMATITO_WRANGLER ?? '/opt/cargo-target/ferramentas/wrangler/node_modules/.bin/wrangler';
const PROJETO = process.env.TOMATITO_PAGES_PROJETO ?? 'tomatito';

if (!existsSync(WRANGLER)) {
  console.error(`Falta o wrangler em ${WRANGLER} (veja o cabeçalho deste arquivo).`);
  process.exit(2);
}
const wrangler = (args, opcoes = {}) => spawnSync(WRANGLER, args, { cwd: RAIZ, encoding: 'utf8', ...opcoes });

execFileSync('npm', ['run', 'build:web'], { cwd: RAIZ, stdio: 'inherit' });

if (wrangler(['whoami']).status !== 0) {
  console.error(`Falta o login na Cloudflare: rode \`! ${WRANGLER} login\` e autorize no navegador.`);
  process.exit(3);
}

const projetos = wrangler(['pages', 'project', 'list']);
if (!new RegExp(`\\b${PROJETO}\\b`).test(projetos.stdout ?? '')) {
  const criar = wrangler(['pages', 'project', 'create', PROJETO, '--production-branch', 'main'], { stdio: 'inherit' });
  if (criar.status !== 0) process.exit(criar.status ?? 1);
}
const publicar = wrangler(
  ['pages', 'deploy', 'dist-web', '--project-name', PROJETO, '--branch', 'main', '--commit-dirty=true'],
  { stdio: 'inherit' },
);
process.exit(publicar.status ?? 1);
