// Roteiro do M33 (adicionar, editar e excluir temporizadores), carregado com
// `gnome-shell --automation-script` pelo dentro.sh. Na janela main de
// verdade, com o motor de verdade e o state.json gravado de verdade na pasta
// de dados isolada da rodada ($XDG_DATA_HOME/io.github.kbrianps.tomatito.dev):
//
//   bash scripts/gnome-aninhado/rodar.sh temporizador-edicao
//
// O "Pronto quando" do M33, com cliques de verdade (ponteiro virtual) nos
// botões; só o texto do nome é escrito pela sonda (o teclado virtual não
// digita "á"):
//   1. abre a tela Temporizador pelo painel;
//   2. "+" abre o diálogo com 00:05:00; o chevron de baixo dos minutos dá
//      00:04:00; nome "Chá"; Salvar: o card "Chá · 00:04:00" aparece, e o
//      state.json (lido logo depois) tem os cinco, com o "Chá" de 240000 ms;
//   3. o lápis liga o modo de edição; o "Editar" do "Chá", o chevron de cima
//      dos minutos (00:05:00) e o nome "Chá verde"; Salvar: o state.json tem
//      o "Chá verde" de 300000 ms;
//   4. "Excluir" no "Chá verde": o card some, e o state.json volta aos quatro;
//   5. iniciar e pausar o de 1 min também regravam o arquivo (endsAt e depois
//      remainingMs), como transições (3.3);
//   6. fecha a janela, e o arquivo continua lá, com a última lista.
// Cada leitura do state.json vai para a pasta da rodada (m33-state-N.json).
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
  // M33: o card novo pode ficar abaixo da dobra; rola até ele antes de medir.
  const ret = await comando(`(() => { const el = document.querySelector(${JSON.stringify(seletor)}); el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; })()`);
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


// O binário de debug do `cargo build` usa o identifier do tauri.conf.json; o
// do `npm run dev:app`, o `.dev` (M21b). Vale a pasta que existir.
const PASTAS = ['io.github.kbrianps.tomatito.dev', 'io.github.kbrianps.tomatito'].map((id) => `${GLib.getenv('XDG_DATA_HOME')}/${id}`);
const pastaDeDados = () => PASTAS.find((p) => GLib.file_test(p, GLib.FileTest.IS_DIR)) ?? PASTAS[0];
let ARQ = `${PASTAS[0]}/state.json`;
let nEstado = 0;
function lerEstado() {
  try {
    const [, bytes] = GLib.file_get_contents(ARQ);
    const texto = new TextDecoder().decode(bytes);
    GLib.file_set_contents(`${OUT}/m33-state-${++nEstado}.json`, texto);
    return JSON.parse(texto);
  } catch (e) {
    return { erro: String(e) };
  }
}
const resumoDoEstado = (e) => (e?.timers ?? []).map((t) => `${t.id}:${t.name || '-'}:${t.durationMs}:${t.status}`).join('|');
const LER = `(() => [...document.querySelectorAll('[data-temporizador]')].map((el) => ({
  id: Number(el.dataset.temporizador), titulo: el.querySelector('h2').textContent, tempo: el.querySelector('[data-tempo]').textContent,
  estado: el.dataset.estado })))()`;
const DIALOGO = '[data-dialogo="temporizador"]';
const dialogoAberto = () => comando(`Boolean(document.querySelector('${DIALOGO}')?.dialog?.open)`);
const campos = () => comando(`[...document.querySelectorAll('${DIALOGO} [data-campo]')].map((x) => x.value)`);
const escreverNome = (nome) =>
  comando(`(() => { const n = document.querySelector('${DIALOGO} [data-nome]'); n.value = ${JSON.stringify(nome)}; n.dispatchEvent(new Event('input', { bubbles: true })); return n.value; })()`);

async function principal() {
  passo('início');
  ptr = global.stage.context.get_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
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
  W.move_resize_frame(true, 300, 150, 1100, 760);
  for (let i = 0; i < 20 && (Main.overview.visible || Main.overview.animationInProgress); i++) {
    if (!Main.overview.animationInProgress) Main.overview.hide();
    await sleep(500);
  }
  Main.activateWindow(W);
  await sleep(800);

  // 1. A tela pelo painel. Nada gravado ainda: carregar é do M40, e gravar
  // só acontece numa transição.
  await clicarEm('.tt-nav [data-rota="temporizador"]');
  const inicial = await comando(LER);
  checar('quatro padrões', inicial?.map((c) => c.titulo).join('|') === '1 min|3 min|5 min|10 min', inicial);
  ARQ = `${pastaDeDados()}/state.json`;
  R.medidas.arquivo = ARQ;
  const antes = GLib.file_test(ARQ, GLib.FileTest.EXISTS);
  R.medidas.existiaAntes = antes;

  // 2. Criar "Chá · 4 min".
  await clicarEm('[data-adicionar]');
  checar('o "+" abre o diálogo com 00:05:00', (await dialogoAberto()) && (await campos()).join(':') === '00:05:00', await campos());
  await clicarEm(`${DIALOGO} [data-menos="m"]`);
  checar('o chevron de baixo dos minutos dá 00:04:00', (await campos()).join(':') === '00:04:00', await campos());
  await escreverNome('Chá');
  await captura('m33-app-dialogo.png');
  await clicarEm(`${DIALOGO} [data-salvar]`);
  const criado = await comando(LER);
  checar('card "Chá · 00:04:00" no fim', !(await dialogoAberto()) && criado?.length === 5 && criado[4].titulo === 'Chá' && criado[4].tempo === '00:04:00', criado);
  const e1 = lerEstado();
  R.medidas.estadoCriado = e1;
  checar(
    'state.json depois de criar: os cinco, com o "Chá" de 240000 ms e a versão',
    e1.schemaVersion === 1 && resumoDoEstado(e1) === '1:-:60000:idle|2:-:180000:idle|3:-:300000:idle|4:-:600000:idle|5:Chá:240000:idle',
    resumoDoEstado(e1) || e1,
  );
  await captura('m33-app-criado.png');

  // 3. Editar para "Chá verde · 5 min".
  await clicarEm('[data-editar-lista]');
  const modo = await comando(`[document.querySelector('[data-temporizadores]').hasAttribute('data-editando'), document.querySelector('[data-editar-lista]').getAttribute('aria-label')]`);
  checar('o lápis liga o modo de edição e vira "Concluído"', modo?.[0] === true && modo[1] === 'Concluído', modo);
  await captura('m33-app-edicao.png');
  await clicarEm('[data-temporizador="5"] [data-acao="editar"]');
  checar('"Editar" abre com 00:04:00', (await campos()).join(':') === '00:04:00', await campos());
  await clicarEm(`${DIALOGO} [data-mais="m"]`);
  await escreverNome('Chá verde');
  await clicarEm(`${DIALOGO} [data-salvar]`);
  const editado = await comando(LER);
  checar('card "Chá verde · 00:05:00"', editado?.[4]?.titulo === 'Chá verde' && editado[4].tempo === '00:05:00', editado?.[4]);
  const e2 = lerEstado();
  checar('state.json depois de editar: "Chá verde" de 300000 ms', resumoDoEstado(e2).endsWith('|5:Chá verde:300000:idle') && e2.timers.length === 5, resumoDoEstado(e2) || e2);

  // 4. Excluir.
  await clicarEm('[data-temporizador="5"] [data-acao="excluir"]');
  const excluido = await comando(LER);
  checar('o card some', excluido?.length === 4 && !excluido.some((c) => c.id === 5), excluido);
  const e3 = lerEstado();
  checar('state.json depois de excluir: os quatro padrões', resumoDoEstado(e3) === '1:-:60000:idle|2:-:180000:idle|3:-:300000:idle|4:-:600000:idle', resumoDoEstado(e3) || e3);
  await clicarEm('[data-editar-lista]');

  // 5. Iniciar e pausar também são transições.
  await clicarEm('[data-temporizador="1"] button[data-acao="iniciar"]');
  const e4 = lerEstado();
  const t4 = e4.timers?.[0];
  checar('iniciar regrava: running com endsAt', t4?.status === 'running' && t4.endsAt > e4.savedAt && !('remainingMs' in t4), t4);
  await clicarEm('[data-temporizador="1"] button[data-acao="pausar"]');
  const e5 = lerEstado();
  const t5 = e5.timers?.[0];
  checar('pausar regrava: paused com remainingMs', t5?.status === 'paused' && t5.remainingMs > 0 && t5.remainingMs <= 60000 && !('endsAt' in t5), t5);

  const erros = sonda().filter((x) => x.tipo === 'erro').map((x) => x.dados);
  checar('nenhum erro na página', erros.length === 0, erros);

  // 6. Fecha, e o arquivo fica.
  W.delete(global.get_current_time());
  await sleep(2000);
  const e6 = lerEstado();
  checar('depois de fechar, o state.json continua com a última lista', resumoDoEstado(e6) === resumoDoEstado(e5) && e6.timers?.length === 4, resumoDoEstado(e6));
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
