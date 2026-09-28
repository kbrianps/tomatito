#!/usr/bin/env node
// Conferência do tingimento (M22) com o ponteiro de verdade do Chrome headless,
// sem abrir janela. No #/dev, em cada tema (lite, suave, light, dark e full):
// abre o menu "..." da sessão e passa o mouse no primeiro item, depois aperta
// (sem soltar); abre a lista "Meta diária", passa o mouse na segunda opção e
// aperta. Em cada estado, lê o fundo e o texto que o componente pinta
// (__ttPintura, em scripts/preview/medidas.js) e confere:
//   - o fundo é exatamente o token do gerado para o estado (o hover da opção e
//     do item é o colorNeutralBackground1Hover; o pressionado da opção, o
//     Background1Pressed; o do item de menu, o Background1Selected);
//   - no Lite e no Full, o fundo é vermelho (croma OKLCH ≥ 0,1, matiz 20–45°);
//     no Suave, rosado (croma ≥ 0,01, mesmo matiz); nenhum dos dois é cinza;
//   - no Claro e no Escuro, continuam os cinzas de fábrica;
//   - o texto sobre o fundo fica em 4,5:1 ou mais.
// Com --capturas, salva o menu no hover de cada tema.
//
//   node scripts/preview/tingimento.mjs [--capturas pasta]
//
// O WebKitGTK fora da tela (webkit-shot.mjs) não tem ponteiro; lá, os tokens
// que viram esses fundos são conferidos pelo temas-fluent.mjs.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { TEMAS as FONTES, temasFluent } from '../build-theme-css.mjs';
import { contraste, lerCor } from '../contrast.mjs';
import { oklabParaOklch, srgbParaOklab } from '../oklch.mjs';

const AQUI = fileURLToPath(new URL('.', import.meta.url));
const RAIZ = new URL('../..', import.meta.url);
const gerados = temasFluent(readFileSync(new URL('src/styles/tokens.css', RAIZ), 'utf8'));
const FONTE = Object.fromEntries(FONTES);
const rgb = (hex) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;

const MENU = 'fluent-menu[data-amostra="menu-sessao"] fluent-menu-item';
const OPCAO = 'fluent-dropdown[data-amostra="meta"] fluent-option:nth-of-type(2)';

// [rótulo, seletor, passo do ponteiro, token do fundo esperado]
export const ESTADOS = [
  ['item de menu no hover', MENU, 'hover', 'colorNeutralBackground1Hover'],
  ['item de menu pressionado', MENU, 'press', 'colorNeutralBackground1Selected'],
  ['opção no hover', OPCAO, 'hover', 'colorNeutralBackground1Hover'],
  ['opção pressionada', OPCAO, 'press', 'colorNeutralBackground1Pressed'],
];

const TEMAS = ['lite', 'suave', 'light', 'dark', 'full'];

/** Confere uma medida; devolve a lista de falhas. */
export function conferirEstado(tema, [rotulo, , passo, token], m) {
  const falhas = [];
  const esperado = rgb(gerados[FONTE[tema]][token]);
  if (!m || m.fundo !== esperado) falhas.push(`fundo ${m?.fundo}, esperado ${esperado} (--${token})`);
  if (m && !m.hover) falhas.push('não está em :hover');
  if (m && passo === 'press' && !m.ativo) falhas.push('não está em :active');
  if (m) {
    const [, C, h] = oklabParaOklch(srgbParaOklab(lerCor(m.fundo)));
    const matiz = h >= 20 && h <= 45;
    if ((tema === 'lite' || tema === 'full') && !(C >= 0.1 && matiz)) falhas.push(`não é vermelho (croma ${C.toFixed(3)}, ${h.toFixed(0)}°)`);
    if (tema === 'suave' && !(C >= 0.01 && matiz)) falhas.push(`não é rosado (croma ${C.toFixed(3)}, ${h.toFixed(0)}°)`);
    if ((tema === 'light' || tema === 'dark') && C > 0.002) falhas.push(`o ${tema} deveria continuar cinza (croma ${C.toFixed(3)})`);
    const c = contraste(lerCor(m.cor), lerCor(m.fundo));
    if (c < 4.5) falhas.push(`texto ${m.cor} a ${c.toFixed(2)}:1`);
    m.contraste = c;
    m.croma = C;
  }
  return falhas.map((f) => `${rotulo}: ${f}`);
}

function passos(tema, capturas) {
  const p = ['--eval', `__ttTema(${JSON.stringify(tema)})`];
  for (const [nome, estados] of [['menu-sessao', ESTADOS.slice(0, 2)], ['meta', ESTADOS.slice(2)]]) {
    p.push('--eval', `__ttPosicionar(${JSON.stringify(nome)})`, '--eval', `__ttAbrir(${JSON.stringify(nome)})`);
    for (const [rotulo, seletor, passo] of estados) {
      p.push(`--${passo}`, seletor, '--wait', '250', '--eval', `__ttPintura(${JSON.stringify(seletor)})`);
      if (capturas && rotulo === 'item de menu no hover') p.push('--shot', join(capturas, `m22-${tema}-menu-hover.png`));
      if (capturas && rotulo === 'opção no hover') p.push('--shot', join(capturas, `m22-${tema}-opcao-hover.png`));
    }
  }
  return p;
}

function rodar(tema, capturas) {
  // Um Chrome por tema: o botão apertado de um estado não vaza para o seguinte.
  const args = [join(AQUI, 'shot.mjs'), '--size', '1000x700', '--path', '/?plataforma=linux#/dev', ...passos(tema, capturas)];
  return new Promise((res, rej) => {
    const filho = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let saida = '';
    let erros = '';
    filho.stdout.on('data', (d) => (saida += d));
    filho.stderr.on('data', (d) => (erros += d));
    filho.on('error', rej);
    filho.on('exit', (codigo) => {
      const pinturas = saida
        .split('\n')
        .filter((l) => l.startsWith('__ttPintura('))
        .map((l) => JSON.parse(l.slice(l.indexOf(' => ') + 4)));
      res({ codigo, pinturas, erros: erros.split('\n').filter((l) => l && !/^\[console\.(log|info|debug)\]/.test(l)) });
    });
  });
}

async function main() {
  const argv = process.argv.slice(2);
  let capturas = null;
  if (argv.length) {
    if (argv[0] !== '--capturas' || !argv[1] || argv.length > 2) throw new Error('uso: tingimento.mjs [--capturas pasta]');
    capturas = resolve(argv[1]);
    mkdirSync(capturas, { recursive: true });
  }
  let falhou = false;
  for (const tema of TEMAS) {
    const r = await rodar(tema, capturas);
    if (r.codigo !== 0 || r.pinturas.length !== ESTADOS.length) {
      falhou = true;
      console.log(`FALHA ${tema}: o Chrome saiu com ${r.codigo} e ${r.pinturas.length} de ${ESTADOS.length} medidas`);
      for (const l of r.erros) console.log(`  ${l}`);
      continue;
    }
    ESTADOS.forEach((estado, i) => {
      const m = r.pinturas[i];
      const f = conferirEstado(tema, estado, m);
      if (f.length) falhou = true;
      console.log(
        `${f.length ? 'FALHA' : 'ok   '} ${tema}, ${estado[0]}: fundo ${m.fundo} (croma ${m.croma.toFixed(3)}), texto ${m.cor} a ${m.contraste.toFixed(2)}:1` +
          (f.length ? `\n        ${f.join('\n        ')}` : ''),
      );
    });
  }
  console.log(falhou ? '\nFALHOU' : '\nTudo ok.');
  process.exitCode = falhou ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err.message ?? err);
    process.exit(1);
  });
}
