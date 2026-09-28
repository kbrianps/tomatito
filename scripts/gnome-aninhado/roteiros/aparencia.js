// Roteiro do M24 (Aparência), carregado com `gnome-shell --automation-script`
// pelo dentro.sh. Abre o app sozinho, três vezes (LANCA_O_APP abaixo), com o
// ponteiro virtual do shell e a sonda (sonda.js) para ler a página, e grava
// $TT_OUT/resultado.json. Confere no WebKitGTK e no Rust de verdade:
//   partida 1 (sem settings.json, no Lite):
//     - a janela abre no Lite, e `await getCurrentWindow().theme()` responde
//       `dark` (o Rust fixa o tema nativo na criação);
//     - em Configurações, cada prévia pinta o próprio tema: um pixel do fundo
//       de cada miniatura, na captura do compositor, tem o --tt-bg-app daquele
//       tema (no Sistema, o Claro à esquerda e o Escuro à direita);
//     - um clique de verdade na prévia do Suave troca a página para o Suave,
//       o `theme()` passa a `light` e o settings.json no disco fica com
//       `theme: "suave"`;
//   partida 2 (reaberta depois de fechar): nasce no Suave, com o Suave marcado
//     e o `theme()` em `light` (a escolha sobreviveu ao reinício); clica em
//     "Usar configuração do sistema" (o GNOME aninhado está no padrão, claro:
//     resolve para Claro) e depois no Escuro;
//   partida 3: nasce no Escuro, com `theme()` em `dark`, e volta ao Lite pelo
//     teclado (setas no grupo de rádios).
// Cada partida fecha a janela pelo compositor e espera o app sair. O
// resumo-aparencia.mjs confere as checagens.
import Clutter from 'gi://Clutter';
import GdkPixbuf from 'gi://GdkPixbuf';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

// runPerfScript exige METRICS; o teste não mede desempenho.
export const METRICS = {};
// O rodar.sh procura esta linha: com ela, o dentro.sh não abre o app.
export const LANCA_O_APP = true;

const OUT = GLib.getenv('TT_OUT');
const BIN = GLib.getenv('TOMATITO_BIN');
const SONDA_LOG = GLib.getenv('SONDA_LOG');
const R = { passos: [], checagens: {}, partidas: [] };
const IDS = ['io.github.kbrianps.tomatito', 'io.github.kbrianps.tomatito.dev'];
// --tt-bg-app e --tt-bg-surface de cada tema (src/styles/tokens.css).
const FUNDO = { lite: [0xa5, 0x34, 0x2b], suave: [0xf6, 0xec, 0xe9], light: [0xf3, 0xf3, 0xf3], dark: [0x20, 0x20, 0x20] };
const CAMADA_ESCURO = [0x28, 0x28, 0x28];

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
    const v = fn();
    if (v) return v;
    await sleep(100);
  }
  throw new Error(`tempo esgotado: ${oque}`);
}
// Comando para a página, como no console do DevTools (sonda.config.mjs).
let nComando = 0;
async function comando(js) {
  const id = `c${++nComando}`;
  GLib.file_set_contents(`${OUT}/comando.json`, JSON.stringify({ id, js }));
  const r = await esperar(() => sonda().find((e) => e.tipo === 'comando' && e.dados.id === id), 8000, `comando ${js.slice(0, 60)}`);
  return r.dados.resultado;
}

// O que a página diz de si: atributos, o theme() da janela, a escolha marcada
// e a caixa de cada moldura de prévia (se a tela de Configurações estiver aberta).
const LER = `(async () => {
  const h = document.documentElement;
  const nativo = await window.__TAURI_INTERNALS__.invoke('plugin:window|theme', { label: 'main' });
  const grupo = document.querySelector('.tt-temas');
  const molduras = Object.fromEntries([...document.querySelectorAll('.tt-tema')].map((op) => {
    const r = op.querySelector('.tt-previa-moldura').getBoundingClientRect();
    return [op.dataset.tema, [r.x, r.y, r.width, r.height].map(Math.round)];
  }));
  const marcadas = [...document.querySelectorAll('.tt-tema[data-marcado]')].map((e) => e.dataset.tema);
  const radios = [...document.querySelectorAll('.tt-temas fluent-radio')].filter((r) => r.checked).map((r) => r.value);
  return JSON.stringify({ pref: h.dataset.themePref, tema: h.dataset.theme, nativo, hash: location.hash,
    valor: grupo?.value ?? null, marcadas, radios, molduras, inner: [innerWidth, innerHeight] });
})()`;
const ler = async () => JSON.parse(await comando(LER));

let ptr;
let kb;
const agora = () => GLib.get_monotonic_time();
const mover = (x, y) => ptr.notify_absolute_motion(agora(), x, y);
const botao = (apertado) =>
  ptr.notify_button(agora(), Clutter.BUTTON_PRIMARY, apertado ? Clutter.ButtonState.PRESSED : Clutter.ButtonState.RELEASED);
const tecla = async (keyval) => {
  kb.notify_keyval(agora(), keyval, Clutter.KeyState.PRESSED);
  await sleep(40);
  kb.notify_keyval(agora(), keyval, Clutter.KeyState.RELEASED);
  await sleep(300);
};
async function clicar(x, y) {
  mover(x, y);
  await sleep(150);
  botao(true);
  await sleep(60);
  botao(false);
  await sleep(700);
}

function lerSettings() {
  for (const id of IDS) {
    try {
      const [, bytes] = GLib.file_get_contents(`${GLib.get_user_data_dir()}/${id}/settings.json`);
      return { id, s: JSON.parse(new TextDecoder().decode(bytes)) };
    } catch {
      // sem arquivo nesse ID
    }
  }
  return null;
}
function limparDadosDoApp() {
  for (const base of [GLib.get_user_data_dir(), GLib.get_user_cache_dir()]) {
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
function esperarProcesso(proc, ms) {
  return new Promise((resolve) => {
    let feito = false;
    const fim = (v) => !feito && ((feito = true), resolve(v));
    proc.wait_async(null, () => fim(true));
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => (fim(false), GLib.SOURCE_REMOVE));
  });
}

// Captura a janela como o compositor a pinta e devolve um leitor de pixels.
function capturar(W, nome) {
  const img = W.get_compositor_private().get_image(null);
  const arq = `${OUT}/${nome}`;
  img.writeToPNG(arq);
  const pb = GdkPixbuf.Pixbuf.new_from_file(arq);
  const p = pb.get_pixels();
  const rs = pb.get_rowstride();
  const n = pb.get_n_channels();
  return (x, y) => [p[y * rs + x * n], p[y * rs + x * n + 1], p[y * rs + x * n + 2]];
}
const perto = (a, b, tol = 3) => a && a.every((v, i) => Math.abs(v - b[i]) <= tol);
const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();

let W = null;
let proc = null;
async function abrir(i) {
  const L = new Gio.SubprocessLauncher({ flags: Gio.SubprocessFlags.STDERR_MERGE });
  L.setenv('WAYLAND_DISPLAY', 'tt-aninhado', true);
  L.setenv('GDK_BACKEND', 'wayland', true);
  L.set_stdout_file_path(`${OUT}/app-${i}.log`);
  const antes = sonda().filter((e) => e.tipo === 'estado').length;
  proc = L.spawnv([BIN]);
  const pid = proc.get_identifier();
  passo(`partida ${i}: pid ${pid}`);
  W = await esperar(
    () => global.get_window_actors().map((a) => a.meta_window).find((w) => String(w.get_pid()) === pid && w.get_frame_rect().width > 0),
    60000,
    `a janela da partida ${i}`,
  );
  // A página desta partida mandou estado (a sonda carrega de novo a cada abertura).
  await esperar(() => sonda().filter((e) => e.tipo === 'estado').length > antes, 30000, 'a sonda da página');
  if (W.is_maximized()) W.unmaximize();
  W.move_resize_frame(true, 300, 150, 1000, 700);
  await sleep(1000);
  Main.activateWindow(W);
  await sleep(500);
  return W;
}
async function fechar(i) {
  W.delete(global.get_current_time());
  const saiu = await esperarProcesso(proc, 10000);
  if (!saiu) proc.force_exit();
  const saida = saiu ? (proc.get_if_exited() ? `saiu ${proc.get_exit_status()}` : 'sinal') : 'forçado';
  R.partidas.push({ partida: i, saida });
  checar(`partida ${i}: o app sai sozinho ao fechar a janela`, saida === 'saiu 0', saida);
  await sleep(800);
}
async function irParaConfiguracoes() {
  await comando(`(location.hash = '#/configuracoes', 'ok')`);
  await sleep(600);
  return ler();
}
// Clica no centro da moldura da prévia `tema` (coordenadas da página + a janela).
async function clicarNaPrevia(e, tema) {
  const [x, y, w, h] = e.molduras[tema];
  const r = W.get_frame_rect();
  mover(r.x + x + Math.round(w / 2) - 10, r.y + y + Math.round(h / 2) - 10); // entra na janela antes do clique
  await sleep(300);
  await clicar(r.x + x + Math.round(w / 2), r.y + y + Math.round(h / 2));
  mover(r.x + 900, r.y + 650); // tira o hover
  await sleep(300);
  return ler();
}

async function principal() {
  passo('início');
  Main.messageTray.bannerBlocked = true;
  new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' }).set_boolean('enable-animations', false);
  if (Main.overview.visible) Main.overview.hide();
  const seat = global.stage.context.get_backend().get_default_seat();
  ptr = seat.create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
  kb = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
  // O primeiro movimento do ponteiro virtual só o põe na tela; sem ele, o
  // primeiro clique numa janela se perde (visto na primeira rodada).
  await sleep(200);
  mover(960, 1070);
  await sleep(1000);
  limparDadosDoApp();

  // Partida 1: sem settings.json.
  await abrir(1);
  let e = await ler();
  R.p1_inicio = e;
  checar('partida 1: sem settings.json, abre no Lite com theme() = dark', e.pref === 'lite' && e.tema === 'lite' && e.nativo === 'dark', e);
  e = await irParaConfiguracoes();
  R.p1_configuracoes = e;
  checar(
    'Configurações: cinco opções (sem o Full), só o Lite marcado',
    JSON.stringify(Object.keys(e.molduras)) === '["lite","suave","light","dark","system"]' &&
      JSON.stringify(e.marcadas) === '["lite"]' && JSON.stringify(e.radios) === '["lite"]' && e.valor === 'lite',
    e,
  );
  // Cada prévia pinta o próprio tema: o canto de baixo à esquerda de cada
  // miniatura é o fundo do app do tema; no Sistema, o de baixo à direita é a
  // camada do Escuro.
  const px = capturar(W, 'm24-configuracoes-lite.png');
  const amostras = {};
  for (const [tema, [x, y, w, h]] of Object.entries(e.molduras)) {
    const esq = px(x + 4, y + h - 4);
    const dir = px(x + w - 4, y + h - 4);
    amostras[tema] = { esquerda: hex(esq), direita: hex(dir) };
    const ok = tema === 'system' ? perto(esq, FUNDO.light) && perto(dir, CAMADA_ESCURO) : perto(esq, FUNDO[tema]);
    checar(`prévia ${tema}: pinta o próprio tema na tela`, ok, amostras[tema]);
  }
  e = await clicarNaPrevia(e, 'suave');
  R.p1_suave = e;
  capturar(W, 'm24-configuracoes-suave.png');
  checar(
    'clique na prévia do Suave: a página vai para o Suave, só ele marcado, e theme() = light',
    e.pref === 'suave' && e.tema === 'suave' && e.nativo === 'light' && JSON.stringify(e.marcadas) === '["suave"]' && JSON.stringify(e.radios) === '["suave"]',
    e,
  );
  const disco1 = lerSettings();
  checar('o settings.json no disco fica com theme e resolvedTheme = suave', disco1?.s?.theme === 'suave' && disco1?.s?.resolvedTheme === 'suave' && disco1?.s?.lastNormalTheme === 'suave', disco1);
  await fechar(1);

  // Partida 2: a escolha sobrevive ao reinício.
  await abrir(2);
  e = await ler();
  R.p2_inicio = e;
  checar('partida 2: reabre no Suave, com theme() = light', e.pref === 'suave' && e.tema === 'suave' && e.nativo === 'light', e);
  e = await irParaConfiguracoes();
  checar('partida 2: o Suave vem marcado em Configurações', JSON.stringify(e.marcadas) === '["suave"]' && JSON.stringify(e.radios) === '["suave"]', e);
  e = await clicarNaPrevia(e, 'system');
  R.p2_sistema = e;
  const disco2 = lerSettings();
  checar(
    'Usar configuração do sistema: resolve para Claro ou Escuro, igual ao theme(), e grava theme = system',
    e.pref === 'system' && ['light', 'dark'].includes(e.tema) && e.tema === e.nativo && disco2?.s?.theme === 'system' && disco2?.s?.resolvedTheme === e.tema,
    { e, disco: disco2?.s },
  );
  e = await clicarNaPrevia(e, 'dark');
  R.p2_escuro = e;
  capturar(W, 'm24-configuracoes-escuro.png');
  checar('clique no Escuro: página no Escuro e theme() = dark', e.pref === 'dark' && e.tema === 'dark' && e.nativo === 'dark', e);
  await fechar(2);

  // Partida 3: nasce no Escuro; volta ao Lite pelas setas.
  await abrir(3);
  e = await ler();
  R.p3_inicio = e;
  checar('partida 3: reabre no Escuro, com theme() = dark', e.pref === 'dark' && e.tema === 'dark' && e.nativo === 'dark', e);
  e = await irParaConfiguracoes();
  // O foco vai para o rádio marcado (Escuro) por um clique no nome dele, e as
  // setas para a esquerda andam até o Lite (Escuro → Claro → Suave → Lite).
  const [x, y, w, h] = e.molduras.dark;
  const r = W.get_frame_rect();
  await clicar(r.x + x + 30, r.y + y + h + 14);
  for (let k = 0; k < 3; k++) await tecla(Clutter.KEY_Left);
  await sleep(500);
  e = await ler();
  R.p3_lite = e;
  const disco3 = lerSettings();
  checar(
    'pelas setas, do Escuro ao Lite: página no Lite, theme() = dark e theme = lite no disco',
    e.pref === 'lite' && e.tema === 'lite' && e.nativo === 'dark' && JSON.stringify(e.marcadas) === '["lite"]' && disco3?.s?.theme === 'lite',
    { e, disco: disco3?.s, largura: w },
  );
  capturar(W, 'm24-configuracoes-lite-final.png');
  await fechar(3);
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
}
