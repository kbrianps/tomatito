// Roteiro do M41 (movimento), carregado com `gnome-shell --automation-script`
// pelo dentro.sh. Abre o app sozinho (LANCA_O_APP), duas vezes, e mexe em tudo
// com o ponteiro virtual:
//   partida 1, com o "Animações" do GNOME ligado (o padrão): a mídia não pede
//     menos movimento; trocar de tela pelo painel faz a tela nova subir 24 px
//     com o fade, em 300 ms, e o diálogo "Editar meta diária" entra com a
//     escala de 1,05 em 250 ms;
//   partida 2, com o "Animações" desligado: o app lê o
//     org.gnome.desktop.interface enable-animations = false do GSettings,
//     como na sessão de verdade (aqui por um keyfile da rodada, com
//     GSETTINGS_BACKEND=keyfile só para o app; o shell aninhado usa GSettings
//     em memória), e o WebKitGTK passa a responder prefers-reduced-motion:
//     reduce. Trocar de tela, abrir e fechar o diálogo, abrir e fechar um
//     expansível, ligar e desligar um switch e passar o ponteiro pelo painel:
//     só aparecem fades de 83 ms (nada mais longo, nada que mexa em posição,
//     escala ou giro).
// As animações são anotadas na página pelas medidas __ttGravarMovimento e
// __ttColherMovimento (scripts/preview/medidas.js, coladas na sonda). O
// resumo-movimento.mjs confere as checagens e os logs.
//
//   bash scripts/gnome-aninhado/rodar.sh movimento
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export const METRICS = {};
export const LANCA_O_APP = true;

const OUT = GLib.getenv('TT_OUT');
const BIN = GLib.getenv('TOMATITO_BIN');
const SONDA_LOG = GLib.getenv('SONDA_LOG');
const R = { passos: [], checagens: {}, animacoes: {} };
// O que pode mudar com movimento reduzido: opacidade e cores (e o avanço do
// anel, M27); display e overlay são as transições discretas do diálogo.
const SEM_MOVIMENTO = ['opacity', 'background-color', 'color', 'border-color', 'box-shadow', '--tt-camada', 'stroke-dashoffset', 'display', 'overlay'];
const DECEL = 'cubic-bezier(0, 0, 0, 1)';

const salvar = () => GLib.file_set_contents(`${OUT}/resultado.json`, JSON.stringify(R, null, 2));
const sleep = (ms) =>
  new Promise((r) => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => (r(), GLib.SOURCE_REMOVE)));
const agoraMs = () => GLib.get_monotonic_time() / 1000;
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
    await sleep(150);
  }
  throw new Error(`tempo esgotado: ${oque}`);
}

let nComando = 0;
async function comando(js) {
  const id = `c${++nComando}`;
  const antes = sonda().length;
  GLib.file_set_contents(`${OUT}/comando.json`, JSON.stringify({ id, js }));
  const r = await esperar(
    () => sonda().slice(antes).find((e) => e.tipo === 'comando' && e.dados.id === id),
    10000,
    `comando ${js.slice(0, 80)}`,
  );
  const texto = JSON.stringify(r.dados.resultado) ?? 'null';
  passo(`comando ${js.slice(0, 120)} => ${texto.length > 300 ? `${texto.slice(0, 300)}…` : texto}`);
  return r.dados.resultado;
}
// A sonda de uma página nova roda o comando.json que ainda não viu (M40).
const limparComando = () => GLib.file_set_contents(`${OUT}/comando.json`, '{}');

function limparDadosDoApp() {
  for (const base of [GLib.get_user_data_dir(), GLib.get_user_cache_dir(), GLib.get_user_config_dir()]) {
    let it;
    try {
      it = Gio.File.new_for_path(base).enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
    } catch {
      continue;
    }
    for (let info = it.next_file(null); info; info = it.next_file(null)) {
      if (/tomatito/i.test(info.get_name())) GLib.spawn_command_line_sync(`rm -rf ${GLib.shell_quote(`${base}/${info.get_name()}`)}`);
    }
  }
}

// --- Ponteiro virtual.
let ptr;
const agora = () => GLib.get_monotonic_time();
const mover = (x, y) => ptr.notify_absolute_motion(agora(), x, y);
const botao = (apertado) =>
  ptr.notify_button(agora(), Clutter.BUTTON_PRIMARY, apertado ? Clutter.ButtonState.PRESSED : Clutter.ButtonState.RELEASED);
async function clicarEm(x, y) {
  mover(x, y);
  await sleep(150);
  botao(true);
  await sleep(60);
  botao(false);
  await sleep(600);
}

let proc = null;
let pid = null;
const janelaDoApp = () =>
  global.get_window_actors().map((a) => a.meta_window).find((w) => String(w.get_pid()) === String(pid) && w.get_title() === 'Tomatito');
function esperarProcesso(p, ms) {
  return new Promise((resolve) => {
    let feito = false;
    const fim = (v) => !feito && ((feito = true), resolve(v));
    p.wait_async(null, () => fim(true));
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => (fim(false), GLib.SOURCE_REMOVE));
  });
}

// "Animações" desligado: o keyfile do GSettings da rodada, lido só pelo app.
const KEYFILE_DIR = `${GLib.get_user_config_dir()}/glib-2.0/settings`;
function lancador(arquivo, { semAnimacoes }) {
  const L = new Gio.SubprocessLauncher({ flags: Gio.SubprocessFlags.STDERR_MERGE });
  L.setenv('WAYLAND_DISPLAY', 'tt-aninhado', true);
  L.setenv('GDK_BACKEND', 'wayland', true);
  L.setenv('ALSA_CONFIG_PATH', '/dev/null', true);   // sem saída de áudio
  if (semAnimacoes) L.setenv('GSETTINGS_BACKEND', 'keyfile', true);
  L.set_stdout_file_path(`${OUT}/${arquivo}`);
  return L;
}

async function abrir(i, opcoes) {
  const antes = sonda().filter((e) => e.tipo === 'estado').length;
  proc = lancador(`app-${i}.log`, opcoes).spawnv([BIN]);
  pid = proc.get_identifier();
  passo(`partida ${i}: pid ${pid}${opcoes.semAnimacoes ? ', com o "Animações" desligado' : ''}`);
  const W = await esperar(() => { const w = janelaDoApp(); return w && w.get_frame_rect().width > 0 ? w : null; }, 60000, `a janela da partida ${i}`);
  await esperar(() => sonda().filter((e) => e.tipo === 'estado').length > antes, 30000, 'a sonda da página');
  if (W.is_maximized()) W.unmaximize();
  W.move_resize_frame(true, 300, 100, 1000, 800);
  for (let k = 0; k < 20 && (Main.overview.visible || Main.overview.animationInProgress); k++) {
    if (!Main.overview.animationInProgress) Main.overview.hide();
    await sleep(500);
  }
  Main.activateWindow(W);
  await sleep(1000);
  const r = W.get_frame_rect();
  mover(r.x + 500, r.y + 400);
  await sleep(300);
}
async function sair() {
  await comando("window.__TAURI_INTERNALS__.invoke('app_quit').then(() => 'ok', (e) => ({ erro: e }))").catch(() => null);
  const saiu = await esperarProcesso(proc, 10000);
  limparComando();
  if (!saiu) {
    passo('o app não saiu pelo app_quit; SIGKILL');
    proc.force_exit();
    await esperarProcesso(proc, 5000);
  }
}

// Rola até o elemento e clica no centro dele (px CSS da página = px da janela, a 100%).
async function centro(seletor) {
  const c = await comando(
    `(() => { const e = document.querySelector(${JSON.stringify(seletor)}); if (!e) return null; e.scrollIntoView({ block: 'nearest' }); const b = e.getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; })()`,
  );
  if (!c) throw new Error(`sem elemento: ${seletor}`);
  const r = janelaDoApp().get_frame_rect();
  return [r.x + c[0], r.y + c[1]];
}
async function clicar(seletor) {
  const [x, y] = await centro(seletor);
  await clicarEm(x, y);
}
const colher = () => comando('__ttColherMovimento()');
const nav = (rota) => `.tt-nav-item[data-rota="${rota}"]`;
const daPagina = (l) => l.filter((a) => a.alvo.startsWith('div.tt-pagina'));
const doDialogo = (l, p) => l.filter((a) => a.alvo.startsWith('fluent-dialog>dialog') && a.props.includes(p));

async function principal() {
  passo('início');
  Main.messageTray.bannerBlocked = true;
  // As animações do shell (as de abrir janela) desligadas no shell aninhado,
  // como nos outros roteiros; o app não as vê (GSettings em memória).
  new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' }).set_boolean('enable-animations', false);
  if (Main.overview.visible) Main.overview.hide();
  const seat = global.stage.context.get_backend().get_default_seat();
  ptr = seat.create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
  await sleep(200);
  mover(960, 1070);
  await sleep(300);
  limparDadosDoApp();

  // ===== Partida 1: "Animações" ligado =====
  await abrir(1, { semAnimacoes: false });
  const g1 = await comando('__ttGravarMovimento()');
  checar('"Animações" ligado: a página não pede menos movimento', g1?.reduzido === false, g1);
  await colher();
  await clicar(nav('temporizador'));
  const p1 = daPagina(await colher());
  R.animacoes.partida1Tela = p1;
  checar('"Animações" ligado: a tela nova sobe 24 px com o fade, em 300 ms, com a desaceleração',
    p1.length === 1 && p1[0].props.includes('transform') && p1[0].duracao === 300 && p1[0].curva === DECEL && /translateY\(24px\)/.test(p1[0].de.transform ?? ''), p1);
  await clicar(nav('foco'));
  await sleep(600);
  await colher();
  await clicar('.tt-progresso-editar');
  const d1 = await colher();
  R.animacoes.partida1Dialogo = d1;
  checar('"Animações" ligado: o diálogo entra da escala 1,05 em 250 ms',
    doDialogo(d1, 'scale').some((a) => a.duracao === 250 && a.de.scale === '1.05'), d1);
  await clicar('fluent-dialog [data-cancelar]');
  await sair();

  // ===== Partida 2: "Animações" desligado =====
  GLib.mkdir_with_parents(KEYFILE_DIR, 0o755);
  GLib.file_set_contents(`${KEYFILE_DIR}/keyfile`, '[org/gnome/desktop/interface]\nenable-animations=false\n');
  await abrir(2, { semAnimacoes: true });
  const g2 = await comando('__ttGravarMovimento()');
  checar('"Animações" desligado: o WebKitGTK responde prefers-reduced-motion: reduce', g2?.reduzido === true, g2);
  await colher();
  const lotes = {};
  for (const rota of ['temporizador', 'cronometro', 'foco']) {
    await clicar(nav(rota));
    lotes[`tela ${rota}`] = await colher();
  }
  await clicar('.tt-progresso-editar');
  lotes['diálogo, entrada'] = await colher();
  await clicar('fluent-dialog [data-cancelar]');
  lotes['diálogo, saída'] = await colher();
  await clicar(nav('configuracoes'));
  lotes['tela configuracoes'] = await colher();
  await clicar('.tt-expansor-botao');
  lotes['expansível, abrir'] = await colher();
  await clicar('.tt-expansor-botao');
  lotes['expansível, fechar'] = await colher();
  await clicar('[data-cartao="fechar-bandeja"] fluent-switch');
  lotes['switch, desligar'] = await colher();
  await clicar('[data-cartao="fechar-bandeja"] fluent-switch');
  lotes['switch, ligar'] = await colher();
  const [hx, hy] = await centro(nav('temporizador'));
  mover(hx, hy);
  await sleep(400);
  const [ix, iy] = await centro(nav('cronometro'));
  mover(ix, iy);
  await sleep(400);
  lotes['hover no painel'] = await colher();
  R.animacoes.partida2 = lotes;

  const todas = Object.values(lotes).flat();
  const ruins = todas.filter((a) => a.duracao > 83 || a.props.some((p) => !SEM_MOVIMENTO.includes(p)));
  checar(`"Animações" desligado: só fades de 83 ms (${todas.length} animações; nada mais longo, nada que mexa em posição, escala ou giro)`,
    todas.length > 0 && ruins.length === 0, ruins);
  const telas = ['temporizador', 'cronometro', 'foco', 'configuracoes'].map((r) => daPagina(lotes[`tela ${r}`]));
  checar('"Animações" desligado: cada troca de tela é um fade de 83 ms, linear, sem subida',
    telas.every((p) => p.length === 1 && p[0].props.join() === 'opacity' && p[0].duracao === 83 && p[0].curva === 'linear'), telas);
  checar('"Animações" desligado: o diálogo entra e sai só com o fade de 83 ms',
    doDialogo(lotes['diálogo, entrada'], 'opacity').length > 0 && doDialogo(lotes['diálogo, saída'], 'opacity').length > 0 &&
      doDialogo([...lotes['diálogo, entrada'], ...lotes['diálogo, saída']], 'scale').length === 0,
    [lotes['diálogo, entrada'], lotes['diálogo, saída']]);
  checar('"Animações" desligado: o chevron e o switch mudam de uma vez',
    [...lotes['expansível, abrir'], ...lotes['expansível, fechar'], ...lotes['switch, desligar'], ...lotes['switch, ligar']]
      .every((a) => !a.alvo.startsWith('svg.tt-icone') && !a.alvo.startsWith('fluent-switch>')),
    lotes);
  checar('"Animações" desligado: o hover do painel continua com o fundo em 83 ms, linear',
    lotes['hover no painel'].some((a) => a.alvo.startsWith('a.tt-nav-item') && a.duracao === 83 && a.curva === 'linear'), lotes['hover no painel']);
  await sair();
  passo('fim');
}

export async function run() {
  try {
    await principal();
  } catch (e) {
    R.erro = `${e}\n${e.stack}`;
    salvar();
    try {
      proc?.force_exit();
    } catch {
      // já saiu
    }
  }
  GLib.file_set_contents(`${OUT}/comando.json`, '{}');
}
