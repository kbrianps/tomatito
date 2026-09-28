#!/usr/bin/env node
// Conferência das seções "Sistema" e "Sobre" das Configurações (M39) no Chrome
// headless, com o mock do Tauri e o ponteiro e o teclado de verdade, sem abrir
// janela. Em cada tema pedido (os quatro normais por padrão):
//   1. a ordem das seções (Sessões de foco, Aparência, Sistema, Sobre), os três
//      cartões do Sistema no desenho do cartão do Volume (68 px, raio 4, título
//      na coluna de 58 px, switch e botão a 16 px da borda direita) e o Sobre
//      fechado, com "Versão 0.1.0" (o getVersion() do mock) no cabeçalho;
//   2. os recursos do get_state no platform/recursos.js (o import do console);
//   3. o hover no cabeçalho do Sobre leva a descrição e a versão ao
//      --tt-fg-2-on-ctl; o clique abre, com "Ver avisos" desabilitado e o
//      aviso de marcas;
//   4. os switches gravam só a própria chave (clique e Espaço), com o texto
//      "Ativado"/"Desativado"; recusado, o switch volta; uma gravação de fora
//      (só o tt://settings) aparece nos switches;
//   5. "Sair" chama o app_quit;
//   6. sem o recurso da bandeja (?recursos=), o "Tempo na bandeja" some e o
//      resto fica; estreito (480 × 500), nada passa da largura.
// Com --capturas, salva a seção de cada tema.
//
//   node scripts/preview/sistema.mjs [--temas lite,suave,light,dark] [--capturas pasta]
//
// O que o mock não tem (o settings.json, a bandeja, o fechar de verdade e o
// app saindo) fica com o roteiro scripts/gnome-aninhado/roteiros/config-sistema.js.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { coresDoTema } from './configuracoes.mjs';
import { hex, lerCor } from '../contrast.mjs';

const AQUI = fileURLToPath(new URL('.', import.meta.url));

// Mede as duas seções no navegador. Vai como texto para o --eval.
const MEDIR = `window.__ttSistema = async (rotulo) => {
  const caixa = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map((v) => Math.round(v * 10) / 10); };
  const cartao = (c) => {
    const sw = c.querySelector('fluent-switch');
    const botao = c.querySelector('[data-expansor]');
    const conteudo = c.querySelector('.tt-expansor-conteudo');
    return {
      id: c.dataset.cartao, visivel: c.offsetParent !== null, caixa: caixa(c), raio: getComputedStyle(c).borderTopLeftRadius,
      topo: caixa(c.querySelector('.tt-expansor-topo, .tt-config-cabecalho')),
      titulo: caixa(c.querySelector('.tt-config-titulo')),
      corDaDescricao: getComputedStyle(c.querySelector('.tt-config-descricao')).color,
      interruptor: sw ? { caixa: caixa(sw), ligado: sw.checked, estado: c.querySelector('[data-estado]').textContent } : null,
      botao: (() => { const b = c.querySelector('.tt-config-controle > button'); return b ? { caixa: caixa(b), texto: b.textContent } : null; })(),
      expandido: botao ? botao.getAttribute('aria-expanded') : null,
      conteudo: conteudo ? { hidden: conteudo.hidden, altura: conteudo.offsetHeight, texto: conteudo.textContent } : null,
      chevron: caixa(c.querySelector('.tt-expansor-chevron')),
      valor: (() => { const v = c.querySelector('.tt-expansor-valor'); return v ? { texto: v.textContent, cor: getComputedStyle(v).color, caixa: caixa(v) } : null; })(),
      avisos: (() => { const a = c.querySelector('[data-avisos]'); return a ? { desabilitado: a.disabled, texto: a.textContent } : null; })(),
    };
  };
  const secao = (id) => { const s = document.querySelector('[aria-labelledby="' + id + '"]'); return s ? [...s.querySelectorAll('.tt-config-cartao')].map(cartao) : null; };
  const rolagem = document.querySelector('.tt-rolagem');
  const rec = (await import('/src/platform/recursos.js')).recursos;
  return {
    rotulo,
    secoes: [...document.querySelectorAll('.tt-pagina h2')].map((h) => h.id),
    sistema: secao('config-sistema'), sobre: secao('config-sobre-secao'),
    recursos: { ...rec },
    larguras: { rolagem: rolagem.clientWidth, conteudo: rolagem.scrollWidth },
    comandos: window.__TOMATITO_PREVIEW_COMANDOS__.splice(0),
    salvo: { closeToTray: window.__TOMATITO_PREVIEW_CONFIGURACOES__.closeToTray, trayTime: window.__TOMATITO_PREVIEW_CONFIGURACOES__.trayTime },
  };
}`;

const medir = (rotulo) => ['--eval', `__ttSistema(${JSON.stringify(rotulo)})`];
const cartao = (id) => `[data-cartao="${id}"]`;
const rolarAte = (sel) => ['--eval', `(document.querySelector(${JSON.stringify(sel)}).scrollIntoView({ block: 'center' }), 'ok')`, '--wait', '100'];

function passos(capturas, tema) {
  const p = ['--eval', MEDIR, '--wait', '300', ...rolarAte(cartao('sobre')), ...medir('inicial')];
  p.push('--hover', `${cartao('sobre')} .tt-expansor-botao`, '--wait', '150', ...medir('hover-sobre'));
  p.push('--click', `${cartao('sobre')} [data-expansor]`, '--wait', '200', ...medir('sobre-aberto'));
  if (capturas) p.push('--hover', '.tt-pagina h1', ...rolarAte(cartao('sobre')), '--wait', '200', '--shot', join(capturas, `m39-sistema-${tema}.png`));
  p.push(...rolarAte(cartao('tempo-bandeja')));
  p.push('--click', `${cartao('tempo-bandeja')} fluent-switch`, '--wait', '200', ...medir('tempo-ligado'));
  p.push('--key', 'Space', '--wait', '200', ...medir('tempo-espaco'));
  p.push('--click', `${cartao('fechar-bandeja')} fluent-switch`, '--wait', '200', ...medir('fechar-desligado'));
  p.push('--eval', '(window.__TOMATITO_PREVIEW_RECUSAR_CONFIGURACOES__ = true, "ok")', '--click', `${cartao('fechar-bandeja')} fluent-switch`, '--wait', '300', ...medir('recusado'));
  p.push('--eval', '(window.__TOMATITO_PREVIEW_RECUSAR_CONFIGURACOES__ = false, "ok")');
  p.push(
    '--eval',
    `(window.__TAURI_INTERNALS__.invoke('settings_set', { patch: { closeToTray: true, trayTime: true } }), 'ok')`,
    '--wait', '300', ...medir('de-fora'),
  );
  p.push('--click', `${cartao('sair')} [data-sair]`, '--wait', '200', ...medir('sair'));
  p.push('--resize', '480x500', '--wait', '300', ...rolarAte(cartao('sair')), ...medir('estreito'));
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
          .filter((l) => l.startsWith('__ttSistema('))
          .map((l) => JSON.parse(l.slice(l.indexOf(' => ') + 4)))
          .map((m) => [m.rotulo, m]),
      );
      res({ codigo, medidas, erros: erros.split('\n').filter((l) => l && !/^\[console\.(log|info|debug)\]/.test(l)) });
    });
  });
}

const perto = (a, b, tol = 1) => Math.abs(a - b) <= tol;
const direita = (c) => c[0] + c[2];
const rgbParaHex = (s) => hex(lerCor(s));
const porId = (lista) => Object.fromEntries(lista.map((c) => [c.id, c]));

/** Confere a abertura; devolve as falhas. */
export function conferirAbertura(m) {
  const f = [];
  if (m.secoes.join() !== 'config-sessoes,config-aparencia,config-sistema,config-sobre-secao') f.push(`seções ${m.secoes.join()}`);
  if (m.sistema.map((c) => c.id).join() !== 'fechar-bandeja,tempo-bandeja,sair') f.push(`cartões do Sistema ${m.sistema.map((c) => c.id)}`);
  for (const c of [...m.sistema, ...m.sobre]) {
    if (!c.visivel) f.push(`${c.id}: escondido`);
    if (c.raio !== '4px') f.push(`${c.id}: raio ${c.raio}`);
    if (!perto(c.topo[3], 68)) f.push(`${c.id}: cabeçalho de ${c.topo[3]} px`);
    // O título a 58 px da borda de dentro (1 px de borda + 18 + 20 + 20).
    if (!perto(c.titulo[0] - c.caixa[0], 59)) f.push(`${c.id}: título a ${c.titulo[0] - c.caixa[0]} px da borda`);
    // O controle a 16 px da borda de dentro, como o do Volume.
    const controle = c.interruptor?.caixa ?? c.botao?.caixa;
    if (controle && !perto(direita(c.caixa) - direita(controle), 17)) f.push(`${c.id}: controle a ${direita(c.caixa) - direita(controle)} px da borda`);
  }
  const s = porId(m.sistema);
  if (s['fechar-bandeja'].interruptor?.ligado !== true || s['fechar-bandeja'].interruptor.estado !== 'Ativado') f.push(`fechar para a bandeja: ${JSON.stringify(s['fechar-bandeja'].interruptor)}`);
  if (s['tempo-bandeja'].interruptor?.ligado !== false || s['tempo-bandeja'].interruptor.estado !== 'Desativado') f.push(`tempo na bandeja: ${JSON.stringify(s['tempo-bandeja'].interruptor)}`);
  if (s.sair.botao?.texto !== 'Sair') f.push(`botão ${JSON.stringify(s.sair.botao)}`);
  const sobre = m.sobre[0];
  if (sobre?.valor?.texto !== 'Versão 0.1.0') f.push(`versão ${JSON.stringify(sobre?.valor)}`);
  if (sobre.expandido !== 'false' || !sobre.conteudo.hidden) f.push('o Sobre não começa fechado');
  const centro = sobre.chevron[0] + sobre.chevron[2] / 2;
  if (!perto(direita(sobre.caixa) - centro, 24)) f.push(`chevron do Sobre a ${direita(sobre.caixa) - centro} px da borda`);
  // O set_theme do boot (o tema nativo nos temas claros, 4.6) não conta.
  const gravacoes = m.comandos.filter((c) => /^(settings_set|app_quit)/.test(c));
  if (gravacoes.length) f.push(`abrir gravou ${JSON.stringify(gravacoes)}`);
  return f;
}

async function main() {
  const argv = process.argv.slice(2);
  let capturas = null;
  let temas = ['lite', 'suave', 'light', 'dark'];
  for (let i = 0; i < argv.length; i += 2) {
    if (argv[i] === '--capturas' && argv[i + 1]) {
      capturas = resolve(argv[i + 1]);
      mkdirSync(capturas, { recursive: true });
    } else if (argv[i] === '--temas' && argv[i + 1]) temas = argv[i + 1].split(',');
    else throw new Error('uso: sistema.mjs [--temas lite,dark] [--capturas pasta]');
  }
  let falhou = false;
  let n = 0;
  const relatar = (rotulo, f) => {
    n++;
    if (f.length) falhou = true;
    console.log(`${f.length ? 'FALHA' : 'ok   '} ${rotulo}${f.length ? `\n        ${f.join('\n        ')}` : ''}`);
  };
  const esperadas = ['inicial', 'hover-sobre', 'sobre-aberto', 'tempo-ligado', 'tempo-espaco', 'fechar-desligado', 'recusado', 'de-fora', 'sair', 'estreito'];
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
    const cores = coresDoTema(tema);
    const S = (rotulo) => porId(M[rotulo].sistema);
    const sobre = (rotulo) => M[rotulo].sobre[0];
    relatar(`${tema}: quatro seções na ordem, o Sistema no desenho do Volume, e o Sobre fechado com "Versão 0.1.0"`, conferirAbertura(M.inicial));
    relatar(`${tema}: os recursos do get_state no platform/recursos.js (Wayland com bandeja)`,
      JSON.stringify(M.inicial.recursos) === '{"bandeja":true,"sempreNaFrente":false,"regiaoDeEntrada":true}' ? [] : [JSON.stringify(M.inicial.recursos)]);
    relatar(`${tema}: sem hover, a descrição e a versão do Sobre em --tt-fg-2 (${cores.fg2}); com hover, em --tt-fg-2-on-ctl (${cores.fg2NoControle})`, [
      ...(rgbParaHex(sobre('inicial').corDaDescricao) === cores.fg2 && rgbParaHex(sobre('inicial').valor.cor) === cores.fg2 ? [] : [`sem hover: ${rgbParaHex(sobre('inicial').corDaDescricao)}, ${rgbParaHex(sobre('inicial').valor.cor)}`]),
      ...(rgbParaHex(sobre('hover-sobre').corDaDescricao) === cores.fg2NoControle && rgbParaHex(sobre('hover-sobre').valor.cor) === cores.fg2NoControle ? [] : [`hover: ${rgbParaHex(sobre('hover-sobre').corDaDescricao)}, ${rgbParaHex(sobre('hover-sobre').valor.cor)}`]),
    ]);
    const aberto = sobre('sobre-aberto');
    relatar(`${tema}: o clique abre o Sobre, com "Ver avisos" desabilitado (M46) e o aviso de marcas`, [
      ...(aberto.expandido === 'true' && !aberto.conteudo.hidden && aberto.conteudo.altura > 0 ? [] : [`não abriu: ${JSON.stringify(aberto.conteudo)}`]),
      ...(aberto.avisos?.desabilitado === true && aberto.avisos.texto === 'Ver avisos' ? [] : [JSON.stringify(aberto.avisos)]),
      ...(aberto.conteudo.texto.includes('Windows e Segoe são marcas da Microsoft. O Tomatito não é afiliado à Microsoft.') ? [] : ['sem o aviso de marcas']),
      ...(M['sobre-aberto'].comandos.length ? [`gravou ${JSON.stringify(M['sobre-aberto'].comandos)}`] : []),
    ]);
    const sw = (rotulo, id) => S(rotulo)[id].interruptor;
    relatar(`${tema}: o clique liga o tempo na bandeja ("Ativado"), gravando só o trayTime`, [
      ...(M['tempo-ligado'].comandos.join() === 'settings_set:{"trayTime":true}' ? [] : [`comandos ${JSON.stringify(M['tempo-ligado'].comandos)}`]),
      ...(sw('tempo-ligado', 'tempo-bandeja').ligado === true && sw('tempo-ligado', 'tempo-bandeja').estado === 'Ativado' && M['tempo-ligado'].salvo.trayTime === true ? [] : [JSON.stringify([sw('tempo-ligado', 'tempo-bandeja'), M['tempo-ligado'].salvo])]),
    ]);
    relatar(`${tema}: o Espaço no switch desliga de novo`, [
      ...(M['tempo-espaco'].comandos.join() === 'settings_set:{"trayTime":false}' && sw('tempo-espaco', 'tempo-bandeja').estado === 'Desativado' ? [] : [JSON.stringify([M['tempo-espaco'].comandos, sw('tempo-espaco', 'tempo-bandeja')])]),
    ]);
    relatar(`${tema}: o clique desliga o fechar para a bandeja, gravando só o closeToTray`, [
      ...(M['fechar-desligado'].comandos.join() === 'settings_set:{"closeToTray":false}' && M['fechar-desligado'].salvo.closeToTray === false ? [] : [JSON.stringify([M['fechar-desligado'].comandos, M['fechar-desligado'].salvo])]),
      ...(sw('fechar-desligado', 'fechar-bandeja').estado === 'Desativado' ? [] : [JSON.stringify(sw('fechar-desligado', 'fechar-bandeja'))]),
    ]);
    relatar(`${tema}: com o settings_set recusado, o switch volta a desligado`, [
      ...(M.recusado.comandos.join() === 'settings_set:recusado' ? [] : [`comandos ${JSON.stringify(M.recusado.comandos)}`]),
      ...(sw('recusado', 'fechar-bandeja').ligado === false && sw('recusado', 'fechar-bandeja').estado === 'Desativado' ? [] : [JSON.stringify(sw('recusado', 'fechar-bandeja'))]),
    ]);
    relatar(`${tema}: uma gravação de fora (só o tt://settings) aparece nos dois switches`, [
      ...(sw('de-fora', 'fechar-bandeja').ligado === true && sw('de-fora', 'tempo-bandeja').ligado === true && sw('de-fora', 'tempo-bandeja').estado === 'Ativado' ? [] : [JSON.stringify([sw('de-fora', 'fechar-bandeja'), sw('de-fora', 'tempo-bandeja')])]),
    ]);
    relatar(`${tema}: "Sair" chama o app_quit`, M.sair.comandos.join() === 'app_quit' ? [] : [JSON.stringify(M.sair.comandos)]);
    relatar(`${tema}: a 480 × 500, nada passa da largura, e o botão "Sair" desce para a coluna do título`, [
      ...(M.estreito.larguras.conteudo <= M.estreito.larguras.rolagem ? [] : [`rolagem horizontal: ${JSON.stringify(M.estreito.larguras)}`]),
      ...(S('estreito').sair.botao.caixa[1] > S('estreito').sair.titulo[1] ? [] : ['o botão ficou na linha do título']),
    ]);
  }
  // Sem o ícone da bandeja: o "Tempo na bandeja" some, o resto fica.
  const r = await rodar('/?pref=lite&plataforma=linux&recursos=#/configuracoes', ['--eval', MEDIR, '--wait', '300', ...medir('inicial')]);
  const m = r.medidas.inicial;
  relatar('sem o recurso da bandeja, só o "Tempo na bandeja" some', !m ? ['sem medida'] : [
    ...(JSON.stringify(m.recursos) === '{"bandeja":false,"sempreNaFrente":false,"regiaoDeEntrada":false}' ? [] : [JSON.stringify(m.recursos)]),
    ...(m.sistema.filter((c) => c.visivel).map((c) => c.id).join() === 'fechar-bandeja,sair' ? [] : [`visíveis: ${m.sistema.filter((c) => c.visivel).map((c) => c.id)}`]),
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
