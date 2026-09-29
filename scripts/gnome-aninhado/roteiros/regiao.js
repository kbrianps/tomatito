// Roteiro do M54 (região de entrada no Linux), carregado com
// `gnome-shell --automation-script` pelo dentro.sh. O binário de debug de
// verdade, com o WAYLAND_DEBUG=client que o dentro.sh já liga:
//
//   bash scripts/gnome-aninhado/rodar.sh regiao
//   TT_PORT=5174 bash scripts/gnome-aninhado/rodar.sh regiao   # binário compilado para a 5174
//
// O "Pronto quando" do M54, no que dá para medir sem um humano:
//   1. o tomate abre (switch_window_mode) e, no M (280), depois de trocar
//      para o P (240) e depois para o G (320), com o tomato_debug_size:
//      a janela tem o lado pedido e a página também;
//   2. em cada tamanho, clicar fora do desenho (os quatro cantos, o lado do
//      corpo, acima do cabinho, o ombro e a sombra de baixo) chega à main,
//      que fica atrás de toda a caixa do tomate: o foco vai para ela e o
//      mousedown chega à página dela, e não à do tomate;
//   3. em cada tamanho, arrastar pelo corpo, pelo cabinho e por uma sépala
//      move a janela, e os botões comandam o motor (iniciar, pausar e
//      encerrar), sem mexer na janela;
//   4. o resumo (resumo-regiao.mjs) lê no app.log o set_input_region da
//      superfície do tomate: depois do show, igual à região que a página
//      mandou, e de novo com a região nova depois de cada troca.
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

async function esperar(fn, ms, oque) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const v = await fn();
    if (v) return v;
    await sleep(100);
  }
  throw new Error(`tempo esgotado: ${oque}`);
}

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
const ipc = (cmd, args = {}) =>
  comando('main', `window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args)}).then((r) => JSON.stringify(r ?? null), (e) => 'erro: ' + e)`).then(
    (t) => (typeof t === 'string' && !t.startsWith('erro') ? JSON.parse(t) : t),
  );
const focoDoMotor = async () => (await ipc('get_state')).focus;
const lerTomate = async () =>
  JSON.parse(
    await comando(
      'tomato',
      `JSON.stringify({ tamanho: [innerWidth, innerHeight], estado: document.querySelector('.stage')?.dataset.state, modo: document.documentElement.dataset.fullMode ?? null })`,
    ),
  );

// Como no roteiro do M50: entra no Full, responde "Manter" à validação (a
// primeira entrada pergunta) e traz a main de volta para ficar atrás. O
// "Manter" só vai com o diálogo já aberto na main (até 3 s): respondido
// antes, o diálogo abre depois da resposta e fica na tela (docs/decisoes.md,
// M54, item 9).
const ESPERAR_DIALOGO =
  "new Promise((r) => { const t0 = Date.now(); const f = () => (document.querySelector('.tt-dialogo-validacao')?.dialog?.open || Date.now() - t0 > 3000 ? r() : setTimeout(f, 50)); f(); })";
const ABRIR = `window.__TAURI_INTERNALS__.invoke('switch_window_mode', { full: true }).then(() => ${ESPERAR_DIALOGO}).then(() => window.__TAURI_INTERNALS__.invoke('full_validation_answer', { answer: 'keep' })).then(() => window.__TAURI_INTERNALS__.invoke('show_main', { route: null })).then(() => 'aberto', (e) => 'erro: ' + e)`;

let ptr;
let TOMATO = null;
let MAIN = null;
const mover = (x, y) => ptr.notify_absolute_motion(agora(), x, y);
const botao = (apertado) =>
  ptr.notify_button(agora(), Clutter.BUTTON_PRIMARY, apertado ? Clutter.ButtonState.PRESSED : Clutter.ButtonState.RELEASED);

async function semVisaoGeral() {
  for (let i = 0; i < 20 && (Main.overview.visible || Main.overview.animationInProgress); i++) {
    if (!Main.overview.animationInProgress) Main.overview.hide();
    await sleep(400);
  }
}

async function moverJanela(w, x, y) {
  w.move_frame(true, x, y);
  await sleep(700);
  return rect(w);
}

async function captura(nome, area) {
  const shooter = new Shell.Screenshot();
  const s = Gio.File.new_for_path(`${OUT}/${nome}`).replace(null, false, Gio.FileCreateFlags.NONE, null);
  await shooter.screenshot_area(area.x, area.y, area.w, area.h, s);
  s.close(null);
  passo(`captura ${nome}`);
}

async function clicar(x, y) {
  await semVisaoGeral();
  mover(x, y);
  await sleep(150);
  botao(true);
  await sleep(80);
  botao(false);
  await sleep(500);
}

// Onde o tomate fica em todas as conferências; a main (820 × 620) fica atrás
// da caixa inteira, a 100 px para cima e para a esquerda.
const B = { x: 560, y: 320 };

async function arrastar(lado, nome, vx, vy, dx, dy) {
  const K = lado / 320;
  await semVisaoGeral();
  Main.activateWindow(TOMATO);
  await sleep(500);
  const r0 = rect(TOMATO);
  const [x, y] = [r0.x + vx * K, r0.y + vy * K];
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
  R.medidas[`arraste-${lado}-${nome}`] = { ponto: [vx, vy], pedido: [dx, dy], delta };
  checar(`${lado} px: arrastar pelo ${nome} move a janela`, Math.abs(delta[0] - dx) <= 3 && Math.abs(delta[1] - dy) <= 3, { pedido: [dx, dy], delta });
  await moverJanela(TOMATO, B.x, B.y);
}

const BOTOES = { encerrar: [106, 252], principal: [160, 252] };
async function clicarNoTomate(lado, nome) {
  const K = lado / 320;
  Main.activateWindow(TOMATO);
  await sleep(500);
  const r = rect(TOMATO);
  const [vx, vy] = BOTOES[nome];
  mover(r.x + vx * K - 6, r.y + vy * K - 6);
  await sleep(150);
  await clicar(r.x + vx * K, r.y + vy * K);
  await sleep(300);
}

// Pontos fora do desenho, no viewBox (320 × 320): os cantos ficam a 4 px da
// borda da janela, em px da janela.
const FORA = {
  canto_sup_esq: (l) => [4, 4],
  canto_sup_dir: (l) => [l - 5, 4],
  canto_inf_esq: (l) => [4, l - 5],
  canto_inf_dir: (l) => [l - 5, l - 5],
  lado_esq: (l) => [(8 * l) / 320, (200 * l) / 320],
  acima_do_cabinho: (l) => [(160 * l) / 320, (20 * l) / 320],
  // A zona morta do ombro na região aproximada do spike (M05): agora atravessa.
  ombro: (l) => [(22 * l) / 320, (70 * l) / 320],
  sombra_embaixo: (l) => [(160 * l) / 320, (312 * l) / 320],
};
// Dentro do desenho, longe dos botões: fica no tomate.
const DENTRO = {
  corpo: (l) => [(70 * l) / 320, (200 * l) / 320],
  sepala: (l) => [(183 * l) / 320, (67 * l) / 320],
};

async function cliquesAtravessam(lado) {
  await moverJanela(TOMATO, B.x, B.y);
  MAIN.move_resize_frame(true, B.x - 100, B.y - 100, 820, 620);
  await sleep(700);
  R.medidas[`cliques-${lado}`] = {};
  for (const [nome, ponto] of Object.entries({ ...FORA, ...DENTRO })) {
    Main.activateWindow(TOMATO);
    await sleep(600);
    const r = rect(TOMATO);
    const [x, y] = ponto(lado);
    const focoAntes = global.display.focus_window;
    const n = sonda().length;
    await clicar(r.x + x, r.y + y);
    const foco = global.display.focus_window;
    const eventos = sonda().slice(n).filter((e) => e.tipo === 'mousedown');
    const esperado = nome in FORA ? 'main' : 'tomato';
    const nomeDe = (w) => (w === TOMATO ? 'tomato' : w === MAIN ? 'main' : '-');
    const a = {
      px: [Math.round(x), Math.round(y)],
      esperado,
      foco_antes: nomeDe(focoAntes),
      foco_depois: nomeDe(foco),
      mousedown: eventos.map((e) => `${e.janela} (${e.dados.x}, ${e.dados.y}) ${e.dados.alvo}`),
    };
    a.ok = a.foco_antes === 'tomato' && a.foco_depois === esperado && eventos.length > 0 && eventos.every((e) => e.janela === esperado);
    R.medidas[`cliques-${lado}`][nome] = a;
    passo(`${lado} px, clique em ${nome}: foi para ${a.foco_depois} (${a.mousedown.join('; ')})`);
  }
  const todos = R.medidas[`cliques-${lado}`];
  const fora = Object.keys(FORA).filter((n) => !todos[n].ok);
  const dentro = Object.keys(DENTRO).filter((n) => !todos[n].ok);
  checar(`${lado} px: clicar fora do desenho chega à janela de trás (${Object.keys(FORA).length} pontos)`, fora.length === 0, fora.map((n) => ({ [n]: todos[n] })));
  checar(`${lado} px: clicar no corpo e na sépala fica no tomate`, dentro.length === 0, dentro.map((n) => ({ [n]: todos[n] })));
  Main.activateWindow(TOMATO);
  await sleep(600);
  await captura(`m54-${lado}.png`, { x: B.x - 20, y: B.y - 20, w: lado + 40, h: lado + 40 });
}

async function arrasteEBotoes(lado) {
  await arrastar(lado, 'corpo', 70, 200, 150, 40);
  await arrastar(lado, 'cabinho', 162, 60, -160, 60);
  await arrastar(lado, 'cálice', 183, 67, -120, -80);
  const r0 = rect(TOMATO);
  await clicarNoTomate(lado, 'principal');
  let f = await focoDoMotor();
  const iniciou = f.status === 'focus';
  await clicarNoTomate(lado, 'principal');
  f = await focoDoMotor();
  const pausou = f.status === 'paused';
  await clicarNoTomate(lado, 'encerrar');
  f = await focoDoMotor();
  const encerrou = f.status === 'idle';
  checar(`${lado} px: os botões comandam o motor (iniciar, pausar, encerrar)`, iniciou && pausou && encerrou, { iniciou, pausou, encerrou });
  checar(`${lado} px: a janela não se mexeu com os cliques nos botões`, JSON.stringify(r0) === JSON.stringify(rect(TOMATO)), { antes: r0, depois: rect(TOMATO) });
}

async function trocarPara(lado) {
  const r = await ipc('tomato_debug_size', { size: lado });
  passo(`tomato_debug_size ${lado}: ${JSON.stringify(r)}`);
  await esperar(() => rect(TOMATO).w === lado && rect(TOMATO).h === lado, 10000, `a janela com ${lado} px`);
  await sleep(800);
  const t = await lerTomate();
  R.medidas[`tamanho-${lado}`] = { frame: rect(TOMATO), buffer: (() => { const b = TOMATO.get_buffer_rect(); return [b.width, b.height]; })(), pagina: t.tamanho };
  checar(`trocar para ${lado} px: a janela e a página têm ${lado} × ${lado}`, t.tamanho[0] === lado && t.tamanho[1] === lado && TOMATO.get_buffer_rect().width === lado, R.medidas[`tamanho-${lado}`]);
  // Marca no sonda.jsonl, para o resumo casar com o app.log (a ordem basta).
  passo(`trocado para ${lado}`);
}

async function principal() {
  passo('início');
  const seat = global.stage.context.get_backend().get_default_seat();
  ptr = seat.create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
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
  // A main que volta pelo show_main é outra MetaWindow (M51).
  MAIN = await esperar(() => janelas().find((w) => w !== TOMATO && rect(w).w > 320), 10000, 'a main de volta');
  const dialogo = await comando('main', "String(Boolean(document.querySelector('.tt-dialogo-validacao')?.dialog?.open))");
  checar('a pergunta da validação fechou na main depois do Manter', dialogo === 'false', dialogo);
  const t0 = await lerTomate();
  checar('o tomate abre transparente, com 280 × 280', t0.modo === null && t0.tamanho[0] === 280, t0);

  await cliquesAtravessam(280);
  await arrasteEBotoes(280);

  await trocarPara(240);
  await cliquesAtravessam(240);

  await trocarPara(320);
  await cliquesAtravessam(320);
  await arrasteEBotoes(320);

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
