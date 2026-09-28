#!/usr/bin/env node
// Tokens do Fluent gerados no build (PLANO.md, 4.5; marco M11).
//
// Gera o src/styles/fluent-tokens.gen.css: um bloco de custom properties do
// Fluent por grupo de temas, com seletores [data-theme="..."], a partir do
// createLightTheme e do createDarkTheme do @fluentui/tokens sobre a rampa
// --tt-tomato-* (lida do :root do tokens.css, que continua sendo a única fonte
// da rampa). No M22, o Lite (e o Full) e o Suave passam aos neutros tingidos
// (tintNeutrals, abaixo). Os componentes Fluent leem var(--color*) e afins,
// então trocar o data-theme do <html> troca todos eles, sem setTheme() em
// runtime.
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
import { computar, empilhar, lerCor, lerRegras } from './contrast.mjs';
import { lerHex, oklabParaSrgb, paraHex, srgbParaOklab } from './oklch.mjs';

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

// Qual tema do Fluent cada data-theme recebe. M11: Lite e Full usavam o escuro,
// e o Suave, o claro, sem tingir. M22: o Lite e o Full recebem o
// tintNeutrals(escuro) com as cores do Lite, e o Suave, o tintNeutrals(claro)
// com as do Suave. Temas com a mesma fonte saem num bloco só.
export const TEMAS = [
  ['light', 'claro'],
  ['suave', 'suave'],
  ['dark', 'escuro'],
  ['lite', 'lite'],
  ['full', 'lite'],
];

// Tingimento (M22): de que tema do Fluent sai cada fonte tingida, e o
// data-theme do tokens.css de onde vêm as cores dela.
// `extras`: âncoras só daquele tema (ver ANCORAS).
export const TINGIDOS = {
  lite: { base: 'escuro', dataTheme: 'lite', extras: [['colorNeutralBackground1Hover', ['--tt-bg-card', '--tt-ctl-hover']]] },
  suave: { base: 'claro', dataTheme: 'suave', extras: [] },
};

// Âncoras do tingimento: o neutro do Fluent (lido no próprio tema de base) e o
// token do Tomatito em que ele cai. São os cinco que a ponte (4.3) já cobre com
// esses mesmos --tt-*: tingido, o gerado passa a concordar com a ponte neles, e
// os outros neutros (hover, pressionado, selecionado, traços, invertidos...)
// ficam no caminho entre eles. Uma pilha ([fundo, camada...]) é composta como
// no contrast.mjs. O Lite tem uma âncora a mais: o hover do Fluent cai no
// hover de controle do Lite (--tt-ctl-hover sobre o cartão, texto 1 a 4,57:1).
// Sem ela, o trecho do cartão ao texto 2 (do vermelho ao creme) é longo, e o
// hover (#3d3d3d) cairia em #be5e51, com o texto 1 a 4,08:1.
export const ANCORAS = [
  ['colorNeutralBackground3', '--tt-bg-app'],
  ['colorNeutralBackground2', '--tt-bg-surface'],
  ['colorNeutralBackground1', '--tt-bg-card'],
  ['colorNeutralForeground3', '--tt-fg-2'],
  ['colorNeutralForeground1', '--tt-fg-1'],
];

/**
 * As âncoras do tema tingido `fonte` com as cores do tokens.css, resolvidas
 * pela cascata do contrast.mjs: [[token do Fluent, '#rrggbb'], ...].
 */
export function ancorasDoTema(tokensCss, fonte) {
  const { dataTheme, extras } = TINGIDOS[fonte];
  const props = computar(lerRegras(tokensCss, 'tokens.css'), [{ tag: 'html', atributos: { 'data-theme': dataTheme } }]);
  const cor = (tt) => {
    const valor = props.get(tt);
    if (valor === undefined) throw new Error(`${tt} não está definido no tema ${dataTheme}`);
    return lerCor(valor);
  };
  return [...ANCORAS, ...extras].map(([fluent, tt]) => {
    const pilha = (Array.isArray(tt) ? tt : [tt]).map(cor);
    if (pilha[0][3] !== 1) throw new Error(`âncora ${fluent} do tema ${dataTheme}: a cor de baixo não é opaca`);
    return [fluent, paraHex(empilhar(pilha).slice(0, 3))];
  });
}

const RGB = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i;

/** Um valor de cor do Fluent → { rgb, alfa } ou null (transparent, gradientes e o resto). */
function lerCorFluent(valor) {
  const v = String(valor).trim();
  if (/^#[0-9a-f]{6}$/i.test(v)) return { rgb: lerHex(v), alfa: null };
  const m = RGB.exec(v);
  return m ? { rgb: [m[1], m[2], m[3]].map(Number), alfa: m[4] ?? null } : null;
}

/** O token é um neutro que o tingimento troca? Cinza puro (r = g = b), fora das sombras. */
export function ehNeutroTingivel(nome, valor) {
  if (!nome.startsWith('color') || /Shadow/.test(nome)) return false;
  const cor = lerCorFluent(valor);
  return !!cor && cor.rgb[0] === cor.rgb[1] && cor.rgb[1] === cor.rgb[2];
}

/**
 * tintNeutrals (PLANO 4.5): troca cada cinza do tema do Fluent por uma cor do
 * tema do Tomatito, em OKLab. O L do cinza (a única coisa que ele tem) é
 * posicionado entre as âncoras vizinhas, pelo L delas no tema de base, e o
 * resultado é a interpolação linear, no OKLab (L, a e b), entre as cores do
 * Tomatito dessas âncoras. Assim, no Lite, os escuros viram vermelhos (entre o
 * fundo e o cartão) e os claros, cremes (entre o texto 2 e o texto 1); no
 * Suave, os claros viram os rosados do fundo e do cartão, e os escuros, o
 * marrom avermelhado do texto. Fora das âncoras, o L segue a inclinação do
 * último trecho com o a e o b da âncora da ponta. O croma é reduzido se a cor
 * sair da gama do sRGB. O alfa dos rgba fica; transparent, sombras e cores não
 * neutras (a rampa --tt-tomato-*, os de status) não mudam.
 */
export function tintNeutrals(tema, ancoras) {
  const pontos = ancoras.map(([fluent, destino]) => {
    const cor = lerCorFluent(tema[fluent]);
    if (!cor || cor.alfa !== null || !ehNeutroTingivel(fluent, tema[fluent])) {
      throw new Error(`âncora ${fluent} não é um neutro opaco: ${tema[fluent]}`);
    }
    return { de: srgbParaOklab(cor.rgb)[0], para: srgbParaOklab(lerHex(destino)), nome: fluent };
  }).sort((p, q) => p.de - q.de);
  for (let i = 1; i < pontos.length; i++) {
    if (pontos[i].de - pontos[i - 1].de < 1e-4) throw new Error(`âncoras com o mesmo L: ${pontos[i - 1].nome} e ${pontos[i].nome}`);
  }
  const trecho = (L) => {
    let i = pontos.findIndex((p) => p.de >= L);
    if (i === -1) i = pontos.length - 1;
    return [pontos[Math.max(0, i - 1)], pontos[Math.max(1, i)]];
  };
  const tingir = (rgb) => {
    const L = srgbParaOklab(rgb)[0];
    const [p, q] = trecho(L);
    const t = (L - p.de) / (q.de - p.de);
    let lab;
    if (t < 0 || t > 1) {
      const ponta = t < 0 ? p : q;
      const inclinacao = (q.para[0] - p.para[0]) / (q.de - p.de);
      lab = [ponta.para[0] + (L - ponta.de) * inclinacao, ponta.para[1], ponta.para[2]];
    } else {
      lab = [0, 1, 2].map((k) => p.para[k] + t * (q.para[k] - p.para[k]));
    }
    return oklabParaSrgb(lab);
  };
  return Object.fromEntries(
    Object.entries(tema).map(([nome, valor]) => {
      if (!ehNeutroTingivel(nome, valor)) return [nome, valor];
      const { rgb, alfa } = lerCorFluent(valor);
      const novo = tingir(rgb);
      return [nome, alfa === null ? paraHex(novo) : `rgba(${novo.join(', ')}, ${alfa})`];
    }),
  );
}

/** Os temas do Fluent: { claro, escuro, lite, suave }, cada um { token: valor }. */
export function temasFluent(tokensCss) {
  const rampa = lerRampa(tokensCss);
  const base = { claro: createLightTheme(rampa), escuro: createDarkTheme(rampa) };
  const tingidos = Object.fromEntries(
    Object.entries(TINGIDOS).map(([fonte, { base: b }]) => [fonte, tintNeutrals(base[b], ancorasDoTema(tokensCss, fonte))]),
  );
  return { ...base, ...tingidos };
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
  const temas = temasFluent(tokensCss);
  const { version: versao } = createRequire(import.meta.url)('@fluentui/tokens/package.json');
  const grupos = new Map();
  for (const [dataTheme, fonte] of TEMAS) {
    if (!grupos.has(fonte)) grupos.set(fonte, []);
    grupos.get(fonte).push(dataTheme);
  }
  const blocos = [...grupos].map(([fonte, dataThemes]) => {
    const seletor = dataThemes.map((t) => `[data-theme="${t}"]`).join(',');
    const criar = (b) => (b === 'claro' ? 'createLightTheme' : 'createDarkTheme');
    const funcao = TINGIDOS[fonte]
      ? `tintNeutrals(${criar(TINGIDOS[fonte].base)}(--tt-tomato-*), cores do ${TINGIDOS[fonte].dataTheme})`
      : `${criar(fonte)}(--tt-tomato-*)`;
    return `/* ${dataThemes.join(', ')}: ${funcao} */\n${seletor}{\n${declaracoes(temas[fonte]).join('\n')}\n}\n`;
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
