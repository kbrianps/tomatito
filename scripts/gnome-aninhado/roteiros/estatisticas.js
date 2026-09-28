// Roteiro do M26 (estatísticas), carregado com `gnome-shell --automation-script`
// pelo dentro.sh. Abre o app sozinho, duas vezes (LANCA_O_APP abaixo), com o
// relógio acelerado (TOMATITO_SPEED=60: 1 min em 1 s), e confere, pelo
// `invoke` da página (a sonda) e pelo próprio arquivo:
//   partida 1 (sem dados do app):
//     - o `stats_get` começa zerado, com a meta e a hora de zerar das
//       configurações (120 e 0, os padrões);
//     - o `stats.sqlite` nasce em ~/.local/share/<id>/, com `user_version` 1 e
//       as tabelas `periods` e `tasks`;
//     - uma sessão de 5 min termina sozinha: o "hoje" e a "semana" passam a
//       300 s, e o banco tem uma linha de foco completa;
//     - uma sessão encerrada depois de ~1,5 min conta (interrompida com mais
//       de 1 min); outra encerrada com ~20 s não conta, mas é gravada;
//   partida 2 (reaberta depois de fechar): o `stats_get` devolve os mesmos
//     números, e o banco continua com as mesmas linhas.
// Cada partida fecha a janela pelo compositor e espera o app sair. O
// resumo-estatisticas.mjs confere as checagens.
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
const IDS = ['io.github.kbrianps.tomatito.dev', 'io.github.kbrianps.tomatito'];

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

let nComando = 0;
async function comando(js) {
  const id = `c${++nComando}`;
  const antes = sonda().length;
  GLib.file_set_contents(`${OUT}/comando.json`, JSON.stringify({ id, js }));
  const r = await esperar(
    () => sonda().slice(antes).find((e) => e.tipo === 'comando' && e.dados.id === id),
    10000,
    `comando ${js}`,
  );
  const texto = JSON.stringify(r.dados.resultado) ?? 'null';
  passo(`comando ${js.slice(0, 120)} => ${texto.length > 300 ? `${texto.slice(0, 300)}…` : texto}`);
  return r.dados.resultado;
}
const invoke = (cmd, args = {}) =>
  comando(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args)}).catch((e) => ({ erro: e }))`);
const estatisticas = () => invoke('stats_get');
// Inicia e encerra na própria página, depois de `ms` de relógio real, para a
// ida e volta da sonda não entrar no tempo corrido.
const correrEParar = (minutos, ms) =>
  comando(
    `(async () => { const i = window.__TAURI_INTERNALS__.invoke; await i('focus_start', { minutes: ${minutos}, skipBreaks: false, taskId: null }); await new Promise((r) => setTimeout(r, ${ms})); return (await i('focus_stop')).status; })()`,
  );
const status = async () => (await comando("window.__TAURI_INTERNALS__.invoke('get_state').then((s) => s.focus.status)"));

function pastaDoApp() {
  for (const id of IDS) {
    const p = `${GLib.get_user_data_dir()}/${id}`;
    if (GLib.file_test(`${p}/stats.sqlite`, GLib.FileTest.EXISTS)) return p;
  }
  return null;
}
// O banco lido de fora, pelo sqlite3 do Python (só leitura): a versão, as
// tabelas e as linhas de `periods`.
function banco() {
  const pasta = pastaDoApp();
  if (!pasta) return null;
  const py = [
    'import json, sqlite3, sys',
    "c = sqlite3.connect('file:' + sys.argv[1] + '?mode=ro', uri=True)",
    "v = c.execute('PRAGMA user_version').fetchone()[0]",
    "t = [r[0] for r in c.execute(\"SELECT name FROM sqlite_master WHERE type='table' ORDER BY name\")]",
    "p = [list(r) for r in c.execute('SELECT kind, actual_s, completed, ended_at - started_at FROM periods ORDER BY id')]",
    "print(json.dumps({'versao': v, 'tabelas': t, 'periodos': p}))",
  ].join('\n');
  const [ok, saida, erro] = GLib.spawn_sync(null, ['python3', '-c', py, `${pasta}/stats.sqlite`], null, GLib.SpawnFlags.SEARCH_PATH, null);
  if (!ok) return { erro: 'spawn' };
  const texto = new TextDecoder().decode(saida).trim();
  if (!texto) return { erro: new TextDecoder().decode(erro) };
  return { pasta, ...JSON.parse(texto) };
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

let W = null;
let proc = null;
async function abrir(i) {
  const L = new Gio.SubprocessLauncher({ flags: Gio.SubprocessFlags.STDERR_MERGE });
  L.setenv('WAYLAND_DISPLAY', 'tt-aninhado', true);
  L.setenv('GDK_BACKEND', 'wayland', true);
  L.setenv('TOMATITO_SPEED', '60', true);
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
  await sleep(800);
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
const numeros = (s) => s && [s.yesterdayS, s.todayS, s.weekS];

async function principal() {
  passo('início');
  Main.messageTray.bannerBlocked = true;
  if (Main.overview.visible) Main.overview.hide();
  limparDadosDoApp();

  // Partida 1.
  await abrir(1);
  const zero = await estatisticas();
  R.zero = zero;
  checar(
    'partida 1: stats_get começa zerado, com a meta (120) e a hora de zerar (0) das configurações',
    JSON.stringify(zero) === JSON.stringify({ yesterdayS: 0, todayS: 0, weekS: 0, dailyGoalMinutes: 120, resetHour: 0 }),
    zero,
  );
  const b0 = banco();
  R.banco0 = b0;
  checar(
    'o stats.sqlite nasce na pasta de dados, com user_version 1, periods e tasks, sem linhas',
    b0?.versao === 1 && JSON.stringify(b0.tabelas) === '["periods","tasks"]' && b0.periodos.length === 0,
    b0,
  );

  // Uma sessão de 5 min (5 s a 60×) que termina sozinha.
  await invoke('focus_start', { minutes: 5, skipBreaks: false, taskId: null });
  const t0 = Date.now();
  let st;
  while (Date.now() - t0 < 15000) {
    await sleep(500);
    st = await status();
    if (st === 'completed') break;
  }
  const depois5 = await estatisticas();
  R.depois5 = depois5;
  checar('sessão de 5 min concluída: hoje e semana = 300 s', st === 'completed' && depois5.todayS === 300 && depois5.weekS === 300, { st, depois5 });

  // Encerrada com ~1,5 min (conta) e com ~20 s (não conta).
  await correrEParar(3, 1500);
  const depois90 = await estatisticas();
  R.depois90 = depois90;
  const extra = depois90.todayS - 300;
  checar('encerrada com ~1,5 min: soma o tempo corrido (entre 60 e 150 s)', extra >= 60 && extra <= 150 && depois90.weekS === depois90.todayS, depois90);
  await correrEParar(3, 330);
  const depois20 = await estatisticas();
  R.depois20 = depois20;
  checar('encerrada com menos de 1 min: não soma', depois20.todayS === depois90.todayS, depois20);

  const b1 = banco();
  R.banco1 = b1;
  const p = b1?.periodos ?? [];
  checar(
    'o banco tem as três linhas de foco: completa (300 s), interrompida (> 60 s) e interrompida (< 60 s)',
    p.length === 3 && p.every((l) => l[0] === 'focus') &&
      p[0][1] === 300 && p[0][2] === 1 && p[1][1] >= 60 && p[1][2] === 0 && p[2][1] < 60 && p[2][2] === 0,
    p,
  );
  await fechar(1);

  // Partida 2: os números sobrevivem ao reinício.
  await abrir(2);
  const reaberto = await estatisticas();
  R.reaberto = reaberto;
  checar(
    'partida 2: fechar e reabrir mantém os números',
    JSON.stringify(numeros(reaberto)) === JSON.stringify(numeros(depois20)) && reaberto.dailyGoalMinutes === 120,
    { antes: depois20, depois: reaberto },
  );
  const b2 = banco();
  checar('partida 2: o banco continua com as mesmas linhas', JSON.stringify(b2?.periodos) === JSON.stringify(p), b2);
  await fechar(2);
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
