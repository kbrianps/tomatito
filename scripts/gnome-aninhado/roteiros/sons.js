// Roteiro do M20 (sons), carregado com `gnome-shell --automation-script` pelo
// dentro.sh. Na janela main de verdade, com o motor e a thread de som de
// verdade. Rodar com TOMATITO_SPEED=60 e TOMATITO_VOLUME=1 (1%, para quase não
// soar na máquina de quem roda).
//
// Com TT_PIPEWIRE (o app fala com o PipeWire da sessão), confere pelo pw-dump
// o fluxo de saída que o app abre em cada som:
//   1. no catálogo (#/dev), o ponteiro virtual clica em "Testar fim de foco" e
//      depois em "Testar fim de intervalo": cada clique abre um fluxo novo
//      (outro object.serial no PipeWire), ligado à saída padrão, que fecha sozinho em
//      cerca de 1,5 s. Abrir a saída a cada som é o que faz a troca de saída
//      valer sem reiniciar (o teste humano da troca está em
//      docs/verificacao-manual.md);
//   2. o `sound_test` sem argumento toca os dois, um depois do outro (dois
//      fluxos em sequência);
//   3. uma sessão de 5 min (5 s a 60×) termina e o fim toca pelo motor.
// Com TT_SEM_AUDIO=1 (e sem TT_PIPEWIRE), o app não tem saída de áudio: o
// `sound_test` e o fim da sessão falham só no log (o resumo confere), e o app
// continua respondendo.
// No fim, fecha a janela pelo compositor.
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export const METRICS = {};

const OUT = GLib.getenv('TT_OUT');
const SONDA_LOG = GLib.getenv('SONDA_LOG');
const PIPEWIRE = GLib.getenv('TT_PIPEWIRE');
const SEM_AUDIO = GLib.getenv('TT_SEM_AUDIO') === '1';
const R = { passos: [], checagens: {}, medidas: { pipewire: PIPEWIRE ?? null, semAudio: SEM_AUDIO } };

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
  await sleep(100);
}
async function clicarNoBotao(r, seletor) {
  const c = await comando(
    `(() => { const b = document.querySelector('${seletor}'); if (!b) return null; b.scrollIntoView({ block: 'center' }); const q = b.getBoundingClientRect(); if (!q.width) return null; return [q.x + q.width / 2, q.y + q.height / 2]; })()`,
  );
  if (!c) throw new Error(`elemento ausente: ${seletor}`);
  await clicar(r.x + Math.round(c[0]), r.y + Math.round(c[1]));
}

// Os fluxos de saída de áudio do app no PipeWire da sessão, pelo pw-dump:
// [{ id (o object.serial), sink }] de cada nó "alsa_playback.tomatito*", com o nome do nó de
// saída a que ele está ligado (o link do PipeWire).
function fluxos() {
  if (!PIPEWIRE) return [];
  const [ok, saida] = GLib.spawn_command_line_sync(`env PIPEWIRE_RUNTIME_DIR=${PIPEWIRE} pw-dump`);
  if (!ok) return [];
  let objs;
  try {
    objs = JSON.parse(new TextDecoder().decode(saida));
  } catch {
    return [];
  }
  const nome = new Map(objs.map((o) => [o.id, o.info?.props?.['node.name']]));
  const nossos = objs.filter(
    (o) => o.type === 'PipeWire:Interface:Node' && String(o.info?.props?.['node.name'] ?? '').startsWith('alsa_playback.tomatito'),
  );
  return nossos.map((n) => {
    const link = objs.find((o) => o.type === 'PipeWire:Interface:Link' && o.info?.['output-node-id'] === n.id);
    // O id do nó é reaproveitado pelo PipeWire; o object.serial, não.
    return { id: n.info.props['object.serial'] ?? n.id, sink: link ? nome.get(link.info['input-node-id']) : null };
  });
}
function saidaPadrao() {
  if (!PIPEWIRE) return null;
  const [ok, saida] = GLib.spawn_command_line_sync(`env PIPEWIRE_RUNTIME_DIR=${PIPEWIRE} pw-dump`);
  if (!ok) return null;
  const objs = JSON.parse(new TextDecoder().decode(saida));
  const meta = objs.find((o) => o.type === 'PipeWire:Interface:Metadata' && o.props?.['metadata.name'] === 'default');
  const v = meta?.metadata?.find((m) => m.key === 'default.audio.sink')?.value;
  return v?.name ?? null;
}

// Observa os fluxos por `ms`: para cada id, quando apareceu, por quanto tempo
// ficou e a que saída se ligou.
async function observar(ms, acao) {
  const vistos = new Map();
  const t0 = agoraMs();
  const olhar = () => {
    const t = Math.round(agoraMs() - t0);
    for (const f of fluxos()) {
      const v = vistos.get(f.id) ?? { id: f.id, de: t, ate: t, sink: null };
      v.ate = t;
      v.sink ??= f.sink;
      vistos.set(f.id, v);
    }
  };
  olhar();
  const antes = new Set(vistos.keys());
  if (acao) await acao();
  while (agoraMs() - t0 < ms) {
    olhar();
    await sleep(100);
  }
  return [...vistos.values()].filter((v) => !antes.has(v.id)).map((v) => ({ ...v, dur: v.ate - v.de }));
}

const LER = "(async () => { const s = await window.__TAURI_INTERNALS__.invoke('get_state'); return { status: s.focus.status, velocidade: s.speed }; })()";

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
  checar('abre ocioso, com o relógio acelerado (TOMATITO_SPEED=60)', inicial.status === 'idle' && inicial.velocidade === 60, inicial);
  const padrao = saidaPadrao();
  R.medidas.saidaPadrao = padrao;

  await comando("(location.hash = '#/dev', location.hash)");
  await sleep(800);

  // 1. Os dois botões do catálogo, pelo ponteiro virtual.
  const foco = await observar(2600, () => clicarNoBotao(r, '[data-som="focusEnd"]'));
  const intervalo = await observar(2600, () => clicarNoBotao(r, '[data-som="breakEnd"]'));
  R.medidas.catalogo = { foco, intervalo };
  // 2. O sound_test sem argumento.
  const ambos = await observar(4500, () => comando("window.__TAURI_INTERNALS__.invoke('sound_test').then(() => 'ok')"));
  R.medidas.ambos = ambos;
  // 3. Uma sessão de 5 min a 60×: o fim toca pelo motor.
  await comando("(location.hash = '#/foco', location.hash)");
  const fim = await observar(9000, () => comando("window.__TAURI_INTERNALS__.invoke('focus_start', { minutes: 5 }).then((f) => f.status)"));
  R.medidas.fimDaSessao = fim;
  const depois = await comando(LER);
  checar('a sessão de 5 min terminou e o app segue respondendo', depois.status === 'completed', depois);

  const umFluxo = (l) => l.length === 1 && l[0].dur >= 900 && l[0].dur <= 3000;
  if (PIPEWIRE) {
    checar('"Testar fim de foco" abre um fluxo de ~1,5 s e o fecha', umFluxo(foco), foco);
    checar('"Testar fim de intervalo" abre outro fluxo (outro object.serial), de ~1,5 s', umFluxo(intervalo) && intervalo[0].id !== foco[0]?.id, intervalo);
    checar('os fluxos vão para a saída padrão do momento', [...foco, ...intervalo, ...ambos, ...fim].every((f) => f.sink === padrao) && padrao !== null, { padrao, sinks: [...foco, ...intervalo, ...ambos, ...fim].map((f) => f.sink) });
    checar('sound_test sem argumento: dois fluxos, um depois do outro', ambos.length === 2 && ambos[1].de >= ambos[0].ate - 200, ambos);
    checar('o fim da sessão toca um som pelo motor', umFluxo(fim), fim);
  } else if (!SEM_AUDIO) {
    throw new Error('rode com TT_PIPEWIRE=/run/user/$UID ou com TT_SEM_AUDIO=1');
  }
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
