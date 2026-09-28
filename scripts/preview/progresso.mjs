#!/usr/bin/env node
// Conferência do M27 (cartão "Progresso diário") nos dois motores, sem abrir
// janela: o Chrome headless (o Chromium do WebView2 no Windows) e o WebKitGTK
// fora da tela (o motor do app no Linux). Usa o shot.mjs e o webkit-shot.mjs
// com as medidas __ttProgresso e __ttSerieDoAnel de scripts/preview/medidas.js,
// o stats_get do tauri-mock.js (que soma os focos que o motor simulado
// termina) e o progresso_pixels.py para as posições e as cores pelos pixels.
//
//   node scripts/preview/progresso.mjs [--motor chrome|webkit|todos] [--capturas pasta]
//
// Confere:
//   - posições: a janela no tamanho da referência (1372 × 936 px CSS), no
//     Escuro, e o cartão medido pelos pixels contra
//     ~/dev/tomatito-ref/clock-focus-sessions-page.png (o Relógio a 175%): o
//     topo do título, das três linhas de cada coluna e do rodapé, com folga de
//     3 px, e as quatro bordas do anel, com folga de 2 px;
//   - o que se vê: os números e as unidades (1,5 hora, 2 horas, 2,5 horas), o
//     rodapé, o role="img" com o rótulo, o arco (deslocamento, pontas
//     redondas, giro de −90°, transição de 1 s linear) e as cores do trilho e
//     do arco, calculadas e nos pixels (dentro e fora do arco);
//   - com o relógio 600 vezes mais rápido, uma sessão de 30 min iniciada pelo
//     cartão de sessão faz o anel avançar de 37,5% a 62,5%, passando por
//     valores intermediários em cerca de 1 s, e o rodapé e Esta semana mudam;
//   - acima da meta, o anel cheio; sem nada hoje, o arco escondido; meta
//     desativada, sem o anel; movimento reduzido, 83 ms;
//   - estreito (480 × 500 a 150%): o anel em cima e as colunas embaixo, sem
//     nada passar da borda nem encostar no anel;
//   - os quatro temas na janela padrão (1000 × 700): cores calculadas iguais às
//     dos tokens, e as três colunas com o anel menor;
//   - controle negativo: com o anel 12 px mais baixo, as posições acusam.
// Sai com 1 se alguma conferência falhar.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AQUI = fileURLToPath(new URL('.', import.meta.url));
const NOMES = { chrome: 'Chrome headless', webkit: 'WebKitGTK fora da tela' };
const REFERENCIA = join(homedir(), 'dev/tomatito-ref/clock-focus-sessions-page.png');
// O cartão do Relógio na captura: canto em px da captura, a 175%, com 448 px CSS.
const REF = { escala: 1.75, x: 1362, y: 73, largura: 448 };
const TAMANHO = '1372x936';
const BASE = '/?plataforma=windows&hoje=2700&ontem=5400&semana=9000';
const C = 2 * Math.PI * 94;
const r3 = (n) => Math.round(n * 1000) / 1000;

function lerArgs(argv) {
  const opts = { motor: 'todos', capturas: null };
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i].replace(/^--/, '');
    if (!(k in opts) || argv[i + 1] === undefined) throw new Error('uso: progresso.mjs [--motor chrome|webkit|todos] [--capturas pasta]');
    opts[k] = argv[i + 1];
  }
  if (!['chrome', 'webkit', 'todos'].includes(opts.motor)) throw new Error(`motor desconhecido: ${opts.motor}`);
  if (opts.capturas) mkdirSync(resolve(opts.capturas), { recursive: true });
  return opts;
}

/** Roda o shot.mjs ou o webkit-shot.mjs e devolve os valores dos --eval de __tt*, na ordem. */
function rodar(motor, caminho, passos, { tamanho = TAMANHO, extra = [] } = {}) {
  const script = join(AQUI, motor === 'webkit' ? 'webkit-shot.mjs' : 'shot.mjs');
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

function pixels(png, escala, x, y, largura, anel = null) {
  const extra = anel ? anel.map(String) : [];
  const r = spawnSync('python3', [join(AQUI, 'progresso_pixels.py'), png, String(escala), String(x), String(y), String(largura), ...extra], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`progresso_pixels.py: ${r.stderr}`);
  return JSON.parse(r.stdout);
}

/**
 * Compara as medidas pelos pixels. Os textos: o topo de cada faixa (os textos
 * são outros, então o fim das faixas muda com as descendentes). O anel: as
 * quatro bordas, com x a partir do centro de cada cartão.
 */
export function compararPosicoes(nosso, ref, largura) {
  const linhas = [];
  const d = (v) => Math.round(v * 10) / 10;
  for (const nome of ['titulo', 'ontem', 'semana', 'rodape']) {
    const a = nosso[nome] ?? [];
    const b = ref[nome] ?? [];
    const ok = a.length === b.length && a.every((f, i) => Math.abs(f[0] - b[i][0]) <= 3);
    linhas.push({ nome, ok, texto: `topos ${a.map((f) => f[0]).join(', ')} × ${b.map((f) => f[0]).join(', ')}` });
  }
  const bordas = {
    topo: [nosso.anel.topo, ref.anel.topo],
    base: [nosso.anel.base, ref.anel.base],
    esquerda: [nosso.anel.esquerda - largura / 2, ref.anel.esquerda - 224],
    direita: [nosso.anel.direita - largura / 2, ref.anel.direita - 224],
  };
  for (const [nome, [a, b]] of Object.entries(bordas)) {
    const ok = Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 2;
    linhas.push({ nome: `anel ${nome}`, ok, texto: `${d(a)} × ${d(b)} (Δ ${d(a - b)})` });
  }
  return linhas;
}

const rgbHex = (s) => {
  const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/.exec(s ?? '');
  return m ? '#' + m.slice(1, 4).map((v) => Math.round(Number(v)).toString(16).padStart(2, '0')).join('').toUpperCase() : null;
};
const perto = (a, b, tol = 3) => {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  return a && b && p(a).every((v, i) => Math.abs(v - p(b)[i]) <= tol);
};

async function conferir(motor, capturas, linha) {
  const pasta = capturas ?? mkdtempSync(join(tmpdir(), 'tomatito-m27-'));
  const png = join(pasta, `${motor}-progresso-escuro.png`);
  const clicar = (seletor) => (motor === 'chrome' ? ['--click', seletor, '--wait', '100'] : ['--eval', `__ttClicar(${JSON.stringify(seletor)})`]);
  try {
    // 1) Posições, texto, arco e cores, no Escuro.
    const r1 = await rodar(motor, `${BASE}&pref=dark#/foco`, ['--wait', '800', '--eval', '__ttProgresso()', '--shot', png]);
    if (r1.codigo !== 0 || r1.valores.length !== 1) {
      linha(false, `${motor}: a prévia saiu com ${r1.codigo} e ${r1.valores.length} medida(s)`, r1.erros);
      return;
    }
    for (const l of r1.erros) console.log(`  aviso do ${motor}: ${l}`);
    const m = r1.valores[0];
    const [cx, cy, cw] = m.caixas.cartao;
    const [ax, ay, aw] = m.caixas.anel;
    const ref = pixels(REFERENCIA, REF.escala, REF.x, REF.y, REF.largura);
    const nosso = pixels(png, 1, cx, cy, cw, [ax + aw / 2, ay + aw / 2, (94 * aw) / 206, 0.375]);
    for (const l of compararPosicoes(nosso, ref, cw)) linha(l.ok, `posição ${l.nome}: ${l.texto}`);

    const fv = [];
    const quer = (nome, v, esperado) => JSON.stringify(v) !== JSON.stringify(esperado) && fv.push(`${nome}: ${JSON.stringify(v)}, esperado ${JSON.stringify(esperado)}`);
    quer('título', m.titulo, 'Progresso diário');
    quer('rótulos', m.rotulos, ['Ontem', 'Meta diária', 'Esta semana']);
    quer('ontem', m.ontem, { numero: '1,5', unidade: 'hora' });
    quer('meta', m.meta, { numero: '2', unidade: 'horas' });
    quer('semana', m.semana, { numero: '2,5', unidade: 'horas' });
    quer('rodapé', m.rodape, 'Concluído: 45 minutos');
    quer('papel', m.papel, 'img');
    quer('rótulo', m.rotulo, 'Meta diária de 2 horas. Concluído hoje: 45 minutos, 37% da meta.');
    quer('carregando', m.carregando, false);
    quer('deslocamento', m.arco.deslocamento, r3(C * 0.625));
    quer('visível', m.arco.visivel, true);
    quer('pontas', m.arco.pontas, 'round');
    quer('giro', m.arco.girado, 'rotate(-90 103 103)');
    quer('transição', m.arco.transicao, ['stroke-dashoffset', '1s', 'linear']);
    quer('cor do trilho', m.cores.trilho, m.cores.esperado.trilho);
    quer('cor do arco', m.cores.arco, m.cores.esperado.arco);
    quer('larguras do traço', m.larguras, ['18px', '18px']);
    quer('anel', m.caixas.anel.slice(2), [206, 206]);
    const trilho = rgbHex(m.cores.esperado.trilho);
    const arco = rgbHex(m.cores.esperado.arco);
    for (const [graus, a] of Object.entries(nosso.amostras ?? {})) {
      if (!perto(a.cor, a.dentro ? arco : trilho)) fv.push(`pixel a ${graus}°: ${a.cor}, esperado ${a.dentro ? `arco ${arco}` : `trilho ${trilho}`}`);
    }
    linha(!fv.length, `o que se vê: ${m.ontem.numero} ${m.ontem.unidade} | ${m.meta.numero} ${m.meta.unidade} | ${m.semana.numero} ${m.semana.unidade}; "${m.rodape}"; arco ${m.arco.deslocamento} (37,5%), ${m.arco.transicao.join(' ')}; pixels ${Object.entries(nosso.amostras ?? {}).map(([g, a]) => `${g}° ${a.cor}`).join(', ')}`, fv);

    // 2) Uma sessão de 30 min a 600× (3 s) termina e o anel avança em ~1 s.
    const r2 = await rodar(motor, `${BASE}&pref=dark&velocidade=600#/foco`, [
      '--wait', '600',
      '--eval', '__ttProgresso()',
      ...clicar('[data-iniciar]'),
      '--eval', '__ttSerieDoAnel(5000, 50)',
      '--eval', '__ttProgresso()',
    ], { extra: motor === 'webkit' ? ['--timeout', '60'] : [] });
    const [antes, ...resto] = r2.valores;
    const depois = resto.at(-1);
    const serie = resto.find(Array.isArray) ?? [];
    const de = r3(C * 0.625);
    const para = r3(C * 0.375);
    const meio = serie.filter((s) => s.d < de - 1 && s.d > para + 1);
    const primeiro = serie.find((s) => s.d < de - 0.01);
    const ultimo = serie.find((s) => Math.abs(s.d - para) < 0.01);
    const dur = primeiro && ultimo ? ultimo.t - primeiro.t : null;
    const fs = [];
    if (antes?.arco?.deslocamento !== de) fs.push(`antes: ${antes?.arco?.deslocamento}, esperado ${de}`);
    if (depois?.arco?.deslocamento !== para) fs.push(`depois: ${depois?.arco?.deslocamento}, esperado ${para}`);
    if (depois?.rodape !== 'Concluído: 75 minutos') fs.push(`rodapé: ${depois?.rodape}`);
    if (JSON.stringify(depois?.semana) !== JSON.stringify({ numero: '3', unidade: 'horas' })) fs.push(`semana: ${JSON.stringify(depois?.semana)}`);
    if (meio.length < 3) fs.push(`${meio.length} amostras no meio do caminho (esperado ≥ 3): ${JSON.stringify(serie.map((s) => s.d))}`);
    if (!(dur >= 700 && dur <= 1500)) fs.push(`o arco levou ${dur} ms (esperado ~1000)`);
    linha(r2.codigo === 0 && !fs.length, `sessão acelerada: arco ${antes?.arco?.deslocamento} → ${depois?.arco?.deslocamento} em ${dur} ms, ${meio.length} amostras no caminho; "${depois?.rodape}"; semana ${depois?.semana?.numero} ${depois?.semana?.unidade}`, fs);

    // 3) Acima da meta, sem nada hoje, meta desativada.
    const r3a = await rodar(motor, '/?plataforma=windows&hoje=9000&pref=lite#/foco', ['--wait', '600', '--eval', '__ttProgresso()']);
    const cheio = r3a.valores[0];
    linha(cheio?.arco?.deslocamento === 0 && /150 minutos, 125% da meta\.$/.test(cheio?.rotulo) && cheio?.rodape === 'Concluído: 150 minutos',
      `acima da meta: arco ${cheio?.arco?.deslocamento}, "${cheio?.rotulo}"`);
    const r3b = await rodar(motor, '/?plataforma=windows&pref=lite#/foco', ['--wait', '600', '--eval', '__ttProgresso()']);
    const zero = r3b.valores[0];
    linha(zero?.arco?.vazio === true && zero?.arco?.visivel === false && zero?.ontem?.unidade === 'minutos' && zero?.rodape === 'Concluído: 0 minutos',
      `sem nada hoje: arco escondido (${zero?.arco?.vazio}, visível ${zero?.arco?.visivel}), ontem ${zero?.ontem?.numero} ${zero?.ontem?.unidade}`);
    const semMetaPng = join(pasta, `${motor}-sem-meta.png`);
    const r3c = await rodar(motor, `${BASE}&pref=lite&meta=0#/foco`, ['--wait', '600', '--eval', '__ttProgresso()', '--shot', semMetaPng]);
    const sm = r3c.valores[0];
    linha(sm?.semMeta === true && sm?.anelVisivel === false && sm?.rodape === 'Concluído: 45 minutos' && sm?.caixas?.cartao?.[3] === m.caixas.cartao[3],
      `meta desativada: sem anel (${!sm?.anelVisivel}), Ontem e Esta semana ficam, o cartão guarda a altura (${sm?.caixas?.cartao?.[3]} × ${m.caixas.cartao[3]})`);

    // 4) Movimento reduzido.
    const r4 = await rodar(motor, `${BASE}&pref=dark#/foco`, ['--wait', '600', '--eval', '__ttProgresso()'], { extra: ['--motion', 'reduce'] });
    const red = r4.valores[0]?.arco?.transicao;
    linha(JSON.stringify(red) === JSON.stringify(['stroke-dashoffset', '0.083s', 'linear']), `movimento reduzido: ${JSON.stringify(red)}`);

    // 5) Estreito: 480 × 500 com zoom de 150% (320 × 333 px CSS).
    const estreitoPng = join(pasta, `${motor}-estreito.png`);
    const r5 = await rodar(motor, `${BASE}&pref=dark#/foco`, [
      '--wait', '500', '--resize', '480x500@1.5', '--wait', '500',
      '--eval', "__ttProgresso(document.querySelector('[data-cartao=\"progresso\"]').scrollIntoView())",
      '--shot', estreitoPng,
    ]);
    const e = r5.valores[0];
    const fe = [];
    if (!e) fe.push('sem medida');
    else {
      if (e.transborda) fe.push('o cartão transborda');
      // Nas três colunas, lado a lado; empilhado (menos de 350 px), abaixo do anel.
      const [ox, oy, ow] = e.caixas.ontem;
      const [sx, sy, sw] = e.caixas.semana;
      const [nx, ny, nw, nh] = e.caixas.anel;
      const abaixo = (y) => y >= ny + nh - 0.5;
      if (!(ox + ow <= nx + 0.5 || abaixo(oy))) fe.push(`Ontem encosta no anel (${e.caixas.ontem} × ${e.caixas.anel})`);
      if (!(sx >= nx + nw - 0.5 || abaixo(sy))) fe.push(`Esta semana encosta no anel (${e.caixas.semana} × ${e.caixas.anel})`);
      if (ox < 0 || sx + sw > e.caixas.cartao[2] || nx < 0 || nx + nw > e.caixas.cartao[2]) fe.push('algo passa da borda do cartão');
      if (nw < 100) fe.push(`anel com ${nw} px`);
    }
    linha(r5.codigo === 0 && !fe.length, `estreito (480 × 500 a 150%): cartão ${e?.caixas?.cartao?.[2]} px, anel ${e?.caixas?.anel?.[2]} px`, fe);

    // 6) Os quatro temas.
    for (const tema of ['lite', 'suave', 'light', 'dark']) {
      const shot = join(pasta, `${motor}-progresso-${tema}.png`);
      const r6 = await rodar(motor, `${BASE}&pref=${tema}#/foco`, ['--wait', '600', '--eval', '__ttProgresso()', '--shot', shot], { tamanho: '1000x700' });
      const t = r6.valores[0];
      const ok = t && t.cores.trilho === t.cores.esperado.trilho && t.cores.arco === t.cores.esperado.arco;
      // Na janela padrão (cartão de ~318 px), continuam as três colunas, com o anel menor.
      const [ox, oy, ow, oh] = t?.caixas?.ontem ?? [];
      const [nx, ny, nw, nh] = t?.caixas?.anel ?? [];
      const [sx] = t?.caixas?.semana ?? [];
      const tres = ox + ow <= nx && sx >= nx + nw && Math.abs(oy + oh / 2 - (ny + nh / 2)) < 2 && nw >= 130;
      const umaLinha = (t?.alturasDosRotulos ?? []).length === 3 && t.alturasDosRotulos.every((h) => h <= 20);
      linha(ok && tres && umaLinha, `tema ${tema} (1000 × 700): trilho ${rgbHex(t?.cores?.trilho)}, arco ${rgbHex(t?.cores?.arco)}; três colunas, anel de ${nw} px, rótulos com ${JSON.stringify(t?.alturasDosRotulos)} px`);
    }

    // 7) Controle negativo: o anel 12 px abaixo.
    const sabotado = join(pasta, `${motor}-sabotado.png`);
    const r7 = await rodar(motor, `${BASE}&pref=dark#/foco`, ['--wait', '800', '--eval', '__ttSabotarProgresso()', '--eval', '__ttProgresso()', '--shot', sabotado]);
    const s7 = r7.valores[1];
    const acusou = s7 ? compararPosicoes(pixels(sabotado, 1, ...s7.caixas.cartao.slice(0, 3)), ref, s7.caixas.cartao[2]).filter((l) => !l.ok).map((l) => l.nome) : [];
    linha(acusou.length >= 3, `controle negativo (anel 12 px abaixo): ${acusou.length} posições acusadas (${acusou.join(', ')})`);
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
