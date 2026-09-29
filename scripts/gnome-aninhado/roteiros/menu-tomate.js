// Roteiro do M56 (P/M/G, menu nativo, atalhos e "Sempre na frente"),
// carregado com `gnome-shell --automation-script` pelo dentro.sh. O binário de
// debug de verdade, com o WAYLAND_DEBUG=client que o dentro.sh já liga:
//
//   bash scripts/gnome-aninhado/rodar.sh menu-tomate
//   TT_PORT=5174 bash scripts/gnome-aninhado/rodar.sh menu-tomate   # binário compilado para a 5174
//
// O "Pronto quando" do M56, no que dá para medir sem um humano:
//   1. no Wayland, o tomato_on_top_available é false, e o menu não tem o
//      "Sempre na frente";
//   2. os atalhos: Espaço inicia, pausa e retoma; Ctrl+, abre a main nas
//      Configurações, com a dica do Alt+Espaço (uma vez só);
//   3. o botão direito abre o menu nativo (um xdg_popup, visto pelo
//      compositor), completo; pelo teclado do menu, Tamanho → Grande e depois
//      Tamanho → Pequeno trocam a janela e gravam o tomatoSize, e a região
//      vai de novo (resumo-menu-tomate.mjs, pelo app.log); o clique no canto
//      continua atravessando no tamanho novo;
//   4. Minimizar minimiza (sem esconder); Esc sai do Full, e a volta ao Full
//      abre o tomate no tamanho escolhido (a preferência persiste);
//   5. Fechar fecha o tomate, e o app continua (fechar para a bandeja).
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
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
const rect = (w) => {
  const r = w.get_frame_rect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
};
const janelas = () =>
  global.get_window_actors().map((a) => a.meta_window).filter((w) => w.get_title() === 'Tomatito');
const menus = () =>
  global
    .get_window_actors()
    .map((a) => a.meta_window)
    .filter((w) => [Meta.WindowType.POPUP_MENU, Meta.WindowType.DROPDOWN_MENU, Meta.WindowType.MENU].includes(w.get_window_type()) || (w.get_title() !== 'Tomatito' && w.get_transient_for?.()));
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

async function esperar(fn, ms, oque) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const v = await fn();
    if (v) return v;
    await sleep(100);
  }
  throw new Error(`tempo esgotado: ${oque}`);
}
const talvez = (fn, ms, oque) => esperar(fn, ms, oque).catch(() => null);

let nComando = 0;
async function comando(janela, js, prazo = 10000) {
  const id = `c${++nComando}`;
  GLib.file_set_contents(`${OUT}/comando.json`, JSON.stringify({ id, janela, js }));
  const r = await esperar(
    () => sonda().find((e) => e.tipo === 'comando' && e.dados.id === id),
    prazo,
    `comando (${janela}) ${js.slice(0, 80)}`,
  );
  const texto = JSON.stringify(r.dados.resultado) ?? 'null';
  passo(`comando ${janela}: ${js.slice(0, 100)} => ${texto.length > 300 ? `${texto.slice(0, 300)}…` : texto}`);
  return r.dados.resultado;
}
const ipc = (cmd, args = {}, janela = 'main') =>
  comando(janela, `window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args)}).then((r) => JSON.stringify(r ?? null), (e) => 'erro: ' + e)`).then(
    (t) => (typeof t === 'string' && !t.startsWith('erro') ? JSON.parse(t) : t),
  );
const focoDoMotor = async () => (await ipc('get_state')).focus;
const lerTomate = async () =>
  JSON.parse(
    await comando(
      'tomato',
      `JSON.stringify({ tamanho: [innerWidth, innerHeight], estado: document.querySelector('.stage')?.dataset.state, menu: window.__TT_MENU__ ?? null })`,
    ),
  );

// Como no roteiro do M54: entra no Full, responde "Manter" à validação e traz
// a main de volta para ficar atrás.
const ESPERAR_DIALOGO =
  "new Promise((r) => { const t0 = Date.now(); const f = () => (document.querySelector('.tt-dialogo-validacao')?.dialog?.open || Date.now() - t0 > 3000 ? r() : setTimeout(f, 50)); f(); })";
const ABRIR = `window.__TAURI_INTERNALS__.invoke('switch_window_mode', { full: true }).then(() => ${ESPERAR_DIALOGO}).then(() => window.__TAURI_INTERNALS__.invoke('full_validation_answer', { answer: 'keep' })).then(() => window.__TAURI_INTERNALS__.invoke('show_main', { route: null })).then(() => 'aberto', (e) => 'erro: ' + e)`;

let ptr;
let kb;
let TOMATO = null;
let MAIN = null;
const mover = (x, y) => ptr.notify_absolute_motion(agora(), x, y);
const botao = (apertado, qual = Clutter.BUTTON_PRIMARY) =>
  ptr.notify_button(agora(), qual, apertado ? Clutter.ButtonState.PRESSED : Clutter.ButtonState.RELEASED);
const tecla = (keyval, apertada) =>
  kb.notify_keyval(agora(), keyval, apertada ? Clutter.KeyState.PRESSED : Clutter.KeyState.RELEASED);
async function teclar(keyval, { ctrl = false, vezes = 1 } = {}) {
  for (let i = 0; i < vezes; i++) {
    if (ctrl) tecla(Clutter.KEY_Control_L, true);
    tecla(keyval, true);
    await sleep(40);
    tecla(keyval, false);
    if (ctrl) tecla(Clutter.KEY_Control_L, false);
    await sleep(160);
  }
}

async function semVisaoGeral() {
  for (let i = 0; i < 20 && (Main.overview.visible || Main.overview.animationInProgress); i++) {
    if (!Main.overview.animationInProgress) Main.overview.hide();
    await sleep(400);
  }
}

async function captura(nome, area) {
  const shooter = new Shell.Screenshot();
  const s = Gio.File.new_for_path(`${OUT}/${nome}`).replace(null, false, Gio.FileCreateFlags.NONE, null);
  await shooter.screenshot_area(area.x, area.y, area.w, area.h, s);
  s.close(null);
  passo(`captura ${nome}`);
}

async function clicar(x, y, qual = Clutter.BUTTON_PRIMARY) {
  await semVisaoGeral();
  mover(x, y);
  await sleep(150);
  botao(true, qual);
  await sleep(80);
  botao(false, qual);
  await sleep(500);
}

const B = { x: 560, y: 320 };

async function focarTomate() {
  Main.activateWindow(TOMATO);
  await sleep(600);
}

// Abre o menu com o botão direito no corpo (longe dos botões) e espera o
// popup aparecer no compositor.
async function abrirMenu(nome) {
  await focarTomate();
  const r = rect(TOMATO);
  const K = r.w / 320;
  const antes = menus();
  await clicar(r.x + 70 * K, r.y + 200 * K, Clutter.BUTTON_SECONDARY);
  const popup = await talvez(() => menus().find((w) => !antes.includes(w)), 5000, 'o menu');
  if (popup) {
    await sleep(400);
    const m = rect(popup);
    await captura(`m56-menu-${nome}.png`, { x: Math.min(m.x, r.x) - 10, y: Math.min(m.y, r.y) - 10, w: Math.max(m.x + m.w, r.x + r.w) - Math.min(m.x, r.x) + 20, h: Math.max(m.y + m.h, r.y + r.h) - Math.min(m.y, r.y) + 20 });
    R.medidas[`menu-${nome}`] = { popup: m, tipo: popup.get_window_type() };
  }
  return popup;
}

// Escolhe um item com o mouse, como um usuário. As linhas do menu do GTK têm
// a mesma altura, os separadores 1 px e o menu 4 px de margem em cima e
// embaixo (medido nas capturas: 8 itens e 3 separadores em 243 px); a
// altura de cada linha sai da altura do popup, e a lista, do __TT_MENU__ que
// a página montou (só no dev).
const MARGEM = 4;
const SEPARADOR = 1;
function centro(popup, itens, id) {
  const m = rect(popup);
  const n = itens.filter((i) => i.tipo !== 'separador').length;
  const seps = itens.length - n;
  const linha = (m.h - 2 * MARGEM - seps * SEPARADOR) / n;
  let y = m.y + MARGEM;
  for (const i of itens) {
    if (i.tipo === 'separador') {
      y += SEPARADOR;
      continue;
    }
    if (i.id === id) return [m.x + m.w / 2, y + linha / 2];
    y += linha;
  }
  throw new Error(`sem o item ${id}`);
}
async function escolher(nome, id, subId = null) {
  const popup = await abrirMenu(nome);
  checar(`menu (${nome}): o botão direito abre o menu nativo`, Boolean(popup), R.medidas[`menu-${nome}`] ?? null);
  if (!popup) return false;
  const { menu } = await lerTomate();
  const [x, y] = centro(popup, menu, id);
  if (subId === null) {
    await clicar(x, y);
  } else {
    // O submenu é a janela de menu que não existia antes (a ordem da lista
    // do compositor não é a da criação).
    const antes = menus();
    mover(x, y);
    await sleep(150);
    mover(x + 2, y);
    const sub = await talvez(() => menus().find((w) => !antes.includes(w)), 4000, 'o submenu');
    if (!sub) return false;
    await sleep(400);
    await captura(`m56-submenu-${nome}.png`, rect(sub));
    const itens = menu.find((i) => i.id === id).itens;
    const [sx, sy] = centro(sub, itens, subId);
    // Anda na horizontal primeiro, sobre a linha do Tamanho, para o GTK não
    // fechar o submenu no caminho.
    mover(sx, y);
    await sleep(200);
    await clicar(sx, sy);
  }
  await sleep(800);
  return true;
}

async function trocarPeloMenu(lado) {
  await escolher(`tamanho-${lado}`, 'tamanho', `tamanho-${lado}`);
  const ok = await talvez(() => rect(TOMATO).w === lado && rect(TOMATO).h === lado, 8000, `a janela com ${lado} px`);
  await sleep(800);
  const t = await lerTomate();
  const s = await ipc('settings_get');
  R.medidas[`tamanho-${lado}`] = { frame: rect(TOMATO), pagina: t.tamanho, tomatoSize: s.tomatoSize };
  checar(`menu → Tamanho → ${lado} px: a janela e a página mudam e o tomatoSize é gravado`, ok && t.tamanho[0] === lado && s.tomatoSize === lado, R.medidas[`tamanho-${lado}`]);
  passo(`trocado para ${lado}`);
  // O canto de cima, fora do desenho, continua chegando à main (a região nova).
  MAIN.move_resize_frame(true, B.x - 100, B.y - 100, 820, 620);
  TOMATO.move_frame(true, B.x, B.y);
  await sleep(700);
  await focarTomate();
  const r = rect(TOMATO);
  await clicar(r.x + 4, r.y + 4);
  const foiParaMain = global.display.focus_window === MAIN;
  await focarTomate();
  await clicar(r.x + (70 * lado) / 320, r.y + (200 * lado) / 320);
  const ficouNoTomate = global.display.focus_window === TOMATO;
  checar(`${lado} px: o canto atravessa para a main e o corpo fica no tomate`, foiParaMain && ficouNoTomate, { foiParaMain, ficouNoTomate });
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
  try {
    Main.messageTray.bannerBlocked = true;
  } catch {
    // segue
  }
  await sleep(200);
  mover(960, 1070);
  await sleep(800);
  MAIN = (await esperar(() => (janelas().length && rect(janelas()[0]).w > 0 ? janelas() : null), 120000, 'a janela main'))[0];
  await esperar(() => sonda().some((e) => e.janela === 'main' && e.tipo === 'estado' && e.dados?.nav?.itens?.length === 4), 30000, 'a main desenhada');
  await semVisaoGeral();
  if (MAIN.is_maximized()) MAIN.unmaximize();

  const aberto = await comando('main', ABRIR);
  checar('switch_window_mode(true) responde', aberto === 'aberto', aberto);
  TOMATO = await esperar(() => janelas().find((w) => rect(w).w === 280 && rect(w).h === 280), 30000, 'a janela do tomate');
  await esperar(() => sonda().some((e) => e.janela === 'tomato' && e.tipo === 'info'), 30000, 'a página do tomate (sonda)');
  MAIN = await esperar(() => janelas().find((w) => w !== TOMATO && rect(w).w > 320), 10000, 'a main de volta');
  MAIN.move_resize_frame(true, B.x - 100, B.y - 100, 820, 620);
  TOMATO.move_frame(true, B.x, B.y);
  await sleep(700);

  // 1. Sempre na frente por código: não no Wayland.
  const naFrente = await ipc('tomato_on_top_available');
  checar('Wayland: tomato_on_top_available é false', naFrente === false, naFrente);

  // 2. Espaço: iniciar, pausar e retomar, com o foco no tomate (no <body>).
  await focarTomate();
  await comando('tomato', "document.activeElement?.blur(); 'ok'");
  await teclar(Clutter.KEY_space);
  const f1 = await talvez(async () => ((await focoDoMotor()).status === 'focus' ? 'focus' : null), 3000, 'focus');
  await teclar(Clutter.KEY_space);
  const f2 = await talvez(async () => ((await focoDoMotor()).status === 'paused' ? 'paused' : null), 3000, 'paused');
  await teclar(Clutter.KEY_space);
  const f3 = await talvez(async () => ((await focoDoMotor()).status === 'focus' ? 'focus' : null), 3000, 'focus de novo');
  checar('Espaço no tomate inicia, pausa e retoma', f1 && f2 && f3, { f1, f2, f3 });

  // 3. O menu completo (sessão correndo), sem "Sempre na frente" no Wayland.
  const popup = await abrirMenu('completo');
  checar('o botão direito abre o menu nativo (uma janela de menu no compositor)', Boolean(popup), R.medidas['menu-completo'] ?? null);
  const t0 = await lerTomate();
  const ids = (t0.menu ?? []).map((i) => i.id ?? '—');
  const sub = (t0.menu ?? []).find((i) => i.id === 'tamanho')?.itens?.map((i) => `${i.texto}${i.marcado ? ' ✓' : ''}`);
  R.medidas.menu = { ids, sub, textos: (t0.menu ?? []).map((i) => i.texto ?? '—') };
  checar(
    'menu completo: Pausar, Pular, Encerrar, Tamanho (P/M/G), Configurações, Voltar, Minimizar e Fechar',
    JSON.stringify(ids) === JSON.stringify(['principal', 'pular', 'encerrar', '—', 'tamanho', '—', 'configuracoes', 'voltar', '—', 'minimizar', 'fechar']) &&
      JSON.stringify(sub) === JSON.stringify(['Pequeno', 'Médio ✓', 'Grande']),
    R.medidas.menu,
  );
  await teclar(Clutter.KEY_Escape);
  await sleep(500);
  checar('Esc fecha o menu sem sair do Full', menus().length === 0 && janelas().includes(TOMATO), { menus: menus().length });

  // 4. P/M/G pelo menu.
  await trocarPeloMenu(320);
  await trocarPeloMenu(240);

  // 5. Ctrl+, abre a main nas Configurações, com a dica (uma vez).
  MAIN.minimize();
  await sleep(500);
  await focarTomate();
  await teclar(Clutter.KEY_comma, { ctrl: true });
  const naConfig = await talvez(async () => {
    const r = await comando('main', "JSON.stringify({ hash: location.hash, visivel: document.visibilityState, dica: document.querySelector('.tt-config-dica')?.textContent ?? null, marca: localStorage.getItem('tt.dica.sempreNaFrente') })");
    const o = JSON.parse(r);
    return o.hash === '#/configuracoes' && o.visivel === 'visible' && o.dica ? o : null;
  }, 6000, 'a main nas Configurações');
  R.medidas.ctrlVirgula = naConfig;
  checar('Ctrl+, no tomate abre a main nas Configurações, com a dica do Alt+Espaço', Boolean(naConfig) && !MAIN.minimized && naConfig.marca === '1', naConfig);
  if (naConfig) await captura('m56-dica.png', rect(MAIN));
  // Uma vez: fora da tela e de volta, e numa outra tela e de volta, ela não volta.
  await comando('main', "location.hash = '#/foco'; 'ok'");
  await sleep(600);
  await comando('main', "location.hash = '#/configuracoes'; 'ok'");
  await sleep(800);
  const deNovo = await comando('main', "String(document.querySelector('.tt-config-dica')?.textContent ?? null)");
  checar('a dica aparece uma vez só', deNovo === 'null', deNovo);

  // 6. Minimizar pelo menu (sem esconder: a janela continua existindo).
  await escolher('minimizar', 'minimizar');
  const minimizado = await talvez(() => TOMATO.minimized, 4000, 'minimizado');
  checar('menu → Minimizar minimiza o tomate', minimizado && janelas().includes(TOMATO), { minimizado });
  Main.activateWindow(TOMATO);
  await sleep(800);

  // 7. Esc sai do Full; a volta abre no tamanho escolhido.
  await focarTomate();
  await teclar(Clutter.KEY_Escape);
  const saiu = await talvez(() => !janelas().includes(TOMATO), 6000, 'o tomate fechado');
  const tema = (await ipc('settings_get')).theme;
  checar('Esc sai do Full', saiu && tema !== 'full', { saiu, tema });
  const deVolta = await comando(
    'main',
    "window.__TAURI_INTERNALS__.invoke('switch_window_mode', { full: true }).then(() => window.__TAURI_INTERNALS__.invoke('show_main', { route: null })).then(() => 'aberto', (e) => 'erro: ' + e)",
  );
  TOMATO = await talvez(() => janelas().find((w) => rect(w).w === 240 && rect(w).h === 240), 15000, 'o tomate de novo, com 240');
  checar('a preferência persiste: de volta ao Full, o tomate abre com 240 px', Boolean(TOMATO) && deVolta === 'aberto', { deVolta, janelas: janelas().map(rect) });

  // 8. Fechar pelo menu: o tomate fecha, o app segue (fechar para a bandeja).
  if (TOMATO) {
    await esperar(() => sonda().filter((e) => e.janela === 'tomato' && e.tipo === 'info').length >= 2, 15000, 'a página do tomate de novo');
    await sleep(1000);
    await escolher('fechar', 'fechar');
    const fechou = await talvez(() => !janelas().includes(TOMATO), 6000, 'o tomate fechado');
    await sleep(1000);
    const s = await ipc('settings_get');
    checar('menu → Fechar fecha o tomate, e o app segue (tema ainda full, na bandeja)', fechou && s?.theme === 'full', { fechou, tema: s?.theme });
  }

  const erros = sonda().filter((x) => x.tipo === 'erro').map((x) => `${x.janela}: ${x.dados}`);
  checar('nenhum erro nas páginas', erros.length === 0, erros);
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
