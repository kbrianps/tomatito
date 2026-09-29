#!/usr/bin/env node
// Gera o THIRD_PARTY_NOTICES.md da raiz (M46; PLANO.md, seção 9) com o
// cargo-about (os crates do Rust) e o license-checker (os pacotes npm da
// interface), e copia a OFL da Inter para src/assets/OFL-Inter.txt. Os dois
// arquivos vão nos instaladores (bundle.resources) e o Sobre os mostra.
//
//   node scripts/gerar-avisos.mjs             # escreve os dois arquivos
//   node scripts/gerar-avisos.mjs --conferir  # só confere se batem (falha se não)
//
// Precisa de rede (o cargo-about busca no repositório de origem a licença
// dos crates que não a trazem, e o npx baixa o license-checker) e do
// `cargo about` instalado (`cargo install cargo-about --locked --features cli`).
//
// Três pacotes npm e o dos ícones não trazem o arquivo LICENSE (o
// @fluentui/web-components 3.1.3, o fast-element, o focusgroup-polyfill e o
// @fluentui/svg-icons, que é devDependency, mas cujos SVGs o copy-icons.mjs
// copia para o app). O texto MIT de cada um vem do repositório de origem e
// fica em scripts/avisos/ (ORIGENS, abaixo).
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
export const SAIDA = join(RAIZ, 'THIRD_PARTY_NOTICES.md');
export const OFL = join(RAIZ, 'src/assets/OFL-Inter.txt');
const OFL_ORIGEM = join(RAIZ, 'node_modules/@fontsource-variable/inter/LICENSE');
const LICENSE_CHECKER = 'license-checker@25.0.1';

/** Os textos de licença que os pacotes não trazem, com o repositório de onde vieram. */
export const ORIGENS = Object.freeze({
  '@fluentui/web-components': {
    arquivo: 'scripts/avisos/microsoft-fluentui.LICENSE',
    fonte: 'https://github.com/microsoft/fluentui/blob/45af037915bae19733ffb8cb2123d8e6e216e881/LICENSE',
  },
  '@microsoft/fast-element': {
    arquivo: 'scripts/avisos/microsoft-fast.LICENSE',
    fonte: 'https://github.com/microsoft/fast/blob/e6a301e06fd79aa9ccceed40d78a78ea352de2a5/LICENSE',
  },
  '@microsoft/focusgroup-polyfill': {
    arquivo: 'scripts/avisos/microsoft-polyfills.LICENSE',
    fonte: 'https://github.com/microsoft/polyfills/blob/53d8a15a7758d3a850de575b3e0841d3949647bc/LICENSE.txt',
  },
  '@fluentui/svg-icons': {
    arquivo: 'scripts/avisos/microsoft-fluentui-system-icons.LICENSE',
    fonte: 'https://github.com/microsoft/fluentui-system-icons/blob/a563cf9166f4f91aa617557ed272612b7f0a2f72/LICENSE',
  },
});

/** Pacotes de desenvolvimento que entram no app mesmo assim (os ícones copiados). */
const DEV_NO_APP = Object.freeze(['@fluentui/svg-icons']);
/** Os crates do próprio Tomatito, fora dos avisos. */
const CRATES_PROPRIOS = new Set(['tomatito', 'tomatito-core']);

const semCR = (s) => s.replace(/\r\n?/g, '\n').replace(/\s+$/, '');

/** Um bloco de código com uma cerca maior que qualquer sequência de crases do texto. */
export function bloco(texto) {
  const maior = Math.max(2, ...[...texto.matchAll(/`+/g)].map((m) => m[0].length));
  const cerca = '`'.repeat(maior + 1);
  return `${cerca}text\n${semCR(texto)}\n${cerca}`;
}

function pacotesNpm() {
  const saida = execFileSync('npx', ['--yes', LICENSE_CHECKER, '--production', '--json', '--start', RAIZ], {
    cwd: RAIZ,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    maxBuffer: 64 * 1024 * 1024,
  });
  const lista = Object.entries(JSON.parse(saida)).map(([id, v]) => {
    const i = id.lastIndexOf('@');
    return { nome: id.slice(0, i), versao: id.slice(i + 1), licenca: v.licenses, arquivo: v.licenseFile, repo: v.repository };
  });
  for (const nome of DEV_NO_APP) {
    const pkg = JSON.parse(readFileSync(join(RAIZ, 'node_modules', nome, 'package.json'), 'utf8'));
    const repo = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
    lista.push({ nome, versao: pkg.version, licenca: pkg.license, arquivo: null, repo });
  }
  return lista
    .filter((p) => p.nome !== 'tomatito')
    .sort((a, b) => a.nome.localeCompare(b.nome, 'en'))
    .map((p) => ({ ...p, repo: p.repo?.replace(/^git\+/, '').replace(/\.git$/, ''), ...textoNpm(p) }));
}

/** O texto da licença de um pacote npm: o LICENSE do pacote, ou o de ORIGENS. */
function textoNpm(p) {
  const origem = ORIGENS[p.nome];
  if (origem) return { texto: readFileSync(join(RAIZ, origem.arquivo), 'utf8'), nota: origem.fonte, licenca: p.licenca };
  // Licença dupla: fica a MIT, como no Rust (about.toml).
  if (p.nome === '@tauri-apps/api') {
    return { texto: readFileSync(join(dirname(p.arquivo), 'LICENSE-MIT'), 'utf8'), licenca: `${p.licenca}; usada a MIT` };
  }
  if (!p.arquivo || !/^(licen[cs]e|copying)/i.test(basename(p.arquivo))) {
    throw new Error(`${p.nome}@${p.versao}: sem arquivo de licença (${p.arquivo ?? 'nenhum'}); acrescente-o a ORIGENS`);
  }
  return { texto: readFileSync(p.arquivo, 'utf8'), licenca: p.licenca };
}

function cratesRust() {
  const saida = execFileSync(
    'cargo',
    ['about', 'generate', '--format', 'json', '--locked', '--fail', '--manifest-path', join(RAIZ, 'src-tauri/Cargo.toml')],
    { cwd: join(RAIZ, 'src-tauri'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 256 * 1024 * 1024 },
  );
  const j = JSON.parse(saida);
  return j.licenses
    .map((l) => ({
      id: l.id,
      texto: l.text,
      crates: l.used_by
        .map((u) => ({ nome: u.crate.name, versao: u.crate.version }))
        .filter((c) => !CRATES_PROPRIOS.has(c.nome)),
    }))
    .filter((l) => l.crates.length > 0);
}

/** O Markdown dos avisos, a partir das duas listas. */
export function montar({ npm, rust, versaoAbout }) {
  const partes = [
    '# Avisos de terceiros',
    '',
    'O Tomatito é distribuído sob a licença MIT (o arquivo `LICENSE`, © 2026 kbrianps). ' +
      'Ele inclui os componentes abaixo, cada um sob a própria licença, reproduzida aqui.',
    '',
    `Arquivo gerado por \`node scripts/gerar-avisos.mjs\` (cargo-about ${versaoAbout} e ${LICENSE_CHECKER}); não editar à mão.`,
    '',
    '- Os sons e o ícone do app são do próprio Tomatito, sob a mesma licença MIT.',
    '- A fonte Inter vai embutida sob a SIL Open Font License 1.1; o texto completo está em `OFL-Inter.txt`, ao lado deste arquivo.',
    '- Interface inspirada no Fluent Design. Windows e Segoe são marcas da Microsoft. O Tomatito não é afiliado à Microsoft.',
    '',
    '## Interface (pacotes npm)',
    '',
  ];
  for (const p of npm) {
    partes.push(`### ${p.nome} ${p.versao}`, '', `Licença: ${p.licenca}${p.repo ? ` · ${p.repo}` : ''}`, '');
    if (p.nome === '@fontsource-variable/inter') {
      partes.push('O texto completo da licença está em `OFL-Inter.txt`.', '');
      continue;
    }
    if (p.nota) partes.push(`O pacote não traz o arquivo da licença; o texto abaixo é o do repositório de origem (${p.nota}).`, '');
    partes.push(bloco(p.texto), '');
  }
  partes.push('## Aplicativo (crates Rust)', '');
  for (const l of rust) {
    partes.push(`### ${l.id}`, '', `Usado por: ${l.crates.map((c) => `${c.nome} ${c.versao}`).join(', ')}`, '');
    // A MPL-2.0 (seção 3.2) pede que quem recebe o executável saiba onde está o código-fonte.
    if (l.id === 'MPL-2.0') {
      partes.push(`Código-fonte: ${l.crates.map((c) => `https://crates.io/crates/${c.nome}/${c.versao}`).join(', ')}`, '');
    }
    partes.push(bloco(l.texto), '');
  }
  return partes.join('\n').replace(/\n+$/, '\n');
}

function main() {
  const conferir = process.argv.includes('--conferir');
  const versaoAbout = execFileSync('cargo', ['about', '--version'], { encoding: 'utf8' }).trim().split(/\s+/).pop();
  const md = montar({ npm: pacotesNpm(), rust: cratesRust(), versaoAbout });
  const ofl = readFileSync(OFL_ORIGEM, 'utf8');
  if (conferir) {
    const erros = [];
    if (!existsSync(SAIDA) || readFileSync(SAIDA, 'utf8') !== md) erros.push('THIRD_PARTY_NOTICES.md');
    if (!existsSync(OFL) || readFileSync(OFL, 'utf8') !== ofl) erros.push('src/assets/OFL-Inter.txt');
    if (erros.length) {
      console.error(`Desatualizado: ${erros.join(', ')}. Rode node scripts/gerar-avisos.mjs.`);
      process.exit(1);
    }
    console.log('Avisos em dia.');
    return;
  }
  writeFileSync(SAIDA, md);
  writeFileSync(OFL, ofl);
  console.log(`THIRD_PARTY_NOTICES.md: ${(md.length / 1024).toFixed(0)} KiB; OFL-Inter.txt copiado.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
