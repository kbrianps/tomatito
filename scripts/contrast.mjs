#!/usr/bin/env node
// Conferência de contraste (PLANO.md, 4.4; marco M06b).
//
// Lê os blocos do src/styles/tokens.css (e do bridge.css, que vem logo depois
// na ordem da 4.2 e define o --tt-ring-progress), aplica a cascata num modelo
// pequeno do DOM, resolve os var(), compõe os rgba sobre o cartão (ou sobre o
// fundo, na navegação) e calcula a razão de contraste da WCAG 2.2 para cada par
// da tabela 4.4, nos quatro temas normais e nos três estados do tomate. Desde o
// M22, monta também o fluent-tokens.gen.css em memória (primeiro, como no
// <head>) e confere o que os componentes Fluent pintam no hover, no
// pressionado e no selecionado (LINHAS_FLUENT), contra o mínimo.
//
//   node scripts/contrast.mjs [--sem-referencia]
//
// Sai com código 0 quando todo par fica no mínimo ou acima e todo valor bate,
// com duas casas, com a tabela do plano (o campo `ref` de cada linha, abaixo).
// Sai com 1 se algum par fica abaixo do mínimo ou difere da tabela, ou se o CSS
// tem algo que o script não sabe ler. Com --sem-referencia, só o mínimo conta:
// serve para medir uma mudança de token antes de atualizar a tabela.
//
// A composição arredonda cada camada para 8 bits por canal, como a tela, e no
// empate exato vai para o par, como o round() do Python no pal/lib.py que gerou
// a tabela. A luminância usa o limiar 0,04045 do sRGB (o mesmo do pal/lib.py).
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { gerarCss } from './build-theme-css.mjs';

// ---------------------------------------------------------------------------
// 1. CSS: regras e declarações
// ---------------------------------------------------------------------------

const semComentarios = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Divide `texto` em `sep` só no nível zero de (), [] e aspas. */
function dividirNoTopo(texto, sep) {
  const partes = [];
  let profundidade = 0;
  let aspas = null;
  let inicio = 0;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === aspas) aspas = null;
    } else if (c === '"' || c === "'") aspas = c;
    else if (c === '(' || c === '[') profundidade++;
    else if (c === ')' || c === ']') profundidade--;
    else if (c === sep && profundidade === 0) {
      partes.push(texto.slice(inicio, i));
      inicio = i + 1;
    }
  }
  partes.push(texto.slice(inicio));
  return partes.map((p) => p.trim()).filter(Boolean);
}

/**
 * Regras de estilo de nível de topo, na ordem do arquivo. Blocos @media ficam
 * de fora (forced-colors, prefers-contrast e reduced-motion não entram na
 * tabela 4.4), mas são pulados com as chaves balanceadas.
 */
export function lerRegras(css, origem = 'css') {
  const texto = semComentarios(css);
  const regras = [];
  let i = 0;
  while (i < texto.length) {
    const abre = texto.indexOf('{', i);
    if (abre === -1) {
      if (texto.slice(i).trim()) throw new Error(`${origem}: texto solto no fim: "${texto.slice(i).trim()}"`);
      break;
    }
    const preludio = texto.slice(i, abre).trim();
    let profundidade = 1;
    let fecha = abre + 1;
    for (; fecha < texto.length && profundidade > 0; fecha++) {
      if (texto[fecha] === '{') profundidade++;
      else if (texto[fecha] === '}') profundidade--;
    }
    if (profundidade !== 0) throw new Error(`${origem}: chave sem par depois de "${preludio}"`);
    const corpo = texto.slice(abre + 1, fecha - 1);
    i = fecha;
    if (preludio.startsWith('@')) {
      if (!preludio.startsWith('@media')) throw new Error(`${origem}: regra ${preludio.split(/\s/)[0]} não suportada`);
      continue;
    }
    const declaracoes = new Map();
    for (const decl of dividirNoTopo(corpo, ';')) {
      const doisPontos = decl.indexOf(':');
      if (doisPontos === -1) throw new Error(`${origem}: declaração sem ":" em "${preludio}": "${decl}"`);
      const nome = decl.slice(0, doisPontos).trim();
      const valor = decl.slice(doisPontos + 1).trim();
      if (/!important/i.test(valor)) throw new Error(`${origem}: !important não suportado (${nome})`);
      if (nome.startsWith('--')) declaracoes.set(nome, valor);
    }
    regras.push({ origem, texto: preludio, seletores: dividirNoTopo(preludio, ',').map(lerSeletor), declaracoes });
  }
  return regras;
}

// ---------------------------------------------------------------------------
// 2. Seletores: o necessário para o tokens.css, com especificidade
// ---------------------------------------------------------------------------

/** Seletor complexo → lista de compostos, ligados só pelo combinador descendente. */
export function lerSeletor(texto) {
  const compostos = [];
  let atual = '';
  let profundidade = 0;
  for (const c of `${texto} `) {
    if (c === '(' || c === '[') profundidade++;
    if (c === ')' || c === ']') profundidade--;
    if (/\s/.test(c) && profundidade === 0) {
      if (atual) compostos.push(lerComposto(atual, texto));
      atual = '';
    } else atual += c;
  }
  if (compostos.length === 0) throw new Error(`seletor vazio: "${texto}"`);
  return compostos;
}

function lerComposto(texto, completo) {
  const simples = [];
  const padrao = /\*|[a-z][a-z0-9-]*|\.([\w-]+)|\[([\w-]+)(?:=(?:"([^"]*)"|'([^']*)'|([\w-]+)))?\]|:root|:(is|where)\(/giy;
  let i = 0;
  while (i < texto.length) {
    padrao.lastIndex = i;
    const m = padrao.exec(texto);
    if (!m) throw new Error(`seletor não suportado: "${completo}" (em "${texto.slice(i)}")`);
    const [inteiro, classe, atributo, v1, v2, v3, funcao] = m;
    if (funcao) {
      let profundidade = 1;
      let j = padrao.lastIndex;
      for (; j < texto.length && profundidade > 0; j++) {
        if (texto[j] === '(') profundidade++;
        else if (texto[j] === ')') profundidade--;
      }
      const lista = dividirNoTopo(texto.slice(padrao.lastIndex, j - 1), ',').map(lerSeletor);
      simples.push({ tipo: funcao.toLowerCase(), lista });
      i = j;
      continue;
    }
    if (inteiro === '*') simples.push({ tipo: 'universal' });
    else if (inteiro === ':root') simples.push({ tipo: 'root' });
    else if (classe !== undefined) simples.push({ tipo: 'classe', nome: classe });
    else if (atributo !== undefined) simples.push({ tipo: 'atributo', nome: atributo, valor: v1 ?? v2 ?? v3 });
    else simples.push({ tipo: 'tag', nome: inteiro.toLowerCase() });
    i = padrao.lastIndex;
  }
  return simples;
}

const somar = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const maior = (a, b) => (a[0] - b[0] || a[1] - b[1] || a[2] - b[2]) >= 0;

export function especificidade(compostos) {
  let total = [0, 0, 0];
  for (const composto of compostos) {
    for (const s of composto) {
      if (s.tipo === 'classe' || s.tipo === 'atributo' || s.tipo === 'root') total = somar(total, [0, 1, 0]);
      else if (s.tipo === 'tag') total = somar(total, [0, 0, 1]);
      else if (s.tipo === 'is') {
        total = somar(total, s.lista.map(especificidade).reduce((a, b) => (maior(a, b) ? a : b)));
      }
    }
  }
  return total;
}

/** O elemento `cadeia[i]` casa com o seletor? `cadeia` vai da raiz ao elemento. */
export function casa(compostos, cadeia, i = cadeia.length - 1) {
  if (!casaComposto(compostos.at(-1), cadeia, i)) return false;
  if (compostos.length === 1) return true;
  const resto = compostos.slice(0, -1);
  for (let j = i - 1; j >= 0; j--) if (casa(resto, cadeia, j)) return true;
  return false;
}

function casaComposto(composto, cadeia, i) {
  const el = cadeia[i];
  return composto.every((s) => {
    switch (s.tipo) {
      case 'universal':
        return true;
      case 'root':
        return i === 0;
      case 'tag':
        return el.tag === s.nome;
      case 'classe':
        return (el.classes ?? []).includes(s.nome);
      case 'atributo':
        return s.nome in (el.atributos ?? {}) && (s.valor === undefined || el.atributos[s.nome] === s.valor);
      default: // is, where
        return s.lista.some((sel) => casa(sel, cadeia, i));
    }
  });
}

// ---------------------------------------------------------------------------
// 3. Cascata, herança e var()
// ---------------------------------------------------------------------------

/**
 * Propriedades personalizadas computadas no último elemento de `cadeia`.
 * Cada elemento é { tag, atributos, classes }. Em cada um, vence a declaração
 * de maior especificidade e, no empate, a que vem depois; o que não é declarado
 * no elemento é herdado, já resolvido, do pai (é assim que as custom properties
 * herdam). Os var() se resolvem no elemento em que a propriedade foi declarada.
 */
export function computar(regras, cadeia) {
  let herdado = new Map();
  for (let i = 0; i < cadeia.length; i++) {
    const vencedor = new Map(); // nome → { valor, espec }
    for (const regra of regras) {
      const casados = regra.seletores.filter((sel) => casa(sel, cadeia.slice(0, i + 1)));
      if (casados.length === 0) continue;
      const espec = casados.map(especificidade).reduce((a, b) => (maior(a, b) ? a : b));
      for (const [nome, valor] of regra.declaracoes) {
        const atual = vencedor.get(nome);
        if (!atual || maior(espec, atual.espec)) vencedor.set(nome, { valor, espec }); // empate: a de depois
      }
    }
    const proprio = new Map([...vencedor].map(([nome, { valor }]) => [nome, valor]));
    const resolvidos = new Map();
    const resolvendo = new Set();
    const resolver = (nome) => {
      if (!proprio.has(nome)) return herdado.get(nome);
      if (resolvidos.has(nome)) return resolvidos.get(nome);
      if (resolvendo.has(nome)) throw new Error(`ciclo de var() em ${nome} (${[...resolvendo].join(' → ')})`);
      resolvendo.add(nome);
      const valor = substituirVars(proprio.get(nome), resolver);
      resolvendo.delete(nome);
      resolvidos.set(nome, valor);
      return valor;
    };
    for (const nome of proprio.keys()) resolver(nome);
    // Um var() sem valor nem alternativa invalida a propriedade no elemento
    // (o "guaranteed-invalid" do CSS): ela some, e os filhos herdam a ausência.
    const computado = new Map(herdado);
    for (const [nome, valor] of resolvidos) {
      if (valor === undefined) computado.delete(nome);
      else computado.set(nome, valor);
    }
    herdado = computado;
  }
  return herdado;
}

/** Troca cada var() pelo valor; devolve undefined se algum não tiver valor nem alternativa. */
function substituirVars(valor, resolver) {
  let saida = '';
  let i = 0;
  while (i < valor.length) {
    const inicio = valor.indexOf('var(', i);
    if (inicio === -1) {
      saida += valor.slice(i);
      break;
    }
    saida += valor.slice(i, inicio);
    let profundidade = 1;
    let j = inicio + 4;
    for (; j < valor.length && profundidade > 0; j++) {
      if (valor[j] === '(') profundidade++;
      else if (valor[j] === ')') profundidade--;
    }
    const [nome, ...resto] = dividirNoTopo(valor.slice(inicio + 4, j - 1), ',');
    let resolvido = resolver(nome);
    if (resolvido === undefined) {
      if (resto.length === 0) return undefined;
      resolvido = substituirVars(resto.join(','), resolver);
      if (resolvido === undefined) return undefined;
    }
    saida += resolvido;
    i = j;
  }
  return saida.trim();
}

// ---------------------------------------------------------------------------
// 4. Cores, composição e contraste (WCAG 2.2)
// ---------------------------------------------------------------------------

const NOMEADAS = { transparent: [0, 0, 0, 0], white: [255, 255, 255, 1], black: [0, 0, 0, 1] };

/** "#RGB", "#RRGGBB", "#RRGGBBAA", "rgb(r g b / a)", "rgba(r,g,b,a)" → [r, g, b, a]. */
export function lerCor(texto) {
  const t = texto.trim().toLowerCase();
  if (t in NOMEADAS) return [...NOMEADAS[t]];
  const hexa = t.match(/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/);
  if (hexa) {
    let h = hexa[1];
    if (h.length <= 4) h = [...h].map((c) => c + c).join('');
    const n = (k) => parseInt(h.slice(k, k + 2), 16);
    return [n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1];
  }
  const fn = t.match(/^rgba?\((.*)\)$/);
  if (fn) {
    const partes = fn[1].split(/\s*[,/]\s*|\s+/).filter(Boolean);
    if (partes.length !== 3 && partes.length !== 4) throw new Error(`cor inválida: "${texto}"`);
    const canal = (p) => (p.endsWith('%') ? (parseFloat(p) * 255) / 100 : parseFloat(p));
    const alfa = partes[3] === undefined ? 1 : partes[3].endsWith('%') ? parseFloat(partes[3]) / 100 : parseFloat(partes[3]);
    const cor = [...partes.slice(0, 3).map(canal), alfa];
    if (cor.some(Number.isNaN)) throw new Error(`cor inválida: "${texto}"`);
    return cor;
  }
  throw new Error(`cor não suportada: "${texto}"`);
}

/**
 * Arredonda como o round() do Python: o mais próximo e, no empate exato, o par.
 * É a regra do pal/lib.py, que gerou a tabela 4.4. O Math.round do JS sobe no
 * empate: o vermelho do hover do Suave sobre o cartão (250,5) viraria 251, e o
 * par "Texto 2 / cartão + hover" do Suave daria 6,50 em vez de 6,48.
 */
export function arredondarPar(x) {
  const piso = Math.floor(x);
  const resto = x - piso;
  if (resto === 0.5) return piso % 2 === 0 ? piso : piso + 1;
  return resto < 0.5 ? piso : piso + 1;
}

/**
 * `frente` sobre `fundo` (opaco), arredondado a 8 bits por canal. A conta é a
 * mesma do over() do pal/lib.py, na mesma ordem, em [0, 1]: dá os mesmos doubles.
 * (Em 0–255, o verde do branco a 5% sobre #AF4135 dá 74,5 exatos, e não
 * 74,4999…; o Lite pressionado cairia para 5,01, e não 5,04.)
 */
export function sobre(frente, fundo) {
  if (fundo[3] !== 1) throw new Error(`fundo não opaco: ${hex(fundo)}`);
  const a = frente[3];
  return [0, 1, 2].map((k) => arredondarPar((a * (frente[k] / 255) + (1 - a) * (fundo[k] / 255)) * 255)).concat(1);
}

/** Camadas de baixo para cima; a primeira precisa ser opaca. */
export function empilhar(camadas) {
  const [base, ...resto] = camadas;
  if (base[3] !== 1) throw new Error(`a camada de baixo não é opaca: ${hex(base)}`);
  return resto.reduce((fundo, camada) => sobre(camada, fundo), base);
}

const linear = (c) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
export const luminancia = ([r, g, b]) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);

export function contraste(a, b) {
  const [claro, escuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (claro + 0.05) / (escuro + 0.05);
}

export const hex = ([r, g, b, a = 1]) =>
  '#' + [r, g, b, ...(a < 1 ? [a * 255] : [])].map((c) => Math.round(c).toString(16).padStart(2, '0').toUpperCase()).join('');

// ---------------------------------------------------------------------------
// 5. A tabela 4.4
// ---------------------------------------------------------------------------

export const TEMAS = [
  ['lite', 'Lite'],
  ['suave', 'Suave'],
  ['light', 'Claro'],
  ['dark', 'Escuro'],
];

// frente: token do texto (ou do traço); fundos: uma ou mais pilhas de camadas,
// de baixo para cima (vários valores na mesma célula, separados por " · ").
// efetivo: o token que a interface usa de fato quando o de `frente` não alcança
// o mínimo (o --tt-fg-2-on-ctl do Lite); o mínimo vale para ele.
// ref: valores da tabela 4.4, na ordem das colunas de TEMAS; nas linhas com
// efetivo, [frente, efetivo] quando os dois diferem.
export const LINHAS = [
  { par: 'Texto 1 / fundo', frente: '--tt-fg-1', fundos: [['--tt-bg-app']], min: 4.5,
    ref: [[6.40], [15.67], [15.68], [16.29]] },
  { par: 'Texto 1 / cartão', frente: '--tt-fg-1', fundos: [['--tt-bg-card']], min: 4.5,
    ref: [[5.51], [17.58], [16.82], [14.16]] },
  { par: 'Texto 2 / fundo', frente: '--tt-fg-2', fundos: [['--tt-bg-app']], min: 4.5,
    ref: [[5.51], [6.25], [6.03], [10.15]] },
  { par: 'Texto 2 / cartão', frente: '--tt-fg-2', fundos: [['--tt-bg-card']], min: 4.5,
    ref: [[4.75], [7.01], [6.46], [8.82]] },
  { par: 'Texto 2 / cartão + hover', frente: '--tt-fg-2', efetivo: '--tt-fg-2-on-ctl',
    fundos: [['--tt-bg-card', '--tt-subtle-hover']], min: 4.5,
    ref: [[4.25, 4.94], [6.48], [5.97], [7.30]] },
  { par: 'Texto 2 / cartão + input', frente: '--tt-fg-2', efetivo: '--tt-fg-2-on-ctl',
    fundos: [['--tt-bg-card', '--tt-input-bg']], min: 4.5,
    ref: [[4.10, 4.77], [7.26], [6.63], [7.30]] },
  { par: 'Texto 2 / cartão + selecionado', frente: '--tt-fg-2', efetivo: '--tt-fg-2-on-ctl',
    fundos: [['--tt-bg-card', '--tt-subtle-selected']], min: 4.5,
    ref: [[3.94, 4.57], [6.19], [5.97], [7.30]] },
  { par: 'Texto 2 / fundo + selecionado (navegação)', frente: '--tt-fg-2',
    fundos: [['--tt-bg-app', '--tt-subtle-selected']], min: 4.5,
    ref: [[4.53], [5.55], [5.56], [8.58]] },
  { par: 'Texto 1 / controle (repouso · hover · pressionado)', frente: '--tt-fg-1',
    fundos: [['--tt-bg-card', '--tt-ctl'], ['--tt-bg-card', '--tt-ctl-hover'], ['--tt-bg-card', '--tt-ctl-press']], min: 4.5,
    // Suave, pressionado: 16,83 na tabela do plano (o hover repetido); 17,39 com o
    // --tt-ctl-press acertado a olho no M13 (docs/decisoes.md, M13).
    ref: [[4.77, 4.57, 5.04], [18.19, 16.83, 17.39], [17.26, 16.67, 16.67], [11.73, 11.03, 12.82]] },
  { par: 'Texto sobre accent / accent', frente: '--tt-fg-on-accent', fundos: [['--tt-accent']], min: 4.5,
    ref: [[7.43], [5.51], [5.51], [5.96]] },
  { par: 'Texto sobre accent / hover', frente: '--tt-fg-on-accent', fundos: [['--tt-accent-hover']], min: 4.5,
    ref: [[6.81], [6.98], [6.98], [7.35]] },
  { par: 'Texto sobre accent / pressed', frente: '--tt-fg-on-accent', fundos: [['--tt-accent-pressed']], min: 4.5,
    ref: [[5.96], [8.74], [8.74], [4.78]] },
  { par: 'Accent como texto / fundo', frente: '--tt-accent-fg', fundos: [['--tt-bg-app']], min: 4.5,
    ref: [[6.21], [6.01], [4.97], [5.70]] },
  { par: 'Accent como texto / cartão', frente: '--tt-accent-fg', fundos: [['--tt-bg-card']], min: 4.5,
    ref: [[5.35], [6.74], [5.33], [4.96]] },
  { par: 'Preenchimento do accent / cartão', frente: '--tt-accent', fundos: [['--tt-bg-card']], min: 3,
    minTexto: '3 (não é texto)', ref: [[5.35], [5.33], [5.33], [4.02]] },
  { par: 'Anel / trilho', frente: '--tt-ring-progress', fundos: [['--tt-ring-track']], min: 3,
    ref: [[3.95], [5.30], [4.18], [3.80]] },
  { par: 'Traço de controle / cartão', frente: '--tt-stroke-control', fundos: [['--tt-bg-card']], min: 3,
    minTexto: '3 (critério 1.4.11)', ref: [[3.20], [4.45], [5.98], [6.31]] },
  { par: 'Borda / cartão', frente: '--tt-border', fundos: [['--tt-bg-card']], min: null,
    minTexto: 'decorativa, como no WinUI', ref: [[1.40], [1.30], [1.14], [1.24]] },
  { par: 'Erro (`--tt-critical`) / cartão', frente: '--tt-critical', fundos: [['--tt-bg-card']], min: 4.5,
    ref: [[5.51], [5.47], [5.47], [6.97]] },
];

// Camada de conteúdo (M10): as telas passaram a ficar sobre o --tt-bg-surface,
// que não tem linha na tabela 4.4. Os pares de texto sobre a camada são
// conferidos só contra o mínimo (sem `ref`), numa tabela à parte. A borda da
// camada sobre o fundo é decorativa, como a do cartão.
export const LINHAS_CAMADA = [
  { par: 'Texto 1 / camada', frente: '--tt-fg-1', fundos: [['--tt-bg-surface']], min: 4.5 },
  { par: 'Texto 2 / camada', frente: '--tt-fg-2', fundos: [['--tt-bg-surface']], min: 4.5 },
  { par: 'Accent como texto / camada', frente: '--tt-accent-fg', fundos: [['--tt-bg-surface']], min: 4.5 },
  { par: 'Borda da camada / fundo', frente: '--tt-border', fundos: [['--tt-bg-app']], min: null,
    minTexto: 'decorativa, como no WinUI' },
];

// Desabilitados (M13): a WCAG 2.2 isenta controles desabilitados (1.4.3 e
// 1.4.11), então não há mínimo; a tabela registra os valores que o M13 acertou
// a olho no Lite e no Suave, ao lado dos do Claro e do Escuro, que são os do
// WinUI (TextFillColorDisabled, AccentFillColorDisabled). O texto desabilitado
// sobre o controle ficou na faixa do WinUI (2,5 a 3,0); no destaque
// desabilitado, o texto é o mesmo --tt-fg-disabled.
export const LINHAS_DESABILITADOS = [
  { par: 'Texto desabilitado / controle', frente: '--tt-fg-disabled', fundos: [['--tt-bg-card', '--tt-ctl']], min: null,
    minTexto: 'isento (1.4.3)' },
  { par: 'Texto desabilitado / cartão', frente: '--tt-fg-disabled', fundos: [['--tt-bg-card']], min: null,
    minTexto: 'isento (1.4.3)' },
  { par: 'Texto desabilitado / destaque desabilitado', frente: '--tt-fg-disabled',
    fundos: [['--tt-bg-card', '--tt-accent-disabled']], min: null, minTexto: 'isento (1.4.3)' },
  { par: 'Destaque desabilitado / cartão', frente: '--tt-accent-disabled', fundos: [['--tt-bg-card']], min: null,
    minTexto: 'isento (1.4.11)' },
];

// Estados dos controles Fluent (M22): o hover, o pressionado e o selecionado
// que os componentes pintam com os tokens do fluent-tokens.gen.css (tingidos no
// Lite e no Suave, de fábrica no Claro e no Escuro), com o texto que o próprio
// componente usa em cada estado (pela ponte, onde ela cobre). Fora da tabela
// 4.4: só o mínimo conta. Os fundos são opacos no gerado.
export const LINHAS_FLUENT = [
  { par: 'Texto de item e opção / hover', frente: '--colorNeutralForeground2Hover',
    fundos: [['--colorNeutralBackground1Hover']], min: 4.5 },
  // pressionado: a opção usa o Background1Pressed, e o item de menu, o Background1Selected
  { par: 'Texto pressionado / opção · item de menu', frente: '--colorNeutralForeground2Pressed',
    fundos: [['--colorNeutralBackground1Pressed'], ['--colorNeutralBackground1Selected']], min: 4.5 },
  { par: 'Texto 1 / fundo sutil (hover · pressionado · selecionado)', frente: '--colorNeutralForeground1',
    fundos: [['--colorSubtleBackgroundHover'], ['--colorSubtleBackgroundPressed'], ['--colorSubtleBackgroundSelected']],
    min: 4.5 },
  { par: 'Traço de controle no hover / cartão', frente: '--colorNeutralStrokeAccessibleHover',
    fundos: [['--tt-bg-card']], min: 3, minTexto: '3 (critério 1.4.11)' },
  { par: 'Traço de controle pressionado / cartão', frente: '--colorNeutralStrokeAccessiblePressed',
    fundos: [['--tt-bg-card']], min: 3, minTexto: '3 (critério 1.4.11)' },
  { par: 'Bolinha do switch desligado no hover / cartão', frente: '--colorNeutralForeground3Hover',
    fundos: [['--tt-bg-card']], min: 3, minTexto: '3 (critério 1.4.11)' },
  { par: 'Bolinha e glifo marcados / accent (repouso · hover · pressionado)', frente: '--colorNeutralForegroundInverted',
    fundos: [['--tt-accent'], ['--tt-accent-hover'], ['--tt-accent-pressed']], min: 3, minTexto: '3 (critério 1.4.11)' },
  { par: 'Traço da lista suspensa / cartão', frente: '--colorNeutralStroke1',
    fundos: [['--tt-bg-card']], min: null, minTexto: 'decorativo (o traço de baixo é o de controle)' },
];

// Tomate (Full), medido sobre o corpo, nos três estados da .stage.
export const ESTADOS = [
  ['focus', 'Foco'],
  ['break', 'Intervalo'],
  ['paused', 'Pausado'],
];

// ref: na ordem de ESTADOS. O plano dá o realce (o --tt-tomato-body-hi, a parte
// mais clara do corpo) só no Foco; nos outros estados ele é calculado e
// conferido contra o mínimo, e aparece entre parênteses como no Foco.
export const COLUNAS_TOMATE = [
  { par: 'Branco / corpo (no realce)', frente: '--tt-tomato-ink',
    fundos: [['--tt-tomato-body-mid'], ['--tt-tomato-body-hi']], min: 4.5, refParcial: true,
    ref: [[5.42, 4.82], [8.23], [6.05]] },
  { par: 'Texto a 90% / corpo', frente: '--tt-tomato-ink-2', fundos: [['--tt-tomato-body-mid']], min: 4.5,
    ref: [[4.67], [6.96], [5.24]] },
  { par: 'Anel / corpo', frente: '--tt-tomato-ring', fundos: [['--tt-tomato-body-mid']], min: 3,
    ref: [[5.02], [6.05], [4.51]] },
  { par: 'Ícone do botão principal', frente: '--tt-tomato-btn-ink', fundos: [['--tt-tomato-btn-bg']], min: 3,
    ref: [[6.91], [10.05], [7.75]] },
];

// As duas medidas soltas da 4.4, abaixo da tabela do tomate.
export const NOTAS_TOMATE = [
  { par: 'Cálice / corpo', frente: '--tt-tomato-calyx', fundos: [['--tt-tomato-body-mid']], min: null,
    nota: 'decorativo, isento pelo 1.4.11', ref: [1.34], atributos: {} },
  { par: 'Corpo / fundo no plano B3', frente: '--tt-tomato-body-mid', fundos: [['--tt-bg-app']], min: null,
    nota: 'data-full-mode="opaque"', ref: [3.61], atributos: { 'data-full-mode': 'opaque' } },
];

const DUAS_CASAS = 0.005 + 1e-9; // valores iguais depois de arredondar para duas casas

function medir(props, { frente, efetivo, fundos }) {
  const cor = (nome) => {
    const valor = props.get(nome);
    if (valor === undefined) throw new Error(`${nome} não está definido`);
    return lerCor(valor);
  };
  const pilhas = fundos.map((camadas) => empilhar(camadas.map(cor)));
  const valores = (token) => pilhas.map((fundo) => contraste(sobre(cor(token), fundo), fundo));
  const direto = valores(frente);
  const usado = efetivo ? valores(efetivo) : direto;
  const mesmaCor = !efetivo || hex(cor(efetivo)) === hex(cor(frente));
  let rotulo = null;
  if (!mesmaCor) {
    const iguais = [...props].filter(([nome, v]) => /^--tt-fg-\d$/.test(nome) && hex(lerCor(v)) === hex(cor(efetivo)));
    rotulo = iguais.length ? iguais[0][0].slice(5) : efetivo.slice(5);
  }
  return { direto, usado, mesmaCor, rotulo };
}

const virgula = (n, casas = 2) => n.toFixed(casas).replace('.', ',');
const minimoTexto = (n) => String(n).replace('.', ','); // 4,5 e 3, como na tabela
const lista = (ns) => ns.map((n) => virgula(n)).join(' · ');

/**
 * Calcula tudo e devolve { linhas, tomate, notas, falhas, divergencias }.
 * `css` é a lista de { origem, texto } na ordem do <head>.
 */
export function conferir(css, { referencia = true } = {}) {
  const regras = css.flatMap(({ origem, texto }) => lerRegras(texto, origem));
  const falhas = [];
  const divergencias = [];

  const avaliar = (onde, linha, medida, ref) => {
    if (linha.min != null) {
      medida.usado.forEach((v, k) => {
        if (v + 1e-9 < linha.min) {
          falhas.push(`${onde}, ${linha.par}: ${virgula(v)} < ${minimoTexto(linha.min)}${medida.usado.length > 1 ? ` (valor ${k + 1})` : ''}`);
        }
      });
    }
    if (!referencia || !ref) return;
    const calculado = medida.mesmaCor ? medida.direto : [...medida.direto, ...medida.usado];
    // No realce do tomate, o plano só dá o primeiro valor fora do Foco.
    const comparaveis = linha.refParcial ? calculado.slice(0, ref.length) : calculado;
    const difere =
      comparaveis.length !== ref.length || comparaveis.some((v, k) => Math.abs(v - ref[k]) > DUAS_CASAS);
    if (difere) divergencias.push(`${onde}, ${linha.par}: calculado ${lista(comparaveis)}, tabela ${lista(ref)}`);
  };

  const porTema = TEMAS.map(([tema]) =>
    computar(regras, [{ tag: 'html', atributos: { 'data-theme': tema, 'data-platform': 'linux' } }]),
  );
  const tabelaPorTema = (lista_) =>
    lista_.map((linha) => {
      const celulas = TEMAS.map(([, nome], t) => {
        const medida = medir(porTema[t], linha);
        avaliar(nome, linha, medida, linha.ref?.[t]);
        if (medida.mesmaCor) return lista(medida.direto);
        return `${lista(medida.direto)}: usa ${medida.rotulo} (${lista(medida.usado)})`;
      });
      const minimo = linha.minTexto ?? minimoTexto(linha.min);
      return { par: linha.par, celulas, minimo };
    });
  const linhas = tabelaPorTema(LINHAS);
  const camada = tabelaPorTema(LINHAS_CAMADA);
  const desabilitados = tabelaPorTema(LINHAS_DESABILITADOS);
  const fluent = regras.some((r) => r.origem === ORIGEM_GERADO) ? tabelaPorTema(LINHAS_FLUENT) : [];

  const cadeiaTomate = (estado, extra = {}) => [
    { tag: 'html', atributos: { 'data-theme': 'full', 'data-platform': 'linux', ...extra } },
    { tag: 'body', atributos: {} },
    { tag: 'div', classes: ['stage'], atributos: { 'data-state': estado } },
  ];

  const tomate = ESTADOS.map(([estado, nome], e) => {
    const props = computar(regras, cadeiaTomate(estado));
    const celulas = COLUNAS_TOMATE.map((coluna) => {
      const medida = medir(props, coluna);
      avaliar(`Tomate, ${nome}`, coluna, medida, coluna.ref[e]);
      const [corpo, ...realce] = medida.direto;
      return realce.length ? `${virgula(corpo)} (${lista(realce)})` : virgula(corpo);
    });
    return { estado: nome, celulas };
  });

  const notas = NOTAS_TOMATE.map((nota) => {
    const props = computar(regras, cadeiaTomate('focus', nota.atributos));
    const medida = medir(props, nota);
    avaliar('Tomate', nota, medida, nota.ref);
    return { par: nota.par, valor: virgula(medida.direto[0]), nota: nota.nota };
  });

  return { linhas, camada, desabilitados, fluent, tomate, notas, falhas, divergencias };
}

// ---------------------------------------------------------------------------
// 6. Saída
// ---------------------------------------------------------------------------

export function formatar({ linhas, camada, desabilitados = [], fluent = [], tomate, notas }) {
  const tabela = (cabecalho, corpo) =>
    [cabecalho, cabecalho.map(() => '---'), ...corpo].map((l) => `| ${l.join(' | ')} |`).join('\n');
  return [
    'Contrastes (WCAG 2.2), calculados de src/styles/tokens.css e bridge.css (e dos tokens do Fluent gerados)',
    '',
    tabela(
      ['Par', ...TEMAS.map(([, nome]) => nome), 'Mínimo'],
      linhas.map((l) => [l.par, ...l.celulas, l.minimo]),
    ),
    '',
    'Camada de conteúdo (M10), fora da tabela 4.4: conferida só contra o mínimo.',
    '',
    tabela(
      ['Par', ...TEMAS.map(([, nome]) => nome), 'Mínimo'],
      camada.map((l) => [l.par, ...l.celulas, l.minimo]),
    ),
    '',
    'Desabilitados (M13), fora da tabela 4.4: só registro (a WCAG isenta controles desabilitados).',
    '',
    tabela(
      ['Par', ...TEMAS.map(([, nome]) => nome), 'Mínimo'],
      desabilitados.map((l) => [l.par, ...l.celulas, l.minimo]),
    ),
    '',
    ...(fluent.length
      ? [
          'Estados dos controles Fluent (M22), com os tokens gerados (tingidos no Lite e no Suave): conferidos só contra o mínimo.',
          '',
          tabela(
            ['Par', ...TEMAS.map(([, nome]) => nome), 'Mínimo'],
            fluent.map((l) => [l.par, ...l.celulas, l.minimo]),
          ),
          '',
        ]
      : []),
    'Tomate (Full), medido sobre o corpo:',
    '',
    tabela(['Estado', ...COLUNAS_TOMATE.map((c) => c.par)], tomate.map((t) => [t.estado, ...t.celulas])),
    '',
    ...notas.map((n) => `- ${n.par}: ${n.valor} (${n.nota}).`),
  ].join('\n');
}

const ARQUIVOS = ['src/styles/tokens.css', 'src/styles/bridge.css'];
// O fluent-tokens.gen.css fica fora do git (4.5): é gerado aqui, em memória, a
// partir do mesmo tokens.css, e entra primeiro, como no <head> (4.2).
export const ORIGEM_GERADO = 'src/styles/fluent-tokens.gen.css (gerado em memória)';

export function lerArquivos(raiz = new URL('..', import.meta.url)) {
  const arquivos = ARQUIVOS.map((origem) => ({ origem, texto: readFileSync(new URL(origem, raiz), 'utf8') }));
  return [{ origem: ORIGEM_GERADO, texto: gerarCss(arquivos[0].texto) }, ...arquivos];
}

function principal(argv) {
  const desconhecidos = argv.filter((a) => a !== '--sem-referencia');
  if (desconhecidos.length) {
    console.error(`opção desconhecida: ${desconhecidos.join(' ')}\nuso: node scripts/contrast.mjs [--sem-referencia]`);
    return 2;
  }
  const referencia = !argv.includes('--sem-referencia');
  let resultado;
  try {
    resultado = conferir(lerArquivos(), { referencia });
  } catch (erro) {
    console.error(`contrast.mjs: ${erro.message}`);
    return 1;
  }
  console.log(formatar(resultado));
  const { falhas, divergencias } = resultado;
  const pares =
    `${(LINHAS.length + LINHAS_CAMADA.length + LINHAS_FLUENT.length) * TEMAS.length + COLUNAS_TOMATE.length * ESTADOS.length + NOTAS_TOMATE.length} pares ` +
    `(${LINHAS.length} × ${TEMAS.length} temas, mais ${LINHAS_CAMADA.length} × ${TEMAS.length} da camada de conteúdo, ` +
    `${LINHAS_FLUENT.length} × ${TEMAS.length} dos estados dos controles Fluent, ` +
    `${COLUNAS_TOMATE.length} × ${ESTADOS.length} estados do tomate e ${NOTAS_TOMATE.length} medidas soltas)`;
  console.log('');
  if (falhas.length) console.error(`Abaixo do mínimo (${falhas.length}):\n${falhas.map((f) => `  - ${f}`).join('\n')}`);
  if (divergencias.length) {
    console.error(
      `Diferente da tabela 4.4 (${divergencias.length}):\n${divergencias.map((d) => `  - ${d}`).join('\n')}\n` +
        '  Se a mudança do token foi de propósito, atualize o `ref` da linha no script e a tabela 4.4 do plano.',
    );
  }
  if (falhas.length || divergencias.length) return 1;
  console.log(
    `${pares}: todos no mínimo ou acima` + (referencia ? ' e iguais à tabela 4.4 do plano.' : '; a tabela do plano não foi conferida.'),
  );
  console.log(`Mais ${LINHAS_DESABILITADOS.length * TEMAS.length} medidas dos desabilitados, só de registro.`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = principal(process.argv.slice(2));
}
