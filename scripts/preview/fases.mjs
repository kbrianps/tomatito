#!/usr/bin/env node
// Conferência do M19 (pausado, intervalo e concluído) nos dois motores, sem
// abrir janela: o Chrome headless e o WebKitGTK fora da tela, com o motor
// simulado do tauri-mock.js (que emite o tt://phase como o engine.rs) e as
// medidas __ttEstadoDaSessao, __ttOuvirAnuncios, __ttPercorrer e __ttEspaco
// de scripts/preview/medidas.js.
//
//   node scripts/preview/fases.mjs [--motor chrome|webkit|todos] [--capturas pasta]
//
// Confere:
//   - o "Pronto quando": com o relógio 60 vezes mais rápido, uma sessão de 60
//     min iniciada pelo Espaço passa por foco, intervalo, foco e ocioso com os
//     textos certos (cabeçalho e rodapé) e o traço aceso na cor de cada fase,
//     e a região aria-live recebe um texto por fase, na ordem; a volta ao
//     preparo não tem animação; a região é uma só, polite, atômica e de 1 px;
//   - pausado: o cabeçalho com " · Pausado", o número em --tt-fg-2 e o glifo
//     de play; o Espaço retoma e pausa de novo (no foco e no intervalo);
//   - intervalo: "Intervalo", o traço aceso em --tt-fg-2 e "A seguir: foco de
//     27 min" (60 min: blocos de 27,5 min);
//   - o Espaço num controle (o seletor de minutos) não inicia a sessão.
// Sai com 1 se alguma conferência falhar.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AQUI = fileURLToPath(new URL('.', import.meta.url));
const NOMES = { chrome: 'Chrome headless', webkit: 'WebKitGTK fora da tela' };

function lerArgs(argv) {
  const opts = { motor: 'todos', capturas: null };
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i].replace(/^--/, '');
    if (!(k in opts) || argv[i + 1] === undefined) throw new Error('uso: fases.mjs [--motor chrome|webkit|todos] [--capturas pasta]');
    opts[k] = argv[i + 1];
  }
  if (!['chrome', 'webkit', 'todos'].includes(opts.motor)) throw new Error(`motor desconhecido: ${opts.motor}`);
  if (opts.capturas) mkdirSync(resolve(opts.capturas), { recursive: true });
  return opts;
}

/** Roda o shot.mjs ou o webkit-shot.mjs e devolve os valores dos --eval, na ordem. */
function rodar(motor, caminho, passos, tamanho = '1000x700') {
  const script = join(AQUI, motor === 'webkit' ? 'webkit-shot.mjs' : 'shot.mjs');
  const prazo = motor === 'webkit' ? ['--timeout', '150'] : [];
  return new Promise((res, rej) => {
    const filho = spawn(process.execPath, [script, '--size', tamanho, '--path', caminho, ...prazo, ...passos], { stdio: ['ignore', 'pipe', 'pipe'] });
    let saida = '';
    let erros = '';
    filho.stdout.on('data', (d) => (saida += d));
    filho.stderr.on('data', (d) => (erros += d));
    filho.on('error', rej);
    filho.on('exit', (codigo) => {
      const valores = saida
        .split('\n')
        // As expressões dos --eval não têm " => " (nada de arrow functions).
        .filter((l) => l.includes(' => ') && l.startsWith('__tt'))
        .map((l) => JSON.parse(l.slice(l.indexOf(' => ') + 4)));
      res({ codigo, valores, erros: erros.split('\n').filter((l) => l && !/^\[console\.(log|info|debug)\]/.test(l)) });
    });
  });
}

/** O Espaço com o foco no título da tela: tecla de verdade no Chrome. */
function espaco(motor, passos) {
  // O --eval que só põe o foco começa com "(": o filtro dos valores o pula.
  if (motor === 'chrome') passos.push('--eval', `(document.querySelector('h1[tabindex="-1"]').focus(), true)`, '--key', 'Space', '--wait', '200', '--eval', '__ttEstadoDaSessao()');
  else passos.push('--eval', '__ttEspaco()');
}

async function conferir(motor, capturas, linha) {
  const pasta = capturas ?? mkdtempSync(join(tmpdir(), 'tomatito-m19-'));
  const shot = (nome) => ['--shot', join(pasta, `${motor}-${nome}.png`)];
  try {
    // 1) O "Pronto quando": 60 min a 60×, iniciada pelo Espaço.
    // O seletor vai de 30 a 60 (no debug, de 1 em 1).
    const p1 = ['--wait', '800', '--eval', '__ttOuvirAnuncios()', '--eval', '__ttSessao && (function () { for (let i = 0; i < 30; i++) __ttTeclaNoSeletor("ArrowUp"); return __ttSessao().valor; })()'];
    espaco(motor, p1);
    p1.push('--eval', '__ttPercorrer(75000)');
    const r1 = await rodar(motor, '/?pref=dark&plataforma=windows&velocidade=60&debug=1#/foco', p1);
    for (const l of r1.erros) console.log(`  aviso do ${motor}: ${l}`);
    const valor = r1.valores[1];
    const logo = r1.valores.at(-2);
    const { sequencia = [], anuncios = [], fases = [], esperado = {} } = r1.valores.at(-1) ?? {};
    const f1 = [];
    if (valor !== 60) f1.push(`o seletor ficou em ${valor}`);
    if (logo?.modo !== 'andamento') f1.push(`o Espaço não iniciou (modo ${logo?.modo})`);
    const passos = sequencia.map((s) => `${s.titulo} | ${s.rodape ?? '-'} | ${s.aceso === esperado.accent ? 'accent' : s.aceso === esperado.fg2 ? 'fg2' : s.aceso}`);
    const quer = [
      'Período de foco (1 de 2) | A seguir: intervalo de 5 min | accent',
      'Intervalo | A seguir: foco de 27 min | fg2',
      'Período de foco (2 de 2) | - | accent',
    ];
    const vistos = passos.slice(0, 3);
    if (JSON.stringify(vistos) !== JSON.stringify(quer)) f1.push(`sequência: ${JSON.stringify(passos)}`);
    const ultimo = sequencia.at(-1);
    if (ultimo?.modo !== 'preparo' || ultimo?.titulo !== 'Pronto para focar' || sequencia.length !== 4) f1.push(`fim: ${JSON.stringify(ultimo)} (${sequencia.length} estados)`);
    if (sequencia.some((s) => s.animacoes)) f1.push(`animações: ${sequencia.map((s) => s.animacoes)}`);
    linha(r1.codigo === 0 && !f1.length, `sessão de 60 min a 60×: ${sequencia.map((s) => `${(s.t / 1000).toFixed(1)} s "${s.titulo}"`).join(' → ')}`, f1);
    const textos = (anuncios ?? []).map((a) => a.texto);
    const querA = ['Começou o período de foco 1 de 2.', 'Começou o intervalo 1 de 1.', 'Começou o período de foco 2 de 2.', 'Sessão de foco concluída.'];
    linha(
      JSON.stringify(textos) === JSON.stringify(querA) && (fases ?? []).filter(Boolean).length === 4,
      `aria-live: ${textos.length} textos para ${(fases ?? []).filter(Boolean).length} tt://phase: ${textos.map((t) => `"${t}"`).join(', ')}`,
    );
    const reg = logo?.regiao;
    linha(
      reg?.live === 'polite' && reg?.atomic === 'true' && reg?.regioesLive === 1 && reg.caixa[0] <= 1 && reg.caixa[1] <= 1,
      `região: uma só (${reg?.regioesLive}), aria-live="${reg?.live}", aria-atomic="${reg?.atomic}", ${reg?.caixa?.join(' × ')} px`,
    );

    // 2) Pausado no foco: " · Pausado", número em fg2, glifo de play; o
    // Espaço retoma e pausa.
    const p2 = ['--wait', '700', '--eval', '__ttEstadoDaSessao()', ...(capturas ? shot('foco-pausado') : [])];
    espaco(motor, p2);
    espaco(motor, p2);
    const r2 = await rodar(motor, '/?pref=lite&plataforma=windows&foco=60&restante=1620000&pausado=1#/foco', p2);
    const [pausado, retomado, pausouDeNovo] = r2.valores;
    const f2 = [];
    const e2 = pausado?.cores?.esperado ?? {};
    if (pausado?.titulo !== 'Período de foco (1 de 2) · Pausado') f2.push(`título "${pausado?.titulo}"`);
    if (pausado?.cores?.numero !== e2.fg2) f2.push(`número ${pausado?.cores?.numero}, esperado ${e2.fg2}`);
    if (JSON.stringify(pausado?.principal) !== JSON.stringify({ acao: 'retomar', rotulo: 'Retomar', icone: 'play' })) f2.push(`botão ${JSON.stringify(pausado?.principal)}`);
    if (pausado?.aceso === null) f2.push('sem traço aceso');
    if (retomado?.titulo !== 'Período de foco (1 de 2)' || retomado?.cores?.numero !== e2.fg1 || retomado?.principal?.icone !== 'pause') f2.push(`Espaço: "${retomado?.titulo}", número ${retomado?.cores?.numero}, ${retomado?.principal?.icone}`);
    if (pausouDeNovo?.titulo !== 'Período de foco (1 de 2) · Pausado') f2.push(`Espaço de novo: "${pausouDeNovo?.titulo}"`);
    linha(r2.codigo === 0 && !f2.length, `pausado: "${pausado?.titulo}", número ${pausado?.cores?.numero} (fg2 ${e2.fg2}), ${pausado?.principal?.icone}; Espaço → "${retomado?.titulo}" → "${pausouDeNovo?.titulo}"`, f2);

    // 3) Intervalo, correndo e pausado.
    const r3 = await rodar(motor, '/?pref=dark&plataforma=windows&foco=60&fase=1&restante=200000#/foco', ['--wait', '700', '--eval', '__ttEstadoDaSessao()', ...(capturas ? shot('intervalo') : [])]);
    const r3b = await rodar(motor, '/?pref=dark&plataforma=windows&foco=60&fase=1&restante=200000&pausado=1#/foco', ['--wait', '700', '--eval', '__ttEstadoDaSessao()', ...(capturas ? shot('intervalo-pausado') : [])]);
    const [iv] = r3.valores;
    const [ip] = r3b.valores;
    const e3 = iv?.cores?.esperado ?? {};
    const f3 = [];
    if (iv?.titulo !== 'Intervalo' || iv?.rodape !== 'A seguir: foco de 27 min' || iv?.fase !== 'break') f3.push(`"${iv?.titulo}", "${iv?.rodape}", ${iv?.fase}`);
    if (iv?.cores?.aceso !== e3.fg2 || iv?.cores?.numero !== e3.fg1) f3.push(`traço ${iv?.cores?.aceso}, número ${iv?.cores?.numero}`);
    if (ip?.titulo !== 'Intervalo · Pausado' || ip?.cores?.numero !== e3.fg2 || ip?.cores?.aceso !== e3.fg2) f3.push(`pausado: "${ip?.titulo}", número ${ip?.cores?.numero}, traço ${ip?.cores?.aceso}`);
    linha(r3.codigo === 0 && r3b.codigo === 0 && !f3.length, `intervalo: "${iv?.titulo}", traço ${iv?.cores?.aceso} (fg2), "${iv?.rodape}"; pausado: "${ip?.titulo}"`, f3);

    // 4) O Espaço no seletor de minutos é do seletor: não inicia.
    const p4 = ['--wait', '600'];
    if (motor === 'chrome') p4.push('--eval', `(document.querySelector('[role="spinbutton"]').focus(), true)`, '--key', 'Space', '--wait', '300', '--eval', '__ttEstadoDaSessao()');
    else p4.push('--eval', `__ttSessao && (function () { const c = document.querySelector('[role="spinbutton"]'); c.focus(); c.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true })); return new Promise(function (r) { setTimeout(function () { r(__ttEstadoDaSessao()); }, 300); }); })()`);
    const r4 = await rodar(motor, '/?pref=dark&plataforma=windows#/foco', p4);
    const s4 = r4.valores.at(-1);
    linha(r4.codigo === 0 && s4?.modo === 'preparo', `Espaço no seletor de minutos: o cartão fica em "${s4?.titulo}"`);
  } finally {
    if (!capturas) rmSync(pasta, { recursive: true, force: true });
  }
}

/** Junta as capturas dos estados, lado a lado (Chrome), numa só. */
function juntar(pasta, saida) {
  const py = `
import sys
from PIL import Image
pasta, saida = sys.argv[1], sys.argv[2]
nomes = ['foco-pausado', 'intervalo', 'intervalo-pausado']
ims = [Image.open(f'{pasta}/chrome-{n}.png').convert('RGB') for n in nomes]
# O cartão de sessão (1000 × 700: de 313,113 a 633,535), com 12 px de margem.
cortes = [im.crop((301, 101, 645, 547)) for im in ims]
w = sum(c.width for c in cortes) + 16 * (len(cortes) - 1)
out = Image.new('RGB', (w, cortes[0].height), (128, 128, 128))
x = 0
for c in cortes:
    out.paste(c, (x, 0)); x += c.width + 16
out.save(saida, optimize=True)
`;
  const r = spawnSync('python3', ['-c', py, pasta, saida], { encoding: 'utf8' });
  if (r.status !== 0) console.log(`aviso: não juntou as capturas: ${r.stderr}`);
}

async function main() {
  const opts = lerArgs(process.argv.slice(2));
  const motores = opts.motor === 'todos' ? ['chrome', 'webkit'] : [opts.motor];
  let falhou = false;
  const linha = (ok, texto, falhas = []) => {
    if (!ok) falhou = true;
    console.log(`${ok ? 'ok   ' : 'FALHA'} ${texto}${falhas.length ? `\n        ${falhas.join('\n        ')}` : ''}`);
  };
  for (const motor of motores) {
    console.log(`\n${NOMES[motor]}`);
    await conferir(motor, opts.capturas && resolve(opts.capturas), linha);
  }
  if (opts.capturas && motores.includes('chrome')) juntar(resolve(opts.capturas), join(resolve(opts.capturas), 'm19-estados.png'));
  process.exitCode = falhou ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
