import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('../', import.meta.url));
const SAIDA = join(RAIZ, 'src-tauri', 'icons', 'bandeja');
const ANEL = 'M160 96 C186 83 224 82 250 101 C272 119 280 152 275 186 C270 238 222 276 160 276 C98 276 50 238 45 186 C40 152 48 119 70 101 C96 82 134 83 160 96 Z';
const COMPRIMENTO = 694.9;

export const PASSOS = Array.from({ length: 21 }, (_, i) => i * 5);

export function svg(percentual) {
  const anel =
    percentual === null
      ? ''
      : `<path d="${ANEL}" fill="none" stroke="#FFF6F1" stroke-opacity=".3" stroke-width="30"/>` +
        (percentual > 0
          ? `<path d="${ANEL}" fill="none" stroke="#FFF6F1" stroke-width="30" stroke-linecap="round" stroke-dasharray="${((COMPRIMENTO * percentual) / 100).toFixed(1)} ${COMPRIMENTO}"/>`
          : '');
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">' +
    '<defs><radialGradient id="c" cx="0.36" cy="0.30" r="0.80"><stop offset="0" stop-color="#E04B37"/><stop offset="0.55" stop-color="#C93A2C"/><stop offset="1" stop-color="#A3291F"/></radialGradient></defs>' +
    '<g transform="translate(0 1.4) scale(0.2)">' +
    '<path d="M160 80 C190 64 236 62 268 86 C296 108 306 150 300 190 C293 252 236 298 160 298 C84 298 27 252 20 190 C14 150 24 108 52 86 C84 62 130 64 160 80 Z" fill="url(#c)"/>' +
    anel +
    '<path d="M153 90 C152 72 155 55 159 40 Q163 34 171 38 C167 54 166 72 167 90 Z" fill="#4F6B33"/>' +
    '<g fill="#6FA35E"><path d="M168 82 Q196 60 226 74 Q196 94 162 93 Z"/><path d="M152 82 Q124 60 94 74 Q124 94 158 93 Z"/><path d="M166 80 Q178 56 198 52 Q190 72 170 88 Z"/><path d="M154 80 Q142 56 122 52 Q130 72 150 88 Z"/><ellipse cx="160" cy="86" rx="16" ry="8"/></g>' +
    '</g></svg>'
  );
}

const nome = (percentual) => (percentual === null ? 'parado.png' : `${String(percentual).padStart(3, '0')}.png`);

function gerar() {
  const temp = mkdtempSync(join(tmpdir(), 'tomatito-bandeja-'));
  try {
    for (const p of [null, ...PASSOS]) {
      const arquivo = join(temp, 'b.svg');
      writeFileSync(arquivo, svg(p));
      const saida = join(temp, 'out');
      const r = spawnSync('npx', ['tauri', 'icon', arquivo, '-p', '64', '-o', saida], { cwd: RAIZ, encoding: 'utf8', shell: process.platform === 'win32' });
      if (r.status !== 0) throw new Error(`tauri icon falhou para ${nome(p)}:\n${r.stdout}${r.stderr}`);
      copyFileSync(join(saida, '64x64.png'), join(SAIDA, nome(p)));
      rmSync(saida, { recursive: true, force: true });
    }
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
  console.log(`bandeja: ${PASSOS.length + 1} ícones em ${SAIDA}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) gerar();
