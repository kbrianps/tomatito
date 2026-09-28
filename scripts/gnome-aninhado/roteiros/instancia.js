// Roteiro do M37 (instância única, Sair e estado da janela), carregado com
// `gnome-shell --automation-script` pelo dentro.sh. Abre o app sozinho
// (LANCA_O_APP), várias vezes, com o relógio a 60×.
//
//   TT_BIN_BUILD=<cópia do binário do npm run build:debug> \
//     bash scripts/gnome-aninhado/rodar.sh instancia
//
// O TOMATITO_BIN (o do `cargo build`) carrega a página do Vite, com a sonda:
// é o `dev:app`, sem `import.meta.env.PROD`. O TT_BIN_BUILD é um build com
// os arquivos embutidos (`npm run build:debug`, com `PROD`), sem sonda: a
// página é lida pelo inspetor remoto do WebKitGTK (inspetor.mjs). Sem ele, a
// parte de produção fica de fora (e o resumo acusa).
//
// O "Pronto quando" do M37, no que dá para medir sem um humano:
//   1. dev: o botão direito abre o menu do WebView (o controle da parte de
//      produção); o F5 e o Ctrl+R (medidos);
//   2. Ctrl+W esconde a janela, e abrir o app de novo (segunda instância) a
//      traz de volta, ativa (ou com o aviso de pronta), e a segunda instância
//      sai com código 0; o mesmo com a janela minimizada;
//   3. Ctrl+Q, com uma sessão de foco, um temporizador e o cronômetro
//      correndo: o app sai com código 0, o state.json é regravado na saída,
//      e, na partida seguinte, o parcial da sessão está nas estatísticas;
//   4. o tamanho da janela volta na partida seguinte (no Wayland, só ele);
//   5. sair com a janela escondida (Ctrl+W e depois o app_quit, o mesmo
//      caminho do "Sair" da bandeja e do Ctrl+Q) e reabrir mostra a janela,
//      maximizada como estava;
//   6. produção: o botão direito fora de campos não abre menu, e num campo de
//      texto abre, sem fechar o campo vazio de "Tarefas", e o "Colar" dele
//      cola; o F5 e o Ctrl+R não recarregam (uma marca posta na página e o
//      texto do campo continuam lá; o controle, um location.reload() pelo
//      inspetor, apaga a marca); Ctrl+W, segunda instância e Ctrl+Q também no
//      build.
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import 'resource:///org/gnome/shell/ui/screenshot.js'; // promisifica Shell.Screenshot

export const METRICS = {};
export const LANCA_O_APP = true;

const OUT = GLib.getenv('TT_OUT');
const SONDA_LOG = GLib.getenv('SONDA_LOG');
const BIN = GLib.getenv('TOMATITO_BIN');
const BIN_BUILD = GLib.getenv('TT_BIN_BUILD') || null;
const NODE = GLib.getenv('TT_NODE');
const INSPETOR = `${GLib.path_get_dirname(GLib.getenv('TT_CONSOLE_MJS'))}/inspetor.mjs`;
const PORTA = 9737;
const R = { passos: [], checagens: {}, medidas: { build: BIN_BUILD } };

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
const medir = (nome, valor) => {
  R.medidas[nome] = valor;
  passo(`medida ${nome}: ${JSON.stringify(valor)}`);
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
const talvez = (p) => p.catch(() => null);

// --- A página: pela sonda (dev) ou pelo inspetor (build).
let modo = 'dev';
let nComando = 0;
async function comandoDaSonda(js, prazo = 10000) {
  const id = `c${++nComando}`;
  GLib.file_set_contents(`${OUT}/comando.json`, JSON.stringify({ id, js }));
  const r = await esperar(() => sonda().find((e) => e.tipo === 'comando' && e.dados.id === id), prazo, `comando ${js.slice(0, 80)}`);
  return r.dados.resultado;
}
function comandoDoInspetor(js) {
  return new Promise((resolve) => {
    const p = Gio.Subprocess.new([NODE, INSPETOR, `127.0.0.1:${PORTA}`, js], Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE);
    p.communicate_utf8_async(null, null, (proc, res) => {
      try {
        const [, saida] = proc.communicate_utf8_finish(res);
        const r = JSON.parse(saida.trim().split('\n').at(-1));
        resolve(r.erro ? `erro: ${r.erro}` : r.valor);
      } catch (e) {
        resolve(`erro: ${e}`);
      }
    });
  });
}
async function pagina(js) {
  const r = modo === 'dev' ? await comandoDaSonda(js) : await comandoDoInspetor(js);
  const texto = JSON.stringify(r) ?? 'null';
  passo(`${modo}: ${js.slice(0, 110)} => ${texto.length > 300 ? `${texto.slice(0, 300)}…` : texto}`);
  return r;
}
const invoke = (cmd, args = {}) => pagina(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args)})`);
// O centro de um elemento, em coordenadas da página (rolado para a vista antes).
const centro = (seletor) =>
  pagina(`(() => { const el = document.querySelector(${JSON.stringify(seletor)}); if (!el) return null; el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect(); return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)]; })()`);

// --- Ponteiro e teclado virtuais.
let ptr;
let kb;
const agora = () => GLib.get_monotonic_time();
const mover = (x, y) => ptr.notify_absolute_motion(agora(), x, y);
async function clicar(x, y, botao = Clutter.BUTTON_PRIMARY) {
  mover(x - 8, y - 8);
  await sleep(200);
  mover(x, y);
  await sleep(150);
  ptr.notify_button(agora(), botao, Clutter.ButtonState.PRESSED);
  await sleep(60);
  ptr.notify_button(agora(), botao, Clutter.ButtonState.RELEASED);
  await sleep(700);
}
async function clicarNaPagina(seletor, botao) {
  const c = await centro(seletor);
  if (!Array.isArray(c)) throw new Error(`sem ${seletor} na página`);
  const fr = W.get_frame_rect();
  await clicar(fr.x + c[0], fr.y + c[1], botao);
}
async function atalho(...keyvals) {
  for (const k of keyvals) {
    kb.notify_keyval(agora(), k, Clutter.KeyState.PRESSED);
    await sleep(40);
  }
  for (const k of [...keyvals].reverse()) {
    kb.notify_keyval(agora(), k, Clutter.KeyState.RELEASED);
    await sleep(40);
  }
  passo(`teclas ${keyvals.map((k) => Clutter.keyval_name(k)).join('+')}`);
  await sleep(600);
}

// --- O processo e a janela.
let proc = null;
let pid = null;
let W = null;
const janelaDoApp = () =>
  global.get_window_actors().map((a) => a.meta_window).find((w) => String(w.get_pid()) === String(pid) && w.get_title() === 'Tomatito');
const janelaVisivel = () => Boolean(janelaDoApp()?.showing_on_its_workspace());
// Os menus que o app abre por cima da janela (o do WebView é um xdg_popup).
const popups = () =>
  global.get_window_actors().map((a) => a.meta_window)
    .filter((w) => String(w.get_pid()) === String(pid) && w.get_window_type() !== Meta.WindowType.NORMAL)
    .map((w) => ({ tipo: w.get_window_type(), titulo: w.get_title() }));
const vivo = () => proc && !proc.get_if_exited() && !proc.get_if_signaled() && GLib.file_test(`/proc/${pid}`, GLib.FileTest.EXISTS);

function esperarProcesso(p, ms) {
  return new Promise((resolve) => {
    let feito = false;
    const fim = (v) => !feito && ((feito = true), resolve(v));
    p.wait_async(null, () => fim(true));
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => (fim(false), GLib.SOURCE_REMOVE));
  });
}
const codigoDe = (p) => (p.get_if_exited() ? p.get_exit_status() : p.get_if_signaled() ? `sinal ${p.get_term_sig()}` : null);

function lancador(i, extra = {}) {
  const L = new Gio.SubprocessLauncher({ flags: Gio.SubprocessFlags.STDERR_MERGE });
  L.setenv('WAYLAND_DISPLAY', 'tt-aninhado', true);
  L.setenv('GDK_BACKEND', 'wayland', true);
  L.setenv('TOMATITO_SPEED', '60', true);
  for (const [k, v] of Object.entries(extra)) L.setenv(k, v, true);
  L.set_stdout_file_path(`${OUT}/app-${i}.log`);
  return L;
}

async function ativar() {
  // Esconder desfaz a janela no compositor, e mostrar cria outra: a
  // referência antiga não serve mais.
  W = janelaDoApp() ?? W;
  for (let k = 0; k < 20 && (Main.overview.visible || Main.overview.animationInProgress); k++) {
    if (!Main.overview.animationInProgress) Main.overview.hide();
    await sleep(500);
  }
  Main.activateWindow(W);
  await sleep(500);
}

// Abre o binário e espera a janela aparecer e a página responder. Não mexe no
// tamanho: a partida seguinte confere o que o window-state devolveu.
async function abrir(i, bin, extra = {}) {
  if (modo === 'dev') GLib.file_set_contents(`${OUT}/comando.json`, '{}');
  const antes = sonda().filter((e) => e.tipo === 'estado').length;
  proc = lancador(i, extra).spawnv([bin]);
  pid = proc.get_identifier();
  passo(`partida ${i} (${modo}): pid ${pid}`);
  W = await esperar(() => { const w = janelaDoApp(); return w && w.get_frame_rect().width > 0 && w.showing_on_its_workspace() ? w : null; }, 60000, `a janela da partida ${i}`);
  if (modo === 'dev') await esperar(() => sonda().filter((e) => e.tipo === 'estado').length > antes, 30000, 'a sonda da página');
  else await esperar(async () => (await comandoDoInspetor('document.readyState')) === 'complete', 30000, 'a página pelo inspetor');
  await sleep(800);
  await ativar();
  return W;
}

// Uma segunda abertura do mesmo binário: avisa a primeira e sai.
async function segundaInstancia(i, bin) {
  const p = lancador(`${i}-segunda`).spawnv([bin]);
  const saiu = await esperarProcesso(p, 20000);
  const r = { saiu, codigo: saiu ? codigoDe(p) : null };
  if (!saiu) p.force_exit();
  passo(`segunda instância: ${JSON.stringify(r)}`);
  return r;
}

const ativa = () => {
  const w = janelaDoApp();
  return Boolean(w && (global.display.focus_window === w || w.demands_attention || w.urgent));
};

async function captura(nome) {
  const shooter = new Shell.Screenshot();
  const s = Gio.File.new_for_path(`${OUT}/${nome}`).replace(null, false, Gio.FileCreateFlags.NONE, null);
  await shooter.screenshot_area(0, 0, 1920, 1080, s);
  s.close(null);
  passo(`captura ${nome}`);
}

// --- Arquivos do app na pasta isolada da rodada.
const ID_DEV = 'io.github.kbrianps.tomatito'; // o do `cargo build` (tauri.conf.json)
const dados = (id) => `${GLib.getenv('XDG_DATA_HOME')}/${id}`;
const configuracao = (id) => `${GLib.getenv('XDG_CONFIG_HOME')}/${id}`;
function lerJson(caminho) {
  try {
    const [, bytes] = GLib.file_get_contents(caminho);
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (e) {
    return { erro: String(e) };
  }
}
function mtime(caminho) {
  try {
    const info = Gio.File.new_for_path(caminho).query_info('time::modified,time::modified-usec', Gio.FileQueryInfoFlags.NONE, null);
    return info.get_attribute_uint64('time::modified') * 1000 + Math.floor(info.get_attribute_uint32('time::modified-usec') / 1000);
  } catch {
    return null;
  }
}
const tamanho = (w) => { const r = w.get_frame_rect(); return [r.width, r.height]; };
const perto = (a, b) => Math.abs(a[0] - b[0]) <= 2 && Math.abs(a[1] - b[1]) <= 2;

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
    // sem a bandeja de mensagens: segue
  }
  mover(960, 1070);
  await sleep(300);

  // ===== Partida 1 (dev) =====
  modo = 'dev';
  await abrir(1, BIN);
  W.move_resize_frame(true, 300, 150, 1000, 700);
  await sleep(600);

  // 1. O dev continua com o menu do WebView e com a recarga.
  await clicarNaPagina('.tt-conteudo h1', Clutter.BUTTON_SECONDARY);
  const menuDev = await talvez(esperar(() => (popups().length ? popups() : null), 3000, 'o menu do WebView (dev)'));
  checar('dev: o botão direito fora de campos abre o menu do WebView', Boolean(menuDev), menuDev ?? popups());
  await captura('m37-dev-menu.png');
  await atalho(Clutter.KEY_Escape);
  await talvez(esperar(() => popups().length === 0, 3000, 'o menu fechado'));
  await clicarNaPagina('.tt-conteudo h1');
  const cargas = () => sonda().filter((e) => e.tipo === 'info').length;
  let n0 = cargas();
  await atalho(Clutter.KEY_F5);
  const f5dev = await talvez(esperar(() => cargas() > n0, 3000, 'recarga pelo F5'));
  await talvez(esperar(() => sonda().filter((e) => e.tipo === 'estado').length && vivo(), 5000, 'a página'));
  await sleep(1000);
  await ativar();
  await clicarNaPagina('.tt-conteudo h1');
  n0 = cargas();
  await atalho(Clutter.KEY_Control_L, Clutter.KEY_r);
  const ctrlRdev = await talvez(esperar(() => cargas() > n0, 3000, 'recarga pelo Ctrl+R'));
  medir('dev: F5 e Ctrl+R recarregam', { f5: Boolean(f5dev), ctrlR: Boolean(ctrlRdev) });
  checar('dev: F5 e Ctrl+R recarregam a página', f5dev && ctrlRdev, { f5: Boolean(f5dev), ctrlR: Boolean(ctrlRdev) });
  await sleep(1500);
  await ativar();

  // 2. Ctrl+W esconde; abrir de novo traz de volta.
  await clicarNaPagina('.tt-conteudo h1');
  await atalho(Clutter.KEY_Control_L, Clutter.KEY_w);
  await talvez(esperar(() => !janelaVisivel(), 3000, 'a janela escondida'));
  checar('Ctrl+W esconde a janela e o app segue', !janelaVisivel() && vivo(), { visivel: janelaVisivel(), vivo: vivo() });
  let s2 = await segundaInstancia(1, BIN);
  await talvez(esperar(() => janelaVisivel(), 5000, 'a janela de volta'));
  await sleep(500);
  checar('com a janela escondida, abrir de novo a traz de volta', janelaVisivel() && vivo(), { visivel: janelaVisivel(), vivo: vivo() });
  checar('a janela volta ativa (ou com o aviso de pronta)', ativa(), { foco: global.display.focus_window?.get_title() ?? null, atencao: janelaDoApp()?.demands_attention });
  checar('a segunda instância sai sozinha, com código 0', s2.saiu && s2.codigo === 0, s2);
  checar('a página volta visível', (await pagina('document.visibilityState')) === 'visible');
  W = janelaDoApp();
  await captura('m37-segunda-instancia.png');

  W.minimize();
  await talvez(esperar(() => W.minimized, 3000, 'a janela minimizada'));
  s2 = await segundaInstancia('1b', BIN);
  await talvez(esperar(() => (!W.minimized && janelaVisivel()) || W.demands_attention, 5000, 'a janela restaurada'));
  // No Wayland, o app não desfaz o minimizar sozinho: o set_focus pede a
  // ativação ao GNOME, que restaura a janela ou só avisa que está pronta.
  checar('com a janela minimizada, abrir de novo a restaura (ou avisa que está pronta)',
    ((!W.minimized && janelaVisivel()) || W.demands_attention) && s2.codigo === 0, { minimizada: W.minimized, atencao: W.demands_attention, visivel: janelaVisivel(), segunda: s2 });
  if (W.minimized) W.unminimize();

  // 3. Ctrl+Q com tudo correndo.
  await ativar();
  // Uma hora (1 min a 60×): nenhuma transição dos temporizadores até o
  // Ctrl+Q, e a única gravação do state.json nesse trecho é a da saída.
  const criado = await invoke('timer_create', { name: 'Chá', durationMs: 60 * 60 * 1000 });
  const tid = criado?.timers?.find((t) => t.name === 'Chá')?.id;
  await invoke('timer_start', { id: tid });
  await invoke('stopwatch_start');
  await invoke('focus_start', { minutes: 30 });
  W.move_resize_frame(true, 300, 150, 900, 620);
  await sleep(4000); // 4 min do motor
  const antesDoQ = tamanho(W);
  medir('tamanho antes de sair', antesDoQ);
  const estadoArq = `${dados(ID_DEV)}/state.json`;
  const mAntes = mtime(estadoArq);
  await ativar();
  await clicarNaPagina('.tt-conteudo h1');
  const tQ = Date.now();
  await atalho(Clutter.KEY_Control_L, Clutter.KEY_q);
  const saiu = await esperarProcesso(proc, 10000);
  checar('Ctrl+Q fecha o app com código 0', saiu && codigoDe(proc) === 0, { saiu, codigo: saiu ? codigoDe(proc) : null });
  if (!saiu) proc.force_exit();
  const mDepois = mtime(estadoArq);
  const estado = lerJson(estadoArq);
  GLib.file_set_contents(`${OUT}/m37-state-saida.json`, JSON.stringify(estado, null, 2));
  const cha = estado.timers?.find((t) => t.name === 'Chá');
  checar('a saída regrava o state.json, com o temporizador e o cronômetro correndo',
    mAntes && mDepois && mDepois > mAntes && mDepois >= tQ && cha?.status === 'running' && estado.stopwatch?.status === 'running',
    { mAntes, mDepois, tQ, cha, stopwatch: estado.stopwatch, savedAt: estado.savedAt });
  medir('window-state após a partida 1', lerJson(`${configuracao(ID_DEV)}/.window-state.json`));

  // ===== Partida 2 (dev) =====
  await abrir(2, BIN);
  checar('o tamanho da janela volta (window-state)', perto(tamanho(W), antesDoQ), { agora: tamanho(W), antes: antesDoQ });
  const st = await invoke('stats_get');
  checar('o parcial da sessão encerrada pelo Ctrl+Q está nas estatísticas', (st?.todayS ?? 0) >= 180, st);
  const foco = await pagina("window.__TAURI_INTERNALS__.invoke('get_state').then((s) => s.focus.status)");
  medir('foco na partida 2', foco);

  // 5. Maximizada, escondida, e Sair.
  W.maximize();
  await talvez(esperar(() => W.is_maximized(), 3000, 'a janela maximizada'));
  await sleep(800);
  await ativar();
  await clicarNaPagina('.tt-conteudo h1');
  await atalho(Clutter.KEY_Control_L, Clutter.KEY_w);
  await talvez(esperar(() => !janelaVisivel(), 3000, 'a janela escondida'));
  checar('partida 2: Ctrl+W esconde a janela maximizada', !janelaVisivel() && vivo(), { visivel: janelaVisivel() });
  // O app_quit é o mesmo `window::sair` do Ctrl+Q e do "Sair" da bandeja.
  GLib.file_set_contents(`${OUT}/comando.json`, JSON.stringify({ id: `c${++nComando}`, js: "window.__TAURI_INTERNALS__.invoke('app_quit')" }));
  const saiu2 = await esperarProcesso(proc, 10000);
  checar('app_quit com a janela escondida fecha o app com código 0', saiu2 && codigoDe(proc) === 0, { saiu: saiu2, codigo: saiu2 ? codigoDe(proc) : null });
  if (!saiu2) proc.force_exit();
  // A sonda da próxima página rodaria o último comando de novo (o app_quit).
  GLib.file_set_contents(`${OUT}/comando.json`, '{}');
  medir('window-state após a partida 2', lerJson(`${configuracao(ID_DEV)}/.window-state.json`));

  // ===== Partida 3 (dev) =====
  let apareceu = true;
  await abrir(3, BIN).catch((e) => {
    apareceu = false;
    passo(`partida 3: ${e}`);
  });
  W = janelaDoApp();
  checar('sair com a janela escondida e reabrir mostra a janela', apareceu && janelaVisivel(), { visivel: janelaVisivel() });
  checar('e ela volta maximizada, como estava', Boolean(W?.is_maximized()), { maximizada: W?.is_maximized() });
  checar('partida 3: a página visível', (await pagina('document.visibilityState')) === 'visible');
  await captura('m37-reaberta.png');
  await clicarNaPagina('.tt-conteudo h1');
  await atalho(Clutter.KEY_Control_L, Clutter.KEY_q);
  const saiu3 = await esperarProcesso(proc, 10000);
  if (!saiu3) proc.force_exit();

  const erros = sonda().filter((x) => x.tipo === 'erro').map((x) => x.dados);
  checar('dev: nenhum erro na página', erros.length === 0, erros);

  // ===== Partida 4 (build com os arquivos embutidos, PROD) =====
  if (!BIN_BUILD) {
    passo('sem TT_BIN_BUILD: a parte de produção ficou de fora');
    passo('fim');
    return;
  }
  modo = 'build';
  await abrir(4, BIN_BUILD, { WEBKIT_INSPECTOR_HTTP_SERVER: `127.0.0.1:${PORTA}` });
  W.move_resize_frame(true, 300, 150, 1000, 700);
  await sleep(600);
  const marca = () => pagina("[window.__ttMarca ?? null, performance.timeOrigin, location.href]");
  await pagina("(window.__ttMarca = 'm37', true)");
  const m0 = await marca();
  medir('build: página', m0);
  checar('build: a página vem dos arquivos embutidos', /^(tauri|http:\/\/tauri\.localhost)/.test(String(m0?.[2])), m0);

  await clicarNaPagina('.tt-conteudo h1', Clutter.BUTTON_SECONDARY);
  await sleep(1200);
  const semMenu = popups();
  checar('build: o botão direito fora de campos não abre menu', semMenu.length === 0, semMenu);
  await captura('m37-build-sem-menu.png');
  if (semMenu.length) await atalho(Clutter.KEY_Escape);

  // O campo do cartão "Tarefas" aparece com o "+" (M30). Sair dele vazio
  // para outro lugar da página o fecha (como no M30)...
  const campoAberto = () => pagina("(() => { const f = document.querySelector('[data-nova]'); return f ? { aberto: !f.hidden, valor: f.querySelector('input').value, ativo: document.activeElement === f.querySelector('input') } : null; })()");
  await clicarNaPagina('[data-adicionar]');
  const c0 = await campoAberto();
  await clicarNaPagina('.tt-conteudo h1');
  const c1 = await campoAberto();
  checar('build: sair do campo vazio para outro lugar da página o fecha (M30)', c0?.aberto && c1 && !c1.aberto, { antes: c0, depois: c1 });
  // ... mas o menu do próprio campo não: o "Colar" do menu cai nele.
  const TEXTO = 'Ler o capítulo 4';
  St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, TEXTO);
  await clicarNaPagina('[data-adicionar]');
  await clicarNaPagina('input.tt-texto[data-campo]', Clutter.BUTTON_SECONDARY);
  const menuCampo = await talvez(esperar(() => (popups().length ? popups() : null), 3000, 'o menu no campo'));
  checar('build: num campo de texto, o botão direito abre o menu', Boolean(menuCampo), menuCampo ?? popups());
  const c2 = await campoAberto();
  checar('build: com o menu do campo aberto, o campo vazio continua aberto', c2?.aberto && c2?.ativo, c2);
  await captura('m37-build-menu-no-campo.png');
  // O primeiro item habilitado de um campo vazio é "Colar".
  await atalho(Clutter.KEY_Down);
  await atalho(Clutter.KEY_Return);
  await talvez(esperar(() => popups().length === 0, 3000, 'o menu fechado'));
  const c3 = await campoAberto();
  checar('build: "Colar" no menu do campo cola no campo', c3?.aberto && c3?.valor === TEXTO, c3);
  if (popups().length) await atalho(Clutter.KEY_Escape);

  await clicarNaPagina('.tt-conteudo h1');
  await atalho(Clutter.KEY_F5);
  await sleep(1500);
  const m1 = await marca();
  await atalho(Clutter.KEY_Control_L, Clutter.KEY_r);
  await sleep(1500);
  const m2 = await marca();
  await atalho(Clutter.KEY_Shift_L, Clutter.KEY_F5);
  await sleep(1500);
  const m3 = await marca();
  const c4 = await campoAberto();
  checar('build: F5 e Ctrl+R não recarregam (a marca e o texto do campo continuam)',
    m1?.[0] === 'm37' && m2?.[0] === 'm37' && m3?.[0] === 'm37' && m1?.[1] === m0?.[1] && m3?.[1] === m0?.[1] && c4?.valor === TEXTO, { m0, m1, m2, m3, campo: c4 });
  // Controle: uma recarga de verdade apaga a marca.
  await comandoDoInspetor('(setTimeout(() => location.reload(), 50), true)');
  await sleep(2500);
  const m4 = await marca();
  checar('build (controle): uma recarga de verdade apaga a marca', m4?.[0] === null && m4?.[1] !== m0?.[1], m4);

  await ativar();
  await clicarNaPagina('.tt-conteudo h1');
  await atalho(Clutter.KEY_Control_L, Clutter.KEY_w);
  await talvez(esperar(() => !janelaVisivel(), 3000, 'a janela escondida'));
  checar('build: Ctrl+W esconde a janela', !janelaVisivel() && vivo(), { visivel: janelaVisivel() });
  const s4 = await segundaInstancia(4, BIN_BUILD);
  await talvez(esperar(() => janelaVisivel(), 5000, 'a janela de volta'));
  W = janelaDoApp() ?? W;
  checar('build: abrir de novo traz a janela de volta', janelaVisivel() && s4.codigo === 0, { visivel: janelaVisivel(), segunda: s4 });
  await ativar();
  await clicarNaPagina('.tt-conteudo h1');
  await atalho(Clutter.KEY_Control_L, Clutter.KEY_q);
  const saiu4 = await esperarProcesso(proc, 10000);
  checar('build: Ctrl+Q fecha o app com código 0', saiu4 && codigoDe(proc) === 0, { saiu: saiu4, codigo: saiu4 ? codigoDe(proc) : null });
  if (!saiu4) proc.force_exit();
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
