// Roteiro do modo compacto (v0.4), carregado com `gnome-shell
// --automation-script` pelo dentro.sh, com o binário de debug de verdade:
//
//   bash scripts/gnome-aninhado/rodar.sh compacto
//
// 1. o botão "Modo compacto" do cartão de sessão abre a janelinha de 280 × 280
//    como um cartão no tema normal (data-skin="card", data-theme="lite",
//    opaca: os cantos têm a cor de fundo do tema), grava `theme: full` e
//    `compact: true`, e esconde a main;
// 2. o botão principal do cartão inicia a sessão no motor, e o anel redondo
//    anda;
// 3. "Voltar ao modo normal" fecha a janelinha, mostra a main e volta ao Lite;
// 4. escolher o Tomatito Full depois disso abre o tomate (sem o cartão) e
//    grava `compact: false`;
// 5. com o tomate aberto, pedir o modo compacto troca a janelinha pelo cartão.
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

async function captura(nome, area) {
  const shooter = new Shell.Screenshot();
  const s = Gio.File.new_for_path(`${OUT}/${nome}`).replace(null, false, Gio.FileCreateFlags.NONE, null);
  if (area) await shooter.screenshot_area(area.x, area.y, area.w, area.h, s);
  else await shooter.screenshot(false, s);
  s.close(null);
  passo(`captura ${nome}`);
}

const LER = `JSON.stringify((() => { const q = (s) => document.querySelector(s); const h = document.documentElement; const st = q('.stage');
  return { skin: h.dataset.skin ?? null, tema: h.dataset.theme, modo: h.dataset.fullMode ?? null, estado: st?.dataset.state, tempo: q('[data-tempo]')?.textContent,
    tomate: getComputedStyle(q('.art')).display, cartao: getComputedStyle(q('.art-cartao')).display,
    anel: getComputedStyle(q('[data-anel-cartao]')).strokeDasharray, fundo: getComputedStyle(document.body).backgroundColor,
    tamanho: [innerWidth, innerHeight] }; })())`;
const lerJanelinha = async () => JSON.parse(await comando('tomato', LER));
const pequena = () => janelas().find((w) => rect(w).w === LADO && rect(w).h === LADO);
let nInfo = 0;
async function esperarJanelinha() {
  const w = await esperar(pequena, 30000, 'a janelinha de 280 × 280');
  await esperar(() => sonda().filter((e) => e.janela === 'tomato' && e.tipo === 'info').length > nInfo, 30000, 'a página da janelinha (sonda)');
  nInfo = sonda().filter((e) => e.janela === 'tomato' && e.tipo === 'info').length;
  await sleep(1200);
  return w;
}
// As configurações pela janelinha: a main fica escondida no Full.
const configuracoes = async (janela) =>
  JSON.parse(await comando(janela, "window.__TAURI_INTERNALS__.invoke('settings_get').then((s) => JSON.stringify({ theme: s.theme, compact: s.compact, last: s.lastNormalTheme }))"));

async function principal() {
  passo('início');
  try {
    new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' }).set_boolean('enable-hot-corners', false);
    Main.messageTray.bannerBlocked = true;
  } catch {
    // segue
  }
  await esperar(() => (janelas().length && rect(janelas()[0]).w > 0 ? janelas() : null), 120000, 'a janela main');
  await esperar(() => sonda().some((e) => e.janela === 'main' && e.tipo === 'estado' && e.dados?.nav?.itens?.length === 4), 30000, 'a main desenhada');
  if (Main.overview.visible) Main.overview.hide();
  await sleep(1500);

  // 1. O botão do cartão de sessão.
  const botao = await comando('main', "(() => { const b = document.querySelector('[data-cartao=\"sessao\"] [data-compacto]'); if (!b) return 'sem botão'; const r = b.getBoundingClientRect(); b.click(); return JSON.stringify({ nome: b.getAttribute('aria-label'), lado: [Math.round(r.width), Math.round(r.height)] }); })()");
  checar('a tela Foco tem o botão "Modo compacto"', typeof botao === 'string' && JSON.parse(botao).nome === 'Modo compacto', botao);
  const w1 = await esperarJanelinha();
  const c1 = await lerJanelinha();
  const s1 = await configuracoes('tomato');
  checar('abre a janelinha de 280 × 280 como cartão no tema Lite', c1.skin === 'card' && c1.tema === 'lite' && c1.modo === 'opaque' && c1.tomate === 'none' && c1.cartao === 'block' && c1.tamanho.join() === '280,280', c1);
  checar('o fundo é o do tema (opaco), e não o do tomate', c1.fundo === 'rgb(165, 52, 43)', c1.fundo);
  checar('grava theme full e compact true, com o Lite guardado', s1.theme === 'full' && s1.compact === true && s1.last === 'lite', s1);
  await esperar(() => janelas().filter((w) => w.showing_on_its_workspace()).length === 1, 10000, 'a main escondida').catch(() => null);
  const visiveis = janelas().filter((w) => w.showing_on_its_workspace()).map((w) => rect(w).w);
  checar('a main se esconde: só a janelinha fica na tela', visiveis.length === 1 && visiveis[0] === LADO, visiveis);
  await captura('compacto-lite', rect(w1));

  // 2. O botão principal inicia a sessão.
  await comando('tomato', "document.querySelector('.stage [data-acao=\"principal\"]').click()");
  await sleep(2500);
  const c2 = await lerJanelinha();
  checar('o botão principal inicia a sessão, e o anel redondo anda', c2.estado === 'focus' && /^29:5\d$/.test(c2.tempo) && parseFloat(c2.anel) > 0, c2);
  await captura('compacto-foco', rect(w1));

  // 3. Voltar ao modo normal.
  await comando('tomato', "document.querySelector('.stage [data-acao=\"voltar\"]').click()");
  await esperar(() => !pequena() && janelas().some((w) => w.showing_on_its_workspace() && rect(w).w > LADO), 15000, 'a main de volta e a janelinha fechada');
  await sleep(800);
  const s3 = await configuracoes('main');
  const tema3 = await comando('main', 'document.documentElement.dataset.theme');
  checar('"Voltar ao modo normal" fecha a janelinha, mostra a main e volta ao Lite', s3.theme === 'lite' && tema3 === 'lite', { s3, tema3 });

  // 4. O Full de sempre continua sendo o tomate.
  await comando('main', "window.__TAURI_INTERNALS__.invoke('switch_window_mode', { full: true }).then(() => window.__TAURI_INTERNALS__.invoke('full_validation_answer', { answer: 'keep' })).then(() => 'aberto', (e) => 'erro: ' + JSON.stringify(e))");
  await esperarJanelinha();
  const c4 = await lerJanelinha();
  const s4 = await configuracoes('tomato');
  checar('o Tomatito Full abre o tomate, sem o cartão, e grava compact false', c4.skin === null && c4.tema === 'full' && c4.tomate !== 'none' && c4.cartao === 'none' && s4.theme === 'full' && s4.compact === false, { c4, s4 });

  // 5. Com o tomate aberto, o modo compacto troca a janelinha.
  // O caminho do usuário: a engrenagem do tomate mostra a main (sem sair do
  // Full), e nela o botão "Modo compacto" da tela Foco.
  await comando('tomato', "window.__TAURI_INTERNALS__.invoke('show_main', { route: '#/foco' }).then(() => 'ok', (e) => 'erro: ' + JSON.stringify(e))");
  await esperar(() => janelas().some((w) => w.showing_on_its_workspace() && rect(w).w > LADO), 15000, 'a main à vista com o tomate aberto');
  await sleep(1500);
  const troca = await comando('main', "window.__TAURI_INTERNALS__.invoke('switch_window_mode', { full: true, compact: true }).then(() => 'ok', (e) => 'erro: ' + JSON.stringify(e))", 30000);
  passo(`troca: ${troca}`);
  await sleep(1500);
  await esperarJanelinha();
  const c5 = await lerJanelinha();
  const quantas = janelas().filter((w) => rect(w).w === LADO).length;
  checar('com o tomate aberto, pedir o modo compacto troca a janelinha pelo cartão', c5.skin === 'card' && c5.tema === 'lite' && quantas === 1 && c5.estado === 'focus', { c5, quantas });
  passo('fim');
  salvar();
}

export async function run() {
  try {
    await principal();
  } catch (e) {
    R.erro = `${e}\n${e.stack}`;
    salvar();
  }
}
