#!/usr/bin/env node
// Conferência do M41 (movimento) nos dois motores, sem abrir janela: o Chrome
// headless (o Chromium do WebView2 no Windows) e o WebKitGTK fora da tela (o
// motor do app no Linux). Cada motor roda duas vezes: sem preferência e com
// movimento reduzido. No WebKitGTK, o reduzido é o gtk-enable-animations
// desligado, que é o que o "Animações" do GNOME desliga (o WebKitGTK o repassa
// como prefers-reduced-motion: reduce); no Chrome, a mídia emulada.
//
//   node scripts/preview/movimento.mjs [--motor chrome|webkit|todos]
//
// Usa as medidas __ttGravarMovimento, __ttMovimentoApos, __ttSaidaDoDialogo,
// __ttTransicoes e __ttSabotarMovimento de scripts/preview/medidas.js, que
// anotam cada animação em curso (Web Animations e transições de CSS, também
// nas shadow roots do Fluent) enquanto o roteiro troca de tela, abre e fecha o
// diálogo "Editar meta diária", abre e fecha um expansível das Configurações e
// liga um switch.
//
// Confere, sem preferência:
//   - a entrada de página em cada troca de tela: opacidade de 0 e subida de
//     24 px, em 300 ms, com cubic-bezier(0, 0, 0, 1);
//   - o diálogo: escala de 1,05 para 1 em 250 ms na entrada e de volta em
//     167 ms na saída, com a mesma curva, e a opacidade em 83 ms, linear; no
//     meio da saída, a caixa continua no meio da janela;
//   - o chevron do expansível gira em 250 ms ao abrir e em 167 ms ao fechar;
//   - hover e pressionado: a transição calculada dos controles é de 83 ms,
//     linear (e, no Chrome, com o ponteiro de verdade, a transição anotada);
// com movimento reduzido:
//   - a mídia responde reduce;
//   - nada anotado passa de 83 ms nem mexe em posição, escala ou giro (só
//     opacidade e cores): a página e o diálogo só com o fade de 83 ms, e o
//     chevron e o switch sem animação;
//   - controle negativo (Chrome): com o giro do chevron devolvido à força, a
//     conferência acusa.
// Sai com 1 se alguma conferência falhar.
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = fileURLToPath(new URL('.', import.meta.url));
const NOMES = { chrome: 'Chrome headless', webkit: 'WebKitGTK fora da tela' };
// No Escuro: no Lite, o pressionado do item do painel tem a cor do hover
// (--tt-subtle-press = --tt-subtle-hover), e não haveria o que transicionar.
const CAMINHO = '/?plataforma=linux&pref=dark#/foco';
const DECEL = 'cubic-bezier(0, 0, 0, 1)';
// Propriedades que podem mudar com movimento reduzido: opacidade, cores e o
// avanço do anel (M27, que também cai para 83 ms). display e overlay são as
// transições discretas do diálogo (a caixa fica na tela até o fade acabar).
const SEM_MOVIMENTO = new Set(['opacity', 'background-color', 'color', 'border-color', 'box-shadow', '--tt-camada', 'stroke-dashoffset', 'display', 'overlay']);

function lerArgs(argv) {
  const opts = { motor: 'todos' };
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i].replace(/^--/, '');
    if (!(k in opts) || argv[i + 1] === undefined) throw new Error('uso: movimento.mjs [--motor chrome|webkit|todos]');
    opts[k] = argv[i + 1];
  }
  if (!['chrome', 'webkit', 'todos'].includes(opts.motor)) throw new Error(`motor desconhecido: ${opts.motor}`);
  return opts;
}

/** Roda o shot.mjs ou o webkit-shot.mjs e devolve o valor de cada --eval, na ordem. */
function rodar(motor, passos, { reduzido }) {
  const script = join(AQUI, motor === 'webkit' ? 'webkit-shot.mjs' : 'shot.mjs');
  const args = [script, '--size', '1000x700', ...(reduzido ? ['--motion', 'reduce'] : []), '--path', CAMINHO, ...passos];
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
        .filter((l) => l.startsWith('__tt') && l.includes(' => '))
        .map((l) => JSON.parse(l.slice(l.indexOf(' => ') + 4)));
      res({ codigo, valores, erros });
    });
  });
}

const PASSOS = [
  '--wait', '800',
  '--eval', '__ttGravarMovimento()',
  '--eval', "__ttMovimentoApos('#/temporizador')",
  '--eval', "__ttMovimentoApos('#/cronometro')",
  '--eval', "__ttMovimentoApos('#/foco')",
  '--eval', "__ttMovimentoApos('.tt-progresso-editar')",
  '--eval', '__ttSaidaDoDialogo()',
  '--eval', "__ttMovimentoApos('#/configuracoes')",
  '--eval', "__ttMovimentoApos('.tt-expansor-botao')",
  '--eval', "__ttMovimentoApos('.tt-expansor-botao')",
  '--eval', "__ttMovimentoApos('fluent-switch')",
  '--eval', '__ttTransicoes()',
];
// No Chrome, o hover e o pressionado com o ponteiro de verdade.
const PASSOS_PONTEIRO = [
  '--eval', '__ttColherMovimento()',
  '--hover', '.tt-nav-item[data-rota="foco"]',
  '--wait', '250',
  '--eval', '__ttColherMovimento()',
  '--press', '.tt-nav-item[data-rota="foco"]',
  '--wait', '250',
  '--eval', '__ttColherMovimento()',
];

const resultados = [];
let calado = false;
const checar = (motor, nome, ok, detalhe) => {
  resultados.push({ motor, nome, ok: Boolean(ok), detalhe });
  if (!calado) console.log(`${ok ? 'ok   ' : 'FALHA'} [${motor}] ${nome}${ok || detalhe === undefined ? '' : ` — ${JSON.stringify(detalhe)}`}`);
};

const daPagina = (lista) => lista.filter((a) => a.alvo.startsWith('div.tt-pagina'));
const doDialogo = (lista, prop) => lista.filter((a) => a.alvo.startsWith('fluent-dialog>dialog') && a.props.includes(prop));
const doChevron = (lista) => lista.filter((a) => a.alvo.startsWith('svg.tt-icone'));
const TRANSICOES_83 = ['.tt-nav-item', 'button.tt-caption-btn', 'button.tt-accent', 'button.tt-sutil', '.tt-texto', '.tt-tarefa', 'fluent-option', 'fluent-menu-item', '.tt-previa-moldura'];
const trans83 = (t) => TRANSICOES_83.filter((sel) => !(t[sel] && t[sel].dur === '0.083s' && t[sel].curva === 'linear'));

function conferirNormal(motor, v) {
  const [grav, temp, cron, foco, dlgEntra, dlgSai, config, abre, fecha, sw, trans] = v;
  checar(motor, 'sem preferência: a mídia não pede menos movimento', grav?.reduzido === false, grav);
  for (const [nome, lista] of [['Temporizador', temp], ['Cronômetro', cron], ['Foco', foco], ['Configurações', config]]) {
    const p = daPagina(lista ?? []);
    checar(motor, `entrada de página (${nome}): fade com subida de 24 px, 300 ms, ${DECEL}`,
      p.length === 1 && p[0].props.includes('opacity') && p[0].props.includes('transform') && p[0].duracao === 300 &&
        p[0].curva === DECEL && p[0].de.opacity === '0' && /translateY\(24px\)/.test(p[0].de.transform ?? ''), p);
  }
  const escE = doDialogo(dlgEntra ?? [], 'scale');
  const opE = doDialogo(dlgEntra ?? [], 'opacity');
  checar(motor, 'diálogo, entrada: escala de 1,05 para 1 em 250 ms, com a desaceleração',
    escE.length === 1 && escE[0].duracao === 250 && escE[0].curva === DECEL && escE[0].de.scale === '1.05', escE);
  checar(motor, 'diálogo, entrada: opacidade (caixa e fundo) em 83 ms, linear',
    opE.length >= 1 && opE.every((a) => a.duracao === 83 && a.curva === 'linear' && a.de.opacity === '0'), opE);
  const escS = doDialogo(dlgSai?.animacoes ?? [], 'scale');
  const opS = doDialogo(dlgSai?.animacoes ?? [], 'opacity');
  checar(motor, 'diálogo, saída: de volta a 1,05 em 167 ms, com a desaceleração',
    escS.length === 1 && escS[0].duracao === 167 && escS[0].curva === DECEL && escS[0].de.scale === '1', escS);
  checar(motor, 'diálogo, saída: opacidade em 83 ms, linear', opS.length >= 1 && opS.every((a) => a.duracao === 83 && a.curva === 'linear'), opS);
  checar(motor, 'diálogo, saída: no meio dela, a caixa continua no meio da janela, e no fim some',
    dlgSai?.meio?.display === 'block' && Math.abs(dlgSai.meio.dx) <= 1 && Math.abs(dlgSai.meio.dy) <= 1 && dlgSai.fim === 'none', dlgSai?.meio);
  const ca = doChevron(abre ?? []);
  const cf = doChevron(fecha ?? []);
  checar(motor, 'chevron do expansível: gira em 250 ms ao abrir e em 167 ms ao fechar',
    ca.length === 1 && ca[0].duracao === 250 && ca[0].curva === DECEL && cf.length === 1 && cf[0].duracao === 167 && cf[0].curva === DECEL, { ca, cf });
  checar(motor, 'o switch desliza (o do Fluent, fora do M41)', (sw ?? []).some((a) => a.props.includes('margin-left') && a.duracao > 0), sw);
  checar(motor, 'hover e pressionado: transição calculada de 83 ms, linear, nos controles', trans && trans83(trans).length === 0, trans && trans83(trans).map((s) => [s, trans[s]]));
  return v.slice(11);
}

function conferirReduzido(motor, v, { rotulo = 'movimento reduzido' } = {}) {
  const [grav, temp, cron, foco, dlgEntra, dlgSai, config, abre, fecha, sw, trans] = v;
  checar(motor, `${rotulo}: a mídia pede menos movimento`, grav?.reduzido === true, grav);
  const todas = [temp, cron, foco, dlgEntra, dlgSai?.animacoes, config, abre, fecha, sw].flatMap((l) => l ?? []);
  const ruins = todas.filter((a) => a.duracao > 83 || a.props.some((p) => !SEM_MOVIMENTO.has(p)));
  checar(motor, `${rotulo}: nada passa de 83 ms nem mexe em posição, escala ou giro (${todas.length} animações)`, todas.length > 0 && ruins.length === 0, ruins);
  for (const [nome, lista] of [['Temporizador', temp], ['Cronômetro', cron], ['Foco', foco], ['Configurações', config]]) {
    const p = daPagina(lista ?? []);
    checar(motor, `${rotulo}: entrada de página (${nome}) só com o fade de 83 ms, linear`,
      p.length === 1 && p[0].props.join() === 'opacity' && p[0].duracao === 83 && p[0].curva === 'linear', p);
  }
  checar(motor, `${rotulo}: diálogo sem escala, com o fade de 83 ms na entrada e na saída`,
    doDialogo(dlgEntra ?? [], 'scale').length === 0 && doDialogo(dlgSai?.animacoes ?? [], 'scale').length === 0 &&
      doDialogo(dlgEntra ?? [], 'opacity').length >= 1 && doDialogo(dlgSai?.animacoes ?? [], 'opacity').length >= 1 &&
      dlgSai?.fim === 'none', { dlgEntra, saida: dlgSai?.animacoes });
  checar(motor, `${rotulo}: chevron e switch mudam de uma vez`, doChevron(abre ?? []).length === 0 && doChevron(fecha ?? []).length === 0 && (sw ?? []).length === 0, { abre, fecha, sw });
  checar(motor, `${rotulo}: hover e pressionado continuam em 83 ms, linear, e o chevron sem transição`,
    trans && trans83(trans).length === 0 && trans['.tt-expansor-chevron .tt-icone']?.dur === '0s', trans);
  return v.slice(11);
}

function conferirPonteiro(motor, resto, { reduzido }) {
  const [, hover, press] = resto;
  const doItem = (l) => (l ?? []).filter((a) => a.alvo.startsWith('a.tt-nav-item') && a.props.includes('background-color'));
  const rot = reduzido ? 'movimento reduzido: ' : '';
  checar(motor, `${rot}hover no item do painel (ponteiro de verdade): fundo em 83 ms, linear`,
    doItem(hover).length >= 1 && doItem(hover).every((a) => a.duracao === 83 && a.curva === 'linear'), hover);
  checar(motor, `${rot}pressionado no item do painel: fundo em 83 ms, linear`,
    doItem(press).length >= 1 && doItem(press).every((a) => a.duracao === 83 && a.curva === 'linear'), press);
}

const { motor } = lerArgs(process.argv.slice(2));
const motores = motor === 'todos' ? ['chrome', 'webkit'] : [motor];
for (const m of motores) {
  const extra = m === 'chrome' ? PASSOS_PONTEIRO : [];
  console.log(`\n== ${NOMES[m]}: sem preferência`);
  const n = await rodar(m, [...PASSOS, ...extra], { reduzido: false });
  if (n.codigo !== 0) checar(m, 'a prévia roda sem erro', false, n.erros.split('\n').filter((l) => /erro|exceção|Error/.test(l)).slice(0, 5));
  const restoN = conferirNormal(m, n.valores);
  if (m === 'chrome') conferirPonteiro(m, restoN, { reduzido: false });

  console.log(`\n== ${NOMES[m]}: movimento reduzido`);
  const r = await rodar(m, [...PASSOS, ...extra], { reduzido: true });
  if (r.codigo !== 0) checar(m, 'a prévia roda sem erro', false, r.erros.split('\n').filter((l) => /erro|exceção|Error/.test(l)).slice(0, 5));
  const restoR = conferirReduzido(m, r.valores);
  if (m === 'chrome') conferirPonteiro(m, restoR, { reduzido: true });
}

// Controle negativo: com o giro do chevron devolvido à força, o reduzido acusa.
if (motores.includes('chrome')) {
  console.log('\n== Chrome headless: controle negativo (giro do chevron forçado com movimento reduzido)');
  const passos = [...PASSOS];
  passos.splice(passos.indexOf('__ttGravarMovimento()') + 1, 0, '--eval', '__ttSabotarMovimento()');
  const c = await rodar('chrome', passos, { reduzido: true });
  const valores = c.valores.filter((x, i) => i !== 1);   // tira o true do __ttSabotarMovimento()
  const antes = resultados.length;
  calado = true;
  conferirReduzido('controle', valores, { rotulo: 'sabotado' });
  calado = false;
  const acusou = resultados.slice(antes).filter((x) => !x.ok).map((x) => x.nome);
  resultados.splice(antes);
  // Acusam: a varredura geral, o chevron na troca e a transição calculada dele.
  checar('chrome', 'controle negativo: o giro forçado é acusado (e só ele)',
    acusou.length === 3 && acusou.every((n) => /nada passa|chevron/.test(n)), acusou);
}

const falhas = resultados.filter((r) => !r.ok);
console.log(`\n${resultados.length - falhas.length} ok, ${falhas.length} falha(s)`);
process.exit(falhas.length ? 1 : 0);
