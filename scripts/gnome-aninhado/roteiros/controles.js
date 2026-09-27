// Roteiro do M12 (controles Fluent e posicionamento), carregado com
// `gnome-shell --automation-script` pelo dentro.sh. Roda dentro do próprio
// shell, com ponteiro e teclado virtuais, e grava $TT_OUT/resultado.json; quem
// confere a maior parte é o resumo-controles.mjs, com as mesmas regras da
// prévia (scripts/preview/controles.mjs). Na janela main de verdade (WebKitGTK
// no Mutter 50, Wayland), no #/dev e no Lite:
//   1. as caixas de seleção: a marcada é creme na tela (e nunca azul); clicar
//      marca e desmarca; hover e clique na marcada pintam o creme do hover e
//      do pressionado;
//   2. com o ponteiro, abre os dois menus e as duas listas suspensas, também
//      com o gatilho colado na borda de baixo, e confere onde abriram: pela
//      página (__ttMedirPopover) e pelos pixels (a diferença entre a captura
//      de antes e a de depois do clique fica em volta do que abriu); Esc fecha
//      e devolve o foco ao gatilho;
//   3. a roda do mouse com o menu aberto: o menu acompanha o botão;
//   4. o teclado no menu: Enter abre com o foco no 1º item, ↓ anda, Esc fecha;
//   5. escolher uma opção com o clique troca o valor e fecha a lista;
//   6. as dicas com o mouse parado (em cima e embaixo do botão) e com o foco
//      do teclado; Esc fecha;
//   7. o diálogo: modal, centrado, com o fundo escurecido; a lista de dentro
//      abre embaixo da caixa; Esc fecha a lista e depois o diálogo, e o foco
//      volta ao botão; Cancelar fecha.
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
const R = { passos: [], checagens: {}, casos: {}, caixas: {}, teclado: {}, opcao: null, dicas: {}, dialogo: {}, roda: null };
const ALTURA = 700;
// Lite (tokens.css): creme do accent, do hover e do pressionado; fundo e cartão.
const CREME = { accent: '#FFF4EE', hover: '#FDE8E0', clique: '#F8D7CC' };
const FUNDO_LITE = [0xa5, 0x34, 0x2b];
const CARTAO_LITE = '#AF4135';

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

// Comando para a página, como no console do DevTools (sonda.config.mjs).
let nComando = 0;
async function comando(js) {
  const id = `c${++nComando}`;
  GLib.file_set_contents(`${OUT}/comando.json`, JSON.stringify({ id, js }));
  const r = await esperar(() => sonda().find((e) => e.tipo === 'comando' && e.dados.id === id), 5000, `comando ${js}`);
  const texto = JSON.stringify(r.dados.resultado) ?? 'null';
  passo(`comando ${js} => ${texto.length > 300 ? `${texto.slice(0, 300)}…` : texto}`);
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
// Move o ponteiro de um ponto a outro em passos de 8 px, a uns 60 Hz, como
// um mouse de verdade (o compositor manda cada posição à janela).
async function deslizar([x0, y0], [x1, y1]) {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 8));
  for (let i = 1; i <= n; i++) {
    mover(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n);
    await sleep(16);
  }
}
async function apertar(keyval) {
  tecla(keyval, true);
  await sleep(40);
  tecla(keyval, false);
  await sleep(450);
}

async function captura(nome, area) {
  const shooter = new Shell.Screenshot();
  const s = Gio.File.new_for_path(`${OUT}/${nome}`).replace(null, false, Gio.FileCreateFlags.NONE, null);
  await shooter.screenshot_area(area.x, area.y, area.w, area.h, s);
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
const doHex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const perto = (a, b, tol = 3) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
// Azul: matiz de 190° a 250° com saturação de verdade (o brand do Fluent).
function azul([r, g, b]) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = (max - min) / 255;
  if (d < 0.1) return false;
  let h = max === r ? ((g - b) / (max - min)) % 6 : max === g ? (b - r) / (max - min) + 2 : (r - g) / (max - min) + 4;
  h = (h * 60 + 360) % 360;
  return h >= 190 && h <= 250;
}

// Pixels de uma caixa [x, y, w, h] (px da página) numa captura da janela:
// quantos têm a cor dada (com tolerância) e quantos são azuis.
function contarNaCaixa(arquivo, [x, y, w, h], cor) {
  const { px } = leitorDePixels(arquivo);
  const alvo = doHex(cor);
  let total = 0;
  let iguais = 0;
  let azuis = 0;
  for (let j = Math.ceil(y); j < Math.floor(y + h); j++) {
    for (let i = Math.ceil(x); i < Math.floor(x + w); i++) {
      const p = px(i, j);
      total++;
      if (perto(p, alvo)) iguais++;
      if (azul(p)) azuis++;
    }
  }
  return { total, iguais, azuis, fracao: total ? Math.round((iguais / total) * 100) / 100 : 0 };
}

// Pixels diferentes entre duas capturas do mesmo tamanho, e a caixa [x0, y0,
// x1, y1] que os contém (null se nada mudou). A faixa de 14 px da direita fica
// de fora: a barra de rolagem sobreposta do WebKitGTK aparece a cada rolagem e
// some sozinha (a mesma exclusão do roteiro partida-a-frio, M08).
const FAIXA_DA_BARRA = 14;
function diferenca(a, b) {
  const A = leitorDePixels(a);
  const B = leitorDePixels(b);
  if (A.w !== B.w || A.h !== B.h) return { pixels: null, tamanhos: [[A.w, A.h], [B.w, B.h]] };
  let n = 0;
  const caixa = [Infinity, Infinity, -1, -1];
  for (let y = 0; y < A.h; y++) {
    for (let x = 0; x < A.w - FAIXA_DA_BARRA; x++) {
      const p = A.px(x, y);
      const q = B.px(x, y);
      if (p[0] !== q[0] || p[1] !== q[1] || p[2] !== q[2]) {
        n++;
        caixa[0] = Math.min(caixa[0], x);
        caixa[1] = Math.min(caixa[1], y);
        caixa[2] = Math.max(caixa[2], x);
        caixa[3] = Math.max(caixa[3], y);
      }
    }
  }
  return { pixels: n, caixa: n ? caixa : null };
}

const js = (v) => JSON.stringify(v);

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

  const W = (await esperar(() => (janelas().length && rect(janelas()[0]).w > 0 ? janelas() : null), 120000, 'a janela do Tomatito'))[0];
  await esperar(() => estado()?.nav?.itens?.length === 4, 30000, 'o painel desenhado (sonda)');
  if (W.is_maximized()) W.unmaximize();
  W.move_resize_frame(true, 300, 150, 1000, ALTURA);
  await sleep(1000);
  const r = rect(W);
  Main.activateWindow(W);
  await sleep(500);
  await esperar(() => estado()?.inner?.[1] === ALTURA, 5000, 'a janela em 1000 x 700');
  // Fora da janela, e num lugar neutro dentro dela (o meio do painel, sem
  // item): o WebKitGTK pode manter o :hover do último elemento quando o
  // ponteiro sai da janela, então as capturas sem hover usam o neutro.
  const longe = () => mover(r.x + r.w + 200, r.y + r.h + 100);
  const neutro = () => mover(r.x + 140, r.y + 400);
  longe();
  await sleep(300);
  await comando("location.hash = '#/dev'");
  const e = await esperar(() => (estado()?.titulo === 'Catálogo de controles' ? estado() : null), 3000, 'o #/dev');
  checar('o #/dev abre o catálogo, no Lite', e.tema === 'lite', { titulo: e.titulo, tema: e.tema });
  const definidos = await comando(
    "['fluent-checkbox','fluent-dropdown','fluent-listbox','fluent-option','fluent-dialog','fluent-dialog-body','fluent-menu','fluent-menu-list','fluent-menu-item','fluent-tooltip'].filter((t) => !customElements.get(t))",
  );
  checar('os dez componentes novos estão definidos (nenhum escondido pelo :not(:defined))', Array.isArray(definidos) && definidos.length === 0, definidos);

  // 1. Caixas de seleção.
  const CAIXAS = `new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(() => ok(__ttCaixas().filter((c) => !c.desabilitada)))))`;
  let cx = await comando(`(document.querySelector('[data-amostra="caixas"]').scrollIntoView({ block: 'center' }), ${CAIXAS})`);
  await sleep(300);
  await captura('caixas.png', r);
  const [marcada, desmarcada] = cx;
  R.caixas.inicio = {
    marcada: contarNaCaixa(`${OUT}/caixas.png`, marcada.caixa, CREME.accent),
    desmarcada: contarNaCaixa(`${OUT}/caixas.png`, desmarcada.caixa, CREME.accent),
  };
  const centro = (c) => [r.x + Math.round(c[0] + c[2] / 2), r.y + Math.round(c[1] + c[3] / 2)];
  await clicar(...centro(desmarcada.caixa));
  neutro();
  await sleep(400);
  cx = await comando(CAIXAS);
  await captura('caixas-clicada.png', r);
  R.caixas.clicada = { estado: cx.map((c) => c.marcada), pixels: contarNaCaixa(`${OUT}/caixas-clicada.png`, desmarcada.caixa, CREME.accent) };
  await clicar(...centro(desmarcada.caixa));
  cx = await comando(CAIXAS);
  R.caixas.desfeita = cx.map((c) => c.marcada);
  // Hover e clique (sem soltar) na marcada.
  mover(...centro(marcada.caixa));
  await sleep(400);
  await captura('caixa-hover.png', r);
  R.caixas.hover = contarNaCaixa(`${OUT}/caixa-hover.png`, marcada.caixa, CREME.hover);
  botao(true);
  await sleep(300);
  await captura('caixa-clique.png', r);
  R.caixas.clique = contarNaCaixa(`${OUT}/caixa-clique.png`, marcada.caixa, CREME.clique);
  botao(false);
  await sleep(400);
  cx = await comando(CAIXAS);
  R.caixas.soltou = cx.map((c) => c.marcada);
  await clicar(...centro(marcada.caixa)); // volta a marcar
  cx = await comando(CAIXAS);
  R.caixas.fim = cx.map((c) => c.marcada);
  longe();
  salvar();

  // 2. Menus e listas suspensas com o ponteiro.
  const CASOS = [
    ['menu-sessao', 'meio'],
    ['menu-temporizador', 'meio'],
    ['menu-temporizador', 'baixo'],
    ['meta', 'meio'],
    ['zerar', 'baixo'],
  ];
  for (const [nome, onde] of CASOS) {
    const chave = `${nome} ${onde}`;
    const p = await comando(`__ttPosicionar(${js(nome)}, ${js(onde)})`);
    mover(r.x + p.clique[0], r.y + p.clique[1]);
    await sleep(400);
    await captura(`${nome}-${onde}-antes.png`, r);
    botao(true);
    await sleep(60);
    botao(false);
    await sleep(700);
    const medida = await comando(`__ttMedirPopover(${js(nome)})`);
    await captura(`${nome}-${onde}.png`, r);
    const dif = diferenca(`${OUT}/${nome}-${onde}-antes.png`, `${OUT}/${nome}-${onde}.png`);
    await apertar(Clutter.KEY_Escape);
    const esc = await comando(`__ttMedirPopover(${js(nome)})`);
    R.casos[chave] = { posicionar: p, medida, diferenca: dif, esc };
    salvar();
    await comando('__ttFecharPopovers()');
  }

  // 3. A roda do mouse com o menu aberto (o ponteiro fica no conteúdo, longe do menu).
  {
    const p = await comando("__ttPosicionar('menu-sessao', 'meio')");
    await clicar(r.x + p.clique[0], r.y + p.clique[1]);
    const antes = await comando("__ttMedirPopover('menu-sessao')");
    mover(r.x + 800, r.y + 600);
    await sleep(300);
    ptr.notify_discrete_scroll(agora(), Clutter.ScrollDirection.DOWN, Clutter.ScrollSource.WHEEL);
    await sleep(700);
    const depois = await comando("__ttMedirPopover('menu-sessao')");
    await captura('menu-roda.png', r);
    R.roda = { antes, depois };
    await comando('__ttFecharPopovers()');
  }

  // 4. Teclado no menu do temporizador.
  {
    await comando("__ttPosicionar('menu-temporizador', 'meio')");
    await comando(`document.querySelector('[data-amostra="menu-temporizador"] [slot="trigger"]').focus()`);
    const seq = [];
    const medir = async (tecla) => seq.push({ tecla, ...(await comando("__ttMedirPopover('menu-temporizador')")) });
    await apertar(Clutter.KEY_Return);
    await medir('Enter');
    await apertar(Clutter.KEY_Down);
    await medir('↓');
    await apertar(Clutter.KEY_Up);
    await medir('↑');
    await apertar(Clutter.KEY_Escape);
    await medir('Esc');
    R.teclado.menu = seq.map(({ tecla, aberto, foco, lado, esquerda }) => ({ tecla, aberto, foco, lado, esquerda }));
    await comando('__ttFecharPopovers()');
  }

  // 5. Escolher uma opção com o clique.
  {
    const p = await comando("__ttPosicionar('meta', 'meio')");
    await clicar(r.x + p.clique[0], r.y + p.clique[1]);
    const alvo = await comando(
      `(() => { const o = [...document.querySelectorAll('[data-amostra="meta"] fluent-option')].find((o) => o.textContent.trim() === '2 horas'); const b = o.getBoundingClientRect(); return [Math.round(b.x + b.width / 2), Math.round(b.y + b.height / 2)]; })()`,
    );
    await clicar(r.x + alvo[0], r.y + alvo[1]);
    R.opcao = await comando(
      `(() => { const d = document.querySelector('[data-amostra="meta"]'); return { valor: d.value, texto: d.control.textContent.trim(), aberto: d.querySelector('fluent-listbox').matches(':popover-open') }; })()`,
    );
    longe();
    await comando('__ttFecharPopovers()');
  }

  // 6. Dicas: mouse parado e foco do teclado.
  for (const nome of ['dica-reiniciar', 'dica-volta']) {
    const p = await comando(`__ttPosicionar(${js(nome)}, 'meio')`);
    mover(r.x + p.clique[0], r.y + p.clique[1]);
    await sleep(900);
    const mouse = await comando(`__ttMedirPopover(${js(nome)})`);
    await captura(`${nome}.png`, r);
    await apertar(Clutter.KEY_Escape);
    const esc = await comando(`__ttMedirPopover(${js(nome)})`);
    await captura(`${nome}-esc.png`, r);
    const dif = diferenca(`${OUT}/${nome}-esc.png`, `${OUT}/${nome}.png`);
    // Mostra de novo (sai e volta) e tira o mouse para o neutro, dentro da
    // janela: a dica some depois do atraso.
    neutro();
    await sleep(500);
    mover(r.x + p.clique[0], r.y + p.clique[1]);
    await sleep(900);
    const deNovo = await comando(`__ttMedirPopover(${js(nome)})`);
    neutro();
    await sleep(900);
    const saiu = await comando(`__ttMedirPopover(${js(nome)})`);
    // E para fora da janela, como um mouse de verdade: do botão até a borda
    // esquerda, passando pelo resto da tela, e para fora. A sonda conta os
    // mouseleave do botão e do documento e diz onde ficou o :hover.
    const SAIDAS = `(() => { const b = document.querySelector('#amostra-${nome}'); window.__ttSaidas = { botao: 0, doc: 0 }; b.addEventListener('mouseleave', () => __ttSaidas.botao++); document.documentElement.addEventListener('mouseleave', () => __ttSaidas.doc++); return true; })()`;
    const ONDE = `({ ...__ttSaidas, hover: document.querySelector('#amostra-${nome}').matches(':hover'), hovers: [...document.querySelectorAll(':hover')].map((e) => e.localName + (e.id ? '#' + e.id : '')).join(' > ') })`;
    await comando(SAIDAS);
    mover(r.x + p.clique[0], r.y + p.clique[1]);
    await sleep(900);
    await deslizar([r.x + p.clique[0], r.y + p.clique[1]], [r.x - 60, r.y + p.clique[1]]);
    await sleep(900);
    const saiuDaJanela = await comando(`__ttMedirPopover(${js(nome)})`);
    const hoverFora = await comando(ONDE);
    // O salto: o ponteiro some do botão direto para fora, sem movimento no
    // meio (só o ponteiro virtual faz isso). Registrado, sem conferência:
    // o WebKitGTK no Wayland não sabe que o mouse saiu (docs/decisoes.md, M12).
    await comando('__ttFecharPopovers()');
    await comando(SAIDAS);
    mover(r.x + p.clique[0], r.y + p.clique[1]);
    await sleep(900);
    longe();
    await sleep(900);
    const salto = { aberta: (await comando(`__ttMedirPopover(${js(nome)})`)).aberto, ...(await comando(ONDE)) };
    neutro();
    await sleep(300);
    await comando('__ttFecharPopovers()');
    neutro();
    await sleep(300);
    await comando(`document.querySelector('#amostra-${nome}').focus()`);
    await sleep(300);
    const teclado = await comando(`__ttMedirPopover(${js(nome)})`);
    await comando('__ttFecharPopovers()');
    R.dicas[nome] = { posicionar: p, mouse, esc, diferenca: dif, deNovo: deNovo.aberto, saiu: saiu.aberto, saiuDaJanela: saiuDaJanela.aberto, hoverFora, salto, teclado };
    salvar();
  }

  // 7. Diálogo.
  {
    const p = await comando("__ttPosicionar('dialogo', 'meio')");
    await clicar(r.x + p.clique[0], r.y + p.clique[1]);
    await sleep(400);
    const aberto = await comando("__ttMedirPopover('dialogo')");
    await captura('dialogo.png', r);
    const { px } = leitorDePixels(`${OUT}/dialogo.png`);
    const d = aberto.popup ?? [0, 0, 0, 0];
    const pixels = { painel: hex(px(100, 300)), dentro: hex(px(Math.round(d[0] + 12), Math.round(d[1] + 6))) };
    const controle = await comando(
      `(() => { const b = document.querySelector('[data-amostra="dialogo-meta"]').control.getBoundingClientRect(); return [Math.round(b.x + b.width / 2), Math.round(b.y + b.height / 2)]; })()`,
    );
    await clicar(r.x + controle[0], r.y + controle[1]);
    const lista = await comando("__ttMedirPopover('dialogo-meta')");
    await captura('dialogo-lista.png', r);
    await apertar(Clutter.KEY_Escape);
    const esc1 = { lista: await comando("__ttMedirPopover('dialogo-meta')"), dialogo: await comando("__ttMedirPopover('dialogo')") };
    await apertar(Clutter.KEY_Escape);
    await sleep(300);
    const esc2 = await comando("__ttMedirPopover('dialogo')");
    await clicar(r.x + p.clique[0], r.y + p.clique[1]);
    await sleep(400);
    const cancelar = await comando(
      `(() => { const b = [...document.querySelectorAll('#amostra-dialogo-meta [slot="action"]')].find((b) => b.textContent.trim() === 'Cancelar').getBoundingClientRect(); return [Math.round(b.x + b.width / 2), Math.round(b.y + b.height / 2)]; })()`,
    );
    await clicar(r.x + cancelar[0], r.y + cancelar[1]);
    await sleep(300);
    const depoisDoCancelar = await comando("__ttMedirPopover('dialogo')");
    R.dialogo = { aberto, pixels, esperado: { painel: hex(FUNDO_LITE.map((v) => Math.round(v * 0.7))), dentro: CARTAO_LITE }, lista, esc1, esc2, depoisDoCancelar };
    longe();
    salvar();
  }

  // 8. Erros na página e fim.
  const erros = sonda().filter((x) => x.tipo === 'erro').map((x) => x.dados);
  checar('nenhum erro na página', erros.length === 0, erros);
  W.delete(global.get_current_time());
  const sumiu = await aguardar(() => janelas().length === 0, 5000);
  checar('fechar pelo compositor fecha a janela', sumiu, { janelas: janelas().length });
  await sleep(1500);
  passo('fim');
}

async function aguardar(fn, ms) {
  const t0 = Date.now();
  let v = fn();
  while (!v && Date.now() - t0 < ms) {
    await sleep(100);
    v = fn();
  }
  return v;
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
