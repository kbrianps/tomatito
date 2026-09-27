// Roteiro do M07 (barra de título), carregado com `gnome-shell
// --automation-script` pelo dentro.sh. Roda dentro do próprio shell, com
// ponteiro e teclado virtuais, e grava $TT_OUT/resultado.json. Confere, na
// janela main de verdade (WebKitGTK no Mutter 50, Wayland):
//   - sem moldura do sistema e com a borda de 1 px em --tt-border (Linux);
//   - hover dos botões (o X em #C42B1C com glifo branco);
//   - arrastar pela barra (título, ícone, área vazia), e não pelos botões nem
//     pelo conteúdo;
//   - maximizar e restaurar com duplo clique e pelo botão; o glifo e o rótulo
//     acompanham o estado, inclusive quando o próprio shell maximiza;
//   - minimizar;
//   - redimensionar pelas quatro bordas e por um canto, e o mínimo de 480 px;
//   - Ctrl+= / Ctrl+- / Ctrl+0 mudam o zoom;
//   - fechar: a janela some e o app sai (conferido pelo dentro.sh).
// Quando termina, o shell sai sozinho.
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
const R = { passos: [], checagens: {} };

// Cores do Lite (src/styles/tokens.css).
const BG_APP = [0xa5, 0x34, 0x2b];
const BORDA = [0xbd, 0x63, 0x59];
const FECHAR = [0xc4, 0x2b, 0x1c];

const salvar = () => GLib.file_set_contents(`${OUT}/resultado.json`, JSON.stringify(R, null, 2));
const sleep = (ms) =>
  new Promise((r) => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => (r(), GLib.SOURCE_REMOVE)));
const rect = (w) => {
  const r = w.get_frame_rect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
};
const buffer = (w) => {
  const r = w.get_buffer_rect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
};
const janelas = () =>
  global.get_window_actors().map((a) => a.meta_window).filter((w) => w.get_title() === 'Tomatito');

let W = null;
const passo = (m) => {
  const f = global.display.focus_window;
  const [px, py] = global.get_pointer();
  const d = W ? `${JSON.stringify(rect(W))} max=${W.is_maximized()} min=${W.minimized}` : '-';
  R.passos.push(`${Math.round(GLib.get_monotonic_time() / 1000)} ${m} | foco=${f ? f.get_title() : '-'} ponteiro=${px},${py} janela=${d}`);
  salvar();
};
const checar = (nome, ok, detalhe) => {
  R.checagens[nome] = { ok: Boolean(ok), detalhe };
  passo(`${ok ? 'ok' : 'FALHA'}: ${nome}`);
};
function tente(fn) {
  try {
    fn();
  } catch (e) {
    passo(`aviso: ${e}`);
  }
}

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

async function duploClique(x, y) {
  await semVisaoGeral();
  mover(x, y);
  await sleep(150);
  botao(true);
  await sleep(40);
  botao(false);
  await sleep(90);
  botao(true);
  await sleep(40);
  botao(false);
  await sleep(1000);
}

// Aperta em (x, y), arrasta (dx, dy) em 15 passos e solta.
async function arrastar(x, y, dx, dy) {
  await semVisaoGeral();
  mover(x, y);
  await sleep(200);
  botao(true);
  await sleep(400); // o drag.js pede o start_dragging pelo IPC
  for (let i = 1; i <= 15; i++) {
    mover(x + (dx * i) / 15, y + (dy * i) / 15);
    await sleep(30);
  }
  await sleep(250);
  botao(false);
  await sleep(700);
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
  await sleep(700);
}

async function posicionar(x, y, w, h) {
  if (W.is_maximized()) W.unmaximize();
  await sleep(300);
  W.move_resize_frame(true, x, y, w, h);
  await sleep(800);
  return rect(W);
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
  const pb = GdkPixbuf.Pixbuf.new_from_file(`${OUT}/${arquivo}`);
  const p = pb.get_pixels();
  const r = pb.get_rowstride();
  const n = pb.get_n_channels();
  return (x, y) => {
    const i = y * r + x * n;
    return [p[i], p[i + 1], p[i + 2]];
  };
}
const perto = (a, b, tol = 2) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();

async function principal() {
  passo('início');
  // O canto ativo abriria a visão geral: o ponteiro virtual nasce em (0,0).
  tente(() => new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' }).set_boolean('enable-hot-corners', false));
  tente(() => (Main.messageTray.bannerBlocked = true)); // sem GDM, o shell avisa que não há bloqueio de tela
  const seat = global.stage.context.get_backend().get_default_seat();
  ptr = seat.create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
  kb = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
  await sleep(200);
  mover(960, 1070);
  await sleep(300);
  await semVisaoGeral();

  W = (await esperar(() => (janelas().length && rect(janelas()[0]).w > 0 ? janelas() : null), 120000, 'a janela do Tomatito'))[0];
  await esperar(() => estado()?.botoes?.length === 3, 30000, 'a barra de título desenhada (sonda)');
  await sleep(800);
  R.inicial = { frame: rect(W), buffer: buffer(W), decorada: W.decorated, maximizada: W.is_maximized(), estado: estado() };
  R.info = sonda().find((e) => e.tipo === 'info')?.dados ?? null;
  const f0 = R.inicial.frame;
  checar('1000 x 700, sem moldura do sistema (frame = buffer)', f0.w === 1000 && f0.h === 700 && JSON.stringify(f0) === JSON.stringify(R.inicial.buffer) && !W.decorated, R.inicial);
  checar('initialization_script: __TT_PREF__ = "lite" e __TT_PLATFORM__ = "linux"', R.info?.pref === 'lite' && R.info?.platform === 'linux', R.info);
  checar('botões fora do Tab (tabindex=-1) e com aria-label', R.inicial.estado.botoes.every((b) => b.tabindex === '-1' && b.rotulo), R.inicial.estado.botoes);

  let r = await posicionar(300, 150, 1000, 700);
  mover(960, 1070);
  await sleep(500);

  // Borda de 1 px (Linux) e fundo por dentro.
  await captura('janela.png', { x: r.x - 20, y: r.y - 20, w: r.w + 40, h: r.h + 40 });
  await captura('tela.png');
  let px = leitorDePixels('tela.png');
  const bordas = {
    cima: [px(r.x + 600, r.y), px(r.x + 600, r.y + 1)],
    baixo: [px(r.x + 500, r.y + r.h - 1), px(r.x + 500, r.y + r.h - 2)],
    esquerda: [px(r.x, r.y + 350), px(r.x + 1, r.y + 350)],
    direita: [px(r.x + r.w - 1, r.y + 350), px(r.x + r.w - 2, r.y + 350)],
  };
  checar(
    'borda de 1 px em --tt-border (#BD6359) nos quatro lados, com o fundo #A5342B logo dentro',
    Object.values(bordas).every(([b, d]) => perto(b, BORDA) && perto(d, BG_APP)),
    Object.fromEntries(Object.entries(bordas).map(([k, [b, d]]) => [k, `${hex(b)} / ${hex(d)}`])),
  );

  // Hover: o X fica #C42B1C com glifo branco; o minimizar ganha o subtle-hover.
  const cx = (i) => r.x + r.w - 23 - 46 * i; // 0 = fechar, 1 = maximizar, 2 = minimizar
  const antes = px(r.x + r.w - 40, r.y + 8);
  mover(cx(0), r.y + 16);
  await sleep(600);
  await captura('hover-fechar.png', { x: r.x + r.w - 160, y: r.y, w: 160, h: 32 });
  await captura('tela.png');
  px = leitorDePixels('tela.png');
  const fundoX = px(r.x + r.w - 40, r.y + 8);
  let maisClaro = [0, 0, 0];
  for (let y = r.y + 11; y < r.y + 21; y++)
    for (let x = cx(0) - 5; x < cx(0) + 5; x++) {
      const c = px(x, y);
      if (Math.min(...c) > Math.min(...maisClaro)) maisClaro = c;
    }
  const eX = await aguardar(() => (estado()?.pairado?.acao === 'fechar' ? estado() : null), 2000);
  checar(
    'hover do X: fundo #C42B1C e glifo branco',
    perto(antes, BG_APP) && perto(fundoX, FECHAR) && perto(maisClaro, [255, 255, 255], 3) &&
      eX?.pairado.fundo === 'rgb(196, 43, 28)' && eX?.pairado.cor === 'rgb(255, 255, 255)',
    { antes: hex(antes), fundo: hex(fundoX), glifo_mais_claro: hex(maisClaro), sonda: eX?.pairado ?? null },
  );
  mover(cx(2), r.y + 16);
  await sleep(600);
  const eMin = await aguardar(() => (estado()?.pairado?.acao === 'minimizar' ? estado() : null), 2000);
  checar('hover do minimizar: --tt-subtle-hover (branco a 6%)', eMin?.pairado.fundo === 'rgba(255, 255, 255, 0.06)', eMin?.pairado ?? null);
  mover(960, 1070);
  await sleep(300);

  // Arrastar pela barra: pelo título, pelo ícone e pela área vazia.
  R.arraste = {};
  const arrasteDe = async (nome, x, y, dx, dy, deveMover) => {
    const a = rect(W);
    await arrastar(a.x + x, a.y + y, dx, dy);
    const b = rect(W);
    const delta = [b.x - a.x, b.y - a.y];
    R.arraste[nome] = { de: [x, y], pedido: [dx, dy], delta, tamanho: [b.w, b.h] };
    const moveu = Math.abs(delta[0] - dx) <= 3 && Math.abs(delta[1] - dy) <= 3;
    const parada = delta[0] === 0 && delta[1] === 0 && b.w === a.w && b.h === a.h;
    checar(`arrastar ${nome} ${deveMover ? 'move' : 'não move'} a janela`, deveMover ? moveu : parada, R.arraste[nome]);
  };
  await arrasteDe('pelo título', 60, 16, 150, 80, true);
  await arrasteDe('pelo ícone', 24, 16, -120, 40, true);
  await arrasteDe('pela área vazia da barra', 500, 16, -60, -90, true);
  await arrasteDe('pelo botão minimizar', 1000 - 115, 16, 100, 60, false);
  checar('soltar fora do botão não minimiza', !W.minimized, { minimizada: W.minimized });
  await arrasteDe('pelo conteúdo', 500, 300, 100, 60, false);

  // Duplo clique na barra: maximiza e restaura.
  r = await posicionar(300, 150, 1000, 700);
  const area = W.get_work_area_current_monitor();
  R.area_de_trabalho = { x: area.x, y: area.y, w: area.width, h: area.height };
  await duploClique(r.x + 500, r.y + 16);
  let m = rect(W);
  let e = await aguardar(() => (estado()?.maximizada ? estado() : null), 3000);
  checar(
    'duplo clique na barra maximiza (glifo e rótulo de Restaurar)',
    W.is_maximized() && m.w === area.width && m.h === area.height && e?.meio.rotulo === 'Restaurar' && e?.meio.glifo === 2,
    { frame: m, meio: e?.meio ?? estado()?.meio },
  );
  await captura('maximizada.png', { x: m.x + m.w - 200, y: m.y, w: 200, h: 40 });
  await captura('tela.png');
  px = leitorDePixels('tela.png');
  const cantoMax = [px(m.x + m.w - 1, m.y + 300), px(m.x + 900, m.y + m.h - 1)];
  checar(
    'maximizada, a borda de 1 px some',
    e?.borda?.display === 'none' && cantoMax.every((c) => !perto(c, BORDA)),
    { sonda: e?.borda ?? null, direita: hex(cantoMax[0]), baixo: hex(cantoMax[1]) },
  );
  await duploClique(m.x + 500, m.y + 16);
  m = rect(W);
  e = await aguardar(() => (estado() && !estado().maximizada ? estado() : null), 3000);
  checar(
    'duplo clique de novo restaura (1000 x 700, glifo e rótulo de Maximizar)',
    !W.is_maximized() && m.w === 1000 && m.h === 700 && e?.meio.rotulo === 'Maximizar' && e?.meio.glifo === 1 && e?.borda?.display === 'block',
    { frame: m, meio: e?.meio ?? estado()?.meio },
  );

  // Botão do meio: maximiza e restaura.
  r = await posicionar(300, 150, 1000, 700);
  await clicar(r.x + r.w - 69, r.y + 16);
  await sleep(500);
  m = rect(W);
  e = await aguardar(() => (estado()?.maximizada ? estado() : null), 3000);
  checar('botão Maximizar maximiza', W.is_maximized() && e?.meio.rotulo === 'Restaurar' && e?.meio.glifo === 2, { frame: m, meio: e?.meio ?? null });
  await clicar(m.x + m.w - 69, m.y + 16);
  await sleep(500);
  m = rect(W);
  e = await aguardar(() => (estado() && !estado().maximizada ? estado() : null), 3000);
  checar('botão Restaurar restaura', !W.is_maximized() && m.w === 1000 && m.h === 700 && e?.meio.rotulo === 'Maximizar', { frame: m, meio: e?.meio ?? null });

  // O glifo acompanha o onResized também quando quem maximiza é o shell (Super+↑).
  W.maximize();
  await sleep(800);
  e = await aguardar(() => (estado()?.maximizada ? estado() : null), 3000);
  const viaShell = e?.meio ?? null;
  W.unmaximize();
  await sleep(800);
  e = await aguardar(() => (estado() && !estado().maximizada ? estado() : null), 3000);
  checar('maximizar e restaurar pelo shell trocam o glifo', viaShell?.rotulo === 'Restaurar' && e?.meio.rotulo === 'Maximizar', { maximizada: viaShell, restaurada: e?.meio ?? null });

  // Minimizar.
  r = await posicionar(300, 150, 1000, 700);
  await clicar(r.x + r.w - 115, r.y + 16);
  const minimizou = await aguardar(() => W.minimized, 3000);
  checar('botão Minimizar minimiza', minimizou, { minimizada: W.minimized });
  W.unminimize();
  Main.activateWindow(W);
  await sleep(1000);

  // Redimensionar pelas bordas (5 px por dentro da janela, tao/tauri-runtime-wry).
  R.bordas = {};
  const puxar = async (nome, x, y, dx, dy, esperado) => {
    const a = await posicionar(300, 150, 1000, 700);
    await arrastar(a.x + x(a), a.y + y(a), dx, dy);
    const b = rect(W);
    const quer = esperado(a);
    R.bordas[nome] = { antes: a, depois: b, esperado: quer };
    checar(
      `redimensionar ${nome}`,
      ['x', 'y', 'w', 'h'].every((k) => Math.abs(b[k] - quer[k]) <= 3),
      R.bordas[nome],
    );
  };
  await puxar('pela borda direita', (a) => a.w - 2, (a) => a.h / 2, 120, 0, (a) => ({ ...a, w: a.w + 120 }));
  await puxar('pela borda de baixo', (a) => a.w / 2, (a) => a.h - 2, 0, 80, (a) => ({ ...a, h: a.h + 80 }));
  await puxar('pela borda esquerda', () => 2, (a) => a.h / 2, -50, 0, (a) => ({ ...a, x: a.x - 50, w: a.w + 50 }));
  await puxar('pela borda de cima (sobre a barra)', (a) => a.w / 2, () => 2, 0, -40, (a) => ({ ...a, y: a.y - 40, h: a.h + 40 }));
  await puxar('pelo canto de baixo à direita', (a) => a.w - 2, (a) => a.h - 2, -100, -60, (a) => ({ ...a, w: a.w - 100, h: a.h - 60 }));
  await puxar('até o mínimo (480 x 500)', (a) => a.w - 2, (a) => a.h - 2, -800, -600, (a) => ({ ...a, w: 480, h: 500 }));

  // Zoom: Ctrl+= / Ctrl+- / Ctrl+0 (script do Tauri + set_webview_zoom).
  r = await posicionar(300, 150, 1000, 700);
  await clicar(r.x + 700, r.y + 70); // foco no conteúdo
  const larguras = { inicial: estado()?.inner?.[0] };
  const zoom = async (nome, ...teclas) => {
    await atalho(...teclas);
    larguras[nome] = (await aguardar(() => estado()?.inner?.[0], 1000)) ?? null;
    await sleep(300);
    larguras[nome] = estado()?.inner?.[0];
  };
  await zoom('ctrl_igual', Clutter.KEY_Control_L, Clutter.KEY_equal);
  await captura('zoom-120.png', { x: r.x, y: r.y, w: r.w, h: 120 });
  await zoom('ctrl_menos', Clutter.KEY_Control_L, Clutter.KEY_minus);
  await zoom('ctrl_menos_2', Clutter.KEY_Control_L, Clutter.KEY_minus);
  await zoom('ctrl_0', Clutter.KEY_Control_L, Clutter.KEY_0);
  R.zoom = { larguras, teclas: sonda().filter((x) => x.tipo === 'keydown').map((x) => x.dados) };
  const L = larguras;
  checar(
    'Ctrl+= aumenta o zoom (120%), Ctrl+- diminui (100% e 80%) e Ctrl+0 volta a 100%',
    L.inicial === 1000 && Math.abs(L.ctrl_igual - 1000 / 1.2) <= 2 && L.ctrl_menos === 1000 && Math.abs(L.ctrl_menos_2 - 1000 / 0.8) <= 2 && L.ctrl_0 === 1000,
    L,
  );

  // Fechar: a janela some; o dentro.sh confere se o app saiu sozinho.
  r = rect(W);
  await clicar(r.x + r.w - 23, r.y + 16);
  const sumiu = await aguardar(() => janelas().length === 0, 5000);
  checar('botão Fechar fecha a janela', sumiu, { janelas: janelas().length });
  await sleep(2000);
  passo('fim');
}

export async function run() {
  try {
    await principal();
  } catch (e) {
    R.erro = `${e}\n${e.stack}`;
    salvar();
  }
}
