#!/usr/bin/env node
// Conferência das faixas da região do tomate (M53; PLANO.md, 5.4), sem abrir
// janela, com o mock do Tauri, em dois motores: o Chrome headless (o
// Chromium do WebView2, com as escalas do Windows) e o WebKitGTK fora da tela
// (o motor do app no Linux, pelo webkit-shot.py). Para cada caso (lado e
// escala), abre o tomato.html sem a sombra (a plataforma windows, onde o CSS
// a tira; no Linux a sombra fica fora da região por desenho, 5.6), calcula as
// faixas pela própria página e compara com a captura (regiao_pixels.py):
//   1. cobertura: todo pixel que a página pinta (alfa acima de 0: corpo,
//      cabinho, cálice, anel, textos e botões) está numa faixa;
//   2. folga: nenhum pixel da região fica a mais de 2 px (entre centros de
//      pixel) do pixel pintado mais perto;
//   3. no máximo 300 retângulos (nos três tamanhos do plano, com escala 1);
//   4. o cálculo leva menos de 20 ms: o primeiro, na partida da página (frio,
//      o do tomato.js), e a mediana e o pior de 21 seguidos. No WebKitGTK, o
//      performance.now() tem resolução de 1 ms.
// Os casos com escala 1,25 e 1,5 (só no Chrome) são os do Windows (px
// físicos, M55): contam para a cobertura, a folga e o tempo; a contagem só é
// anotada.
//
//   node scripts/preview/regiao.mjs [--capturas pasta]
//
// Com --capturas, salva também o tomate com a sobreposição de debug, a 280 px,
// nos dois motores. Com TT_MANTER=1, a pasta temporária das capturas fica.
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = fileURLToPath(new URL('.', import.meta.url));
const CAMINHO = '/tomato.html?pref=full&plataforma=windows';
const MOTORES = {
  chrome: {
    script: 'shot.mjs',
    opcoes: ['--fundo', 'transparente'],
    casos: [
      [240, 1],
      [280, 1],
      [320, 1],
      [240, 1.25],
      [280, 1.5],
      [320, 1.5],
    ],
    fundo: null,
  },
  // A janela fora da tela do webkit-shot.py tem fundo opaco (o do tema GTK
  // escuro); pintado é o que tem outra cor.
  webkit: { script: 'webkit-shot.mjs', opcoes: [], casos: [[240, 1], [280, 1], [320, 1]], fundo: '30,30,30' },
};
const LIMITES = { retangulos: 300, folga: 2, ms: 20 };

// Na página: o cálculo da partida (o do tomato.js, pelo __ttRegiao do dev) e
// 21 cálculos seguidos no tamanho atual.
const MEDIR = `import('/src/lib/regiao.js').then((m) => {
  const lado = innerWidth, escala = devicePixelRatio, t = [];
  let faixas;
  for (let i = 0; i < 21; i++) { const a = performance.now(); faixas = m.regionStrips(lado, escala); t.push(performance.now() - a); }
  t.sort((a, b) => a - b);
  const partida = window.__ttRegiaoPartida ??= window.__ttRegiao.regiao().ms;
  return { lado, escala, partida, mediana: t[10], max: t[20], faixas };
})`.replace(/\s*\n\s*/g, ' ');

function processo(cmd, args) {
  return new Promise((res, rej) => {
    const filho = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let saida = '';
    let erros = '';
    filho.stdout.on('data', (d) => (saida += d));
    filho.stderr.on('data', (d) => (erros += d));
    filho.on('error', rej);
    filho.on('exit', (codigo) => res({ codigo, saida, erros }));
  });
}

async function pixels(png, faixas, fundo) {
  const json = `${png}.json`;
  writeFileSync(json, JSON.stringify(faixas));
  const r = await processo('python3', [join(AQUI, 'regiao_pixels.py'), png, json, ...(fundo ? [fundo] : [])]);
  if (r.codigo !== 0) throw new Error(`regiao_pixels.py saiu com ${r.codigo}: ${r.erros}`);
  return JSON.parse(r.saida);
}

const virgula = (x) => String(x).replace('.', ',');
const fmt = (ms) => virgula(Number(ms.toFixed(1)));

async function conferir(nome, motor, pasta, capturas, relatar) {
  const { script, opcoes, casos, fundo } = MOTORES[motor];
  const [l0, e0] = casos[0];
  const args = ['--size', `${l0}x${l0}`, ...opcoes, '--path', CAMINHO];
  for (const [lado, escala] of casos) {
    const n = Math.round(lado * escala);
    const tamanho = motor === 'chrome' ? `${n}x${n}@${escala}` : `${n}x${n}`;
    if (lado !== l0 || escala !== e0) args.push('--resize', tamanho);
    args.push('--wait', '200', '--eval', MEDIR, '--shot', join(pasta, `${motor}-${lado}@${escala}.png`));
  }
  if (capturas) {
    args.push('--resize', '280x280', '--eval', '__ttRegiao.mostrar(true)', '--wait', '200', '--shot', join(capturas, `m53-regiao-${motor}-280.png`));
  }
  const r = await processo(process.execPath, [join(AQUI, script), ...args]);
  const medidas = r.saida
    .split('\n')
    .filter((l) => l.startsWith("import('/src/lib/regiao.js')"))
    .map((l) => JSON.parse(l.slice(l.lastIndexOf(' => ') + 4)));
  const errosDaPagina = r.erros.split('\n').filter((l) => l.trim() && !/^\[console\.(log|info|debug)\]/.test(l));
  if (r.codigo !== 0 || medidas.length !== casos.length) {
    console.error(r.saida, r.erros);
    throw new Error(`${nome}: a prévia saiu com ${r.codigo} e ${medidas.length} de ${casos.length} medidas`);
  }
  relatar(errosDaPagina.length === 0, `${nome}: sem erros na página${errosDaPagina.length ? `: ${errosDaPagina.join(' | ')}` : ''}`);
  relatar(medidas[0].partida < LIMITES.ms, `${nome}: cálculo na partida da página (frio, ${medidas[0].lado} px): ${fmt(medidas[0].partida)} ms`);
  const resumo = [];
  for (const [k, [lado, escala]] of casos.entries()) {
    const m = medidas[k];
    const caso = `${nome}, ${lado} px${escala === 1 ? '' : ` × ${virgula(escala)}`}`;
    const p = await pixels(join(pasta, `${motor}-${lado}@${escala}.png`), m.faixas, fundo);
    const n = Math.round(lado * escala);
    relatar(m.lado === lado && m.escala === escala && p.lado === n, `${caso}: página de ${m.lado} px CSS × ${virgula(m.escala)}, captura de ${p.lado} px`);
    relatar(p.fora === 0, `${caso}: cobre os ${p.pintados} pixels pintados (fora: ${p.fora}${p.fora ? `, por ex. ${JSON.stringify(p.fora_exemplos)}` : ''})`);
    relatar(
      p.folga_max !== null && p.folga_max <= LIMITES.folga,
      `${caso}: folga de até ${virgula(p.folga_max)} px (pixels só da região por distância ao pintado: ${JSON.stringify(p.folga)}; menor folga: ${virgula(p.folga_min)} px)`,
    );
    if (escala === 1) relatar(m.faixas.length <= LIMITES.retangulos, `${caso}: ${m.faixas.length} retângulos`);
    else console.log(`      ${caso}: ${m.faixas.length} retângulos (anotado)`);
    relatar(m.max < LIMITES.ms, `${caso}: cálculo em ${fmt(m.mediana)} ms (mediana de 21), ${fmt(m.max)} ms no pior`);
    resumo.push({ lado, escala, faixas: m.faixas });
  }
  return resumo;
}

async function main() {
  const i = process.argv.indexOf('--capturas');
  const capturas = i > 0 ? resolve(process.argv[i + 1]) : null;
  if (capturas) mkdirSync(capturas, { recursive: true });
  const pasta = mkdtempSync(join(tmpdir(), 'tomatito-regiao-'));
  let falhas = 0;
  const relatar = (ok, texto) => {
    if (!ok) falhas++;
    console.log(`${ok ? 'ok   ' : 'FALHA'} ${texto}`);
  };
  try {
    const chrome = await conferir('Chrome', 'chrome', pasta, capturas, relatar);
    const webkit = await conferir('WebKitGTK', 'webkit', pasta, capturas, relatar);
    // Os dois motores rasterizam as mesmas formas; a diferença fica na borda.
    for (const w of webkit) {
      const c = chrome.find((x) => x.lado === w.lado && x.escala === w.escala);
      const igual = JSON.stringify(c.faixas) === JSON.stringify(w.faixas);
      console.log(`      ${w.lado} px: faixas ${igual ? 'iguais' : 'diferentes'} no Chrome e no WebKitGTK (${c.faixas.length} e ${w.faixas.length})`);
    }
    if (capturas) console.log(`capturas: ${capturas}/m53-regiao-{chrome,webkit}-280.png`);
    console.log(falhas ? `${falhas} falha(s)` : 'tudo ok');
    process.exitCode = falhas ? 1 : 0;
  } finally {
    if (process.env.TT_MANTER) console.log(`capturas da conferência: ${pasta}`);
    else rmSync(pasta, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
