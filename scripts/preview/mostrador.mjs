#!/usr/bin/env node
// Conferência do M18 (mostrador em foco) nos dois motores, sem abrir janela: o
// Chrome headless (o Chromium do WebView2 no Windows) e o WebKitGTK fora da
// tela (o motor do app no Linux). Usa o shot.mjs e o webkit-shot.mjs com as
// medidas __ttMostrador, __ttSerieDoMostrador e __ttMenuSessao de
// scripts/preview/medidas.js, o motor simulado do tauri-mock.js (com as fases
// do plan.rs e o ?velocidade=60) e o mostrador_bandas.py para as posições
// pelos pixels.
//
//   node scripts/preview/mostrador.mjs [--motor chrome|webkit|todos] [--capturas pasta]
//
// Confere:
//   - posições: a janela no tamanho da referência do M17 (1372 × 936 px CSS),
//     no Escuro, com 27 min restantes no primeiro foco de uma sessão de 60 min,
//     e o cartão medido pelos pixels contra ~/dev/tomatito-ref/crop-insession.png
//     (o cartão do Relógio em sessão, a 175%): o cabeçalho, os traços das 12,
//     3, 6 e 9 horas, o número com a unidade, os botões e o rodapé diferem no
//     máximo 4 px (y de cima e de baixo e o centro em x; no cabeçalho, que tem
//     outro texto, a esquerda);
//   - o que se vê: o cabeçalho, o número, o rótulo do role="img", o botão de
//     pausar, o "..." com os dois itens, o rodapé, as cores dos traços e do
//     traço aceso e o disco com 62% do cartão;
//   - com o relógio 60 vezes mais rápido (o TOMATITO_SPEED=60 do debug), uma
//     sessão de 25 min iniciada pelo cartão mostra o traço avançando e o
//     número descendo, e o menu "Encerrar sessão" encerra a sessão;
//   - no intervalo, "Pular intervalo" fica habilitado e passa ao foco
//     seguinte; o botão de destaque pausa e retoma (glifo e rótulo);
//   - o modo "uma volta por minuto" (data-tt-mostrador="minuto" no <html>);
//   - controle negativo: com o mostrador 6 px mais baixo, as posições acusam.
// Sai com 1 se alguma conferência falhar.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AQUI = fileURLToPath(new URL('.', import.meta.url));
const NOMES = { chrome: 'Chrome headless', webkit: 'WebKitGTK fora da tela' };
const REFERENCIA = join(homedir(), 'dev/tomatito-ref/crop-insession.png');
const TAMANHO = '1372x936';
const FOLGA = 4;

function lerArgs(argv) {
  const opts = { motor: 'todos', capturas: null };
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i].replace(/^--/, '');
    if (!(k in opts) || argv[i + 1] === undefined) throw new Error('uso: mostrador.mjs [--motor chrome|webkit|todos] [--capturas pasta]');
    opts[k] = argv[i + 1];
  }
  if (!['chrome', 'webkit', 'todos'].includes(opts.motor)) throw new Error(`motor desconhecido: ${opts.motor}`);
  if (opts.capturas) mkdirSync(resolve(opts.capturas), { recursive: true });
  return opts;
}

/** Roda o shot.mjs ou o webkit-shot.mjs e devolve os valores dos --eval, na ordem. */
function rodar(motor, caminho, passos, tamanho = TAMANHO) {
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
        .filter((l) => l.includes(' => ') && /^(__tt|\(\))/.test(l))
        .map((l) => JSON.parse(l.slice(l.indexOf(' => ') + 4)));
      res({ codigo, valores, erros: erros.split('\n').filter((l) => l && !/^\[console\.(log|info|debug)\]/.test(l)) });
    });
  });
}

function bandas(png, escala, x0, y0) {
  const r = spawnSync('python3', [join(AQUI, 'mostrador_bandas.py'), png, String(escala), String(x0), String(y0)], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`mostrador_bandas.py: ${r.stderr}`);
  return JSON.parse(r.stdout);
}

/**
 * Compara as caixas de tinta: y de cima e de baixo e o centro em x, com a
 * folga de 4 px. O cartão do Relógio tem 448 px e o nosso `largura`: o
 * centro em x é medido a partir do centro de cada cartão. O cabeçalho tem
 * outro texto (e outra largura): só a esquerda e a altura.
 */
export function compararPosicoes(nosso, ref, largura, folga = FOLGA) {
  const linhas = [];
  for (const nome of Object.keys(ref)) {
    const a = nosso[nome];
    const b = ref[nome];
    if (!a || !b) {
      linhas.push({ nome, ok: false, texto: `sem medida (nosso ${JSON.stringify(a)}, Relógio ${JSON.stringify(b)})` });
      continue;
    }
    const d = (v) => Math.round(v * 10) / 10;
    const dy0 = d(a[1] - b[1]);
    const dy1 = d(a[3] - b[3]);
    const dx = nome === 'cabecalho' ? d(a[0] - b[0]) : d((a[0] + a[2]) / 2 - largura / 2 - ((b[0] + b[2]) / 2 - 448 / 2));
    const ok = [dy0, dy1, dx].every((v) => Math.abs(v) <= folga);
    linhas.push({ nome, ok, texto: `y ${a[1]}–${a[3]} × ${b[1]}–${b[3]} (Δ ${dy0}, ${dy1}), Δx ${dx}${nome === 'cabecalho' ? ' (esquerda)' : ''}` });
  }
  return linhas;
}

async function conferir(motor, capturas, linha) {
  const pasta = capturas ?? mkdtempSync(join(tmpdir(), 'tomatito-m18-'));
  const png = join(pasta, `${motor}-mostrador-escuro.png`);
  const clicar = (passos, seletor) =>
    motor === 'chrome' ? passos.push('--click', seletor, '--wait', '150') : passos.push('--eval', `__ttClicar(${JSON.stringify(seletor)})`);
  try {
    // 1) Posições e o que se vê, no Escuro, com 27 min restantes.
    const EM_SESSAO = '/?pref=dark&plataforma=windows&foco=60&restante=1620000#/foco';
    const r1 = await rodar(motor, EM_SESSAO, ['--wait', '700', '--eval', '__ttMostrador()', '--shot', png]);
    if (r1.codigo !== 0 || r1.valores.length !== 1) {
      linha(false, `${motor}: a prévia saiu com ${r1.codigo} e ${r1.valores.length} medida(s)`, r1.erros);
      return;
    }
    for (const l of r1.erros) console.log(`  aviso do ${motor}: ${l}`);
    const m = r1.valores[0];
    const [cx, cy, cw] = m.caixas.cartao;
    const ref = bandas(REFERENCIA, 1.75, 0, 0);
    for (const l of compararPosicoes(bandas(png, 1, cx, cy), ref, cw)) linha(l.ok, `posição ${l.nome}: ${l.texto}`);

    const fv = [];
    const quer = (nome, v, esperado) => JSON.stringify(v) !== JSON.stringify(esperado) && fv.push(`${nome}: ${JSON.stringify(v)}, esperado ${JSON.stringify(esperado)}`);
    quer('modo', m.modo, 'andamento');
    quer('título', m.titulo, 'Período de foco (1 de 2)');
    quer('número', m.minutos, 27);
    quer('traço aceso', m.aceso, [0]);
    quer('papel', m.papel, 'img');
    quer('rótulo', m.rotulo, '27 minutos restantes, período de foco 1 de 2');
    quer('botão de destaque', m.principal, { acao: 'pausar', rotulo: 'Pausar', icone: 'pause' });
    quer('"..."', m.mais, 'Mais opções');
    quer('menu', m.itens, [
      { item: 'parar', texto: 'Encerrar sessão', desabilitado: false },
      { item: 'pular', texto: 'Pular intervalo', desabilitado: true },
    ]);
    quer('rodapé', m.rodape, 'A seguir: intervalo de 5 min');
    quer('cor dos traços', m.cores.traco, m.cores.esperado.traco);
    quer('cor do traço aceso', m.cores.aceso, m.cores.esperado.aceso);
    quer('cor da unidade', m.cores.unidade, m.cores.esperado.unidade);
    quer('peso do número', m.fonte.peso, '350');
    const prop = m.caixas.mostrador[2] / cw;
    if (Math.abs(prop - 0.62) > 0.01) fv.push(`disco com ${(prop * 100).toFixed(1)}% do cartão`);
    if (Math.abs(parseFloat(m.fonte.tamanho) - (46 * m.caixas.mostrador[2]) / 280) > 0.5) fv.push(`número com ${m.fonte.tamanho}`);
    linha(!fv.length, `o que se vê: "${m.titulo}", ${m.minutos} min, "${m.rotulo}", disco ${m.caixas.mostrador[2]} px (${(prop * 100).toFixed(1)}%), número ${m.fonte.tamanho}`, fv);

    // 2) Acelerado (60×): iniciar 25 min pelo cartão, o traço avança, e o
    // menu encerra a sessão.
    const p2 = ['--wait', '400', '--eval', `__ttTeclaNoSeletor('ArrowDown')`];
    clicar(p2, '[data-cartao="sessao"] [data-iniciar]');
    p2.push('--eval', '__ttSerieDoMostrador(8000, 250)');
    if (capturas) p2.push('--shot', join(pasta, `${motor}-acelerado.png`));
    if (motor === 'chrome') {
      p2.push('--click', '[data-cartao="sessao"] [data-mais]', '--wait', '200', '--eval', '__ttMostrador()');
      if (capturas) p2.push('--shot', join(pasta, `${motor}-menu-aberto.png`));
      p2.push('--click', '[data-cartao="sessao"] fluent-menu-item[data-item="parar"]', '--wait', '200', '--eval', '__ttMostrador()');
    } else {
      p2.push('--eval', `__ttMenuSessao('parar')`);
    }
    const r2 = await rodar(motor, '/?pref=lite&plataforma=windows&velocidade=60#/foco', p2);
    const serie = r2.valores.find(Array.isArray) ?? [];
    const fs = [];
    const acesos = serie.map((s) => s.aceso);
    const distintos = [...new Set(acesos)];
    if (serie[0]?.minutos !== 25 && serie[0]?.minutos !== 24) fs.push(`começou em ${serie[0]?.minutos} min`);
    if (acesos.some((v, i) => i && v < acesos[i - 1])) fs.push('o traço voltou');
    if (distintos.length < 6) fs.push(`só ${distintos.length} traços em 8 s`);
    if (!(serie.at(-1)?.minutos < serie[0]?.minutos - 5)) fs.push(`o número foi de ${serie[0]?.minutos} a ${serie.at(-1)?.minutos}`);
    linha(r2.codigo === 0 && !fs.length, `acelerado: em 8 s, traço ${distintos.join(' → ')}, número ${serie[0]?.minutos} → ${serie.at(-1)?.minutos}`, fs);
    const fim = r2.valores.at(-1);
    const fm = [];
    if (motor === 'chrome' && !r2.valores.at(-2)?.menuAberto) fm.push('o "..." não abriu o menu');
    if (motor === 'webkit' && !fim?.abriu) fm.push('o "..." não abriu o menu');
    if (JSON.stringify(fim?.pedidos?.comandos) !== '["focus_stop"]') fm.push(`comandos ${JSON.stringify(fim?.pedidos?.comandos)}`);
    if (JSON.stringify(fim?.pedidos?.inicios) !== '[{"minutes":25,"skipBreaks":false}]') fm.push(`inícios ${JSON.stringify(fim?.pedidos?.inicios)}`);
    if (fim?.modo !== 'preparo' || fim?.titulo !== 'Pronto para focar' || fim?.andamentoVisivel) fm.push(`depois: ${fim?.modo}, "${fim?.titulo}"`);
    linha(!fm.length, `menu "Encerrar sessão": ${JSON.stringify(fim?.pedidos?.comandos)}, o cartão volta a "${fim?.titulo}"`, fm);

    // 3) Intervalo: "Pular intervalo" habilitado passa ao foco 2; depois,
    // pausar e retomar.
    const p3 = ['--wait', '500', '--eval', '__ttMostrador()', '--eval', `__ttMenuSessao('pular')`];
    clicar(p3, '[data-cartao="sessao"] .tt-andamento-botoes > button');
    p3.push('--eval', '__ttMostrador()');
    clicar(p3, '[data-cartao="sessao"] .tt-andamento-botoes > button');
    p3.push('--eval', '__ttMostrador()');
    const r3 = await rodar(motor, '/?pref=dark&plataforma=windows&foco=60&fase=1&restante=200000#/foco', p3);
    const [intervalo, pulou] = r3.valores;
    const pausado = r3.valores.at(-3 + (motor === 'webkit' ? 0 : 1));
    const retomado = r3.valores.at(-1);
    const fi = [];
    if (intervalo?.titulo !== 'Intervalo' || intervalo?.itens?.[1]?.desabilitado !== false || intervalo?.rodape !== 'A seguir: foco de 27 min')
      fi.push(`intervalo: "${intervalo?.titulo}", pular ${intervalo?.itens?.[1]?.desabilitado ? 'desabilitado' : 'ok'}, "${intervalo?.rodape}"`);
    if (intervalo?.rotulo !== '4 minutos restantes, intervalo 1 de 1') fi.push(`rótulo "${intervalo?.rotulo}"`);
    if (pulou?.titulo !== 'Período de foco (2 de 2)' || pulou?.rodape !== null || JSON.stringify(pulou?.pedidos?.comandos) !== '["focus_skip"]')
      fi.push(`depois de pular: "${pulou?.titulo}", rodapé ${JSON.stringify(pulou?.rodape)}, ${JSON.stringify(pulou?.pedidos?.comandos)}`);
    if (pulou?.itens?.[1]?.desabilitado !== true) fi.push('no foco, "Pular intervalo" continua habilitado');
    linha(!fi.length, `intervalo: "${intervalo?.titulo}", "${intervalo?.rodape}"; "Pular intervalo" → "${pulou?.titulo}"`, fi);
    const fp = [];
    if (JSON.stringify(pausado?.principal) !== JSON.stringify({ acao: 'retomar', rotulo: 'Retomar', icone: 'play' })) fp.push(`pausado: ${JSON.stringify(pausado?.principal)}`);
    if (JSON.stringify(retomado?.principal) !== JSON.stringify({ acao: 'pausar', rotulo: 'Pausar', icone: 'pause' })) fp.push(`retomado: ${JSON.stringify(retomado?.principal)}`);
    linha(r3.codigo === 0 && !fp.length, `pausar e retomar: ${pausado?.principal?.rotulo} (${pausado?.principal?.icone}) → ${retomado?.principal?.rotulo} (${retomado?.principal?.icone})`, fp);

    // 4) Os dois modos do traço aceso, a 1×: o do período fica parado em 6 s;
    // o de uma volta por minuto anda a cada 2,5 s.
    const r4 = await rodar(motor, '/?pref=lite&plataforma=windows&foco=25#/foco', [
      '--wait', '300',
      '--eval', '__ttSerieDoMostrador(6000, 250)',
      '--eval', `(document.documentElement.dataset.ttMostrador = 'minuto', true)`,
      '--eval', '__ttSerieDoMostrador(6000, 250)',
    ]);
    const [periodo, minuto] = r4.valores; // o --eval da troca de modo não começa com __tt nem ()
    const dp = [...new Set((periodo ?? []).map((s) => s.aceso))];
    const dm = [...new Set((minuto ?? []).map((s) => s.aceso))];
    linha(r4.codigo === 0 && dp.length === 1 && dm.length >= 2 && dm.length <= 4, `modos: período ${dp.join(',')} em 6 s; uma volta por minuto ${dm.join(' → ')} em 6 s`);

    // 5) Controle negativo: o mostrador 6 px abaixo.
    const sabotado = join(pasta, `${motor}-sabotado.png`);
    const r5 = await rodar(motor, EM_SESSAO, ['--wait', '700', '--eval', '__ttSabotarMostrador()', '--eval', '__ttMostrador()', '--shot', sabotado]);
    const cs = r5.valores[1]?.caixas?.cartao;
    const acusou = cs ? compararPosicoes(bandas(sabotado, 1, cs[0], cs[1]), ref, cs[2]).filter((l) => !l.ok).map((l) => l.nome) : [];
    linha(acusou.length >= 5, `controle negativo (mostrador 6 px abaixo): ${acusou.length} posições acusadas (${acusou.join(', ')})`);
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
