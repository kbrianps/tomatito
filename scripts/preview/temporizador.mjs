#!/usr/bin/env node
// Conferência do M32 (tela Temporizador) nos dois motores, sem abrir janela:
// o Chrome headless (o Chromium do WebView2) e o WebKitGTK fora da tela (o
// motor do app no Linux). Usa o shot.mjs e o webkit-shot.mjs com as medidas
// __ttTemporizadores, __ttCliqueNoTemporizador e __ttEsperarTempo de
// scripts/preview/medidas.js e os temporizadores do tauri-mock.js.
//
//   node scripts/preview/temporizador.mjs [--motor chrome|webkit|todos] [--capturas pasta]
//
// Confere:
//   1. a tela inicial no Escuro, no tamanho da referência (1372 × 936): os
//      quatro padrões (1, 3, 5 e 10 min) em cards de 313 × 321, três na
//      primeira linha e a grade centrada; o anel de 210 px com traço de 12, a
//      46 px do topo do card; o tempo em Title Large (600, 40 px, com
//      plataforma=windows; a prévia não tem a Segoe, e a largura é conferida
//      só fora do Windows, nos itens 3 e 5) e em --tt-fg-2; o botão de destaque "Iniciar" de 32 px e o "Redefinir"
//      desabilitado, em --tt-fg-disabled;
//   2. o "Pronto quando", com o relógio do motor 10 vezes mais rápido: iniciar
//      o de 1 min e o de 3 min pelos botões; os dois correm juntos (tempo em
//      --tt-fg-1, "Pausar", "Redefinir" habilitado); o de 1 min acaba, pede o
//      som de fim de foco e a notificação uma única vez, e mostra
//      "-00:00:12" com "Encerrado há" acima, em --tt-timer-overdue, enquanto o
//      de 3 min continua correndo em 00:01:48 (± 1 s);
//   3. o mesmo estado no Lite: o vencido tem o rótulo e o sinal de menos, e o
//      correndo não; a cor dos dois é a mesma no Lite (--tt-timer-overdue =
//      --tt-fg-1, 4.2), então é o rótulo que distingue (controle: a conferência
//      falharia sem ele);
//   4. pausar no negativo guarda o negativo, e "Redefinir" volta a 00:01:00,
//      parado, com o "Redefinir" desabilitado de novo;
//   5. estreito (480 × 500), no Linux: um card por linha, sem passar da
//      borda, e o tempo em 36 px (a Inter é mais larga), com 8 px de folga
//      de cada lado dentro do anel (no item 3, o negativo em 32 px também).
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
    if (!(k in opts) || argv[i + 1] === undefined) throw new Error('uso: temporizador.mjs [--motor chrome|webkit|todos] [--capturas pasta]');
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

const perto = (a, b, tol) => Math.abs(a - b) <= tol;
const segundos = (texto) => {
  const m = /^(-?)(\d+):(\d\d):(\d\d)$/.exec(texto ?? '');
  return m ? (m[1] ? -1 : 1) * (Number(m[2]) * 3600 + Number(m[3]) * 60 + Number(m[4])) : NaN;
};

async function conferir(motor, capturas, linha) {
  const pasta = capturas ?? mkdtempSync(join(tmpdir(), 'tomatito-m32-'));
  const falhas = [];
  const quer = (lista, nome, v, esperado) =>
    JSON.stringify(v) !== JSON.stringify(esperado) && lista.push(`${nome}: ${JSON.stringify(v)}, esperado ${JSON.stringify(esperado)}`);

  // 1) A tela inicial.
  const r1 = await rodar(motor, '/?pref=dark&plataforma=windows#/temporizador', [
    '--wait', '800', '--eval', '__ttTemporizadores()', '--shot', join(pasta, `${motor}-m32-inicial.png`),
  ]);
  const m1 = r1.valores[0];
  if (r1.codigo !== 0 || !m1) {
    linha(false, `${motor}: a prévia saiu com ${r1.codigo} e ${r1.valores.length} medida(s)`, r1.erros);
    return;
  }
  for (const l of r1.erros) console.log(`  aviso do ${motor}: ${l}`);
  const f1 = [];
  quer(f1, 'títulos', m1.cards.map((c) => c.titulo), ['1 min', '3 min', '5 min', '10 min']);
  quer(f1, 'tempos', m1.cards.map((c) => c.tempo), ['00:01:00', '00:03:00', '00:05:00', '00:10:00']);
  quer(f1, 'tamanhos', [...new Set(m1.cards.map((c) => c.caixa.slice(2).join('×')))], ['313×321']);
  const linhas = [...new Set(m1.cards.map((c) => c.caixa[1]))];
  quer(f1, 'cards por linha', linhas.map((y) => m1.cards.filter((c) => c.caixa[1] === y).length), [3, 1]);
  if (!perto(m1.cards[1].caixa[0] - m1.cards[0].caixa[0], 313 + 16, 0.5)) f1.push(`distância entre cards: ${m1.cards[1].caixa[0] - m1.cards[0].caixa[0]}`);
  if (!perto(m1.faixa.esquerda, m1.faixa.direita, 2)) f1.push(`cards fora do centro: ${JSON.stringify(m1.faixa)}`);
  quer(f1, 'quarto card começa à esquerda', m1.cards[3].caixa[0], m1.cards[0].caixa[0]);
  for (const c of m1.cards) {
    quer(f1, `anel ${c.id}`, [c.anel.lado, c.anel.traco, c.anel.papel, c.anel.vazio, c.anel.rotulo], [210, '12', 'img', true, 'Parado']);
    if (!perto(c.anel.topo, 46, 1)) f1.push(`anel ${c.id} a ${c.anel.topo} px do topo (esperado 46)`);
    quer(f1, `fonte ${c.id}`, c.fonte, '600 40px');
    quer(f1, `cor ${c.id}`, c.corDoTempo, m1.cores.fg2);
    quer(f1, `principal ${c.id}`, c.principal, { acao: 'iniciar', rotulo: 'Iniciar', largura: 32 });
    quer(f1, `redefinir ${c.id}`, c.redefinir, { desabilitado: true, cor: m1.cores.desabilitado });
    quer(f1, `encerrado ${c.id}`, c.encerrado, null);
  }
  linha(!f1.length, `inicial: ${m1.cards.map((c) => `${c.titulo} ${c.tempo}`).join(' | ')}; cards 313×321 em linhas de ${linhas.length === 2 ? '3 e 1' : '?'}; cards a ${m1.faixa.esquerda}/${m1.faixa.direita} px das bordas do conteúdo`, f1);

  // 2) O "Pronto quando", a 10×: dois correm juntos, e o de 1 min vence.
  const r2 = await rodar(motor, '/?pref=dark&plataforma=linux&velocidade=10#/temporizador', [
    '--wait', '800',
    '--eval', '__ttCliqueNoTemporizador(1)',
    '--eval', '__ttCliqueNoTemporizador(2)',
    '--eval', '__ttEsperarTempo(1, "-00:00:12", 30000)',
    '--shot', join(pasta, `${motor}-m32-vencido-escuro.png`),
  ]);
  const [, dois, vencido] = r2.valores;
  const f2 = [];
  if (!dois || !vencido) {
    linha(false, `${motor}: o "Pronto quando" não chegou ao -00:00:12`, [...r2.erros, JSON.stringify(r2.valores.map((v) => v?.cards?.[0]?.tempo))]);
  } else {
    const [a, b] = dois.cards;
    quer(f2, 'correndo juntos', [a.estado, b.estado], ['running', 'running']);
    quer(f2, 'cor correndo', [a.corDoTempo, b.corDoTempo], [dois.cores.fg1, dois.cores.fg1]);
    quer(f2, 'botões correndo', [a.principal.acao, a.redefinir.desabilitado], ['pausar', false]);
    quer(f2, 'comandos', dois.comandos, ['timer_start:1', 'timer_start:2']);
    const [v, c] = vencido.cards;
    quer(f2, 'vencido', [v.tempo, v.encerrado, v.vencido, v.estado], ['-00:00:12', 'Encerrado há', true, 'running']);
    quer(f2, 'cor vencido', v.corDoTempo, vencido.cores.vencido);
    quer(f2, 'o negativo cabe no anel', v.tempoCabe, true);
    quer(f2, 'anel vencido', [v.anel.vazio, v.anel.rotulo], [true, 'Encerrado há 0 minutos']);
    quer(f2, 'fim uma vez, com som e notificação', vencido.fins, [{ id: 1, som: 'focusEnd', notificacao: true }]);
    if (!perto(segundos(c.tempo), 180 - 72, 1)) f2.push(`o de 3 min em ${c.tempo} (esperado 00:01:48 ± 1 s)`);
    quer(f2, 'o de 3 min continua', [c.estado, c.encerrado, c.corDoTempo], ['running', null, vencido.cores.fg1]);
    if (!/restantes?$/.test(c.anel.rotulo)) f2.push(`rótulo do anel de 3 min: ${c.anel.rotulo}`);
    linha(!f2.length, `pronto quando: 1 min ${v.tempo} com "${v.encerrado}" (${v.corDoTempo}), 3 min ${c.tempo}; fins ${JSON.stringify(vencido.fins)}`, f2);
  }

  // 3) Lite: o vencido distinguível do correndo pelo rótulo e pelo sinal.
  const r3 = await rodar(motor, '/?pref=lite&plataforma=linux&tempos=1@-11800,2@150000#/temporizador', [
    '--wait', '500',
    '--eval', '__ttEsperarTempo(1, "-00:00:12", 5000)',
    '--shot', join(pasta, `${motor}-m32-vencido-lite.png`),
  ], { tamanho: '1000x700' });
  const m3 = r3.valores[0];
  const f3 = [];
  if (!m3) f3.push('não chegou ao -00:00:12');
  else {
    const [v, c] = m3.cards;
    quer(f3, 'vencido', [v.tempo, v.encerrado], ['-00:00:12', 'Encerrado há']);
    quer(f3, 'correndo sem rótulo', [c.encerrado, c.tempo.startsWith('-')], [null, false]);
    quer(f3, 'cores do Lite (a mesma nos dois; é o rótulo que distingue)', [v.corDoTempo, c.corDoTempo], [m3.cores.fg1, m3.cores.fg1]);
    const distingue = v.encerrado !== c.encerrado && v.tempo.startsWith('-') !== c.tempo.startsWith('-');
    quer(f3, 'distinguível', distingue, true);
    quer(f3, `os tempos cabem no anel com folga (${v.larguraDoTempo} e ${c.larguraDoTempo} px)`, [v.tempoCabe, c.tempoCabe], [true, true]);
    // Controle negativo: só pela cor, os dois seriam iguais no Lite.
    quer(f3, 'controle: só a cor não distingue', v.corDoTempo === c.corDoTempo, true);
  }
  linha(!f3.length, `Lite: vencido "${m3?.cards[0].encerrado} ${m3?.cards[0].tempo}", correndo "${m3?.cards[1].tempo}", cor ${m3?.cards[0].corDoTempo} nos dois`, f3);

  // 4) Pausar no negativo e redefinir.
  const r4 = await rodar(motor, '/?pref=light&plataforma=linux&tempos=1@-5000#/temporizador', [
    '--wait', '600',
    '--eval', '__ttCliqueNoTemporizador(1)',
    '--wait', '1500',
    '--eval', '__ttTemporizadores()',
    '--eval', '__ttCliqueNoTemporizador(1, "redefinir")',
  ], { tamanho: '1000x700' });
  const [pausado, parado, redefinido] = r4.valores;
  const f4 = [];
  if (!redefinido) f4.push(`${r4.valores.length} medidas`);
  else {
    const p = pausado.cards[0];
    quer(f4, 'pausado no negativo', [p.estado, p.principal.acao, p.encerrado, p.corDoTempo], ['paused', 'retomar', 'Encerrado há', pausado.cores.vencido]);
    quer(f4, 'pausado não anda', parado.cards[0].tempo, p.tempo);
    const r = redefinido.cards[0];
    quer(f4, 'redefinido', [r.estado, r.tempo, r.encerrado, r.redefinir.desabilitado, r.corDoTempo], ['idle', '00:01:00', null, true, redefinido.cores.fg2]);
  }
  linha(!f4.length, `pausar no negativo (${pausado?.cards[0].tempo}) e redefinir (${redefinido?.cards[0].tempo})`, f4);

  // 5) Estreito.
  const r5 = await rodar(motor, '/?pref=dark&plataforma=linux#/temporizador', ['--wait', '600', '--eval', '__ttTemporizadores()'], { tamanho: '480x500' });
  const m5 = r5.valores[0];
  const f5 = [];
  if (!m5) f5.push('sem medida');
  else {
    quer(f5, 'um por linha', new Set(m5.cards.map((c) => c.caixa[0])).size, 1);
    // Fora do Windows (a Inter), 36 px, com folga dentro do anel.
    for (const c of m5.cards) quer(f5, `tempo ${c.id} em 36 px, cabendo com folga (${c.larguraDoTempo} px)`, [c.fonte, c.tempoCabe], ['600 36px', true]);
    if (m5.faixa.esquerda < 0 || m5.faixa.direita < 0) f5.push(`passa da borda: ${JSON.stringify(m5.faixa)}`);
  }
  linha(!f5.length, `estreito 480 × 500: ${m5?.cards.length} cards, ${m5?.cards[0]?.caixa.slice(2).join('×')}`, f5);
  falhas.push(...f1, ...f2, ...f3, ...f4, ...f5);
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
