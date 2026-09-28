// Roteiro do M40 (Retomada), carregado com `gnome-shell --automation-script`
// pelo dentro.sh. Abre o app sozinho quatro vezes (LANCA_O_APP), sem saída de
// áudio (ALSA sem configuração: um som pedido vira uma linha "[tomatito] som:"
// no registro, e nada toca na máquina). O relógio é o de verdade (1×): o
// TOMATITO_SPEED não serve aqui, porque o relógio acelerado recomeça do
// relógio de parede a cada abertura (docs/decisoes.md, M40).
//   partida 1: uma sessão de 3 min, o temporizador "Chá · 5 min" correndo e o
//     cronômetro correndo com uma volta; o "Testar" (sound_test) mostra que o
//     registro acusa um som pedido; `kill -9` (SIGKILL) no meio do foco;
//   partida 2: a sessão continua no tempo certo (o mesmo prazo, e o mostrador
//     da tela Foco com os minutos certos), e os temporizadores e o cronômetro
//     voltam como estavam; nenhum som nem aviso ao abrir. Depois: encerra a
//     sessão, começa uma de 1 min e um temporizador "Ovo · 5 s", e `kill -9`;
//     espera a fase vencer há mais de 60 s;
//   partida 3: o período de 1 min gravado (o "Concluído" de hoje sobe 60 s),
//     o aviso "Sessão concluída às HH:MM" (a hora do prazo) e o do "Ovo",
//     nenhum som pedido; o foco concluído; "Sair" (app_quit);
//   partida 4: fechar e reabrir: a lista de temporizadores e o cronômetro em
//     andamento voltam iguais (o mesmo startedAt e as voltas); "Sair".
// O resumo-retomada.mjs confere as checagens e os logs.
//
//   TT_LIMITE=480 bash scripts/gnome-aninhado/rodar.sh retomada
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export const METRICS = {};
export const LANCA_O_APP = true;

const OUT = GLib.getenv('TT_OUT');
const BIN = GLib.getenv('TOMATITO_BIN');
const SONDA_LOG = GLib.getenv('SONDA_LOG');
const R = { passos: [], checagens: {}, partidas: [] };

const salvar = () => GLib.file_set_contents(`${OUT}/resultado.json`, JSON.stringify(R, null, 2));
const sleep = (ms) =>
  new Promise((r) => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => (r(), GLib.SOURCE_REMOVE)));
const agoraMs = () => Math.round(GLib.get_real_time() / 1000);
const passo = (m) => {
  R.passos.push(`${agoraMs()} ${m}`);
  salvar();
};
const checar = (nome, ok, detalhe) => {
  R.checagens[nome] = { ok: Boolean(ok), detalhe };
  passo(`${ok ? 'ok' : 'FALHA'}: ${nome}`);
};

function lerTexto(arq) {
  try {
    const [, bytes] = GLib.file_get_contents(arq);
    return new TextDecoder().decode(bytes);
  } catch {
    return '';
  }
}
const sonda = () =>
  lerTexto(SONDA_LOG)
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
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
  passo(`comando ${js.slice(0, 100)} => ${texto.length > 300 ? `${texto.slice(0, 300)}…` : texto}`);
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
// O state.json da pasta de dados do app (a desta rodada, isolada).
function estadoNoDisco() {
  const base = GLib.get_user_data_dir();
  let it;
  try {
    it = Gio.File.new_for_path(base).enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
  } catch {
    return null;
  }
  for (let info = it.next_file(null); info; info = it.next_file(null)) {
    if (!/tomatito/i.test(info.get_name())) continue;
    const texto = lerTexto(`${base}/${info.get_name()}/state.json`);
    if (texto) return JSON.parse(texto);
  }
  return null;
}

let proc = null;
let pid = null;
const janelaDoApp = () =>
  global.get_window_actors().map((a) => a.meta_window).find((w) => String(w.get_pid()) === String(pid) && w.get_title() === 'Tomatito');
function esperarProcesso(p, ms) {
  return new Promise((resolve) => {
    let feito = false;
    const fim = (v) => !feito && ((feito = true), resolve(v));
    p.wait_async(null, () => fim(true));
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => (fim(false), GLib.SOURCE_REMOVE));
  });
}
const codigoDe = (p) => (p.get_if_exited() ? p.get_exit_status() : p.get_if_signaled() ? `sinal ${p.get_term_sig()}` : null);

async function abrir(i) {
  const antes = sonda().filter((e) => e.tipo === 'estado').length;
  const L = new Gio.SubprocessLauncher({ flags: Gio.SubprocessFlags.STDERR_MERGE });
  L.setenv('WAYLAND_DISPLAY', 'tt-aninhado', true);
  L.setenv('GDK_BACKEND', 'wayland', true);
  // Sem saída de áudio: nada toca na máquina de quem roda.
  L.setenv('ALSA_CONFIG_PATH', '/dev/null', true);
  L.unsetenv('TOMATITO_SPEED');
  L.set_stdout_file_path(`${OUT}/app-${i}.log`);
  proc = L.spawnv([BIN]);
  pid = proc.get_identifier();
  passo(`partida ${i}: pid ${pid}`);
  const W = await esperar(() => { const w = janelaDoApp(); return w && w.get_frame_rect().width > 0 ? w : null; }, 60000, `a janela da partida ${i}`);
  await esperar(() => sonda().filter((e) => e.tipo === 'estado').length > antes, 30000, 'a sonda da página');
  if (W.is_maximized()) W.unmaximize();
  W.move_resize_frame(true, 300, 100, 1000, 800);
  if (Main.overview.visible) Main.overview.hide();
  Main.activateWindow(W);
  await sleep(600);
}

// A sonda de uma página nova roda o comando.json que ainda não viu: sem
// limpar, o `app_quit` da partida anterior fecharia a seguinte ao abrir.
const limparComando = () => GLib.file_set_contents(`${OUT}/comando.json`, '{}');

// SIGKILL: o `kill -9` do "Pronto quando".
async function matar(i) {
  proc.force_exit();
  limparComando();
  await esperarProcesso(proc, 10000);
  const codigo = codigoDe(proc);
  R.partidas.push({ partida: i, codigo });
  checar(`partida ${i}: kill -9 (SIGKILL)`, codigo === 'sinal 9', codigo);
}
async function sair(i) {
  invoke('app_quit').catch(() => {});
  const saiu = await esperarProcesso(proc, 10000);
  limparComando();
  const codigo = saiu ? codigoDe(proc) : 'não saiu';
  R.partidas.push({ partida: i, codigo });
  checar(`partida ${i}: "Sair" fecha com código 0`, codigo === 0, codigo);
  if (!saiu) proc.force_exit();
}

const irPara = async (hash) => {
  await comando(`(location.hash = '${hash}', 'ok')`);
  await sleep(700);
};
// O que a tela Foco mostra no cartão da sessão.
const LER_FOCO = `(() => { const c = document.querySelector('[data-cartao="sessao"]'); return { modo: c?.dataset.modo ?? null,
  minutos: Number(c?.querySelector('[data-minutos]')?.textContent), rotulo: c?.querySelector('[data-mostrador]')?.getAttribute('aria-label') ?? null }; })()`;
const LER_TEMPORIZADORES = `[...document.querySelectorAll('[data-temporizador]')].map((el) => ({ id: Number(el.dataset.temporizador), titulo: el.querySelector('h2').textContent, estado: el.dataset.estado }))`;
const LER_CRONOMETRO = `({ estado: document.querySelector('[data-cronometro]')?.dataset.estado ?? null })`;
const resumoTemporizadores = (t) => t.timers.map((x) => `${x.id}:${x.name}:${x.durationMs}:${x.status}:${x.endsAt ?? '-'}:${x.ended}`).join('|');
const resumoCronometro = (c) => `${c.status}:${c.startedAt}:${c.accumulatedMs}:${c.laps.join(',')}`;
const logDe = (i) => lerTexto(`${OUT}/app-${i}.log`);
const sons = (log) => log.split('\n').filter((l) => l.includes('[tomatito] som:'));
const avisos = (log) => log.split('\n').filter((l) => l.includes('[tomatito] notificação:'));
const horaLocal = (ms) => GLib.DateTime.new_from_unix_local(Math.floor(ms / 1000)).format('%H:%M');

async function principal() {
  passo('início');
  Main.messageTray.bannerBlocked = true;
  new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' }).set_boolean('enable-animations', false);
  if (Main.overview.visible) Main.overview.hide();
  limparDadosDoApp();

  // ===== Partida 1 =====
  await abrir(1);
  const e1 = await invoke('focus_start', { minutes: 3 });
  const criado = await invoke('timer_create', { name: 'Chá', durationMs: 300000 });
  const cha = criado.timers.find((t) => t.name === 'Chá');
  await invoke('timer_start', { id: cha.id });
  await invoke('stopwatch_start');
  await sleep(1500);
  await invoke('stopwatch_lap');
  await invoke('sound_test');
  await sleep(2500);
  const antes = await invoke('get_state');
  const disco1 = estadoNoDisco();
  checar(
    'partida 1: o state.json tem a sessão correndo, o "Chá" e o cronômetro',
    disco1?.focus?.session?.status === 'running' && disco1.focus.session.endsAt === e1.session.endsAt &&
      disco1.timers?.some((t) => t.name === 'Chá' && t.status === 'running') && disco1.stopwatch?.status === 'running',
    disco1,
  );
  checar('partida 1: o registro acusa um som pedido (controle: "Testar")', sons(logDe(1)).length > 0, sons(logDe(1)));
  await matar(1);
  const mortoEm = agoraMs();
  await sleep(6000);

  // ===== Partida 2 =====
  await abrir(2);
  const depois = await invoke('get_state');
  const lidoEm = agoraMs();
  const s1 = antes.focus.session;
  const s2 = depois.focus.session;
  const fechado = depois.focus.at - antes.focus.at;
  checar(
    'partida 2: a sessão continua no tempo certo (mesma sessão, mesmo prazo, e o tempo fechado descontado)',
    depois.focus.status === 'focus' && s2.id === s1.id && s2.endsAt === s1.endsAt &&
      s2.remainingMs === s2.endsAt - depois.focus.at && Math.abs(s1.remainingMs - fechado - s2.remainingMs) <= 5 &&
      fechado >= 6000 && Math.abs(depois.focus.at - lidoEm) < 2000,
    { antes: s1, depois: s2, fechadoMs: fechado, mortoHaMs: lidoEm - mortoEm },
  );
  await irPara('#/foco');
  const tela = await comando(LER_FOCO);
  const minutosEsperados = Math.ceil(s2.remainingMs / 60000);
  checar(
    'partida 2: a tela Foco mostra a sessão em andamento, com os minutos que faltam',
    tela.modo === 'andamento' && Math.abs(tela.minutos - minutosEsperados) <= 1,
    { tela, minutosEsperados },
  );
  checar(
    'partida 2: os temporizadores voltam iguais (o "Chá" correndo com o mesmo prazo)',
    resumoTemporizadores(depois.timers) === resumoTemporizadores(antes.timers) &&
      depois.timers.timers.some((t) => t.name === 'Chá' && t.status === 'running'),
    { antes: resumoTemporizadores(antes.timers), depois: resumoTemporizadores(depois.timers) },
  );
  checar(
    'partida 2: o cronômetro continua correndo, com a volta e o tempo fechado contado',
    resumoCronometro(depois.stopwatch) === resumoCronometro(antes.stopwatch) && depois.stopwatch.status === 'running' &&
      depois.stopwatch.laps.length === 1 && depois.stopwatch.elapsedMs >= antes.stopwatch.elapsedMs + fechado - 5,
    { antes: antes.stopwatch, depois: depois.stopwatch },
  );
  await irPara('#/temporizador');
  const cards = await comando(LER_TEMPORIZADORES);
  checar('partida 2: a tela Temporizador mostra o "Chá" correndo', cards.some((c) => c.titulo === 'Chá' && c.estado === 'running'), cards);
  await irPara('#/cronometro');
  const crono = await comando(LER_CRONOMETRO);
  checar('partida 2: a tela Cronômetro mostra o cronômetro correndo', crono.estado === 'running', crono);
  checar('partida 2: nenhum som nem aviso ao abrir (nada venceu)', sons(logDe(2)).length === 0 && avisos(logDe(2)).length === 0, [...sons(logDe(2)), ...avisos(logDe(2))]);

  // O caso atrasado: uma sessão de 1 min e um temporizador de 5 s, e o app
  // fechado até a fase vencer há mais de 60 s.
  await invoke('focus_stop');
  const base = await invoke('stats_get');
  const curta = await invoke('focus_start', { minutes: 1 });
  const ovo = (await invoke('timer_create', { name: 'Ovo', durationMs: 5000 })).timers.find((t) => t.name === 'Ovo');
  const ovoRodando = await invoke('timer_start', { id: ovo.id });
  const prazoOvo = ovoRodando.timers.find((t) => t.id === ovo.id).endsAt;
  await sleep(1500);
  const antes3 = await invoke('get_state');
  await matar(2);
  const prazo = curta.session.endsAt;
  passo(`esperando o prazo (${horaLocal(prazo)}) vencer há mais de 60 s`);
  while (agoraMs() < prazo + 66000) await sleep(1000);

  // ===== Partida 3 =====
  await abrir(3);
  const e3 = await invoke('get_state');
  const stats = await invoke('stats_get');
  await sleep(1500);
  const log3 = logDe(3);
  checar(
    'partida 3: o período de 1 min gravado (o "Concluído" de hoje sobe 60 s) e a sessão concluída',
    e3.focus.status === 'completed' && e3.focus.session?.id === curta.session.id && stats.todayS - base.todayS === 60 &&
      e3.focus.session.completedAt === prazo,
    { status: e3.focus.status, completedAt: e3.focus.session?.completedAt, prazo, hoje: [base.todayS, stats.todayS] },
  );
  const esperado = `[tomatito] notificação: Sessão concluída às ${horaLocal(prazo)} |`;
  checar(`partida 3: avisa "Sessão concluída às ${horaLocal(prazo)}", uma vez`, avisos(log3).filter((l) => l.includes(esperado)).length === 1, avisos(log3));
  checar(
    `partida 3: o "Ovo" que zerou fechado avisa "Temporizador encerrado às ${horaLocal(prazoOvo)}", sem tocar de novo depois`,
    avisos(log3).filter((l) => l.includes(`Temporizador encerrado às ${horaLocal(prazoOvo)}`)).length === 1 &&
      e3.timers.timers.find((t) => t.id === ovo.id)?.ended === true,
    avisos(log3),
  );
  checar('partida 3: nenhum som pedido (atrasado: sem som)', sons(log3).length === 0, sons(log3));
  const prazoCha = antes.timers.timers.find((t) => t.name === 'Chá').endsAt;
  checar(
    'partida 3: o "Chá" e o cronômetro continuam',
    resumoCronometro(e3.stopwatch) === resumoCronometro(antes3.stopwatch) &&
      e3.timers.timers.find((t) => t.name === 'Chá')?.endsAt === prazoCha,
    { cronometro: [resumoCronometro(antes3.stopwatch), resumoCronometro(e3.stopwatch)], prazoCha },
  );
  const lista3 = resumoTemporizadores(e3.timers);
  await sair(3);
  await sleep(1000);

  // ===== Partida 4: fechar e reabrir =====
  await abrir(4);
  const e4 = await invoke('get_state');
  checar(
    'partida 4: a lista de temporizadores volta igual depois de fechar e reabrir',
    resumoTemporizadores(e4.timers) === lista3 && e4.timers.timers.some((t) => t.name === 'Chá') && e4.timers.timers.some((t) => t.name === 'Ovo'),
    { antes: lista3, depois: resumoTemporizadores(e4.timers) },
  );
  checar(
    'partida 4: o cronômetro em andamento volta correndo, com o mesmo início e as voltas',
    e4.stopwatch.status === 'running' && resumoCronometro(e4.stopwatch) === resumoCronometro(e3.stopwatch),
    { antes: resumoCronometro(e3.stopwatch), depois: resumoCronometro(e4.stopwatch) },
  );
  checar('partida 4: o foco abre ocioso (o "Sair" encerrou a sessão concluída)', ['idle', 'completed'].includes(e4.focus.status), e4.focus.status);
  const erros = sonda().filter((x) => x.tipo === 'erro').map((x) => x.dados);
  checar('nenhum erro na página', erros.length === 0, erros);
  await sair(4);
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
