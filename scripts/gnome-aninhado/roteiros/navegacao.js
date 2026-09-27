// Roteiro do M09 (navegação), carregado com `gnome-shell --automation-script`
// pelo dentro.sh. Roda dentro do próprio shell, com ponteiro e teclado
// virtuais, e grava $TT_OUT/resultado.json. Confere, na janela main de verdade
// (WebKitGTK no Mutter 50, Wayland), com a sonda (sonda.js) contando o que a
// página vê:
//   - o painel: <nav aria-label="Principal">, as medidas dos itens e do
//     indicador, e a Foco como tela inicial;
//   - clicar num item troca a tela, e o indicador desliza: a sonda mede a
//     posição dele a cada quadro da página, e o roteiro guarda os quadros que o
//     compositor pinta e acha o indicador em cada um;
//   - Ctrl+1, Ctrl+2, Ctrl+3 e Ctrl+, trocam a tela;
//   - Tab entra no painel pelo item da tela atual, as setas andam entre os
//     itens (sem dar a volta), Home e End vão às pontas, Enter abre, só um item
//     fica no Tab por vez, e o Tab seguinte sai do painel para o conteúdo;
//   - hover e selecionado nos tokens, e o selecionado no Claro e no Escuro
//     medido na tela e comparado com a captura do Relógio (o roteiro troca o
//     data-theme pela sonda, como quem usa o console do DevTools).
// No fim, fecha a janela pelo compositor, e o dentro.sh confere se o app saiu.
import Clutter from 'gi://Clutter';
import GdkPixbuf from 'gi://GdkPixbuf';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import 'resource:///org/gnome/shell/ui/screenshot.js'; // promisifica Shell.Screenshot

// runPerfScript exige METRICS; o teste não mede desempenho.
export const METRICS = {};

const OUT = GLib.getenv('TT_OUT');
const SONDA_LOG = GLib.getenv('SONDA_LOG');
const R = { passos: [], checagens: {}, deslizes: {}, quadros: {}, temas: {} };

// Medidas esperadas (shell.css; NavigationView do WinUI). Janela de 1000 × 700.
const ALTURA = 700;
const ITEM = (i) => [4, 34 + 40 * i, 272, 36];
const RODAPE = [4, ALTURA - 6 - 36, 272, 36];
const TOPO_DO_INDICADOR = { foco: 44, temporizador: 84, cronometro: 124, configuracoes: ALTURA - 6 - 36 + 10 };

const salvar = () => GLib.file_set_contents(`${OUT}/resultado.json`, JSON.stringify(R, null, 2));
const sleep = (ms) =>
  new Promise((r) => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => (r(), GLib.SOURCE_REMOVE)));
const agoraMs = () => GLib.get_monotonic_time() / 1000;
const rect = (w) => {
  const r = w.get_frame_rect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
};
const janelas = () =>
  global.get_window_actors().map((a) => a.meta_window).filter((w) => w.get_title() === 'Tomatito');

let W = null;
const passo = (m) => {
  R.passos.push(`${Math.round(agoraMs())} ${m}`);
  salvar();
};
const checar = (nome, ok, detalhe) => {
  R.checagens[nome] = { ok: Boolean(ok), detalhe };
  passo(`${ok ? 'ok' : 'FALHA'}: ${nome}`);
};

function sonda() {
  try {
    const [, bytes] = GLib.file_get_contents(SONDA_LOG);
    return new TextDecoder()
      .decode(bytes)
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}
const estado = () => sonda().filter((e) => e.tipo === 'estado').at(-1)?.dados ?? null;

async function esperar(fn, ms, oque) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const v = fn();
    if (v) return v;
    await sleep(100);
  }
  throw new Error(`tempo esgotado: ${oque}`);
}
// Como esperar(), mas sem erro: devolve o último valor.
async function aguardar(fn, ms) {
  const t0 = Date.now();
  let v = fn();
  while (!v && Date.now() - t0 < ms) {
    await sleep(100);
    v = fn();
  }
  return v;
}

// Comando para a página, como no console do DevTools (sonda.config.mjs).
let nComando = 0;
async function comando(js) {
  const id = `c${++nComando}`;
  GLib.file_set_contents(`${OUT}/comando.json`, JSON.stringify({ id, js }));
  const r = await esperar(() => sonda().find((e) => e.tipo === 'comando' && e.dados.id === id), 5000, `comando ${js}`);
  passo(`comando ${js} => ${JSON.stringify(r.dados.resultado)}`);
  return r.dados.resultado;
}

let ptr;
let kb;
const agora = () => GLib.get_monotonic_time();
const mover = (x, y) => ptr.notify_absolute_motion(agora(), x, y);
const botao = (apertado) =>
  ptr.notify_button(agora(), Clutter.BUTTON_PRIMARY, apertado ? Clutter.ButtonState.PRESSED : Clutter.ButtonState.RELEASED);
const tecla = (keyval, apertada) =>
  kb.notify_keyval(agora(), keyval, apertada ? Clutter.KeyState.PRESSED : Clutter.KeyState.RELEASED);

async function clicar(x, y) {
  mover(x, y);
  await sleep(150);
  botao(true);
  await sleep(60);
  botao(false);
  await sleep(500);
}

async function atalho(...keyvals) {
  for (const k of keyvals) {
    tecla(k, true);
    await sleep(40);
  }
  for (const k of [...keyvals].reverse()) {
    tecla(k, false);
    await sleep(40);
  }
  await sleep(500);
}

async function captura(nome, area) {
  const shooter = new Shell.Screenshot();
  const s = Gio.File.new_for_path(`${OUT}/${nome}`).replace(null, false, Gio.FileCreateFlags.NONE, null);
  if (area) await shooter.screenshot_area(area.x, area.y, area.w, area.h, s);
  else await shooter.screenshot(false, s);
  s.close(null);
  passo(`captura ${nome}`);
}

function leitorDePixels(arquivo) {
  const pb = GdkPixbuf.Pixbuf.new_from_file(arquivo);
  const p = pb.get_pixels();
  const r = pb.get_rowstride();
  const n = pb.get_n_channels();
  return { w: pb.get_width(), h: pb.get_height(), px: (x, y) => [p[y * r + x * n], p[y * r + x * n + 1], p[y * r + x * n + 2]] };
}
const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
const perto = (a, b, tol = 2) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
const doHex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

// Grava os quadros que o compositor pinta com a janela durante `ms`, enquanto
// `acao()` roda (o mesmo método do roteiro partida-a-frio), e acha em cada um o
// topo do indicador: na coluna x = 5 da janela (o indicador ocupa x = 4 a 6),
// a primeira linha clara (canal verde > 150; o fundo do Lite tem 52).
async function gravarQuadros(nome, acao, ms = 700) {
  const ator = W.get_compositor_private();
  const quadros = [];
  let pendente = false;
  let ultimaSoma = null;
  let gravando = true;
  const t0 = agoraMs();
  const capturar = () => {
    pendente = false;
    if (!gravando) return;
    const img = ator.get_image(null);
    if (!img) return;
    const arq = `${OUT}/${nome}-q${quadros.length}.png`;
    img.writeToPNG(arq);
    const [, bytes] = GLib.file_get_contents(arq);
    const soma = GLib.compute_checksum_for_data(GLib.ChecksumType.MD5, bytes);
    if (soma === ultimaSoma) {
      Gio.File.new_for_path(arq).delete(null);
      return;
    }
    ultimaSoma = soma;
    quadros.push({ t: Math.round(agoraMs() - t0), arq });
  };
  const id = global.stage.connect('after-paint', () => {
    if (pendente || !gravando) return;
    pendente = true;
    GLib.idle_add(GLib.PRIORITY_HIGH, () => (capturar(), GLib.SOURCE_REMOVE));
  });
  await acao();
  await sleep(ms);
  gravando = false;
  global.stage.disconnect(id);
  for (const q of quadros) {
    const { h, px } = leitorDePixels(q.arq);
    q.topo = null;
    for (let y = 32; y < h; y++) {
      if (px(5, y)[1] > 150) {
        q.topo = y;
        break;
      }
    }
  }
  R.quadros[nome] = quadros.map(({ t, topo }) => ({ t, topo }));
  salvar();
  return quadros;
}

// Um deslize bom: a série sai do topo do item anterior, passa por pelo menos 3
// posições intermediárias, sem voltar, e chega ao item novo de 150 a 400 ms
// (500 nos quadros do compositor) depois de sair. A saída é a última amostra parada no item anterior logo
// antes da primeira em movimento; sem ela (ou com um intervalo parado maior que
// 40 ms antes do movimento), um quadro (17 ms) antes da primeira em movimento.
// Na série da página, que começa no hashchange, a saída é o próprio hashchange.
function avaliarDeslize(serie, de, para, { comecaNaTroca = false, maxMs = 400 } = {}) {
  const dentro = (v) => (de < para ? v > de && v < para : v < de && v > para);
  const intermediarios = serie.filter(([, v]) => dentro(v)).length;
  const monotona = serie.every(([, v], i) => i === 0 || (de < para ? v >= serie[i - 1][1] - 0.5 : v <= serie[i - 1][1] + 0.5));
  const iChegada = serie.findIndex(([, v]) => Math.abs(v - para) < 0.5);
  const iMov = serie.findIndex(([, v]) => dentro(v));
  let saida = null;
  if (comecaNaTroca) saida = 0;
  else if (iMov >= 0) {
    const antes = serie[iMov - 1];
    saida = antes && Math.abs(antes[1] - de) < 0.5 && serie[iMov][0] - antes[0] <= 40 ? antes[0] : serie[iMov][0] - 17;
  }
  const duracao = iChegada < 0 || saida === null ? null : serie[iChegada][0] - saida;
  const partida = serie[0]?.[1];
  const saiDoAnterior = partida !== undefined && Math.abs(partida - de) <= Math.abs(para - de) * 0.35;
  return {
    ok: intermediarios >= 3 && monotona && duracao !== null && duracao >= 150 && duracao <= maxMs && saiDoAnterior,
    intermediarios,
    monotona,
    duracao,
    partida,
  };
}

async function trocarPor(nome, acao, hash, de, para) {
  const antes = sonda().filter((e) => e.tipo === 'deslize').length;
  const quadros = await gravarQuadros(nome, acao);
  const d = await esperar(() => sonda().filter((e) => e.tipo === 'deslize').slice(antes).find((e) => e.dados.hash === hash), 3000, `deslize para ${hash}`);
  const e = await aguardar(() => (estado()?.nav?.hash === hash ? estado() : null), 2000);
  const serie = d.dados.serie;
  const pagina = avaliarDeslize(serie, TOPO_DO_INDICADOR[de], TOPO_DO_INDICADOR[para], { comecaNaTroca: true });
  const topos = quadros.map((q) => [q.t, q.topo]).filter(([, v]) => v !== null);
  // Os quadros do compositor chegam com o atraso e a irregularidade do shell
  // aninhado (renderização por software): o limite de tempo é mais folgado.
  const tela = avaliarDeslize(topos, TOPO_DO_INDICADOR[de], TOPO_DO_INDICADOR[para], { maxMs: 500 });
  R.deslizes[nome] = { serie, pagina, tela, quadros: topos };
  return { e, pagina, tela };
}

const rotaDoFoco = () => /\[(\w+)\]$/.exec(estado()?.foco ?? '')?.[1] ?? estado()?.foco;

async function principal() {
  passo('início');
  tente(() => new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' }).set_boolean('enable-hot-corners', false));
  tente(() => (Main.messageTray.bannerBlocked = true));
  const seat = global.stage.context.get_backend().get_default_seat();
  ptr = seat.create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
  kb = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
  await sleep(200);
  mover(960, 1070);
  await sleep(300);
  if (Main.overview.visible) Main.overview.hide();

  W = (await esperar(() => (janelas().length && rect(janelas()[0]).w > 0 ? janelas() : null), 120000, 'a janela do Tomatito'))[0];
  await esperar(() => estado()?.nav?.itens?.length === 4, 30000, 'o painel desenhado (sonda)');
  if (W.is_maximized()) W.unmaximize();
  W.move_resize_frame(true, 300, 150, 1000, ALTURA);
  await sleep(1000);
  const r = rect(W);
  Main.activateWindow(W);
  await sleep(500);

  // 1. Estado inicial.
  let e = await esperar(() => (estado()?.inner?.[1] === ALTURA ? estado() : null), 5000, 'a janela em 1000 x 700');
  R.inicial = e;
  const itens = Object.fromEntries(e.nav.itens.map((i) => [i.rota, i.caixa]));
  checar('<nav aria-label="Principal">, a Foco como tela inicial (#/foco) e só o item dela no Tab', e.nav.rotulo === 'Principal' && e.nav.hash === '#/foco' && e.nav.atual === 'foco' && e.titulo === 'Foco' && JSON.stringify(e.nav.paradaDoTab) === '["foco"]', e.nav);
  checar(
    'itens de 272 x 36 em x = 4, a cada 40 px a partir de y = 34, e Configurações a 6 px da base',
    JSON.stringify([itens.foco, itens.temporizador, itens.cronometro, itens.configuracoes]) === JSON.stringify([ITEM(0), ITEM(1), ITEM(2), RODAPE]),
    itens,
  );
  checar(
    'indicador de 3 x 16 na borda esquerda do item e centrado, em --tt-nav-indicator (creme no Lite)',
    JSON.stringify(e.nav.indicador?.caixa) === JSON.stringify([4, 44, 3, 16]) && e.nav.indicador?.cor === 'rgb(255, 244, 238)' && e.nav.indicador?.opacidade === '1',
    e.nav.indicador,
  );
  await captura('janela-foco.png', r);

  // 2. Clique num item: troca a tela e o indicador desliza.
  let t = await trocarPor('clique-temporizador', () => clicar(r.x + 140, r.y + 92), '#/temporizador', 'foco', 'temporizador');
  checar('clicar em Temporizador troca a tela', t.e?.nav.atual === 'temporizador' && t.e?.titulo === 'Temporizador', t.e?.nav);
  mover(r.x + 640, r.y + 400); // tira o hover do painel antes dos atalhos
  await sleep(300);
  checar('o indicador desliza da Foco para o Temporizador (quadros da página)', t.pagina.ok, t.pagina);
  checar('o indicador desliza da Foco para o Temporizador (quadros do compositor)', t.tela.ok, t.tela);

  // 3. Atalhos.
  t = await trocarPor('ctrl-3', () => atalho(Clutter.KEY_Control_L, Clutter.KEY_3), '#/cronometro', 'temporizador', 'cronometro');
  checar('Ctrl+3 abre o Cronômetro, com deslize', t.e?.nav.atual === 'cronometro' && t.e?.titulo === 'Cronômetro' && t.pagina.ok, { nav: t.e?.nav.atual, pagina: t.pagina });
  t = await trocarPor('ctrl-virgula', () => atalho(Clutter.KEY_Control_L, Clutter.KEY_comma), '#/configuracoes', 'cronometro', 'configuracoes');
  checar('Ctrl+, abre as Configurações, com deslize até o rodapé', t.e?.nav.atual === 'configuracoes' && t.e?.titulo === 'Configurações' && t.pagina.ok && t.tela.ok, { nav: t.e?.nav.atual, pagina: t.pagina, tela: t.tela });
  t = await trocarPor('ctrl-1', () => atalho(Clutter.KEY_Control_L, Clutter.KEY_1), '#/foco', 'configuracoes', 'foco');
  checar('Ctrl+1 abre a Foco, com deslize', t.e?.nav.atual === 'foco' && t.e?.titulo === 'Foco' && t.pagina.ok, { nav: t.e?.nav.atual, pagina: t.pagina });
  t = await trocarPor('ctrl-2', () => atalho(Clutter.KEY_Control_L, Clutter.KEY_2), '#/temporizador', 'foco', 'temporizador');
  checar('Ctrl+2 abre o Temporizador, com deslize', t.e?.nav.atual === 'temporizador' && t.e?.titulo === 'Temporizador' && t.pagina.ok, { nav: t.e?.nav.atual, pagina: t.pagina });

  // 4. Teclado no painel. Um clique no conteúdo vazio tira o foco de tudo.
  await clicar(r.x + 640, r.y + 400);
  const semFoco = estado()?.foco;
  const seq = [];
  const apertar = async (nome, ...keyvals) => {
    await atalho(...keyvals);
    await sleep(200);
    const s = estado();
    seq.push({ tecla: nome, foco: rotaDoFoco(), visivel: s?.focoVisivel, hash: s?.nav.hash, parada: s?.nav.paradaDoTab });
    return seq.at(-1);
  };
  const tab = await apertar('Tab', Clutter.KEY_Tab);
  await captura('foco-teclado.png', { x: r.x, y: r.y + 32, w: 290, h: 130 });
  // Tecla e o item que deve ficar com o foco, a partir do Temporizador.
  const roteiroDeTeclas = [
    ['↓', [Clutter.KEY_Down], 'cronometro'],
    ['↓', [Clutter.KEY_Down], 'configuracoes'],
    ['↓ (no último)', [Clutter.KEY_Down], 'configuracoes'],
    ['↑', [Clutter.KEY_Up], 'cronometro'],
    ['Home', [Clutter.KEY_Home], 'foco'],
    ['↑ (no primeiro)', [Clutter.KEY_Up], 'foco'],
    ['End', [Clutter.KEY_End], 'configuracoes'],
    ['↑', [Clutter.KEY_Up], 'cronometro'],
  ];
  const setas = [];
  for (const [nome, teclas, quer] of roteiroDeTeclas) setas.push({ ...(await apertar(nome, ...teclas)), quer });
  const enter = await apertar('Enter', Clutter.KEY_Return);
  const saindo = await apertar('↑', Clutter.KEY_Up);
  R.teclado = { semFoco, seq };
  checar('Tab entra no painel pelo item da tela atual, com o anel de foco', semFoco === 'body' && tab.foco === 'temporizador' && tab.visivel === true, { semFoco, tab });
  checar(
    '↑/↓ andam entre os quatro itens sem dar a volta, e Home/End vão às pontas',
    setas.every((s) => s.foco === s.quer),
    setas.map((s) => `${s.tecla}: ${s.foco}${s.foco === s.quer ? '' : ` (esperado ${s.quer})`}`),
  );
  checar(
    'as setas não trocam a tela, e só o item focado fica no Tab',
    [tab, ...setas].every((s) => s.hash === '#/temporizador' && JSON.stringify(s.parada) === JSON.stringify([s.foco])),
    [tab, ...setas],
  );
  checar('Enter abre o item focado (Cronômetro), e o foco fica nele', enter.hash === '#/cronometro' && enter.foco === 'cronometro', enter);
  // Sai do painel com o foco em outro item (Temporizador): na volta, o Tab entra
  // de novo pelo item da tela atual (Cronômetro), e não pelo último focado.
  await clicar(r.x + 640, r.y + 400);
  const reentrada = await apertar('Tab (de volta)', Clutter.KEY_Tab);
  checar(
    'saindo e voltando com o Tab, a entrada é de novo o item da tela atual',
    saindo.foco === 'temporizador' && reentrada.foco === 'cronometro' && JSON.stringify(reentrada.parada) === '["cronometro"]',
    { saindo, reentrada },
  );

  // 5. Tab do painel para o conteúdo, no #/dev (a única tela com controles por enquanto).
  await comando("location.hash = '#/dev'");
  e = await esperar(() => (estado()?.nav?.hash === '#/dev' && estado()?.titulo === 'Amostra do tema' ? estado() : null), 3000, 'o #/dev');
  checar('#/dev abre a amostra do M06, sem item marcado no painel', e.nav.atual === null && e.nav.indicador === null, e.nav);
  // Um clique no espaço vazio à esquerda dos cartões põe ali o ponto de partida
  // do Tab (regra do HTML): o Tab seguinte vai ao primeiro botão do conteúdo.
  await clicar(r.x + 286, r.y + 600);
  const t1 = await apertar('Tab', Clutter.KEY_Tab);
  const t2 = await apertar('Shift+Tab', Clutter.KEY_Shift_L, Clutter.KEY_Tab);
  const t3 = await apertar('Tab', Clutter.KEY_Tab);
  const t4 = await apertar('Shift+Tab', Clutter.KEY_Shift_L, Clutter.KEY_Tab);
  const t5 = await apertar('↓', Clutter.KEY_Down);
  const t6 = await apertar('Tab', Clutter.KEY_Tab);
  checar(
    'no #/dev, o painel é uma parada só do Tab entre o começo e o conteúdo: Shift+Tab do 1º botão volta ao painel (1º item), e o Tab seguinte, mesmo depois de ↓, vai ao 1º botão',
    /^button\.tt-accent/.test(t1.foco ?? '') && t2.foco === 'foco' && /^button\.tt-accent/.test(t3.foco ?? '') &&
      t4.foco === 'foco' && t5.foco === 'temporizador' && /^button\.tt-accent/.test(t6.foco ?? ''),
    { t1, t2, t3, t4, t5, t6 },
  );

  // 6. Hover e selecionado nos tokens (Lite), e o selecionado no Claro e no Escuro.
  await atalho(Clutter.KEY_Control_L, Clutter.KEY_1);
  mover(r.x + 140, r.y + 132); // sobre o Cronômetro
  await sleep(400);
  const hover = await comando("getComputedStyle(document.querySelector('.tt-nav-item:hover')).backgroundColor");
  const selecionado = await comando("getComputedStyle(document.querySelector('.tt-nav-item[aria-current]')).backgroundColor");
  checar('Lite: hover em --tt-subtle-hover (branco a 6%) e selecionado em --tt-subtle-selected (branco a 10%)', hover === 'rgba(255, 255, 255, 0.06)' && selecionado === 'rgba(255, 255, 255, 0.1)', { hover, selecionado });
  mover(r.x + 640, r.y + 400);
  await sleep(300);

  // Relógio (docs/decisoes.md, M09): Escuro #202020 → #2D2D2D; Claro, sobre a
  // Mica, #F0F3F9 → #E8EAF0 (preto a ~3,5%).
  const esperado = {
    lite: { fundo: '#A5342B', selecionado: '#AE4840', indicador: '#FFF4EE' },
    suave: { fundo: '#F6ECE9', selecionado: '#EFDDD8', indicador: '#A52E1E' },
    light: { fundo: '#F3F3F3', selecionado: '#EAEAEA', indicador: '#B8402D' },
    dark: { fundo: '#202020', selecionado: '#2D2D2D', indicador: '#F0745A' },
  };
  for (const tema of ['light', 'dark', 'suave', 'lite']) {
    await comando(`document.documentElement.dataset.theme = '${tema}'`);
    await sleep(500);
    await captura(`tema-${tema}.png`, { x: r.x, y: r.y, w: 300, h: 180 });
    const { px } = leitorDePixels(`${OUT}/tema-${tema}.png`);
    R.temas[tema] = { fundo: hex(px(200, 170)), selecionado: hex(px(200, 40)), indicador: hex(px(5, 52)) };
  }
  for (const [tema, nome] of [['light', 'Claro'], ['dark', 'Escuro']]) {
    const m = R.temas[tema];
    const q = esperado[tema];
    checar(
      `${nome}: fundo ${q.fundo}, selecionado ${q.selecionado} e indicador ${q.indicador} na tela (Relógio: ${tema === 'dark' ? '#202020 → #2D2D2D' : '#F0F3F9 → #E8EAF0'})`,
      perto(doHex(m.fundo), doHex(q.fundo), 1) && perto(doHex(m.selecionado), doHex(q.selecionado), 1) && perto(doHex(m.indicador), doHex(q.indicador), 3),
      m,
    );
  }
  checar(
    'Lite e Suave: fundo, selecionado e indicador na tela',
    ['lite', 'suave'].every((tema) => ['fundo', 'selecionado'].every((k) => perto(doHex(R.temas[tema][k]), doHex(esperado[tema][k]), 1)) && perto(doHex(R.temas[tema].indicador), doHex(esperado[tema].indicador), 3)),
    { lite: R.temas.lite, suave: R.temas.suave },
  );

  // 7. Erros na página e fim.
  const erros = sonda().filter((x) => x.tipo === 'erro').map((x) => x.dados);
  checar('nenhum erro na página', erros.length === 0, erros);
  W.delete(global.get_current_time());
  const sumiu = await aguardar(() => janelas().length === 0, 5000);
  checar('fechar pelo compositor fecha a janela', sumiu, { janelas: janelas().length });
  await sleep(1500);
  passo('fim');
}

function tente(fn) {
  try {
    fn();
  } catch (e) {
    passo(`aviso: ${e}`);
  }
}

export async function run() {
  try {
    await principal();
  } catch (e) {
    R.erro = `${e}\n${e.stack}`;
    salvar();
  }
}
