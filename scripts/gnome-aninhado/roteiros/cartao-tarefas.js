// Roteiro do M30 (cartão "Tarefas"), carregado com `gnome-shell
// --automation-script` pelo dentro.sh. Abre o app sozinho, duas vezes
// (LANCA_O_APP abaixo), com o relógio acelerado (TOMATITO_SPEED=60: 1 min em
// 1 s), e faz o "Pronto quando" pela tela, com as funções __ttTarefas* de
// scripts/preview/medidas.js (a sonda as leva), que clicam nos botões do
// cartão e escrevem no campo como o Enter:
//   partida 1 (sem dados do app):
//     - o cartão começa vazio: "Mantenha o rumo" e "Adicionar tarefa";
//     - três tarefas adicionadas pelo campo, na ordem, e o task_list igual;
//     - a segunda escolhida ("Escolhida") e "Iniciar sessão de foco" com 5
//       min (5 s a 60×): o retrato traz o taskId, o subtítulo vira "Você está
//       focando em" e as outras linhas ficam em --tt-fg-2;
//     - concluir a segunda pelo círculo: marcada, no lugar;
//     - a sessão termina e o período de foco fica gravado com o task_id da
//       segunda (lido do banco, fora do app);
//   partida 2 (reaberta): o cartão mostra as mesmas três, a segunda marcada,
//     e o banco guarda o período com o task_id.
// Cada partida fecha a janela pelo compositor e espera o app sair. O
// resumo-cartao-tarefas.mjs confere as checagens. As capturas da janela vão
// para m30-app-*.png.
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
function capturar(nome) {
  try {
    W.get_compositor_private().get_image(null).writeToPNG(`${OUT}/${nome}`);
    passo(`captura ${nome}`);
  } catch (e) {
    passo(`captura ${nome} falhou: ${e}`);
  }
}
const rolar = () => comando('__ttTarefasRolar()');
const cartao = () => comando('__ttTarefas()');
const TRES = ['Ler o capítulo 3', 'Lista de exercícios 2', 'Revisar as notas'];
const titulos = (m) => (m?.linhas ?? []).map((l) => `${l.titulo}${l.marcada ? '*' : ''}`).join('|');

async function principal() {
  passo('início');
  Main.messageTray.bannerBlocked = true;
  if (Main.overview.visible) Main.overview.hide();
  limparDadosDoApp();

  // Partida 1.
  await abrir(1);
  await sleep(500);
  const vazio = await rolar();
  capturar('m30-app-vazio.png');
  checar(
    'partida 1: o cartão começa vazio, com "Mantenha o rumo" e "Adicionar tarefa"',
    vazio?.linhas?.length === 0 && vazio?.vazio?.[0] === 'Mantenha o rumo' && vazio?.vazio?.at(-1) === 'Adicionar tarefa' &&
      vazio?.cabecalho?.icone === 'checkmark_circle' && vazio?.cabecalho?.titulo === 'Tarefas',
    vazio,
  );

  const tres = await comando(`__ttTarefasAdicionar(${TRES.map((t) => JSON.stringify(t)).join(', ')})`);
  const ids = (tres?.linhas ?? []).map((l) => l.id);
  checar('três tarefas pelo campo, na ordem, pendentes', titulos(tres) === TRES.join('|') && ids.length === 3, titulos(tres));
  const doRust = await invoke('task_list');
  checar('o task_list tem as mesmas três', Array.isArray(doRust) && doRust.map((t) => t.title).join('|') === TRES.join('|'), doRust);
  checar(
    'as linhas têm 41 px, raio 4 e o fundo --tt-bg-surface',
    tres?.linhas?.every((l) => Math.abs(l.altura - 41) <= 0.5 && l.raio === '4px' && l.fundo === tres.tokens.superficie),
    tres?.linhas?.map((l) => [l.altura, l.raio, l.fundo, tres.tokens.superficie]),
  );
  await comando('__ttTarefasEsc()');

  const idB = ids[1];
  const escolhida = await comando(`__ttTarefasAcao(${idB}, "escolher")`);
  await rolar();
  capturar('m30-app-escolhida.png');
  checar('escolher a segunda: "Escolhida"', escolhida?.linhas?.find((l) => l.id === idB)?.escolher === 'Escolhida', escolhida?.linhas);

  // 5 min (5 s a 60×): o mínimo do debug (1) e mais 4 passos.
  const sessao = await comando('__ttTarefasIniciar({ minimo: true, passos: 4 })');
  const estado = await comando("window.__TAURI_INTERNALS__.invoke('get_state').then((s) => ({ status: s.focus.status, taskId: s.focus.session?.taskId ?? null, minutes: s.focus.session?.minutes ?? null }))");
  await rolar();
  capturar('m30-app-sessao.png');
  checar('"Iniciar sessão de foco" manda a escolhida: o retrato traz o taskId', estado?.status === 'focus' && estado?.taskId === idB && estado?.minutes === 5, estado);
  const cores = (sessao?.linhas ?? []).map((l) => [l.id, l.corDoTitulo]);
  checar(
    'na sessão: "Você está focando em", a tarefa da sessão em --tt-fg-1 e as outras em --tt-fg-2',
    sessao?.subtitulo === 'Você está focando em' &&
      sessao.linhas.every((l) => l.corDoTitulo === (l.id === idB ? sessao.tokens.fg1 : sessao.tokens.fg2)) &&
      sessao.linhas.find((l) => l.id === idB)?.daSessao,
    { subtitulo: sessao?.subtitulo, cores, tokens: sessao?.tokens },
  );

  const concluida = await comando(`__ttTarefasAcao(${idB}, "concluir")`);
  const b = concluida?.linhas?.find((l) => l.id === idB);
  checar('concluir a segunda pelo círculo: marcada, check preenchido, no lugar', b?.marcada && b?.preenchido && titulos(concluida) === `${TRES[0]}|${TRES[1]}*|${TRES[2]}`, titulos(concluida));

  const t0 = Date.now();
  let st;
  while (Date.now() - t0 < 20000) {
    await sleep(500);
    st = await status();
    if (st === 'completed') break;
  }
  const depois = await rolar();
  capturar('m30-app-concluida.png');
  checar('a sessão termina e o cartão volta a "Escolha uma tarefa para a sessão"', st === 'completed' && depois?.subtitulo === 'Escolha uma tarefa para a sessão' && !depois.linhas.some((l) => l.escolhida), { st, sub: depois?.subtitulo });
  const b1 = banco();
  R.banco1 = b1;
  checar(
    'o período de foco fica gravado com o task_id da tarefa escolhida',
    b1?.periodos?.length === 1 && b1.periodos[0][0] === 'focus' && b1.periodos[0][1] === 1 && b1.periodos[0][2] === idB,
    b1,
  );
  await fechar(1);

  // Partida 2: tudo sobrevive ao reinício.
  await abrir(2);
  await sleep(500);
  const reaberto = await rolar();
  capturar('m30-app-reaberto.png');
  checar('partida 2: o cartão mostra as mesmas três, a segunda marcada', titulos(reaberto) === `${TRES[0]}|${TRES[1]}*|${TRES[2]}`, titulos(reaberto));
  const b2 = banco();
  R.banco2 = b2;
  checar(
    'partida 2: o banco guarda as três tarefas e o período com o task_id',
    b2?.tarefas?.length === 3 && b2.tarefas[1][2] === 1 && b2.periodos?.[0]?.[2] === idB,
    b2,
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
