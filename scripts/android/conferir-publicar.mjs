// Confere o passo a passo de publicação (PLANO-ANDROID; A25).
//
//   node scripts/android/conferir-publicar.mjs
//
// Todo arquivo do repositório citado no docs/android/PUBLICAR.md existe; o
// convite dos testadores é texto puro; e, se o AAB estiver no lugar, o SHA-256
// dele é o do docs/android/versoes.md. Sai 1 se algo falhar.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const raiz = (arq) => fileURLToPath(new URL(`../../${arq}`, import.meta.url));
const texto = readFileSync(raiz('docs/android/PUBLICAR.md'), 'utf8');
const citados = [...new Set([...texto.matchAll(/`((?:docs|scripts|src-tauri)\/[^`\s]+?)`/g)].map((m) => m[1].replace(/\/$/, '')))];
const faltam = citados.filter((c) => !existsSync(raiz(c)));
const convite = readFileSync(raiz('docs/android/play/convite-testadores.txt'), 'utf8');
const puro = !/[<>*_#`]|\[.*\]\(/.test(convite) && /COLE AQUI O LINK/.test(convite);
const aab = /`(\/opt\/[^`]+\.aab)`/.exec(texto)?.[1];
const versoes = readFileSync(raiz('docs/android/versoes.md'), 'utf8');
const sha = aab && existsSync(aab) ? createHash('sha256').update(readFileSync(aab)).digest('hex') : null;
const shaConfere = sha === null ? 'sem o AAB nesta máquina' : versoes.includes(sha);
const ok = faltam.length === 0 && puro && shaConfere !== false;
console.log(JSON.stringify({ ok, citados: citados.length, faltam, convitePuro: puro, sha256DoAab: sha, noVersoes: shaConfere }));
process.exit(ok ? 0 : 1);
