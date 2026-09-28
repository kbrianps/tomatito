#!/usr/bin/env node
// Conferência do M34 (tela Cronômetro) nos dois motores, sem abrir janela: o
// Chrome headless (o Chromium do WebView2) e o WebKitGTK fora da tela (o
// motor do app no Linux). Usa o shot.mjs e o webkit-shot.mjs com as medidas
// __ttCronometro, __ttClicarNoCronometro, __ttAmostraDoCronometro,
// __ttTeclaNoCronometro e __ttSairEVoltar de scripts/preview/medidas.js e o
// cronômetro do tauri-mock.js.
//
//   node scripts/preview/cronometro.mjs [--motor chrome|webkit|todos] [--capturas pasta]
//
// Confere:
//   1. zerado, no Escuro, no tamanho da referência (1372 × 936): 00:00:00,00;
//      o número em clamp(68px, 8vw, 110px) (109,76 px aqui), centrado na área
//      de conteúdo, com números tabulares; os centésimos a 70%; h, min e s
//      centrados embaixo de cada par; três botões circulares de 64 px, a
//      24 px um do outro e centrados sob o número, com ícones de 24 px; o de
//      destaque "Iniciar"; "Marcar volta" e "Redefinir" desabilitados, em
//      --tt-fg-disabled; o rótulo "Cronômetro zerado" no role="img";
//   2. "Iniciar" (clique): correndo, e os centésimos mudam a cada quadro (numa
//      amostra de 1 s, pelo menos 90% dos quadros mostram um número novo);
//   3. o teclado, com o foco fora dos botões: Espaço pausa (o número para),
//      L pausado não faz nada, Espaço retoma, L marca volta; com o foco num
//      botão, L não marca (a tecla é do botão);
//   4. trocar de tela por 1,5 s e voltar (a tela é desmontada e montada de
//      novo): o tempo continua, com no máximo 50 ms de diferença do relógio
//      monotônico da página;
//   5. pausado vindo do Rust (?cronometro=paused@65430): 00:01:05,43, o
//      rótulo com o tempo exato, "Retomar", volta desabilitada;
//   6. o tamanho do número acompanha a janela: 80 px a 1000 × 700 (Lite) e,
//      a 480 × 500, um pouco abaixo de 68 px (o limite de baixo do clamp não
//      cabe; docs/decisoes.md, M34), sem rolagem lateral e sem o texto passar
//      da caixa nem da borda.
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
    if (!(k in opts) || argv[i + 1] === undefined) throw new Error('uso: cronometro.mjs [--motor chrome|webkit|todos] [--capturas pasta]');
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

async function conferir(motor, capturas, linha) {
  const pasta = capturas ?? mkdtempSync(join(tmpdir(), 'tomatito-m34-'));
  const quer = (lista, nome, v, esperado) =>
    JSON.stringify(v) !== JSON.stringify(esperado) && lista.push(`${nome}: ${JSON.stringify(v)}, esperado ${JSON.stringify(esperado)}`);

  // 1 a 4 numa página só.
  const r = await rodar(motor, '/?pref=dark&plataforma=windows#/cronometro', [
    '--wait', '800',
    '--eval', '__ttCronometro()',
    '--shot', join(pasta, `${motor}-m34-zerado.png`),
    '--eval', '__ttClicarNoCronometro("iniciar")',
    '--eval', '__ttAmostraDoCronometro(1000)',
    '--eval', '__ttTeclaNoCronometro(" ", "nada")',
    '--wait', '400',
    '--eval', '__ttTeclaNoCronometro("l")',
    '--eval', '__ttTeclaNoCronometro(" ")',
    '--wait', '300',
    '--eval', '__ttTeclaNoCronometro("l")',
    '--eval', '__ttTeclaNoCronometro("l", ".tt-cronometro-botoes button")',
    '--eval', '__ttSairEVoltar(1500)',
    '--shot', join(pasta, `${motor}-m34-correndo.png`),
  ]);
  const [z, ini, amostra, pausa, lPausado, retoma, volta, lNoBotao, voltou] = r.valores;
  if (r.codigo !== 0 || !voltou) {
    linha(false, `${motor}: a prévia saiu com ${r.codigo} e ${r.valores.length} medida(s)`, r.erros);
    return;
  }
  for (const l of r.erros) console.log(`  aviso do ${motor}: ${l}`);

  const f1 = [];
  quer(f1, 'texto', z.texto, '00:00:00,00');
  if (!perto(z.fonte, 109.76, 0.1)) f1.push(`fonte do número ${z.fonte} px (esperado 8vw = 109,76)`);
  quer(f1, 'centésimos a 70%', z.centesimos, 0.7);
  quer(f1, 'números tabulares', z.numerosTabulares, 'tabular-nums');
  quer(f1, 'unidades', z.pares.map((p) => p.unidade), ['h', 'min', 's']);
  for (const p of z.pares) if (Math.abs(p.desvio) > 1 || p.abaixo < -2 || p.abaixo > 12) f1.push(`unidade ${p.unidade}: desvio ${p.desvio}, ${p.abaixo} px abaixo`);
  if (!perto(z.sobras[0], z.sobras[1], 2) || z.transborda > 0) f1.push(`número fora do centro ou transbordando: ${z.sobras}, ${z.transborda}`);
  quer(f1, 'botões', z.botoes.map((b) => [b.acao, b.rotulo, b.destaque, b.desabilitado, b.caixa.slice(2).join('×'), b.icone]), [
    ['iniciar', 'Iniciar', true, false, '64×64', 24],
    ['volta', 'Marcar volta', false, true, '64×64', 24],
    ['redefinir', 'Redefinir', false, true, '64×64', 24],
  ]);
  quer(f1, 'redondos', [...new Set(z.botoes.map((b) => b.raio))], ['50%']);
  quer(f1, 'desabilitados em --tt-fg-disabled', z.botoes.slice(1).map((b) => b.cor), [z.cores.desabilitado, z.cores.desabilitado]);
  quer(f1, 'espaços entre os botões', z.espacos, [24, 24]);
  if (Math.abs(z.meioDosBotoes) > 2) f1.push(`botões fora do meio do número: ${z.meioDosBotoes}`);
  quer(f1, 'rótulo', [z.papel, z.rotulo], ['img', 'Cronômetro zerado']);
  quer(f1, 'cor do número', z.cor, z.cores.fg1);
  linha(!f1.length, `zerado: ${z.texto} em ${z.fonte} px (centésimos a ${z.centesimos}), unidades ${z.pares.map((p) => `${p.unidade} ${p.desvio}`).join(' ')}, botões 64 px a ${z.espacos.join('/')} px`, f1);

  const f2 = [];
  quer(f2, 'iniciar', [ini.estado, ini.comandos, ini.botoes.map((b) => [b.acao, b.desabilitado])], ['running', ['stopwatch_start'], [['pausar', false], ['volta', false], ['redefinir', false]]]);
  if (!(amostra.quadros >= 20 && amostra.valores >= amostra.quadros * 0.9)) f2.push(`amostra: ${amostra.valores} valores em ${amostra.quadros} quadros`);
  if (!/^Cronômetro correndo, 0 minutos$/.test(amostra.rotulo)) f2.push(`rótulo correndo: ${amostra.rotulo}`);
  linha(!f2.length, `correndo: ${amostra.valores} textos diferentes em ${amostra.quadros} quadros de 1 s (${amostra.texto})`, f2);

  const f3 = [];
  quer(f3, 'Espaço pausa', [pausa.estado, pausa.comandos.at(-1)], ['paused', 'stopwatch_pause']);
  quer(f3, 'pausado não anda, e L não marca', [lPausado.texto, lPausado.comandos.length, lPausado.voltas.length], [pausa.texto, 2, 0]);
  quer(f3, 'Espaço retoma', [retoma.estado, retoma.comandos.at(-1)], ['running', 'stopwatch_start']);
  quer(f3, 'L marca volta', [volta.comandos.at(-1), volta.voltas.length], ['stopwatch_lap', 1]);
  quer(f3, 'com o foco num botão, L não marca', [lNoBotao.comandos.length, lNoBotao.voltas.length], [volta.comandos.length, 1]);
  linha(!f3.length, `teclado: ${[pausa, retoma, volta].map((x) => x.comandos.at(-1)).join(', ')}; comandos ${lNoBotao.comandos.join(' ')}`, f3);

  const f4 = [];
  if (Math.abs(voltou.diferenca) > 50) f4.push(`diferença ${voltou.diferenca} ms`);
  quer(f4, 'continua correndo', voltou.estado, 'running');
  linha(!f4.length, `sair e voltar: ${voltou.antes} → ${voltou.depois} ms em ${voltou.passou} ms (diferença ${voltou.diferenca} ms)`, f4);

  // 5) Pausado vindo do Rust.
  const r5 = await rodar(motor, '/?pref=light&plataforma=linux&cronometro=paused@65430&voltas=30000#/cronometro', [
    '--wait', '600', '--eval', '__ttCronometro()', '--shot', join(pasta, `${motor}-m34-pausado-claro.png`),
  ], { tamanho: '1000x700' });
  const p = r5.valores[0];
  const f5 = [];
  if (!p) f5.push('sem medida');
  else {
    quer(f5, 'pausado', [p.texto, p.estado, p.rotulo], ['00:01:05,43', 'paused', 'Cronômetro pausado em 00:01:05,43']);
    quer(f5, 'botões', p.botoes.map((b) => [b.acao, b.desabilitado]), [['retomar', false], ['volta', true], ['redefinir', false]]);
  }
  linha(!f5.length, `pausado: ${p?.texto}, "${p?.rotulo}"`, f5);

  // 6) Tamanhos.
  const f6 = [];
  const r6 = await rodar(motor, '/?pref=lite&plataforma=linux&cronometro=running@3723450#/cronometro', [
    '--wait', '600', '--eval', '__ttCronometro()', '--shot', join(pasta, `${motor}-m34-lite.png`),
  ], { tamanho: '1000x700' });
  const m6 = r6.valores[0];
  const r7 = await rodar(motor, '/?pref=dark&plataforma=linux&cronometro=running@3723450#/cronometro', [
    '--wait', '600', '--eval', '__ttCronometro()', '--shot', join(pasta, `${motor}-m34-estreito.png`),
  ], { tamanho: '480x500' });
  const m7 = r7.valores[0];
  if (!m6 || !m7) f6.push('sem medida');
  else {
    if (!perto(m6.fonte, 80, 0.1)) f6.push(`1000 × 700: ${m6.fonte} px (esperado 80)`);
    // 68 px não cabem a 480 px: abaixo do clamp, o número acompanha a área
    // de conteúdo (docs/decisoes.md, M34).
    if (!(m7.fonte < 68 && m7.fonte >= 60)) f6.push(`480 × 500: ${m7.fonte} px (esperado entre 60 e 68)`);
    for (const [nome, m] of [['1000 × 700', m6], ['480 × 500', m7]]) {
      if (m.rolagem[0] > m.rolagem[1]) f6.push(`${nome}: rolagem lateral ${m.rolagem}`);
      if (m.sobras[0] < 0 || m.sobras[1] < 0 || m.transborda > 0) f6.push(`${nome}: passa da borda ${m.sobras}, transborda ${m.transborda}`);
      if (m.botoes.some((b) => b.caixa[0] < 0)) f6.push(`${nome}: botões fora`);
    }
  }
  linha(!f6.length, `tamanhos: ${m6?.fonte} px a 1000 × 700 (sobras ${m6?.sobras}), ${m7?.fonte} px a 480 × 500 (sobras ${m7?.sobras})`, f6);
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
