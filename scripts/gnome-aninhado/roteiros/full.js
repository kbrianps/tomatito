// Roteiro do M51 (alternar para o Full e de volta), carregado com
// `gnome-shell --automation-script` pelo dentro.sh. O roteiro abre o app
// sozinho (duas partidas), com o binário de debug e o motor de verdade:
//
//   TT_PORT=5174 bash scripts/gnome-aninhado/rodar.sh full   # binário compilado para a 5174
//   TT_CICLOS=5 ...                                          # menos idas e voltas (padrão 20)
//   TT_CONTROLE=tomate-lento TT_CICLOS=3 ...                 # a página do tomate atrasada 2,5 s: o limite de 2 s em toda ida, e tudo ok
//   TT_CONTROLE=aviso-cedo TT_CICLOS=3 ...                   # controle negativo: "sem vazio" e "o tomate pintado" falham
//
// O "Pronto quando" do M51, no que dá para medir sem um humano:
//   1. 20 idas e voltas, com uma sessão de foco correndo: a ida pelo clique
//      em "Tomatito Full" (Configurações > Aparência), a volta alternando o
//      Esc e o botão "Voltar ao modo normal" do tomate. Em cada uma:
//      - sem clarão: cada quadro que o compositor pintou do tomate (do
//        primeiro até 1,5 s depois dele e da main sumir) tem os quatro cantos
//        transparentes, e cada quadro da main que volta não tem um branco ou
//        um preto que não é do tema (a janela é capturada pelo ator, com o
//        canal alfa, como no roteiro partida-a-frio);
//      - sem vazio: a main só some com o tomate já pintado, mesmo quando a
//        página passa do limite de 2 s (docs/decisoes.md, M51, item 13);
//      - o aviso tt://tomato-ready de cada ida, lido no app.log (build de
//        debug): a tempo, depois do limite ou ausente;
//      - só uma janela no fim de cada troca (a outra escondida ou fechada);
//      - sem zerar o timer: a mesma sessão, o mesmo endsAt, e o tempo do
//        tomate igual ao do motor;
//      - sem crash: o processo segue vivo, e o app.log sem pânico;
//   2. a memória fica estável: a soma do RSS do app e dos processos do
//      WebKit (a árvore de processos do app) antes e depois das 20 idas e
//      voltas cresce menos de 10%;
//   3. com o Full ativo, Configurações (no tomate) mostra a main, e escolher
//      Claro ali fecha a tomato e deixa a main em Claro;
//   4. iniciar direto no Full: com theme = full no settings.json, a partida
//      seguinte cria só a tomato; o botão Configurações cria a main já em
//      #/configuracoes, no tema normal; o Esc volta ao tema normal.
export const LANCA_O_APP = true;

import Clutter from 'gi://Clutter';
import GdkPixbuf from 'gi://GdkPixbuf';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export const METRICS = {};

const OUT = GLib.getenv('TT_OUT');
const SONDA_LOG = GLib.getenv('SONDA_LOG');
const BIN = GLib.getenv('TOMATITO_BIN');
const CICLOS = Number(GLib.getenv('TT_CICLOS') || 20);
const LADO = 280;
const K = LADO / 320;
const QUADROS_MS = 1500;
// O vazio: quanto tempo o compositor mostrou a tela sem nenhuma das duas
// janelas (a main já fora e o tomate ainda sem pintar). Zero quando o tomate
// pintado entra na primeira pintura do palco sem a main; senão, o tempo entre
// o sumiço da main e o primeiro quadro pintado. Folga de dois quadros a 60 Hz.
const FOLGA_DO_VAZIO_MS = 34;
const R = { passos: [], checagens: {}, medidas: { ciclos: [] } };

const salvar = () => GLib.file_set_contents(`${OUT}/resultado.json`, JSON.stringify(R, null, 2));
const sleep = (ms) => new Promise((r) => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => (r(), GLib.SOURCE_REMOVE)));
const agora = () => GLib.get_monotonic_time();
const agoraMs = () => agora() / 1000;
const passo = (m) => {
  R.passos.push(`${Math.round(agoraMs())} ${m}`);
  salvar();
};
const checar = (nome, ok, detalhe) => {
  R.checagens[nome] = { ok: Boolean(ok), detalhe };
  passo(`${ok ? 'ok' : 'FALHA'}: ${nome}`);
};

// A sonda, lida aos pedaços (o arquivo cresce a rodada inteira).
let sondaLida = 0;
const eventos = [];
function sonda() {
  try {
    const [, bytes] = GLib.file_get_contents(SONDA_LOG);
    if (bytes.length > sondaLida) {
      const novo = new TextDecoder().decode(bytes.slice(sondaLida));
      const fim = novo.lastIndexOf('\n');
      if (fim >= 0) {
        for (const l of novo.slice(0, fim).split('\n').filter(Boolean)) {
          try {
            eventos.push(JSON.parse(l));
          } catch {
            // linha cortada
          }
        }
        sondaLida += new TextEncoder().encode(novo.slice(0, fim + 1)).length;
      }
    }
  } catch {
    // ainda sem arquivo
  }
  return eventos;
}
const infos = (janela) => sonda().filter((e) => e.tipo === 'info' && e.janela === janela).length;

async function esperar(fn, ms, oque) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const v = await fn();
    if (v) return v;
    await sleep(50);
  }
  throw new Error(`tempo esgotado: ${oque}`);
}

// Um comando para a página de uma das janelas (sonda.js). Depois de cada um,
// o arquivo fica vazio: uma página nova (outra tomato) não repete o último.
let nComando = 0;
async function comando(janela, js, prazo = 10000) {
  const id = `c${++nComando}`;
  GLib.file_set_contents(`${OUT}/comando.json`, JSON.stringify({ id, janela, js }));
  let r;
  try {
    r = await esperar(() => sonda().find((e) => e.tipo === 'comando' && e.dados.id === id), prazo, `comando (${janela}) ${js.slice(0, 80)}`);
  } finally {
    GLib.file_set_contents(`${OUT}/comando.json`, '{}');
  }
  return r.dados.resultado;
}
const ipc = (janela, cmd, args = {}) =>
  comando(janela, `window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args)}).then((r) => JSON.stringify(r ?? null), (e) => 'erro: ' + JSON.stringify(e))`).then(
    (t) => (typeof t === 'string' && !t.startsWith('erro') ? JSON.parse(t) : t),
  );

const LER_TOMATE = `JSON.stringify({ agora: Date.now(), estado: document.querySelector('.stage')?.dataset.state,
  tempo: document.querySelector('[data-tempo]')?.textContent, tema: document.documentElement.dataset.theme,
  pref: document.documentElement.dataset.themePref, tamanho: [innerWidth, innerHeight] })`;
const LER_MAIN = `JSON.stringify({ hash: location.hash, pref: document.documentElement.dataset.themePref,
  tema: document.documentElement.dataset.theme, visivel: document.visibilityState })`;
const faixaDe = (xs) => (xs.every(Number.isFinite) && xs.length ? [Math.min(...xs), Math.max(...xs)] : null);
const segundos = (mmss) => {
  const [m, s] = mmss.split(':').map(Number);
  return m * 60 + s;
};

// Janelas do app: a tomato tem 280 × 280; a main, o resto.
const doApp = () =>
  global.get_window_actors().map((a) => a.meta_window).filter((w) => w.get_title() === 'Tomatito' && w.get_frame_rect().width > 0);
const eTomate = (w) => w.get_frame_rect().width === LADO && w.get_frame_rect().height === LADO;
const tomate = () => doApp().find(eTomate) ?? null;
const main = () => doApp().find((w) => !eTomate(w)) ?? null;
const rect = (w) => {
  const r = w.get_frame_rect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
};

let ptr;
let kb;
const mover = (x, y) => ptr.notify_absolute_motion(agora(), x, y);
const botao = (apertado) =>
  ptr.notify_button(agora(), Clutter.BUTTON_PRIMARY, apertado ? Clutter.ButtonState.PRESSED : Clutter.ButtonState.RELEASED);
// O instante do último clique ou tecla: as trocas contam o tempo a partir dele.
let acao = 0;
async function clicar(x, y) {
  mover(x - 8, y - 8);
  await sleep(120);
  mover(x, y);
  await sleep(120);
  acao = agoraMs();
  botao(true);
  await sleep(60);
  botao(false);
}
async function tecla(keyval) {
  acao = agoraMs();
  kb.notify_keyval(agora(), keyval, Clutter.KeyState.PRESSED);
  await sleep(40);
  kb.notify_keyval(agora(), keyval, Clutter.KeyState.RELEASED);
}
async function semVisaoGeral() {
  for (let i = 0; i < 20 && (Main.overview.visible || Main.overview.animationInProgress); i++) {
    if (!Main.overview.animationInProgress) Main.overview.hide();
    await sleep(300);
  }
}

// Quadros das janelas que nascem depois de `ligar()`: cada after-paint do
// palco, o conteúdo do ator (com o alfa) vai para um PNG, sem repetidos.
function gravarQuadros(rotulo) {
  // `ate`: quem grava pode estender a captura até um instante (agoraMs).
  const G = { janelas: [], ativo: true, ate: 0, pinturas: 0 };
  const seguir = (w) => {
    const J = { w, quadros: [], temQuadro: false, ator: null, soma: null, t0: agoraMs() };
    G.janelas.push(J);
    const pegar = () => {
      J.ator = w.get_compositor_private();
      if (!J.ator) return GLib.SOURCE_CONTINUE;
      J.ator.connect('first-frame', () => {
        J.temQuadro = true;
        J.primeiro = Math.round(agoraMs() - G.t0);
        try {
          const ws = global.display.sort_windows_by_stacking(doApp());
          J.pilha = ws.map((x) => `${eTomate(x) ? 'tomate' : 'main'}@${JSON.stringify(rect(x))}`);
          const f = global.display.focus_window;
          J.foco = f ? (eTomate(f) ? 'tomate' : f.get_title()) : null;
        } catch (e) {
          J.pilha = String(e);
        }
      });
      return GLib.SOURCE_REMOVE;
    };
    if (pegar() === GLib.SOURCE_CONTINUE) GLib.idle_add(GLib.PRIORITY_HIGH, pegar);
  };
  let pendente = false;
  const capturar = () => {
    pendente = false;
    if (!G.ativo) return;
    for (const J of G.janelas) {
      if (!J.temQuadro || !J.ator || J.fim) continue;
      if (agoraMs() - G.t0 - (J.primeiro ?? 0) > QUADROS_MS && !(agoraMs() <= G.ate)) continue;
      let img = null;
      try {
        img = J.ator.get_image(null);
      } catch {
        continue;
      }
      if (!img) continue;
      const arq = `${OUT}/q-${rotulo}-${G.janelas.indexOf(J)}-${J.quadros.length}.png`;
      img.writeToPNG(arq);
      const [, bytes] = GLib.file_get_contents(arq);
      const soma = GLib.compute_checksum_for_data(GLib.ChecksumType.MD5, bytes);
      if (soma === J.soma) {
        Gio.File.new_for_path(arq).delete(null);
        continue;
      }
      J.soma = soma;
      J.quadros.push({ t: Math.round(agoraMs() - G.t0), pintura: G.pinturas, arq });
    }
  };
  G.t0 = agoraMs();
  G.idCriada = global.display.connect('window-created', (_d, w) => seguir(w));
  G.idPintura = global.stage.connect('after-paint', () => {
    G.pinturas++;
    if (pendente || !G.ativo) return;
    pendente = true;
    GLib.idle_add(GLib.PRIORITY_HIGH, () => (capturar(), GLib.SOURCE_REMOVE));
  });
  G.parar = () => {
    G.ativo = false;
    global.display.disconnect(G.idCriada);
    global.stage.disconnect(G.idPintura);
  };
  return G;
}

function pixels(arq) {
  const pb = GdkPixbuf.Pixbuf.new_from_file(arq);
  return { pb, w: pb.get_width(), h: pb.get_height(), n: pb.get_n_channels(), rs: pb.get_rowstride(), px: pb.get_pixels() };
}
// Tomate: o maior alfa em cada canto (16 × 16) e no meio do corpo.
function analisarTomate(arq) {
  const { w, h, n, rs, px } = pixels(arq);
  const alfa = (x, y) => (n === 4 ? px[y * rs + x * n + 3] : 255);
  const B = 16;
  const cantos = [[0, 0], [w - B, 0], [0, h - B], [w - B, h - B]].map(([ox, oy]) => {
    let max = 0;
    for (let y = oy; y < oy + B; y++) for (let x = ox; x < ox + B; x++) max = Math.max(max, alfa(x, y));
    return max;
  });
  return { w, h, cantos, corpo: alfa(Math.round(100 * K), Math.round(230 * K)) };
}
// Main: a fração de branco puro e de preto (amostra de 1 a cada 6 px), que o
// Lite e o Claro não têm em área grande.
function analisarMain(arq) {
  const { w, h, n, rs, px } = pixels(arq);
  let branco = 0;
  let preto = 0;
  let transparente = 0;
  let tot = 0;
  for (let y = 0; y < h; y += 6)
    for (let x = 0; x < w; x += 6) {
      const k = y * rs + x * n;
      const [r, g, b, a] = [px[k], px[k + 1], px[k + 2], n === 4 ? px[k + 3] : 255];
      tot++;
      if (a < 250) transparente++;
      else if (Math.min(r, g, b) >= 250) branco++;
      else if (Math.max(r, g, b) <= 20) preto++;
    }
  return { w, h, branco: branco / tot, preto: preto / tot, transparente: transparente / tot };
}
function apagar(arqs) {
  for (const a of arqs) {
    try {
      Gio.File.new_for_path(a).delete(null);
    } catch {
      // já foi
    }
  }
}

// A árvore de processos do app (ele, o WebKitWebProcess e o
// WebKitNetworkProcess, com o bwrap no meio) e a soma do RSS.
function rssDaArvore(raiz) {
  const pais = new Map();
  const it = Gio.File.new_for_path('/proc').enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
  for (let info = it.next_file(null); info; info = it.next_file(null)) {
    const p = info.get_name();
    if (!/^\d+$/.test(p)) continue;
    try {
      const [, b] = GLib.file_get_contents(`/proc/${p}/stat`);
      const t = new TextDecoder().decode(b);
      pais.set(p, t.slice(t.lastIndexOf(')') + 2).split(' ')[1]);
    } catch {
      // saiu
    }
  }
  const arvore = new Set([String(raiz)]);
  for (let mudou = true; mudou; ) {
    mudou = false;
    for (const [p, pp] of pais) if (!arvore.has(p) && arvore.has(pp)) (arvore.add(p), (mudou = true));
  }
  let kb = 0;
  const processos = [];
  for (const p of arvore) {
    try {
      const [, b] = GLib.file_get_contents(`/proc/${p}/status`);
      const t = new TextDecoder().decode(b);
      const rss = Number(/VmRSS:\s+(\d+)/.exec(t)?.[1] ?? 0);
      kb += rss;
      processos.push(`${/Name:\s+(\S+)/.exec(t)?.[1]}:${rss}`);
    } catch {
      // saiu
    }
  }
  return { kb, processos };
}

let proc = null;
let pid = null;
let partida = 0;
async function abrir() {
  partida++;
  const L = new Gio.SubprocessLauncher({ flags: Gio.SubprocessFlags.STDERR_MERGE });
  L.setenv('WAYLAND_DISPLAY', 'tt-aninhado', true);
  L.setenv('GDK_BACKEND', 'wayland', true);
  L.set_stdout_file_path(`${OUT}/app-${partida}.log`);
  proc = L.spawnv([BIN]);
  pid = proc.get_identifier();
  passo(`partida ${partida}: pid ${pid}`);
}
const vivo = () => proc && !proc.get_if_exited() && !proc.get_if_signaled();
// O app.log em bytes; o texto é UTF-8 ("não avisou").
function bytesDoLog(i = partida) {
  try {
    return GLib.file_get_contents(`${OUT}/app-${i}.log`)[1];
  } catch {
    return new Uint8Array();
  }
}
const logDoApp = (i = partida) => new TextDecoder().decode(bytesDoLog(i));
// O que o build de debug registra de uma entrada no Full (window/tomato.rs,
// criar_e_mostrar), no trecho do log escrito durante a ida.
function avisoDaIda(trecho) {
  const m = /entrada no Full: janela criada em (\d+) ms, mostrada (a tempo|pelo limite) em (\d+) ms, (pintada|sem aviso de pintura) em (\d+) ms/.exec(trecho);
  if (!m) return null;
  return {
    janela: Number(m[1]),
    mostrada: m[2],
    mostradaMs: Number(m[3]),
    pintada: m[4] === 'pintada',
    ms: Number(m[5]),
    // As linhas do limite, em UTF-8, para conferir o registro.
    limite: /não avisou tt:\/\/tomato-ready/.test(trecho),
    semPintura: /não avisou que pintou/.test(trecho),
  };
}

// Clica na moldura da prévia `tema` da main (em #/configuracoes).
async function clicarNaPrevia(tema) {
  const m = main();
  const caixa = JSON.parse(
    await comando('main', `(() => { const el = document.querySelector('.tt-tema[data-tema="${tema}"] .tt-previa-moldura');
      el.scrollIntoView({ block: 'nearest' }); const r = el.getBoundingClientRect(); return JSON.stringify([r.x, r.y, r.width, r.height]); })()`),
  );
  await sleep(200);
  const r = rect(m);
  Main.activateWindow(m);
  await sleep(200);
  await clicar(r.x + caixa[0] + caixa[2] / 2, r.y + caixa[1] + caixa[3] / 2);
}
const BOTOES = { voltar: [88, 122], configuracoes: [232, 122] };
async function clicarNoTomate(nome) {
  const t = tomate();
  const r = rect(t);
  Main.activateWindow(t);
  await sleep(150);
  const [vx, vy] = BOTOES[nome];
  await clicar(r.x + vx * K, r.y + vy * K);
}

// O motor, lido pela página visível (a main escondida não roda os comandos).
const motor = async (janela) => (await ipc(janela, 'get_state')).focus;

// Uma ida (`entrar`) ou volta, com os quadros e as conferências de cada uma.
async function troca(i, sentido, como) {
  const infosAntes = infos(sentido === 'ida' ? 'tomato' : 'main');
  const logAntes = bytesDoLog().length;
  const G = gravarQuadros(`${i}-${sentido}`);
  // Na ida, o instante em que a main some (o hide no Wayland desfaz a
  // MetaWindow), para comparar com o primeiro quadro pintado do tomate.
  let sumiu = null;
  let sumiuNaPintura = null;
  const mAntes = sentido === 'ida' ? main() : null;
  const idSumiu = mAntes?.connect('unmanaging', () => {
    sumiu ??= Math.round(agoraMs() - G.t0);
    sumiuNaPintura ??= G.pinturas;
  });
  if (como === 'aparencia') await clicarNaPrevia('full');
  else if (como === 'esc') {
    Main.activateWindow(tomate());
    await sleep(150);
    await tecla(Clutter.KEY_Escape);
  } else if (como === 'voltar') await clicarNoTomate('voltar');
  // O fim da troca: só a janela do destino.
  const fim = await esperar(
    () => {
      const ws = doApp();
      if (sentido === 'ida') return ws.length === 1 && eTomate(ws[0]) ? ws[0] : null;
      return ws.length === 1 && !eTomate(ws[0]) ? ws[0] : null;
    },
    // Pelo limite, a main espera o tomate até 2 s + 8 s (ESPERA_DA_PINTURA).
    sentido === 'ida' ? 12000 : 6000,
    `o fim da ${sentido} ${i}`,
  ).catch(() => null);
  const dur = Math.round(agoraMs() - acao);
  G.ate = agoraMs() + QUADROS_MS;
  await sleep(QUADROS_MS + 200);
  G.parar();
  try {
    if (idSumiu) mAntes.disconnect(idSumiu);
  } catch {
    // a MetaWindow já se foi
  }
  const C = { i, sentido, como, ms: dur, janelas: doApp().map((w) => rect(w)) };
  // Os quadros de cada janela nova.
  const todos = [];
  for (const J of G.janelas) {
    const tom = J.quadros.length && pixels(J.quadros[0].arq).w === LADO;
    const an = J.quadros.map((q) => ({ t: q.t, pintura: q.pintura, ...(tom ? analisarTomate(q.arq) : analisarMain(q.arq)) }));
    todos.push(...J.quadros.map((q) => q.arq));
    if (tom) {
      const ruins = an.filter((a) => a.cantos.some((c) => c > 8));
      const pintado = an.find((a) => a.corpo === 255);
      C.tomate = { pilha: J.pilha, foco: J.foco, quadros: an.length, primeiro: J.primeiro, cantosMax: Math.max(0, ...an.flatMap((a) => a.cantos)), ruins: ruins.length, pintado: Boolean(pintado) };
      // O vazio (FOLGA_DO_VAZIO_MS): sem o tomate pintado ou sem o sinal da
      // main, fica null e a conferência falha.
      if (sentido === 'ida') {
        C.tomate.pintouEm = pintado?.t ?? null;
        C.tomate.mainSumiuEm = sumiu;
        C.tomate.pinturas = pintado && sumiuNaPintura !== null ? pintado.pintura - sumiuNaPintura : null;
        C.tomate.vazioMs = pintado && sumiu !== null ? (pintado.pintura <= sumiuNaPintura + 1 ? 0 : pintado.t - sumiu) : null;
      }
      if (ruins.length) C.tomate.exemplo = J.quadros[an.indexOf(ruins[0])].arq;
    } else if (J.quadros.length) {
      const ruins = an.filter((a) => a.branco > 0.25 || a.preto > 0.25 || a.transparente > 0.2);
      C.main = { quadros: an.length, primeiro: J.primeiro, brancoMax: Math.max(...an.map((a) => a.branco)), pretoMax: Math.max(...an.map((a) => a.preto)), ruins: ruins.length };
      if (ruins.length) C.main.exemplo = J.quadros[an.indexOf(ruins[0])].arq;
    }
  }
  // Guarda só os quadros ruins e os da primeira ida e volta.
  apagar(todos.filter((a) => a !== C.tomate?.exemplo && a !== C.main?.exemplo && !(i === 1)));
  C.fim = Boolean(fim);
  if (sentido === 'ida') C.pronto = avisoDaIda(new TextDecoder().decode(bytesDoLog().slice(logAntes)));
  // A página nova avisou pela sonda (a tomato nasce a cada ida; a main só é
  // mostrada de novo, então a volta confere pela visibilidade).
  if (sentido === 'ida') await esperar(() => infos('tomato') > infosAntes, 10000, 'a página do tomate').catch(() => null);
  return C;
}

async function principal() {
  passo('início');
  Main.messageTray.bannerBlocked = true;
  try {
    const s = new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' });
    s.set_boolean('enable-animations', false);
    s.set_boolean('enable-hot-corners', false);
  } catch {
    // segue
  }
  const seat = global.stage.context.get_backend().get_default_seat();
  ptr = seat.create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
  kb = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
  await sleep(300);
  await semVisaoGeral();

  // Partida 1: o tema padrão (Lite), a main em Configurações e uma sessão de 60 min.
  await abrir();
  const m0 = await esperar(() => main(), 90000, 'a main');
  await esperar(() => sonda().some((e) => e.janela === 'main' && e.tipo === 'estado' && e.dados?.nav?.itens?.length === 4), 30000, 'a main desenhada');
  await semVisaoGeral();
  if (m0.is_maximized()) m0.unmaximize();
  m0.move_resize_frame(true, 960, 150, 900, 700);
  await sleep(600);
  await comando('main', "(location.hash = '#/configuracoes', 'ok')");
  await ipc('main', 'focus_start', { minutes: 60, skipBreaks: false, taskId: null });
  const f0 = await motor('main');
  checar('uma sessão de 60 min correndo antes das idas e voltas', f0.status === 'focus' && f0.session?.minutes === 60, { status: f0.status });
  await sleep(2500);
  // M52: a primeira entrada pergunta (a validação com reversão). O "Manter"
  // aqui valida a combinação, e as idas seguintes não perguntam.
  await ipc('main', 'switch_window_mode', { full: true });
  await esperar(() => tomate(), 12000, 'o tomate da validação');
  await esperar(() => infos('tomato') > 0, 10000, 'a página do tomate');
  const validou = await ipc('tomato', 'full_validation_answer', { answer: 'keep' });
  await esperar(() => doApp().length === 1 && tomate(), 12000, 'o tomate validado');
  Main.activateWindow(tomate());
  await sleep(150);
  await tecla(Clutter.KEY_Escape);
  await esperar(() => !tomate() && main(), 6000, 'a main de volta depois da validação');
  await sleep(1500);
  const sv = await ipc('main', 'settings_get');
  checar('a primeira entrada pergunta, e o Manter valida a combinação (M52)', validou?.state === 'none' && sv.fullValidated !== '' && sv.theme === 'lite', { validou, fullValidated: sv.fullValidated });
  const mv = main();
  if (mv.is_maximized()) mv.unmaximize();
  mv.move_resize_frame(true, 960, 150, 900, 700);
  await comando('main', "(location.hash = '#/configuracoes', 'ok')");
  await sleep(1000);
  const memAntes = rssDaArvore(pid);
  R.medidas.memoriaAntes = memAntes;
  passo(`memória antes: ${memAntes.kb} KB (${memAntes.processos.join(', ')})`);

  // 1. As idas e voltas.
  for (let i = 1; i <= CICLOS; i++) {
    const ida = await troca(i, 'ida', 'aparencia');
    const tt = JSON.parse(await comando('tomato', LER_TOMATE));
    const fi = await motor('tomato');
    ida.pagina = { estado: tt.estado, tempo: tt.tempo, tema: tt.tema, tamanho: tt.tamanho };
    ida.motor = { id: fi.session?.id, status: fi.status, endsAt: fi.session?.endsAt };
    ida.esperado = Math.ceil((fi.session.endsAt - tt.agora) / 1000);
    R.medidas.ciclos.push(ida);
    const volta = await troca(i, 'volta', i % 2 ? 'esc' : 'voltar');
    const mm = JSON.parse(await comando('main', LER_MAIN));
    const fv = await motor('main');
    volta.pagina = mm;
    volta.motor = { id: fv.session?.id, status: fv.status, endsAt: fv.session?.endsAt };
    volta.vivo = vivo();
    R.medidas.ciclos.push(volta);
    passo(`ciclo ${i}: ida ${ida.ms} ms (tomate ${ida.tomate?.quadros} quadros, cantos ${ida.tomate?.cantosMax}), volta ${volta.ms} ms (main ${volta.main?.quadros} quadros, branco ${volta.main?.brancoMax?.toFixed(3)}), ${tt.tempo}`);
    if (!volta.vivo) break;
  }
  const C = R.medidas.ciclos;
  const idas = C.filter((c) => c.sentido === 'ida');
  const voltas = C.filter((c) => c.sentido === 'volta');
  checar(`${CICLOS} idas e voltas completas (só a janela do destino no fim de cada troca)`, idas.length === CICLOS && voltas.length === CICLOS && C.every((c) => c.fim), C.map((c) => `${c.i}${c.sentido[0]}:${c.fim}`));
  checar(
    'sem clarão na ida: todo quadro do tomate com os quatro cantos transparentes, e o tomate pintado',
    idas.every((c) => c.tomate && c.tomate.ruins === 0 && c.tomate.pintado),
    idas.map((c) => c.tomate),
  );
  checar(
    `sem vazio na ida: a main só some com o tomate já pintado (no máximo ${FOLGA_DO_VAZIO_MS} ms sem nenhuma das duas), também pelo limite de 2 s`,
    idas.every((c) => c.tomate?.vazioMs !== null && c.tomate?.vazioMs !== undefined && c.tomate.vazioMs <= FOLGA_DO_VAZIO_MS),
    idas.map((c) => [c.i, c.tomate?.vazioMs, c.tomate?.pinturas, c.tomate?.pintouEm, c.tomate?.mainSumiuEm, c.pronto?.mostrada]),
  );
  checar(
    'sem clarão na volta: nenhum quadro da main com branco, preto ou transparência que não são do tema',
    voltas.every((c) => c.main && c.main.ruins === 0),
    voltas.map((c) => c.main),
  );
  checar(
    'a main volta em Configurações, no Lite, visível',
    voltas.every((c) => c.pagina.hash === '#/configuracoes' && c.pagina.pref === 'lite' && c.pagina.tema === 'lite' && c.pagina.visivel === 'visible'),
    voltas.map((c) => c.pagina),
  );
  checar(
    'o tomate nasce no tema full, com 280 × 280, na fase de foco',
    idas.every((c) => c.pagina.tema === 'full' && c.pagina.estado === 'focus' && c.pagina.tamanho.join() === '280,280'),
    idas.map((c) => c.pagina),
  );
  const ids = new Set(C.map((c) => c.motor.id));
  const ends = new Set(C.map((c) => c.motor.endsAt));
  checar('sem zerar o timer: a mesma sessão e o mesmo endsAt em todas as trocas', ids.size === 1 && ends.size === 1 && C.every((c) => c.motor.status === 'focus'), { ids: [...ids], endsAt: [...ends] });
  checar('o tomate mostra o tempo do motor em cada ida', idas.every((c) => Math.abs(segundos(c.pagina.tempo) - c.esperado) <= 1), idas.map((c) => [c.pagina.tempo, c.esperado]));
  const log1 = logDoApp(1);
  const pr = idas.map((c) => c.pronto);
  R.medidas.pronto = {
    aTempo: pr.filter((p) => p?.mostrada === 'a tempo').length,
    peloLimite: pr.filter((p) => p?.mostrada === 'pelo limite').length,
    pintadas: pr.filter((p) => p?.pintada).length,
    semRegistro: pr.filter((p) => !p).length,
    // No log inteiro da partida 1, com as idas "claro" e "fim".
    linhasDoLimite: (log1.match(/não avisou tt:\/\/tomato-ready/g) ?? []).length,
    janelaMs: faixaDe(pr.map((p) => p?.janela)),
    mostradaMs: faixaDe(pr.map((p) => p?.mostradaMs)),
    pintadaMs: faixaDe(pr.map((p) => p?.ms)),
    exemplo: /tomate pronto(?: e pintado)?: ([^\n]*)/.exec(log1)?.[1],
  };
  checar(
    `o tomate avisa tt://tomato-ready em cada uma das ${CICLOS} idas, o de pintado inclusive (a tempo ou pelo limite de 2 s), e o registro bate com as linhas do limite`,
    pr.every((p) => p && p.pintada && !p.semPintura && p.limite === (p.mostrada === 'pelo limite')),
    R.medidas.pronto,
  );
  R.medidas.tempos = { ida: idas.map((c) => c.ms), volta: voltas.map((c) => c.ms) };
  checar('sem crash: o app vivo e sem pânico no registro', vivo() && !/panicked at/.test(log1), { vivo: vivo() });

  // 2. A memória depois (a main só, como antes).
  await sleep(3000);
  const memDepois = rssDaArvore(pid);
  R.medidas.memoriaDepois = memDepois;
  const cresc = (memDepois.kb - memAntes.kb) / memAntes.kb;
  R.medidas.memoria = { antes: memAntes.kb, depois: memDepois.kb, crescimento: Math.round(cresc * 1000) / 10 };
  checar(`a memória cresce menos de 10% nas ${CICLOS} idas e voltas`, cresc < 0.1, R.medidas.memoria);

  // 3. Com o Full ativo, Configurações no tomate e Claro na main.
  await troca('claro', 'ida', 'aparencia');
  const G = gravarQuadros('configuracoes');
  await clicarNoTomate('configuracoes');
  const mc = await esperar(() => main(), 8000, 'a main pelas Configurações do tomate');
  await sleep(1200);
  G.parar();
  const mc1 = JSON.parse(await comando('main', LER_MAIN));
  checar('Configurações do tomate mostra a main em #/configuracoes, com o tomate aberto', mc1.hash === '#/configuracoes' && mc1.pref === 'full' && mc1.tema === 'lite' && Boolean(tomate()), { main: mc1, tomate: Boolean(tomate()) });
  await clicarNaPrevia('light');
  const fechou = await esperar(() => !tomate() && main(), 6000, 'o tomate fechado').catch(() => null);
  await sleep(800);
  const mc2 = JSON.parse(await comando('main', LER_MAIN));
  const s2 = await ipc('main', 'settings_get');
  checar(
    'com o Full ativo, escolher Claro nas Configurações fecha a tomato e deixa a main em Claro',
    Boolean(fechou) && mc2.pref === 'light' && mc2.tema === 'light' && mc2.visivel === 'visible' && s2.theme === 'light' && s2.resolvedTheme === 'light' && s2.lastNormalTheme === 'light',
    { main: mc2, theme: s2.theme, resolvedTheme: s2.resolvedTheme, lastNormalTheme: s2.lastNormalTheme, janelas: doApp().map(rect), mc: Boolean(mc) },
  );
  const temas = sonda().filter((e) => e.janela === 'main' && e.tipo === 'estado').map((e) => e.dados.tema);
  R.medidas.temasDaMain = temas.slice(-6);

  // 4. Iniciar direto no Full: entra, fecha o app no Full e abre de novo.
  await troca('fim', 'ida', 'aparencia');
  const sFull = await ipc('tomato', 'settings_get');
  checar('no Full: theme = full e lastNormalTheme = light no settings.json', sFull.theme === 'full' && sFull.lastNormalTheme === 'light', { theme: sFull.theme, last: sFull.lastNormalTheme });
  proc.send_signal(15);
  await esperar(() => !vivo(), 10000, 'o app fechado').catch(() => proc.force_exit());
  await sleep(1000);
  const infosT = infos('tomato');
  const infosM = infos('main');
  const G2 = gravarQuadros('inicio');
  await abrir();
  const t2 = await esperar(() => tomate(), 60000, 'o tomate na partida 2');
  await esperar(() => infos('tomato') > infosT, 20000, 'a página do tomate na partida 2');
  G2.ate = agoraMs() + QUADROS_MS;
  await sleep(QUADROS_MS + 1500);
  G2.parar();
  const quadrosInicio = G2.janelas.flatMap((J) => J.quadros.map((q) => q.arq)).filter((a) => pixels(a).w === LADO).map(analisarTomate);
  // Sem a main na partida, o limite de 2 s só mostra antes a janela, ainda
  // vazia e transparente (docs/decisoes.md, M51, item 13): conta, mas não falha.
  const log2 = logDoApp(2);
  R.medidas.partida2 = { limite: /não avisou tt:\/\/tomato-ready/.test(log2), quadros: quadrosInicio.length, pintado: quadrosInicio.some((a) => a.corpo === 255) };
  checar(
    'iniciar direto no Full: só a tomato (nenhuma main), com os cantos transparentes desde o primeiro quadro',
    doApp().length === 1 && eTomate(doApp()[0]) && infos('main') === infosM && quadrosInicio.length > 0 && quadrosInicio.every((a) => a.cantos.every((c) => c <= 8)),
    { janelas: doApp().map(rect), mains: infos('main') - infosM, quadros: quadrosInicio.length, cantosMax: Math.max(0, ...quadrosInicio.flatMap((a) => a.cantos)) },
  );
  const tt2 = JSON.parse(await comando('tomato', LER_TOMATE));
  checar(
    'o tomate da partida 2 no tema full, pintado, e o log com o tt://tomato-ready',
    tt2.tema === 'full' && /tomate pronto(?: e pintado)?:/.test(log2) && R.medidas.partida2.pintado,
    { tema: tt2.tema, estado: tt2.estado, ...R.medidas.partida2 },
  );
  await clicarNoTomate('configuracoes');
  await esperar(() => main(), 8000, 'a main criada pelas Configurações do tomate');
  await esperar(() => infos('main') > infosM, 20000, 'a página da main nova');
  await sleep(1500);
  const mi = JSON.parse(await comando('main', LER_MAIN));
  checar('a main nasce sob demanda já em #/configuracoes, no tema normal (Claro), com o tomate aberto', mi.hash === '#/configuracoes' && mi.pref === 'full' && mi.tema === 'light' && mi.visivel === 'visible' && Boolean(tomate()), { main: mi, tomate: Boolean(tomate()) });
  Main.activateWindow(t2);
  await sleep(300);
  await tecla(Clutter.KEY_Escape);
  const saiu = await esperar(() => !tomate() && main(), 6000, 'o Esc fecha o tomate').catch(() => null);
  await sleep(600);
  const mf = JSON.parse(await comando('main', LER_MAIN));
  const sf = await ipc('main', 'settings_get');
  checar('o Esc volta ao tema normal: a tomato fecha, a main fica, theme = light', Boolean(saiu) && mf.pref === 'light' && mf.tema === 'light' && sf.theme === 'light', { main: mf, theme: sf.theme });
  checar('sem pânico na partida 2', !/panicked at/.test(logDoApp(2)) && vivo(), { vivo: vivo() });

  const erros = sonda().filter((x) => x.tipo === 'erro').map((x) => `${x.janela}: ${x.dados}`);
  checar('nenhum erro nas páginas', erros.length === 0, erros.slice(0, 10));
  proc.send_signal(15);
  await esperar(() => !vivo(), 10000, 'o app fechado no fim').catch(() => proc.force_exit());
  passo('fim');
}

export async function run() {
  try {
    await principal();
  } catch (e) {
    R.erro = `${e}\n${e.stack}`;
    salvar();
  }
  try {
    if (vivo()) proc.force_exit();
  } catch {
    // já saiu
  }
}
