#!/usr/bin/env node
// Conferência do layout responsivo (M10) nos dois motores, sem abrir janela:
// o Chrome headless (o Chromium do WebView2 no Windows) e o WebKitGTK fora da
// tela (o motor do app no Linux). Usa o shot.mjs e o webkit-shot.mjs com o
// passo --resize e as medidas de scripts/preview/medidas.js.
//
//   node scripts/preview/responsivo.mjs [--motor chrome|chrome-barras|webkit|webkit-barras|todos] [--capturas pasta]
//
// "chrome-barras" e "webkit-barras" são os dois motores com barras de rolagem
// clássicas, que ocupam espaço (no Chrome, como no WebView2 do Windows; no
// WebKitGTK, com GTK_OVERLAY_SCROLLING=0), e com a tela forçada a rolar na
// vertical (um bloco alto no fim de cada tela): confere que a barra não cria
// rolagem horizontal e não muda o número de colunas da Foco (quem rola é a
// .tt-rolagem, por dentro da camada, e a consulta mede a camada).
//
// Para cada largura de janela da lista (de 1000 até o mínimo de 480, com os
// dois lados dos limites de 860 e 609 px, e o mínimo com zoom de 120% a 160%),
// visita as cinco rotas e confere:
//   - nenhuma rolagem horizontal, nem na página nem na camada de conteúdo, e
//     nenhum elemento visível passando da borda direita;
//   - painel de 280 px com os rótulos a partir de 860 px, e de 48 px só com os
//     ícones (centrados em x = 16) abaixo disso;
//   - a camada de conteúdo: começa onde o painel acaba e logo abaixo da barra,
//     com fundo --tt-bg-surface, borda de 1 px em --tt-border só em cima e à
//     esquerda e raio de 8 px só no canto superior esquerdo;
//   - na Foco, 2 colunas quando a área útil da camada tem 560 px ou mais, e 1
//     abaixo (a conta é feita também pela largura da janela, para pegar um
//     erro no próprio limite), com os cartões nas posições de cada arranjo.
// No Chrome, também a dica do painel compacto: aparece com o mouse e com o
// foco do teclado, à direita do item e dentro da janela, some com Esc e não
// existe no painel largo. Por fim, a camada nos quatro temas normais.
// Sai com 1 se alguma conferência falhar.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = fileURLToPath(new URL('.', import.meta.url));
const ROTAS = ['#/foco', '#/temporizador', '#/cronometro', '#/configuracoes', '#/dev'];
// [largura, altura, zoom]. A altura mínima da janela é 500 (4.7).
const TAMANHOS = [
  [1000, 700, 1], [880, 700, 1], [861, 700, 1], [860, 700, 1], [859, 700, 1], [700, 700, 1],
  [610, 700, 1], [609, 700, 1], [608, 700, 1], [560, 600, 1], [480, 500, 1],
  [480, 500, 1.2], [480, 500, 1.4], [480, 500, 1.5], [480, 500, 1.6],
  // M43: o "Texto grande" do GNOME vira zoom de 125% no WebKitGTK, que se
  // multiplica ao do Ctrl + (125% × 140% = 175%; × 160% = 200%).
  [1000, 700, 1.25], [480, 500, 1.25], [480, 500, 1.75], [480, 500, 2],
];
const TEMAS = { lite: 'rgb(170, 57, 47)', suave: 'rgb(250, 243, 241)', light: 'rgb(249, 249, 249)', dark: 'rgb(40, 40, 40)' };
const MOTORES = ['chrome', 'chrome-barras', 'webkit', 'webkit-barras'];
const NOMES = {
  chrome: 'Chrome headless',
  'chrome-barras': 'Chrome headless, barras clássicas e tela alta',
  webkit: 'WebKitGTK fora da tela',
  'webkit-barras': 'WebKitGTK fora da tela, barras clássicas e tela alta',
};
const CAPTURAS = new Set(['1000x700@1', '859x700@1', '608x700@1', '480x500@1', '480x500@1.5']);

function lerArgs(argv) {
  const opts = { motor: 'todos', capturas: null };
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i].replace(/^--/, '');
    if (!(k in opts) || argv[i + 1] === undefined) throw new Error(`uso: responsivo.mjs [--motor ${MOTORES.join('|')}|todos] [--capturas pasta]`);
    opts[k] = argv[i + 1];
  }
  if (![...MOTORES, 'todos'].includes(opts.motor)) throw new Error(`motor desconhecido: ${opts.motor}`);
  if (opts.capturas) mkdirSync(resolve(opts.capturas), { recursive: true });
  return opts;
}

// Passos de um motor e o que cada --eval mede, na ordem.
function montarPassos(motor, capturas) {
  const passos = [];
  const medidas = [];
  const medir = (expr, contexto) => {
    passos.push('--eval', expr);
    medidas.push(contexto);
  };
  const barras = motor.endsWith('-barras');
  for (const [w, h, z] of TAMANHOS) {
    passos.push('--resize', `${w}x${h}${z === 1 ? '' : `@${z}`}`);
    for (const rota of ROTAS) {
      // O catálogo de desenvolvimento (#/dev) fica fora dos zooms do "Texto
      // grande" com o Ctrl + (175% e 200%): não é tela do app.
      if (rota === '#/dev' && z > 1.6) continue;
      medir(`__ttMedir(${JSON.stringify(rota)}${barras ? ', { alto: true }' : ''})`, { tipo: 'layout', w, h, z, rota, barras });
    }
    const chave = `${w}x${h}@${z}`;
    if (capturas && CAPTURAS.has(chave) && !barras) {
      medir('__ttMedir("#/foco")', { tipo: 'nada' });
      passos.push('--shot', join(capturas, `${motor}-${w}x${h}${z === 1 ? '' : `-zoom${z}`}.png`));
    }
  }
  if (motor === 'chrome') {
    // Dica: painel compacto a 700 px. Mouse sobre o Temporizador; Esc; mouse
    // fora; Tab (entra pelo item atual, Foco) e ↓ (Temporizador); e o painel
    // largo, onde a dica não existe.
    passos.push('--resize', '700x500');
    medir('__ttMedir("#/foco")', { tipo: 'nada' });
    passos.push('--hover', '.tt-nav-item[data-rota="temporizador"]', '--wait', '100');
    medir('__ttMedidas()', { tipo: 'dica', caso: 'mouse, antes do atraso', quer: [] });
    passos.push('--wait', '400');
    medir('__ttMedidas()', { tipo: 'dica', caso: 'mouse parado no Temporizador', quer: ['Temporizador'] });
    if (capturas) passos.push('--shot', join(capturas, 'chrome-dica.png'));
    passos.push('--key', 'Escape', '--wait', '100');
    medir('__ttMedidas()', { tipo: 'dica', caso: 'Esc com o mouse no item', quer: [] });
    passos.push('--hover', '.tt-nav-item[data-rota="cronometro"]', '--wait', '400');
    medir('__ttMedidas()', { tipo: 'dica', caso: 'mouse no item seguinte, depois do Esc', quer: ['Cronômetro'] });
    passos.push('--hover', '.tt-foco-grade', '--wait', '200');
    medir('__ttMedidas()', { tipo: 'dica', caso: 'mouse fora do painel', quer: [] });
    // M17: a tela Foco passou a ter controles (o seletor de minutos). O Tab
    // parte do ponto de navegação do Chrome, que o mouse moveu para a tela;
    // o ponto volta para a barra de título (foco nela e o tabindex tirado
    // logo depois), e o Tab entra pelo painel, como numa janela recém-aberta.
    medir('__ttTabDoComeco()', { tipo: 'nada' });
    passos.push('--key', 'Tab', '--wait', '400');
    medir('__ttMedidas()', { tipo: 'dica', caso: 'Tab (foco do teclado no item atual)', quer: ['Foco'] });
    passos.push('--key', 'ArrowDown', '--wait', '400');
    medir('__ttMedidas()', { tipo: 'dica', caso: '↓ (foco no Temporizador)', quer: ['Temporizador'] });
    passos.push('--key', 'Escape', '--wait', '100');
    medir('__ttMedidas()', { tipo: 'dica', caso: 'Esc com o foco no item', quer: [] });
    passos.push('--resize', '1000x700', '--hover', '.tt-nav-item[data-rota="temporizador"]', '--wait', '400');
    medir('__ttMedidas()', { tipo: 'dica', caso: 'painel largo, mouse parado no item', quer: [] });
  }
  passos.push('--resize', '1000x700');
  for (const tema of Object.keys(TEMAS)) medir(`__ttTema(${JSON.stringify(tema)})`, { tipo: 'tema', tema });
  return { passos, medidas };
}

function rodar(motor, passos) {
  const script = join(AQUI, motor.startsWith('webkit') ? 'webkit-shot.mjs' : 'shot.mjs');
  const extra = motor === 'chrome-barras' ? ['--scrollbars', 'classic'] : [];
  const env = motor === 'webkit-barras' ? { ...process.env, GTK_OVERLAY_SCROLLING: '0' } : process.env;
  const args = [script, '--size', '1000x700', ...extra, '--path', '/?plataforma=linux#/foco', ...passos];
  return new Promise((res, rej) => {
    const filho = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'], env });
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

const iguais = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// Com zoom, as posições saem com erro de arredondamento de centésimos.
const perto = (a, b, tol = 0.05) => Math.abs(a - b) <= tol;
// Com o zoom do WebKitGTK, a borda de 1 px vira 1 pixel do dispositivo (0,67 px
// CSS a 150%), como as bordas finas do sistema; no Chrome continua 1 px.
const bordaFina = (v) => parseFloat(v) > 0 && parseFloat(v) <= 1;

// Colunas esperadas pela largura da janela (em px CSS): a área que a consulta
// mede é a camada, isto é, a janela menos o painel e a borda esquerda de 1 px.
// A barra de rolagem vertical fica por dentro da camada e não entra na conta.
const colunasPelaJanela = (largura) => (largura - (largura < 860 ? 48 : 280) - 1 >= 560 ? 2 : 1);

function conferirLayout(m, { rota, barras }) {
  const falhas = [];
  const largura = m.janela[0];
  const compacto = largura < 860;
  if (m.rota !== rota) falhas.push(`rota ${m.rota}`);
  if (barras && !(m.barraVertical > 0)) falhas.push('a camada não ganhou barra de rolagem vertical');
  if (!barras && m.barraVertical !== 0) falhas.push(`barra vertical de ${m.barraVertical} px`);
  if (m.rolagem.pagina !== 0 || m.rolagem.conteudo !== 0 || m.rolagem.camada !== 0) falhas.push(`rolagem horizontal ${JSON.stringify(m.rolagem)}`);
  if (m.foraDaJanela.length) falhas.push(`fora da janela: ${m.foraDaJanela.slice(0, 3).join(', ')}`);
  if (m.fontesComErro?.length) falhas.push(`fonte que não carregou: ${[...new Set(m.fontesComErro)].join(', ')}`);
  const p = m.painel;
  if (!perto(p.largura, compacto ? 48 : 280)) falhas.push(`painel de ${p.largura} px`);
  if (p.rotulosVisiveis !== (compacto ? 0 : 4)) falhas.push(`${p.rotulosVisiveis} rótulos visíveis`);
  if (!p.icones.every((c) => perto(c[0], 16) && perto(c[2], 16))) falhas.push(`ícones fora de x = 16: ${JSON.stringify(p.icones)}`);
  if (!p.itens.every((c) => perto(c[0], 4) && perto(c[2], p.largura - 8) && perto(c[3], 36))) falhas.push(`itens ${JSON.stringify(p.itens)}`);
  if (!iguais(p.rotulos, ['Foco', 'Temporizador', 'Cronômetro', 'Configurações'])) falhas.push(`rótulos ${p.rotulos}`);
  if (p.dicas.length) falhas.push(`dica visível sem mouse nem foco: ${JSON.stringify(p.dicas)}`);
  const c = m.camada;
  if (!perto(c.caixa[0], p.largura) || !perto(c.caixa[1], 32) || Math.abs(c.caixa[0] + c.caixa[2] - largura) > 0.5) falhas.push(`camada em ${c.caixa}`);
  const [cima, direita, baixo, esquerda] = c.bordas;
  if (!(bordaFina(cima) && esquerda === cima && direita === '0px' && baixo === '0px')) falhas.push(`bordas ${c.bordas}`);
  if (!iguais(c.raios, ['8px', '0px', '0px', '0px'])) falhas.push(`raios ${c.raios}`);
  if (c.fundo !== TEMAS[m.tema]) falhas.push(`fundo ${c.fundo}`);
  if (!c.corDaBorda.every((cor) => cor === 'rgb(189, 99, 89)')) falhas.push(`cor da borda ${c.corDaBorda}`);
  if (rota === '#/foco') {
    const g = m.grade;
    const quer = c.larguraUtil >= 560 ? 2 : 1;
    const pelaJanela = colunasPelaJanela(largura);
    if (g.colunas !== quer || g.colunas !== pelaJanela) {
      falhas.push(`${g.colunas} coluna(s) com área útil de ${c.larguraUtil} px (esperado ${quer}; pela janela, ${pelaJanela})`);
    }
    if (g.caixa[2] > 908) falhas.push(`grade de ${g.caixa[2]} px`);
    const k = Object.fromEntries(g.cartoes.map((x) => [x.id, x.caixa]));
    const ok2 = k.sessao[0] === k.tarefas[0] && k.progresso[0] > k.sessao[0] + k.sessao[2] && k.sessao[1] === k.progresso[1] && k.tarefas[1] > k.sessao[1];
    const ok1 = k.sessao[0] === k.tarefas[0] && k.tarefas[0] === k.progresso[0] && k.sessao[1] < k.tarefas[1] && k.tarefas[1] < k.progresso[1];
    if (g.colunas === 2 ? !ok2 : !ok1) falhas.push(`cartões ${JSON.stringify(k)}`);
  }
  return falhas;
}

function conferirDica(m, { quer }) {
  const falhas = [];
  const textos = m.painel.dicas.map((d) => d.texto);
  if (!iguais(textos, quer)) falhas.push(`dicas ${JSON.stringify(textos)}, esperado ${JSON.stringify(quer)}`);
  for (const d of m.painel.dicas) {
    const item = m.painel.itens[m.painel.rotulos.indexOf(d.texto)];
    const [x, y, w, h] = d.caixa;
    const centro = y + h / 2;
    if (!perto(x, item[0] + item[2] + 8)) falhas.push(`dica em x = ${x} (item acaba em ${item[0] + item[2]})`);
    if (Math.abs(centro - (item[1] + item[3] / 2)) > 0.5) falhas.push('dica fora do centro do item');
    if (x + w > m.janela[0]) falhas.push('dica passa da janela');
  }
  return falhas;
}

async function main() {
  const opts = lerArgs(process.argv.slice(2));
  const motores = opts.motor === 'todos' ? MOTORES : [opts.motor];
  let falhou = false;
  for (const motor of motores) {
    const { passos, medidas } = montarPassos(motor, opts.capturas && resolve(opts.capturas));
    const r = await rodar(motor, passos);
    console.log(`\n${NOMES[motor]}: ${r.valores.length} medidas`);
    if (r.codigo !== 0 || r.valores.length !== medidas.length) {
      falhou = true;
      console.log(`FALHA: o ${motor} saiu com ${r.codigo} e ${r.valores.length} de ${medidas.length} medidas`);
      for (const l of r.erros) console.log(`  ${l}`);
      continue;
    }
    for (const l of r.erros) console.log(`  aviso do ${motor}: ${l}`);
    // Uma linha por tamanho, com as cinco rotas.
    const linhas = new Map();
    medidas.forEach((ctx, i) => {
      const m = r.valores[i];
      if (ctx.tipo === 'layout') {
        const chave = `${ctx.w}x${ctx.h}${ctx.z === 1 ? '' : ` @${Math.round(ctx.z * 100)}%`}`;
        const linha = linhas.get(chave) ?? { css: m.janela.join('x'), painel: m.painel.largura, colunas: null, util: null, barra: m.barraVertical, falhas: [] };
        if (ctx.rota === '#/foco') {
          linha.colunas = m.grade.colunas;
          linha.util = m.camada.larguraUtil;
        }
        linha.falhas.push(...conferirLayout(m, ctx).map((f) => `${ctx.rota}: ${f}`));
        linhas.set(chave, linha);
      } else if (ctx.tipo === 'dica') {
        const f = conferirDica(m, ctx);
        console.log(`${f.length ? 'FALHA' : 'ok   '} dica, ${ctx.caso}: ${JSON.stringify(m.painel.dicas.map((d) => [d.texto, d.caixa]))}${f.length ? ` (${f.join('; ')})` : ''}`);
        if (f.length) falhou = true;
      } else if (ctx.tipo === 'tema') {
        const ok = m.camada.fundo === TEMAS[ctx.tema] && m.camada.corDaBorda.every((cor) => cor === m.camada.corDaBorda[0]);
        console.log(`${ok ? 'ok   ' : 'FALHA'} tema ${ctx.tema}: camada ${m.camada.fundo} (${m.camada.superficie}), borda ${m.camada.corDaBorda[0]} (${m.camada.borda})`);
        if (!ok) falhou = true;
      }
    });
    console.log('janela              px CSS     painel  área útil  colunas  5 rotas sem rolagem horizontal');
    for (const [chave, l] of linhas) {
      const ok = l.falhas.length === 0;
      if (!ok) falhou = true;
      console.log(
        `${ok ? 'ok   ' : 'FALHA'} ${chave.padEnd(14)} ${l.css.padEnd(10)} ${String(l.painel).padStart(4)}  ${String(l.util).padStart(8)}  ${String(l.colunas).padStart(6)}${l.barra ? `  (barra vertical de ${l.barra} px)` : ''}` +
          (ok ? '' : `\n        ${l.falhas.join('\n        ')}`),
      );
    }
  }
  console.log(falhou ? '\nFALHOU' : '\nTudo ok.');
  process.exitCode = falhou ? 1 : 0;
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
