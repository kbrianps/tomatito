// Roteiro do M50 para o build com a CSP: abre o binário de `npm run
// build:debug` (as páginas embutidas, com a CSP do tauri.conf.json) no GNOME
// Shell aninhado, com o inspetor remoto ligado, e lê o console da janela
// tomato pelo console-tomate.mjs. O "Pronto quando": nenhum "Refused to" no
// console da tomato.
//
//   npm run build:debug && cp <target-dir>/debug/tomatito /tmp/tomatito-build
//   TOMATITO_BIN=/tmp/tomatito-build bash scripts/gnome-aninhado/rodar.sh tomate-csp
//
// O Vite do rodar.sh sobe, mas fica sem uso: o build lê as páginas de dentro
// do binário (tauri://localhost). No fim, o app é encerrado pelo processo.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import 'resource:///org/gnome/shell/ui/screenshot.js'; // promisifica Shell.Screenshot

export const METRICS = {};
// O rodar.sh procura esta linha: com ela, o dentro.sh não abre o app.
export const LANCA_O_APP = true;

const OUT = GLib.getenv('TT_OUT');
const BIN = GLib.getenv('TOMATITO_BIN');
const NODE = GLib.getenv('TT_NODE');
const CONSOLE_TOMATE = GLib.getenv('TT_CONSOLE_MJS').replace(/console\.mjs$/, 'console-tomate.mjs');
const PORTA = 9450;
const R = { passos: [], checagens: {}, binario: BIN };

const salvar = () => GLib.file_set_contents(`${OUT}/resultado.json`, JSON.stringify(R, null, 2));
const sleep = (ms) =>
  new Promise((r) => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => (r(), GLib.SOURCE_REMOVE)));
const passo = (m) => {
  R.passos.push(`${Math.round(GLib.get_monotonic_time() / 1000)} ${m}`);
  salvar();
};
const checar = (nome, ok, detalhe) => {
  R.checagens[nome] = { ok: Boolean(ok), detalhe };
  passo(`${ok ? 'ok' : 'FALHA'}: ${nome}`);
};
const janelas = () =>
  global.get_window_actors().map((a) => a.meta_window).filter((w) => w.get_title() === 'Tomatito');

function esperarProcesso(proc, ms) {
  return new Promise((resolve) => {
    let feito = false;
    const fim = (ok) => {
      if (!feito) (feito = true), resolve(ok);
    };
    proc.wait_async(null, () => fim(true));
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => (fim(false), GLib.SOURCE_REMOVE));
  });
}

async function principal() {
  passo('início');
  try {
    new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' }).set_boolean('enable-hot-corners', false);
  } catch {
    // segue
  }
  const L = new Gio.SubprocessLauncher({ flags: Gio.SubprocessFlags.STDERR_MERGE });
  L.setenv('WAYLAND_DISPLAY', 'tt-aninhado', true);
  L.setenv('GDK_BACKEND', 'wayland', true);
  L.setenv('WEBKIT_INSPECTOR_HTTP_SERVER', `127.0.0.1:${PORTA}`, true);
  L.set_stdout_file_path(`${OUT}/app.log`);
  const proc = L.spawnv([BIN]);
  passo(`app: pid ${proc.get_identifier()}`);
  const t0 = Date.now();
  while (!janelas().length && Date.now() - t0 < 60000) await sleep(100);
  checar('a main abriu', janelas().length === 1, janelas().length);
  for (let i = 0; i < 20 && (Main.overview.visible || Main.overview.animationInProgress); i++) {
    if (!Main.overview.animationInProgress) Main.overview.hide();
    await sleep(400);
  }
  await sleep(1500);

  const arq = `${OUT}/console-tomate.json`;
  const p = Gio.Subprocess.new([NODE, CONSOLE_TOMATE, `127.0.0.1:${PORTA}`, arq], Gio.SubprocessFlags.NONE);
  if (!(await esperarProcesso(p, 60000))) p.force_exit();
  let c = {};
  try {
    const [, bytes] = GLib.file_get_contents(arq);
    c = JSON.parse(new TextDecoder().decode(bytes));
  } catch (e) {
    c = { erro: `sem saída do console-tomate.mjs: ${e}` };
  }
  R.console = c;
  const tomato = janelas().find((w) => w.get_frame_rect().width === 280);
  if (tomato) {
    const r = tomato.get_frame_rect();
    const shooter = new Shell.Screenshot();
    const s = Gio.File.new_for_path(`${OUT}/m50-build-tomate.png`).replace(null, false, Gio.FileCreateFlags.NONE, null);
    await shooter.screenshot_area(r.x - 20, r.y - 20, r.width + 40, r.height + 40, s);
    s.close(null);
  }
  const recusas = (lista) => (lista ?? []).filter((m) => /Refused to/i.test(m.texto));
  checar('o tomate abriu no build (tomato_debug_open) e está no inspetor', c.abrir === 'aberto' && Boolean(c.alvos?.tomato) && Boolean(tomato), { abrir: c.abrir, alvos: c.alvos, erro: c.erro });
  checar('a página veio de dentro do binário (tauri://), no tema full', /^tauri:\/\/localhost\/tomato\.html/.test(c.estado?.url ?? '') && c.estado?.dataset?.theme === 'full', c.estado);
  checar('a CSP chegou com o tomato.html, com o hash do script de boot', /script-src[^;]*'sha256-/.test(c.estado?.csp ?? '') && /connect-src 'self' ipc: http:\/\/ipc\.localhost/.test(c.estado?.csp ?? ''), c.estado?.csp);
  checar('nenhum "Refused to" no console da tomato, da partida', c.mensagens && recusas(c.mensagens).length === 0, c.mensagens);
  checar(
    'nenhum "Refused to" ao usar os botões (focus_start, pausar, retomar, encerrar e o anel)',
    Array.isArray(c.exercicio) && c.exercicio.length === 5 && recusas(c.mensagensDoExercicio).length === 0 &&
      JSON.stringify(c.exercicio.map((x) => x[0])) === JSON.stringify(['idle', 'focus', 'paused', 'focus', 'idle']),
    { exercicio: c.exercicio, mensagens: c.mensagensDoExercicio },
  );
  checar('controle: a CSP recusa um script inline sem hash, com "Refused to"', c.controle === 'script inline recusado' && recusas(c.mensagensDoControle).length > 0, { controle: c.controle, mensagens: c.mensagensDoControle });
  checar('o console da tomato está vazio, fora o controle', (c.mensagens ?? []).length === 0 && (c.mensagensDoExercicio ?? []).length === 0, { partida: c.mensagens, exercicio: c.mensagensDoExercicio });

  proc.force_exit();
  await esperarProcesso(proc, 5000);
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
