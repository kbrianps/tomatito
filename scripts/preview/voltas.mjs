#!/usr/bin/env node
// Conferência do M35 (voltas do cronômetro) nos dois motores, sem abrir
// janela: o Chrome headless e o WebKitGTK fora da tela. Usa o shot.mjs e o
// webkit-shot.mjs com __ttVoltas, __ttCopiarVoltas e __ttSelecionarVoltas de
// scripts/preview/medidas.js e o cronômetro do tauri-mock.js.
//
//   node scripts/preview/voltas.mjs [--motor chrome|webkit|todos] [--capturas pasta]
//
// Confere:
//   1. correndo sem voltas: a lista não aparece;
//   2. L três vezes, com o foco fora dos botões: três linhas, a mais nova em
//      cima, com o número, o tempo da volta (total menos o anterior) e o
//      total, em hh:mm:ss,cc; colunas alinhadas à direita (números tabulares),
//      texto selecionável;
//   3. vindo do Rust (?cronometro=paused@3725999&voltas=2345,7000,3725999):
//      as linhas exatas; "Copiar" pela API e pela via antiga dá o mesmo texto,
//      cabeçalho mais linhas, separado por tabulação, igual ao da tela, e
//      mostra "Voltas copiadas"; o foco fica no botão;
//   4. Redefinir: a lista some;
//   5. Claro, Lite e a janela mínima (480 × 500), sem rolagem lateral.
// Sai com 1 se alguma conferência falhar.
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = fileURLToPath(new URL('.', import.meta.url));
const NOMES = { chrome: 'Chrome headless', webkit: 'WebKitGTK fora da tela' };

function lerArgs(argv) {
  const opts = { motor: 'todos', capturas: null };
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i].replace(/^--/, '');
    if (!(k in opts) || argv[i + 1] === undefined) throw new Error('uso: voltas.mjs [--motor chrome|webkit|todos] [--capturas pasta]');
    opts[k] = argv[i + 1];
  }
  if (!['chrome', 'webkit', 'todos'].includes(opts.motor)) throw new Error(`motor desconhecido: ${opts.motor}`);
  if (opts.capturas) mkdirSync(resolve(opts.capturas), { recursive: true });
  return opts;
}

function rodar(motor, caminho, passos, { tamanho = '1372x936', esquema = 'dark' } = {}) {
  const script = join(AQUI, motor === 'webkit' ? 'webkit-shot.mjs' : 'shot.mjs');
  const extra = motor === 'webkit' ? ['--timeout', '90'] : ['--scheme', esquema];
  const args = [script, '--size', tamanho, ...extra, '--path', caminho, ...passos];
  return new Promise((res, rej) => {
    const filho = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let saida = '';
    let erros = '';
    filho.stdout.on('data', (d) => (saida += d));
    filho.stderr.on('data', (d) => (erros += d));
    filho.on('error', rej);
    filho.on('exit', (codigo) => {
      const valores = saida
        .split('\n')
        .filter((l) => l.includes(' => ') && l.startsWith('__tt'))
        .map((l) => JSON.parse(l.slice(l.indexOf(' => ') + 4)));
      res({ codigo, valores, erros: erros.split('\n').filter((l) => l && !/^\[console\.(log|info|debug)\]/.test(l)) });
    });
  });
}

const ESPERADO = [
  ['3', '01:01:58,99', '01:02:05,99'],
  ['2', '00:00:04,65', '00:00:07,00'],
  ['1', '00:00:02,34', '00:00:02,34'],
];
const TEXTO = [['Volta', 'Tempo', 'Total'], ...ESPERADO].map((l) => l.join('\t')).join('\n');
const HMS = /^\d{2}:\d{2}:\d{2},\d{2}$/;

async function conferir(motor, capturas, linha) {
  const pasta = capturas ?? mkdtempSync(join(tmpdir(), 'tomatito-m35-'));
  const falhas = [];
  const quer = (nome, v, esperado) => JSON.stringify(v) !== JSON.stringify(esperado) && falhas.push(`${nome}: ${JSON.stringify(v)}, esperado ${JSON.stringify(esperado)}`);

  // 1, 2 e 4: o fluxo pelo teclado.
  const a = await rodar(motor, '/?pref=dark&plataforma=windows#/cronometro', [
    '--wait', '800',
    '--eval', '__ttClicarNoCronometro("iniciar")',
    '--eval', '__ttVoltas()',
    '--wait', '300', '--eval', '__ttTeclaNoCronometro("l", "nada")',
    '--wait', '300', '--eval', '__ttTeclaNoCronometro("l", "nada")',
    '--wait', '300', '--eval', '__ttTeclaNoCronometro("l", "nada")',
    '--wait', '200',
    '--eval', '__ttVoltas()',
    '--shot', join(pasta, `${motor}-m35-correndo.png`),
    '--eval', '__ttClicarNoCronometro("pausar")',
    '--eval', '__ttClicarNoCronometro("redefinir")',
    '--eval', '__ttVoltas()',
  ]);
  const [, sem, , , , com, , , depois] = a.valores;
  if (a.codigo !== 0 || !depois) {
    linha(false, `${motor}: a prévia do fluxo saiu com ${a.codigo} e ${a.valores.length} medida(s)`, a.erros);
    return;
  }
  quer('sem voltas, a lista não aparece', sem.visivel, false);
  quer('três voltas', com.linhas?.map((l) => l[0]), ['3', '2', '1']);
  quer('cabeçalho', com.cabecalho, ['Volta', 'Tempo', 'Total']);
  if (!com.linhas?.every((l) => HMS.test(l[1]) && HMS.test(l[2]))) falhas.push(`formato: ${JSON.stringify(com.linhas)}`);
  const ms = (t) => { const [h, m, s] = t.split(':'); return ((+h * 60 + +m) * 60 + parseFloat(s.replace(',', '.'))) * 1000; };
  // O total da volta n é o total da n−1 mais o tempo da n (a menos do corte em centésimos).
  const ordem = [...(com.linhas ?? [])].reverse();
  ordem.forEach((l, i) => {
    const anterior = i ? ms(ordem[i - 1][2]) : 0;
    if (Math.abs(anterior + ms(l[1]) - ms(l[2])) > 10.5) falhas.push(`volta ${l[0]}: ${ordem[i - 1]?.[2] ?? '0'} + ${l[1]} ≠ ${l[2]}`);
  });
  quer('colunas alinhadas', com.alinhadas, true);
  quer('números tabulares', com.tabular, 'tabular-nums');
  quer('selecionável', com.selecionavel, 'text');
  quer('redefinir esconde a lista', depois.visivel, false);

  // 3: vindo do Rust, e o "Copiar".
  const b = await rodar(motor, '/?pref=dark&plataforma=windows&cronometro=paused@3725999&voltas=2345,7000,3725999#/cronometro', [
    '--wait', '800',
    '--eval', '__ttVoltas()',
    '--eval', '__ttCopiarVoltas("api")',
    '--eval', '__ttCopiarVoltas("antiga")',
    '--eval', '__ttSelecionarVoltas()',
    '--shot', join(pasta, `${motor}-m35-copiado.png`),
  ]);
  const [v, api, antiga, selecao] = b.valores;
  if (b.codigo !== 0 || !selecao) {
    linha(false, `${motor}: a prévia do Copiar saiu com ${b.codigo} e ${b.valores.length} medida(s)`, b.erros);
    return;
  }
  quer('linhas vindas do Rust', v.linhas, ESPERADO);
  quer('Copiar pela API', api.recebido, TEXTO);
  quer('Copiar pela via antiga', antiga.recebido, TEXTO);
  quer('aviso', [api.aviso, antiga.aviso], ['Voltas copiadas', 'Voltas copiadas']);
  quer('botão Copiar', v.copiarTexto, 'Copiar');
  if (v.copiar[1] !== 32) falhas.push(`altura do Copiar ${v.copiar[1]}`);
  // A seleção à mão também traz os números (o separador entre células é do motor).
  for (const l of ESPERADO) for (const c of l) if (!selecao.includes(c)) falhas.push(`seleção sem ${c}`);

  // 5: Claro, Lite e a janela mínima.
  const tamanhos = [
    ['claro', '/?pref=light&plataforma=windows&cronometro=running@125000&voltas=2345,7000,65000,125000#/cronometro', '1372x936', 'light'],
    ['lite', '/?pref=lite&plataforma=linux&cronometro=running@125000&voltas=2345,7000,65000,125000#/cronometro', '1000x700', 'dark'],
    ['estreito', '/?pref=dark&plataforma=linux&cronometro=paused@125000&voltas=2345,7000,65000,125000#/cronometro', '480x500', 'dark'],
  ];
  for (const [nome, caminho, tamanho, esquema] of tamanhos) {
    const r = await rodar(motor, caminho, ['--wait', '800', '--eval', '__ttVoltas()', '--shot', join(pasta, `${motor}-m35-${nome}.png`)], { tamanho, esquema });
    const m = r.valores[0];
    if (!m?.visivel) falhas.push(`${nome}: lista não apareceu (${r.codigo})`);
    else {
      if (m.transbordaLado) falhas.push(`${nome}: rolagem lateral`);
      if (!m.alinhadas) falhas.push(`${nome}: colunas desalinhadas`);
      quer(`${nome}: linhas`, m.linhas.length, 4);
    }
  }
  for (const l of [...a.erros, ...b.erros]) console.log(`  aviso do ${motor}: ${l}`);
  linha(!falhas.length, `${NOMES[motor]}: voltas, Copiar e tamanhos`, falhas);
  console.log(`  capturas em ${pasta}`);
}

const opts = lerArgs(process.argv.slice(2));
let falhou = false;
const linha = (ok, texto, detalhes = []) => {
  console.log(`${ok ? 'ok   ' : 'FALHA'} ${texto}`);
  for (const d of detalhes) console.log(`      ${d}`);
  if (!ok) falhou = true;
};
for (const motor of opts.motor === 'todos' ? ['chrome', 'webkit'] : [opts.motor]) await conferir(motor, opts.capturas, linha);
process.exit(falhou ? 1 : 0);
