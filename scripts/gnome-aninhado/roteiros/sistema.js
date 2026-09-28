// Roteiro do M25 (seguir o sistema), carregado com `gnome-shell
// --automation-script` pelo dentro.sh. Abre o app sozinho (LANCA_O_APP).
//
// O GNOME aninhado roda com GSettings em memória e sem portal. Para mudar o
// estilo "como em Configurações > Aparência", este roteiro É o portal: ele
// assume o nome org.freedesktop.portal.Desktop no barramento de sessão da
// rodada e responde org.freedesktop.portal.Settings (Read, ReadOne e ReadAll)
// com o `color-scheme` que ele controla; cada troca emite o SettingChanged,
// como o xdg-desktop-portal-gnome faz quando o GNOME muda de estilo. É o
// mesmo caminho que o tao (e o GTK) usam no GNOME de verdade; só o painel de
// Configurações fica de fora (docs/verificacao-manual.md, M25).
//
// Partida 1 (sem settings.json, no Lite):
//   - no Lite, o portal vai para escuro e volta para claro: a página fica no
//     Lite, o tema nativo continua escuro (guarda (b), com uma reaplicação no
//     máximo por troca) e não há ThemeChanged repetido;
//   - com o portal claro, "Usar configuração do sistema" deixa o app Claro;
//   - em Sistema, o portal vai para escuro e volta para claro: a página
//     acompanha em até 1 s, e o resolvedTheme vai para o disco;
//   - no Escuro explícito, o portal vai para claro: nada muda, sem laço;
//   - do Lite para o Sistema com o portal escuro: Escuro direto, sem o claro
//     intermediário da guarda (c) na página ou no disco.
// Partida 2: volta ao Sistema; fecha; o portal vai para escuro com o app
//   fechado; reabre: a página nasce no Escuro e o resolvedTheme é regravado.
// O resumo-sistema.mjs confere as checagens.
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
// Controle negativo: TT_CONTROLE_SISTEMA=sem-portal não assume o nome, e o
// app não tem de quem ouvir (as checagens de "acompanha" devem falhar).
const CONTROLE = GLib.getenv('TT_CONTROLE_SISTEMA') || null;
const R = { controle: CONTROLE, passos: [], checagens: {}, trocas: [], partidas: [] };
const IDS = ['io.github.kbrianps.tomatito', 'io.github.kbrianps.tomatito.dev'];

const salvar = () => GLib.file_set_contents(`${OUT}/resultado.json`, JSON.stringify(R, null, 2));
const sleep = (ms) =>
  new Promise((r) => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => (r(), GLib.SOURCE_REMOVE)));
const passo = (m) => {
  R.passos.push(`${Date.now()} ${m}`);
  salvar();
};
const checar = (nome, ok, detalhe) => {
  R.checagens[nome] = { ok: Boolean(ok), detalhe };
  passo(`${ok ? 'ok' : 'FALHA'}: ${nome}`);
};

// --- o portal falso -------------------------------------------------------
const PORTAL_XML = `<node>
  <interface name="org.freedesktop.portal.Settings">
    <method name="ReadAll"><arg type="as" name="namespaces" direction="in"/><arg type="a{sa{sv}}" name="value" direction="out"/></method>
    <method name="Read"><arg type="s" name="namespace" direction="in"/><arg type="s" name="key" direction="in"/><arg type="v" name="value" direction="out"/></method>
    <method name="ReadOne"><arg type="s" name="namespace" direction="in"/><arg type="s" name="key" direction="in"/><arg type="v" name="value" direction="out"/></method>
    <signal name="SettingChanged"><arg type="s" name="namespace"/><arg type="s" name="key"/><arg type="v" name="value"/></signal>
    <property name="version" type="u" access="read"/>
  </interface>
</node>`;
// color-scheme do portal: 0 sem preferência (o tao lê claro), 1 escuro, 2 claro.
let esquema = 2;
const leituras = [];
const naoTem = (inv) => inv.return_dbus_error('org.freedesktop.portal.Error.NotFound', 'sem essa chave');
const portal = {
  get version() {
    return 2;
  },
  ReadAllAsync([namespaces], inv) {
    leituras.push(`ReadAll ${namespaces.join(',')}`);
    const quer = namespaces.some((n) => n === 'org.freedesktop.appearance' || (n.endsWith('*') && 'org.freedesktop.appearance'.startsWith(n.slice(0, -1))));
    const tudo = quer ? { 'org.freedesktop.appearance': { 'color-scheme': new GLib.Variant('u', esquema) } } : {};
    inv.return_value(new GLib.Variant('(a{sa{sv}})', [tudo]));
  },
  ReadAsync([ns, chave], inv) {
    leituras.push(`Read ${ns} ${chave}`);
    if (ns !== 'org.freedesktop.appearance' || chave !== 'color-scheme') return naoTem(inv);
    inv.return_value(new GLib.Variant('(v)', [new GLib.Variant('v', new GLib.Variant('u', esquema))]));
  },
  ReadOneAsync([ns, chave], inv) {
    leituras.push(`ReadOne ${ns} ${chave}`);
    if (ns !== 'org.freedesktop.appearance' || chave !== 'color-scheme') return naoTem(inv);
    inv.return_value(new GLib.Variant('(v)', [new GLib.Variant('u', esquema)]));
  },
};
let exportado = null;
function subirPortal() {
  return new Promise((resolve) => {
    exportado = Gio.DBusExportedObject.wrapJSObject(PORTAL_XML, portal);
    exportado.export(Gio.DBus.session, '/org/freedesktop/portal/desktop');
    Gio.bus_own_name_on_connection(
      Gio.DBus.session,
      'org.freedesktop.portal.Desktop',
      Gio.BusNameOwnerFlags.REPLACE,
      () => resolve(true),
      () => resolve(false),
    );
  });
}
// A troca de estilo: como o xdg-desktop-portal-gnome, emite o SettingChanged.
async function estilo(nome) {
  esquema = nome === 'dark' ? 1 : 2;
  const em = Date.now();
  exportado.emit_signal('SettingChanged', new GLib.Variant('(ssv)', ['org.freedesktop.appearance', 'color-scheme', new GLib.Variant('u', esquema)]));
  R.trocas.push({ estilo: nome, em });
  passo(`portal: ${nome}`);
  return em;
}

// --- a página, pela sonda --------------------------------------------------
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
let nComando = 0;
async function comando(js) {
  const id = `c${++nComando}`;
  GLib.file_set_contents(`${OUT}/comando.json`, JSON.stringify({ id, js }));
  const r = await esperar(() => sonda().find((e) => e.tipo === 'comando' && e.dados.id === id), 8000, `comando ${js.slice(0, 60)}`);
  return r.dados.resultado;
}
// O estado da página, o theme() do tao e o prefers-color-scheme (o que o
// WebKit acha do tema nativo) e, desde a instalação do observador, as trocas
// de data-theme com o horário (Date.now(), o mesmo relógio do roteiro).
const LER = `(async () => {
  const h = document.documentElement;
  const nativo = await window.__TAURI_INTERNALS__.invoke('plugin:window|theme', { label: 'main' });
  return JSON.stringify({ pref: h.dataset.themePref, tema: h.dataset.theme, nativo,
    midia: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
    mudancas: window.__ttMudancas ?? [] });
})()`;
const ler = async () => JSON.parse(await comando(LER));
const OBSERVAR = `(() => {
  window.__ttMudancas = [];
  new MutationObserver(() => window.__ttMudancas.push({ tema: document.documentElement.dataset.theme, em: Date.now() }))
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return 'ok';
})()`;
const escolher = (tema) =>
  comando(`(location.hash = '#/configuracoes', setTimeout(() => document.querySelector('.tt-tema[data-tema="${tema}"]').click(), 400), 'ok')`);
// Linhas do console desta partida (a sonda manda cada console.log).
const logsDesde = (n) => sonda().slice(n).filter((e) => e.tipo === 'log' || e.tipo === 'erro').map((e) => e.dados);
const temaChanged = (l) => l.filter((x) => /ThemeChanged/.test(x));

function lerSettings() {
  for (const id of IDS) {
    try {
      const [, bytes] = GLib.file_get_contents(`${GLib.get_user_data_dir()}/${id}/settings.json`);
      return JSON.parse(new TextDecoder().decode(bytes));
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
function esperarProcesso(p, ms) {
  return new Promise((resolve) => {
    let feito = false;
    const fim = (v) => !feito && ((feito = true), resolve(v));
    p.wait_async(null, () => fim(true));
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => (fim(false), GLib.SOURCE_REMOVE));
  });
}

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
  await esperar(() => sonda().filter((e) => e.tipo === 'estado').length > antes, 30000, 'a sonda da página');
  Main.activateWindow(W);
  await sleep(1500); // a conferência depois do primeiro quadro
  await comando(OBSERVAR);
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

// Troca o estilo do portal e espera 1,5 s. Devolve o estado depois, a
// latência até o data-theme chegar a `alvo` (null se não chegou) e as linhas
// do console da troca.
async function trocar(nome, alvo) {
  await comando('(window.__ttMudancas = [], "ok")');
  const n = sonda().length;
  const em = await estilo(nome);
  await sleep(1500);
  const e = await ler();
  const chegou = alvo ? e.mudancas.find((m) => m.tema === alvo) : null;
  const logs = logsDesde(n);
  const r = { estilo: nome, e, latenciaMs: chegou ? chegou.em - em : null, logs, disco: lerSettings() };
  R[`troca_${R.trocas.length}`] = r;
  return r;
}
// A janela como o compositor a pinta, em $TT_OUT/<nome>.
const capturar = (nome) => W.get_compositor_private().get_image(null).writeToPNG(`${OUT}/${nome}`);
const semLaco = (r) => temaChanged(r.logs).length <= 3 && r.logs.filter((l) => /reaplicado/.test(l)).length <= 1 && !r.logs.some((l) => /sem nova tentativa/.test(l));

async function principal() {
  passo('início');
  Main.messageTray.bannerBlocked = true;
  if (Main.overview.visible) Main.overview.hide();
  if (!CONTROLE) {
    const ok = await subirPortal();
    checar('o roteiro assume o org.freedesktop.portal.Desktop da rodada', ok, ok);
  } else {
    exportado = { emit_signal: () => {} };
  }
  limparDadosDoApp();

  // Partida 1, no Lite, com o GNOME claro.
  await abrir(1);
  let e = await ler();
  R.p1_inicio = e;
  checar('partida 1: abre no Lite, theme() = dark', e.pref === 'lite' && e.tema === 'lite' && e.nativo === 'dark', e);

  let r = await trocar('dark', null);
  checar('Lite, GNOME vai para escuro: a página fica no Lite, sem laço', r.e.pref === 'lite' && r.e.tema === 'lite' && r.e.mudancas.length === 0 && semLaco(r), r);
  r = await trocar('light', null);
  checar(
    'Lite, GNOME volta para claro: a página fica no Lite, o tema nativo continua escuro (guarda b) e sem laço',
    r.e.pref === 'lite' && r.e.tema === 'lite' && r.e.nativo === 'dark' && r.e.midia === 'dark' && r.e.mudancas.length === 0 && semLaco(r),
    r,
  );

  // Do Lite para o Sistema, com o GNOME claro.
  await comando('(window.__ttMudancas = [], "ok")');
  await escolher('system');
  await sleep(1500);
  e = await ler();
  R.p1_sistema = e;
  const d1 = lerSettings();
  checar(
    'do Lite para Sistema com o GNOME claro: o app fica Claro (theme() e disco também)',
    e.pref === 'system' && e.tema === 'light' && e.nativo === 'light' && d1?.theme === 'system' && d1?.resolvedTheme === 'light',
    { e, disco: d1 },
  );

  r = await trocar('dark', 'dark');
  checar(
    'Sistema, GNOME vai para escuro: a página fica Escura em até 1 s, theme() = dark, resolvedTheme no disco',
    r.e.tema === 'dark' && r.e.nativo === 'dark' && r.latenciaMs !== null && r.latenciaMs <= 1000 && r.disco?.resolvedTheme === 'dark' && r.disco?.theme === 'system',
    r,
  );
  checar('Sistema, GNOME escuro: sem laço', semLaco(r) && r.e.mudancas.length === 1, r.logs);
  capturar('m25-sistema-escuro.png');
  r = await trocar('light', 'light');
  checar(
    'Sistema, GNOME volta para claro: a página fica Clara em até 1 s, theme() = light, resolvedTheme no disco',
    r.e.tema === 'light' && r.e.nativo === 'light' && r.latenciaMs !== null && r.latenciaMs <= 1000 && r.disco?.resolvedTheme === 'light',
    r,
  );
  checar('Sistema, GNOME claro: sem laço', semLaco(r) && r.e.mudancas.length === 1, r.logs);
  capturar('m25-sistema-claro.png');

  // Do Sistema, com o GNOME escuro, para o Escuro explícito e o GNOME claro.
  await trocar('dark', 'dark');
  await escolher('dark');
  await sleep(1200);
  r = await trocar('light', null);
  checar(
    'Escuro explícito, GNOME vai para claro: nada muda (página, theme() e disco) e sem laço',
    r.e.pref === 'dark' && r.e.tema === 'dark' && r.e.nativo === 'dark' && r.e.midia === 'dark' && r.e.mudancas.length === 0 && r.disco?.theme === 'dark' && semLaco(r),
    r,
  );
  // Do Lite para o Sistema com o GNOME escuro: a guarda (c) passa por um
  // claro intermediário (o setTheme(null) grava prefer-dark = false), que não
  // pode chegar à página nem ao disco.
  await escolher('lite');
  await sleep(1200);
  await trocar('dark', null);
  await comando('(window.__ttMudancas = [], "ok")');
  let n = sonda().length;
  await escolher('system');
  await sleep(1500);
  e = await ler();
  const d3 = lerSettings();
  R.p1_sistema_escuro = { e, disco: d3, logs: logsDesde(n) };
  checar(
    'do Lite para Sistema com o GNOME escuro: o app fica Escuro, sem passar pelo Claro',
    e.pref === 'system' && e.tema === 'dark' && e.nativo === 'dark' && e.midia === 'dark' &&
      !e.mudancas.some((m) => m.tema === 'light') && d3?.resolvedTheme === 'dark' && !logsDesde(n).some((l) => /sistema: .*light|reaplicado/.test(l)),
    R.p1_sistema_escuro,
  );
  r = await trocar('light', 'light');
  checar('de novo em Sistema, o GNOME volta para claro: Claro em até 1 s', r.e.pref === 'system' && r.e.tema === 'light' && r.latenciaMs !== null && r.latenciaMs <= 1000 && semLaco(r), r);
  await fechar(1);

  // Partida 2: o GNOME muda com o app fechado.
  await estilo('dark');
  await sleep(300);
  await abrir(2);
  e = await ler();
  const d2 = lerSettings();
  R.p2_inicio = { e, disco: d2 };
  checar(
    'partida 2: o GNOME ficou escuro com o app fechado; reabre no Escuro e regrava o resolvedTheme',
    e.pref === 'system' && e.tema === 'dark' && e.nativo === 'dark' && d2?.resolvedTheme === 'dark',
    { e, disco: d2 },
  );
  r = await trocar('light', 'light');
  checar('partida 2: e segue o GNOME de volta ao claro em até 1 s', r.e.tema === 'light' && r.latenciaMs !== null && r.latenciaMs <= 1000 && semLaco(r), r);
  await fechar(2);
  R.leiturasDoPortal = leituras;
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
  R.leiturasDoPortal = leituras;
  salvar();
}
