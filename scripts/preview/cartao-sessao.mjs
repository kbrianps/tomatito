#!/usr/bin/env node
// Conferência do M17 (cartão "Pronto para focar") nos dois motores, sem abrir
// janela: o Chrome headless (o Chromium do WebView2 no Windows) e o WebKitGTK
// fora da tela (o motor do app no Linux). Usa o shot.mjs e o webkit-shot.mjs
// com as medidas __ttSessao, __ttTeclaNoSeletor e __ttClicar de
// scripts/preview/medidas.js, e o bandas.py para as posições pelos pixels.
//
//   node scripts/preview/cartao-sessao.mjs [--motor chrome|webkit|todos] [--capturas pasta]
//
// Confere:
//   - posições: a janela no tamanho da referência (2401 × 1638 a 175% =
//     1372 × 936 px CSS), no tema Escuro (o da captura), e o cartão medido
//     pelos pixels contra ~/dev/tomatito-ref/clock-focus-sessions-page.png:
//     título, as duas linhas do texto, o seletor (topo e sublinhado), o
//     número, a unidade, os chevrons, a frase, a caixa e o botão diferem no
//     máximo 4 px (y de cima e centro em x);
//   - o seletor: 160 × 87, campo de 111 e coluna de 48 com 1 px de separação,
//     as cores do tema (fundo --tt-input-bg, sublinhado --tt-stroke-control,
//     unidade --tt-fg-2-on-ctl) e o ARIA da seção 3.8;
//   - os chevrons (clique) e as teclas (↑/↓, PageUp/PageDown, Home/End) mudam
//     o valor; nos limites, o chevron desabilita; no Chrome, com teclas e
//     cliques de verdade (e o clique no chevron não tira o foco do campo);
//     no WebKitGTK, com eventos do JS;
//   - a frase: 30 min "Sem intervalos.", 45 e 60 "Você terá 1 intervalo.", 90
//     "Você terá 2 intervalos.", e "Sem intervalos." com "Pular intervalos";
//   - o botão pede o focus_start com os minutos e o "Pular intervalos", e o
//     cartão passa para a contagem;
//   - no debug (?debug=1), o seletor anda de 1 em 1 a partir de 1 min;
//   - controle negativo: com o conteúdo do cartão 6 px mais baixo, as
//     posições acusam.
// Sai com 1 se alguma conferência falhar.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AQUI = fileURLToPath(new URL('.', import.meta.url));
const NOMES = { chrome: 'Chrome headless', webkit: 'WebKitGTK fora da tela' };
const REFERENCIA = join(homedir(), 'dev/tomatito-ref/clock-focus-sessions-page.png');
// O cartão na captura do Relógio, em pixels (com a borda), a 175%.
const CARTAO_REF = [551, 72, 1339, 811];
const TAMANHO = '1372x936';
const FOLGA = 4;

function lerArgs(argv) {
  const opts = { motor: 'todos', capturas: null };
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i].replace(/^--/, '');
    if (!(k in opts) || argv[i + 1] === undefined) throw new Error('uso: cartao-sessao.mjs [--motor chrome|webkit|todos] [--capturas pasta]');
    opts[k] = argv[i + 1];
  }
  if (!['chrome', 'webkit', 'todos'].includes(opts.motor)) throw new Error(`motor desconhecido: ${opts.motor}`);
  if (opts.capturas) mkdirSync(resolve(opts.capturas), { recursive: true });
  return opts;
}

/** Roda o shot.mjs ou o webkit-shot.mjs e devolve os valores dos --eval, na ordem. */
function rodar(motor, caminho, passos) {
  const script = join(AQUI, motor === 'webkit' ? 'webkit-shot.mjs' : 'shot.mjs');
  const args = [script, '--size', TAMANHO, '--path', caminho, ...passos];
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

function bandas(png, escala, caixa) {
  const r = spawnSync('python3', [join(AQUI, 'bandas.py'), png, String(escala), ...caixa.map(String)], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`bandas.py: ${r.stderr}`);
  return JSON.parse(r.stdout);
}

const MEDIDAS = ['titulo', 'texto1', 'texto2', 'seletor', 'digitos', 'unidade', 'chevron_cima', 'chevron_baixo', 'frase', 'caixa', 'botao'];

/** Compara as posições: y de cima e centro em x, com a folga de 4 px. */
export function compararPosicoes(nosso, ref, folga = FOLGA) {
  const linhas = [];
  for (const nome of MEDIDAS) {
    const a = nosso[nome];
    const b = ref[nome];
    if (!a || !b) {
      linhas.push({ nome, ok: false, texto: `sem medida (nosso ${JSON.stringify(a)}, Relógio ${JSON.stringify(b)})` });
      continue;
    }
    const dy = Math.round((a[0] - b[0]) * 10) / 10;
    const dyBase = nome === 'seletor' ? Math.round((a[1] - b[1]) * 10) / 10 : 0;
    const dx = a[2] === null || b[2] === null ? 0 : Math.round((a[2] - b[2]) * 10) / 10;
    const ok = Math.abs(dy) <= folga && Math.abs(dx) <= folga && Math.abs(dyBase) <= folga;
    const extra = nome === 'seletor' ? `, sublinhado ${a[1]} × ${b[1]} (Δ ${dyBase})` : `, Δx ${dx}`;
    linhas.push({ nome, ok, texto: `y ${a[0]} × ${b[0]} (Δ ${dy})${extra}` });
  }
  return linhas;
}

const perto = (v, alvo, folga = 0.5) => Math.abs(v - alvo) <= folga;

async function conferir(motor, capturas, linha) {
  const pasta = capturas ?? mkdtempSync(join(tmpdir(), 'tomatito-m17-'));
  const png = join(pasta, `${motor}-foco-escuro.png`);
  try {
    // 1) Posições e medidas, no Escuro, sem sessão.
    const r1 = await rodar(motor, '/?pref=dark&plataforma=windows#/foco', ['--wait', '600', '--eval', '__ttSessao()', '--shot', png]);
    if (r1.codigo !== 0 || r1.valores.length !== 1) {
      linha(false, `${motor}: a prévia saiu com ${r1.codigo} e ${r1.valores.length} medida(s)`, r1.erros);
      return;
    }
    for (const l of r1.erros) console.log(`  aviso do ${motor}: ${l}`);
    const s = r1.valores[0];
    const [x, y, w, h] = s.caixas.janela;
    const nosso = bandas(png, 1, [x, y, x + w, y + h].map(Math.round));
    const ref = bandas(REFERENCIA, 1.75, CARTAO_REF);
    for (const l of compararPosicoes(nosso, ref)) linha(l.ok, `posição ${l.nome}: ${l.texto}`);
    if (nosso.aviso || ref.aviso) linha(false, `faixas: ${nosso.aviso ?? ''} ${ref.aviso ?? ''}`);

    const c = s.caixas;
    const fs = [];
    if (!(perto(c.seletor[2], 160) && perto(c.seletor[3], 87))) fs.push(`seletor ${c.seletor[2]} × ${c.seletor[3]}, esperado 160 × 87`);
    // O campo tem 110 por dentro + 1 da borda esquerda = 111; a coluna, 1 de
    // separação + 47 + 1 da borda direita.
    if (!perto(c.campo[2], 110) || !perto(c.chevrons[0] - c.seletor[0], 111) || !perto(c.chevrons[2], 48)) {
      fs.push(`campo ${c.campo[2]} (+1 de borda), coluna a ${c.chevrons[0] - c.seletor[0]} com ${c.chevrons[2]} (1 de separação + 47)`);
    }
    if (!perto(c.menos[1] - (c.mais[1] + c.mais[3]), 0) || !perto(c.mais[3], 42) || !perto(c.menos[3], 43)) {
      fs.push(`chevrons ${c.mais[3]} e ${c.menos[3]} (42 e 1 + 42)`);
    }
    for (const k of ['campo', 'sublinhado', 'unidade', 'texto']) {
      if (s.cores[k] !== s.cores.esperado[k]) fs.push(`${k} ${s.cores[k]}, esperado ${s.cores.esperado[k]}`);
    }
    linha(!fs.length, `seletor 160 × 87 (campo 111, coluna 48), cores do tema`, fs);

    const a = s.aria;
    const fa = [];
    const quer = { role: 'spinbutton', tabindex: '0', 'aria-label': 'Duração da sessão', 'aria-valuemin': '5', 'aria-valuemax': '240', 'aria-valuenow': '30', 'aria-valuetext': '30 minutos', 'aria-describedby': 'foco-frase' };
    for (const [k, v] of Object.entries(quer)) if (a[k] !== v) fa.push(`${k}="${a[k]}", esperado "${v}"`);
    if (s.mais.tabindex !== '-1' || s.menos.tabindex !== '-1') fa.push('chevrons no Tab');
    if (s.frase !== 'Sem intervalos.') fa.push(`frase "${s.frase}"`);
    if (!s.preparo || s.andamento) fa.push(`preparo ${s.preparo}, andamento ${s.andamento}`);
    linha(!fa.length, `ARIA: ${a.role} "${a['aria-label']}", ${a['aria-valuemin']}–${a['aria-valuemax']}, "${a['aria-valuetext']}"; chevrons fora do Tab`, fa);

    // 2) Teclas, chevrons, frase e início.
    const passos = [];
    const rotulos = [];
    const medir = (rotulo, expr = '__ttSessao()') => {
      passos.push('--eval', expr);
      rotulos.push(rotulo);
    };
    const tecla = (t) => {
      if (motor === 'chrome') {
        passos.push('--key', t);
        medir(t);
      } else medir(t, `__ttTeclaNoSeletor(${JSON.stringify(t)})`);
    };
    const clicar = (rotulo, sel) => {
      if (motor === 'chrome') {
        passos.push('--click', sel);
        medir(rotulo);
      } else medir(rotulo, `__ttClicar(${JSON.stringify(sel)})`);
    };
    const MAIS = '[data-cartao="sessao"] [data-passo="+1"]';
    const MENOS = '[data-cartao="sessao"] [data-passo="-1"]';
    if (motor === 'chrome') passos.push('--click', '[data-cartao="sessao"] [role="spinbutton"]');
    else passos.push('--eval', `__ttTeclaNoSeletor('Shift')`), rotulos.push(null);
    clicar('mais', MAIS);
    clicar('menos', MENOS);
    clicar('menos', MENOS);
    tecla('ArrowUp');
    tecla('PageUp');
    tecla('ArrowUp');
    tecla('PageUp');
    tecla('PageDown');
    tecla('ArrowDown');
    tecla('End');
    clicar('mais no máximo', MAIS);
    tecla('Home');
    tecla('ArrowDown');
    tecla('PageUp');
    tecla('PageUp');
    tecla('PageUp');
    tecla('PageUp');
    clicar('pular', '[data-cartao="sessao"] fluent-checkbox');
    clicar('iniciar', '[data-cartao="sessao"] [data-iniciar]');
    if (capturas) passos.push('--shot', join(pasta, `${motor}-foco-sessao-iniciada.png`));
    const r2 = await rodar(motor, '/?pref=lite&plataforma=windows#/foco', passos);
    if (r2.codigo !== 0 || r2.valores.length !== rotulos.length) {
      linha(false, `${motor}: a prévia das teclas saiu com ${r2.codigo} e ${r2.valores.length} de ${rotulos.length} medidas`, r2.erros);
      return;
    }
    const seq = rotulos.map((r, i) => [r, r2.valores[i]]).filter(([r]) => r);
    const esperado = [
      ['mais', 35], ['menos', 30], ['menos', 25],
      ['ArrowUp', 30], ['PageUp', 45], ['ArrowUp', 50], ['PageUp', 65], ['PageDown', 50], ['ArrowDown', 45],
      ['End', 240], ['mais no máximo', 240], ['Home', 5], ['ArrowDown', 5],
      ['PageUp', 20], ['PageUp', 35], ['PageUp', 50], ['PageUp', 65],
    ];
    const valores = seq.slice(0, esperado.length).map(([r, v]) => [r, v.valor]);
    const fv = [];
    esperado.forEach(([r, v], i) => {
      if (valores[i]?.[0] !== r || valores[i]?.[1] !== v) fv.push(`${r}: ${valores[i]?.[1]}, esperado ${v}`);
    });
    const porRotulo = (r) => seq.findLast(([x]) => x === r)?.[1];
    const primeiro = (r) => seq.find(([x]) => x === r)?.[1];
    if (!porRotulo('End').mais.desabilitado || porRotulo('End').menos.desabilitado) fv.push('no 240, só o chevron de cima desabilita');
    if (!porRotulo('Home').menos.desabilitado || porRotulo('Home').mais.desabilitado) fv.push('no 5, só o chevron de baixo desabilita');
    if (motor === 'chrome' && !String(primeiro('menos').foco).includes('tt-seletor-campo')) fv.push(`o clique no chevron levou o foco para ${porRotulo('menos').foco}`);
    linha(!fv.length, `chevrons e teclas: ${valores.map(([r, v]) => `${r} ${v}`).join(', ')}`, fv);

    const ff = [];
    const frases = { 45: 'Você terá 1 intervalo.', 50: 'Você terá 1 intervalo.', 30: 'Sem intervalos.', 65: 'Você terá 2 intervalos.', 240: 'Você terá 7 intervalos.', 5: 'Sem intervalos.' };
    for (const [, v] of seq.slice(0, esperado.length)) {
      if (frases[v.valor] && v.frase !== frases[v.valor]) ff.push(`${v.valor} min: "${v.frase}", esperado "${frases[v.valor]}"`);
      if (v.numero !== String(v.valor) || v.aria['aria-valuetext'] !== `${v.valor} minutos`) ff.push(`${v.valor}: número ${v.numero}, ${v.aria['aria-valuetext']}`);
    }
    const pular = porRotulo('pular');
    if (!pular.pular || pular.frase !== 'Sem intervalos.') ff.push(`com "Pular intervalos": ${pular.pular}, "${pular.frase}"`);
    linha(!ff.length, `frase: 65 min "${porRotulo('PageUp').frase}", 5 "${porRotulo('Home').frase}", pular "${pular.frase}"`, ff);

    const ini = porRotulo('iniciar');
    const fi = [];
    if (JSON.stringify(ini.inicios) !== JSON.stringify([{ minutes: 65, skipBreaks: true, taskId: null }])) fi.push(`focus_start ${JSON.stringify(ini.inicios)}`);
    if (ini.preparo || !ini.andamento) fi.push(`preparo ${ini.preparo}, andamento ${ini.andamento}`);
    linha(!fi.length, `iniciar: focus_start ${JSON.stringify(ini.inicios)}, o cartão passa para a contagem`, fi);

    // 3) Controle negativo: com o conteúdo 6 px mais baixo, a comparação
    // das posições precisa acusar.
    const sabotado = join(pasta, `${motor}-sabotado.png`);
    const r4 = await rodar(motor, '/?pref=dark&plataforma=windows#/foco', [
      '--wait', '600',
      '--eval', `__ttSabotarSessao()`,
      '--eval', '__ttSessao()',
      '--shot', sabotado,
    ]);
    const sab = r4.valores[1]?.caixas?.janela;
    const acusou = sab ? compararPosicoes(bandas(sabotado, 1, [sab[0], sab[1], sab[0] + sab[2], sab[1] + sab[3]].map(Math.round)), ref).filter((l) => !l.ok).length : 0;
    linha(acusou >= 8, `controle negativo (conteúdo 6 px abaixo): ${acusou} posições acusadas`);

    // 4) Debug: de 1 em 1, a partir de 1.
    const r3 = await rodar(motor, '/?pref=lite&plataforma=windows&debug=1#/foco', [
      '--wait', '300',
      '--eval', `__ttTeclaNoSeletor('ArrowUp')`,
      '--eval', `__ttTeclaNoSeletor('Home')`,
      '--eval', `__ttTeclaNoSeletor('PageUp')`,
    ]);
    const d = r3.valores.map((v) => v?.valor);
    linha(
      r3.codigo === 0 && JSON.stringify(d) === '[31,1,16]' && r3.valores[1]?.aria['aria-valuemin'] === '1',
      `debug: ↑ ${d[0]}, Home ${d[1]} (mínimo ${r3.valores[1]?.aria['aria-valuemin']}), PageUp ${d[2]}`,
    );
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
