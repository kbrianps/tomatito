#!/usr/bin/env node
// Conferência do M30 (cartão "Tarefas") nos dois motores, sem abrir janela:
// o Chrome headless (o Chromium do WebView2 no Windows) e o WebKitGTK fora da
// tela (o motor do app no Linux). Usa o shot.mjs e o webkit-shot.mjs com as
// medidas __ttTarefas* de scripts/preview/medidas.js e o task_* e o
// focus_start do tauri-mock.js.
//
//   node scripts/preview/tarefas.mjs [--motor chrome|webkit|todos] [--capturas pasta]
//
// Confere:
//   - sem tarefas: o cabeçalho (checkmark_circle, "Tarefas", "+" e "…"), o
//     estado vazio "Mantenha o rumo" com "Adicionar tarefa", e esse botão
//     abrindo o campo com o foco;
//   - o "Pronto quando" na prévia: 3 tarefas adicionadas pelo campo (Enter),
//     na ordem; uma escolhida ("Escolhida", aria-pressed); "Iniciar sessão
//     de foco" manda o taskId; na sessão, "Você está focando em", a tarefa da
//     sessão em --tt-fg-1 e as outras em --tt-fg-2; concluir a tarefa (check
//     preenchido, texto em --tt-fg-2) e a sessão (1 min a 60×) grava o
//     período com o taskId;
//   - as linhas: 41 px de altura, raio 4 e fundo --tt-bg-surface;
//   - Esc no campo o fecha e devolve o foco ao "+"; título vazio não envia;
//     título recusado mostra o aviso;
//   - a sessão aberta com ?tarefa= (o retrato manda, como depois de reabrir o
//     app no meio da sessão);
//   - os quatro temas, com a escolhida e na sessão (capturas);
//   - controle negativo: com as linhas sem o esmaecimento, a conferência da
//     cor acusa.
// Sai com 1 se alguma conferência falhar.
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AQUI = fileURLToPath(new URL('.', import.meta.url));
const NOMES = { chrome: 'Chrome headless', webkit: 'WebKitGTK fora da tela' };
// ?debug=1: o seletor começa em 1 min; ?velocidade=60: 1 min passa em 1 s.
const BASE = '/?plataforma=windows&debug=1&velocidade=60';
const TRES = ['Ler o capítulo 3', 'Lista de exercícios 2', 'Revisar as notas'];

function lerArgs(argv) {
  const opts = { motor: 'todos', capturas: null };
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i].replace(/^--/, '');
    if (!(k in opts) || argv[i + 1] === undefined) throw new Error('uso: tarefas.mjs [--motor chrome|webkit|todos] [--capturas pasta]');
    opts[k] = argv[i + 1];
  }
  if (!['chrome', 'webkit', 'todos'].includes(opts.motor)) throw new Error(`motor desconhecido: ${opts.motor}`);
  if (opts.capturas) mkdirSync(resolve(opts.capturas), { recursive: true });
  return opts;
}

/** Roda o shot.mjs ou o webkit-shot.mjs e devolve os valores dos --eval de __tt*, na ordem. */
function rodar(motor, caminho, passos, { tamanho = '1372x936' } = {}) {
  const script = join(AQUI, motor === 'webkit' ? 'webkit-shot.mjs' : 'shot.mjs');
  const args = [script, '--size', tamanho, '--path', caminho, ...passos];
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

const js = (v) => JSON.stringify(v);

/** Linhas de 41 px, raio 4 e fundo --tt-bg-surface; devolve as falhas. */
export function conferirLinhas(m) {
  const f = [];
  for (const l of m?.linhas ?? []) {
    if (Math.abs(l.altura - 41) > 0.5) f.push(`linha ${l.id}: altura ${l.altura}`);
    if (l.raio !== '4px') f.push(`linha ${l.id}: raio ${l.raio}`);
    if (l.fundo !== m.tokens.superficie) f.push(`linha ${l.id}: fundo ${l.fundo}, esperado ${m.tokens.superficie}`);
  }
  return f;
}

/** Na sessão: a tarefa da sessão em fg-1, as outras em fg-2; devolve as falhas. */
export function conferirSessao(m, idDaSessao) {
  const f = [];
  if (m?.subtitulo !== 'Você está focando em') f.push(`subtítulo: ${m?.subtitulo}`);
  for (const l of m?.linhas ?? []) {
    const esperado = l.id === idDaSessao && !l.marcada ? m.tokens.fg1 : m.tokens.fg2;
    if (l.corDoTitulo !== esperado) f.push(`linha ${l.id} (${l.titulo}): cor ${l.corDoTitulo}, esperado ${esperado}`);
    if (l.escolher) f.push(`linha ${l.id}: "Escolher" na sessão`);
    if ((l.id === idDaSessao) !== l.daSessao) f.push(`linha ${l.id}: da sessão ${l.daSessao}`);
  }
  return f;
}

async function conferir(motor, capturas, linha) {
  const pasta = capturas ?? mkdtempSync(join(tmpdir(), 'tomatito-m30-'));
  try {
    // 1) Vazio, o campo, 3 tarefas, a escolhida, a sessão, concluir.
    const vazioPng = join(pasta, `${motor}-tarefas-vazio.png`);
    const escolhidaPng = join(pasta, `${motor}-tarefas-escolhida.png`);
    const sessaoPng = join(pasta, `${motor}-tarefas-sessao.png`);
    const concluidaPng = join(pasta, `${motor}-tarefas-concluida.png`);
    const rolar = "document.querySelector('[data-cartao=\"tarefas\"]').scrollIntoView({ block: 'center' })";
    const r1 = await rodar(motor, `${BASE}&pref=dark#/foco`, [
      '--wait', '800', '--eval', `__ttTarefas(${rolar})`, '--shot', vazioPng,
      '--eval', "__ttTarefas(document.querySelector('[data-adicionar-vazio]').click())",
      '--eval', "__ttTarefasAdicionar('   ')",
      '--eval', `__ttTarefasAdicionar(${TRES.map(js).join(', ')})`,
      '--eval', '__ttTarefasEsc()',
      '--eval', '__ttTarefasAcao(2, "escolher")', '--shot', escolhidaPng,
      '--eval', '__ttTarefasIniciar({ minimo: true })', '--wait', '200', '--shot', sessaoPng,
      '--eval', '__ttTarefasAcao(2, "concluir")',
      '--wait', '1500', '--eval', '__ttTarefas()', '--shot', concluidaPng,
    ], { tamanho: '1000x700' });
    if (r1.codigo !== 0 || r1.valores.length !== 9) {
      linha(false, `${motor}: a prévia saiu com ${r1.codigo} e ${r1.valores.length} medida(s)`, r1.erros);
      return;
    }
    for (const l of r1.erros) console.log(`  aviso do ${motor}: ${l}`);
    const [vazio, aberto, emBranco, tres, fechado, escolhida, sessao, concluida, fim] = r1.valores;

    const fv = [];
    if (js(vazio.cabecalho) !== js({ icone: 'checkmark_circle', titulo: 'Tarefas', botoes: [{ nome: 'Adicionar tarefa', icone: 'add' }, { nome: 'Mais opções das tarefas', icone: 'more_horizontal' }] })) fv.push(`cabeçalho: ${js(vazio.cabecalho)}`);
    if (js(vazio.vazio) !== js(['Mantenha o rumo', 'Anote o que precisa fazer e escolha uma tarefa para cada sessão.', 'Adicionar tarefa'])) fv.push(`vazio: ${js(vazio.vazio)}`);
    if (vazio.linhas.length || vazio.subtitulo !== null) fv.push(`linhas ${vazio.linhas.length}, subtítulo ${vazio.subtitulo}`);
    linha(!fv.length, `vazio: ${vazio.cabecalho.icone}, "${vazio.cabecalho.titulo}", "+" e "…"; "${vazio.vazio?.[0]}" e "${vazio.vazio?.[2]}"`, fv);

    const fa = [];
    if (!aberto.campo?.focado || aberto.vazio) fa.push(`campo ${js(aberto.campo)}, vazio ${js(aberto.vazio)}`);
    if (emBranco.linhas.length) fa.push('um título em branco virou tarefa');
    linha(!fa.length, `"Adicionar tarefa" abre o campo "${aberto.campo?.nome}" com o foco (${aberto.campo?.focado}); título em branco não envia`, fa);

    const ft = [...conferirLinhas(tres)];
    if (js(tres.linhas.map((l) => l.titulo)) !== js(TRES)) ft.push(`títulos: ${js(tres.linhas.map((l) => l.titulo))}`);
    if (js(tres.linhas.map((l) => l.nomeDoCheck)) !== js(TRES)) ft.push('o círculo não tem o título como nome');
    if (tres.linhas.some((l) => l.marcada || l.icone !== 'circle')) ft.push('alguma nasceu marcada');
    if (tres.subtitulo !== 'Escolha uma tarefa para a sessão') ft.push(`subtítulo: ${tres.subtitulo}`);
    if (tres.corDoSubtitulo !== tres.tokens.fg2) ft.push(`cor do subtítulo: ${tres.corDoSubtitulo}`);
    if (!tres.campo?.focado || tres.campo?.valor !== '') ft.push(`campo depois do Enter: ${js(tres.campo)}`);
    const l0 = tres.linhas[0];
    linha(!ft.length, `3 tarefas pelo Enter, na ordem; linhas de ${l0?.altura} px, raio ${l0?.raio}, fundo ${l0?.fundo} (superfície); o campo fica aberto e limpo`, ft);

    const ff = [];
    if (fechado.campo || fechado.foco !== 'Adicionar tarefa') ff.push(`campo ${js(fechado.campo)}, foco ${fechado.foco}`);
    linha(!ff.length, `Esc no campo: fecha e o foco volta ao "+" (${fechado.foco})`, ff);

    const fe = [];
    const e2 = escolhida.linhas.find((l) => l.id === 2);
    if (!e2?.escolhida || e2?.escolher !== 'Escolhida') fe.push(`linha 2: ${js(e2)}`);
    if (escolhida.linhas.filter((l) => l.escolhida).length !== 1) fe.push('mais de uma escolhida');
    linha(!fe.length, `escolher a 2: "${e2?.escolher}"`, fe);

    const fs = conferirSessao(sessao, 2);
    const inicio = sessao.inicios.at(-1);
    if (inicio?.taskId !== 2) fs.push(`focus_start: ${js(inicio)}`);
    linha(!fs.length, `iniciar: focus_start ${js(inicio)}; "${sessao.subtitulo}", a 2 em ${sessao.linhas[1]?.corDoTitulo} e as outras em ${sessao.linhas[0]?.corDoTitulo}`, fs);

    const fc = [];
    const c2 = concluida.linhas.find((l) => l.id === 2);
    if (!c2?.marcada || !c2?.preenchido || c2?.corDoTitulo !== concluida.tokens.fg2) fc.push(`linha 2: ${js(c2)}`);
    const periodo = fim.periodos.at(-1);
    if (!periodo || periodo.taskId !== 2 || !periodo.completed) fc.push(`período: ${js(fim.periodos)}`);
    if (fim.subtitulo !== 'Escolha uma tarefa para a sessão') fc.push(`depois da sessão: ${fim.subtitulo}`);
    if (fim.linhas.some((l) => l.escolhida)) fc.push('a concluída continuou escolhida');
    if (fim.linhas.length !== 3) fc.push(`a concluída sumiu: ${fim.linhas.length} linhas`);
    linha(!fc.length, `concluir a 2: marcada, check preenchido, texto em ${c2?.corDoTitulo}; a sessão termina e grava ${js(periodo)}`, fc);

    // 2) A sessão já aberta com a tarefa (o retrato manda).
    const r2 = await rodar(motor, `${BASE}&pref=lite&tarefas=${encodeURIComponent(TRES.join('|'))}&foco=25&tarefa=3#/foco`, [
      '--wait', '800', '--eval', '__ttTarefas()',
    ], { tamanho: '1000x700' });
    const s3 = r2.valores[0];
    const f2 = conferirSessao(s3, 3);
    linha(r2.codigo === 0 && !f2.length, `sessão aberta com a tarefa 3 (Lite): "${s3?.subtitulo}", da sessão ${js(s3?.linhas?.filter((l) => l.daSessao).map((l) => l.id))}`, f2);

    // 3) Sessão sem tarefa.
    const r3 = await rodar(motor, `${BASE}&pref=dark&tarefas=A|B&foco=25#/foco`, ['--wait', '800', '--eval', '__ttTarefas()'], { tamanho: '1000x700' });
    const s0 = r3.valores[0];
    linha(r3.codigo === 0 && s0?.subtitulo === 'Sessão sem tarefa escolhida' && s0.linhas.every((l) => l.corDoTitulo === s0.tokens.fg2), `sessão sem tarefa: "${s0?.subtitulo}", todas em fg-2`);

    // 4) Os quatro temas: a escolhida (sem sessão) e a sessão.
    for (const tema of ['lite', 'suave', 'light', 'dark']) {
      const t1 = join(pasta, `${motor}-tarefas-${tema}.png`);
      const t2 = join(pasta, `${motor}-tarefas-${tema}-sessao.png`);
      const lista = encodeURIComponent('Ler o capítulo 3|Lista de exercícios 2*|Revisar as notas');
      const ra = await rodar(motor, `${BASE}&pref=${tema}&tarefas=${lista}#/foco`, [
        '--wait', '800', '--eval', `__ttTarefas(${rolar})`, '--eval', '__ttTarefasAcao(1, "escolher")', '--shot', t1,
        '--eval', '__ttTarefasIniciar()', '--shot', t2,
      ], { tamanho: '1000x700' });
      const [, esc, ses] = ra.valores;
      const f4 = [...conferirLinhas(esc), ...conferirSessao(ses, 1)];
      const feita = esc?.linhas?.find((l) => l.id === 2);
      if (feita?.corDoTitulo !== esc?.tokens?.fg2) f4.push(`concluída: ${feita?.corDoTitulo}`);
      linha(ra.codigo === 0 && !f4.length, `tema ${tema}: superfície ${esc?.tokens?.superficie}, fg-2 ${esc?.tokens?.fg2}`, f4);
    }

    // 5) Controle negativo: sem o esmaecimento, a conferência da sessão acusa.
    const r5 = await rodar(motor, `${BASE}&pref=dark&tarefas=A|B&foco=25&tarefa=1#/foco`, [
      '--wait', '800',
      '--eval', '__ttTarefasSabotar()',
    ], { tamanho: '1000x700' });
    const f5 = conferirSessao(r5.valores.at(-1), 1);
    linha(f5.some((x) => /cor/.test(x)), `controle negativo (sem esmaecer): ${f5.length} falha(s) acusada(s)`, f5.length ? [] : ['nada acusado']);
  } finally {
    if (!capturas) rmSync(pasta, { recursive: true, force: true });
  }
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
  process.exitCode = falhou ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
