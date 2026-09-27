#!/usr/bin/env node
// Conferência dos controles Fluent do M12 nos dois motores, sem abrir janela:
// o Chrome headless (o Chromium do WebView2 no Windows) e o WebKitGTK fora da
// tela (o motor do app no Linux). Usa o shot.mjs e o webkit-shot.mjs com as
// medidas __ttPosicionar, __ttAbrir, __ttMedirPopover, __ttRolarAberto,
// __ttFecharPopovers, __ttCaixas e __ttSabotarAncoras de
// scripts/preview/medidas.js.
//
//   node scripts/preview/controles.mjs [--motor chrome|webkit|todos] [--capturas pasta]
//
// No #/dev, no Lite, abre cada controle pelo JS e confere onde ele abriu:
//   - os dois menus, cada um embaixo do próprio botão e alinhado à esquerda
//     dele (o fluent-menu usa o mesmo nome de âncora em todas as instâncias);
//     com o botão colado na borda de baixo, o menu vira para cima; rolando a
//     tela com o menu aberto, ele acompanha o botão; o foco vai ao 1º item;
//   - as listas suspensas, embaixo da caixa, alinhadas à esquerda e pelo menos
//     da largura dela; a lista longa, perto da borda de baixo, vira para cima
//     e cabe na janela;
//   - as dicas, centradas em cima do botão (ou embaixo, com positioning="below"),
//     a 4 px dele;
//   - o diálogo, modal, centrado na janela e com o fundo --tt-smoke; a lista
//     suspensa de dentro dele abre embaixo da caixa;
//   - tudo dentro da janela, com o fundo do cartão e a borda --tt-border, e
//     o texto dos itens em --tt-fg-1; fechar deixa zero popovers abertos.
// Depois, as caixas de seleção nos quatro temas normais: marcada no accent do
// tema (no Lite, creme), e nunca azul; o hover e o clique da borda marcada
// vindo da ponte (--tt-accent-hover e --tt-accent-pressed). No Chrome, também o
// hover e o clique de verdade, com o mouse.
// Por fim, o controle negativo: com as âncoras sabotadas, as mesmas
// conferências de posição do menu e do dropdown precisam falhar.
// Sai com 1 se alguma conferência falhar.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AQUI = fileURLToPath(new URL('.', import.meta.url));
const NOMES = { chrome: 'Chrome headless', webkit: 'WebKitGTK fora da tela' };

// Cores do Lite (tokens.css) e das caixas marcadas em cada tema.
const LITE = { card: 'rgb(175, 65, 53)', borda: 'rgb(189, 99, 89)', fg1: 'rgb(255, 248, 246)', smoke: 'rgba(0, 0, 0, 0.3)' };
const ACCENT = { lite: 'rgb(255, 244, 238)', suave: 'rgb(184, 64, 45)', light: 'rgb(184, 64, 45)', dark: 'rgb(221, 99, 75)' };
const TEMAS = Object.keys(ACCENT);

/** "rgb(r, g, b)" ou "rgba(...)" → [r, g, b]. */
const canais = (cor) => (cor.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
/** Azul: matiz entre 190° e 250°, com saturação de verdade (o brand do Fluent é #0f6cbd, #479ef5...). */
export function azul(cor) {
  const [r, g, b] = canais(cor).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d < 0.1) return false;
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return h >= 190 && h <= 250;
}

const perto = (v, alvo, folga = 1) => typeof v === 'number' && Math.abs(v - alvo) <= folga;

/**
 * Confere uma medida do __ttMedirPopover. `lado` é onde o controle deve abrir;
 * `vao`, a distância esperada até o gatilho; `alinhar`, 'esquerda' (menus e
 * listas) ou 'centro' (dicas). Devolve as falhas.
 */
export function conferirPopover(m, { lado, vao = 0, alinhar = 'esquerda', foco, cores = true }) {
  const f = [];
  if (!m?.aberto) return ['não abriu'];
  if (m.lado !== lado) f.push(`abriu ${m.lado}, esperado ${lado}`);
  if (!perto(m.vao, vao)) f.push(`vão de ${m.vao} px até o gatilho, esperado ${vao}`);
  if (alinhar === 'esquerda' && !perto(m.esquerda, 0)) f.push(`borda esquerda desviada ${m.esquerda} px do gatilho`);
  if (alinhar === 'centro' && !perto(m.centro, 0)) f.push(`centro desviado ${m.centro} px do gatilho`);
  if (!m.dentro) f.push(`fora da janela: ${JSON.stringify(m.popup)} em ${JSON.stringify(m.janela)}`);
  if (foco && !m.foco.includes(foco)) f.push(`foco em ${m.foco}, esperado ${foco}`);
  if (cores) {
    if (m.fundo !== LITE.card) f.push(`fundo ${m.fundo}, esperado o cartão ${LITE.card}`);
    if (m.borda !== LITE.borda) f.push(`borda ${m.borda}, esperado --tt-border ${LITE.borda}`);
    if (m.item && m.item.cor !== LITE.fg1) f.push(`texto dos itens ${m.item.cor}, esperado --tt-fg-1 ${LITE.fg1}`);
  }
  if (m.tipo !== 'dica' && m.expandido !== 'true') f.push(`aria-expanded ${m.expandido}`);
  return f;
}

/** Os casos de posição: [nome, onde, o que se espera]. */
export const CASOS = [
  ['menu-sessao', 'meio', { lado: 'abaixo', foco: 'Encerrar sessão' }],
  ['menu-temporizador', 'meio', { lado: 'abaixo', foco: 'Editar' }],
  ['menu-temporizador', 'baixo', { lado: 'acima', foco: 'Editar' }],
  ['meta', 'meio', { lado: 'abaixo', largura: true }],
  ['zerar', 'baixo', { lado: 'acima', largura: true }],
  ['dica-reiniciar', 'meio', { lado: 'acima', vao: 4, alinhar: 'centro' }],
  ['dica-volta', 'meio', { lado: 'abaixo', vao: 4, alinhar: 'centro' }],
];
// Os que o controle negativo tira do lugar (os de lista; as dicas não usam
// o position-anchor sabotado).
const SABOTADOS = CASOS.filter(([nome]) => !nome.startsWith('dica'));

function lerArgs(argv) {
  const opts = { motor: 'todos', capturas: null };
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i].replace(/^--/, '');
    if (!(k in opts) || argv[i + 1] === undefined) throw new Error('uso: controles.mjs [--motor chrome|webkit|todos] [--capturas pasta]');
    opts[k] = argv[i + 1];
  }
  if (!['chrome', 'webkit', 'todos'].includes(opts.motor)) throw new Error(`motor desconhecido: ${opts.motor}`);
  if (opts.capturas) mkdirSync(resolve(opts.capturas), { recursive: true });
  return opts;
}

// Cada passo que devolve valor é um --eval; o rótulo diz ao conferidor o que
// ele é. Um --eval sempre imprime uma linha "expr => json", na ordem.
function montarPassos(motor, capturas) {
  const passos = [];
  const rotulos = [];
  const avaliar = (rotulo, expr) => {
    passos.push('--eval', expr);
    rotulos.push(rotulo);
  };
  const shot = (nome) => capturas && passos.push('--shot', join(capturas, `${motor}-${nome}.png`));
  for (const [nome, onde] of CASOS) {
    avaliar(null, `__ttPosicionar(${JSON.stringify(nome)}, ${JSON.stringify(onde)})`);
    avaliar(`abrir ${nome} ${onde}`, `__ttAbrir(${JSON.stringify(nome)})`);
    shot(`${nome}-${onde}`);
    if (nome === 'menu-temporizador' && onde === 'baixo') avaliar('rolar menu-temporizador', `__ttRolarAberto('menu-temporizador', 40)`);
    avaliar(`fechar ${nome} ${onde}`, '__ttFecharPopovers()');
  }
  avaliar(null, `__ttPosicionar('dialogo', 'meio')`);
  avaliar('abrir dialogo', `__ttAbrir('dialogo')`);
  avaliar('abrir dialogo-meta', `__ttAbrir('dialogo-meta')`);
  shot('dialogo');
  avaliar('fechar dialogo', '__ttFecharPopovers()');
  for (const tema of TEMAS) {
    avaliar(null, `__ttTema(${JSON.stringify(tema)})`);
    avaliar(`caixas ${tema}`, '__ttCaixas()');
  }
  avaliar(null, `__ttTema('lite')`);
  if (motor === 'chrome') {
    passos.push('--hover', 'fluent-checkbox[checked]:not([disabled])');
    avaliar('caixa hover', `__ttCaixas()[0]`);
    passos.push('--press', 'fluent-checkbox[checked]:not([disabled])');
    avaliar('caixa clique', `__ttCaixas()[0]`);
    passos.push('--click', '.tt-amostra-topo h1');
  }
  avaliar(null, '__ttSabotarAncoras()');
  for (const [nome, onde] of SABOTADOS) {
    avaliar(null, `__ttPosicionar(${JSON.stringify(nome)}, ${JSON.stringify(onde)})`);
    avaliar(`sabotado ${nome} ${onde}`, `__ttAbrir(${JSON.stringify(nome)})`);
    shot(`sabotado-${nome}-${onde}`);
    avaliar(null, '__ttFecharPopovers()');
  }
  return { passos, rotulos };
}

function rodar(motor, capturas) {
  const { passos, rotulos } = montarPassos(motor, capturas);
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
      const medidas = {};
      rotulos.forEach((r, i) => r && (medidas[r] = valores[i]));
      res({ codigo, esperadas: rotulos.length, recebidas: valores.length, medidas, erros: erros.split('\n').filter((l) => l && !/^\[console\.(log|info|debug)\]/.test(l)) });
    });
  });
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
    const r = await rodar(motor, opts.capturas && resolve(opts.capturas));
    console.log(`\n${NOMES[motor]}: ${r.recebidas} medidas`);
    if (r.codigo !== 0 || r.recebidas !== r.esperadas) {
      falhou = true;
      console.log(`FALHA: o ${motor} saiu com ${r.codigo} e ${r.recebidas} de ${r.esperadas} medidas`);
      for (const l of r.erros) console.log(`  ${l}`);
      continue;
    }
    for (const l of r.erros) console.log(`  aviso do ${motor}: ${l}`);
    const M = r.medidas;
    for (const [nome, onde, quer] of CASOS) {
      const m = M[`abrir ${nome} ${onde}`];
      const f = conferirPopover(m, quer);
      if (quer.largura && !(m?.largura?.[1] >= m?.largura?.[0] - 0.5)) f.push(`lista mais estreita que a caixa: ${m?.largura}`);
      const fechados = M[`fechar ${nome} ${onde}`];
      if (fechados !== 0) f.push(`${fechados} popover(s) aberto(s) depois de fechar`);
      linha(!f.length, `${nome} (${onde}): ${m?.lado}, vão ${m?.vao}, ${quer.alinhar === 'centro' ? `centro ${m?.centro}` : `esquerda ${m?.esquerda}`}, ${JSON.stringify(m?.popup)}`, f);
    }
    const rolou = M['rolar menu-temporizador'];
    linha(
      rolou?.moveuAncora === -40 && rolou?.moveuPopup === -40 && rolou?.depois?.aberto,
      `rolando 40 px com o menu aberto, o botão anda ${rolou?.moveuAncora} e o menu ${rolou?.moveuPopup}`,
    );
    const d = M['abrir dialogo'];
    const fd = [];
    if (!d?.aberto || !d.modal) fd.push(`aberto ${d?.aberto}, modal ${d?.modal}`);
    if (!(perto(d?.centro?.[0], 0) && perto(d?.centro?.[1], 0))) fd.push(`fora do centro: ${JSON.stringify(d?.centro)}`);
    if (d?.cortina !== LITE.smoke) fd.push(`fundo atrás ${d?.cortina}, esperado --tt-smoke ${LITE.smoke}`);
    if (d?.fundo !== LITE.card) fd.push(`fundo ${d?.fundo}`);
    if (!d?.dentro) fd.push('fora da janela');
    linha(!fd.length, `diálogo "${d?.titulo}": modal, centro ${JSON.stringify(d?.centro)}, fundo atrás ${d?.cortina}`, fd);
    const dm = M['abrir dialogo-meta'];
    const fdm = conferirPopover(dm, { lado: 'abaixo' });
    if (M['fechar dialogo'] !== 0) fdm.push(`${M['fechar dialogo']} aberto(s) depois de fechar`);
    linha(!fdm.length, `lista suspensa dentro do diálogo: ${dm?.lado}, vão ${dm?.vao}, esquerda ${dm?.esquerda}`, fdm);

    for (const tema of TEMAS) {
      const caixas = M[`caixas ${tema}`] ?? [];
      const marcada = caixas.find((c) => c.marcada && !c.desabilitada);
      const desmarcada = caixas.find((c) => !c.marcada && !c.desabilitada);
      const f = [];
      if (!marcada) f.push('sem caixa marcada');
      else {
        if (marcada.fundo !== ACCENT[tema] || marcada.borda !== ACCENT[tema]) f.push(`marcada ${marcada.fundo} / ${marcada.borda}, esperado ${ACCENT[tema]}`);
        if (azul(marcada.fundo) || azul(marcada.borda)) f.push('marcada azul');
        const t = marcada.tokens;
        if (t.bordaHover !== t.accentHover || t.bordaClique !== t.accentClique) f.push(`borda no hover/clique ${t.bordaHover}/${t.bordaClique}, esperado ${t.accentHover}/${t.accentClique}`);
      }
      if (!desmarcada || desmarcada.fundo === ACCENT[tema]) f.push('desmarcada com o fundo do accent');
      linha(!f.length, `caixa marcada no ${tema}: ${marcada?.fundo} (glifo ${marcada?.glifo}); hover/clique da borda ${marcada?.tokens.bordaHover}/${marcada?.tokens.bordaClique}`, f);
    }
    if (motor === 'chrome') {
      const hv = M['caixa hover'];
      const cl = M['caixa clique'];
      const f = [];
      if (hv?.borda !== 'rgb(253, 232, 224)' || hv?.fundo !== 'rgb(253, 232, 224)') f.push(`hover ${hv?.fundo} / ${hv?.borda}, esperado #FDE8E0`);
      if (cl?.borda !== 'rgb(248, 215, 204)' || cl?.fundo !== 'rgb(248, 215, 204)') f.push(`clique ${cl?.fundo} / ${cl?.borda}, esperado #F8D7CC`);
      linha(!f.length, `caixa marcada no Lite com o mouse: hover ${hv?.borda}, clique ${cl?.borda}`, f);
    }
    const acusadas = SABOTADOS.filter(([nome, onde, quer]) => conferirPopover(M[`sabotado ${nome} ${onde}`], quer).length > 0);
    linha(
      acusadas.length === SABOTADOS.length,
      `controle negativo: com as âncoras sabotadas, ${acusadas.length} de ${SABOTADOS.length} listas acusadas fora do lugar`,
      SABOTADOS.filter((c) => !acusadas.includes(c)).map(([n, o]) => `${n} (${o}) passou mesmo sabotado: ${JSON.stringify(M[`sabotado ${n} ${o}`]?.popup)}`),
    );
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
