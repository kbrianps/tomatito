// M46: os avisos de terceiros sem rede. Regerar de verdade é o
// `node scripts/gerar-avisos.mjs --conferir` (precisa de rede e do
// cargo-about); aqui, o que dá para conferir com o que já está na máquina:
//   - cada pacote npm que vai no app (as dependências de produção do
//     package-lock e o @fluentui/svg-icons) está nos avisos, na versão
//     instalada, e os que não trazem LICENSE levam o texto do repositório;
//   - cada crate que entra no binário nos dois sistemas (o `cargo tree`
//     offline, sem os de build, de teste e as proc-macros) está nos avisos, e
//     cada crate dos avisos existe no Cargo.lock nessa versão;
//   - a OFL é a do pacote da fonte, e os dois arquivos estão no
//     bundle.resources; o sounds/README.md existe.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { ORIGENS, bloco } from './gerar-avisos.mjs';

const ler = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const avisos = ler('THIRD_PARTY_NOTICES.md');

test('avisos: cabeçalho em pt-BR, sem "Pomodoro", com o aviso de marcas e a OFL referida', () => {
  assert.match(avisos, /^# Avisos de terceiros\n/);
  assert.doesNotMatch(avisos, /pomodoro/i);
  assert.ok(avisos.includes('Interface inspirada no Fluent Design. Windows e Segoe são marcas da Microsoft. O Tomatito não é afiliado à Microsoft.'));
  assert.ok(avisos.includes('`OFL-Inter.txt`'));
  assert.match(avisos, /^## Interface \(pacotes npm\)$/m);
  assert.match(avisos, /^## Aplicativo \(crates Rust\)$/m);
});

test('avisos: cada pacote npm do app, na versão instalada, com o texto da licença', () => {
  const lock = JSON.parse(ler('package-lock.json'));
  const doApp = Object.entries(lock.packages)
    .filter(([caminho, p]) => caminho.startsWith('node_modules/') && !p.dev)
    .map(([caminho, p]) => [caminho.replace(/^.*node_modules\//, ''), p.version]);
  doApp.push(['@fluentui/svg-icons', lock.packages['node_modules/@fluentui/svg-icons'].version]);
  assert.ok(doApp.length >= 8, 'as dependências de produção');
  for (const [nome, versao] of doApp) {
    assert.ok(avisos.includes(`\n### ${nome} ${versao}\n`), `${nome} ${versao} nos avisos`);
  }
  // O @fluentui/web-components 3.1.3 não traz LICENSE: vai o texto MIT do microsoft/fluentui.
  const fluent = avisos.split('\n### @fluentui/web-components ')[1].split('\n### ')[0];
  assert.ok(fluent.includes(bloco(ler(ORIGENS['@fluentui/web-components'].arquivo))));
  assert.match(fluent, /https:\/\/github\.com\/microsoft\/fluentui\/blob\/[0-9a-f]{40}\/LICENSE/);
  assert.match(ler(ORIGENS['@fluentui/web-components'].arquivo), /^MIT License\n\nCopyright \(c\) Microsoft Corporation\./);
  for (const { arquivo } of Object.values(ORIGENS)) assert.ok(avisos.includes(bloco(ler(arquivo))), arquivo);
});

test('avisos: cada crate que entra no binário (Linux e Windows) está nos avisos, e nenhum fora do Cargo.lock', () => {
  const lock = ler('src-tauri/Cargo.lock');
  const noLock = new Set([...lock.matchAll(/\[\[package\]\]\nname = "([^"]+)"\nversion = "([^"]+)"/g)].map((m) => `${m[1]} ${m[2]}`));
  const usados = [...avisos.matchAll(/^Usado por: (.+)$/gm)].flatMap((m) => m[1].split(', '));
  assert.ok(usados.length > 200);
  for (const c of usados) assert.ok(noLock.has(c), `${c} no Cargo.lock`);
  assert.ok(!usados.some((c) => /^tomatito(-core|-motor)? /.test(c)), 'sem os crates do próprio app');
  const arvore = execFileSync(
    'cargo',
    ['tree', '--offline', '--locked', '-e', 'normal,no-proc-macro', '--target', 'x86_64-unknown-linux-gnu',
      '--target', 'x86_64-pc-windows-msvc', '--prefix', 'none', '-f', '{p}'],
    { cwd: new URL('../src-tauri/', import.meta.url), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  );
  const noBinario = new Set(
    arvore.split('\n').filter(Boolean).map((l) => l.replace(/ \(.*$/, '').replace(/ v(\S+)$/, ' $1')).filter((c) => !/^tomatito(-core|-motor)? /.test(c)),
  );
  assert.ok(noBinario.size > 200);
  const faltam = [...noBinario].filter((c) => !usados.includes(c));
  assert.deepEqual(faltam, [], 'rode node scripts/gerar-avisos.mjs');
});

test('OFL da Inter, bundle.resources e o README dos sons', () => {
  assert.equal(ler('src/assets/OFL-Inter.txt'), ler('node_modules/@fontsource-variable/inter/LICENSE'));
  assert.match(ler('src/assets/OFL-Inter.txt'), /SIL OPEN FONT LICENSE Version 1\.1/);
  const conf = JSON.parse(ler('src-tauri/tauri.conf.json'));
  assert.deepEqual(conf.bundle.resources, {
    '../THIRD_PARTY_NOTICES.md': 'THIRD_PARTY_NOTICES.md',
    '../src/assets/OFL-Inter.txt': 'OFL-Inter.txt',
  });
  assert.ok(existsSync(new URL('../src-tauri/sounds/README.md', import.meta.url)));
  assert.match(ler('src-tauri/sounds/README.md'), /Origem e licença/);
  // O comando que o Sobre usa está registrado.
  assert.match(ler('src-tauri/src/lib.rs'), /^mod avisos;$/m);
  assert.match(ler('src-tauri/src/lib.rs'), /^\s+avisos::notices_read,$/m);
  assert.match(ler('src/lib/ipc.js'), /invoke\('notices_read', \{ doc \}\)/);
});
