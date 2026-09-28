// Roteiro do M39 (Configurações: sistema e Sobre), carregado com
// `gnome-shell --automation-script` pelo dentro.sh. Liga a extensão
// AppIndicator no shell aninhado (como o roteiro bandeja, M36) e abre o app
// sozinho, duas vezes (LANCA_O_APP), sem saída de áudio (ALSA sem
// configuração: nada toca na máquina). Tudo pelo ponteiro virtual, nos
// controles da tela:
//   partida 1 (sem dados do app):
//     - "Sistema" e "Sobre" na tela, nos padrões, com "Versão 0.1.0" (o
//       getVersion() do Cargo.toml) no cabeçalho do Sobre, que abre com o aviso
//       de marcas;
//     - os recursos no console do dev:app: `(await import('/src/platform/
//       recursos.js')).recursos.sempreNaFrente === false` no Wayland, e o
//       mesmo `recursos` no get_state;
//     - com uma sessão correndo, ligar "Tempo na bandeja" põe o tempo ao lado
//       do ícone na hora (lido pelo D-Bus), e desligar o tira;
//     - desligar "Fechar para a bandeja" e fechar a janela pelo compositor:
//       o app sai;
//   partida 2 (reaberta): os valores voltam do disco; ligar "Fechar para a
//     bandeja" e fechar: a janela só se esconde e o app segue; abrir o app de
//     novo a traz de volta; "Sair" (o botão da tela) fecha o app com código 0.
// O resumo-config-sistema.mjs confere as checagens e os logs.
//
//   bash scripts/gnome-aninhado/rodar.sh config-sistema
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export const METRICS = {};
export const LANCA_O_APP = true;

const OUT = GLib.getenv('TT_OUT');
const BIN = GLib.getenv('TOMATITO_BIN');
const SONDA_LOG = GLib.getenv('SONDA_LOG');
const EXTENSAO = 'ubuntu-appindicators@ubuntu.com';
const R = { passos: [], checagens: {}, partidas: [], medidas: { rotulos: [] } };

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
function lerTexto(arq) {
  try {
    const [, bytes] = GLib.file_get_contents(arq);
    return new TextDecoder().decode(bytes);
  } catch {
    return '';
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
const invoke = (cmd, args = {}) =>
  comando(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args)}).catch((e) => ({ erro: e }))`);

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
// O settings.json da pasta de dados do app (a desta rodada, isolada).
function settingsNoDisco() {
  const base = GLib.get_user_data_dir();
  let it;
  try {
    it = Gio.File.new_for_path(base).enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
  } catch {
    return null;
  }
  for (let info = it.next_file(null); info; info = it.next_file(null)) {
    if (!/tomatito/i.test(info.get_name())) continue;
    const texto = lerTexto(`${base}/${info.get_name()}/settings.json`);
    if (texto) return JSON.parse(texto);
  }
  return null;
}
const doDisco = () => {
  const d = settingsNoDisco();
  return d && { closeToTray: d.closeToTray, trayTime: d.trayTime };
};

// --- D-Bus: o item do app na bandeja e o rótulo dele (como no roteiro bandeja).
const bus = Gio.DBus.session;
function chamar(dest, caminho, iface, metodo, args, tipo) {
  return bus.call_sync(dest, caminho, iface, metodo, args, tipo ? new GLib.VariantType(tipo) : null, Gio.DBusCallFlags.NONE, 5000, null);
}
function propriedade(dest, caminho, iface, nome) {
  try {
    return chamar(dest, caminho, 'org.freedesktop.DBus.Properties', 'Get', new GLib.Variant('(ss)', [iface, nome]), '(v)').recursiveUnpack()[0];
  } catch {
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
function itemDoApp(pid) {
  for (const k of Object.keys(Main.panel.statusArea).filter((x) => x.startsWith('appindicator-'))) {
    const [dest, ...resto] = k.slice('appindicator-'.length).split('@');
    const caminho = resto.join('@') || '/StatusNotifierItem';
    const dono = dest.startsWith(':') ? dest : donoDe(dest);
    if (dono && String(pidDe(dono)) === String(pid)) return { dest: dono, caminho };
  }
  return null;
}
const rotulo = (item) => propriedade(item.dest, item.caminho, 'org.kde.StatusNotifierItem', 'XAyatanaLabel') ?? '';

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
  await sleep(500);
}

let proc = null;
let pid = null;
const janelaDoApp = () =>
  global.get_window_actors().map((a) => a.meta_window).find((w) => String(w.get_pid()) === String(pid) && w.get_title() === 'Tomatito');
const janelaVisivel = () => Boolean(janelaDoApp()?.showing_on_its_workspace());
const vivo = () => !proc.get_if_exited() && !proc.get_if_signaled() && GLib.file_test(`/proc/${pid}`, GLib.FileTest.EXISTS);
function esperarProcesso(p, ms) {
  return new Promise((resolve) => {
    let feito = false;
    const fim = (v) => !feito && ((feito = true), resolve(v));
    p.wait_async(null, () => fim(true));
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => (fim(false), GLib.SOURCE_REMOVE));
  });
}
const codigoDe = (p) => (p.get_if_exited() ? p.get_exit_status() : p.get_if_signaled() ? `sinal ${p.get_term_sig()}` : null);

function lancador(arquivo) {
  const L = new Gio.SubprocessLauncher({ flags: Gio.SubprocessFlags.STDERR_MERGE });
  L.setenv('WAYLAND_DISPLAY', 'tt-aninhado', true);
  L.setenv('GDK_BACKEND', 'wayland', true);
  // Sem saída de áudio: nada toca na máquina de quem roda.
  L.setenv('ALSA_CONFIG_PATH', '/dev/null', true);
  L.set_stdout_file_path(`${OUT}/${arquivo}`);
  return L;
}

async function abrir(i) {
  const antes = sonda().filter((e) => e.tipo === 'estado').length;
  proc = lancador(`app-${i}.log`).spawnv([BIN]);
  pid = proc.get_identifier();
  passo(`partida ${i}: pid ${pid}`);
  const W = await esperar(() => { const w = janelaDoApp(); return w && w.get_frame_rect().width > 0 ? w : null; }, 60000, `a janela da partida ${i}`);
  await esperar(() => sonda().filter((e) => e.tipo === 'estado').length > antes, 30000, 'a sonda da página');
  if (W.is_maximized()) W.unmaximize();
  W.move_resize_frame(true, 300, 100, 1000, 800);
  for (let k = 0; k < 20 && (Main.overview.visible || Main.overview.animationInProgress); k++) {
    if (!Main.overview.animationInProgress) Main.overview.hide();
    await sleep(500);
  }
  Main.activateWindow(W);
  await sleep(800);
  const r = W.get_frame_rect();
  mover(r.x + 40, r.y + 80);
  await sleep(300);
}

// Rola até o elemento e clica no centro dele (px CSS da página = px da janela, a 100%).
async function clicar(seletor) {
  const c = await comando(
    `(() => { const e = document.querySelector(${JSON.stringify(seletor)}); if (!e) return null; e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; })()`,
  );
  if (!c) throw new Error(`sem elemento: ${seletor}`);
  await sleep(200);
  const r = janelaDoApp().get_frame_rect();
  await clicarEm(r.x + c[0], r.y + c[1]);
}
async function irPara(hash) {
  await comando(`(location.hash = '${hash}', document.querySelector('.tt-rolagem').scrollTop = 0, 'ok')`);
  await sleep(600);
}

// O que as seções mostram, lido do DOM, com os recursos do console.
const LER = `(async () => {
  const sw = (id) => { const c = document.querySelector('[data-cartao="' + id + '"]'); if (!c) return null; const s = c.querySelector('fluent-switch'); return { visivel: c.offsetParent !== null, ligado: s.checked, estado: c.querySelector('[data-estado]').textContent }; };
  const sobre = document.querySelector('[data-cartao="sobre"]');
  const rec = (await import('/src/platform/recursos.js')).recursos;
  return {
    secoes: [...document.querySelectorAll('.tt-pagina h2')].map((h) => h.textContent),
    fechar: sw('fechar-bandeja'), tempo: sw('tempo-bandeja'),
    sair: document.querySelector('[data-cartao="sair"] [data-sair]')?.textContent ?? null,
    versao: sobre?.querySelector('.tt-expansor-valor')?.textContent ?? null,
    sobreAberto: sobre?.querySelector('[data-expansor]')?.getAttribute('aria-expanded') ?? null,
    marcas: sobre?.querySelector('.tt-config-nota')?.textContent ?? null,
    sobreVisivel: (() => { const n = sobre?.querySelector('.tt-config-nota'); return n ? n.offsetParent !== null : false; })(),
    avisosDesabilitado: sobre?.querySelector('[data-avisos]')?.disabled ?? null,
    recursos: { ...rec },
    sempreNaFrenteFalso: rec.sempreNaFrente === false,
  };
})()`;
const ler = () => comando(LER);

function capturar(nome) {
  try {
    janelaDoApp().get_compositor_private().get_image(null).writeToPNG(`${OUT}/${nome}`);
    passo(`captura ${nome}`);
  } catch (e) {
    passo(`captura ${nome} falhou: ${e}`);
  }
}

async function principal() {
  passo('início');
  Main.messageTray.bannerBlocked = true;
  new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' }).set_boolean('enable-animations', false);
  // A extensão da sessão, ligada no shell aninhado (GSettings em memória).
  const shell = new Gio.Settings({ schema_id: 'org.gnome.shell' });
  shell.set_boolean('disable-user-extensions', false);
  shell.set_strv('enabled-extensions', [EXTENSAO]);
  await esperar(() => temDono('org.kde.StatusNotifierWatcher'), 20000, 'o StatusNotifierWatcher da extensão');
  if (Main.overview.visible) Main.overview.hide();
  const seat = global.stage.context.get_backend().get_default_seat();
  ptr = seat.create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
  await sleep(200);
  mover(960, 1070);
  await sleep(300);
  limparDadosDoApp();

  // ===== Partida 1 =====
  await abrir(1);
  const item = await esperar(() => itemDoApp(pid), 20000, 'o item da bandeja do app');
  await irPara('#/configuracoes');
  const e0 = await esperar(async () => { const e = await ler(); return e?.versao ? e : null; }, 10000, 'a versão no Sobre');
  R.inicial = e0;
  checar(
    'Sistema e Sobre na tela, nos padrões (fechar para a bandeja ligado, tempo na bandeja desligado, Sair) e com "Versão 0.1.0"',
    JSON.stringify(e0.secoes) === '["Sessões de foco","Aparência","Sistema","Sobre"]' &&
      e0.fechar?.visivel && e0.fechar.ligado === true && e0.fechar.estado === 'Ativado' &&
      e0.tempo?.visivel && e0.tempo.ligado === false && e0.tempo.estado === 'Desativado' &&
      e0.sair === 'Sair' && e0.versao === 'Versão 0.1.0' && e0.sobreAberto === 'false',
    e0,
  );
  const g0 = await invoke('get_state');
  checar(
    'no Wayland, (await import(\'/src/platform/recursos.js\')).recursos.sempreNaFrente === false, com a bandeja e a região de entrada',
    e0.sempreNaFrenteFalso === true && JSON.stringify(e0.recursos) === '{"bandeja":true,"sempreNaFrente":false,"regiaoDeEntrada":true}' &&
      JSON.stringify(g0?.recursos) === JSON.stringify(e0.recursos),
    { console: e0.recursos, getState: g0?.recursos },
  );
  await clicar('[data-cartao="sobre"] [data-expansor]');
  const e1 = await ler();
  checar(
    'o clique abre o Sobre, com "Ver avisos" desabilitado (M46) e o aviso de marcas',
    e1?.sobreAberto === 'true' && e1.sobreVisivel && e1.avisosDesabilitado === true &&
      /Windows e Segoe são marcas da Microsoft\. O Tomatito não é afiliado à Microsoft\./.test(e1.marcas ?? ''),
    { aberto: e1?.sobreAberto, visivel: e1?.sobreVisivel, avisos: e1?.avisosDesabilitado, marcas: e1?.marcas },
  );
  await comando(`(document.querySelector('[data-cartao="sistema"], [aria-labelledby="config-sistema"]').scrollIntoView({ block: 'start' }), 'ok')`);
  mover(janelaDoApp().get_frame_rect().x + 150, janelaDoApp().get_frame_rect().y + 780);
  await sleep(400);
  capturar('m39-configuracoes-sistema-lite.png');

  // O tempo na bandeja, na hora, com uma sessão correndo.
  const inicio = await invoke('focus_start', { minutes: 30 });
  await sleep(800);
  const semTempo = rotulo(item);
  await clicar('[data-cartao="tempo-bandeja"] fluent-switch');
  const comTempo = await esperar(() => rotulo(item) || null, 5000, 'o tempo na bandeja').catch(() => '');
  const e2 = await ler();
  R.medidas.rotulos.push(semTempo, comTempo);
  checar(
    'com uma sessão correndo, o clique em "Tempo na bandeja" põe o tempo ao lado do ícone na hora (tela, disco e D-Bus)',
    inicio?.status === 'focus' && semTempo === '' && /^\d+ min$/.test(comTempo) &&
      e2?.tempo?.ligado === true && e2.tempo.estado === 'Ativado' && doDisco()?.trayTime === true,
    { status: inicio?.status, antes: semTempo, depois: comTempo, tela: e2?.tempo, disco: doDisco() },
  );
  await clicar('[data-cartao="tempo-bandeja"] fluent-switch');
  const tirado = await esperar(() => (rotulo(item) === '' ? 'vazio' : null), 5000, 'o tempo sair da bandeja').catch(() => rotulo(item));
  checar(
    'o segundo clique tira o tempo da bandeja na hora',
    tirado === 'vazio' && doDisco()?.trayTime === false,
    { rotulo: tirado, disco: doDisco() },
  );

  // Fechar para a bandeja desligado: fechar sai do app.
  await clicar('[data-cartao="fechar-bandeja"] fluent-switch');
  const e3 = await ler();
  const d3 = doDisco();
  checar(
    'o clique desliga "Fechar para a bandeja" (tela e disco)',
    e3?.fechar?.ligado === false && e3.fechar.estado === 'Desativado' && d3?.closeToTray === false,
    { tela: e3?.fechar, disco: d3 },
  );
  const erros1 = sonda().filter((x) => x.tipo === 'erro').map((x) => x.dados);
  janelaDoApp().delete(global.get_current_time());
  const saiu1 = await esperarProcesso(proc, 10000);
  const codigo1 = saiu1 ? codigoDe(proc) : 'não saiu';
  R.partidas.push({ partida: 1, codigo: codigo1 });
  checar('com a opção desligada, fechar a janela pelo compositor sai do app', saiu1, codigo1);
  if (!saiu1) proc.force_exit();
  GLib.file_set_contents(`${OUT}/comando.json`, '{}');
  await sleep(800);

  // ===== Partida 2 =====
  await abrir(2);
  await irPara('#/configuracoes');
  const f0 = await esperar(async () => { const e = await ler(); return e?.versao ? e : null; }, 10000, 'a versão no Sobre');
  checar(
    'partida 2: os valores voltam do disco (fechar desligado, tempo desligado)',
    f0.fechar?.ligado === false && f0.fechar.estado === 'Desativado' && f0.tempo?.ligado === false && f0.versao === 'Versão 0.1.0',
    { fechar: f0.fechar, tempo: f0.tempo, versao: f0.versao },
  );
  await clicar('[data-cartao="fechar-bandeja"] fluent-switch');
  const d4 = doDisco();
  janelaDoApp().delete(global.get_current_time());
  await sleep(1500);
  const escondida = { visivel: janelaVisivel(), vivo: vivo(), disco: d4 };
  checar('partida 2: ligado pelo clique, fechar a janela só a esconde, e o app segue', d4?.closeToTray === true && !escondida.visivel && escondida.vivo, escondida);
  const segunda = lancador('app-2b.log').spawnv([BIN]);
  const saiuSegunda = await esperarProcesso(segunda, 15000);
  await esperar(() => janelaVisivel(), 8000, 'a janela de volta').catch(() => null);
  checar(
    'partida 2: abrir o app de novo traz a janela de volta (a segunda abertura sai com código 0)',
    saiuSegunda && codigoDe(segunda) === 0 && janelaVisivel(),
    { segunda: saiuSegunda ? codigoDe(segunda) : 'não saiu', visivel: janelaVisivel() },
  );
  if (!saiuSegunda) segunda.force_exit();
  Main.activateWindow(janelaDoApp());
  await sleep(600);
  const erros2 = sonda().filter((x) => x.tipo === 'erro').map((x) => x.dados);
  checar('nenhum erro na página', [...erros1, ...erros2].length === 0, [...erros1, ...erros2]);
  await clicar('[data-cartao="sair"] [data-sair]');
  const saiu2 = await esperarProcesso(proc, 10000);
  const codigo2 = saiu2 ? codigoDe(proc) : 'não saiu';
  R.partidas.push({ partida: 2, codigo: codigo2 });
  checar('partida 2: o botão "Sair" fecha o app com código 0', codigo2 === 0, codigo2);
  if (!saiu2) proc.force_exit();
  GLib.file_set_contents(`${OUT}/comando.json`, '{}');
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
