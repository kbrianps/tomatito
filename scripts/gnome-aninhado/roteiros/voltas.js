// Roteiro do M35 (voltas do cronômetro), carregado com `gnome-shell
// --automation-script` pelo dentro.sh. Na janela main de verdade, com o motor
// de verdade, o state.json no disco e a área de transferência do compositor:
//
//   bash scripts/gnome-aninhado/rodar.sh voltas
//
// O "Pronto quando" do M35 (as voltas colam certinho numa planilha do
// LibreOffice), no que dá para medir sem um humano:
//   1. abre a tela pelo painel e clica em "Iniciar": sem voltas, a lista não
//      aparece;
//   2. L três vezes (teclado virtual, com o foco no título), com intervalos
//      diferentes: o state.json ganha as três voltas (guardadas pelo Rust), e
//      a lista na tela tem as três, a mais nova em cima, com o tempo da volta
//      e o total derivados do state.json;
//   3. um clique de verdade (ponteiro virtual) em "Copiar": a área de
//      transferência do GNOME Shell (St.Clipboard, a mesma que o LibreOffice
//      lê ao colar) tem o texto separado por tabulação, igual à tela; o texto
//      vai para voltas-copiadas.txt, que o resumo-voltas.mjs abre no
//      LibreOffice Calc sem tela, com o idioma pt-BR;
//   4. "Redefinir": a lista some, e o state.json fica sem voltas.
// No fim, fecha a janela pelo compositor.
import St from 'gi://St';
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
    GLib.file_set_contents(`${OUT}/m35-state-${++nEstado}.json`, texto);
    return JSON.parse(texto);
  } catch (e) {
    return { erro: String(e) };
  }
}

const dois = (n) => String(n).padStart(2, '0');
function hmscc(ms) {
  const total = Math.floor(Math.max(ms, 0) / 10);
  const s = Math.floor(total / 100);
  return `${dois(Math.floor(s / 3600))}:${dois(Math.floor(s / 60) % 60)}:${dois(s % 60)},${dois(total % 100)}`;
}
// As linhas que a tela deve mostrar para os `laps` do state.json.
function esperadas(laps) {
  let anterior = 0;
  return laps.map((total, i) => {
    const l = [String(i + 1), hmscc(total - anterior), hmscc(total)];
    anterior = total;
    return l;
  }).reverse();
}
const LISTA = `(() => { const s = document.querySelector('[data-voltas]');
  return { visivel: Boolean(s && !s.hidden), linhas: [...(s?.querySelectorAll('tbody tr') ?? [])].map((tr) => [...tr.cells].map((c) => c.textContent)),
    aviso: s?.querySelector('[data-aviso]')?.textContent ?? null }; })()`;

function areaDeTransferencia() {
  return new Promise((res) => St.Clipboard.get_default().get_text(St.ClipboardType.CLIPBOARD, (_c, texto) => res(texto)));
}

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
  // Um texto conhecido antes, para ver que o "Copiar" trocou a área.
  St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, 'antes do Copiar');

  // 1. A tela e Iniciar.
  await clicarEm('.tt-nav [data-rota="cronometro"]');
  await clicarEm('.tt-cronometro-botoes [data-acao="iniciar"]');
  const l0 = await comando(LISTA);
  checar('correndo sem voltas: a lista não aparece', l0 && !l0.visivel, l0);

  // 2. Três voltas pelo L.
  await comando("document.querySelector('.tt-pagina-cronometro h1').focus(), document.activeElement.tagName");
  for (const espera of [1200, 700, 1600]) {
    await sleep(espera);
    await apertar(Clutter.KEY_l);
  }
  const e1 = lerEstado();
  const laps = e1.stopwatch?.laps ?? [];
  checar('o state.json tem as três voltas, crescentes', laps.length === 3 && laps.every((v, i) => v > (laps[i - 1] ?? 0)), e1.stopwatch);
  const l1 = await comando(LISTA);
  const quer = esperadas(laps);
  checar('a tela mostra as três voltas do Rust, a mais nova em cima', l1?.visivel && JSON.stringify(l1.linhas) === JSON.stringify(quer), { tela: l1?.linhas, esperado: quer });
  await captura('m35-app-voltas.png');

  // 3. Copiar, com um clique de verdade.
  await clicarEm('[data-copiar]');
  const texto = await areaDeTransferencia();
  GLib.file_set_contents(`${OUT}/voltas-copiadas.txt`, texto ?? '');
  const esperado = [['Volta', 'Tempo', 'Total'], ...quer].map((l) => l.join('\t')).join('\n');
  checar('Copiar: a área de transferência tem o texto da tela, separado por tabulação', texto === esperado, { texto, esperado });
  const l2 = await comando(LISTA);
  checar('Copiar: o aviso "Voltas copiadas"', l2?.aviso === 'Voltas copiadas', l2?.aviso);
  await captura('m35-app-copiado.png');

  // 4. Redefinir.
  await clicarEm('.tt-cronometro-botoes [data-acao="pausar"]');
  await clicarEm('.tt-cronometro-botoes [data-acao="redefinir"]');
  const l3 = await comando(LISTA);
  const e2 = lerEstado();
  checar('Redefinir: a lista some e o state.json fica sem voltas', l3 && !l3.visivel && e2.stopwatch?.status === 'idle' && e2.stopwatch.laps.length === 0, { tela: l3, estado: e2.stopwatch });

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
