// A versão do Android (PLANO-ANDROID 7.2; A19).
//
//   node scripts/android/versao.mjs
//
// Confere que a versão do tauri.android.conf.json é a do Cargo.toml (o CLI do
// Tauri só grava o versionCode quando a configuração tem `version`) e que o
// versionCode dela é MAIOR que o último enviado, na tabela do
// docs/android/versoes.md (a Play recusa um versionCode repetido ou menor).
// Sai 1 se algo estiver errado.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ler = (arq) => readFileSync(fileURLToPath(new URL(`../../${arq}`, import.meta.url)), 'utf8');
export const versionCode = (v) => { const [a, b, c] = v.split('.').map(Number); return a * 1_000_000 + b * 1000 + c; };

const cargo = /^version = "([^"]+)"/m.exec(ler('src-tauri/Cargo.toml'))[1];
const android = JSON.parse(ler('src-tauri/tauri.android.conf.json')).version;
// Linhas da tabela marcadas como enviadas: | versão | versionCode | sha256 | trilha | data |
const enviados = [...ler('docs/android/versoes.md').matchAll(/^\|\s*\d+\.\d+\.\d+\s*\|\s*(\d+)\s*\|[^|]*\|\s*(?!não enviado)(?=\S)[^|]+\|/gm)].map((m) => Number(m[1]));
const ultimo = enviados.length ? Math.max(...enviados) : 0;
const erros = [];
if (android !== cargo) erros.push(`tauri.android.conf.json diz ${android}; o Cargo.toml diz ${cargo}`);
if (versionCode(cargo) <= ultimo) erros.push(`versionCode ${versionCode(cargo)} não é maior que o último enviado (${ultimo})`);
console.log(JSON.stringify({ ok: erros.length === 0, versao: cargo, versionCode: versionCode(cargo), ultimoEnviado: ultimo, erros }));
process.exit(erros.length ? 1 : 0);
