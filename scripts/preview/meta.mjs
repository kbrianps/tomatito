#!/usr/bin/env node
// Conferência do M28 (diálogo "Editar meta diária") nos dois motores, sem
// abrir janela: o Chrome headless (o Chromium do WebView2 no Windows) e o
// WebKitGTK fora da tela (o motor do app no Linux). Usa o shot.mjs e o
// webkit-shot.mjs com as medidas __ttMeta* de scripts/preview/medidas.js e o
// settings_set e o stats_get do tauri-mock.js.
//
//   node scripts/preview/meta.mjs [--motor chrome|webkit|todos] [--capturas pasta]
//
// Confere:
//   - o lápis: nome, dica, ícone e o centro a 19 px da borda direita e do topo
//     do cartão (o do Relógio, clock-focus-sessions-page.png), com folga de
//     1,5 px;
//   - o diálogo aberto: modal, com nome, 320 px, raio 8, a sombra de 64, o
//     fundo de trás em --tt-smoke (preto a 30%), o título, os rótulos, as 9
//     metas e as 24 horas, os valores das configurações escolhidos e
//     mostrados, o nome de cada lista, Salvar (destaque) e Cancelar lado a
//     lado e com a mesma largura, e o foco na primeira lista;
//   - Esc fecha sem gravar e o foco volta ao lápis; no Chrome (tecla de
//     verdade), o Esc com a lista aberta fecha só a lista;
//   - Cancelar descarta a escolha: nada gravado, e reabrir mostra os valores
//     de antes;
//   - Salvar grava {dailyGoalMinutes, resetHour} de uma vez, fecha, devolve o
//     foco ao lápis, e o anel muda na hora (a meta nova no centro e o arco na
//     fração nova em cerca de 1 s);
//   - "Desativada" esconde o anel e a meta;
//   - gravação recusada: o diálogo fica aberto, com o aviso (role="alert");
//   - os quatro temas na janela padrão e o estreito (480 × 500 a 150%): o
//     diálogo cabe na janela, com os botões lado a lado;
//   - controle negativo: com os botões no tamanho do texto, a conferência das
//     larguras acusa.
// Sai com 1 se alguma conferência falhar.
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AQUI = fileURLToPath(new URL('.', import.meta.url));
const NOMES = { chrome: 'Chrome headless', webkit: 'WebKitGTK fora da tela' };
// Centro do lápis no Relógio, em px CSS a partir da borda direita e do topo do
// cartão (medido na captura a 175%: o glifo de 2099–2126 × 92–119 px).
const LAPIS_REF = [19.1, 18.6];
const BASE = '/?plataforma=windows&hoje=2700&ontem=5400&semana=9000&zerar=4';
const C = 2 * Math.PI * 94;
const r3 = (n) => Math.round(n * 1000) / 1000;
const METAS = ['Desativada', '30 minutos', '1 hora', '1 hora e 30 minutos', '2 horas', '3 horas', '4 horas', '6 horas', '8 horas'];

function lerArgs(argv) {
  const opts = { motor: 'todos', capturas: null };
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i].replace(/^--/, '');
    if (!(k in opts) || argv[i + 1] === undefined) throw new Error('uso: meta.mjs [--motor chrome|webkit|todos] [--capturas pasta]');
    opts[k] = argv[i + 1];
  }
  if (!['chrome', 'webkit', 'todos'].includes(opts.motor)) throw new Error(`motor desconhecido: ${opts.motor}`);
  if (opts.capturas) mkdirSync(resolve(opts.capturas), { recursive: true });
  return opts;
}

/** Roda o shot.mjs ou o webkit-shot.mjs e devolve os valores dos --eval de __tt*, na ordem. */
function rodar(motor, caminho, passos, { tamanho = '1372x936' } = {}) {
  const script = join(AQUI, motor === 'webkit' ? 'webkit-shot.mjs' : 'shot.mjs');
  const args = [script, '--size', tamanho, '--path', caminho, ...passos];
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
        .filter((l) => l.includes(' => ') && l.startsWith('__tt'))
        .map((l) => JSON.parse(l.slice(l.indexOf(' => ') + 4)));
      res({ codigo, valores, erros: erros.split('\n').filter((l) => l && !/^\[console\.(log|info|debug)\]/.test(l)) });
    });
  });
}

/** As conferências do diálogo aberto; devolve a lista de falhas. */
export function conferirAberto(m, { valores = ['120', '4'], mostrados = ['2 horas', '04:00'] } = {}) {
  const f = [];
  const quer = (nome, v, esperado) => JSON.stringify(v) !== JSON.stringify(esperado) && f.push(`${nome}: ${JSON.stringify(v)}, esperado ${JSON.stringify(esperado)}`);
  const d = m?.dialogo;
  if (!m?.aberto || !d) return ['o diálogo não abriu'];
  quer('nome', d.nome, 'Editar meta diária');
  quer('modal', d.modal, 'true');
  quer('largura', d.caixa[2], Math.min(320, d.janela[0] - 32));
  quer('raio', d.raio, '8px');
  if (!/0px 32px 64px/.test(d.sombra)) f.push(`sombra: ${d.sombra} (esperado a de 64)`);
  quer('fundo de trás', d.fundoDeTras, 'rgba(0, 0, 0, 0.3)');
  quer('título', [d.titulo, d.tamanhoDoTitulo], ['Editar meta diária', '20px']);
  quer('rótulos', d.rotulos, ['Meta diária', 'Zerar progresso às']);
  quer('metas', d.opcoes[0], METAS);
  quer('horas', [d.opcoes[1]?.length, d.opcoes[1]?.[0], d.opcoes[1]?.[23]], [24, '00:00', '23:00']);
  quer('valores', d.valores, valores);
  quer('mostrados', d.mostrados, mostrados);
  quer('nomes das listas', d.nomes, ['Meta diária', 'Zerar progresso às']);
  quer('botões', d.botoes.map((b) => [b.texto, b.destaque, b.icone]), [['Salvar', true, 'save'], ['Cancelar', false, 'dismiss']]);
  const [s, c] = d.botoes;
  if (s && c && (Math.abs(s.caixa[2] - c.caixa[2]) > 0.5 || s.caixa[1] !== c.caixa[1] || s.caixa[0] >= c.caixa[0])) {
    f.push(`os botões não estão lado a lado com a mesma largura: ${JSON.stringify(s.caixa)} × ${JSON.stringify(c.caixa)}`);
  }
  if (s && c && Math.abs(s.caixa[0] - 24) > 0.5) f.push(`Salvar a ${s.caixa[0]} px da borda (esperado 24)`);
  if (d.caixa[0] < 0 || d.caixa[1] < 0 || d.caixa[0] + d.caixa[2] > d.janela[0] || d.caixa[1] + d.caixa[3] > d.janela[1]) {
    f.push(`o diálogo passa da janela: ${JSON.stringify(d.caixa)} em ${JSON.stringify(d.janela)}`);
  }
  return f;
}

async function conferir(motor, capturas, linha) {
  const pasta = capturas ?? mkdtempSync(join(tmpdir(), 'tomatito-m28-'));
  const chrome = motor === 'chrome';
  // No Chrome, o clique e as teclas de verdade; no WebKitGTK fora da tela, o click() e o cancel do <dialog>.
  const abrir = chrome ? ['--click', '[data-editar-meta]', '--wait', '500', '--eval', '__ttMeta()'] : ['--eval', '__ttMetaAbrir()'];
  const esc = chrome ? ['--key', 'Escape', '--wait', '400', '--eval', '__ttMeta()'] : ['--eval', '__ttMetaEsc()'];
  const botao = (qual, espera = 500) => (chrome
    ? ['--click', `fluent-dialog[data-dialogo="meta"] [data-${qual}]`, '--wait', String(espera), '--eval', '__ttMeta()']
    : ['--eval', `__ttMetaBotao(${JSON.stringify(qual)}, ${espera})`]);
  try {
    // 1) O lápis e o diálogo aberto, no Escuro, e Esc.
    const png = join(pasta, `${motor}-meta-escuro.png`);
    const r1 = await rodar(motor, `${BASE}&pref=dark#/foco`, ['--wait', '800', '--eval', '__ttMeta()', ...abrir, '--shot', png, ...esc]);
    if (r1.codigo !== 0 || r1.valores.length !== 3) {
      linha(false, `${motor}: a prévia saiu com ${r1.codigo} e ${r1.valores.length} medida(s)`, r1.erros);
      return;
    }
    for (const l of r1.erros) console.log(`  aviso do ${motor}: ${l}`);
    const [antes, aberto, fechado] = r1.valores;
    const lp = antes.lapis;
    const fl = [];
    if (lp.rotulo !== 'Editar meta diária' || !lp.dica || lp.icone !== 'edit' || !/tt-sutil/.test(lp.classe)) fl.push(JSON.stringify(lp));
    if (lp.centro.some((v, i) => Math.abs(v - LAPIS_REF[i]) > 1.5)) fl.push(`centro ${lp.centro} × ${LAPIS_REF} do Relógio`);
    if (antes.aberto) fl.push('o diálogo começa aberto');
    linha(!fl.length, `lápis: "${lp.rotulo}", ${lp.tamanho.join(' × ')} px, centro a ${lp.centro.join(' e ')} px da direita e do topo (Relógio: ${LAPIS_REF.join(' e ')})`, fl);
    const fa = conferirAberto(aberto);
    if (aberto?.dialogo?.foco !== 'lista Meta diária') fa.push(`foco ao abrir: ${aberto?.dialogo?.foco}`);
    const d = aberto?.dialogo;
    linha(!fa.length, `aberto: ${d?.caixa?.[2]} × ${d?.caixa?.[3]} px, raio ${d?.raio}, fundo ${d?.fundo}, de trás ${d?.fundoDeTras}; ${d?.mostrados?.join(' e ')}; botões ${d?.botoes?.map((b) => b.caixa[2]).join(' e ')} px; foco na ${d?.foco}`, fa);
    const fe = [];
    if (fechado.aberto) fe.push('continuou aberto');
    if (!fechado.lapis.focado) fe.push('o foco não voltou ao lápis');
    if (fechado.gravacoes.length) fe.push(`gravou: ${fechado.gravacoes}`);
    linha(!fe.length, `Esc: fecha sem gravar, foco no lápis (${fechado.lapis.focado})`, fe);

    // 2) No Chrome, o Esc com a lista aberta fecha só a lista (keys.js, M12).
    if (chrome) {
      const r2 = await rodar(motor, `${BASE}&pref=dark#/foco`, [
        '--wait', '800', ...abrir, '--key', 'Alt+ArrowDown', '--wait', '300', '--eval', '__ttMeta()',
        '--key', 'Escape', '--wait', '400', '--eval', '__ttMeta()',
        '--key', 'Escape', '--wait', '400', '--eval', '__ttMeta()',
      ]);
      const [, comLista, semLista, fim] = r2.valores;
      const ok = comLista?.dialogo?.listasAbertas?.[0] === true && semLista?.aberto && semLista?.dialogo?.listasAbertas?.[0] === false && !fim?.aberto && fim?.lapis?.focado;
      linha(r2.codigo === 0 && ok, `Esc com a lista aberta: fecha a lista (${comLista?.dialogo?.listasAbertas?.[0]} → ${semLista?.dialogo?.listasAbertas?.[0]}) e o diálogo continua aberto (${semLista?.aberto}); o Esc seguinte o fecha (${!fim?.aberto})`);
    }

    // 3) Cancelar descarta a escolha.
    const r3c = await rodar(motor, `${BASE}&pref=dark#/foco`, [
      '--wait', '800', ...abrir, '--eval', '__ttMetaEscolher(480, 7)', ...botao('cancelar'), ...abrir,
    ]);
    const [, escolhido, cancelado, reaberto] = r3c.valores;
    const fc = [];
    if (JSON.stringify(escolhido?.dialogo?.valores) !== '["480","7"]') fc.push(`escolha: ${JSON.stringify(escolhido?.dialogo?.valores)}`);
    if (cancelado?.aberto || !cancelado?.lapis?.focado || cancelado?.gravacoes?.length) fc.push(`depois de Cancelar: aberto ${cancelado?.aberto}, foco no lápis ${cancelado?.lapis?.focado}, gravações ${cancelado?.gravacoes}`);
    if (JSON.stringify(reaberto?.dialogo?.valores) !== '["120","4"]') fc.push(`reaberto: ${JSON.stringify(reaberto?.dialogo?.valores)}`);
    linha(r3c.codigo === 0 && !fc.length, `Cancelar: nada gravado, e reabrir mostra ${reaberto?.dialogo?.mostrados?.join(' e ')}`, fc);

    // 4) Salvar: 1 hora, zerar às 05:00. O anel muda na hora; depois, Desativada.
    const salvoPng = join(pasta, `${motor}-meta-salva.png`);
    const semMetaPng = join(pasta, `${motor}-meta-desativada.png`);
    const r4 = await rodar(motor, `${BASE}&pref=dark#/foco`, [
      '--wait', '800', ...abrir, '--eval', '__ttMetaEscolher(60, 5)', ...botao('salvar', 100),
      '--wait', '1300', '--eval', '__ttMeta()', '--shot', salvoPng,
      ...abrir, '--eval', '__ttMetaEscolher(0, 5)', ...botao('salvar', 1300), '--shot', semMetaPng,
      ...abrir,
    ]);
    const [, , logo, salvo, , , desativado, reaberto2] = r4.valores;
    const fs = [];
    if (logo?.aberto) fs.push('continuou aberto');
    if (!logo?.lapis?.focado) fs.push('o foco não voltou ao lápis');
    const gravado = salvo?.gravacoes?.[0];
    if (gravado !== 'settings_set:{"dailyGoalMinutes":60,"resetHour":5}') fs.push(`gravado: ${gravado}`);
    if (JSON.stringify(salvo?.progresso?.meta) !== '{"numero":"1","unidade":"hora"}') fs.push(`meta no anel: ${JSON.stringify(salvo?.progresso?.meta)}`);
    if (salvo?.progresso?.arco?.deslocamento !== r3(C * 0.25)) fs.push(`arco: ${salvo?.progresso?.arco?.deslocamento}, esperado ${r3(C * 0.25)} (75%)`);
    if (!/75% da meta\.$/.test(salvo?.progresso?.rotulo ?? '')) fs.push(`rótulo: ${salvo?.progresso?.rotulo}`);
    linha(r4.codigo === 0 && !fs.length, `Salvar: ${gravado}; fecha e o foco volta ao lápis; o anel vai a ${salvo?.progresso?.meta?.numero} ${salvo?.progresso?.meta?.unidade}, arco ${salvo?.progresso?.arco?.deslocamento} (75%)`, fs);
    const fd = [];
    if (desativado?.gravacoes?.[1] !== 'settings_set:{"dailyGoalMinutes":0,"resetHour":5}') fd.push(`gravado: ${desativado?.gravacoes?.[1]}`);
    if (!desativado?.progresso?.semMeta || desativado?.progresso?.anelVisivel) fd.push(`sem meta ${desativado?.progresso?.semMeta}, anel visível ${desativado?.progresso?.anelVisivel}`);
    if (desativado?.progresso?.rodape !== 'Concluído: 45 minutos') fd.push(`rodapé: ${desativado?.progresso?.rodape}`);
    if (JSON.stringify(reaberto2?.dialogo?.mostrados) !== '["Desativada","05:00"]') fd.push(`reaberto: ${JSON.stringify(reaberto2?.dialogo?.mostrados)}`);
    linha(r4.codigo === 0 && !fd.length, `Desativada: sem o anel e a meta (${desativado?.progresso?.semMeta}); reaberto, ${reaberto2?.dialogo?.mostrados?.join(' e ')}`, fd);

    // 5) Gravação recusada: fica aberto, com o aviso; depois, grava.
    const erroPng = join(pasta, `${motor}-meta-recusada.png`);
    const r5 = await rodar(motor, `${BASE}&pref=dark#/foco`, [
      '--wait', '800', ...abrir, '--eval', '__ttMeta(window.__TOMATITO_PREVIEW_RECUSAR_CONFIGURACOES__ = true)',
      ...botao('salvar'), '--shot', erroPng,
      '--eval', '__ttMeta(window.__TOMATITO_PREVIEW_RECUSAR_CONFIGURACOES__ = false)', ...botao('salvar'),
    ]);
    const [, , recusado, , regravado] = r5.valores;
    const fr = [];
    if (!recusado?.aberto) fr.push('fechou');
    if (JSON.stringify(recusado?.dialogo?.erro) !== '{"texto":"Não foi possível salvar. Tente de novo.","papel":"alert","icone":"error_circle"}') fr.push(`aviso: ${JSON.stringify(recusado?.dialogo?.erro)}`);
    if (regravado?.aberto || regravado?.gravacoes?.at(-1) !== 'settings_set:{"dailyGoalMinutes":120,"resetHour":4}') fr.push(`segunda tentativa: aberto ${regravado?.aberto}, ${regravado?.gravacoes}`);
    linha(r5.codigo === 0 && !fr.length, `recusado: fica aberto com "${recusado?.dialogo?.erro?.texto}"; a segunda tentativa grava e fecha`, fr);

    // 6) Os quatro temas na janela padrão.
    for (const tema of ['lite', 'suave', 'light', 'dark']) {
      const shot = join(pasta, `${motor}-meta-${tema}.png`);
      const r6 = await rodar(motor, `${BASE}&pref=${tema}#/foco`, ['--wait', '800', ...abrir, '--shot', shot], { tamanho: '1000x700' });
      const m = r6.valores.at(-1);
      const f6 = conferirAberto(m);
      linha(r6.codigo === 0 && !f6.length, `tema ${tema} (1000 × 700): fundo ${m?.dialogo?.fundo}, sombra ${m?.dialogo?.sombra}`, f6);
    }

    // 7) Estreito: 480 × 500 com zoom de 150% (320 × 333 px CSS).
    const estreitoPng = join(pasta, `${motor}-meta-estreito.png`);
    const r7 = await rodar(motor, `${BASE}&pref=dark#/foco`, [
      '--wait', '500', '--resize', '480x500@1.5', '--wait', '500',
      '--eval', "__ttMeta(document.querySelector('[data-cartao=\"progresso\"]').scrollIntoView())",
      ...abrir, '--shot', estreitoPng,
    ]);
    const e = r7.valores.at(-1);
    const f7 = conferirAberto(e);
    linha(r7.codigo === 0 && !f7.length, `estreito (480 × 500 a 150%): diálogo ${e?.dialogo?.caixa?.join(', ')} numa janela de ${e?.dialogo?.janela?.join(' × ')}`, f7);

    // 8) Controle negativo: os botões no tamanho do texto.
    const r8 = await rodar(motor, `${BASE}&pref=dark#/foco`, ['--wait', '800', ...abrir, '--eval', '__ttSabotarMeta()', '--eval', '__ttMeta()']);
    const f8 = conferirAberto(r8.valores.at(-1));
    linha(f8.some((x) => /mesma largura/.test(x)), `controle negativo (botões sem flex): ${f8.length} falha(s) acusada(s)`, f8.length ? [] : ['nada acusado']);
  } finally {
    if (!capturas) rmSync(pasta, { recursive: true, force: true });
  }
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
    console.log(`\n${NOMES[motor]}`);
    await conferir(motor, opts.capturas && resolve(opts.capturas), linha);
  }
  process.exitCode = falhou ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
