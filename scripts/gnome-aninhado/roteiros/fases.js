// Roteiro do M19 (pausado, intervalo e concluído), carregado com
// `gnome-shell --automation-script` pelo dentro.sh. Na janela main de verdade
// (WebKitGTK no Mutter 50, Wayland), com o motor em Rust de verdade e o
// relógio acelerado (rodar com TOMATITO_SPEED=60: 1 min passa em 1 s):
//   1. o seletor vai a 60 e o teclado virtual aperta Espaço com o foco no
//      título da tela: a sessão começa ("Período de foco (1 de 2)");
//   2. Espaço pausa (" · Pausado", o número em --tt-fg-2, o glifo de play) e
//      Espaço retoma;
//   3. a sessão corre sozinha: foco, intervalo ("Intervalo", o traço aceso em
//      --tt-fg-2, "A seguir: foco de 27 min"), foco 2 de 2 e o ocioso
//      ("Pronto para focar"), com o Rust em "completed";
//   4. a região aria-live recebeu um texto por fase (o tt://phase do
//      engine.rs), na ordem.
// No fim, fecha a janela pelo compositor.
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
async function comando(js) {
  const id = `c${++nComando}`;
  GLib.file_set_contents(`${OUT}/comando.json`, JSON.stringify({ id, js }));
  const r = await esperar(() => sonda().find((e) => e.tipo === 'comando' && e.dados.id === id), 10000, `comando ${js}`);
  const texto = JSON.stringify(r.dados.resultado) ?? 'null';
  passo(`comando ${js.slice(0, 120)} => ${texto.length > 300 ? `${texto.slice(0, 300)}…` : texto}`);
  return r.dados.resultado;
}

let ptr;
const agora = () => GLib.get_monotonic_time();
const mover = (x, y) => ptr.notify_absolute_motion(agora(), x, y);
const botao = (apertado) =>
  ptr.notify_button(agora(), Clutter.BUTTON_PRIMARY, apertado ? Clutter.ButtonState.PRESSED : Clutter.ButtonState.RELEASED);
let kb;
const tecla = (keyval, apertada) =>
  kb.notify_keyval(agora(), keyval, apertada ? Clutter.KeyState.PRESSED : Clutter.KeyState.RELEASED);
async function apertar(keyval) {
  tecla(keyval, true);
  await sleep(60);
  tecla(keyval, false);
  await sleep(400);
}

async function captura(nome, area) {
  const shooter = new Shell.Screenshot();
  const s = Gio.File.new_for_path(`${OUT}/${nome}`).replace(null, false, Gio.FileCreateFlags.NONE, null);
  await shooter.screenshot_area(area.x, area.y, area.w, area.h, s);
  s.close(null);
  passo(`captura ${nome}`);
}

// Na página: o estado do cartão (medidas.js, colado na sonda) e o do Rust.
const LER =
  "(async function () { const s = await window.__TAURI_INTERNALS__.invoke('get_state'); return Object.assign(window.__ttEstadoDaSessao(), { status: s.focus.status, velocidade: s.speed }); })()";
const FOCAR_TITULO = "(function () { document.querySelector('h1[tabindex=\"-1\"]').focus(); return document.activeElement.tagName; })()";

async function principal() {
  passo('início');
  const seat = global.stage.context.get_backend().get_default_seat();
  ptr = seat.create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
  kb = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
  await sleep(200);
  mover(960, 1070);
  if (Main.overview.visible) Main.overview.hide();

  const W = (await esperar(() => (janelas().length && rect(janelas()[0]).w > 0 ? janelas() : null), 120000, 'a janela do Tomatito'))[0];
  await esperar(() => estado()?.nav?.itens?.length === 4, 30000, 'o painel desenhado (sonda)');
  if (W.is_maximized()) W.unmaximize();
  W.move_resize_frame(true, 300, 150, 1000, 700);
  await sleep(1000);
  Main.activateWindow(W);
  await sleep(500);
  const r = rect(W);

  const inicial = await comando(LER);
  checar('abre ocioso, no preparo, com o relógio acelerado (TOMATITO_SPEED=60)', inicial.status === 'idle' && inicial.modo === 'preparo' && inicial.velocidade === 60, { status: inicial.status, modo: inicial.modo, velocidade: inicial.velocidade });
  await comando('window.__ttOuvirAnuncios()');

  // 1. Seletor em 60 e Espaço com o foco no título.
  const valor = await comando(
    "(function () { const c = document.querySelector('[data-cartao=\"sessao\"] [role=\"spinbutton\"]'); for (let i = 0; i < 300 && Number(c.getAttribute('aria-valuenow')) !== 60; i++) { const k = Number(c.getAttribute('aria-valuenow')) < 60 ? 'ArrowUp' : 'ArrowDown'; c.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); } return Number(c.getAttribute('aria-valuenow')); })()",
  );
  if (valor !== 60) throw new Error(`o seletor parou em ${valor}`);
  await comando(FOCAR_TITULO);
  await apertar(Clutter.KEY_space);
  const logo = await comando(LER);
  checar('Espaço (teclado virtual) inicia a sessão: "Período de foco (1 de 2)", "A seguir: intervalo de 5 min"', logo.status === 'focus' && logo.titulo === 'Período de foco (1 de 2)' && logo.rodape === 'A seguir: intervalo de 5 min', { status: logo.status, titulo: logo.titulo, rodape: logo.rodape });

  // 2. Espaço pausa e retoma.
  await apertar(Clutter.KEY_space);
  const pausado = await comando(LER);
  await captura('m19-pausado.png', r);
  const e = pausado.cores.esperado;
  checar(
    'Espaço pausa: " · Pausado", número em --tt-fg-2, glifo de play',
    pausado.status === 'paused' && pausado.titulo === 'Período de foco (1 de 2) · Pausado' && pausado.cores.numero === e.fg2 && pausado.principal?.icone === 'play' && pausado.pausado,
    { status: pausado.status, titulo: pausado.titulo, numero: pausado.cores.numero, fg2: e.fg2, principal: pausado.principal },
  );
  await apertar(Clutter.KEY_space);
  const retomado = await comando(LER);
  checar('Espaço retoma: o título sem "Pausado", número em --tt-fg-1, glifo de pausa', retomado.status === 'focus' && retomado.titulo === 'Período de foco (1 de 2)' && retomado.cores.numero === e.fg1 && retomado.principal?.icone === 'pause', { status: retomado.status, titulo: retomado.titulo, numero: retomado.cores.numero });

  // 3. A sessão corre sozinha até o fim (27,5 + 5 + 27,5 s).
  const seq = [];
  let capturouIntervalo = false;
  const t0 = agoraMs();
  while (agoraMs() - t0 < 90000) {
    const l = await comando(LER);
    const chave = JSON.stringify([l.modo, l.titulo, l.rodape, l.cores.aceso, l.status]);
    if (!seq.length || seq.at(-1).chave !== chave) seq.push({ t: Math.round(agoraMs() - t0), chave, modo: l.modo, titulo: l.titulo, rodape: l.rodape, aceso: l.cores.aceso === e.accent ? 'accent' : l.cores.aceso === e.fg2 ? 'fg2' : l.cores.aceso, status: l.status, animacoes: l.animacoes });
    if (l.status === 'break' && !capturouIntervalo) {
      await captura('m19-intervalo.png', r);
      capturouIntervalo = true;
    }
    if (l.status === 'completed' || l.status === 'idle') break;
    await sleep(300);
  }
  R.medidas.sequencia = seq.map(({ chave, ...x }) => x);
  const passos = seq.map((s) => `${s.status} | ${s.titulo} | ${s.rodape ?? '-'} | ${s.aceso}`);
  checar(
    'foco, intervalo, foco e ocioso com os textos certos',
    JSON.stringify(passos) ===
      JSON.stringify([
        'focus | Período de foco (1 de 2) | A seguir: intervalo de 5 min | accent',
        'break | Intervalo | A seguir: foco de 27 min | fg2',
        'focus | Período de foco (2 de 2) | - | accent',
        'completed | Pronto para focar | - | accent',
      ]),
    passos,
  );
  checar('a volta ao preparo não tem animação', seq.at(-1)?.animacoes === 0, seq.at(-1)?.animacoes);
  await sleep(500);
  const anuncios = await comando('window.__ttAnuncios');
  R.medidas.anuncios = anuncios;
  checar(
    'a região aria-live recebeu um texto por fase, na ordem',
    JSON.stringify((anuncios ?? []).map((a) => a.texto)) ===
      JSON.stringify(['Começou o período de foco 1 de 2.', 'Começou o intervalo 1 de 1.', 'Começou o período de foco 2 de 2.', 'Sessão de foco concluída.']),
    anuncios,
  );
  const regiao = (await comando(LER)).regiao;
  checar('uma única região aria-live, polite e atômica, de 1 px', regiao?.regioesLive === 1 && regiao.live === 'polite' && regiao.atomic === 'true' && regiao.caixa[0] <= 1, regiao);

  const erros = sonda().filter((x) => x.tipo === 'erro').map((x) => x.dados);
  checar('nenhum erro na página', erros.length === 0, erros);
  W.delete(global.get_current_time());
  await sleep(1500);
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
