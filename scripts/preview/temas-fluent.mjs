#!/usr/bin/env node
// Conferência dos tokens do Fluent gerados (M11) nos dois motores, sem abrir
// janela: o Chrome headless (o Chromium do WebView2 no Windows) e o WebKitGTK
// fora da tela (o motor do app no Linux). Usa o shot.mjs e o webkit-shot.mjs
// com as medidas __ttFluent e __ttFluentAninhado de scripts/preview/medidas.js.
//
//   node scripts/preview/temas-fluent.mjs [--motor chrome|webkit|todos] [--capturas pasta]
//
// No #/dev, troca o data-theme do <html> entre lite, suave, light, dark e full
// (a troca que se faz no DevTools) e confere, em cada tema:
//   - os tokens do Fluent no <html> são exatamente os do bloco gerado para o
//     tema (createLightTheme para light e suave; createDarkTheme para dark,
//     lite e full), menos os que a ponte cobre, que valem o --tt-* do tema;
//     nenhum token sobrando (como o do setTheme provisório, que saiu);
//   - as cores que os fluent-switch e fluent-radio pintam (no elemento e no
//     indicador dentro do shadow root) são as do tema;
//   - os quatro temas normais pintam os componentes de quatro jeitos
//     diferentes, e o full, como o lite.
// E a prévia aninhada: um <div data-theme="..."> com um switch dentro do
// <html> do Lite recebe os tokens do tema do div. Sai com 1 se algo falhar.
//
// O conferirTema() também serve ao resumo do teste aninhado
// (scripts/gnome-aninhado/resumo-temas-fluent.mjs).
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { TEMAS as FONTES, lerRampa, temasFluent } from '../build-theme-css.mjs';

const AQUI = fileURLToPath(new URL('.', import.meta.url));
const RAIZ = new URL('../..', import.meta.url);
const ler = (caminho) => readFileSync(new URL(caminho, RAIZ), 'utf8');
// Tema → "claro" ou "escuro", a mesma tabela do gerador (o teste dele confere
// os seletores de cada bloco contra o plano).
const FONTE = Object.fromEntries(FONTES);

/** Tokens do Fluent que a ponte cobre: { colorNeutralBackground1: 'tt-bg-card', … }. */
export function lerPonte(css = ler('src/styles/bridge.css')) {
  const ponte = {};
  for (const m of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/--([a-zA-Z0-9]+)\s*:\s*var\(--(tt-[a-z0-9-]+)\)/g)) {
    ponte[m[1]] = m[2];
  }
  return ponte;
}

const gerados = temasFluent(lerRampa(ler('src/styles/tokens.css')));
const ponte = lerPonte();
// Cada motor serializa os valores do seu jeito (o WebKitGTK troca aspas simples
// por duplas nas listas de fontes); fora isso, o texto é o mesmo.
const normalizar = (v) => String(v).replace(/'/g, '"').replace(/\s+/g, ' ').trim();
const rgb = (hex) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;

/** O que cada componente do #/dev pinta no tema, a partir dos tokens esperados. */
export function coresEsperadas(tema, tt) {
  const g = gerados[FONTE[tema]];
  const accent = rgb(tt['tt-accent']);
  return {
    'fluent-switch marcado': { fundo: accent, indicador: rgb(g.colorNeutralForegroundInverted) },
    'fluent-switch desmarcado': { borda: rgb(tt['tt-stroke-control']), indicador: rgb(tt['tt-fg-2']) },
    'fluent-radio marcado': { borda: accent, indicador: accent },
    'fluent-radio desmarcado': { fundo: rgb(tt['tt-bg-card']), borda: rgb(tt['tt-stroke-control']) },
  };
}

/**
 * Confere uma medida do __ttFluent (ou do __ttFluentAninhado) contra o tema e
 * devolve as falhas. Com `todosOsComponentes`, exige os quatro casos do #/dev
 * (switch e radio, marcados e desmarcados).
 */
export function conferirTema(m, tema, { todosOsComponentes = true } = {}) {
  const falhas = [];
  const g = gerados[FONTE[tema]];
  const nomes = Object.keys(g);
  const sobrando = Object.keys(m.tokens).filter((k) => !(k in g));
  const faltando = nomes.filter((k) => !(k in m.tokens));
  if (sobrando.length) falhas.push(`${sobrando.length} tokens fora do gerado: ${sobrando.slice(0, 5).join(', ')}`);
  if (faltando.length) falhas.push(`${faltando.length} tokens do gerado faltando: ${faltando.slice(0, 5).join(', ')}`);
  const errados = [];
  for (const k of nomes) {
    if (!(k in m.tokens)) continue;
    const quer = ponte[k] ? m.tt[ponte[k]] : g[k];
    if (normalizar(m.tokens[k]) !== normalizar(quer)) errados.push(`${k} = ${m.tokens[k]} (esperado ${quer}${ponte[k] ? `, da ponte: --${ponte[k]}` : ''})`);
  }
  if (errados.length) falhas.push(`${errados.length} tokens com outro valor: ${errados.slice(0, 5).join('; ')}`);
  const cores = coresEsperadas(tema, m.tt);
  const vistos = new Set();
  for (const c of m.componentes) {
    const chave = `${c.tag} ${c.marcado ? 'marcado' : 'desmarcado'}`;
    const quer = cores[chave];
    if (!quer) continue;
    vistos.add(chave);
    const tem = { fundo: c.fundo, borda: c.borda, indicador: c.indicador?.fundo };
    for (const [k, v] of Object.entries(quer)) if (tem[k] !== v) falhas.push(`${chave}: ${k} ${tem[k]}, esperado ${v}`);
  }
  const semMedida = Object.keys(cores).filter((k) => !vistos.has(k));
  if (todosOsComponentes && semMedida.length) falhas.push(`sem componente para conferir: ${semMedida.join(', ')}`);
  return falhas;
}

/** Assinatura das cores que os componentes pintam (para ver se o tema mudou todos eles). */
export const assinatura = (m) => JSON.stringify(m.componentes.map((c) => [c.fundo, c.borda, c.indicador?.fundo]));

function lerArgs(argv) {
  const opts = { motor: 'todos', capturas: null };
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i].replace(/^--/, '');
    if (!(k in opts) || argv[i + 1] === undefined) throw new Error('uso: temas-fluent.mjs [--motor chrome|webkit|todos] [--capturas pasta]');
    opts[k] = argv[i + 1];
  }
  if (!['chrome', 'webkit', 'todos'].includes(opts.motor)) throw new Error(`motor desconhecido: ${opts.motor}`);
  if (opts.capturas) mkdirSync(resolve(opts.capturas), { recursive: true });
  return opts;
}

// O Lite fica por último na troca do <html>, para as prévias aninhadas
// (depois) rodarem dentro dele.
const ORDEM = ['suave', 'light', 'dark', 'full', 'lite'];
const ANINHADOS = ['suave', 'light', 'dark'];

function rodar(motor, capturas) {
  const passos = [];
  for (const tema of ORDEM) {
    passos.push('--eval', `__ttFluent(${JSON.stringify(tema)})`);
    if (capturas && tema !== 'full') passos.push('--shot', join(capturas, `${motor}-${tema}.png`));
  }
  for (const tema of ANINHADOS) passos.push('--eval', `__ttFluentAninhado(${JSON.stringify(tema)})`);
  const script = join(AQUI, motor === 'webkit' ? 'webkit-shot.mjs' : 'shot.mjs');
  const args = [script, '--size', '1000x700', '--path', '/?plataforma=linux#/dev', ...passos];
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
        .filter((l) => /^__tt\w+\(/.test(l))
        .map((l) => JSON.parse(l.slice(l.indexOf(' => ') + 4)));
      res({ codigo, valores, erros: erros.split('\n').filter((l) => l && !/^\[console\.(log|info|debug)\]/.test(l)) });
    });
  });
}

async function main() {
  const opts = lerArgs(process.argv.slice(2));
  const motores = opts.motor === 'todos' ? ['chrome', 'webkit'] : [opts.motor];
  const nomes = { chrome: 'Chrome headless', webkit: 'WebKitGTK fora da tela' };
  let falhou = false;
  const linha = (ok, texto) => {
    if (!ok) falhou = true;
    console.log(`${ok ? 'ok   ' : 'FALHA'} ${texto}`);
  };
  for (const motor of motores) {
    const r = await rodar(motor, opts.capturas && resolve(opts.capturas));
    const esperadas = ORDEM.length + ANINHADOS.length;
    console.log(`\n${nomes[motor]}: ${r.valores.length} medidas`);
    if (r.codigo !== 0 || r.valores.length !== esperadas) {
      falhou = true;
      console.log(`FALHA: o ${motor} saiu com ${r.codigo} e ${r.valores.length} de ${esperadas} medidas`);
      for (const l of r.erros) console.log(`  ${l}`);
      continue;
    }
    for (const l of r.erros) console.log(`  aviso do ${motor}: ${l}`);
    const porTema = {};
    ORDEM.forEach((tema, i) => {
      const m = r.valores[i];
      porTema[tema] = m;
      const f = m.tema === tema ? conferirTema(m, tema) : [`data-theme ${m.tema}`];
      const sw = m.componentes.find((c) => c.tag === 'fluent-switch' && c.marcado);
      linha(
        !f.length,
        `${tema}: ${Object.keys(m.tokens).length} tokens (${Object.keys(ponte).length} da ponte); switch ligado ${sw?.fundo} com a bolinha ${sw?.indicador?.fundo}` +
          (f.length ? `\n        ${f.join('\n        ')}` : ''),
      );
    });
    const normais = ['lite', 'suave', 'light', 'dark'].map((t) => assinatura(porTema[t]));
    linha(new Set(normais).size === 4, 'os quatro temas normais pintam os componentes de quatro jeitos diferentes');
    linha(assinatura(porTema.full) === assinatura(porTema.lite), 'o full pinta os componentes como o lite');
    ANINHADOS.forEach((tema, i) => {
      const m = r.valores[ORDEM.length + i];
      const f = m.temaDoHtml === 'lite' ? conferirTema(m, tema, { todosOsComponentes: false }) : [`<html> em ${m.temaDoHtml}`];
      if (!m.componentes.length) f.push('o switch do div não foi medido');
      const sw = m.componentes[0];
      linha(!f.length, `aninhado: <div data-theme="${tema}"> no <html> do Lite; switch ligado ${sw?.fundo} com a bolinha ${sw?.indicador?.fundo}` + (f.length ? `\n        ${f.join('\n        ')}` : ''));
    });
  }
  console.log(falhou ? '\nFALHOU' : '\nTudo ok.');
  process.exitCode = falhou ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err.message ?? err);
    process.exit(1);
  });
}
