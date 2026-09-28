// Roteiro do M34 (tela Cronômetro), carregado com `gnome-shell
// --automation-script` pelo dentro.sh. Na janela main de verdade, com o motor
// de verdade e o state.json no disco:
//
//   bash scripts/gnome-aninhado/rodar.sh cronometro
//
// O "Pronto quando" do M34, no que dá para medir sem um humano:
//   1. abre a tela pelo painel (um clique de verdade no item): 00:00:00,00,
//      "Marcar volta" e "Redefinir" desabilitados;
//   2. clica (ponteiro virtual) em "Iniciar": o state.json passa a running,
//      com startedAt; os centésimos mudam a cada quadro (amostra de 1 s);
//   3. L (teclado virtual, com o foco no título) marca volta: o state.json
//      ganha a volta;
//   4. a janela é minimizada por 20 s e depois escondida (hide do Tauri) por
//      20 s. Ao voltar, o tempo na tela confere com o relógio monotônico da
//      página (performance.now, que não depende do relógio de parede nem do
//      Rust), com no máximo 50 ms de diferença; e o primeiro quadro depois de
//      voltar já mostra o tempo certo (captura);
//   5. Espaço pausa: o número para, e o state.json tem o acumulado;
//      "Redefinir" (clique) zera, e o state.json fica idle, sem voltas.
// No fim, fecha a janela pelo compositor. Os 10 min contra o relógio do
// celular ficam para a conferência manual (docs/verificacao-manual.md, M34).
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import 'resource:///org/gnome/shell/ui/screenshot.js'; // promisifica Shell.Screenshot

export const METRICS = {};

const OUT = GLib.getenv('TT_OUT');
const SONDA_LOG = GLib.getenv('SONDA_LOG');
const R = { passos: [], checagens: {}, medidas: {} };

const salvar = () => GLib.file_set_contents(`${OUT}/resultado.json`, JSON.stringify(R, null, 2));
const sleep = (ms) =>
  new Promise((r) => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => (r(), GLib.SOURCE_REMOVE)));
const agoraMs = () => GLib.get_monotonic_time() / 1000;
const agora = () => GLib.get_monotonic_time();
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
    return new TextDecoder().decode(bytes).split('\n').filter(Boolean).map((l) => JSON.parse(l));
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

let nComando = 0;
async function comando(js, prazo = 10000) {
  const id = `c${++nComando}`;
  GLib.file_set_contents(`${OUT}/comando.json`, JSON.stringify({ id, js }));
  const r = await esperar(() => sonda().find((e) => e.tipo === 'comando' && e.dados.id === id), prazo, `comando ${js.slice(0, 80)}`);
  const texto = JSON.stringify(r.dados.resultado) ?? 'null';
  passo(`comando ${js.slice(0, 120)} => ${texto.length > 400 ? `${texto.slice(0, 400)}…` : texto}`);
  return r.dados.resultado;
}

let W = null;
let ptr;
let kb;
const mover = (x, y) => ptr.notify_absolute_motion(agora(), x, y);

async function clicarEm(seletor) {
  const ret = await comando(`(() => { const r = document.querySelector(${JSON.stringify(seletor)}).getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; })()`);
  const fr = W.get_frame_rect();
  const x = fr.x + Math.round(ret[0] + ret[2] / 2);
  const y = fr.y + Math.round(ret[1] + ret[3] / 2);
  mover(x - 10, y - 10);
  await sleep(300);
  mover(x, y);
  await sleep(150);
  ptr.notify_button(agora(), Clutter.BUTTON_PRIMARY, Clutter.ButtonState.PRESSED);
  await sleep(60);
  ptr.notify_button(agora(), Clutter.BUTTON_PRIMARY, Clutter.ButtonState.RELEASED);
  await sleep(700);
}

async function apertar(keyval) {
  kb.notify_keyval(agora(), keyval, Clutter.KeyState.PRESSED);
  await sleep(40);
  kb.notify_keyval(agora(), keyval, Clutter.KeyState.RELEASED);
  await sleep(500);
}

async function captura(nome) {
  const fr = W.get_frame_rect();
  const shooter = new Shell.Screenshot();
  const s = Gio.File.new_for_path(`${OUT}/${nome}`).replace(null, false, Gio.FileCreateFlags.NONE, null);
  await shooter.screenshot_area(fr.x, fr.y, fr.width, fr.height, s);
  s.close(null);
  passo(`captura ${nome}`);
}

const PASTAS = ['io.github.kbrianps.tomatito.dev', 'io.github.kbrianps.tomatito'].map((id) => `${GLib.getenv('XDG_DATA_HOME')}/${id}`);
const pastaDeDados = () => PASTAS.find((p) => GLib.file_test(p, GLib.FileTest.IS_DIR)) ?? PASTAS[0];
let nEstado = 0;
function lerEstado() {
  try {
    const [, bytes] = GLib.file_get_contents(`${pastaDeDados()}/state.json`);
    const texto = new TextDecoder().decode(bytes);
    GLib.file_set_contents(`${OUT}/m34-state-${++nEstado}.json`, texto);
    return JSON.parse(texto);
  } catch (e) {
    return { erro: String(e) };
  }
}

// O que a tela mostra, com o relógio monotônico da página no mesmo instante.
const LER = `(() => { const q = (s) => document.querySelector(s);
  const [h, mi, s, cs] = [q('[data-horas]'), q('[data-minutos]'), q('[data-segundos]'), q('[data-centesimos]')].map((x) => Number(x?.textContent));
  return { texto: [q('[data-horas]')?.textContent, q('[data-minutos]')?.textContent, q('[data-segundos]')?.textContent].join(':') + ',' + q('[data-centesimos]')?.textContent,
    ms: ((h * 60 + mi) * 60 + s) * 1000 + cs * 10, perf: performance.now(),
    estado: q('[data-cronometro]')?.dataset.estado, rotulo: q('[data-tempo]')?.getAttribute('aria-label'),
    botoes: [...document.querySelectorAll('.tt-cronometro-botoes button')].map((b) => [b.dataset.acao, b.disabled]) }; })()`;
// Uma amostra de 1 s, quadro a quadro: quantos quadros e quantos valores
// diferentes de centésimos apareceram.
const AMOSTRA = `new Promise((res) => { const t0 = performance.now(); let quadros = 0; const vistos = new Set();
  const f = () => { quadros++; vistos.add(document.querySelector('[data-centesimos]').textContent + document.querySelector('[data-segundos]').textContent);
    if (performance.now() - t0 < 1000) requestAnimationFrame(f); else res({ quadros, valores: vistos.size }); }; requestAnimationFrame(f); })`;

async function principal() {
  passo('início');
  const seat = global.stage.context.get_backend().get_default_seat();
  ptr = seat.create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
  kb = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
  try {
    new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' }).set_boolean('enable-hot-corners', false);
  } catch {
    // sem o esquema: segue
  }
  await sleep(200);
  mover(960, 1070);
  await sleep(1000);
  W = (await esperar(() => (janelas().length && janelas()[0].get_frame_rect().width > 0 ? janelas() : null), 120000, 'a janela do Tomatito'))[0];
  await esperar(() => estado()?.nav?.itens?.length === 4, 30000, 'o painel desenhado (sonda)');
  if (W.is_maximized()) W.unmaximize();
  W.move_resize_frame(true, 300, 150, 1100, 760);
  for (let i = 0; i < 20 && (Main.overview.visible || Main.overview.animationInProgress); i++) {
    if (!Main.overview.animationInProgress) Main.overview.hide();
    await sleep(500);
  }
  Main.activateWindow(W);
  await sleep(800);

  // 1. A tela pelo painel.
  await clicarEm('.tt-nav [data-rota="cronometro"]');
  const inicial = await comando(LER);
  checar(
    'zerado: 00:00:00,00, volta e redefinir desabilitados',
    inicial?.texto === '00:00:00,00' && inicial.estado === 'idle' && JSON.stringify(inicial.botoes) === '[["iniciar",false],["volta",true],["redefinir",true]]',
    inicial,
  );
  await captura('m34-app-zerado.png');

  // 2. Iniciar.
  await clicarEm('.tt-cronometro-botoes [data-acao="iniciar"]');
  const e1 = lerEstado();
  checar('iniciar grava running com startedAt', e1.stopwatch?.status === 'running' && e1.stopwatch.startedAt > 0 && e1.stopwatch.accumulatedMs === 0, e1.stopwatch ?? e1);
  const amostra = await comando(AMOSTRA);
  R.medidas.amostra = amostra;
  checar('os centésimos mudam a cada quadro', amostra?.quadros >= 20 && amostra.valores >= amostra.quadros * 0.9, amostra);

  // 3. L marca volta, com o foco fora dos botões.
  await comando("document.querySelector('.tt-pagina-cronometro h1').focus(), document.activeElement.tagName");
  await apertar(Clutter.KEY_l);
  const e2 = lerEstado();
  checar('L marca volta (state.json com uma volta)', e2.stopwatch?.laps?.length === 1 && e2.stopwatch.laps[0] > 0, e2.stopwatch);

  // 4. Minimizar e esconder, e o tempo continua certo.
  const a = await comando(LER);
  W.minimize();
  passo('minimizada');
  await sleep(20000);
  W.unminimize();
  Main.activateWindow(W);
  await sleep(1200);
  const b = await comando(LER);
  const d1 = b.ms - a.ms - (b.perf - a.perf);
  R.medidas.minimizar = { a, b, diferencaMs: Math.round(d1) };
  checar('depois de 20 s minimizada, o tempo bate com o relógio monotônico (±50 ms)', Math.abs(d1) <= 50 && b.estado === 'running', { diferencaMs: Math.round(d1), a: a.texto, b: b.texto });

  await comando("window.__TAURI_INTERNALS__.invoke('plugin:window|hide', { label: 'main' }).then(() => 'escondida')");
  await sleep(500);
  R.medidas.escondida = { janelasVisiveis: janelas().filter((w) => w.showing_on_its_workspace()).length };
  passo('escondida');
  await sleep(20000);
  await comando("window.__TAURI_INTERNALS__.invoke('plugin:window|show', { label: 'main' }).then(() => 'mostrada')", 20000);
  W = (await esperar(() => (janelas().length ? janelas() : null), 10000, 'a janela de volta'))[0];
  Main.activateWindow(W);
  // O primeiro quadro depois de voltar: a captura e a leitura logo em seguida.
  await sleep(300);
  await captura('m34-app-depois-de-esconder.png');
  const c = await comando(LER);
  const d2 = c.ms - b.ms - (c.perf - b.perf);
  R.medidas.esconder = { c, diferencaMs: Math.round(d2) };
  checar('depois de 20 s escondida, o tempo bate com o relógio monotônico (±50 ms)', Math.abs(d2) <= 50 && c.estado === 'running', { diferencaMs: Math.round(d2), b: b.texto, c: c.texto });
  const dTotal = c.ms - a.ms - (c.perf - a.perf);
  R.medidas.total = { segundos: Math.round((c.perf - a.perf) / 1000), diferencaMs: Math.round(dTotal) };

  // 5. Espaço pausa; redefinir zera.
  await comando("document.querySelector('.tt-pagina-cronometro h1').focus(), document.activeElement.tagName");
  await apertar(Clutter.KEY_space);
  const p1 = await comando(LER);
  await sleep(1500);
  const p2 = await comando(LER);
  const e3 = lerEstado();
  checar(
    'Espaço pausa: o número para, e o state.json tem o acumulado',
    p1.estado === 'paused' && p1.texto === p2.texto && e3.stopwatch?.status === 'paused' && !('startedAt' in e3.stopwatch) && Math.abs(e3.stopwatch.accumulatedMs - p1.ms) < 10,
    { p1: p1.texto, p2: p2.texto, estado: e3.stopwatch },
  );
  checar('pausado: volta desabilitada, retomar e redefinir habilitados', JSON.stringify(p1.botoes) === '[["retomar",false],["volta",true],["redefinir",false]]', p1.botoes);
  await captura('m34-app-pausado.png');
  await clicarEm('.tt-cronometro-botoes [data-acao="redefinir"]');
  const z = await comando(LER);
  const e4 = lerEstado();
  checar('redefinir zera (tela e state.json)', z.texto === '00:00:00,00' && z.estado === 'idle' && e4.stopwatch?.status === 'idle' && e4.stopwatch.laps.length === 0, { tela: z.texto, estado: e4.stopwatch });

  const erros = sonda().filter((x) => x.tipo === 'erro').map((x) => x.dados);
  checar('nenhum erro na página', erros.length === 0, erros);

  W.delete(global.get_current_time());
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
