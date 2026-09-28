// Roteiro do M36 (bandeja e fechar para a bandeja), carregado com `gnome-shell
// --automation-script` pelo dentro.sh. Abre o app sozinho (LANCA_O_APP),
// depois de ligar no shell aninhado a extensão AppIndicator (a mesma da
// sessão), e usa o menu da bandeja pelo mesmo caminho do painel: o
// StatusNotifierItem do app e o menu dele pelo com.canonical.dbusmenu (o
// clique no item é o `Event(id, "clicked")` que a extensão manda).
//
//   TT_PIPEWIRE=/run/user/$UID bash scripts/gnome-aninhado/rodar.sh bandeja
//
// Com TOMATITO_SPEED=60 (posto aqui), o "Iniciar foco" da bandeja (30 min)
// dura 30 s. O "Pronto quando" do M36, no que dá para medir sem um humano:
//   1. o ícone aparece no painel, com o menu "Iniciar foco", "Mostrar
//      Tomatito" e "Sair", e sem rótulo de tempo (trayTime desligado);
//   2. "Iniciar foco" pela bandeja inicia a sessão (get_state), e o item vira
//      "Pausar foco"; "Pausar foco" pausa ("Retomar foco") e "Retomar foco"
//      retoma;
//   3. ligar o trayTime (settings_set) mostra o tempo ao lado do ícone, que
//      muda uma vez por minuto do motor;
//   4. fechar a janela pelo compositor (o X, o Alt+F4 e o Ctrl+W dão no mesmo
//      CloseRequested) só a esconde: o processo segue e a sessão também (o
//      rótulo continua andando e o get_state responde);
//   5. com a janela escondida, a sessão termina: um som no PipeWire (com
//      TT_PIPEWIRE) e a notificação "Sessão de foco concluída" no shell, e o
//      item volta a "Iniciar foco";
//   6. "Mostrar Tomatito" traz a janela de volta, ativa;
//   7. "Sair" fecha o app (código 0);
//   8. segunda partida com closeToTray desligado: fechar a janela sai do app.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import 'resource:///org/gnome/shell/ui/screenshot.js'; // promisifica Shell.Screenshot

export const METRICS = {};
export const LANCA_O_APP = true;

const OUT = GLib.getenv('TT_OUT');
const SONDA_LOG = GLib.getenv('SONDA_LOG');
const BIN = GLib.getenv('TOMATITO_BIN');
const PIPEWIRE = GLib.getenv('TT_PIPEWIRE');
const EXTENSAO = 'ubuntu-appindicators@ubuntu.com';
const R = { passos: [], checagens: {}, medidas: { pipewire: PIPEWIRE ?? null, rotulos: [] } };

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
  passo(`comando ${js.slice(0, 120)} => ${texto.length > 300 ? `${texto.slice(0, 300)}…` : texto}`);
  return r.dados.resultado;
}
const STATUS = "window.__TAURI_INTERNALS__.invoke('get_state').then((s) => s.focus.status)";
const setar = (patch) => comando(`window.__TAURI_INTERNALS__.invoke('settings_set', { patch: ${JSON.stringify(patch)} }).then((s) => [s.trayTime, s.closeToTray])`);

// --- D-Bus: o watcher da extensão, o item do app e o menu dele.
const bus = Gio.DBus.session;
function chamar(dest, caminho, iface, metodo, args, tipo) {
  return bus.call_sync(dest, caminho, iface, metodo, args, tipo ? new GLib.VariantType(tipo) : null, Gio.DBusCallFlags.NONE, 5000, null);
}
function propriedade(dest, caminho, iface, nome) {
  try {
    return chamar(dest, caminho, 'org.freedesktop.DBus.Properties', 'Get', new GLib.Variant('(ss)', [iface, nome]), '(v)').recursiveUnpack()[0];
  } catch (e) {
    (R.medidas.errosDeLeitura ??= []).push(`${nome}: ${e}`);
    return null;
  }
}
const temDono = (nome) =>
  chamar('org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus', 'NameHasOwner', new GLib.Variant('(s)', [nome]), '(b)').deepUnpack()[0];
const donoDe = (nome) => {
  try {
    return chamar('org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus', 'GetNameOwner', new GLib.Variant('(s)', [nome]), '(s)').deepUnpack()[0];
  } catch {
    return null;
  }
};
const pidDe = (dono) =>
  chamar('org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus', 'GetConnectionUnixProcessID', new GLib.Variant('(s)', [dono]), '(u)').deepUnpack()[0];

// O item do app no painel: a extensão põe cada ícone em
// Main.panel.statusArea com a chave `appindicator-<conexão>@<caminho>`; o
// do app é o da conexão do processo aberto.
function itemDoApp(pid) {
  const chaves = Object.keys(Main.panel.statusArea).filter((k) => k.startsWith('appindicator-'));
  R.medidas.statusArea = chaves;
  for (const k of chaves) {
    const [dest, ...resto] = k.slice('appindicator-'.length).split('@');
    const caminho = resto.join('@') || '/StatusNotifierItem';
    const dono = dest.startsWith(':') ? dest : donoDe(dest);
    if (dono && String(pidDe(dono)) === String(pid)) {
      const ator = Main.panel.statusArea[k];
      return { dest: dono, caminho, bruto: k, noPainel: Boolean(ator?.get_stage?.() ?? ator?.container?.get_stage?.()) };
    }
  }
  return null;
}
const rotulo = (item) => propriedade(item.dest, item.caminho, 'org.kde.StatusNotifierItem', 'XAyatanaLabel') ?? '';
const caminhoDoMenu = (item) => propriedade(item.dest, item.caminho, 'org.kde.StatusNotifierItem', 'Menu');

// Os itens do menu, [{ id, rotulo }], na ordem (o separador fica de fora).
function menu(item) {
  const m = caminhoDoMenu(item);
  const [, raiz] = chamar(item.dest, m, 'com.canonical.dbusmenu', 'GetLayout', new GLib.Variant('(iias)', [0, -1, []]), '(u(ia{sv}av))').recursiveUnpack();
  const [, , filhos] = raiz;
  return filhos
    .map(([id, props]) => ({ id, rotulo: props.label ?? null, tipo: props.type ?? 'standard', visivel: props.visible ?? true }))
    .filter((x) => x.tipo !== 'separator' && x.visivel);
}
async function clicarNoMenu(item, texto) {
  const alvo = menu(item).find((x) => x.rotulo === texto);
  if (!alvo) throw new Error(`item "${texto}" ausente do menu: ${JSON.stringify(menu(item))}`);
  const m = caminhoDoMenu(item);
  // O que a extensão faz ao clicar: AboutToShow na raiz e o Event no item.
  try {
    chamar(item.dest, m, 'com.canonical.dbusmenu', 'AboutToShow', new GLib.Variant('(i)', [0]), '(b)');
  } catch {
    // opcional no protocolo
  }
  chamar(item.dest, m, 'com.canonical.dbusmenu', 'Event', new GLib.Variant('(isvu)', [alvo.id, 'clicked', new GLib.Variant('i', 0), 0]), null);
  passo(`bandeja: clique em "${texto}"`);
  await sleep(600);
}
const textos = (item) => menu(item).map((x) => x.rotulo);

// --- PipeWire (como no roteiro sons): os fluxos de saída do app.
function fluxos() {
  if (!PIPEWIRE) return [];
  const [ok, saida] = GLib.spawn_command_line_sync(`env PIPEWIRE_RUNTIME_DIR=${PIPEWIRE} pw-dump`);
  if (!ok) return [];
  try {
    return JSON.parse(new TextDecoder().decode(saida))
      .filter((o) => o.type === 'PipeWire:Interface:Node' && String(o.info?.props?.['node.name'] ?? '').startsWith('alsa_playback.tomatito'))
      .map((n) => n.info.props['object.serial'] ?? n.id);
  } catch {
    return [];
  }
}

// --- Notificações que chegam ao shell.
const notificacoes = [];
Main.messageTray.connect('source-added', (_t, source) =>
  source.connect('notification-added', (_s, n) => {
    notificacoes.push({ titulo: n.title, corpo: n.body ?? '', t: Math.round(agoraMs()), janelaVisivel: janelaVisivel() });
    passo(`notificação: ${n.title} | ${n.body}`);
  }),
);

let proc = null;
let pid = null;
const janelaDoApp = () =>
  global.get_window_actors().map((a) => a.meta_window).find((w) => String(w.get_pid()) === String(pid) && w.get_title() === 'Tomatito');
const janelaVisivel = () => Boolean(janelaDoApp()?.showing_on_its_workspace());

function esperarProcesso(p, ms) {
  return new Promise((resolve) => {
    let feito = false;
    const fim = (v) => !feito && ((feito = true), resolve(v));
    p.wait_async(null, () => fim(true));
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => (fim(false), GLib.SOURCE_REMOVE));
  });
}
const vivo = () => !proc.get_if_exited() && !proc.get_if_signaled() && GLib.file_test(`/proc/${pid}`, GLib.FileTest.EXISTS);

async function abrir(i) {
  const L = new Gio.SubprocessLauncher({ flags: Gio.SubprocessFlags.STDERR_MERGE });
  L.setenv('WAYLAND_DISPLAY', 'tt-aninhado', true);
  L.setenv('GDK_BACKEND', 'wayland', true);
  L.setenv('TOMATITO_SPEED', '60', true);
  if (PIPEWIRE) L.setenv('PIPEWIRE_RUNTIME_DIR', PIPEWIRE, true);
  L.set_stdout_file_path(`${OUT}/app-${i}.log`);
  const antes = sonda().filter((e) => e.tipo === 'estado').length;
  proc = L.spawnv([BIN]);
  pid = proc.get_identifier();
  passo(`partida ${i}: pid ${pid}`);
  const W = await esperar(() => { const w = janelaDoApp(); return w && w.get_frame_rect().width > 0 ? w : null; }, 60000, `a janela da partida ${i}`);
  await esperar(() => sonda().filter((e) => e.tipo === 'estado').length > antes, 30000, 'a sonda da página');
  if (W.is_maximized()) W.unmaximize();
  W.move_resize_frame(true, 300, 150, 1000, 700);
  for (let k = 0; k < 20 && (Main.overview.visible || Main.overview.animationInProgress); k++) {
    if (!Main.overview.animationInProgress) Main.overview.hide();
    await sleep(500);
  }
  Main.activateWindow(W);
  await sleep(800);
  return W;
}

async function captura(nome) {
  const shooter = new Shell.Screenshot();
  const s = Gio.File.new_for_path(`${OUT}/${nome}`).replace(null, false, Gio.FileCreateFlags.NONE, null);
  await shooter.screenshot_area(0, 0, 1920, 1080, s);
  s.close(null);
  passo(`captura ${nome}`);
}

async function principal() {
  passo('início');
  // A extensão da sessão, ligada no shell aninhado (GSettings em memória).
  const shell = new Gio.Settings({ schema_id: 'org.gnome.shell' });
  shell.set_boolean('disable-user-extensions', false);
  shell.set_strv('enabled-extensions', [EXTENSAO]);
  try {
    new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' }).set_boolean('enable-hot-corners', false);
  } catch {
    // sem o esquema: segue
  }
  await esperar(() => temDono('org.kde.StatusNotifierWatcher'), 20000, 'o StatusNotifierWatcher da extensão');
  passo('watcher no ar');

  // 1. O ícone e o menu.
  let W = await abrir(1);
  let item = await esperar(() => itemDoApp(pid), 20000, 'o item da bandeja do app');
  R.medidas.item = item.bruto;
  const t1 = await esperar(() => (textos(item).includes('Iniciar foco') ? textos(item) : null), 10000, 'o menu');
  checar('o ícone aparece no painel do shell', item.noPainel, item);
  checar('o menu tem "Iniciar foco", "Mostrar Tomatito" e "Sair"', JSON.stringify(t1) === '["Iniciar foco","Mostrar Tomatito","Sair"]', t1);
  checar('sem rótulo de tempo com o trayTime desligado (padrão)', rotulo(item) === '', rotulo(item));
  const icone = propriedade(item.dest, item.caminho, 'org.kde.StatusNotifierItem', 'IconName') ?? '';
  checar('o ícone tem imagem', icone !== '', icone);
  await captura('m36-painel.png');

  // 2. Iniciar, pausar e retomar pela bandeja.
  await clicarNoMenu(item, 'Iniciar foco');
  const s1 = await comando(STATUS);
  await esperar(() => textos(item)[0] === 'Pausar foco', 5000, '"Pausar foco"').catch(() => null);
  checar('"Iniciar foco" inicia a sessão e o item vira "Pausar foco"', s1 === 'focus' && textos(item)[0] === 'Pausar foco', { status: s1, menu: textos(item) });
  await clicarNoMenu(item, 'Pausar foco');
  const s2 = await comando(STATUS);
  await esperar(() => textos(item)[0] === 'Retomar foco', 5000, '"Retomar foco"').catch(() => null);
  checar('"Pausar foco" pausa e o item vira "Retomar foco"', s2 === 'paused' && textos(item)[0] === 'Retomar foco', { status: s2, menu: textos(item) });

  // 3. O tempo na bandeja (no pausado, "Pausado · N min").
  const cfg = await setar({ trayTime: true });
  const rp = await esperar(() => rotulo(item) || null, 5000, 'o rótulo').catch(() => '');
  checar('ligar o trayTime mostra o tempo ao lado do ícone', cfg?.[0] === true && /^Pausado · \d+ min$/.test(rp), { cfg, rotulo: rp });
  await clicarNoMenu(item, 'Retomar foco');
  const s3 = await comando(STATUS);
  checar('"Retomar foco" retoma', s3 === 'focus' && textos(item)[0] === 'Pausar foco', { status: s3, menu: textos(item) });
  // A 60×, um minuto do motor é 1 s: o rótulo muda a cada segundo.
  const vistos = new Set();
  for (let k = 0; k < 40; k++) {
    const r = rotulo(item);
    if (r) vistos.add(r);
    await sleep(100);
  }
  R.medidas.rotulos.push(...vistos);
  checar('o tempo anda de minuto em minuto ("N min")', vistos.size >= 3 && [...vistos].every((r) => /^\d+ min$/.test(r)), [...vistos]);
  await captura('m36-painel-com-tempo.png');

  // 4. Fechar só esconde.
  const somAntes = new Set(fluxos());
  W.delete(global.get_current_time());
  await sleep(1500);
  const r1 = rotulo(item);
  checar('fechar esconde a janela e o app segue', !janelaVisivel() && vivo(), { visivel: janelaVisivel(), vivo: vivo() });
  const s4 = await comando(STATUS);
  await sleep(2000);
  const r2 = rotulo(item);
  checar('com a janela escondida, a sessão continua (get_state e o rótulo andando)', s4 === 'focus' && r1 !== r2, { status: s4, antes: r1, depois: r2 });

  // 5. O fim com a janela escondida: som, notificação e o item de volta.
  const novos = new Set();
  await esperar(() => {
    for (const f of fluxos()) if (!somAntes.has(f)) novos.add(f);
    return notificacoes.some((n) => n.titulo === 'Sessão de foco concluída') && (!PIPEWIRE || novos.size > 0);
  }, 45000, 'o fim da sessão').catch(() => null);
  const fim = notificacoes.find((n) => n.titulo === 'Sessão de foco concluída');
  checar('a sessão termina com a janela escondida e a notificação chega', fim && fim.janelaVisivel === false, notificacoes);
  if (PIPEWIRE) checar('o som toca com a janela escondida (fluxo novo no PipeWire)', novos.size > 0 && !janelaVisivel(), [...novos]);
  else passo('sem TT_PIPEWIRE: o som não foi conferido');
  await esperar(() => textos(item)[0] === 'Iniciar foco', 5000, '"Iniciar foco" de volta').catch(() => null);
  checar('no fim, o item volta a "Iniciar foco" e o rótulo some', textos(item)[0] === 'Iniciar foco' && rotulo(item) === '', { menu: textos(item), rotulo: rotulo(item) });

  // 6. "Mostrar Tomatito".
  await clicarNoMenu(item, 'Mostrar Tomatito');
  await esperar(() => janelaVisivel(), 5000, 'a janela de volta').catch(() => null);
  W = janelaDoApp();
  checar('"Mostrar Tomatito" traz a janela de volta', janelaVisivel() && W && !W.minimized, { visivel: janelaVisivel() });
  await sleep(500);
  checar('a janela volta ativa (ou com o aviso de pronta)', global.display.focus_window === W || W?.demands_attention, { foco: global.display.focus_window?.get_title() ?? null });
  const vis = await comando("document.visibilityState");
  checar('a página volta visível', vis === 'visible', vis);
  await captura('m36-mostrar.png');

  // 7. "Sair".
  await clicarNoMenu(item, 'Sair');
  const saiu = await esperarProcesso(proc, 10000);
  checar('"Sair" fecha o app com código 0', saiu && proc.get_if_exited() && proc.get_exit_status() === 0, { saiu, codigo: saiu && proc.get_if_exited() ? proc.get_exit_status() : null });
  if (!saiu) proc.force_exit();

  // 8. closeToTray desligado: fechar sai.
  W = await abrir(2);
  item = await esperar(() => itemDoApp(pid), 20000, 'o item da segunda partida');
  const lido = await comando("window.__TAURI_INTERNALS__.invoke('settings_get').then((s) => [s.trayTime, s.closeToTray])");
  checar('as opções persistem no reinício, e sem sessão não há rótulo', JSON.stringify(lido) === '[true,true]' && rotulo(item) === '', { lido, rotulo: rotulo(item) });
  const cfg2 = await setar({ closeToTray: false, trayTime: false });
  W.delete(global.get_current_time());
  const saiu2 = await esperarProcesso(proc, 10000);
  checar('com "fechar para a bandeja" desligado, fechar sai do app', saiu2 && cfg2?.[1] === false, { saiu: saiu2, cfg: cfg2 });
  if (!saiu2) proc.force_exit();

  const erros = sonda().filter((x) => x.tipo === 'erro').map((x) => x.dados);
  checar('nenhum erro na página', erros.length === 0, erros);
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
