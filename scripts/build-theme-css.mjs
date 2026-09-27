#!/usr/bin/env node
// Tokens do Fluent gerados no build (PLANO.md, 4.5; marco M11).
//
// Gera o src/styles/fluent-tokens.gen.css: um bloco de custom properties do
// Fluent por grupo de temas, com seletores [data-theme="..."], a partir do
// createLightTheme e do createDarkTheme do @fluentui/tokens sobre a rampa
// --tt-tomato-* (lida do :root do tokens.css, que continua sendo a única fonte
// da rampa). Os componentes Fluent leem var(--color*) e afins, então trocar o
// data-theme do <html> troca todos eles, sem setTheme() em runtime.
//
//   node scripts/build-theme-css.mjs
//
// Roda sozinho no `npm run dev` e no `npm run build` (predev e prebuild do
// package.json), e as prévias (scripts/preview/servidor.mjs) e o teste
// aninhado (scripts/gnome-aninhado/rodar.sh) o chamam antes de subir o Vite. O
// arquivo gerado fica fora do git. Só é regravado quando o conteúdo muda,
// para não disparar o recarregamento do Vite à toa.
//
// Ordem no <head> (4.2): o gerado vem antes do tokens.css e do bridge.css. A
// ponte tem a mesma especificidade (0,1,0) e vem depois, então vence nos
// tokens que ela cobre; o resto (--borderRadiusCircular, --spacing*,
// --colorNeutralForegroundInverted...) vem daqui.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createDarkTheme, createLightTheme } from '@fluentui/tokens';

const RAIZ = new URL('..', import.meta.url);
export const SAIDA = 'src/styles/fluent-tokens.gen.css';
const PASSOS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160];

/** A rampa --tt-tomato-10…160 do primeiro bloco :root{} do tokens.css, como { 10: '#210201', … }. */
export function lerRampa(tokensCss) {
  const root = tokensCss.replace(/\/\*[\s\S]*?\*\//g, '').match(/:root\s*\{([^}]*)\}/);
  if (!root) throw new Error('tokens.css sem bloco :root{}');
  const rampa = {};
  for (const m of root[1].matchAll(/--tt-tomato-(\d+)\s*:\s*([^;]+);/g)) rampa[m[1]] = m[2].trim();
  const achados = Object.keys(rampa).map(Number);
  if (achados.join() !== PASSOS.join()) {
    throw new Error(`rampa --tt-tomato-* incompleta no tokens.css: achei ${achados.join(', ') || 'nada'}`);
  }
  for (const [passo, cor] of Object.entries(rampa)) {
    if (!/^#[0-9A-Fa-f]{6}$/.test(cor)) throw new Error(`--tt-tomato-${passo} não é #RRGGBB: ${cor}`);
  }
  return rampa;
}

// Qual tema do Fluent cada data-theme recebe. M11: Lite e Full usam o escuro,
// e o Suave, o claro, ainda sem tingir. No M22, o Lite e o Full passam a
// tintNeutrals(escuro), e o Suave, tintNeutrals(claro): basta trocar a função
// deles aqui. Temas com a mesma função saem num bloco só.
export const TEMAS = [
  ['light', 'claro'],
  ['suave', 'claro'],
  ['dark', 'escuro'],
  ['lite', 'escuro'],
  ['full', 'escuro'],
];

/** Os temas do Fluent para a rampa: { claro, escuro }, cada um { token: valor }. */
export function temasFluent(rampa) {
  return { claro: createLightTheme(rampa), escuro: createDarkTheme(rampa) };
}

const NOME = /^[a-zA-Z][a-zA-Z0-9]*$/;
// O mesmo filtro do setTheme() do Fluent: nada que feche a declaração ou a regra.
const VALOR_PROIBIDO = /(;|\{|\}|\/\*|\*\/|@import|url\s*\(|expression\s*\(|javascript:)/i;

function declaracoes(tema) {
  return Object.entries(tema).map(([nome, valor]) => {
    const texto = String(valor).trim();
    if (!NOME.test(nome)) throw new Error(`nome de token inválido: ${nome}`);
    if (!texto || VALOR_PROIBIDO.test(texto)) throw new Error(`valor inválido em ${nome}: ${texto}`);
    return `  --${nome}:${texto};`;
  });
}

/** O CSS inteiro, a partir do texto do tokens.css. */
export function gerarCss(tokensCss) {
  const temas = temasFluent(lerRampa(tokensCss));
  const { version: versao } = createRequire(import.meta.url)('@fluentui/tokens/package.json');
  const grupos = new Map();
  for (const [dataTheme, fonte] of TEMAS) {
    if (!grupos.has(fonte)) grupos.set(fonte, []);
    grupos.get(fonte).push(dataTheme);
  }
  const blocos = [...grupos].map(([fonte, dataThemes]) => {
    const seletor = dataThemes.map((t) => `[data-theme="${t}"]`).join(',');
    const funcao = fonte === 'claro' ? 'createLightTheme' : 'createDarkTheme';
    return `/* ${dataThemes.join(', ')}: ${funcao}(--tt-tomato-*) */\n${seletor}{\n${declaracoes(temas[fonte]).join('\n')}\n}\n`;
  });
  return (
    `/* Gerado por scripts/build-theme-css.mjs (PLANO.md, 4.5), com o @fluentui/tokens ${versao}\n` +
    '   e a rampa --tt-tomato-* do tokens.css. Não editar: fica fora do git e é refeito no\n' +
    '   predev e no prebuild. A ponte (bridge.css) vem depois e vence nos tokens que cobre. */\n\n' +
    blocos.join('\n')
  );
}

/** Gera e grava o arquivo; devolve { caminho, mudou, bytes }. */
export function escrever(raiz = RAIZ) {
  const css = gerarCss(readFileSync(new URL('src/styles/tokens.css', raiz), 'utf8'));
  const destino = new URL(SAIDA, raiz);
  let atual = null;
  try {
    atual = readFileSync(destino, 'utf8');
  } catch {
    // ainda não existe
  }
  if (atual !== css) writeFileSync(destino, css);
  return { caminho: SAIDA, mudou: atual !== css, bytes: Buffer.byteLength(css) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { caminho, mudou, bytes } = escrever();
    console.log(`build-theme-css: ${caminho} ${mudou ? 'gerado' : 'já estava em dia'} (${bytes} bytes)`);
  } catch (erro) {
    console.error(`build-theme-css: ${erro.message}`);
    process.exitCode = 1;
  }
}
