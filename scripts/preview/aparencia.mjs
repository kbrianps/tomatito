#!/usr/bin/env node
// Conferência da Aparência (M24) no Chrome headless, com o mock do Tauri e o
// ponteiro e o teclado de verdade, sem abrir janela. Para cada tema de
// partida (lite, suave, light, dark e system, pelo ?pref da prévia):
//   1. em Configurações, mede cada prévia: o fundo, a camada, o cartão, o texto
//      e a ação principal de cada <span data-theme> têm de ser os tokens
//      daquele tema (--tt-bg-app, --tt-bg-surface, --tt-bg-card, --tt-fg-1 e
//      --tt-accent, calculados pela cascata do scripts/contrast.mjs a partir
//      do tokens.css), qualquer que seja o tema da página; no Sistema, a
//      metade esquerda é o Claro e a direita, o Escuro, cada uma com metade
//      da largura; e a opção marcada é a do tema de partida;
//   2. clica (mouse de verdade) em cada uma das outras opções, na ordem, e
//      confere depois de cada clique: data-theme-pref e data-theme do <html>,
//      o settings_set pedido ({ theme, resolvedTheme }), o tema nativo fixado
//      (setTheme: dark no Lite e no Escuro, light no Suave e no Claro; no
//      Sistema, null e depois o lido, no Linux) e só a opção clicada marcada;
//   3. volta com a seta para a esquerda (o foco fica no grupo depois do
//      clique) e confere que a seta também troca o tema.
// Com --capturas, salva a tela de cada tema de partida.
//
//   node scripts/preview/aparencia.mjs [--capturas pasta]
//
// O que o mock não tem (o settings.json de verdade, o reinício e o theme() do
// tao) fica com o roteiro scripts/gnome-aninhado/roteiros/aparencia.js.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { computar, hex, lerArquivos, lerCor, lerRegras } from '../contrast.mjs';

const AQUI = fileURLToPath(new URL('.', import.meta.url));
// M51: o Full entre o Escuro e o Sistema (src/lib/theme.js, ESCOLHAS).
const ESCOLHAS = ['lite', 'suave', 'light', 'dark', 'full', 'system'];
const NATIVO = { lite: 'dark', suave: 'light', light: 'light', dark: 'dark' };
// O que o mock responde no theme() com o tema do sistema limpo (tauri-mock.js).
const DO_SISTEMA = 'dark';

// Os tokens de cada tema pela cascata do contrast.mjs (o mesmo CSS da página).
const regras = lerArquivos().flatMap(({ origem, texto }) => lerRegras(texto, origem));
export function tokensDe(tema) {
  const p = computar(regras, [{ tag: 'html', atributos: { 'data-theme': tema, 'data-platform': 'linux' } }]);
  const cor = (n) => hex(lerCor(p.get(n)));
  if (tema === 'full') return { corpo: cor('--tt-tomato-body-mid'), calice: cor('--tt-tomato-calyx') };
  return { fundo: cor('--tt-bg-app'), camada: cor('--tt-bg-surface'), cartao: cor('--tt-bg-card'), texto: cor('--tt-fg-1'), acao: cor('--tt-accent') };
}

// Mede a tela no navegador. Vai como texto para o --eval.
const MEDIR = `window.__ttAparencia = () => {
  const h = document.documentElement;
  const cor = (el, prop = 'backgroundColor') => getComputedStyle(el)[prop];
  const caixa = (el) => { const r = el.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(Math.round); };
  const opcoes = [...document.querySelectorAll('.tt-tema')].map((op) => ({
    tema: op.dataset.tema,
    marcado: op.hasAttribute('data-marcado'),
    radio: op.querySelector('fluent-radio').checked,
    moldura: caixa(op.querySelector('.tt-previa-moldura')),
    previas: [...op.querySelectorAll('.tt-previa')].map((p) => {
      const pai = p.parentElement.classList.contains('tt-previa-metade') ? p.parentElement : p;
      if (p.classList.contains('tt-previa-full')) {
        return { tema: p.dataset.theme, visivel: caixa(pai), tomate: caixa(p.querySelector('svg')),
          corpo: cor(p.querySelector('.tt-previa-corpo'), 'fill'), calice: cor(p.querySelector('.tt-previa-calice'), 'fill') };
      }
      return {
        tema: p.dataset.theme,
        visivel: caixa(pai),
        fundo: cor(p),
        camada: cor(p.querySelector('.tt-previa-camada')),
        cartao: cor(p.querySelector('.tt-previa-cartao')),
        texto: cor(p.querySelector('.tt-previa-texto')),
        acao: cor(p.querySelector('.tt-previa-acao')),
      };
    }),
  }));
  const grupo = document.querySelector('.tt-temas');
  return {
    pref: h.dataset.themePref, tema: h.dataset.theme, valor: grupo.value,
    foco: document.activeElement?.getAttribute('value') ?? document.activeElement?.tagName,
    comandos: window.__TOMATITO_PREVIEW_COMANDOS__.splice(0),
    salvo: window.__TOMATITO_PREVIEW_CONFIGURACOES__.theme, opcoes,
  };
}`;

const rgbParaHex = (s) => hex(lerCor(s));

/** Confere a medida das prévias; devolve as falhas. */
export function conferirPrevias(m, marcada) {
  const falhas = [];
  for (const op of m.opcoes) {
    const esperadas = op.tema === 'system' ? ['light', 'dark'] : [op.tema];
    if (op.previas.map((p) => p.tema).join() !== esperadas.join()) falhas.push(`${op.tema}: prévias ${op.previas.map((p) => p.tema)}`);
    for (const p of op.previas) {
      const t = tokensDe(p.tema);
      if (p.tema === 'full') {
        // O tomate inteiro dentro da moldura, com as cores do tomate.
        const [x, y, w, hh] = p.tomate ?? [];
        const [mx, my, mw, mh] = op.moldura;
        if (!(w > 20 && x >= mx && y >= my && x + w <= mx + mw + 1 && y + hh <= my + mh + 1)) falhas.push(`full: tomate ${JSON.stringify(p.tomate)} fora da moldura ${JSON.stringify(op.moldura)}`);
      }
      for (const parte of p.tema === 'full' ? ['corpo', 'calice'] : ['fundo', 'camada', 'cartao', 'texto', 'acao']) {
        const visto = rgbParaHex(p[parte]);
        if (visto !== t[parte]) falhas.push(`${op.tema}, prévia ${p.tema}, ${parte}: ${visto}, esperado ${t[parte]}`);
      }
    }
    if (op.tema === 'system') {
      const [a, b] = op.previas.map((p) => p.visivel);
      const larg = op.moldura[2];
      if (!(a && b && Math.abs(a[2] - larg / 2) <= 1 && Math.abs(b[2] - larg / 2) <= 1 && a[0] < b[0])) {
        falhas.push(`sistema: metades ${JSON.stringify([a, b])} numa moldura de ${larg} px`);
      }
    }
    const deveria = op.tema === marcada;
    if (op.marcado !== deveria || op.radio !== deveria) falhas.push(`${op.tema}: marcado ${op.marcado}, rádio ${op.radio}, esperado ${deveria}`);
  }
  if (m.opcoes.length !== ESCOLHAS.length) falhas.push(`${m.opcoes.length} opções`);
  return falhas;
}

/**
 * Confere o efeito de escolher `escolha` a partir de uma medida feita depois.
 * M51: `anterior` é a preferência de antes e `normal`, o último tema normal
 * (o que a main mostra no Full). Escolher o Full só pede o
 * switch_window_mode(true), e a página fica no tema normal; sair do Full pede
 * o switch_window_mode(false) antes da troca comum.
 */
export function conferirTroca(m, escolha, { plataforma = 'linux', anterior = null, normal = 'lite' } = {}) {
  const falhas = [];
  const resolve = (e) => (e === 'system' ? DO_SISTEMA : e);
  const resolvido = escolha === 'full' ? resolve(normal) : resolve(escolha);
  if (m.pref !== escolha || m.tema !== resolvido) falhas.push(`<html>: ${m.pref}/${m.tema}, esperado ${escolha}/${resolvido}`);
  if (m.salvo !== escolha) falhas.push(`settings.theme ${m.salvo}`);
  const comum =
    escolha === 'system'
      ? ['set_theme:null', ...(plataforma === 'linux' ? [`set_theme:${resolvido}`] : []), `settings_set:{"theme":"system","resolvedTheme":"${resolvido}"}`]
      : [`settings_set:{"theme":"${escolha}","resolvedTheme":"${escolha}"}`, `set_theme:${NATIVO[escolha]}`];
  const esperados = escolha === 'full' ? ['switch_window_mode:true'] : [...(anterior === 'full' ? ['switch_window_mode:false'] : []), ...comum];
  if (m.comandos.join(' ') !== esperados.join(' ')) falhas.push(`comandos ${JSON.stringify(m.comandos)}, esperado ${JSON.stringify(esperados)}`);
  const marcadas = m.opcoes.filter((o) => o.marcado).map((o) => o.tema);
  if (marcadas.join() !== escolha) falhas.push(`marcadas: ${marcadas}`);
  return falhas;
}

function passos(partida, capturas) {
  const p = ['--eval', MEDIR, '--wait', '300', '--eval', '__ttAparencia()'];
  if (capturas) p.push('--shot', join(capturas, `m24-aparencia-${partida}.png`));
  const ordem = ESCOLHAS.filter((e) => e !== partida);
  for (const e of ordem) p.push('--click', `.tt-tema[data-tema="${e}"] .tt-previa-moldura`, '--wait', '350', '--eval', '__ttAparencia()');
  // A seta para a esquerda, a partir da última escolhida
  p.push('--key', 'ArrowLeft', '--wait', '350', '--eval', '__ttAparencia()');
  return { args: p, ordem };
}

function rodar(partida, capturas) {
  const { args: p, ordem } = passos(partida, capturas);
  const args = [join(AQUI, 'shot.mjs'), '--size', '1000x700', '--path', `/?pref=${partida}&plataforma=linux#/configuracoes`, ...p];
  return new Promise((res, rej) => {
    const filho = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let saida = '';
    let erros = '';
    filho.stdout.on('data', (d) => (saida += d));
    filho.stderr.on('data', (d) => (erros += d));
    filho.on('error', rej);
    filho.on('exit', (codigo) => {
      const medidas = saida
        .split('\n')
        .filter((l) => l.startsWith('__ttAparencia()'))
        .map((l) => JSON.parse(l.slice(l.indexOf(' => ') + 4)));
      res({ codigo, medidas, ordem, erros: erros.split('\n').filter((l) => l && !/^\[console\.(log|info|debug)\]/.test(l)) });
    });
  });
}

async function main() {
  const argv = process.argv.slice(2);
  let capturas = null;
  if (argv.length) {
    if (argv[0] !== '--capturas' || !argv[1] || argv.length > 2) throw new Error('uso: aparencia.mjs [--capturas pasta]');
    capturas = resolve(argv[1]);
    mkdirSync(capturas, { recursive: true });
  }
  let falhou = false;
  const relatar = (rotulo, f) => {
    if (f.length) falhou = true;
    console.log(`${f.length ? 'FALHA' : 'ok   '} ${rotulo}${f.length ? `\n        ${f.join('\n        ')}` : ''}`);
  };
  for (const partida of ESCOLHAS) {
    const r = await rodar(partida, capturas);
    const esperadas = 1 + r.ordem.length + 1;
    if (r.codigo !== 0 || r.medidas.length !== esperadas) {
      falhou = true;
      console.log(`FALHA ${partida}: o Chrome saiu com ${r.codigo} e ${r.medidas.length} de ${esperadas} medidas`);
      for (const l of r.erros) console.log(`  ${l}`);
      continue;
    }
    const [inicial, ...trocas] = r.medidas;
    const resolvido = partida === 'system' ? DO_SISTEMA : partida === 'full' ? 'lite' : partida;
    relatar(
      `${partida}: página em ${inicial.tema}, cada prévia com os tokens do próprio tema, "${partida}" marcada`,
      [...(inicial.pref === partida && inicial.tema === resolvido ? [] : [`<html> ${inicial.pref}/${inicial.tema}`]), ...conferirPrevias(inicial, partida)],
    );
    let antes = partida;
    let normal = partida === 'full' ? 'lite' : partida;
    const seguir = (e) => {
      const ctx = { anterior: antes, normal };
      antes = e;
      if (e !== 'full') normal = e;
      return ctx;
    };
    r.ordem.forEach((e, i) => relatar(`${partida} → ${e} (clique): <html>, settings_set, setTheme e marcação`, [...conferirTroca(trocas[i], e, seguir(e)), ...conferirPrevias(trocas[i], e)]));
    const ultima = r.ordem.at(-1);
    const anterior = ESCOLHAS[(ESCOLHAS.indexOf(ultima) - 1 + ESCOLHAS.length) % ESCOLHAS.length];
    const seta = trocas.at(-1);
    relatar(`${partida}: seta para a esquerda de ${ultima} → ${anterior}`, [
      ...conferirTroca(seta, anterior, seguir(anterior)),
      ...(seta.foco === anterior ? [] : [`foco em ${seta.foco}`]),
    ]);
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
