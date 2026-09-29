#!/usr/bin/env node
// Conferência do diálogo dos avisos (M46) no Chrome headless, com o mock do
// Tauri (que lê os mesmos arquivos do bundle.resources pelo Vite) e o ponteiro
// e o teclado de verdade, sem abrir janela. Em cada tema pedido (os quatro
// normais por padrão):
//   1. no Sobre aberto, "Ver avisos" e "Ver licença" habilitados;
//   2. "Ver avisos" abre o diálogo com o título, o texto do
//      THIRD_PARTY_NOTICES.md (o começo, o @fluentui/web-components e os
//      crates), o foco no bloco de texto, 640 px de largura, o texto em
//      --tt-fg-1 numa moldura rolável sem rolagem horizontal;
//   3. o End rola o bloco pelo teclado; o Esc fecha e devolve o foco a "Ver
//      avisos";
//   4. "Ver licença" abre a OFL da Inter; "Fechar" fecha e devolve o foco;
//      reabrir os avisos não lê o arquivo de novo;
//   5. estreito (480 × 500), o diálogo cabe na janela.
// E uma vez, com a leitura recusada (?avisos=falha): o aviso de erro no lugar
// do texto. Com --capturas, salva o diálogo de cada tema.
//
//   TT_PREVIEW_PORT=5180 node scripts/preview/avisos.mjs [--temas lite,dark] [--capturas pasta]
//
// O arquivo lido do pacote de verdade (o .deb) fica com o roteiro aninhado
// avisos (scripts/gnome-aninhado/roteiros/avisos.js).
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { hex, lerCor } from '../contrast.mjs';

const AQUI = fileURLToPath(new URL('.', import.meta.url));

const MEDIR = `window.__ttAvisos = (rotulo) => {
  const caixa = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map((v) => Math.round(v * 10) / 10); };
  const d = document.querySelector('fluent-dialog[data-dialogo="avisos"]');
  const pre = d?.querySelector('[data-texto]');
  const ativo = document.activeElement;
  return {
    rotulo,
    botoes: [...document.querySelectorAll('[data-avisos]')].map((b) => ({ doc: b.dataset.avisos, texto: b.textContent, desabilitado: b.disabled })),
    aberto: Boolean(d?.dialog?.open),
    nome: d?.getAttribute('aria-label') ?? null,
    titulo: d?.querySelector('h2')?.textContent ?? null,
    caixa: caixa(d?.dialog),
    texto: pre ? { inicio: pre.textContent.slice(0, 80), tamanho: pre.textContent.length, busy: pre.getAttribute('aria-busy'), escondido: pre.hidden,
      cor: getComputedStyle(pre).color, fg1: (() => { const t = document.createElement('i'); t.style.color = 'var(--tt-fg-1)'; d.append(t); const c = getComputedStyle(t).color; t.remove(); return c; })(), fonte: getComputedStyle(pre).fontFamily, caixa: caixa(pre),
      rolagem: { topo: pre.scrollTop, altura: pre.scrollHeight, visivel: pre.clientHeight, largura: pre.scrollWidth, larguraVisivel: pre.clientWidth } } : null,
    contem: pre ? ['@fluentui/web-components 3.1.3', 'Aplicativo (crates Rust)', 'serde', 'SIL OPEN FONT LICENSE Version 1.1'].filter((s) => pre.textContent.includes(s)) : [],
    erro: (() => { const e = d?.querySelector('[data-erro]'); return e ? { escondido: e.hidden, texto: e.textContent } : null; })(),
    foco: ativo?.matches?.('[data-texto]') ? 'texto' : ativo?.dataset?.avisos ? 'botão:' + ativo.dataset.avisos : ativo?.tagName?.toLowerCase() ?? null,
    janela: [innerWidth, innerHeight],
    comandos: window.__TOMATITO_PREVIEW_COMANDOS__.splice(0).filter((c) => c.startsWith('notices_read')),
  };
}`;

const medir = (rotulo) => ['--eval', `__ttAvisos(${JSON.stringify(rotulo)})`];
const SOBRE = '[data-cartao="sobre"]';

function passos(capturas, tema) {
  const p = ['--eval', MEDIR, '--wait', '300'];
  p.push('--eval', `(document.querySelector('${SOBRE}').scrollIntoView({ block: 'center' }), 'ok')`, '--wait', '100');
  p.push('--click', `${SOBRE} [data-expansor]`, '--wait', '200');
  p.push('--eval', `(document.querySelector('[data-avisos="ofl"]').scrollIntoView({ block: 'center' }), 'ok')`, '--wait', '100', ...medir('sobre'));
  p.push('--click', '[data-avisos="avisos"]', '--wait', '500', ...medir('avisos'));
  if (capturas) p.push('--shot', join(capturas, `m46-avisos-${tema}.png`));
  p.push('--key', 'End', '--wait', '200', ...medir('fim'));
  p.push('--key', 'Escape', '--wait', '300', ...medir('esc'));
  p.push('--click', '[data-avisos="ofl"]', '--wait', '400', ...medir('ofl'));
  p.push('--click', 'fluent-dialog[data-dialogo="avisos"] [data-fechar]', '--wait', '300', ...medir('fechado'));
  p.push('--click', '[data-avisos="avisos"]', '--wait', '300', ...medir('de-novo'));
  p.push('--resize', '480x500', '--wait', '300', ...medir('estreito'));
  return p;
}

function rodar(caminho, lista) {
  const args = [join(AQUI, 'shot.mjs'), '--size', '1000x700', '--path', caminho, ...lista];
  return new Promise((res, rej) => {
    const filho = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let saida = '';
    let erros = '';
    filho.stdout.on('data', (d) => (saida += d));
    filho.stderr.on('data', (d) => (erros += d));
    filho.on('error', rej);
    filho.on('exit', (codigo) => {
      const medidas = Object.fromEntries(
        saida
          .split('\n')
          .filter((l) => l.startsWith('__ttAvisos('))
          .map((l) => JSON.parse(l.slice(l.indexOf(' => ') + 4)))
          .map((m) => [m.rotulo, m]),
      );
      res({ codigo, medidas, erros: erros.split('\n').filter((l) => l && !/^\[console\.(log|info|debug)\]/.test(l)) });
    });
  });
}

const perto = (a, b, tol = 1) => Math.abs(a - b) <= tol;

async function main() {
  const argv = process.argv.slice(2);
  let capturas = null;
  let temas = ['lite', 'suave', 'light', 'dark'];
  for (let i = 0; i < argv.length; i += 2) {
    if (argv[i] === '--capturas' && argv[i + 1]) {
      capturas = resolve(argv[i + 1]);
      mkdirSync(capturas, { recursive: true });
    } else if (argv[i] === '--temas' && argv[i + 1]) temas = argv[i + 1].split(',');
    else throw new Error('uso: avisos.mjs [--temas lite,dark] [--capturas pasta]');
  }
  const tamanhoDosAvisos = readFileSync(new URL('../../THIRD_PARTY_NOTICES.md', import.meta.url), 'utf8').length;
  let falhou = false;
  let n = 0;
  const relatar = (rotulo, f) => {
    n++;
    if (f.length) falhou = true;
    console.log(`${f.length ? 'FALHA' : 'ok   '} ${rotulo}${f.length ? `\n        ${f.join('\n        ')}` : ''}`);
  };
  const esperadas = ['sobre', 'avisos', 'fim', 'esc', 'ofl', 'fechado', 'de-novo', 'estreito'];
  for (const tema of temas) {
    const r = await rodar(`/?pref=${tema}&plataforma=linux#/configuracoes`, passos(capturas, tema));
    const M = r.medidas;
    const faltam = esperadas.filter((e) => !M[e]);
    if (r.codigo !== 0 || faltam.length) {
      falhou = true;
      console.log(`FALHA ${tema}: o Chrome saiu com ${r.codigo}; faltam ${faltam.join(', ')}`);
      for (const l of r.erros.slice(0, 20)) console.log(`  ${l}`);
      continue;
    }
    relatar(`${tema}: no Sobre, "Ver avisos" e "Ver licença" habilitados`,
      JSON.stringify(M.sobre.botoes) === '[{"doc":"avisos","texto":"Ver avisos","desabilitado":false},{"doc":"ofl","texto":"Ver licença","desabilitado":false}]' ? [] : [JSON.stringify(M.sobre.botoes)]);
    const a = M.avisos;
    relatar(`${tema}: "Ver avisos" abre o THIRD_PARTY_NOTICES.md inteiro, com o foco no texto`, [
      ...(a.aberto && a.nome === 'Avisos de terceiros' && a.titulo === 'Avisos de terceiros' ? [] : [`diálogo ${JSON.stringify([a.aberto, a.nome, a.titulo])}`]),
      ...(a.texto?.inicio.startsWith('# Avisos de terceiros\n') && a.texto.tamanho === tamanhoDosAvisos && a.texto.busy === null ? [] : [`texto ${JSON.stringify(a.texto)}`]),
      ...(['@fluentui/web-components 3.1.3', 'Aplicativo (crates Rust)', 'serde'].every((s) => a.contem.includes(s)) ? [] : [`contém ${a.contem}`]),
      ...(a.foco === 'texto' ? [] : [`foco em ${a.foco}`]),
      ...(a.comandos.join() === 'notices_read:avisos' ? [] : [`comandos ${a.comandos}`]),
    ]);
    const cor = hex(lerCor(a.texto.cor));
    const fg1 = hex(lerCor(a.texto.fg1));
    relatar(`${tema}: 640 px, texto em --tt-fg-1 (${fg1}) monoespaçado, rolável na vertical e sem rolagem horizontal`, [
      ...(perto(a.caixa[2], 640) ? [] : [`largura ${a.caixa[2]}`]),
      ...(cor === fg1 ? [] : [`cor ${cor}`]),
      ...(/Consolas|Courier|monospace/.test(a.texto.fonte) ? [] : [`fonte ${a.texto.fonte}`]),
      ...(a.texto.rolagem.altura > a.texto.rolagem.visivel * 10 ? [] : [`rolagem ${JSON.stringify(a.texto.rolagem)}`]),
      ...(a.texto.rolagem.largura <= a.texto.rolagem.larguraVisivel ? [] : [`rolagem horizontal ${JSON.stringify(a.texto.rolagem)}`]),
    ]);
    relatar(`${tema}: o End rola o texto até o fim; o Esc fecha e devolve o foco a "Ver avisos"`, [
      ...(perto(M.fim.texto.rolagem.topo, M.fim.texto.rolagem.altura - M.fim.texto.rolagem.visivel, 2) ? [] : [`rolagem ${JSON.stringify(M.fim.texto.rolagem)}`]),
      ...(!M.esc.aberto && M.esc.foco === 'botão:avisos' ? [] : [`depois do Esc ${JSON.stringify([M.esc.aberto, M.esc.foco])}`]),
    ]);
    const o = M.ofl;
    relatar(`${tema}: "Ver licença" abre a OFL da Inter, e "Fechar" fecha e devolve o foco`, [
      ...(o.aberto && o.titulo === 'Licença da fonte Inter' && o.contem.includes('SIL OPEN FONT LICENSE Version 1.1') ? [] : [JSON.stringify([o.aberto, o.titulo, o.contem])]),
      ...(o.texto.rolagem.topo === 0 && o.foco === 'texto' ? [] : [`rolagem ${o.texto.rolagem.topo}, foco ${o.foco}`]),
      ...(o.comandos.join() === 'notices_read:ofl' ? [] : [`comandos ${o.comandos}`]),
      ...(!M.fechado.aberto && M.fechado.foco === 'botão:ofl' ? [] : [`depois do Fechar ${JSON.stringify([M.fechado.aberto, M.fechado.foco])}`]),
    ]);
    relatar(`${tema}: reabrir os avisos usa o texto guardado, do começo`, [
      ...(M['de-novo'].aberto && M['de-novo'].texto.tamanho === tamanhoDosAvisos && M['de-novo'].texto.rolagem.topo === 0 ? [] : [JSON.stringify(M['de-novo'].texto)]),
      ...(M['de-novo'].comandos.length === 0 ? [] : [`comandos ${M['de-novo'].comandos}`]),
    ]);
    const e = M.estreito;
    relatar(`${tema}: a 480 × 500, o diálogo cabe na janela`, [
      ...(e.caixa[0] >= 0 && e.caixa[0] + e.caixa[2] <= e.janela[0] && e.caixa[1] >= 0 && e.caixa[1] + e.caixa[3] <= e.janela[1] ? [] : [`caixa ${e.caixa} na janela ${e.janela}`]),
      ...(e.texto.rolagem.largura <= e.texto.rolagem.larguraVisivel ? [] : ['rolagem horizontal']),
    ]);
  }
  const r = await rodar('/?pref=lite&plataforma=linux&avisos=falha#/configuracoes', [
    '--eval', MEDIR, '--wait', '300', '--click', `${SOBRE} [data-expansor]`, '--wait', '200',
    '--click', '[data-avisos="avisos"]', '--wait', '400', ...medir('falha'),
  ]);
  const f = r.medidas.falha;
  relatar('com a leitura recusada, o aviso de erro no lugar do texto', !f ? ['sem medida'] : [
    ...(f.aberto && f.texto.escondido && f.erro && !f.erro.escondido && /Não foi possível abrir o arquivo/.test(f.erro.texto) ? [] : [JSON.stringify([f.texto, f.erro])]),
  ]);
  console.log(falhou ? `\nFALHOU (${n} conferências)` : `\nTudo ok (${n} conferências).`);
  process.exitCode = falhou ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err.message ?? err);
    process.exit(1);
  });
}
