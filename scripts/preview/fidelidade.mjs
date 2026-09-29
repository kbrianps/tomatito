#!/usr/bin/env node
// Capturas da revisão de fidelidade (M42), no Chrome headless, sem abrir
// janela. Cada tela sai no tamanho de janela da captura do Relógio que lhe
// serve de referência (em ~/dev/tomatito-ref/), com a mesma densidade (1,75):
//
//   tela            referência                          px CSS       px
//   foco            clock-focus-sessions-page.png       1372 × 936   2401 × 1638
//   foco-sessao     crop-insession.png (recorte do
//                   cartão; a janela é a da tela Foco)  1372 × 936   2401 × 1638
//   temporizador    timers-in-clock-app.png             1372 × 936   2401 × 1638
//   cronometro      stopwatch-in-clock-app.png          1372 × 936   2401 × 1638
//   configuracoes   clock-focus-sessions-settings.png   1372 × 1012  2401 × 1771
//
// O estado de cada tela imita o da referência: duas tarefas na tela Foco; a
// sessão de 60 min no primeiro foco, com 27 min restantes; os quatro
// temporizadores padrão parados; o cronômetro correndo a partir de 1,87 s; e
// os cartões expansíveis das Configurações abertos. Com plataforma=windows
// (a barra de título e os tamanhos de texto do Windows; a prévia não tem a
// Segoe UI, e o texto sai na fonte de reserva).
//
//   node scripts/preview/fidelidade.mjs [--temas light,dark] [--pasta docs/capturas]
//
// Salva <pasta>/fidelidade-<tela>-<tema>.png, com o tema em português
// (claro, escuro, lite, suave). Nunca monta imagens com o Relógio: a
// comparação lado a lado é feita fora do repositório (docs/fidelidade.md).
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = fileURLToPath(new URL('.', import.meta.url));
const NOMES = { light: 'claro', dark: 'escuro', lite: 'lite', suave: 'suave' };
// O esquema do sistema emulado: o Lite e o Suave são escuros (4.1).
const ESQUEMA = { light: 'light', dark: 'dark', lite: 'dark', suave: 'dark' };

const ABRIR_EXPANSORES =
  "document.querySelectorAll('[data-expansor][aria-expanded=\"false\"]').forEach((b) => b.click()), true";

const TELAS = [
  ['foco', 'tarefas=Enviar a captura|Tirar uma captura do app#/foco', '1372x936', []],
  ['foco-sessao', 'foco=60&restante=1620000&tarefas=Enviar a captura|Tirar uma captura do app&tarefa=1#/foco', '1372x936', []],
  ['temporizador', '#/temporizador', '1372x936', []],
  ['cronometro', 'cronometro=running@1870#/cronometro', '1372x936', []],
  ['configuracoes', '#/configuracoes', '1372x1012', ['--eval', ABRIR_EXPANSORES]],
];

function lerArgs(argv) {
  const opts = { temas: 'light,dark', pasta: 'docs/capturas' };
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i].replace(/^--/, '');
    if (!(k in opts) || argv[i + 1] === undefined) throw new Error('uso: fidelidade.mjs [--temas light,dark] [--pasta docs/capturas]');
    opts[k] = argv[i + 1];
  }
  const temas = opts.temas.split(',');
  for (const t of temas) if (!(t in NOMES)) throw new Error(`tema desconhecido: ${t}`);
  return { temas, pasta: resolve(opts.pasta) };
}

function rodar(args) {
  return new Promise((res) => {
    const p = spawn(process.execPath, [join(AQUI, 'shot.mjs'), ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let saida = '';
    p.stdout.on('data', (d) => (saida += d));
    p.stderr.on('data', (d) => (saida += d));
    p.on('close', (codigo) => res({ codigo, saida }));
  });
}

const { temas, pasta } = lerArgs(process.argv.slice(2));
mkdirSync(pasta, { recursive: true });
let falhou = false;
for (const tema of temas) {
  for (const [tela, estado, tamanho, passos] of TELAS) {
    const [consulta, rota] = estado.includes('#') ? estado.split('#') : [estado, ''];
    const caminho = encodeURI(`/?pref=${tema}&plataforma=windows${consulta ? `&${consulta}` : ''}#${rota}`);
    const [l, a] = tamanho.split('x').map(Number);
    const arquivo = join(pasta, `fidelidade-${tela}-${NOMES[tema]}.png`);
    const r = await rodar([
      '--size', tamanho, '--scheme', ESQUEMA[tema], '--path', caminho,
      '--resize', `${Math.round(l * 1.75)}x${Math.round(a * 1.75)}@1.75`,
      '--wait', '1200', ...passos, '--wait', '400', '--shot', arquivo,
    ]);
    const ok = r.codigo === 0;
    if (!ok) falhou = true;
    console.log(`${ok ? 'ok   ' : 'FALHA'} ${arquivo}`);
    if (!ok) console.log(r.saida);
  }
}
process.exit(falhou ? 1 : 0);
