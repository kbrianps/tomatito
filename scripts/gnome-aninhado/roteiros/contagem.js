// Roteiro do M16 (laço, IPC e primeira contagem), carregado com
// `gnome-shell --automation-script` pelo dentro.sh. Na janela main de verdade
// (WebKitGTK no Mutter 50, Wayland), com o motor em Rust de verdade:
//   1. iniciar (M17: o seletor em 25 e o clique do ponteiro virtual em
//      "Iniciar sessão de foco"; antes, o botão provisório "Iniciar 25 min") mostra a
//      contagem: o texto anda um segundo por segundo, e o DOM é tocado uma
//      vez por segundo (um MutationObserver conta as trocas);
//   2. minimizar por 6 min e voltar mostra o tempo certo: o texto na volta
//      bate com o get_state e com o relógio do roteiro;
//   3. um "congelamento" de 1 min no meio de um foco de 5 min (SIGSTOP no app
//      e nos processos do WebView, e SIGCONT depois): na volta, o restante já
//      desconta o minuto. É o substituto do `systemctl suspend`, que não pode
//      rodar na sessão do usuário; o passo manual está em
//      docs/verificacao-manual.md (M16);
//   4. com nada rodando, as threads do tokio (onde roda o laço do motor) não
//      gastam CPU em 30 s (/proc/<pid>/task/*/stat); o processo inteiro e a
//      contagem correndo ficam anotados para comparar.
// TT_MINIMIZADA_S (padrão 360) e TT_CONGELADA_S (padrão 60) encurtam os passos
// 2 e 3 para uma rodada rápida. No fim, fecha a janela pelo compositor.
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import 'resource:///org/gnome/shell/ui/screenshot.js'; // promisifica Shell.Screenshot

export const METRICS = {};

const OUT = GLib.getenv('TT_OUT');
const SONDA_LOG = GLib.getenv('SONDA_LOG');
const MINIMIZADA_S = Number(GLib.getenv('TT_MINIMIZADA_S') ?? 360);
const CONGELADA_S = Number(GLib.getenv('TT_CONGELADA_S') ?? 60);
const R = { passos: [], checagens: {}, medidas: {} };

const salvar = () => GLib.file_set_contents(`${OUT}/resultado.json`, JSON.stringify(R, null, 2));
const sleep = (ms) =>
  new Promise((r) => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => (r(), GLib.SOURCE_REMOVE)));
const agoraMs = () => GLib.get_monotonic_time() / 1000;
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
const estado = () => sonda().filter((e) => e.tipo === 'estado').at(-1)?.dados ?? null;

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
  const r = await esperar(() => sonda().find((e) => e.tipo === 'comando' && e.dados.id === id), 10000, `comando ${js}`);
  const texto = JSON.stringify(r.dados.resultado) ?? 'null';
  passo(`comando ${js.slice(0, 120)} => ${texto.length > 300 ? `${texto.slice(0, 300)}…` : texto}`);
  return r.dados.resultado;
}

let ptr;
const agora = () => GLib.get_monotonic_time();
const mover = (x, y) => ptr.notify_absolute_motion(agora(), x, y);
const botao = (apertado) =>
  ptr.notify_button(agora(), Clutter.BUTTON_PRIMARY, apertado ? Clutter.ButtonState.PRESSED : Clutter.ButtonState.RELEASED);
async function clicar(x, y) {
  mover(x, y);
  await sleep(150);
  botao(true);
  await sleep(60);
  botao(false);
  await sleep(300);
}

async function captura(nome, area) {
  const shooter = new Shell.Screenshot();
  const s = Gio.File.new_for_path(`${OUT}/${nome}`).replace(null, false, Gio.FileCreateFlags.NONE, null);
  await shooter.screenshot_area(area.x, area.y, area.w, area.h, s);
  s.close(null);
  passo(`captura ${nome}`);
}

const sh = (cmd) => {
  const [, out] = GLib.spawn_command_line_sync(cmd);
  return new TextDecoder().decode(out).trim();
};
// O app e os processos do WebView (filhos dele), recursivamente.
function arvore(pid) {
  const filhos = sh(`pgrep -P ${pid}`).split('\n').filter(Boolean).map(Number);
  return [pid, ...filhos.flatMap(arvore)];
}
const nome = (pid) => sh(`cat /proc/${pid}/comm`);
// Tempo de CPU (utime + stime, todas as threads) em ticks do relógio.
function cpu(pid) {
  const stat = sh(`cat /proc/${pid}/stat`);
  const campos = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
  return Number(campos[11]) + Number(campos[12]);
}
const HZ = Number(sh('getconf CLK_TCK')) || 100;
// Tempo de CPU de cada thread do processo, somado por nome da thread (as do
// runtime do tokio, onde roda o laço do motor, chamam-se "tokio-rt-worker").
function cpuPorThread(pid) {
  const soma = {};
  for (const tid of sh(`ls /proc/${pid}/task`).split('\n').filter(Boolean)) {
    const stat = sh(`cat /proc/${pid}/task/${tid}/stat`);
    if (!stat) continue;
    const comm = stat.slice(stat.indexOf('(') + 1, stat.lastIndexOf(')'));
    const campos = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
    soma[comm] = (soma[comm] ?? 0) + Number(campos[11]) + Number(campos[12]);
  }
  return soma;
}
// % de um núcleo no processo inteiro e nas threads do tokio, em `s` segundos.
async function medirCpu(pid, s) {
  const antes = cpu(pid);
  const tAntes = cpuPorThread(pid);
  const t0 = agoraMs();
  await sleep(s * 1000);
  const seg = (agoraMs() - t0) / 1000;
  const tDepois = cpuPorThread(pid);
  const pct = (ticks) => Math.round((ticks / HZ / seg) * 10000) / 100;
  const threads = {};
  for (const [k, v] of Object.entries(tDepois)) {
    const d = v - (tAntes[k] ?? 0);
    if (d > 0) threads[k] = pct(d);
  }
  const doTokio = (t) => Object.entries(t).filter(([k]) => k.startsWith('tokio')).reduce((a, [, v]) => a + v, 0);
  return { processo: pct(cpu(pid) - antes), tokio: pct(doTokio(tDepois) - doTokio(tAntes)), threads };
}

// Na página: o texto, a fase, o restante do Rust e as trocas do texto.
const LER =
  "(async () => { const s = await window.__TAURI_INTERNALS__.invoke('get_state'); return { texto: document.querySelector('[data-tempo]').textContent, fase: document.querySelector('[data-fase]').textContent, status: s.focus.status, restanteMs: s.focus.session?.remainingMs ?? null, escritas: window.__ttEscritas ?? null, visivel: document.visibilityState }; })()";
const seg = (texto) => {
  const [m, s] = texto.split(':').map(Number);
  return m * 60 + s;
};
const bate = (l) => Math.abs(seg(l.texto) - Math.ceil(l.restanteMs / 1000)) <= 1;

async function clicarNoBotao(r, seletor) {
  const c = await comando(
    `(() => { const b = document.querySelector('${seletor}'); if (!b || b.hidden) return null; const q = b.getBoundingClientRect(); return [q.x + q.width / 2, q.y + q.height / 2]; })()`,
  );
  if (!c) throw new Error(`botão ausente: ${seletor}`);
  await clicar(r.x + Math.round(c[0]), r.y + Math.round(c[1]));
}

// M17: o seletor de minutos vai até `minutos` pelas setas (eventos do JS no
// campo, que andam de passo em passo; no debug, de 1 em 1), e o ponteiro
// virtual clica em "Iniciar sessão de foco".
async function iniciarSessao(r, minutos) {
  const valor = await comando(
    `(() => { const c = document.querySelector('[data-cartao="sessao"] [role="spinbutton"]'); for (let i = 0; i < 300 && Number(c.getAttribute('aria-valuenow')) !== ${minutos}; i++) { const k = Number(c.getAttribute('aria-valuenow')) < ${minutos} ? 'ArrowUp' : 'ArrowDown'; c.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); } return Number(c.getAttribute('aria-valuenow')); })()`,
  );
  if (valor !== minutos) throw new Error(`o seletor parou em ${valor}, e não em ${minutos}`);
  await clicarNoBotao(r, '[data-cartao="sessao"] [data-iniciar]');
}

async function principal() {
  passo('início');
  const seat = global.stage.context.get_backend().get_default_seat();
  ptr = seat.create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
  await sleep(200);
  mover(960, 1070);
  if (Main.overview.visible) Main.overview.hide();

  const W = (await esperar(() => (janelas().length && rect(janelas()[0]).w > 0 ? janelas() : null), 120000, 'a janela do Tomatito'))[0];
  await esperar(() => estado()?.nav?.itens?.length === 4, 30000, 'o painel desenhado (sonda)');
  if (W.is_maximized()) W.unmaximize();
  W.move_resize_frame(true, 300, 150, 1000, 700);
  await sleep(1000);
  Main.activateWindow(W);
  await sleep(500);
  const r = rect(W);
  const pid = W.get_pid();
  R.medidas.processos = arvore(pid).map((p) => `${nome(p)}#${p}`);

  const inicial = await comando(LER);
  checar('abre ocioso, com 00:00', inicial.status === 'idle' && inicial.texto === '00:00', inicial);
  await comando(
    "(window.__ttEscritas = 0, new MutationObserver((m) => (window.__ttEscritas += m.length)).observe(document.querySelector('[data-tempo]'), { childList: true, characterData: true, subtree: true }), true)",
  );

  // 4a. CPU parado, antes de qualquer sessão.
  await sleep(3000);
  R.medidas.cpuOcioso = await medirCpu(pid, 30);
  passo(`CPU ocioso: ${JSON.stringify(R.medidas.cpuOcioso)}`);

  // 1. Iniciar mostra a contagem.
  await iniciarSessao(r, 25);
  const t0 = agoraMs();
  await sleep(200);
  const logo = await comando(LER);
  await comando('(window.__ttEscritas = 0, true)');
  await sleep(5000);
  const depois = await comando(LER);
  checar('iniciar mostra a contagem (25:00 ou 24:59 logo depois do clique)', ['25:00', '24:59'].includes(logo.texto) && logo.status === 'focus', logo);
  checar('a contagem anda: uns 5 s depois, 24:55 ± 1 s e igual ao Rust', Math.abs(seg(depois.texto) - (1500 - 5)) <= 1 && bate(depois), depois);
  checar('o DOM do tempo é tocado uma vez por segundo (4 a 6 trocas em 5 s)', depois.escritas >= 4 && depois.escritas <= 6, { escritas: depois.escritas });
  checar('a fase aparece', depois.fase === 'Período de foco 1 de 1', depois.fase);
  await captura('m16-contagem.png', r);

  // 4b. CPU com a contagem correndo, para comparar.
  R.medidas.cpuCorrendo = await medirCpu(pid, 15);
  passo(`CPU correndo: ${JSON.stringify(R.medidas.cpuCorrendo)}`);

  // 2. Minimizar por 6 min e voltar.
  W.minimize();
  await sleep(1000);
  const minimizada = await comando(LER);
  R.medidas.minimizada = minimizada;
  await sleep(MINIMIZADA_S * 1000 - 1000);
  W.unminimize();
  Main.activateWindow(W);
  await sleep(300);
  const volta = await comando(LER);
  const esperado = 1500 - (agoraMs() - t0) / 1000;
  checar(`minimizada ${MINIMIZADA_S} s: na volta, o texto bate com o Rust`, bate(volta) && volta.status === 'focus', volta);
  checar(`minimizada ${MINIMIZADA_S} s: o texto bate com o relógio do roteiro (± 2 s)`, Math.abs(seg(volta.texto) - esperado) <= 2, { texto: volta.texto, esperado: Math.round(esperado) });
  await captura('m16-volta.png', r);

  // 3. Congelar 1 min num foco de 5 min.
  await clicarNoBotao(r, 'button[data-acao="parar"]');
  await iniciarSessao(r, 5);
  const c0 = agoraMs();
  await sleep(10000);
  const pids = arvore(pid);
  sh(`kill -STOP ${pids.join(' ')}`);
  passo(`congelados: ${pids.join(' ')}`);
  await sleep(CONGELADA_S * 1000);
  sh(`kill -CONT ${pids.join(' ')}`);
  await sleep(700);
  const descongelado = await comando(LER);
  const esperadoC = 300 - (agoraMs() - c0) / 1000;
  checar(`congelado ${CONGELADA_S} s num foco de 5 min: o restante desconta o tempo parado (± 2 s)`, Math.abs(seg(descongelado.texto) - esperadoC) <= 2 && bate(descongelado), { ...descongelado, esperado: Math.round(esperadoC) });
  // O tick do Rust depois da volta já traz o restante certo: sem o JS pedir
  // nada, dois segundos depois o texto continua batendo.
  await sleep(2000);
  const seguinte = await comando(LER);
  checar('dois segundos depois, continua batendo com o Rust', bate(seguinte), seguinte);

  // 4c. Parar e medir o CPU parado.
  await clicarNoBotao(r, 'button[data-acao="parar"]');
  const parado = await comando(LER);
  checar('encerrar volta ao ocioso', parado.status === 'idle' && parado.texto === '00:00', parado);
  await sleep(3000);
  R.medidas.cpuParado = await medirCpu(pid, 30);
  passo(`CPU parado: ${JSON.stringify(R.medidas.cpuParado)}`);
  // O processo inteiro leva o custo do próprio teste (WAYLAND_DEBUG no
  // stderr e a sonda, que consulta a página a cada 100 ms); o critério vale
  // para as threads do tokio, onde roda o laço. A medida sem o teste, com o
  // top, fica em docs/verificacao-manual.md (M16).
  checar('parado, as threads do tokio (o laço) não gastam CPU (0 ticks em 30 s)', R.medidas.cpuParado.tokio === 0 && R.medidas.cpuOcioso.tokio === 0, {
    ocioso: R.medidas.cpuOcioso,
    correndo: R.medidas.cpuCorrendo,
    parado: R.medidas.cpuParado,
  });

  const erros = sonda().filter((x) => x.tipo === 'erro').map((x) => x.dados);
  checar('nenhum erro na página', erros.length === 0, erros);
  W.delete(global.get_current_time());
  await sleep(1500);
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
