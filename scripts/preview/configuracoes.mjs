#!/usr/bin/env node
// Conferência da seção "Sessões de foco" das Configurações (M38) no Chrome
// headless, com o mock do Tauri e o ponteiro e o teclado de verdade, sem
// abrir janela. Em cada tema pedido (Lite e Escuro por padrão):
//   1. as medidas da captura do Relógio (clock-focus-sessions-settings.png):
//      título em Title Large, cabeçalhos de 68 px, raio 4, itens de 50 px com
//      o rótulo na coluna do título, o controle e o switch a 44 px da borda
//      direita e o chevron centrado a 24 px dela; tudo fechado ao abrir;
//   2. o hover num cabeçalho leva a descrição daquele cartão (e só dele) ao
//      --tt-fg-2-on-ctl do tema;
//   3. o clique no cabeçalho abre e fecha (aria-expanded e o conteúdo), e o
//      Enter e o Espaço também;
//   4. as listas gravam o F e o B (settings_set só com a chave), o switch
//      grava o som (e o texto vira "Desativado"), o Espaço no switch volta, o
//      "Testar" pede o sound_test daquele som, e o volume pelo teclado grava a
//      cada passo, com o número e o aria-valuetext acompanhando;
//   5. com o settings_set recusado, o switch volta ao valor gravado;
//   6. uma gravação de fora (outra janela: o tt://settings sem resposta para
//      esta tela) aparece nos controles;
//   7. a tela Foco usa o F e o B novos na frase dos intervalos, e voltar às
//      Configurações mostra os cartões abertos e os valores gravados.
// Com --capturas, salva a seção aberta de cada tema.
//
//   node scripts/preview/configuracoes.mjs [--temas lite,dark] [--capturas pasta]
//
// O que o mock não tem (o settings.json, o motor e o som de verdade) fica
// com o roteiro scripts/gnome-aninhado/roteiros/configuracoes.js.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { computar, hex, lerArquivos, lerCor, lerRegras } from '../contrast.mjs';

const AQUI = fileURLToPath(new URL('.', import.meta.url));

const regras = lerArquivos().flatMap(({ origem, texto }) => lerRegras(texto, origem));
/** As cores de texto 2 do tema, pela cascata do contrast.mjs (o mesmo CSS da página). */
export function coresDoTema(tema) {
  const p = computar(regras, [{ tag: 'html', atributos: { 'data-theme': tema, 'data-platform': 'linux' } }]);
  const cor = (n) => hex(lerCor(p.get(n)));
  return { fg2: cor('--tt-fg-2'), fg2NoControle: cor('--tt-fg-2-on-ctl') };
}

// Mede a seção no navegador. Vai como texto para o --eval.
const MEDIR = `window.__ttConfig = (rotulo) => {
  const caixa = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map((v) => Math.round(v * 10) / 10); };
  const secao = document.querySelector('[aria-labelledby="config-sessoes"]');
  const cartoes = secao ? [...secao.querySelectorAll('.tt-config-cartao')].map((c) => {
    const botao = c.querySelector('[data-expansor]');
    const conteudo = c.querySelector('.tt-expansor-conteudo');
    const sw = c.querySelector('fluent-switch');
    const dd = [...c.querySelectorAll('fluent-dropdown')];
    const vol = c.querySelector('input[type=range]');
    return {
      id: c.dataset.cartao, caixa: caixa(c), raio: getComputedStyle(c).borderTopLeftRadius,
      topo: caixa(c.querySelector('.tt-expansor-topo, .tt-config-cabecalho')),
      titulo: caixa(c.querySelector('.tt-config-titulo')),
      corDaDescricao: getComputedStyle(c.querySelector('.tt-config-descricao')).color,
      expandido: botao ? botao.getAttribute('aria-expanded') : null,
      conteudo: conteudo ? { hidden: conteudo.hidden, altura: conteudo.offsetHeight } : null,
      chevron: caixa(c.querySelector('.tt-expansor-chevron')),
      itens: [...c.querySelectorAll('.tt-config-item')].map((i) => ({ caixa: caixa(i), rotulo: caixa(i.querySelector('.tt-config-item-rotulo')), controle: caixa(i.querySelector('fluent-dropdown, button')) })),
      interruptor: sw ? { caixa: caixa(sw), ligado: sw.checked, estado: c.querySelector('[data-estado]').textContent } : null,
      listas: dd.map((d) => ({ chave: d.dataset.config, valor: d.value, texto: d.displayValue ?? null, nome: d.control?.getAttribute('aria-labelledby') ?? null })),
      volume: vol ? { valor: vol.value, texto: c.querySelector('[data-volume-valor]').textContent, valuetext: vol.getAttribute('aria-valuetext'), fracao: vol.style.getPropertyValue('--tt-fracao') } : null,
    };
  }) : [];
  const h1 = document.querySelector('.tt-pagina h1');
  const frase = document.querySelector('[data-frase]');
  const seletor = document.querySelector('[role="spinbutton"]');
  return {
    rotulo, rota: location.hash, h1: h1 && { texto: h1.textContent, fonte: getComputedStyle(h1).fontSize + '/' + getComputedStyle(h1).lineHeight },
    foco: document.activeElement?.dataset?.som ?? document.activeElement?.dataset?.config ?? document.activeElement?.className ?? document.activeElement?.tagName,
    cartoes, frase: frase?.textContent ?? null, minutos: seletor ? Number(seletor.getAttribute('aria-valuenow')) : null,
    comandos: window.__TOMATITO_PREVIEW_COMANDOS__.splice(0),
    salvo: structuredClone(window.__TOMATITO_PREVIEW_CONFIGURACOES__),
  };
}`;

const medir = (rotulo) => ['--eval', `__ttConfig(${JSON.stringify(rotulo)})`];
const cartao = (id) => `[data-cartao="${id}"]`;

function passos(capturas, tema) {
  const p = ['--eval', MEDIR, '--wait', '300', ...medir('inicial')];
  p.push('--hover', `${cartao('periodos')} .tt-expansor-botao`, '--wait', '150', ...medir('hover-periodos'));
  p.push('--hover', `${cartao('som-foco')} .tt-expansor-acao`, '--wait', '150', ...medir('hover-switch'));
  p.push('--click', `${cartao('periodos')} [data-expansor]`, '--wait', '200', ...medir('periodos-aberto'));
  p.push('--click', `${cartao('periodos')} [data-expansor]`, '--wait', '200', ...medir('periodos-fechado'));
  p.push('--key', 'Enter', '--wait', '200', ...medir('periodos-enter'));
  // As listas: abre e escolhe com o mouse.
  p.push('--click', '[data-config="focusMinutes"]', '--wait', '300', '--click', '[data-config="focusMinutes"] fluent-option[value="50"]', '--wait', '300', ...medir('foco-50'));
  p.push('--click', '[data-config="breakMinutes"]', '--wait', '300', '--click', '[data-config="breakMinutes"] fluent-option[value="10"]', '--wait', '300', ...medir('intervalo-10'));
  // O som de fim de foco: o switch pelo mouse e de volta pelo Espaço.
  p.push('--click', `${cartao('som-foco')} fluent-switch`, '--wait', '200', ...medir('som-foco-desligado'));
  p.push('--key', 'Space', '--wait', '200', ...medir('som-foco-espaco'));
  p.push('--click', `${cartao('som-foco')} fluent-switch`, '--wait', '200', ...medir('som-foco-desligado-2'));
  // Abre pelo Espaço no cabeçalho e testa.
  p.push('--click', `${cartao('som-foco')} [data-expansor]`, '--wait', '200', '--click', '[data-testar="focusEnd"]', '--wait', '200', ...medir('testar-foco'));
  p.push('--click', `${cartao('som-intervalo')} [data-expansor]`, '--wait', '200', '--click', '[data-testar="breakEnd"]', '--wait', '200', ...medir('testar-intervalo'));
  // O volume pelo teclado.
  p.push('--eval', `(document.querySelector('.tt-deslizante').focus(), 'ok')`, '--key', 'ArrowLeft', '--key', 'ArrowLeft', '--wait', '200', ...medir('volume-78'));
  p.push('--key', 'Home', '--wait', '200', ...medir('volume-0'));
  if (capturas) p.push('--eval', `(document.querySelector('.tt-rolagem').scrollTop = 0, 'ok')`, '--hover', '.tt-pagina h1', '--wait', '200', '--shot', join(capturas, `m38-configuracoes-${tema}.png`));
  // Recusado: o switch volta.
  p.push('--eval', '(window.__TOMATITO_PREVIEW_RECUSAR_CONFIGURACOES__ = true, "ok")', '--click', `${cartao('som-intervalo')} fluent-switch`, '--wait', '300', ...medir('recusado'));
  p.push('--eval', '(window.__TOMATITO_PREVIEW_RECUSAR_CONFIGURACOES__ = false, "ok")');
  // Gravação de fora: só o tt://settings chega a esta tela.
  p.push(
    '--eval',
    `(window.__TAURI_INTERNALS__.invoke('settings_set', { patch: { breakMinutes: 15, sounds: { breakEnd: false }, volume: 33, focusMinutes: 90 } }), 'ok')`,
    '--wait', '300', ...medir('de-fora'),
  );
  // A tela Foco e a volta.
  p.push('--eval', `(location.hash = '#/foco', 'ok')`, '--wait', '400', ...medir('foco'));
  p.push('--eval', `(location.hash = '#/configuracoes', 'ok')`, '--wait', '400', ...medir('volta'));
  return p;
}

function rodar(tema, capturas) {
  const args = [join(AQUI, 'shot.mjs'), '--size', '1000x700', '--path', `/?pref=${tema}&plataforma=linux#/configuracoes`, ...passos(capturas, tema)];
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
          .filter((l) => l.startsWith('__ttConfig('))
          .map((l) => JSON.parse(l.slice(l.indexOf(' => ') + 4)))
          .map((m) => [m.rotulo, m]),
      );
      res({ codigo, medidas, erros: erros.split('\n').filter((l) => l && !/^\[console\.(log|info|debug)\]/.test(l)), saida });
    });
  });
}

const perto = (a, b, tol = 1) => Math.abs(a - b) <= tol;
const direita = (c) => c[0] + c[2];
const rgbParaHex = (s) => hex(lerCor(s));
const porId = (m) => Object.fromEntries(m.cartoes.map((c) => [c.id, c]));

/** Confere as medidas da abertura; devolve as falhas. */
export function conferirMedidas(m) {
  const f = [];
  if (m.h1?.fonte !== '40px/52px') f.push(`título em ${m.h1?.fonte}, esperado Title Large (40px/52px)`);
  const ids = m.cartoes.map((c) => c.id).join();
  if (ids !== 'periodos,som-foco,som-intervalo,volume') f.push(`cartões ${ids}`);
  for (const c of m.cartoes) {
    if (c.raio !== '4px') f.push(`${c.id}: raio ${c.raio}`);
    if (!perto(c.topo[3], 68)) f.push(`${c.id}: cabeçalho de ${c.topo[3]} px`);
    if (c.id !== 'volume') {
      if (c.expandido !== 'false' || !c.conteudo.hidden || c.conteudo.altura !== 0) f.push(`${c.id}: não começa fechado (${c.expandido}, ${JSON.stringify(c.conteudo)})`);
      const centro = c.chevron[0] + c.chevron[2] / 2;
      if (!perto(direita(c.caixa) - centro, 24)) f.push(`${c.id}: chevron centrado a ${direita(c.caixa) - centro} px da borda`);
    }
    if (c.interruptor && !perto(direita(c.caixa) - direita(c.interruptor.caixa), 44)) f.push(`${c.id}: switch a ${direita(c.caixa) - direita(c.interruptor.caixa)} px da borda`);
    // O título a 58 px da borda de dentro (1 px de borda + 18 + 20 + 20).
    if (!perto(c.titulo[0] - c.caixa[0], 59)) f.push(`${c.id}: título a ${c.titulo[0] - c.caixa[0]} px da borda`);
  }
  // Entre os cartões, 4 px.
  for (let i = 1; i < m.cartoes.length; i++) {
    const a = m.cartoes[i - 1].caixa;
    const b = m.cartoes[i].caixa;
    if (!perto(b[1] - (a[1] + a[3]), 4)) f.push(`entre ${m.cartoes[i - 1].id} e ${m.cartoes[i].id}: ${b[1] - (a[1] + a[3])} px`);
  }
  return f;
}

/** Confere os itens de um cartão aberto: 50 px, rótulo na coluna do título, controle a 44 px. */
export function conferirItens(c, n) {
  const f = [];
  if (c.expandido !== 'true' || c.conteudo.hidden || c.conteudo.altura <= 0) f.push(`${c.id}: não abriu (${c.expandido}, ${JSON.stringify(c.conteudo)})`);
  if (c.itens.length !== n) f.push(`${c.id}: ${c.itens.length} itens`);
  for (const [i, it] of c.itens.entries()) {
    if (!perto(it.caixa[3], i === 0 ? 50 : 51)) f.push(`${c.id}, item ${i}: ${it.caixa[3]} px de altura`);
    if (!perto(it.rotulo[0], c.titulo[0])) f.push(`${c.id}, item ${i}: rótulo em x = ${it.rotulo[0]}, título em ${c.titulo[0]}`);
    if (!perto(direita(c.caixa) - direita(it.controle), 44)) f.push(`${c.id}, item ${i}: controle a ${direita(c.caixa) - direita(it.controle)} px da borda`);
  }
  return f;
}

async function main() {
  const argv = process.argv.slice(2);
  let capturas = null;
  let temas = ['lite', 'dark'];
  for (let i = 0; i < argv.length; i += 2) {
    if (argv[i] === '--capturas' && argv[i + 1]) {
      capturas = resolve(argv[i + 1]);
      mkdirSync(capturas, { recursive: true });
    } else if (argv[i] === '--temas' && argv[i + 1]) temas = argv[i + 1].split(',');
    else throw new Error('uso: configuracoes.mjs [--temas lite,dark] [--capturas pasta]');
  }
  let falhou = false;
  let n = 0;
  const relatar = (rotulo, f) => {
    n++;
    if (f.length) falhou = true;
    console.log(`${f.length ? 'FALHA' : 'ok   '} ${rotulo}${f.length ? `\n        ${f.join('\n        ')}` : ''}`);
  };
  for (const tema of temas) {
    const r = await rodar(tema, capturas);
    const M = r.medidas;
    const esperadas = ['inicial', 'hover-periodos', 'hover-switch', 'periodos-aberto', 'periodos-fechado', 'periodos-enter', 'foco-50', 'intervalo-10',
      'som-foco-desligado', 'som-foco-espaco', 'som-foco-desligado-2', 'testar-foco', 'testar-intervalo', 'volume-78', 'volume-0', 'recusado', 'de-fora', 'foco', 'volta'];
    const faltam = esperadas.filter((e) => !M[e]);
    if (r.codigo !== 0 || faltam.length) {
      falhou = true;
      console.log(`FALHA ${tema}: o Chrome saiu com ${r.codigo}; faltam ${faltam.join(', ')}`);
      for (const l of r.erros.slice(0, 20)) console.log(`  ${l}`);
      continue;
    }
    const cores = coresDoTema(tema);
    const C = (rotulo) => porId(M[rotulo]);
    relatar(`${tema}: Title Large, quatro cartões fechados, 68 px, raio 4, 4 px entre eles, switch e chevron nas colunas da captura`, conferirMedidas(M.inicial));
    relatar(`${tema}: sem hover, as descrições em --tt-fg-2 (${cores.fg2})`, M.inicial.cartoes.map((c) => rgbParaHex(c.corDaDescricao)).filter((h) => h !== cores.fg2));
    relatar(`${tema}: hover no cabeçalho dos períodos leva só a descrição dele ao --tt-fg-2-on-ctl (${cores.fg2NoControle})`, [
      ...(rgbParaHex(C('hover-periodos').periodos.corDaDescricao) === cores.fg2NoControle ? [] : [`periodos: ${rgbParaHex(C('hover-periodos').periodos.corDaDescricao)}`]),
      ...M['hover-periodos'].cartoes.filter((c) => c.id !== 'periodos' && rgbParaHex(c.corDaDescricao) !== cores.fg2).map((c) => `${c.id}: ${rgbParaHex(c.corDaDescricao)}`),
    ]);
    relatar(`${tema}: hover em cima do switch conta como hover do cabeçalho`, rgbParaHex(C('hover-switch')['som-foco'].corDaDescricao) === cores.fg2NoControle ? [] : [rgbParaHex(C('hover-switch')['som-foco'].corDaDescricao)]);
    relatar(`${tema}: o clique abre os períodos, com os dois itens de 50 px alinhados à captura, e as listas com nome`, [
      ...conferirItens(C('periodos-aberto').periodos, 2),
      ...C('periodos-aberto').periodos.listas.filter((l, i) => l.nome !== ['config-foco-rotulo', 'config-intervalo-rotulo'][i]).map((l) => `lista ${l.chave} com nome ${l.nome}`),
      ...(JSON.stringify(C('periodos-aberto').periodos.listas.map((l) => [l.valor, l.texto])) === '[["25","25 minutos"],["5","5 minutos"]]' ? [] : [`listas ${JSON.stringify(C('periodos-aberto').periodos.listas)}`]),
    ]);
    relatar(`${tema}: o segundo clique fecha, e o Enter (o foco fica no cabeçalho) abre de novo`, [
      ...(C('periodos-fechado').periodos.expandido === 'false' && C('periodos-fechado').periodos.conteudo.hidden ? [] : ['não fechou']),
      ...(C('periodos-enter').periodos.expandido === 'true' && !C('periodos-enter').periodos.conteudo.hidden ? [] : ['o Enter não abriu']),
      ...(M['periodos-fechado'].comandos.length + M['periodos-aberto'].comandos.length === 0 ? [] : ['abrir e fechar gravaram algo']),
    ]);
    const lista = (rotulo, chave) => C(rotulo).periodos.listas.find((l) => l.chave === chave);
    relatar(`${tema}: escolher 50 min no período de foco grava só o focusMinutes`, [
      ...(M['foco-50'].comandos.join() === 'settings_set:{"focusMinutes":50}' ? [] : [`comandos ${JSON.stringify(M['foco-50'].comandos)}`]),
      ...(lista('foco-50', 'focusMinutes').valor === '50' && M['foco-50'].salvo.focusMinutes === 50 ? [] : [`lista ${JSON.stringify(lista('foco-50', 'focusMinutes'))}, salvo ${M['foco-50'].salvo.focusMinutes}`]),
    ]);
    relatar(`${tema}: escolher 10 min no intervalo grava só o breakMinutes`, [
      ...(M['intervalo-10'].comandos.join() === 'settings_set:{"breakMinutes":10}' ? [] : [`comandos ${JSON.stringify(M['intervalo-10'].comandos)}`]),
      ...(M['intervalo-10'].salvo.breakMinutes === 10 ? [] : [`salvo ${M['intervalo-10'].salvo.breakMinutes}`]),
    ]);
    const sw = (rotulo, id = 'som-foco') => C(rotulo)[id].interruptor;
    relatar(`${tema}: o switch desliga o som de fim de foco ("Desativado"), gravando só sounds.focusEnd`, [
      ...(M['som-foco-desligado'].comandos.join() === 'settings_set:{"sounds":{"focusEnd":false}}' ? [] : [`comandos ${JSON.stringify(M['som-foco-desligado'].comandos)}`]),
      ...(sw('som-foco-desligado').ligado === false && sw('som-foco-desligado').estado === 'Desativado' ? [] : [JSON.stringify(sw('som-foco-desligado'))]),
      ...(M['som-foco-desligado'].salvo.sounds.focusEnd === false && M['som-foco-desligado'].salvo.sounds.breakEnd === true ? [] : [JSON.stringify(M['som-foco-desligado'].salvo.sounds)]),
      ...(C('som-foco-desligado')['som-foco'].expandido === 'false' ? [] : ['o clique no switch abriu o cartão']),
    ]);
    relatar(`${tema}: o Espaço no switch liga de novo ("Ativado")`, [
      ...(M['som-foco-espaco'].comandos.join() === 'settings_set:{"sounds":{"focusEnd":true}}' ? [] : [`comandos ${JSON.stringify(M['som-foco-espaco'].comandos)}`]),
      ...(sw('som-foco-espaco').ligado === true && sw('som-foco-espaco').estado === 'Ativado' ? [] : [JSON.stringify(sw('som-foco-espaco'))]),
    ]);
    relatar(`${tema}: "Testar" toca cada som (mesmo com o de fim de foco desligado), sem gravar nada`, [
      ...(M['testar-foco'].comandos.join() === 'sound_test:focusEnd' ? [] : [`foco: ${JSON.stringify(M['testar-foco'].comandos)}`]),
      ...(M['testar-intervalo'].comandos.join() === 'sound_test:breakEnd' ? [] : [`intervalo: ${JSON.stringify(M['testar-intervalo'].comandos)}`]),
      ...conferirItens(C('testar-intervalo')['som-intervalo'], 1),
    ]);
    const vol = (rotulo) => C(rotulo).volume.volume;
    relatar(`${tema}: duas setas para a esquerda no volume gravam 79 e 78, com o número e o aria-valuetext`, [
      ...(M['volume-78'].comandos.join(' ') === 'settings_set:{"volume":79} settings_set:{"volume":78}' ? [] : [`comandos ${JSON.stringify(M['volume-78'].comandos)}`]),
      ...(JSON.stringify(vol('volume-78')) === '{"valor":"78","texto":"78","valuetext":"78%","fracao":"0.78"}' ? [] : [JSON.stringify(vol('volume-78'))]),
      ...(M['volume-78'].salvo.volume === 78 ? [] : [`salvo ${M['volume-78'].salvo.volume}`]),
    ]);
    relatar(`${tema}: Home leva o volume a 0`, [
      ...(M['volume-0'].comandos.join() === 'settings_set:{"volume":0}' && vol('volume-0').texto === '0' ? [] : [JSON.stringify([M['volume-0'].comandos, vol('volume-0')])]),
    ]);
    relatar(`${tema}: com o settings_set recusado, o switch volta a ligado`, [
      ...(M.recusado.comandos.join() === 'settings_set:recusado' ? [] : [`comandos ${JSON.stringify(M.recusado.comandos)}`]),
      ...(sw('recusado', 'som-intervalo').ligado === true && sw('recusado', 'som-intervalo').estado === 'Ativado' ? [] : [JSON.stringify(sw('recusado', 'som-intervalo'))]),
    ]);
    const fora = C('de-fora');
    relatar(`${tema}: uma gravação de fora (só o tt://settings) aparece nas listas, no switch e no volume, e um F fora da lista entra nela`, [
      ...(JSON.stringify(fora.periodos.listas.map((l) => l.valor)) === '["90","15"]' ? [] : [`listas ${JSON.stringify(fora.periodos.listas)}`]),
      ...(fora['som-intervalo'].interruptor.ligado === false && fora['som-intervalo'].interruptor.estado === 'Desativado' ? [] : [JSON.stringify(fora['som-intervalo'].interruptor)]),
      ...(fora.volume.volume.valor === '33' && fora.volume.volume.texto === '33' ? [] : [JSON.stringify(fora.volume.volume)]),
    ]);
    const esperado = (t) => { const n = Math.floor((t - 1) / (90 + 15)); return n === 0 ? 'Sem intervalos.' : `Você terá ${n} ${n === 1 ? 'intervalo' : 'intervalos'}.`; };
    relatar(`${tema}: a tela Foco usa o F e o B novos na frase dos intervalos`, M.foco.frase === esperado(M.foco.minutos) ? [] : [`${M.foco.minutos} min: "${M.foco.frase}", esperado "${esperado(M.foco.minutos)}"`]);
    const volta = C('volta');
    relatar(`${tema}: de volta às Configurações, os cartões abertos continuam abertos, e os valores são os gravados`, [
      ...(['periodos', 'som-foco', 'som-intervalo'].every((id) => volta[id].expandido === 'true') ? [] : ['algum cartão fechou']),
      ...(JSON.stringify(volta.periodos.listas.map((l) => l.valor)) === '["90","15"]' ? [] : [JSON.stringify(volta.periodos.listas)]),
      ...(volta['som-foco'].interruptor.ligado === false && volta['som-intervalo'].interruptor.ligado === false ? [] : ['switches']),
      ...(volta.volume.volume.valor === '33' ? [] : [JSON.stringify(volta.volume.volume)]),
    ]);
  }
  console.log(falhou ? `\nFALHOU (${n} conferências)` : `\nTudo ok (${n} conferências).`);
  process.exitCode = falhou ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err.message ?? err);
    process.exit(1);
  });
}
