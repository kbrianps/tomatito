// Roteiro do M18 (mostrador em foco), carregado com
// `gnome-shell --automation-script` pelo dentro.sh. Na janela main de verdade
// (WebKitGTK no Mutter 50, Wayland), com o motor em Rust de verdade e o
// relógio acelerado (rodar com TOMATITO_SPEED=60: 1 min passa em 1 s):
//   1. o seletor vai a 25 (no debug, de 1 em 1) e o ponteiro virtual clica
//      em "Iniciar sessão de foco": o cartão mostra o mostrador, com o
//      cabeçalho "Período de foco (1 de 1)", 25 min e o traço 0 aceso;
//   2. durante uns 10 s, o traço aceso avança (um traço a cada 1/24 da fase,
//      62,5 s de motor, ~1 s aqui), sem voltar, e o número desce, batendo
//      com o restante do get_state;
//   3. o ponteiro clica no "..." e em "Encerrar sessão": o Rust volta ao
//      ocioso e o cartão, ao "Pronto para focar".
// No fim, fecha a janela pelo compositor.
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import 'resource:///org/gnome/shell/ui/screenshot.js'; // promisifica Shell.Screenshot

export const METRICS = {};

const OUT = GLib.getenv('TT_OUT');
const SONDA_LOG = GLib.getenv('SONDA_LOG');
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

// Na página: o mostrador (medidas.js, colado na sonda) e o estado do Rust.
const LER =
  "(async () => { const s = await window.__TAURI_INTERNALS__.invoke('get_state'); return { ...window.__ttMostrador(), status: s.focus.status, restanteMs: s.focus.session?.remainingMs ?? null, velocidade: s.speed }; })()";

async function clicarNoBotao(r, seletor) {
  const c = await comando(
    `(() => { const b = document.querySelector('${seletor}'); if (!b || b.closest('[hidden]')) return null; const q = b.getBoundingClientRect(); if (!q.width) return null; return [q.x + q.width / 2, q.y + q.height / 2]; })()`,
  );
  if (!c) throw new Error(`elemento ausente: ${seletor}`);
  await clicar(r.x + Math.round(c[0]), r.y + Math.round(c[1]));
}

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

  const inicial = await comando(LER);
  checar('abre ocioso, no preparo, com o relógio acelerado (TOMATITO_SPEED=60)', inicial.status === 'idle' && inicial.modo === 'preparo' && inicial.velocidade === 60, {
    status: inicial.status,
    modo: inicial.modo,
    velocidade: inicial.velocidade,
  });

  // 1. Iniciar 25 min pelo cartão.
  await iniciarSessao(r, 25);
  await sleep(150);
  const logo = await comando(LER);
  checar(
    'iniciar mostra o mostrador: "Período de foco (1 de 1)", 25 min (ou 24), traço 0 ou 1',
    logo.status === 'focus' && logo.modo === 'andamento' && logo.titulo === 'Período de foco (1 de 1)' && [25, 24].includes(logo.minutos) && logo.aceso[0] <= 1,
    { titulo: logo.titulo, minutos: logo.minutos, aceso: logo.aceso, rotulo: logo.rotulo },
  );
  checar('o rótulo do role="img" diz os minutos e a fase', /^2[45] minutos restantes, período de foco 1 de 1$/.test(logo.rotulo) && logo.papel === 'img', logo.rotulo);

  // 2. O traço avança por uns 10 s (10 min de motor: traços 0 a ~9).
  const serie = [];
  for (let i = 0; i < 20; i++) {
    const l = await comando(LER);
    serie.push({ t: Math.round(agoraMs()), minutos: l.minutos, aceso: l.aceso[0], restanteMs: l.restanteMs, status: l.status });
    if (i === 10) await captura('m18-mostrador.png', r);
    await sleep(500);
  }
  R.medidas.serie = serie;
  const acesos = serie.map((s) => s.aceso);
  const distintos = [...new Set(acesos)];
  checar(
    'o traço aceso avança sem voltar (6 ou mais traços diferentes em ~10 s)',
    distintos.length >= 6 && acesos.every((v, i) => !i || v >= acesos[i - 1]) && serie.every((s) => s.status === 'focus'),
    distintos,
  );
  const esperado = (s) => Math.max(0, Math.min(23, Math.floor(((1500_000 - s.restanteMs) / 1500_000) * 24)));
  checar(
    'o número e o traço batem com o restante do Rust (± 1)',
    serie.every((s) => Math.abs(s.minutos - Math.ceil(s.restanteMs / 60000)) <= 1 && Math.abs(s.aceso - esperado(s)) <= 1),
    serie.map((s) => `${s.minutos}/${s.aceso}/${Math.round(s.restanteMs / 1000)}s`),
  );
  checar('o número desce', serie.at(-1).minutos < serie[0].minutos - 4, [serie[0].minutos, serie.at(-1).minutos]);

  // 3. O menu encerra a sessão, com o ponteiro.
  await clicarNoBotao(r, '[data-cartao="sessao"] [data-mais]');
  await sleep(400);
  const aberto = await comando('window.__ttMostrador()');
  await captura('m18-menu.png', r);
  checar('o "..." abre o menu com "Encerrar sessão" e "Pular intervalo" (desabilitado no foco)', aberto.menuAberto && aberto.itens.map((i) => `${i.texto}${i.desabilitado ? ' (desabilitado)' : ''}`).join(', ') === 'Encerrar sessão, Pular intervalo (desabilitado)', aberto.itens);
  await clicarNoBotao(r, '[data-cartao="sessao"] fluent-menu-item[data-item="parar"]');
  await sleep(500);
  const fim = await comando(LER);
  checar('"Encerrar sessão" encerra: o Rust volta ao ocioso e o cartão ao preparo', fim.status === 'idle' && fim.modo === 'preparo' && fim.titulo === 'Pronto para focar' && !fim.menuAberto, {
    status: fim.status,
    modo: fim.modo,
    titulo: fim.titulo,
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
