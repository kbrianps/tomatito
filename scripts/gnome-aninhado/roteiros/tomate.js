// Roteiro do M50 (tomate definitivo ligado ao motor), carregado com
// `gnome-shell --automation-script` pelo dentro.sh. O binário de debug de
// verdade, com o motor de verdade:
//
//   bash scripts/gnome-aninhado/rodar.sh tomate
//   TT_PORT=5174 bash scripts/gnome-aninhado/rodar.sh tomate   # binário compilado para a 5174
//
// O "Pronto quando" do M50, no que dá para medir sem um humano:
//   1. o comando de debug (`tomato_debug_open`, pedido pela página da main)
//      abre a `tomato` com 280 × 280 (tomatoSize), no tema full, transparente
//      e sem região: os quatro cantos são idênticos, pixel a pixel, à captura
//      da área de trabalho sem o tomate;
//   2. o arraste funciona pelo corpo, pelo cabinho e por uma sépala do cálice
//      (a janela anda o que o ponteiro andou);
//   3. os botões (cliques do ponteiro virtual) comandam o motor: iniciar,
//      pausar, retomar, encerrar, pular para o intervalo e para o foco, com
//      o get_state conferido depois de cada um; e Configurações mostra a main
//      escondida já em #/configuracoes;
//   4. o tomate e a main mostram o mesmo tempo: o mm:ss do tomate e os minutos
//      do mostrador da main saem do mesmo endsAt do get_state;
//   5. fechar o tomate (pelo compositor) e abrir de novo não zera nada: a
//      sessão pausada continua a mesma, com o mesmo restante, e a correndo
//      volta no tempo certo;
//   6. "Voltar ao modo normal" mostra a main e fecha o tomate.
import Clutter from 'gi://Clutter';
import GdkPixbuf from 'gi://GdkPixbuf';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import 'resource:///org/gnome/shell/ui/screenshot.js'; // promisifica Shell.Screenshot

export const METRICS = {};

const OUT = GLib.getenv('TT_OUT');
const SONDA_LOG = GLib.getenv('SONDA_LOG');
const LADO = 280; // tomatoSize padrão (M)
const K = LADO / 320; // viewBox → px da janela
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

// Um comando para a página de uma das janelas (sonda.js, M50: `janela`).
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
  comando('main', `window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args)}).then((r) => JSON.stringify(r ?? null))`).then(
    (t) => (typeof t === 'string' && !t.startsWith('erro') ? JSON.parse(t) : t),
  );
const focoDoMotor = async () => (await ipc('get_state')).focus;

// O que o tomate mostra, com o relógio de parede da página no mesmo instante.
const LER_TOMATE = `JSON.stringify((() => { const q = (s) => document.querySelector(s); const st = q('.stage');
  return { agora: Date.now(), estado: st?.dataset.state, rotulo: q('[data-rotulo]')?.textContent, tempo: q('[data-tempo]')?.textContent,
    rotuloDoTempo: q('[data-tempo]')?.getAttribute('aria-label'), contagem: q('[data-contagem]')?.textContent,
    anel: q('[data-anel]') && getComputedStyle(q('[data-anel]')).strokeDasharray,
    botoes: [...document.querySelectorAll('.stage button[data-acao]')].map((b) => [b.dataset.acao, b.getAttribute('aria-label'), b.disabled]),
    tema: document.documentElement.dataset.theme, pref: document.documentElement.dataset.themePref,
    plataforma: document.documentElement.dataset.platform,
    fundo: [getComputedStyle(document.documentElement).backgroundColor, getComputedStyle(document.body).backgroundColor],
    tamanho: [innerWidth, innerHeight] }; })())`;
const lerTomate = async () => JSON.parse(await comando('tomato', LER_TOMATE));
const LER_MAIN = `JSON.stringify({ agora: Date.now(), hash: location.hash, minutos: document.querySelector('[data-minutos]')?.textContent ?? null, visivel: document.visibilityState })`;
const lerMain = async () => JSON.parse(await comando('main', LER_MAIN));

const segundos = (mmss) => {
  const [m, s] = mmss.split(':').map(Number);
  return m * 60 + s;
};

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
  if (area) await shooter.screenshot_area(area.x, area.y, area.w, area.h, s);
  else await shooter.screenshot(false, s);
  s.close(null);
  passo(`captura ${nome}`);
}

// Os quatro cantos (24 × 24) da caixa do tomate, comparados com a captura sem ele.
function compararCantos(semTomate, comTomate, box) {
  const a = GdkPixbuf.Pixbuf.new_from_file(`${OUT}/${semTomate}`);
  const b = GdkPixbuf.Pixbuf.new_from_file(`${OUT}/${comTomate}`);
  const [pa, pb] = [a.get_pixels(), b.get_pixels()];
  const [ra, rb] = [a.get_rowstride(), b.get_rowstride()];
  const [na, nb] = [a.get_n_channels(), b.get_n_channels()];
  const px = (p, r, n, x, y) => {
    const i = y * r + x * n;
    return [p[i], p[i + 1], p[i + 2]];
  };
  const B = 24;
  const cantos = {};
  const origens = { sup_esq: [0, 0], sup_dir: [box.w - B, 0], inf_esq: [0, box.h - B], inf_dir: [box.w - B, box.h - B] };
  for (const [nome, [ox, oy]] of Object.entries(origens)) {
    let max = 0;
    for (let y = 0; y < B; y++)
      for (let x = 0; x < B; x++) {
        const [X, Y] = [box.x + ox + x, box.y + oy + y];
        const [u, v] = [px(pa, ra, na, X, Y), px(pb, rb, nb, X, Y)];
        max = Math.max(max, Math.abs(u[0] - v[0]), Math.abs(u[1] - v[1]), Math.abs(u[2] - v[2]));
      }
    cantos[nome] = max;
  }
  // E o meio do corpo, que precisa ser o tomate (e não o fundo).
  const meio = [box.x + Math.round(100 * K), box.y + Math.round(230 * K)];
  return { cantos, meio: { tomate: px(pb, rb, nb, ...meio), fundo: px(pa, ra, na, ...meio) } };
}

// Aperta em (vx, vy) do viewBox, arrasta (dx, dy) e confere se a janela andou junto.
async function arrastar(nome, vx, vy, dx, dy) {
  await semVisaoGeral();
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
  R.medidas[`arraste-${nome}`] = { ponto: [vx, vy], pedido: [dx, dy], delta };
  checar(`arrastar pelo ${nome} move a janela`, Math.abs(delta[0] - dx) <= 3 && Math.abs(delta[1] - dy) <= 3, { pedido: [dx, dy], delta });
}

// Clique num botão do tomate, pelo centro no viewBox (5.10).
const BOTOES = { voltar: [88, 122], configuracoes: [232, 122], encerrar: [106, 252], principal: [160, 252], pular: [214, 252] };
async function clicarNoTomate(nome) {
  await semVisaoGeral();
  const r = rect(TOMATO);
  const [vx, vy] = BOTOES[nome];
  mover(r.x + vx * K - 6, r.y + vy * K - 6);
  await sleep(150);
  mover(r.x + vx * K, r.y + vy * K);
  await sleep(150);
  botao(true);
  await sleep(70);
  botao(false);
  await sleep(700);
  passo(`clique em ${nome}`);
}

async function acharTomate() {
  TOMATO = await esperar(
    () => janelas().find((w) => w !== MAIN && rect(w).w > 0),
    30000,
    'a janela do tomate',
  );
  await esperar(
    () => sonda().filter((e) => e.janela === 'tomato' && e.tipo === 'info').length > nInfo,
    30000,
    'a página do tomate (sonda)',
  );
  nInfo = sonda().filter((e) => e.janela === 'tomato' && e.tipo === 'info').length;
  await sleep(800);
}
let nInfo = 0;

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
  MAIN.move_resize_frame(true, 1060, 300, 820, 620);
  await sleep(800);

  // 1. O comando de debug abre o tomate.
  const aberto = await comando('main', "window.__TAURI_INTERNALS__.invoke('tomato_debug_open').then(() => 'aberto', (e) => 'erro: ' + e)");
  checar('tomato_debug_open responde', aberto === 'aberto', aberto);
  await acharTomate();
  R.medidas.tomato = { frame: rect(TOMATO), buffer: (() => { const b = TOMATO.get_buffer_rect(); return [b.width, b.height]; })(), decorada: TOMATO.decorated };
  checar('a tomato tem 280 × 280, sem moldura', R.medidas.tomato.frame.w === LADO && R.medidas.tomato.frame.h === LADO && R.medidas.tomato.buffer[0] === LADO && !TOMATO.decorated, R.medidas.tomato);
  const t0 = await lerTomate();
  checar(
    'a página do tomate: tema full, plataforma linux, fundo transparente, ocioso',
    t0.tema === 'full' && t0.pref === 'full' && t0.plataforma === 'linux' && t0.fundo.every((c) => c === 'rgba(0, 0, 0, 0)') && t0.estado === 'idle' && t0.tempo === '30:00',
    t0,
  );

  // Transparência: a área de trabalho sem o tomate e com ele, na mesma caixa.
  const B = { x: 480, y: 300, w: LADO, h: LADO };
  await moverJanela(TOMATO, 80, 700);
  await sleep(1200);
  await captura('fundo.png');
  await moverJanela(TOMATO, B.x, B.y);
  await sleep(1200);
  await captura('com-tomate.png');
  await captura('m50-app-ocioso.png', { x: B.x - 20, y: B.y - 20, w: B.w + 40, h: B.h + 40 });
  const cmp = compararCantos('fundo.png', 'com-tomate.png', B);
  R.medidas.transparencia = cmp;
  checar(
    'cantos transparentes: os quatro blocos de 24 × 24 iguais à área de trabalho, e o corpo pintado',
    Object.values(cmp.cantos).every((d) => d === 0) && cmp.meio.tomate.some((c, i) => Math.abs(c - cmp.meio.fundo[i]) > 40),
    cmp,
  );

  // 2. Arraste pelo corpo, pelo cabinho e por uma sépala do cálice.
  await arrastar('corpo', 70, 200, 150, 40);
  await moverJanela(TOMATO, B.x, B.y);
  await arrastar('cabinho', 162, 60, -160, 60);
  await moverJanela(TOMATO, B.x, B.y);
  await arrastar('cálice', 183, 67, -120, -80);
  await moverJanela(TOMATO, B.x, B.y);
  // O texto do rosto não bloqueia o arraste (pointer-events: none).
  await arrastar('tempo', 160, 172, 90, 70);
  await moverJanela(TOMATO, B.x, B.y);

  // 3. Os botões comandam o motor.
  const r0 = rect(TOMATO);
  await clicarNoTomate('principal');
  let f = await focoDoMotor();
  let t = await lerTomate();
  checar('Iniciar (principal no ocioso) começa 30 min, sem pular intervalos', f.status === 'focus' && f.session?.minutes === 30 && f.session.skipBreaks === false && t.estado === 'focus', { status: f.status, minutos: f.session?.minutes, tomate: t.estado });
  checar('a janela não se mexeu com o clique', JSON.stringify(r0) === JSON.stringify(rect(TOMATO)), { antes: r0, depois: rect(TOMATO) });
  await captura('m50-app-foco.png', { x: B.x - 20, y: B.y - 20, w: B.w + 40, h: B.h + 40 });
  await clicarNoTomate('principal');
  f = await focoDoMotor();
  t = await lerTomate();
  checar('Pausar', f.status === 'paused' && t.estado === 'paused' && t.botoes.find((b) => b[0] === 'principal')[1] === 'Retomar', { status: f.status, tomate: t.estado });
  await clicarNoTomate('principal');
  f = await focoDoMotor();
  checar('Retomar', f.status === 'focus', f.status);
  await clicarNoTomate('encerrar');
  f = await focoDoMotor();
  t = await lerTomate();
  checar('Encerrar sessão', f.status === 'idle' && t.estado === 'idle', { status: f.status, tomate: t.estado });

  // Uma sessão de 60 min (2 focos e 1 intervalo), iniciada pela main.
  await ipc('focus_start', { minutes: 60, skipBreaks: false, taskId: null });
  await sleep(700);
  t = await lerTomate();
  checar('o tomate segue a sessão iniciada na main', t.estado === 'focus' && t.contagem === 'Período de foco (1 de 2)' && t.botoes.find((b) => b[0] === 'pular')[1] === 'Pular para o intervalo', t);
  await clicarNoTomate('pular');
  f = await focoDoMotor();
  t = await lerTomate();
  checar('Pular para o intervalo', f.status === 'break' && t.estado === 'break' && t.contagem === 'A seguir: foco de 27 min', { status: f.status, tomate: t.estado, contagem: t.contagem });
  await captura('m50-app-intervalo.png', { x: B.x - 20, y: B.y - 20, w: B.w + 40, h: B.h + 40 });
  await clicarNoTomate('pular');
  f = await focoDoMotor();
  t = await lerTomate();
  checar(
    'Pular para o foco; na última fase, Pular fica desabilitado',
    f.status === 'focus' && f.session.phaseIndex === 2 && t.contagem === 'Período de foco (2 de 2)' && t.botoes.find((b) => b[0] === 'pular')[2] === true,
    { status: f.status, fase: f.session?.phaseIndex, contagem: t.contagem, botoes: t.botoes },
  );

  // 4. O mesmo tempo: o tomate e a main, contra o endsAt do motor.
  await comando('main', "location.hash = '#/foco', 'ok'");
  await sleep(600);
  const amostras = [];
  for (let i = 0; i < 3; i++) {
    const motor = await focoDoMotor();
    const tt = await lerTomate();
    const mm = await lerMain();
    const esperadoTomate = Math.ceil((motor.session.endsAt - tt.agora) / 1000);
    const esperadoMain = Math.ceil((motor.session.endsAt - mm.agora) / 60000);
    amostras.push({ endsAt: motor.session.endsAt, tomate: tt.tempo, esperadoTomate, main: mm.minutos, esperadoMain, minutosDoTomate: Math.ceil(segundos(tt.tempo) / 60) });
    await sleep(1300);
  }
  R.medidas.mesmoTempo = amostras;
  checar(
    'o tomate e a main mostram o mesmo tempo (o mm:ss do tomate e os minutos da main saem do mesmo endsAt)',
    amostras.every((a) => Math.abs(segundos(a.tomate) - a.esperadoTomate) <= 1 && Number(a.main) === a.esperadoMain && a.minutosDoTomate === Number(a.main)),
    amostras,
  );
  await captura('m50-app-tomate-e-main.png', { x: B.x - 20, y: B.y - 20, w: 1900 - B.x, h: 660 });

  // 5. Fechar e reabrir: pausado, o restante fica igual; correndo, volta certo.
  await clicarNoTomate('principal');
  const antes = await focoDoMotor();
  const tAntes = await lerTomate();
  TOMATO.delete(global.get_current_time());
  await esperar(() => janelas().length === 1, 10000, 'o tomate fechado');
  await sleep(3000);
  const semTomate = await focoDoMotor();
  checar(
    'fechar o tomate não mexe no motor',
    semTomate.status === 'paused' && semTomate.session.id === antes.session.id && semTomate.session.remainingMs === antes.session.remainingMs,
    { antes: [antes.status, antes.session.remainingMs], depois: [semTomate.status, semTomate.session.remainingMs] },
  );
  await comando('main', "window.__TAURI_INTERNALS__.invoke('tomato_debug_open').then(() => 'aberto', (e) => 'erro: ' + e)");
  await acharTomate();
  await moverJanela(TOMATO, B.x, B.y);
  let tDepois = await lerTomate();
  checar('reaberto, o tomate mostra a mesma sessão pausada e o mesmo tempo', tDepois.estado === 'paused' && tDepois.tempo === tAntes.tempo && tDepois.contagem === tAntes.contagem, { antes: tAntes.tempo, depois: tDepois.tempo });
  await clicarNoTomate('principal');
  TOMATO.delete(global.get_current_time());
  await esperar(() => janelas().length === 1, 10000, 'o tomate fechado de novo');
  await sleep(4000);
  await comando('main', "window.__TAURI_INTERNALS__.invoke('tomato_debug_open').then(() => 'aberto', (e) => 'erro: ' + e)");
  await acharTomate();
  await moverJanela(TOMATO, B.x, B.y);
  const motor = await focoDoMotor();
  tDepois = await lerTomate();
  const esperado = Math.ceil((motor.session.endsAt - tDepois.agora) / 1000);
  checar(
    'reaberto com a sessão correndo, o tempo segue o endsAt (as 4 s fechado contaram)',
    motor.status === 'focus' && tDepois.estado === 'focus' && Math.abs(segundos(tDepois.tempo) - esperado) <= 1 && segundos(tDepois.tempo) <= segundos(tAntes.tempo) - 4,
    { antes: tAntes.tempo, depois: tDepois.tempo, esperado },
  );

  // Configurações: a main escondida aparece já em #/configuracoes.
  await ipc('plugin:window|hide', { label: 'main' });
  await sleep(600);
  await clicarNoTomate('configuracoes');
  await sleep(600);
  const m1 = await lerMain();
  checar('Configurações mostra a main em #/configuracoes, com o tomate aberto', m1.hash === '#/configuracoes' && m1.visivel === 'visible' && janelas().length === 2, { main: m1, janelas: janelas().length });

  // 6. Voltar ao modo normal: a main aparece e o tomate fecha.
  await ipc('plugin:window|hide', { label: 'main' });
  await sleep(600);
  await clicarNoTomate('voltar');
  await sleep(800);
  const m2 = await lerMain();
  checar('Voltar ao modo normal mostra a main e fecha o tomate', m2.visivel === 'visible' && janelas().length === 1, { main: m2, janelas: janelas().length });
  const f2 = await focoDoMotor();
  checar('e a sessão continua correndo', f2.status === 'focus', f2.status);

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
