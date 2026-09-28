#!/usr/bin/env node
// Conferência do M33 (adicionar, editar e excluir temporizadores) nos dois
// motores, sem abrir janela: o Chrome headless e o WebKitGTK fora da tela.
// Usa o shot.mjs e o webkit-shot.mjs com as medidas __ttEdicao, __ttClicar,
// __ttTecla e __ttPreencher de scripts/preview/medidas.js e os comandos
// timer_create/update/delete do tauri-mock.js.
//
//   node scripts/preview/temporizador-edicao.mjs [--motor chrome|webkit|todos] [--capturas pasta]
//
// Confere, no Escuro e no tamanho da referência (1372 × 936):
//   1. a barra no canto inferior direito do conteúdo (a 32 px da direita, o
//      recuo da página, e a 16 px do fundo), com o lápis "Editar
//      temporizadores" e o "+" "Adicionar temporizador"; fora do modo de
//      edição, nenhum card mostra "Editar" ou "Excluir";
//   2. o "+" abre "Adicionar temporizador" com 00:05:00 e o foco nas horas; ↑
//      nas horas vira 01 e Cancelar fecha sem gravar, com o foco de volta no
//      "+";
//   3. o "Pronto quando": criar "Chá · 4 min" (card "Chá", 00:04:00, no fim
//      da grade, e um timer_create com o nome e 240000 ms); o lápis liga o
//      modo de edição (vira "Concluído", e cada card ganha "Editar" e
//      "Excluir" no canto de cima); editar o "Chá" para "Chá verde", 5 min;
//      excluir o "Chá verde" (o card some, e o foco vai ao "Excluir" do
//      vizinho); "Concluído" sai do modo;
//   4. no Lite e no Claro, o modo de edição e o diálogo (capturas);
//   5. excluir todos: a lista vazia mostra o aviso, e o lápis desabilita.
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
    if (!(k in opts) || argv[i + 1] === undefined) throw new Error('uso: temporizador-edicao.mjs [--motor chrome|webkit|todos] [--capturas pasta]');
    opts[k] = argv[i + 1];
  }
  if (!['chrome', 'webkit', 'todos'].includes(opts.motor)) throw new Error(`motor desconhecido: ${opts.motor}`);
  if (opts.capturas) mkdirSync(resolve(opts.capturas), { recursive: true });
  return opts;
}

/** Roda o shot.mjs ou o webkit-shot.mjs e devolve os valores dos --eval de __tt*, na ordem. */
function rodar(motor, caminho, passos, { tamanho = '1372x936' } = {}) {
  const script = join(AQUI, motor === 'webkit' ? 'webkit-shot.mjs' : 'shot.mjs');
  const extra = motor === 'webkit' ? ['--timeout', '90'] : [];
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

const ev = (expr) => ['--eval', expr];
const DIALOGO = '[data-dialogo="temporizador"]';

async function conferir(motor, capturas, linha) {
  const pasta = capturas ?? mkdtempSync(join(tmpdir(), 'tomatito-m33-'));
  const quer = (lista, nome, v, esperado) =>
    JSON.stringify(v) !== JSON.stringify(esperado) && lista.push(`${nome}: ${JSON.stringify(v)}, esperado ${JSON.stringify(esperado)}`);

  // 1 a 3, numa prévia só.
  const r = await rodar(motor, '/?pref=dark&plataforma=windows#/temporizador', [
    '--wait', '800',
    ...ev('__ttEdicao()'),
    ...ev(`__ttClicar('[data-adicionar]')`),
    ...ev(`__ttTecla('ArrowUp')`),
    '--wait', '400',
    '--shot', join(pasta, `${motor}-m33-dialogo.png`),
    ...ev(`__ttClicar('${DIALOGO} [data-cancelar]')`),
    ...ev(`__ttClicar('[data-adicionar]')`),
    ...ev(`__ttPreencher({ h: 0, m: 4, s: 0, nome: 'Chá' })`),
    ...ev(`__ttClicar('${DIALOGO} [data-salvar]', 150)`),
    ...ev(`__ttClicar('[data-editar-lista]')`),
    '--shot', join(pasta, `${motor}-m33-edicao.png`),
    ...ev(`__ttClicar('[data-temporizador="5"] [data-acao="editar"]')`),
    ...ev(`__ttPreencher({ m: 5, nome: 'Chá verde' })`),
    ...ev(`__ttClicar('${DIALOGO} [data-salvar]', 150)`),
    ...ev(`__ttClicar('[data-temporizador="5"] [data-acao="excluir"]', 150)`),
    ...ev(`__ttClicar('[data-editar-lista]')`),
  ]);
  if (r.codigo !== 0 || r.valores.length !== 13) {
    linha(false, `${motor}: a prévia saiu com ${r.codigo} e ${r.valores.length} medida(s)`, r.erros);
    return;
  }
  for (const l of r.erros) console.log(`  aviso do ${motor}: ${l}`);
  const [ini, aberto, seta, cancelado, novo, preenchido, criado, edicao, editando, editando2, editado, excluido, saiu] = r.valores;

  const f1 = [];
  quer(f1, 'barra: botões', ini.barra.botoes, [
    { rotulo: 'Editar temporizadores', desabilitado: false, icone: 1 },
    { rotulo: 'Adicionar temporizador', desabilitado: false, icone: 1 },
  ]);
  quer(f1, 'barra: canto', [ini.barra.direita, ini.barra.fundo], [32, 16]);
  quer(f1, 'sem edição nos cards', ini.cards.flatMap((c) => c.edicao), []);
  quer(f1, 'fora do modo', ini.editando, false);
  linha(!f1.length, `barra ${ini.barra.caixa.slice(2).join('×')} a ${ini.barra.direita}/${ini.barra.fundo} px do canto; ${ini.cards.length} cards sem botões de edição`, f1);

  const f2 = [];
  quer(f2, 'aberto', [aberto.dialogo.aberto, aberto.dialogo.titulo, aberto.dialogo.rotulo, aberto.dialogo.campos, aberto.dialogo.nome, aberto.foco],
    [true, 'Adicionar temporizador', 'Adicionar temporizador', ['00', '05', '00'], '', 'Horas']);
  quer(f2, '↑ nas horas', seta.dialogo.campos, ['01', '05', '00']);
  quer(f2, 'Cancelar', [cancelado.dialogo.aberto, cancelado.cards.length, cancelado.comandos, cancelado.foco], [false, 4, [], 'Adicionar temporizador']);
  quer(f2, 'reabre limpo', novo.dialogo.campos, ['00', '05', '00']);
  linha(!f2.length, `diálogo ${aberto.dialogo.caixa?.slice(2).join('×')}: 00:05:00, foco nas horas, ↑ → 01, Cancelar sem gravar`, f2);

  const f3 = [];
  quer(f3, 'preenchido', [preenchido.dialogo.campos, preenchido.dialogo.nome], [['00', '04', '00'], 'Chá']);
  const cha = criado.cards.at(-1);
  quer(f3, 'criado', [criado.dialogo.aberto, cha?.titulo, cha?.tempo, criado.cards.length, criado.foco], [false, 'Chá', '00:04:00', 5, 'Adicionar temporizador']);
  quer(f3, 'timer_create', criado.comandos, ['timer_create:{"name":"Chá","durationMs":240000}']);
  quer(f3, 'modo de edição', [edicao.editando, edicao.barra.botoes[0].rotulo], [true, 'Concluído']);
  quer(f3, 'Editar e Excluir em cada card', [...new Set(edicao.cards.map((c) => c.edicao.join('+')))], ['Editar+Excluir']);
  const c5 = edicao.cards.find((c) => c.id === 5);
  if (c5 && c5.caixaEdicao[0] + c5.caixaEdicao[2] > c5.caixa[0] + c5.caixa[2] - 2) f3.push(`botões de edição fora do card: ${JSON.stringify(c5)}`);
  quer(f3, 'abre para editar', [editando.dialogo.titulo, editando.dialogo.campos, editando.dialogo.nome], ['Editar temporizador', ['00', '04', '00'], 'Chá']);
  quer(f3, 'preenchido na edição', [editando2.dialogo.campos, editando2.dialogo.nome], [['00', '05', '00'], 'Chá verde']);
  const cv = editado.cards.find((c) => c.id === 5);
  quer(f3, 'editado', [editado.dialogo.aberto, cv?.titulo, cv?.tempo, editado.foco], [false, 'Chá verde', '00:05:00', 'Editar']);
  quer(f3, 'timer_update', editado.comandos.at(-1), 'timer_update:{"id":5,"name":"Chá verde","durationMs":300000}');
  quer(f3, 'excluído', [excluido.cards.map((c) => c.id), excluido.comandos.at(-1), excluido.foco, excluido.editando], [[1, 2, 3, 4], 'timer_delete:5', 'Excluir', true]);
  quer(f3, 'Concluído sai do modo', [saiu.editando, saiu.barra.botoes[0].rotulo, saiu.cards.flatMap((c) => c.edicao)], [false, 'Editar temporizadores', []]);
  linha(!f3.length, `criar "Chá · 4 min", editar para "Chá verde · 5 min" e excluir: ${saiu.comandos.length} comandos (${saiu.comandos.map((c) => c.split(':')[0]).join(', ')})`, f3);

  // 4) Lite e Claro: o modo de edição e o diálogo, para o olho.
  for (const tema of ['lite', 'light']) {
    const rt = await rodar(motor, `/?pref=${tema}&plataforma=linux#/temporizador`, [
      '--wait', '800',
      ...ev(`__ttClicar('[data-editar-lista]')`),
      '--shot', join(pasta, `${motor}-m33-edicao-${tema}.png`),
      ...ev(`__ttClicar('[data-temporizador="2"] [data-acao="editar"]')`),
      '--wait', '400',
      '--shot', join(pasta, `${motor}-m33-dialogo-${tema}.png`),
    ]);
    const [e, d] = rt.valores;
    const f4 = [];
    quer(f4, 'modo e diálogo', [e?.editando, d?.dialogo?.titulo, d?.dialogo?.campos], [true, 'Editar temporizador', ['00', '03', '00']]);
    linha(!f4.length, `${tema}: modo de edição e diálogo (capturas em ${pasta})`, f4);
  }

  // 5) Excluir todos.
  const rv = await rodar(motor, '/?pref=dark&plataforma=linux#/temporizador', [
    '--wait', '800',
    ...ev(`__ttClicar('[data-editar-lista]')`),
    ...[1, 2, 3, 4].flatMap((id) => ev(`__ttClicar('[data-temporizador="${id}"] [data-acao="excluir"]', 150)`)),
    '--shot', join(pasta, `${motor}-m33-vazia.png`),
  ]);
  const vz = rv.valores.at(-1);
  const f5 = [];
  quer(f5, 'vazia', [vz?.cards.length, vz?.vazio, vz?.editando, vz?.barra.botoes[0].desabilitado, vz?.foco], [0, true, false, true, 'Adicionar temporizador']);
  linha(!f5.length, 'sem nenhum temporizador: o aviso, o lápis desabilitado e o foco no "+"', f5);
}

async function principal() {
  const opts = lerArgs(process.argv.slice(2));
  const motores = opts.motor === 'todos' ? ['chrome', 'webkit'] : [opts.motor];
  let falhou = 0;
  for (const motor of motores) {
    console.log(`\n== ${NOMES[motor]} ==`);
    await conferir(motor, opts.capturas, (ok, texto, detalhes = []) => {
      if (!ok) falhou++;
      console.log(`${ok ? 'ok   ' : 'FALHA'} ${texto}`);
      for (const d of ok ? [] : detalhes) console.log(`        ${d}`);
    });
  }
  console.log(falhou ? `\n${falhou} conferência(s) falharam` : '\ntodas as conferências passaram');
  process.exit(falhou ? 1 : 0);
}

principal().catch((e) => {
  console.error(e);
  process.exit(1);
});
