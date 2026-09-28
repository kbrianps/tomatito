// Roteiro do M21 (notificações), carregado com `gnome-shell --automation-script`
// pelo dentro.sh. Na janela main de verdade, com o motor, o som e o plugin de
// notificação de verdade; as notificações vão para este GNOME Shell aninhado
// (o barramento de sessão é o da rodada), e o roteiro as lê no messageTray.
// Rodar com TOMATITO_SPEED=60, TOMATITO_VOLUME=1 e TT_PIPEWIRE=/run/user/$UID
// (para conferir o som pelo pw-dump).
//
//   1. "Pronto quando": inicia uma sessão de 60 min (60 s a 60×) e minimiza a
//      janela. O fim do foco, o fim do intervalo e o fim da sessão chegam
//      como notificações, cada uma com o balão na tela e o som tocando, com a
//      janela ainda minimizada. Os textos são os do plano, e o "Próximo foco
//      às HH:MM" bate com o prazo do intervalo no fuso local.
//   2. "Não perturbe": desliga os balões como o botão do GNOME faz
//      (org.gnome.desktop.notifications show-banners = false, no GSettings em
//      memória deste shell), roda uma sessão de 5 min, também minimizada, e
//      confere que a notificação entra na lista sem balão e que o som toca.
//   3. Fim atrasado: congela o app (SIGSTOP) durante uma sessão de 5 min até
//      passar do limite do atraso e confere o aviso único, sem som.
// No fim, fecha a janela pelo compositor. A rodada leva uns 3 min.
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

// As notificações que chegam ao shell: cada uma com o título, o corpo, a
// fonte, o instante e se a janela estava minimizada; e cada balão mostrado.
const notificacoes = [];
const baloes = [];
let W = null;
const t0 = agoraMs();
const rel = () => Math.round(agoraMs() - t0);
async function captura(nome) {
  const shooter = new Shell.Screenshot();
  const s = Gio.File.new_for_path(`${OUT}/${nome}`).replace(null, false, Gio.FileCreateFlags.NONE, null);
  await shooter.screenshot_area(0, 0, 1920, 1080, s);
  s.close(null);
  passo(`captura ${nome}`);
}

// O balão é conferido logo depois de a notificação entrar (num idle do
// shell) e de novo 1,5 s depois: nas duas vezes, a notificação nova é a que o
// messageTray está mostrando, no estado SHOWING (1) ou SHOWN (2). Com o "Não
// perturbe", ela nem entra na fila. Nenhuma notificação do app pode ser
// destruída durante a rodada: o GNOME apaga a fonte do app (e as
// notificações dela) quando a conexão D-Bus de quem as mandou some, que era o
// que acontecia com o plugin (docs/decisoes.md, M21).
const destruidas = [];
const mostrando = (n) => Main.messageTray._notification === n && [1, 2].includes(Main.messageTray._notificationState);
function vigiarFonte(source) {
  source.connect('notification-added', (_s, n) => {
    const t = rel();
    notificacoes.push({ t, fonte: source.title, titulo: n.title, corpo: n.body ?? '', minimizada: W?.minimized ?? null, urgencia: n.urgency });
    passo(`notificação: ${n.title} | ${n.body} (balões ${source.policy.showBanners})`);
    n.connect('destroy', (_n, motivo) => {
      destruidas.push({ t: rel(), fonte: source.title, titulo: n.title, motivo });
      passo(`notificação destruída: ${n.title} (motivo ${motivo})`);
    });
    GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
      if (!mostrando(n)) return GLib.SOURCE_REMOVE;
      const balao = { t, titulo: n.title, minimizada: W?.minimized ?? null, aos1500: null };
      baloes.push(balao);
      passo(`balão: ${n.title}`);
      sleep(1500).then(async () => {
        balao.aos1500 = mostrando(n);
        passo(`balão aos 1,5 s: ${n.title} ${balao.aos1500 ? 'na tela' : 'sumiu'}`);
        const nome = { 'Período de foco concluído': 'balao-foco.png', 'Intervalo concluído': 'balao-intervalo.png' }[n.title];
        if (nome) await captura(nome);
      }).catch((e) => passo(`captura falhou: ${e}`));
      return GLib.SOURCE_REMOVE;
    });
  });
}
Main.messageTray.getSources().forEach(vigiarFonte);
Main.messageTray.connect('source-added', (_t, source) => vigiarFonte(source));

// Os fluxos de saída do app no PipeWire da sessão (como no roteiro sons).
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
// Um balão fica na tela até o usuário mexer em algo (o shell vigia a
// inatividade), e os seguintes esperam na fila. Sem mouse de verdade, o
// ponteiro virtual mexe um pouco a cada segundo, como alguém trabalhando.
let ptr;
let passoPtr = 0;
const mexer = () => ptr?.notify_absolute_motion(GLib.get_monotonic_time(), 1500 + (passoPtr++ % 2) * 20, 1000);

const sons = [];
async function observarSons(ms) {
  const vistos = new Set(fluxos());
  const fim = agoraMs() + ms;
  let ultimoMexer = 0;
  while (agoraMs() < fim) {
    if (agoraMs() - ultimoMexer > 1000) {
      mexer();
      ultimoMexer = agoraMs();
    }
    for (const id of fluxos()) {
      if (!vistos.has(id)) {
        vistos.add(id);
        sons.push({ t: rel(), id, minimizada: W?.minimized ?? null });
        passo(`som: fluxo ${id}`);
      }
    }
    await sleep(150);
  }
}

// "HH:MM" local de um instante em ms (o fuso deste processo, que é o do app).
const hhmm = (ms) => GLib.DateTime.new_from_unix_local(Math.floor(ms / 1000)).format('%H:%M');

const LER = "(async () => { const s = await window.__TAURI_INTERNALS__.invoke('get_state'); return { status: s.focus.status, velocidade: s.speed }; })()";
const INICIAR = (min) => `window.__TAURI_INTERNALS__.invoke('focus_start', { minutes: ${min} }).then((f) => ({ status: f.status, startedAt: f.session.startedAt, blocos: f.session.blocks }))`;

async function principal() {
  passo('início');
  ptr = global.stage.context.get_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
  if (Main.overview.visible) Main.overview.hide();
  W = (await esperar(() => (janelas().length && janelas()[0].get_frame_rect().width > 0 ? janelas() : null), 120000, 'a janela do Tomatito'))[0];
  await esperar(() => estado()?.nav?.itens?.length === 4, 30000, 'o painel desenhado (sonda)');
  if (W.is_maximized()) W.unmaximize();
  W.move_resize_frame(true, 300, 150, 1000, 700);
  await sleep(800);
  Main.activateWindow(W);
  await sleep(500);

  const inicial = await comando(LER);
  checar('abre ocioso, com o relógio acelerado (TOMATITO_SPEED=60)', inicial.status === 'idle' && inicial.velocidade === 60, inicial);
  // O balão do próprio shell na partida ("Bloqueio de tela desabilitado")
  // sai com o ponteiro mexendo; só depois começa a sessão.
  await observarSons(0);
  for (let i = 0; i < 100 && Main.messageTray._notificationState !== 0; i++) {
    mexer();
    await sleep(200);
  }
  checar('nenhum balão na tela antes da sessão', Main.messageTray._notificationState === 0, Main.messageTray._notification?.title);
  const banners = new Gio.Settings({ schema_id: 'org.gnome.desktop.notifications' });
  checar('os balões começam ligados (sem "Não perturbe")', banners.get_boolean('show-banners'), null);

  // 1. Sessão de 60 min com a janela minimizada.
  const s1 = await comando(INICIAR(60));
  W.minimize();
  await sleep(300);
  // O shell aninhado abre a visão geral na partida; a mesa fica limpa, como
  // numa sessão comum com a janela minimizada.
  if (Main.overview.visible) Main.overview.hide();
  await sleep(700);
  checar('sem a visão geral na tela', !Main.overview.visible, null);
  checar('a janela ficou minimizada', W.minimized, null);
  const n0 = notificacoes.length;
  const b0 = baloes.length;
  const f0 = sons.length;
  await observarSons(66000);
  const n1 = notificacoes.slice(n0);
  const b1 = baloes.slice(b0);
  const f1 = sons.slice(f0);
  R.medidas.sessao60 = { inicio: s1, notificacoes: n1, baloes: b1, sons: f1 };
  const depois = await comando(LER);
  checar('a sessão de 60 min terminou', depois.status === 'completed', depois);
  // O próximo foco começa depois de 1650 s de foco e 300 s de intervalo.
  const proximo = hhmm(s1.startedAt + (1650 + 300) * 1000);
  const esperado = [
    ['Período de foco concluído', `Intervalo de 5 min. Próximo foco às ${proximo}.`],
    ['Intervalo concluído', 'Período de foco 2 de 2, 27 min.'],
    ['Sessão de foco concluída', '60 min de foco.'],
  ];
  checar(
    'três notificações, com os textos do plano',
    n1.length === 3 && esperado.every(([t, c], i) => n1[i]?.titulo === t && n1[i]?.corpo === c),
    { esperado, vistas: n1.map((n) => [n.titulo, n.corpo]) },
  );
  checar('o fim do foco chega por volta de 27,5 s e o do intervalo por volta de 32,5 s', n1.length === 3 && n1[1].t - n1[0].t >= 4000 && n1[1].t - n1[0].t <= 6000 && n1[2].t - n1[1].t >= 26000 && n1[2].t - n1[1].t <= 29000, n1.map((n) => n.t));
  checar('todas chegaram com a janela minimizada', n1.length === 3 && n1.every((n) => n.minimizada === true), n1.map((n) => n.minimizada));
  checar(
    'o fim do foco e o fim do intervalo mostram o balão na tela, com a janela minimizada, e ele segue lá 1,5 s depois',
    ['Período de foco concluído', 'Intervalo concluído'].every((t) => b1.some((b) => b.titulo === t && b.minimizada && b.aos1500)),
    b1,
  );
  if (PIPEWIRE) {
    checar('três sons tocaram, com a janela minimizada', f1.length === 3 && f1.every((f) => f.minimizada === true), f1);
    checar(
      'cada som sai junto da notificação (até 1,5 s de diferença)',
      f1.length === 3 && n1.length === 3 && f1.every((f, i) => Math.abs(f.t - n1[i].t) <= 1500),
      { sons: f1.map((f) => f.t), notificacoes: n1.map((n) => n.t) },
    );
  }

  // 2. "Não perturbe": sem balão, mas com a notificação na lista e o som.
  W.unminimize();
  await sleep(500);
  banners.set_boolean('show-banners', false);
  await sleep(300);
  const s2 = await comando(INICIAR(5));
  W.minimize();
  const n2i = notificacoes.length;
  const b2i = baloes.length;
  const f2i = sons.length;
  await observarSons(9000);
  const n2 = notificacoes.slice(n2i);
  const b2 = baloes.slice(b2i);
  const f2 = sons.slice(f2i);
  R.medidas.naoPerturbe = { inicio: s2, notificacoes: n2, baloes: b2, sons: f2 };
  checar('"Não perturbe": a notificação entra na lista, com o texto certo', n2.length === 1 && n2[0].titulo === 'Sessão de foco concluída' && n2[0].corpo === '5 min de foco.', n2);
  checar('"Não perturbe": nenhum balão na tela', b2.length === 0, b2);
  if (PIPEWIRE) checar('"Não perturbe": o som toca', f2.length === 1, f2);
  const fontes = Main.messageTray.getSources();
  R.medidas.fontes = fontes.map((f) => ({ titulo: f.title, notificacoes: f.notifications.map((n) => n.title) }));
  R.medidas.destruidas = destruidas;
  checar('nenhuma notificação do app foi apagada até aqui', destruidas.filter((d) => d.fonte === 'tomatito').length === 0, destruidas);
  const naLista = fontes.flatMap((f) => f.notifications.map((n) => n.title));
  checar(
    'as quatro notificações continuam na lista do shell',
    ['Período de foco concluído', 'Intervalo concluído', 'Sessão de foco concluída'].every((t) => naLista.includes(t)) &&
      naLista.filter((t) => t === 'Sessão de foco concluída').length === 2,
    naLista,
  );
  banners.set_boolean('show-banners', true);
  await sleep(1000);
  R.medidas.destruidasDepoisDeReligarOsBaloes = destruidas.filter((d) => d.fonte === 'tomatito');

  // 3. Fim atrasado: uma sessão de 5 min com o app congelado (SIGSTOP) por
  // 66 s. A 60×, o limite do atraso cresce junto (60 s × 60, ou 60 s de
  // verdade; docs/decisoes.md, M15): na volta, a fase venceu há mais que
  // isso, e sai um aviso só, "Sessão concluída às HH:MM", sem som.
  const pid = W.get_pid();
  const s3 = await comando(INICIAR(5));
  GLib.spawn_command_line_sync(`kill -STOP ${pid}`);
  passo(`app congelado (pid ${pid})`);
  await sleep(66000);
  const n3i = notificacoes.length;
  const f3i = sons.length;
  GLib.spawn_command_line_sync(`kill -CONT ${pid}`);
  passo('app descongelado');
  await observarSons(5000);
  const n3 = notificacoes.slice(n3i);
  const f3 = sons.slice(f3i);
  R.medidas.atrasado = { inicio: s3, notificacoes: n3, sons: f3 };
  const hora = hhmm(s3.startedAt + 5 * 60_000);
  checar(`fim atrasado: um aviso só, "Sessão concluída às ${hora}", sem corpo`, n3.length === 1 && n3[0].titulo === `Sessão concluída às ${hora}` && n3[0].corpo === '', n3);
  if (PIPEWIRE) checar('fim atrasado: sem som', f3.length === 0, f3);
  const depoisAtrasado = await comando(LER);
  checar('fim atrasado: a sessão termina concluída', depoisAtrasado.status === 'completed', depoisAtrasado);

  const erros = sonda().filter((x) => x.tipo === 'erro').map((x) => x.dados);
  checar('nenhum erro na página', erros.length === 0, erros);
  W.unminimize();
  await sleep(300);
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
