// Roteiro das ações pela barra (v0.5), carregado com `gnome-shell
// --automation-script` pelo dentro.sh, com o binário de debug de verdade:
//
//   bash scripts/gnome-aninhado/rodar.sh acoes
//
// O menu do ícone na dock abre o Tomatito com `--acao=<nome>` (o `.desktop`).
// Com o app aberto, a segunda abertura só entrega a ação:
// 1. `--acao=alternar` inicia a sessão de 30 min; de novo, pausa; de novo,
//    retoma;
// 2. `--acao=pular` passa da fase (numa sessão de um período só, conclui);
// 3. `--acao=encerrar` encerra a sessão;
// 4. nenhuma delas abre janela nova, e uma ação desconhecida não mexe no
//    foco (só mostra a main, como uma segunda abertura comum).
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


const BIN = GLib.getenv('TOMATITO_BIN');
async function abrirCom(...args) {
  const L = new Gio.SubprocessLauncher({ flags: Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_SILENCE });
  L.setenv('WAYLAND_DISPLAY', 'tt-aninhado', true);
  L.setenv('GDK_BACKEND', 'wayland', true);
  const p = L.spawnv([BIN, ...args]);
  await new Promise((r) => p.wait_async(null, () => r()));
  await sleep(700);
}
const foco = async () => {
  const f = await focoDoMotor();
  return { status: f.status, fase: f.session?.phase?.kind ?? null, minutos: f.session?.minutes ?? null };
};

async function principal() {
  passo('início');
  await esperar(() => (janelas().length && rect(janelas()[0]).w > 0 ? janelas() : null), 120000, 'a janela main');
  await esperar(() => sonda().some((e) => e.janela === 'main' && e.tipo === 'estado' && e.dados?.nav?.itens?.length === 4), 30000, 'a main desenhada');
  if (Main.overview.visible) Main.overview.hide();
  await sleep(1500);
  const antes = { janelas: janelas().length, foco: await foco() };

  await abrirCom('--acao=alternar');
  const iniciou = await foco();
  checar('--acao=alternar inicia a sessão de 30 min', antes.foco.status === 'idle' && iniciou.status === 'focus' && iniciou.minutos === 30, { antes: antes.foco, iniciou });
  await abrirCom('--acao=alternar');
  const pausou = await foco();
  await abrirCom('--acao=alternar');
  const retomou = await foco();
  checar('de novo pausa, e de novo retoma', pausou.status === 'paused' && retomou.status === 'focus', { pausou, retomou });

  await abrirCom('--acao=pular');
  const pulou = await foco();
  // A sessão de 30 min tem um período só: pular conclui a sessão.
  checar('--acao=pular passa da fase (aqui, conclui a sessão de um período só)', pulou.status === 'completed', pulou);

  await abrirCom('--acao=alternar');
  const outra = await foco();
  await abrirCom('--acao=encerrar');
  const encerrou = await foco();
  checar('--acao=encerrar encerra a sessão em andamento', outra.status === 'focus' && encerrou.status !== 'focus' && encerrou.status !== 'paused', { outra, encerrou });
  checar('nenhuma ação abre janela nova', janelas().length === antes.janelas, { antes: antes.janelas, depois: janelas().length });

  await abrirCom('--acao=apagar-tudo');
  const depois = await foco();
  checar('uma ação desconhecida não mexe no foco', depois.status === encerrou.status && janelas().length === antes.janelas, depois);
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
