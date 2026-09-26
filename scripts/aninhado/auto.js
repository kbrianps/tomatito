// Roteiro de automação do GNOME Shell aninhado (headless), carregado com
// `gnome-shell --automation-script` pelo dentro.sh. Roda dentro do próprio
// shell: acha as janelas do Tomatito, tira capturas, compara os pixels da caixa
// do tomate com o fundo, arrasta e clica com um ponteiro virtual, confere se o
// clique fora da região de entrada atravessa para a janela de trás (spike B,
// M05) e grava tudo em $TT_OUT/resultado.json. Quando termina, o shell sai
// sozinho.
//
// $TT_SO_TAMANHO=1 para depois de medir a janela (usado para repetir muitas
// vezes a conferência do tamanho).
import Cairo from 'cairo';
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
const LADO = 280; // tamanho M
const K = LADO / 320; // viewBox → px da janela
const R = { passos: [] };

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

function tente(fn) {
  try {
    fn();
  } catch (e) {
    passo(`aviso: ${e}`);
  }
}

let TOMATO = null;
let MAIN = null;
function estado() {
  const f = global.display.focus_window;
  const [px, py] = global.get_pointer();
  const d = (w) => (w ? `${rect(w).x},${rect(w).y}` : '-');
  return `foco=${f ? `${f.get_title()}/${rect(f).w}` : '-'} ponteiro=${px},${py} main=${d(MAIN)} tomato=${d(TOMATO)}`;
}
const passo = (m) => {
  R.passos.push(`${Math.round(GLib.get_monotonic_time() / 1000)} ${m} | ${estado()}`);
  salvar();
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

// Eventos da sonda de uma janela só ('tomato' ou 'main').
const daJanela = (lista, janela) => lista.filter((e) => e.janela === janela);

// Região que o app calculou (linha "[tomato] região: ..." do stderr, só no debug).
function regiaoDoApp() {
  const [, bytes] = GLib.file_get_contents(`${OUT}/app.log`);
  const m = new TextDecoder().decode(bytes).match(/\[tomato\] regi\S+: \d+ ret\S+ em \d+ px: (\[.*\])/);
  return m ? JSON.parse(m[1]) : null;
}

async function esperar(fn, ms, oque) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const v = fn();
    if (v) return v;
    await sleep(200);
  }
  throw new Error(`tempo esgotado: ${oque}`);
}

async function captura(nome, area) {
  const shooter = new Shell.Screenshot();
  const s = Gio.File.new_for_path(`${OUT}/${nome}`).replace(null, false, Gio.FileCreateFlags.NONE, null);
  if (area) await shooter.screenshot_area(area.x, area.y, area.w, area.h, s);
  else await shooter.screenshot(false, s);
  s.close(null);
  passo(`captura ${nome}`);
}

// Compara a caixa `box` em duas capturas de tela inteira.
function comparar(semTomate, comTomate, box) {
  const a = GdkPixbuf.Pixbuf.new_from_file(`${OUT}/${semTomate}`);
  const b = GdkPixbuf.Pixbuf.new_from_file(`${OUT}/${comTomate}`);
  const [pa, pb] = [a.get_pixels(), b.get_pixels()];
  const [ra, rb] = [a.get_rowstride(), b.get_rowstride()];
  const [na, nb] = [a.get_n_channels(), b.get_n_channels()];
  const px = (p, r, n, x, y) => {
    const i = y * r + x * n;
    return [p[i], p[i + 1], p[i + 2]];
  };
  const dif = (x, y) => {
    const [u, v] = [px(pa, ra, na, x, y), px(pb, rb, nb, x, y)];
    return Math.max(Math.abs(u[0] - v[0]), Math.abs(u[1] - v[1]), Math.abs(u[2] - v[2]));
  };
  let iguais = 0;
  for (let y = box.y; y < box.y + box.h; y++) for (let x = box.x; x < box.x + box.w; x++) if (dif(x, y) === 0) iguais++;
  const B = 24;
  const cantos = {};
  const origens = { sup_esq: [0, 0], sup_dir: [box.w - B, 0], inf_esq: [0, box.h - B], inf_dir: [box.w - B, box.h - B] };
  for (const [nome, [ox, oy]] of Object.entries(origens)) {
    let max = 0;
    let preto = 0;
    let branco = 0;
    for (let y = 0; y < B; y++)
      for (let x = 0; x < B; x++) {
        const [X, Y] = [box.x + ox + x, box.y + oy + y];
        max = Math.max(max, dif(X, Y));
        const c = px(pb, rb, nb, X, Y);
        const f = px(pa, ra, na, X, Y);
        if (c[0] + c[1] + c[2] <= 15 && f[0] + f[1] + f[2] > 15) preto++;
        if (Math.min(...c) >= 245 && Math.min(...f) < 245) branco++;
      }
    const meio = [box.x + ox + B / 2, box.y + oy + B / 2];
    cantos[nome] = { dif_max: max, pretos_novos: preto, brancos_novos: branco, pixel: px(pb, rb, nb, ...meio), fundo: px(pa, ra, na, ...meio) };
  }
  return { caixa: box, bloco_canto_px: B, iguais_ao_fundo_pct: Math.round((1000 * iguais) / (box.w * box.h)) / 10, cantos };
}

let ptr;
const agora = () => GLib.get_monotonic_time();
const mover = (x, y) => ptr.notify_absolute_motion(agora(), x, y);
const botao = (apertado) =>
  ptr.notify_button(agora(), Clutter.BUTTON_PRIMARY, apertado ? Clutter.ButtonState.PRESSED : Clutter.ButtonState.RELEASED);

async function semVisaoGeral() {
  if (!Main.overview.visible) return;
  Main.overview.hide();
  await sleep(600);
  passo('visão geral estava aberta; fechada');
}

async function moverJanela(w, x, y) {
  w.move_frame(true, x, y);
  await sleep(700);
  return rect(w);
}

// Aperta em (vx, vy) do viewBox, arrasta (dx, dy) e confere se a janela andou junto.
async function arrastar(nome, vx, vy, dx, dy) {
  await semVisaoGeral();
  const r0 = rect(TOMATO);
  const [x, y] = [r0.x + vx * K, r0.y + vy * K];
  const n0 = sonda().length;
  mover(x, y);
  await sleep(150);
  botao(true);
  await sleep(400); // o drag.js pede o start_dragging pelo IPC
  for (let i = 1; i <= 15; i++) {
    mover(x + (dx * i) / 15, y + (dy * i) / 15);
    await sleep(30);
  }
  await sleep(200);
  botao(false);
  await sleep(600);
  const r1 = rect(TOMATO);
  const delta = [r1.x - r0.x, r1.y - r0.y];
  R.arraste[nome] = {
    ponto_viewbox: [vx, vy],
    pedido: [dx, dy],
    delta,
    moveu: Math.abs(delta[0] - dx) <= 3 && Math.abs(delta[1] - dy) <= 3,
    alvo: daJanela(sonda().slice(n0), 'tomato').find((e) => e.tipo === 'mousedown')?.dados.alvo ?? null,
  };
  passo(`arraste ${nome}: delta ${delta}`);
}

async function clicar(x, y) {
  await semVisaoGeral();
  mover(x, y);
  await sleep(120);
  botao(true);
  await sleep(80);
  botao(false);
  await sleep(450);
}

async function principal() {
  passo('início');
  // O canto ativo abriria a visão geral: o ponteiro virtual nasce em (0,0).
  tente(() => new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' }).set_boolean('enable-hot-corners', false));
  tente(() => (Main.messageTray.bannerBlocked = true)); // sem GDM, o shell avisa que não há bloqueio de tela
  ptr = global.stage.context.get_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
  await sleep(200);
  mover(960, 1000);
  await sleep(300);
  await semVisaoGeral();

  const ws = await esperar(
    () => (janelas().length >= 2 && janelas().every((w) => rect(w).w > 0) ? janelas() : null),
    120000,
    'as duas janelas do Tomatito',
  );
  await sleep(500);
  ws.sort((a, b) => rect(a).w * rect(a).h - rect(b).w * rect(b).h);
  [TOMATO, MAIN] = ws;
  passo('janelas encontradas');

  try {
    await esperar(() => daJanela(sonda(), 'tomato').some((e) => e.tipo === 'info'), 30000, 'sonda');
    R.pagina = daJanela(sonda(), 'tomato').find((e) => e.tipo === 'info').dados;
  } catch {
    R.pagina = null; // a página não chegou a desenhar dois quadros
  }
  await sleep(1000);
  R.tomato = { frame: rect(TOMATO), buffer: buffer(TOMATO), decorada: TOMATO.decorated, sempre_no_topo: TOMATO.is_above() };
  R.tamanho_ok = R.tomato.frame.w === LADO && R.tomato.frame.h === LADO && R.tomato.buffer.w === LADO && R.tomato.buffer.h === LADO;
  passo(`tomato ${R.tomato.frame.w}x${R.tomato.frame.h}`);
  if (GLib.getenv('TT_SO_TAMANHO')) return;

  // A main vai para a direita, fora da área dos testes.
  await moverJanela(MAIN, 1080, 380);
  // Fundo sem o tomate na caixa B; depois o tomate em B.
  const B = { x: 500, y: 300, w: LADO, h: LADO };
  await moverJanela(TOMATO, 80, 120);
  await sleep(1500);
  await captura('fundo.png');
  await moverJanela(TOMATO, B.x, B.y);
  await sleep(1200);
  await captura('com-tomate.png');
  await captura('spike-a.png', { x: B.x - 80, y: B.y - 70, w: B.w + 160, h: B.h + 140 });
  R.transparencia = comparar('fundo.png', 'com-tomate.png', B);
  R.transparencia.ok = Object.values(R.transparencia.cantos).every((c) => c.dif_max === 0 && !c.pretos_novos && !c.brancos_novos);
  passo('transparência comparada');

  R.arraste = {};
  await arrastar('corpo', 70, 200, 150, 40);
  await moverJanela(TOMATO, B.x, B.y);
  await arrastar('cabinho', 162, 60, -160, 60);
  await moverJanela(TOMATO, B.x, B.y);
  await arrastar('calice', 183, 67, -120, -80);
  await moverJanela(TOMATO, B.x, B.y);

  const r0 = rect(TOMATO);
  const n0 = sonda().length;
  const botoes = { voltar: [88, 122], configuracoes: [232, 122], reiniciar: [106, 252], 'iniciar-pausar': [160, 252], pular: [214, 252] };
  for (const [nome, [vx, vy]] of Object.entries(botoes)) {
    await clicar(r0.x + vx * K, r0.y + vy * K);
    passo(`clique ${nome}`);
  }
  await sleep(600);
  const logs = daJanela(sonda().slice(n0), 'tomato').filter((e) => e.tipo === 'log').map((e) => e.dados);
  R.botoes = {
    logs,
    todos: Object.keys(botoes).every((n) => logs.includes(`[tomato] botão: ${n}`)),
    janela_parada: JSON.stringify(r0) === JSON.stringify(rect(TOMATO)),
  };
  await captura('depois-dos-cliques.png', { x: r0.x - 80, y: r0.y - 70, w: r0.w + 160, h: r0.h + 140 });

  // Spike B (M05): arraste pelo "ombro" (dentro do corpo, fora da elipse da
  // região, coberto só pelo retângulo dos ombros).
  await arrastar('ombro', 34, 120, 130, 50);
  await moverJanela(TOMATO, B.x, B.y);

  // Clique atravessando: a main (branca) fica atrás de toda a caixa do tomate.
  await moverJanela(MAIN, B.x - 100, B.y - 100);
  Main.activateWindow(TOMATO);
  await sleep(800);
  await captura('spike-b-base.png', { x: B.x - 80, y: B.y - 70, w: B.w + 160, h: B.h + 140 });
  desenharRegiao('spike-b-base.png', 'spike-b-regiao.png', 80, 70);
  // Pontos em px da janela. Os seis primeiros ficam fora da região e devem ir
  // para a main; o último fica na zona morta (dentro do retângulo dos ombros,
  // mas fora do desenho) e deve ficar no tomate.
  const fora = {
    canto_sup_esq: [4, 4],
    canto_sup_dir: [LADO - 5, 4],
    canto_inf_esq: [4, LADO - 5],
    canto_inf_dir: [LADO - 5, LADO - 5],
    lado_esq: [8 * K, 200 * K],
    acima_do_cabinho: [160 * K, 20 * K],
    sombra_embaixo: [160 * K, 312 * K],
  };
  const dentro = { zona_morta_ombro: [22 * K, 70 * K] };
  R.atravessa = {};
  for (const [nome, [x, y]] of Object.entries({ ...fora, ...dentro })) {
    Main.activateWindow(TOMATO);
    await sleep(600);
    const r = rect(TOMATO);
    const focoAntes = global.display.focus_window;
    const n = sonda().length;
    await clicar(r.x + x, r.y + y);
    await sleep(300);
    const foco = global.display.focus_window;
    const eventos = sonda().slice(n).filter((e) => e.tipo === 'mousedown');
    const esperado = nome in fora ? 'main' : 'tomato';
    R.atravessa[nome] = {
      px: [Math.round(x), Math.round(y)],
      esperado,
      foco_antes: focoAntes === TOMATO ? 'tomato' : focoAntes === MAIN ? 'main' : '-',
      foco_depois: foco === TOMATO ? 'tomato' : foco === MAIN ? 'main' : '-',
      mousedown: eventos.map((e) => `${e.janela} (${e.dados.x}, ${e.dados.y}) ${e.dados.alvo}`),
    };
    const a = R.atravessa[nome];
    a.ok =
      a.foco_antes === 'tomato' &&
      a.foco_depois === esperado &&
      eventos.length > 0 &&
      eventos.every((e) => e.janela === esperado);
    passo(`clique em ${nome}: foi para ${a.foco_depois}`);
  }
  passo('fim');
}

// Desenha a região de entrada por cima de uma captura e grava outro PNG:
// dentro do contorno azul, o tomate recebe o clique; fora, o clique atravessa.
// A região do spike tem uma faixa por grupo de linhas, então o contorno sai
// ligando as pontas de cada faixa às da seguinte.
function desenharRegiao(base, destino, ox, oy) {
  const faixas = regiaoDoApp();
  if (!faixas) {
    passo('aviso: região do app não encontrada no app.log');
    return;
  }
  faixas.sort((a, b) => a[1] - b[1]);
  const sup = Cairo.ImageSurface.createFromPNG(`${OUT}/${base}`);
  const cr = new Cairo.Context(sup);
  cr.setSourceRGBA(0.0, 0.47, 0.83, 0.16);
  for (const [x, y, w, h] of faixas) cr.rectangle(ox + x, oy + y, w, h);
  cr.fill();
  const [x0, y0] = faixas[0];
  cr.moveTo(ox + x0, oy + y0);
  for (const [x, y, w, h] of faixas) cr.lineTo(ox + x + w, oy + y), cr.lineTo(ox + x + w, oy + y + h);
  for (const [x, y, , h] of [...faixas].reverse()) cr.lineTo(ox + x, oy + y + h), cr.lineTo(ox + x, oy + y);
  cr.closePath();
  cr.setSourceRGBA(0.0, 0.35, 0.72, 0.95);
  cr.setLineWidth(1.5);
  cr.stroke();
  cr.$dispose();
  sup.writeToPNG(`${OUT}/${destino}`);
  passo(`captura ${destino}`);
}

export async function run() {
  try {
    await principal();
  } catch (e) {
    R.erro = `${e}\n${e.stack}`;
    salvar();
  }
}
