// Roteiro do M29 (tarefas: dados), carregado com `gnome-shell --automation-script`
// pelo dentro.sh. Abre o app sozinho, duas vezes (LANCA_O_APP abaixo), com o
// relógio acelerado (TOMATITO_SPEED=60: 1 min em 1 s), e confere os comandos
// task_* pelo `invoke` da página (a sonda) e pelo próprio banco:
//   partida 1 (sem dados do app):
//     - o `task_list` começa vazio;
//     - `task_add` cria três tarefas, na ordem, com o título limpo; título
//       vazio e título com 256 caracteres são recusados (`emptyTitle`,
//       `titleTooLong`);
//     - `task_complete` marca a segunda, que continua na lista, no lugar; com
//       `done: false` ela volta, e marcada de novo fica;
//     - `task_delete` apaga uma quarta; apagar de novo dá `notFound`;
//     - uma sessão de 5 min com `taskId` da primeira grava o período com o
//       `task_id` (o dado que o M30 usa);
//   partida 2 (reaberta): a mesma lista; uma tarefa concluída agora e a hora
//     de zerar posta na hora cheia seguinte do relógio acelerado: até a
//     virada ela aparece, marcada; passada a virada (menos de 1 min de relógio
//     real), as concluídas somem e as pendentes ficam. O banco guarda as
//     linhas que sumiram.
// Cada partida fecha a janela pelo compositor e espera o app sair. O
// resumo-tarefas.mjs confere as checagens.
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
// O banco lido de fora, pelo sqlite3 do Python (só leitura): as tarefas e os
// períodos de foco com o task_id.
function banco() {
  const pasta = pastaDoApp();
  if (!pasta) return null;
  const py = [
    'import json, sqlite3, sys',
    "c = sqlite3.connect('file:' + sys.argv[1] + '?mode=ro', uri=True)",
    "t = [list(r) for r in c.execute('SELECT id, title, done_at IS NOT NULL FROM tasks ORDER BY id')]",
    "p = [list(r) for r in c.execute(\"SELECT kind, completed, task_id FROM periods ORDER BY id\")]",
    "print(json.dumps({'tarefas': t, 'periodos': p}))",
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
const lista = () => invoke('task_list');
const resumo = (l) => (Array.isArray(l) ? l.map((t) => `${t.title}${t.doneAt == null ? '' : '*'}`).join('|') : JSON.stringify(l));

async function principal() {
  passo('início');
  Main.messageTray.bannerBlocked = true;
  if (Main.overview.visible) Main.overview.hide();
  limparDadosDoApp();

  // Partida 1.
  await abrir(1);
  const vazia = await lista();
  checar('partida 1: task_list começa vazio', Array.isArray(vazia) && vazia.length === 0, vazia);

  const a = await invoke('task_add', { title: 'Ler o capítulo 3' });
  const b = await invoke('task_add', { title: '  Revisar\nas notas ' });
  const c = await invoke('task_add', { title: 'Lista de exercícios 2' });
  R.criadas = [a, b, c];
  checar(
    'task_add cria três tarefas pendentes, com ids crescentes, createdAt e o título limpo',
    [a, b, c].every((t) => Number.isInteger(t?.id) && t.doneAt === null && t.createdAt > 0) &&
      a.id < b.id && b.id < c.id && b.title === 'Revisar as notas',
    [a, b, c],
  );
  const vazio = await invoke('task_add', { title: '   ' });
  const longo = await invoke('task_add', { title: 'x'.repeat(256) });
  checar(
    'título vazio e com 256 caracteres são recusados, com { code, message }',
    vazio?.erro?.code === 'emptyTitle' && longo?.erro?.code === 'titleTooLong' && typeof vazio.erro.message === 'string',
    { vazio, longo },
  );
  checar('a lista tem as três, na ordem de criação', resumo(await lista()) === 'Ler o capítulo 3|Revisar as notas|Lista de exercícios 2');

  const feita = await invoke('task_complete', { id: b.id });
  checar('task_complete sem done marca como concluída (doneAt)', feita?.id === b.id && feita.doneAt > 0, feita);
  checar('a concluída continua na lista, no mesmo lugar', resumo(await lista()) === 'Ler o capítulo 3|Revisar as notas*|Lista de exercícios 2');
  const volta = await invoke('task_complete', { id: b.id, done: false });
  const denovo = await invoke('task_complete', { id: b.id, done: true });
  checar('done: false volta a pendente, e done: true marca de novo', volta?.doneAt === null && denovo?.doneAt > 0, { volta, denovo });

  const d = await invoke('task_add', { title: 'Apagar esta' });
  const apagada = await invoke('task_delete', { id: d.id });
  const deNovo = await invoke('task_delete', { id: d.id });
  const semId = await invoke('task_complete', { id: d.id });
  checar(
    'task_delete apaga; de novo, ou concluir a apagada, dá notFound',
    apagada === null && deNovo?.erro?.code === 'notFound' && semId?.erro?.code === 'notFound' &&
      resumo(await lista()) === 'Ler o capítulo 3|Revisar as notas*|Lista de exercícios 2',
    { apagada, deNovo, semId },
  );

  // Uma sessão de 5 min (5 s a 60×) com a primeira tarefa.
  await invoke('focus_start', { minutes: 5, skipBreaks: false, taskId: a.id });
  const t0 = Date.now();
  let st;
  while (Date.now() - t0 < 15000) {
    await sleep(500);
    st = await status();
    if (st === 'completed') break;
  }
  const b1 = banco();
  R.banco1 = b1;
  checar(
    'a sessão com taskId grava o período de foco com o task_id da tarefa',
    st === 'completed' && b1?.periodos?.length === 1 && b1.periodos[0][0] === 'focus' && b1.periodos[0][1] === 1 && b1.periodos[0][2] === a.id,
    { st, b1 },
  );
  checar(
    'o banco tem as três tarefas (a apagada saiu), com a segunda concluída',
    JSON.stringify(b1?.tarefas) === JSON.stringify([[a.id, 'Ler o capítulo 3', 0], [b.id, 'Revisar as notas', 1], [c.id, 'Lista de exercícios 2', 0]]),
    b1?.tarefas,
  );
  await fechar(1);

  // Partida 2: a lista sobrevive ao reinício; depois, a virada do dia.
  await abrir(2);
  const reaberta = await lista();
  R.reaberta = reaberta;
  checar('partida 2: fechar e reabrir mantém a lista', resumo(reaberta) === 'Ler o capítulo 3|Revisar as notas*|Lista de exercícios 2', reaberta);

  const e = await invoke('task_add', { title: 'Concluída antes da virada' });
  const eFeita = await invoke('task_complete', { id: e.id });
  // A hora cheia seguinte do relógio acelerado, no fuso local (o do app).
  const quando = GLib.DateTime.new_from_unix_local(Math.floor(eFeita.doneAt / 1000));
  const zerar = (quando.get_hour() + 1) % 24;
  const faltamS = (60 - quando.get_minute()) * 60 - quando.get_second();
  R.virada = { doneAt: eFeita.doneAt, local: quando.format('%F %T %z'), zerar, faltamAceleradosS: faltamS };
  const cfg = await invoke('settings_set', { patch: { resetHour: zerar } });
  const antes = await lista();
  checar(
    `com a hora de zerar às ${zerar}:00, antes da virada as concluídas continuam`,
    cfg?.resetHour === zerar && resumo(antes) === 'Ler o capítulo 3|Revisar as notas*|Lista de exercícios 2|Concluída antes da virada*',
    { cfg: cfg?.resetHour, antes: resumo(antes) },
  );
  // A 60×, a hora que falta passa em até 60 s de relógio real.
  const t1 = Date.now();
  let depois = antes;
  while (Date.now() - t1 < 80000) {
    await sleep(2000);
    depois = await lista();
    if (Array.isArray(depois) && depois.length < 4) break;
  }
  R.esperaDaVirada = Date.now() - t1;
  checar(
    'passada a virada, as concluídas somem e as pendentes ficam',
    resumo(depois) === 'Ler o capítulo 3|Lista de exercícios 2',
    { depois: resumo(depois), esperaMs: R.esperaDaVirada },
  );
  const b2 = banco();
  R.banco2 = b2;
  checar(
    'sumir não apaga: o banco guarda as quatro tarefas, duas concluídas',
    b2?.tarefas?.length === 4 && b2.tarefas.filter((t) => t[2] === 1).length === 2,
    b2?.tarefas,
  );
  const desmarcada = await invoke('task_complete', { id: b.id, done: false });
  checar(
    'desmarcar uma que sumiu a traz de volta, pendente, no lugar dela',
    desmarcada?.doneAt === null && resumo(await lista()) === 'Ler o capítulo 3|Revisar as notas|Lista de exercícios 2',
    desmarcada,
  );
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
