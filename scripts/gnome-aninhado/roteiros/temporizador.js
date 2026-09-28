// Roteiro do M32 (tela Temporizador), carregado com `gnome-shell
// --automation-script` pelo dentro.sh. Na janela main de verdade, com o
// motor, o som e as notificações de verdade (a notificação vai para este
// GNOME Shell aninhado, e o roteiro a lê no messageTray). Rodar com
// TOMATITO_SPEED=10, TOMATITO_VOLUME=1 e TT_PIPEWIRE=/run/user/$UID (o som
// conferido pelo pw-dump), no tema Lite (o padrão):
//
//   TOMATITO_SPEED=10 TT_PIPEWIRE=/run/user/$UID bash scripts/gnome-aninhado/rodar.sh temporizador
//
// O "Pronto quando" do M32:
//   1. abre a tela Temporizador pelo painel (Ctrl+2 não; um clique de
//      verdade no item) e confere os quatro padrões parados;
//   2. clica (ponteiro virtual) no "Iniciar" do de 1 min e no do de 3 min:
//      os dois correm juntos;
//   3. o de 1 min acaba (6 s de verdade a 10×): uma notificação
//      "Temporizador encerrado | 1 min", com o balão, e um som, uma vez só;
//   4. o card mostra "-00:00:12" com "Encerrado há" acima (captura), e o de
//      3 min continua correndo, sem o rótulo;
//   5. mais 3 s: nenhum fim novo; o de 3 min acaba depois (18 s a 10×) e
//      notifica também.
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
const PIPEWIRE = GLib.getenv('TT_PIPEWIRE');
const R = { passos: [], checagens: {}, medidas: { pipewire: PIPEWIRE ?? null } };

const salvar = () => GLib.file_set_contents(`${OUT}/resultado.json`, JSON.stringify(R, null, 2));
const sleep = (ms) =>
  new Promise((r) => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => (r(), GLib.SOURCE_REMOVE)));
const agoraMs = () => GLib.get_monotonic_time() / 1000;
const agora = () => GLib.get_monotonic_time();
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
async function comando(js, prazo = 10000) {
  const id = `c${++nComando}`;
  GLib.file_set_contents(`${OUT}/comando.json`, JSON.stringify({ id, js }));
  const r = await esperar(() => sonda().find((e) => e.tipo === 'comando' && e.dados.id === id), prazo, `comando ${js.slice(0, 80)}`);
  const texto = JSON.stringify(r.dados.resultado) ?? 'null';
  passo(`comando ${js.slice(0, 120)} => ${texto.length > 400 ? `${texto.slice(0, 400)}…` : texto}`);
  return r.dados.resultado;
}

// As notificações que chegam ao shell, e se o balão apareceu.
const notificacoes = [];
let W = null;
const t0 = agoraMs();
const rel = () => Math.round(agoraMs() - t0);
const mostrando = (n) => Main.messageTray._notification === n && [1, 2].includes(Main.messageTray._notificationState);
function vigiarFonte(source) {
  source.connect('notification-added', (_s, n) => {
    const item = { t: rel(), fonte: source.title, titulo: n.title, corpo: n.body ?? '', balao: false };
    notificacoes.push(item);
    passo(`notificação: ${n.title} | ${n.body}`);
    GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
      item.balao = mostrando(n);
      return GLib.SOURCE_REMOVE;
    });
  });
}
Main.messageTray.getSources().forEach(vigiarFonte);
Main.messageTray.connect('source-added', (_t, source) => vigiarFonte(source));

function fluxos() {
  if (!PIPEWIRE) return [];
  const [ok, saida] = GLib.spawn_command_line_sync(`env PIPEWIRE_RUNTIME_DIR=${PIPEWIRE} pw-dump`);
  if (!ok) return [];
  try {
    return JSON.parse(new TextDecoder().decode(saida))
      .filter((o) => o.type === 'PipeWire:Interface:Node' && String(o.info?.props?.['node.name'] ?? '').startsWith('alsa_playback.tomatito'))
      .map((o) => o.info.props['object.serial'] ?? o.id);
  } catch {
    return [];
  }
}

let ptr;
let passoPtr = 0;
const mover = (x, y) => ptr.notify_absolute_motion(agora(), x, y);
// Um balão só sai da tela com o usuário mexendo; o ponteiro mexe um pouco.
const mexer = () => mover(1850 + (passoPtr++ % 2) * 20, 1000);
const sons = [];
// Os fluxos já vistos: a base é tirada antes de iniciar os temporizadores,
// para um som que ainda toca quando a observação começa contar também.
let vistos = null;
async function observar(ms) {
  vistos ??= new Set(fluxos());
  const fim = agoraMs() + ms;
  let ultimo = 0;
  while (agoraMs() < fim) {
    if (agoraMs() - ultimo > 1000) {
      mexer();
      ultimo = agoraMs();
    }
    for (const id of fluxos()) {
      if (!vistos.has(id)) {
        vistos.add(id);
        sons.push({ t: rel(), id });
        passo(`som: fluxo ${id}`);
      }
    }
    await sleep(150);
  }
}

async function clicarEm(seletor) {
  const ret = await comando(`(() => { const r = document.querySelector(${JSON.stringify(seletor)}).getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; })()`);
  const fr = W.get_frame_rect();
  const x = fr.x + Math.round(ret[0] + ret[2] / 2);
  const y = fr.y + Math.round(ret[1] + ret[3] / 2);
  // Entra na janela antes do clique, como os roteiros aparencia e controles.
  mover(x - 10, y - 10);
  await sleep(300);
  mover(x, y);
  await sleep(150);
  ptr.notify_button(agora(), Clutter.BUTTON_PRIMARY, Clutter.ButtonState.PRESSED);
  await sleep(60);
  ptr.notify_button(agora(), Clutter.BUTTON_PRIMARY, Clutter.ButtonState.RELEASED);
  await sleep(700);
}

async function captura(nome) {
  const fr = W.get_frame_rect();
  const shooter = new Shell.Screenshot();
  const s = Gio.File.new_for_path(`${OUT}/${nome}`).replace(null, false, Gio.FileCreateFlags.NONE, null);
  await shooter.screenshot_area(fr.x, fr.y, fr.width, fr.height, s);
  s.close(null);
  passo(`captura ${nome}`);
}

const LER = `(() => [...document.querySelectorAll('[data-temporizador]')].map((el) => {
  const enc = el.querySelector('[data-encerrado]');
  return { id: Number(el.dataset.temporizador), titulo: el.querySelector('h2').textContent, tempo: el.querySelector('[data-tempo]').textContent,
    encerrado: enc.hidden ? null : enc.textContent, estado: el.dataset.estado, vencido: el.hasAttribute('data-vencido'),
    cor: getComputedStyle(el.querySelector('[data-tempo]')).color };
}))()`;
// Espera, a cada quadro, o card 1 mostrar o texto; devolve a leitura daquele quadro.
const ESPERAR = (texto) => `new Promise((res) => { const t0 = performance.now(); const olhar = () => {
  const el = document.querySelector('[data-temporizador="1"] [data-tempo]');
  if (el?.textContent === ${JSON.stringify(texto)}) return res(${LER});
  if (performance.now() - t0 > 15000) return res(null);
  requestAnimationFrame(olhar); }; olhar(); })`;

async function principal() {
  passo('início');
  ptr = global.stage.context.get_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
  // Como nos roteiros controles e cartao-tarefas: sem o canto ativo (no
  // GSettings em memória do teste) e com um primeiro movimento que só põe o
  // ponteiro na tela (sem ele, o primeiro clique numa janela se perde).
  try {
    new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' }).set_boolean('enable-hot-corners', false);
  } catch {
    // sem o esquema: segue
  }
  await sleep(200);
  mover(960, 1070);
  await sleep(1000);
  W = (await esperar(() => (janelas().length && janelas()[0].get_frame_rect().width > 0 ? janelas() : null), 120000, 'a janela do Tomatito'))[0];
  await esperar(() => estado()?.nav?.itens?.length === 4, 30000, 'o painel desenhado (sonda)');
  if (W.is_maximized()) W.unmaximize();
  W.move_resize_frame(true, 300, 150, 1000, 700);
  for (let i = 0; i < 20 && (Main.overview.visible || Main.overview.animationInProgress); i++) {
    if (!Main.overview.animationInProgress) Main.overview.hide();
    await sleep(500);
  }
  Main.activateWindow(W);
  await sleep(800);
  for (let i = 0; i < 50 && Main.messageTray._notificationState !== 0; i++) {
    mexer();
    await sleep(200);
  }

  const vel = await comando("window.__TAURI_INTERNALS__.invoke('get_state').then((s) => s.speed)");
  checar('relógio acelerado (TOMATITO_SPEED=10)', vel === 10, vel);

  // 1. A tela pelo painel.
  R.diag = { focada: global.display.focus_window === W, visaoGeral: Main.overview.visible, modal: Main.modalCount };
  await clicarEm('.tt-nav [data-rota="temporizador"]');
  const hash = await comando('location.hash');
  checar('o painel abre a tela Temporizador', hash === '#/temporizador', hash);
  const inicial = await comando(LER);
  checar(
    'quatro padrões parados: 1, 3, 5 e 10 min',
    Array.isArray(inicial) && inicial.map((c) => `${c.titulo} ${c.tempo} ${c.estado}`).join('|') === '1 min 00:01:00 idle|3 min 00:03:00 idle|5 min 00:05:00 idle|10 min 00:10:00 idle',
    inicial,
  );
  await captura('m32-app-inicial.png');

  // 2. Iniciar dois, com cliques de verdade.
  await observar(0);
  const n0 = notificacoes.length;
  await clicarEm('[data-temporizador="1"] button[data-acao="iniciar"]');
  await clicarEm('[data-temporizador="2"] button[data-acao="iniciar"]');
  const dois = await comando(LER);
  checar('os dois correm juntos', dois?.[0]?.estado === 'running' && dois?.[1]?.estado === 'running' && dois[2].estado === 'idle', dois);
  // O alvo do clique é o botão redondo, o ícone ou o traço (path) do ícone.
  const cliques = sonda().filter((e) => e.tipo === 'click').map((e) => e.dados.alvo);
  checar('três cliques de verdade: o item do painel e os dois "Iniciar"', cliques.length === 3 && cliques.slice(1).every((a) => /tt-circular|tt-icone|^path$/.test(a)), cliques);

  // 3 e 4. O de 1 min acaba e mostra -00:00:12 com "Encerrado há".
  const tSons = sons.length;
  const vencido = await comando(ESPERAR('-00:00:12'), 20000);
  await captura('m32-app-vencido.png');
  await observar(2500);
  const n1 = notificacoes.slice(n0);
  R.medidas.vencido = vencido;
  checar(
    '-00:00:12 com "Encerrado há", ainda correndo',
    vencido?.[0]?.tempo === '-00:00:12' && vencido[0].encerrado === 'Encerrado há' && vencido[0].vencido && vencido[0].estado === 'running',
    vencido?.[0],
  );
  checar(
    'o de 3 min continua correndo, sem o rótulo, e com outro jeito que o vencido',
    vencido?.[1]?.estado === 'running' && vencido[1].encerrado === null && !vencido[1].tempo.startsWith('-') && vencido[0].encerrado !== vencido[1].encerrado,
    vencido?.[1],
  );
  checar(
    'uma notificação "Temporizador encerrado | 1 min", com o balão',
    n1.length === 1 && n1[0].titulo === 'Temporizador encerrado' && n1[0].corpo === '1 min' && n1[0].balao,
    n1,
  );
  if (PIPEWIRE) checar('um som tocou', sons.length - tSons === 1, sons.slice(tSons));

  // 5. Nenhum fim novo do de 1 min; o de 3 min acaba e notifica também.
  const nAntes = notificacoes.length;
  await observar(3000);
  checar('o fim do de 1 min dispara uma vez só', notificacoes.length === nAntes, notificacoes.slice(nAntes));
  const tSons2 = sons.length;
  await observar(14000);
  const n2 = notificacoes.slice(nAntes);
  checar('o de 3 min acaba e notifica "Temporizador encerrado | 3 min"', n2.length === 1 && n2[0].corpo === '3 min', n2);
  if (PIPEWIRE) checar('e toca o som', sons.length - tSons2 === 1, sons.slice(tSons2));
  const fim = await comando(LER);
  checar('os dois no negativo, com o rótulo', fim?.[0]?.vencido && fim?.[1]?.vencido && fim[1].encerrado === 'Encerrado há', fim?.slice(0, 2));

  const erros = sonda().filter((x) => x.tipo === 'erro').map((x) => x.dados);
  checar('nenhum erro na página', erros.length === 0, erros);
  R.medidas.notificacoes = notificacoes;
  R.medidas.sons = sons;
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
