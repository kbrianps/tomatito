// Roteiro do M10 (camada de conteúdo e responsivo), carregado com
// `gnome-shell --automation-script` pelo dentro.sh. Roda dentro do próprio
// shell, com ponteiro e teclado virtuais, e grava $TT_OUT/resultado.json.
// Confere, na janela main de verdade (WebKitGTK no Mutter 50, Wayland), com as
// medidas de scripts/preview/medidas.js pedidas à sonda por comando:
//   - a camada de conteúdo na tela: fundo, borda de 1 px em cima e à esquerda
//     e o canto de 8 px, medidos nos pixels do Lite e do Escuro;
//   - estreitar a janela pela borda direita, com o ponteiro, de 1000 px até
//     passar do mínimo: a cada parada, nenhuma rolagem horizontal, o painel
//     com 280 px até 860 e 48 px abaixo, e a grade da Foco com 2 colunas até a
//     área útil de 560 px e 1 abaixo; a janela para em 480 px;
//   - em 480 px, as cinco telas sem rolagem horizontal, também com zoom de
//     120%, 140% e 160% (Ctrl+=) e com a tela forçada a rolar na vertical;
//   - a dica do painel compacto: aparece com o mouse parado e com o foco do
//     teclado, à direita do item, some com Esc e ao apertar o item, e não
//     existe no painel largo.
// Guarda capturas da janela em cada arranjo. No fim, fecha a janela pelo
// compositor, e o dentro.sh confere se o app saiu.
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
const R = { passos: [], checagens: {}, estreitar: [], telas: {}, zoom: {}, dicas: {}, pixels: {} };
const ALTURA = 700;

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

// Comando para a página, como no console do DevTools (sonda.config.mjs). O
// enviar() não espera: serve para a página começar a observar antes de o
// roteiro mexer no ponteiro.
let nComando = 0;
function enviar(js) {
  const id = `c${++nComando}`;
  GLib.file_set_contents(`${OUT}/comando.json`, JSON.stringify({ id, js }));
  return { id, js };
}
async function resultado({ id, js }, ms = 5000) {
  const r = await esperar(() => sonda().find((e) => e.tipo === 'comando' && e.dados.id === id), ms, `comando ${js}`);
  return r.dados.resultado;
}
const comando = (js) => resultado(enviar(js));
const medir = (js = '__ttMedidas()') => comando(js);

let ptr;
let kb;
const agora = () => GLib.get_monotonic_time();
const mover = (x, y) => ptr.notify_absolute_motion(agora(), x, y);
const botao = (apertado) =>
  ptr.notify_button(agora(), Clutter.BUTTON_PRIMARY, apertado ? Clutter.ButtonState.PRESSED : Clutter.ButtonState.RELEASED);
const tecla = (keyval, apertada) =>
  kb.notify_keyval(agora(), keyval, apertada ? Clutter.KeyState.PRESSED : Clutter.KeyState.RELEASED);

async function semVisaoGeral() {
  if (!Main.overview.visible) return;
  Main.overview.hide();
  await sleep(600);
  passo('visão geral estava aberta; fechada');
}

async function clicar(x, y) {
  await semVisaoGeral();
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

async function posicionar(w, h = ALTURA) {
  if (W.is_maximized()) W.unmaximize();
  W.move_resize_frame(true, 300, 150, w, h);
  await esperar(() => rect(W).w === w && rect(W).h === h, 3000, `a janela em ${w} x ${h}`);
  await sleep(600);
  return rect(W);
}

async function captura(nome, area) {
  const shooter = new Shell.Screenshot();
  const s = Gio.File.new_for_path(`${OUT}/${nome}`).replace(null, false, Gio.FileCreateFlags.NONE, null);
  await shooter.screenshot_area(area.x, area.y, area.w, area.h, s);
  s.close(null);
  passo(`captura ${nome}`);
}

function leitorDePixels(arquivo) {
  const pb = GdkPixbuf.Pixbuf.new_from_file(`${OUT}/${arquivo}`);
  const p = pb.get_pixels();
  const r = pb.get_rowstride();
  const n = pb.get_n_channels();
  return (x, y) => [p[y * r + x * n], p[y * r + x * n + 1], p[y * r + x * n + 2]];
}
const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
const doHex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const perto = (a, b, tol = 2) => a.every((v, i) => Math.abs(v - b[i]) <= tol);

// Conferências de layout de uma medida (as mesmas do scripts/preview/responsivo.mjs).
const colunasPelaJanela = (largura) => (largura - (largura < 860 ? 48 : 280) - 1 >= 560 ? 2 : 1);
function problemas(m, { foco = true } = {}) {
  const f = [];
  const largura = m.janela[0];
  const compacto = largura < 860;
  const pertoN = (a, b) => Math.abs(a - b) <= 0.05;
  if (m.rolagem.pagina || m.rolagem.conteudo || m.rolagem.camada) f.push(`rolagem horizontal ${JSON.stringify(m.rolagem)}`);
  if (m.foraDaJanela.length) f.push(`fora da janela: ${m.foraDaJanela.slice(0, 3)}`);
  if (!pertoN(m.painel.largura, compacto ? 48 : 280)) f.push(`painel de ${m.painel.largura} px`);
  if (m.painel.rotulosVisiveis !== (compacto ? 0 : 4)) f.push(`${m.painel.rotulosVisiveis} rótulos visíveis`);
  if (!pertoN(m.camada.caixa[0], m.painel.largura)) f.push(`camada em x = ${m.camada.caixa[0]}`);
  if (foco && m.grade) {
    const quer = m.camada.larguraUtil >= 560 ? 2 : 1;
    if (m.grade.colunas !== quer || quer !== colunasPelaJanela(largura)) {
      f.push(`${m.grade.colunas} coluna(s) com área útil de ${m.camada.larguraUtil} px`);
    }
  }
  return f;
}

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
  await esperar(() => sonda().some((e) => e.tipo === 'info'), 10000, 'a sonda carregada');
  let r = await posicionar(1000);
  Main.activateWindow(W);
  await sleep(500);

  // 1. A camada de conteúdo, medida e na tela (Lite e Escuro).
  let m = await medir('__ttMedir("#/foco")');
  R.inicial = m;
  checar(
    '1000 px: painel de 280, camada em x = 280 e y = 32, com borda de 1 px só em cima e à esquerda, canto de 8 px e 2 colunas',
    problemas(m).length === 0 && m.camada.caixa[1] === 32 &&
      JSON.stringify(m.camada.bordas) === '["1px","0px","0px","1px"]' && JSON.stringify(m.camada.raios) === '["8px","0px","0px","0px"]' &&
      m.grade.colunas === 2,
    { painel: m.painel.largura, camada: m.camada, grade: m.grade, problemas: problemas(m) },
  );
  // Pixels: painel (140, 300), camada (600, 400), borda de cima (600, 32),
  // borda da esquerda (280, 400), o canto (280, 32), que fica fora da curva e
  // mostra o fundo, e a barra de título logo acima da camada (600, 31).
  const cores = {
    lite: { fundo: '#A5342B', camada: '#AA392F', borda: '#BD6359' },
    dark: { fundo: '#202020', camada: '#282828', borda: '#3A3A3A' },
  };
  for (const tema of ['lite', 'dark']) {
    await comando(`__ttTema('${tema}')`);
    await sleep(300);
    await captura(`camada-${tema}.png`, r);
    const px = leitorDePixels(`camada-${tema}.png`);
    const lido = {
      painel: hex(px(140, 300)), camada: hex(px(600, 400)), bordaDeCima: hex(px(600, 32)),
      bordaDaEsquerda: hex(px(280, 400)), canto: hex(px(280, 32)), barra: hex(px(600, 31)),
      dentroDoCanto: hex(px(283, 35)),
    };
    R.pixels[tema] = lido;
    const q = cores[tema];
    checar(
      `${tema === 'lite' ? 'Lite' : 'Escuro'}: painel ${q.fundo}, camada ${q.camada}, borda ${q.borda} em cima e à esquerda, e o canto arredondado (fundo no vértice)`,
      perto(doHex(lido.painel), doHex(q.fundo)) && perto(doHex(lido.camada), doHex(q.camada)) &&
        perto(doHex(lido.bordaDeCima), doHex(q.borda)) && perto(doHex(lido.bordaDaEsquerda), doHex(q.borda)) &&
        perto(doHex(lido.canto), doHex(q.fundo), 3) && perto(doHex(lido.barra), doHex(q.fundo)) &&
        perto(doHex(lido.dentroDoCanto), doHex(q.camada), 3),
      lido,
    );
  }
  await comando("__ttTema('lite')");
  await captura('janela-1000.png', r);

  // 2. Estreitar pela borda direita, com o ponteiro, parando em cada largura.
  const alvos = [940, 880, 870, 861, 860, 859, 800, 700, 620, 610, 609, 608, 560, 520, 500, 480, 440, 400];
  const x0 = r.x + r.w - 2;
  const y0 = r.y + Math.round(r.h / 2);
  await semVisaoGeral();
  mover(x0, y0);
  await sleep(200);
  botao(true);
  await sleep(400);
  let xAtual = x0;
  for (const alvo of alvos) {
    const xAlvo = r.x + alvo - 2;
    for (let i = 1; i <= 6; i++) {
      mover(xAtual + ((xAlvo - xAtual) * i) / 6, y0);
      await sleep(25);
    }
    xAtual = xAlvo;
    await sleep(450);
    const med = await medir();
    const frame = rect(W).w;
    const p = problemas(med);
    R.estreitar.push({ alvo, janela: frame, css: med.janela, painel: med.painel.largura, util: med.camada.larguraUtil, colunas: med.grade?.colunas, rolagem: med.rolagem, problemas: p });
    salvar();
    if ([859, 608].includes(alvo)) await captura(`janela-${alvo}.png`, { ...rect(W) });
  }
  botao(false);
  await sleep(700);
  const e = R.estreitar;
  checar(
    'estreitando pela borda de 1000 a 480 px: em todas as paradas, nenhuma rolagem horizontal, painel de 280 até 860 e de 48 abaixo, e a grade com 2 colunas até a área útil de 560 px',
    e.every((x) => x.problemas.length === 0),
    e.map((x) => `${x.janela}: painel ${x.painel}, útil ${x.util}, ${x.colunas} col.${x.problemas.length ? ` ${x.problemas.join('; ')}` : ''}`),
  );
  const por = (w) => e.find((x) => x.janela === w);
  checar(
    'os limites caem nas larguras certas: 860 largo e 859 compacto; 609 com 2 colunas e 608 com 1',
    por(860)?.painel === 280 && por(859)?.painel === 48 && por(609)?.colunas === 2 && por(608)?.colunas === 1,
    { 860: por(860), 859: por(859), 609: por(609), 608: por(608) },
  );
  r = rect(W);
  checar('a janela para no mínimo de 480 px, e o conteúdo acompanha (innerWidth = 480)', r.w === 480 && e.at(-1).janela === 480 && e.at(-1).css[0] === 480, { final: r, ultimas: e.slice(-3) });
  await captura('janela-480.png', r);

  // 3. Em 480 px, as cinco telas, sem e com a tela forçada a rolar na vertical.
  const rotas = [['#/foco', Clutter.KEY_1], ['#/temporizador', Clutter.KEY_2], ['#/cronometro', Clutter.KEY_3], ['#/configuracoes', Clutter.KEY_comma]];
  Main.activateWindow(W);
  await sleep(300);
  for (const [hash, k] of rotas) {
    await atalho(Clutter.KEY_Control_L, k);
    R.telas[hash] = { normal: await medir(`__ttMedir('${hash}')`), alta: await medir(`__ttMedir('${hash}', { alto: true })`) };
  }
  R.telas['#/dev'] = { normal: await medir("__ttMedir('#/dev')"), alta: await medir("__ttMedir('#/dev', { alto: true })") };
  const telasProb = Object.fromEntries(
    Object.entries(R.telas).map(([h, v]) => [h, [...problemas(v.normal), ...problemas(v.alta)].concat(v.normal.rota === h ? [] : [`rota ${v.normal.rota}`])]),
  );
  checar('480 px: as cinco telas sem rolagem horizontal, também rolando na vertical', Object.values(telasProb).every((p) => p.length === 0), telasProb);

  // 4. Zoom em 480 px: Ctrl+= três vezes (120%, 140% e 160%) e Ctrl+0.
  await atalho(Clutter.KEY_Control_L, Clutter.KEY_1);
  for (const nivel of ['120', '140', '160']) {
    await atalho(Clutter.KEY_Control_L, Clutter.KEY_equal);
    await sleep(300);
    const z = {};
    for (const h of ['#/foco', '#/configuracoes', '#/dev']) z[h] = await medir(`__ttMedir('${h}', { alto: true })`);
    await comando("__ttMedir('#/foco')");
    R.zoom[nivel] = Object.fromEntries(Object.entries(z).map(([h, v]) => [h, { css: v.janela, dpr: v.dpr, problemas: problemas(v) }]));
    if (nivel === '160') await captura('janela-480-zoom160.png', rect(W));
  }
  await atalho(Clutter.KEY_Control_L, Clutter.KEY_0);
  const zooms = Object.entries(R.zoom);
  checar(
    '480 px com zoom de 120%, 140% e 160%: a página encolhe (400, 343 e 300 px CSS), sem rolagem horizontal na Foco, nas Configurações e no #/dev',
    zooms.length === 3 &&
      zooms.every(([nivel, v]) => Object.values(v).every((x) => x.problemas.length === 0 && Math.abs(x.css[0] - 480 / (Number(nivel) / 100)) < 1)),
    R.zoom,
  );
  m = await medir('__ttMedir("#/foco")');
  checar('Ctrl+0 volta a 480 px CSS', m.janela[0] === 480, m.janela);

  // 5. Dicas do painel compacto, a 700 px.
  r = await posicionar(700);
  Main.activateWindow(W);
  await clicar(r.x + 400, r.y + 500); // conteúdo vazio: tira o foco do painel
  const dicas = async (nome, esperado, espera = 150) => {
    await sleep(espera);
    const med = await medir();
    const d = med.painel.dicas.map((x) => ({ texto: x.texto, caixa: x.caixa }));
    R.dicas[nome] = { esperado, d };
    return d;
  };
  const textos = (d) => JSON.stringify(d.map((x) => x.texto));
  // O atraso é medido pela página, a cada quadro: quando o item ganha o :hover
  // e quando a dica fica visível. A página começa a olhar antes de o ponteiro
  // chegar.
  const pedido = enviar(`(async () => {
    const d = document.querySelector('.tt-nav-item[data-rota="temporizador"] .tt-nav-dica');
    const t0 = performance.now();
    let hover = null;
    let visivel = null;
    while (performance.now() - t0 < 4000 && visivel === null) {
      const t = performance.now() - t0;
      if (hover === null && d.parentElement.matches(':hover')) hover = t;
      if (hover !== null && getComputedStyle(d).visibility === 'visible' && Number(getComputedStyle(d).opacity) > 0) visivel = t;
      await new Promise((r) => requestAnimationFrame(r));
    }
    return { hover: Math.round(hover), visivel: Math.round(visivel), atraso: Math.round(visivel - hover) };
  })()`);
  await sleep(400);
  mover(r.x + 24, r.y + 92); // Temporizador
  const atraso = await resultado(pedido);
  const mouse = await dicas('mouse parado no Temporizador', ['Temporizador'], 300);
  await captura('dica-mouse.png', { x: r.x, y: r.y, w: 260, h: 180 });
  const item = R.inicial.painel.itens[1];
  const certa = mouse[0] && Math.abs(mouse[0].caixa[0] - 52) <= 0.5 && Math.abs(mouse[0].caixa[1] + mouse[0].caixa[3] / 2 - (item[1] + item[3] / 2)) <= 0.5;
  R.dicas.atraso = atraso;
  checar(
    'mouse parado num item do painel compacto: a dica aparece uns 250 ms depois, à direita do item (x = 52) e centrada nele',
    atraso.atraso >= 230 && atraso.atraso <= 450 && textos(mouse) === '["Temporizador"]' && certa,
    { atraso, mouse },
  );
  await atalho(Clutter.KEY_Escape);
  const esc = await dicas('Esc com o mouse no item', []);
  mover(r.x + 24, r.y + 132); // Cronômetro
  const outro = await dicas('mouse no item seguinte', ['Cronômetro'], 500);
  mover(r.x + 400, r.y + 500);
  const fora = await dicas('mouse fora do painel', [], 300);
  checar('Esc esconde a dica sem mover o mouse; ela volta no item seguinte e some com o mouse fora do painel', textos(esc) === '[]' && textos(outro) === '["Cronômetro"]' && textos(fora) === '[]', { esc, outro, fora });
  mover(r.x + 24, r.y + 92);
  await sleep(500);
  botao(true);
  const apertado = await dicas('botão apertado no item', [], 100);
  botao(false);
  await sleep(300);
  const depoisDoClique = await dicas('depois do clique, com o mouse parado', [], 400);
  mover(r.x + 400, r.y + 500);
  await sleep(300);
  checar('apertar o item esconde a dica, e ela não volta enquanto o mouse fica no item', textos(apertado) === '[]' && textos(depoisDoClique) === '[]', { apertado, depoisDoClique });
  await clicar(r.x + 400, r.y + 500);
  await atalho(Clutter.KEY_Tab);
  const tab = await dicas('Tab (o item atual, Temporizador, com o foco)', ['Temporizador'], 400);
  await captura('dica-teclado.png', { x: r.x, y: r.y, w: 260, h: 180 });
  await atalho(Clutter.KEY_Down);
  const baixo = await dicas('↓ (Cronômetro)', ['Cronômetro'], 400);
  await atalho(Clutter.KEY_Escape);
  const escTeclado = await dicas('Esc com o foco no item', []);
  checar(
    'foco do teclado no painel compacto: a dica acompanha o item focado (Tab e ↓) e some com Esc',
    textos(tab) === '["Temporizador"]' && textos(baixo) === '["Cronômetro"]' && textos(escTeclado) === '[]',
    { tab, baixo, escTeclado },
  );
  r = await posicionar(1000);
  mover(r.x + 140, r.y + 92);
  const larga = await dicas('painel largo, mouse parado no item', [], 600);
  checar('no painel largo (1000 px), a dica não aparece', textos(larga) === '[]', larga);
  mover(r.x + 640, r.y + 400);

  // 6. Erros na página e fim.
  const erros = sonda().filter((x) => x.tipo === 'erro').map((x) => x.dados);
  checar('nenhum erro na página', erros.length === 0, erros);
  W.delete(global.get_current_time());
  const sumiu = await esperar(() => janelas().length === 0, 5000, 'a janela fechar').catch(() => false);
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
