// Roteiro do M27 (cartão "Progresso diário"), carregado com
// `gnome-shell --automation-script` pelo dentro.sh. Abre o app sozinho, duas
// vezes (LANCA_O_APP abaixo), com o relógio acelerado (TOMATITO_SPEED=60: 1
// min em 1 s), e confere o "Pronto quando" do M27 no app de verdade (Rust,
// SQLite e WebKitGTK), pelo DOM (a sonda, com as medidas __ttProgresso e
// __ttSerieDoAnel de scripts/preview/medidas.js) e por capturas da janela:
//   partida 1 (sem dados do app):
//     - o cartão abre com "Concluído: 0 minutos", o arco escondido e a meta
//       padrão (2 horas) no anel;
//     - uma sessão de 5 min termina sozinha: o arco anda (valores no meio do
//       caminho, em cerca de 1 s) até 300/7200 da meta, e o rodapé e Esta
//       semana passam a 5 minutos;
//   partida 2 (reaberta depois de fechar): o cartão já abre com os mesmos
//     números e o arco no mesmo lugar, sem animar de novo.
// O resumo-progresso.mjs confere as checagens.
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
const C = 2 * Math.PI * 94;
const r3 = (n) => Math.round(n * 1000) / 1000;
const progresso = () => comando('__ttProgresso()');
const serieDoAnel = (ms) => comando(`__ttSerieDoAnel(${ms}, 50)`);

async function principal() {
  passo('início');
  Main.messageTray.bannerBlocked = true;
  if (Main.overview.visible) Main.overview.hide();
  limparDadosDoApp();

  // Partida 1.
  await abrir(1);
  let p0 = await progresso();
  for (let i = 0; i < 20 && p0?.carregando; i++) {
    await sleep(100);
    p0 = await progresso();
  }
  R.inicio = p0;
  checar(
    'partida 1: o cartão abre zerado, com o arco escondido e a meta padrão (2 horas)',
    p0?.rodape === 'Concluído: 0 minutos' && p0.arco.vazio && !p0.arco.visivel &&
      JSON.stringify(p0.meta) === '{"numero":"2","unidade":"horas"}' &&
      JSON.stringify(p0.ontem) === '{"numero":"0","unidade":"minutos"}' && p0.papel === 'img',
    p0,
  );
  checar(
    'partida 1: trilho e arco com as cores do tema, pontas redondas e transição de 1 s linear',
    p0?.cores?.trilho === p0?.cores?.esperado?.trilho && p0?.cores?.arco === p0?.cores?.esperado?.arco &&
      p0?.arco?.pontas === 'round' && JSON.stringify(p0?.arco?.transicao) === '["stroke-dashoffset","1s","linear"]',
    { cores: p0?.cores, pontas: p0?.arco?.pontas, transicao: p0?.arco?.transicao },
  );
  checar(
    'partida 1: na janela padrão, três colunas, e os rótulos numa linha só',
    p0?.caixas && p0.caixas.ontem[0] + p0.caixas.ontem[2] <= p0.caixas.anel[0] &&
      p0.caixas.semana[0] >= p0.caixas.anel[0] + p0.caixas.anel[2] &&
      p0.alturasDosRotulos.length === 3 && p0.alturasDosRotulos.every((h) => h <= 20) && !p0.transborda,
    { caixas: p0?.caixas, alturas: p0?.alturasDosRotulos },
  );
  capturar('m27-app-antes.png');

  // Uma sessão de 5 min (5 s a 60×) que termina sozinha; a série do arco
  // começa junto e dura 9 s.
  await invoke('focus_start', { minutes: 5, skipBreaks: false, taskId: null });
  const serie = await serieDoAnel(9000);
  R.serie = serie;
  const p1 = await progresso();
  R.depois = p1;
  const alvo = r3(C * (1 - 300 / 7200));
  const valores = (serie ?? []).map((s) => s.d);
  const meio = valores.filter((d) => d < r3(C) - 0.5 && d > alvo + 0.5);
  const primeiro = (serie ?? []).find((s) => s.d < r3(C) - 0.01);
  const ultimo = (serie ?? []).find((s) => Math.abs(s.d - alvo) < 0.01);
  const dur = primeiro && ultimo ? ultimo.t - primeiro.t : null;
  checar(
    'sessão acelerada concluída: o anel avança até 300/7200 da meta',
    p1?.arco?.deslocamento === alvo && p1?.arco?.visivel && !p1?.arco?.vazio,
    { deslocamento: p1?.arco?.deslocamento, alvo },
  );
  checar('o arco anda em cerca de 1 s, passando por valores intermediários', meio.length >= 3 && dur >= 600 && dur <= 1600, { dur, meio: meio.length });
  checar(
    'o rodapé, Esta semana e o rótulo do anel mostram os 5 minutos',
    p1?.rodape === 'Concluído: 5 minutos' && JSON.stringify(p1?.semana) === '{"numero":"5","unidade":"minutos"}' &&
      p1?.rotulo === 'Meta diária de 2 horas. Concluído hoje: 5 minutos, 4% da meta.',
    { rodape: p1?.rodape, semana: p1?.semana, rotulo: p1?.rotulo },
  );
  capturar('m27-app-depois.png');
  await fechar(1);

  // Partida 2: os números sobrevivem ao reinício, e o arco não anima de novo.
  await abrir(2);
  const serie2 = await serieDoAnel(1500);
  R.serie2 = serie2;
  const p2 = await progresso();
  R.reaberto = p2;
  const vals2 = [...new Set((serie2 ?? []).map((s) => s.d))];
  checar(
    'partida 2: fechar e reabrir mantém os números',
    p2?.rodape === p1?.rodape && JSON.stringify(p2?.semana) === JSON.stringify(p1?.semana) &&
      JSON.stringify(p2?.ontem) === JSON.stringify(p1?.ontem) && p2?.arco?.deslocamento === alvo,
    { antes: p1 && [p1.rodape, p1.semana, p1.arco.deslocamento], depois: p2 && [p2.rodape, p2.semana, p2.arco.deslocamento] },
  );
  checar('partida 2: o arco já abre no lugar, sem animar', vals2.length === 1 && vals2[0] === alvo, vals2);
  capturar('m27-app-reaberto.png');
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
