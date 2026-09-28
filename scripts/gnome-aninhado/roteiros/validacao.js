// Roteiro do M52 (validação com reversão e B3), carregado com
// `gnome-shell --automation-script` pelo dentro.sh. O roteiro abre o app
// sozinho (três partidas), com o binário de debug e o motor de verdade:
//
//   TT_PORT=5174 TT_LIMITE=600 bash scripts/gnome-aninhado/rodar.sh validacao
//
// O "Pronto quando" do M52, no que dá para medir sem um humano:
//   1. sem confirmação, o app volta ao tema anterior: a primeira entrada no
//      Full (fullValidated vazio) deixa a main na tela com a pergunta, e,
//      sem resposta, depois de 10 s o tomate fecha, a main fica no tema de
//      antes e oferece o modo opaco; a sessão de foco segue igual;
//   2. as respostas: Reverter (o botão e o Esc) volta na hora e oferece o
//      modo opaco; "Agora não" (o botão e o Esc) fecha a oferta; o Esc no
//      tomate no meio da pergunta cancela sem gravar; Manter grava a chave
//      (a mesma do registro "tomate pronto") e esconde a main; a entrada
//      seguinte, já validada, não pergunta;
//   3. "Usar o modo opaco" grava fullMode = opaque e abre o tomate opaco
//      (data-full-mode, cantos opacos na cor --tt-tomato-10), sem pergunta;
//   4. iniciar direto no Full sem a validação: a main nasce com a pergunta,
//      e sem resposta o app volta ao tema anterior;
//   5. com WEBKIT_DISABLE_DMABUF_RENDERER=1 no ambiente, o full_mode()
//      devolve Opaque: o Full abre opaco (o registro diz "opaca"), sem
//      pergunta, e o arraste vale no quadrado todo.
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
const LADO = 280;
const K = LADO / 320;
const OPACO = [0x21, 0x02, 0x01];
const R = { passos: [], checagens: {}, medidas: {} };

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

const LER_DIALOGO = `JSON.stringify((() => { const el = document.querySelector('.tt-dialogo-validacao');
  return { aberto: Boolean(el?.dialog?.open), nome: el?.getAttribute('aria-label') ?? null, texto: el?.textContent ?? '',
    prazo: el?.querySelector('[data-prazo]')?.textContent ?? null, foco: document.activeElement?.dataset?.resposta ?? null,
    papel: el?.dialog?.getAttribute('role') ?? null, pref: document.documentElement.dataset.themePref,
    tema: document.documentElement.dataset.theme, visivel: document.visibilityState }; })())`;
const LER_TOMATE = `JSON.stringify({ modo: document.documentElement.dataset.fullMode ?? null, tema: document.documentElement.dataset.theme,
  fundo: getComputedStyle(document.body).backgroundColor, estado: document.querySelector('.stage')?.dataset.state })`;
const dialogo = async () => JSON.parse(await comando('main', LER_DIALOGO));

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
async function clicar(x, y) {
  mover(x - 8, y - 8);
  await sleep(120);
  mover(x, y);
  await sleep(120);
  botao(true);
  await sleep(60);
  botao(false);
}
async function tecla(keyval) {
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

// Os quatro cantos (16 × 16) e o meio do corpo de uma captura do ator do
// tomate (com o canal alfa): o maior e o menor alfa e a cor média dos cantos.
function analisarTomate(w, nome) {
  const img = w.get_compositor_private().get_image(null);
  const arq = `${OUT}/${nome}.png`;
  img.writeToPNG(arq);
  const pb = GdkPixbuf.Pixbuf.new_from_file(arq);
  const [W, H, n, rs, px] = [pb.get_width(), pb.get_height(), pb.get_n_channels(), pb.get_rowstride(), pb.get_pixels()];
  const B = 16;
  let aMax = 0;
  let aMin = 255;
  const soma = [0, 0, 0];
  let tot = 0;
  for (const [ox, oy] of [[0, 0], [W - B, 0], [0, H - B], [W - B, H - B]]) {
    for (let y = oy; y < oy + B; y++)
      for (let x = ox; x < ox + B; x++) {
        const k = y * rs + x * n;
        const a = n === 4 ? px[k + 3] : 255;
        aMax = Math.max(aMax, a);
        aMin = Math.min(aMin, a);
        for (let c = 0; c < 3; c++) soma[c] += px[k + c];
        tot++;
      }
  }
  const k = Math.round(230 * K) * rs + Math.round(100 * K) * n;
  return { arq, w: W, h: H, cantos: { alfaMax: aMax, alfaMin: aMin, cor: soma.map((s) => Math.round(s / tot)) }, corpo: { alfa: n === 4 ? px[k + 3] : 255, cor: [px[k], px[k + 1], px[k + 2]] } };
}
// Uma captura da janela inteira (o ator, com o alfa), para os documentos.
function capturar(w, nome) {
  try {
    w.get_compositor_private().get_image(null).writeToPNG(`${OUT}/${nome}.png`);
  } catch (e) {
    passo(`captura ${nome} falhou: ${e}`);
  }
}
const transparente = (a) => a.cantos.alfaMax <= 8 && a.corpo.alfa === 255;
const opaco = (a) => a.cantos.alfaMin === 255 && a.cantos.cor.every((c, i) => Math.abs(c - OPACO[i]) <= 3) && a.corpo.alfa === 255;

let proc = null;
let pid = null;
let partida = 0;
async function abrir(ambiente = {}) {
  partida++;
  const L = new Gio.SubprocessLauncher({ flags: Gio.SubprocessFlags.STDERR_MERGE });
  L.setenv('WAYLAND_DISPLAY', 'tt-aninhado', true);
  L.setenv('GDK_BACKEND', 'wayland', true);
  L.unsetenv('WEBKIT_DISABLE_DMABUF_RENDERER');
  for (const [k, v] of Object.entries(ambiente)) L.setenv(k, v, true);
  L.set_stdout_file_path(`${OUT}/app-${partida}.log`);
  proc = L.spawnv([BIN]);
  pid = proc.get_identifier();
  passo(`partida ${partida}: pid ${pid} ${JSON.stringify(ambiente)}`);
}
const vivo = () => proc && !proc.get_if_exited() && !proc.get_if_signaled();
async function fechar() {
  proc.send_signal(15);
  await esperar(() => !vivo(), 10000, 'o app fechado').catch(() => proc.force_exit());
  await sleep(800);
}
const bytesDoLog = (i = partida) => {
  try {
    return GLib.file_get_contents(`${OUT}/app-${i}.log`)[1];
  } catch {
    return new Uint8Array();
  }
};
const logDoApp = (i = partida) => new TextDecoder().decode(bytesDoLog(i));
const trechoDesde = (n) => new TextDecoder().decode(bytesDoLog().slice(n));

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
// Clica num botão do diálogo da validação, na main (por cima do tomate).
async function clicarNoDialogo(resposta) {
  const m = main();
  Main.activateWindow(m);
  await sleep(250);
  const caixa = JSON.parse(
    await comando('main', `(() => { const r = document.querySelector('.tt-dialogo-validacao [data-resposta="${resposta}"]').getBoundingClientRect(); return JSON.stringify([r.x, r.y, r.width, r.height]); })()`),
  );
  const r = rect(m);
  await clicar(r.x + caixa[0] + caixa[2] / 2, r.y + caixa[1] + caixa[3] / 2);
}
async function escNa(w) {
  Main.activateWindow(w);
  await sleep(250);
  await tecla(Clutter.KEY_Escape);
}
// O tomate à esquerda, longe do diálogo da main (à direita).
function afastarTomate() {
  const t = tomate();
  if (t) t.move_frame(true, 120, 200);
}
async function esperarPergunta(oque) {
  await esperar(() => tomate(), 12000, `o tomate (${oque})`);
  const d = await esperar(async () => {
    if (!main()) return null;
    const x = await dialogo();
    return x.aberto && x.nome === 'O tomate aparece com o fundo transparente?' ? x : null;
  }, 12000, `a pergunta (${oque})`);
  afastarTomate();
  return d;
}
const estadoDaValidacao = (janela) => ipc(janela, 'full_validation_get');
const configuracoes = (janela) => ipc(janela, 'settings_get');

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

  // Partida 1: Lite, sem validação, a main em Configurações e uma sessão de 60 min.
  await abrir();
  const m0 = await esperar(() => main(), 90000, 'a main');
  await esperar(() => sonda().some((e) => e.janela === 'main' && e.tipo === 'estado' && e.dados?.nav?.itens?.length === 4), 30000, 'a main desenhada');
  await semVisaoGeral();
  if (m0.is_maximized()) m0.unmaximize();
  m0.move_resize_frame(true, 960, 150, 900, 700);
  await sleep(600);
  await comando('main', "(location.hash = '#/configuracoes', 'ok')");
  await ipc('main', 'focus_start', { minutes: 60, skipBreaks: false, taskId: null });
  const f0 = (await ipc('main', 'get_state')).focus;
  const s0 = await configuracoes('main');
  checar('partida 1: Lite, fullMode auto, sem validação e uma sessão de 60 min', s0.theme === 'lite' && s0.fullMode === 'auto' && s0.fullValidated === '' && f0.status === 'focus', { theme: s0.theme, fullMode: s0.fullMode, fullValidated: s0.fullValidated, status: f0.status });

  // 1. Sem resposta: 10 s depois, o tema anterior e a oferta do B3.
  await clicarNaPrevia('full');
  const d1 = await esperarPergunta('sem resposta');
  const t1 = agoraMs();
  const sP = await configuracoes('main');
  const v1 = await estadoDaValidacao('main');
  const a1 = analisarTomate(tomate(), 'pergunta-tomate');
  const tm1 = JSON.parse(await comando('tomato', LER_TOMATE));
  capturar(main(), 'pergunta-main');
  checar(
    'a primeira entrada pergunta: o tomate transparente na tela e a main junto, com o diálogo alertdialog "O tomate aparece com o fundo transparente?", a contagem de 10 s e o foco em Manter',
    Boolean(main()) && Boolean(tomate()) && d1.visivel === 'visible' && d1.papel === 'alertdialog' && /Voltando ao tema anterior em (10|9) segundos\./.test(d1.prazo) && d1.foco === 'keep' && /Manter/.test(d1.texto) && /Reverter/.test(d1.texto) && v1.state === 'asking' && v1.seconds === 10 && sP.theme === 'full' && transparente(a1) && tm1.modo === null,
    { dialogo: d1, validacao: v1, theme: sP.theme, tomate: a1, pagina: tm1, janelas: doApp().map(rect) },
  );
  await sleep(3000);
  const d1b = await dialogo();
  const restante = Number(/em (\d+) segundo/.exec(d1b.prazo)?.[1]);
  await esperar(() => !tomate(), 15000, 'a reversão pelo prazo').catch(() => null);
  const dt1 = Math.round(agoraMs() - t1);
  await sleep(500);
  const d1c = await dialogo();
  capturar(main(), 'oferta-main');
  const s1 = await configuracoes('main');
  const f1 = (await ipc('main', 'get_state')).focus;
  R.medidas.prazo = { reverteuEmMs: dt1, contagemAos3s: d1b.prazo };
  checar(
    'sem confirmação, o app volta ao tema anterior: aos 10 s o tomate fecha, a main fica no Lite e oferece o modo opaco',
    !tomate() && Boolean(main()) && dt1 >= 8500 && dt1 <= 11500 && restante >= 6 && restante <= 8 && s1.theme === 'lite' && s1.lastNormalTheme === 'lite' && s1.fullValidated === '' && s1.fullMode === 'auto' && d1c.aberto && d1c.pref === 'lite' && d1c.tema === 'lite' && d1c.visivel === 'visible' && d1c.nome === 'Usar o modo opaco?' && /Sem resposta, o Tomatito voltou ao tema anterior\./.test(d1c.texto) && d1c.foco === 'opaque',
    { reverteuEmMs: dt1, contagemAos3s: d1b.prazo, dialogo: d1c, theme: s1.theme, fullValidated: s1.fullValidated, fullMode: s1.fullMode },
  );
  checar('a sessão de foco segue igual depois da reversão', f1.status === 'focus' && f1.session?.id === f0.session?.id && f1.session?.endsAt === f0.session?.endsAt, { antes: f0.session?.endsAt, depois: f1.session?.endsAt });
  await clicarNoDialogo('dismiss');
  await sleep(600);
  const d1d = await dialogo();
  const v1d = await estadoDaValidacao('main');
  checar('"Agora não" fecha a oferta', !d1d.aberto && v1d.state === 'none' && (await configuracoes('main')).fullMode === 'auto', { dialogo: d1d, validacao: v1d });

  // 2. Reverter pelo botão: volta na hora e oferece o modo opaco; o Esc fecha a oferta.
  await clicarNaPrevia('full');
  await esperarPergunta('Reverter');
  const t2 = agoraMs();
  await clicarNoDialogo('revert');
  await esperar(() => !tomate(), 6000, 'a volta pelo Reverter').catch(() => null);
  const dt2 = Math.round(agoraMs() - t2);
  await sleep(400);
  const d2 = await dialogo();
  const s2 = await configuracoes('main');
  checar(
    'Reverter volta ao tema anterior na hora e oferece o modo opaco',
    !tomate() && dt2 < 4000 && s2.theme === 'lite' && s2.fullValidated === '' && d2.aberto && d2.nome === 'Usar o modo opaco?' && /O Tomatito voltou ao tema anterior\./.test(d2.texto),
    { ms: dt2, dialogo: d2, theme: s2.theme },
  );
  await escNa(main());
  await sleep(600);
  const d2b = await dialogo();
  checar('o Esc na oferta é "Agora não"', !d2b.aberto && (await estadoDaValidacao('main')).state === 'none', { dialogo: d2b });

  // 3. O Esc na pergunta é Reverter.
  await clicarNaPrevia('full');
  await esperarPergunta('Esc');
  await escNa(main());
  await esperar(() => !tomate(), 6000, 'a volta pelo Esc').catch(() => null);
  await sleep(400);
  const d3 = await dialogo();
  checar('o Esc na pergunta é Reverter', !tomate() && d3.aberto && d3.nome === 'Usar o modo opaco?' && /O Tomatito voltou ao tema anterior\./.test(d3.texto), { dialogo: d3 });
  await clicarNoDialogo('dismiss');
  await sleep(500);

  // 4. Sair do Full pelo tomate no meio da pergunta: cancela, sem gravar e sem oferta.
  await clicarNaPrevia('full');
  await esperarPergunta('Esc no tomate');
  await escNa(tomate());
  await esperar(() => !tomate(), 6000, 'a saída pelo tomate').catch(() => null);
  await sleep(600);
  const d4 = await dialogo();
  const s4 = await configuracoes('main');
  const v4 = await estadoDaValidacao('main');
  checar('sair pelo tomate no meio da pergunta cancela: sem oferta e sem gravar', !tomate() && !d4.aberto && v4.state === 'none' && s4.theme === 'lite' && s4.fullValidated === '', { dialogo: d4, validacao: v4, theme: s4.theme, fullValidated: s4.fullValidated });

  // 5. Manter: grava a chave e esconde a main.
  const logAntes5 = bytesDoLog().length;
  await clicarNaPrevia('full');
  await esperarPergunta('Manter');
  await clicarNoDialogo('keep');
  const soTomate = await esperar(() => doApp().length === 1 && tomate(), 6000, 'só o tomate depois do Manter').catch(() => null);
  await sleep(500);
  const s5 = await configuracoes('tomato');
  const chaveDoLog = [...trechoDesde(logAntes5).matchAll(/tomate pronto(?: e pintado)?: ([^\n]*)/g)].map((m) => m[1]).at(-1);
  R.medidas.chave = s5.fullValidated;
  checar(
    'Manter grava fullValidated com a chave desta combinação (a do registro "tomate pronto") e esconde a main',
    Boolean(soTomate) && s5.theme === 'full' && s5.fullValidated !== '' && s5.fullValidated === chaveDoLog && /webview \d/.test(s5.fullValidated),
    { theme: s5.theme, fullValidated: s5.fullValidated, chaveDoLog, janelas: doApp().map(rect) },
  );
  await escNa(tomate());
  await esperar(() => !tomate() && main(), 6000, 'a volta depois do Manter').catch(() => null);
  await sleep(500);

  // 6. Validada: a entrada seguinte não pergunta.
  const v6a = await estadoDaValidacao('main');
  const logAntes6 = bytesDoLog().length;
  await clicarNaPrevia('full');
  const so6 = await esperar(() => doApp().length === 1 && tomate(), 12000, 'só o tomate, sem pergunta').catch(() => null);
  await sleep(500);
  const v6 = await estadoDaValidacao('tomato');
  const trecho6 = trechoDesde(logAntes6);
  checar(
    'com a combinação já validada, a entrada não pergunta: a main some e o registro diz transparente',
    Boolean(so6) && v6.seq === v6a.seq && v6.state === 'none' && /entrada no Full: [^\n]*, pintada em \d+ ms, transparente/.test(trecho6) && !/validação pedida/.test(trecho6),
    { validacao: [v6a, v6], trecho: trecho6.split('\n').filter((l) => l.includes('entrada no Full')) },
  );
  await escNa(tomate());
  await esperar(() => !tomate() && main(), 6000, 'a volta').catch(() => null);
  await sleep(500);

  // 7. "Usar o modo opaco": grava fullMode = opaque e entra de novo, opaco e sem pergunta.
  await ipc('main', 'settings_set', { patch: { fullValidated: '' } });
  await clicarNaPrevia('full');
  await esperarPergunta('modo opaco');
  await clicarNoDialogo('revert');
  await esperar(async () => !tomate() && (await dialogo()).nome === 'Usar o modo opaco?', 6000, 'a oferta').catch(() => null);
  const logAntes7 = bytesDoLog().length;
  await clicarNoDialogo('opaque');
  const so7 = await esperar(() => doApp().length === 1 && tomate(), 12000, 'o tomate opaco').catch(() => null);
  await sleep(800);
  const s7 = await configuracoes('tomato');
  const tm7 = JSON.parse(await comando('tomato', LER_TOMATE));
  const a7 = so7 ? analisarTomate(tomate(), 'opaco-pela-oferta') : null;
  const trecho7 = trechoDesde(logAntes7);
  checar(
    '"Usar o modo opaco" grava fullMode = opaque e abre o tomate opaco (cantos em --tt-tomato-10), sem pergunta e sem a main',
    Boolean(so7) && s7.fullMode === 'opaque' && s7.theme === 'full' && tm7.modo === 'opaque' && a7 && opaco(a7) && /entrada no Full: [^\n]*, opaca/.test(trecho7) && !/validação pedida/.test(trecho7),
    { fullMode: s7.fullMode, pagina: tm7, tomate: a7, trecho: trecho7.split('\n').filter((l) => l.includes('entrada no Full')) },
  );
  await escNa(tomate());
  await esperar(() => !tomate() && main(), 6000, 'a volta do opaco').catch(() => null);
  await sleep(500);
  await ipc('main', 'settings_set', { patch: { fullMode: 'auto', fullValidated: '' } });

  // 8. O app fecha no meio da pergunta: theme = full e nada validado.
  await clicarNaPrevia('full');
  await esperarPergunta('fechar no meio');
  const s8 = await configuracoes('main');
  checar('fechado no meio da pergunta, o settings.json fica com theme = full e sem validação', s8.theme === 'full' && s8.fullValidated === '' && s8.fullMode === 'auto', { theme: s8.theme, fullValidated: s8.fullValidated });
  checar('sem pânico na partida 1', !/panicked at/.test(logDoApp(1)) && vivo(), { vivo: vivo() });
  await fechar();

  // Partida 2: direto no Full, sem validação: a main nasce com a pergunta; sem resposta, volta.
  const mainsAntes = infos('main');
  await abrir();
  await esperar(() => tomate(), 60000, 'o tomate na partida 2');
  const m2 = await esperar(() => main(), 20000, 'a main criada pela validação').catch(() => null);
  if (m2) m2.move_resize_frame(true, 960, 150, 900, 700);
  const d9 = await esperar(async () => {
    if (!main() || infos('main') <= mainsAntes) return null;
    const x = await dialogo();
    return x.aberto ? x : null;
  }, 15000, 'a pergunta na main nova').catch(() => null);
  const t9 = agoraMs();
  checar(
    'iniciar direto no Full sem a validação: a main nasce (no tema normal) com a pergunta, e o tomate está na tela',
    Boolean(d9) && Boolean(tomate()) && d9.nome === 'O tomate aparece com o fundo transparente?' && d9.pref === 'full' && d9.tema === 'lite' && d9.visivel === 'visible',
    { dialogo: d9, janelas: doApp().map(rect) },
  );
  await esperar(() => !tomate(), 15000, 'a reversão na partida 2').catch(() => null);
  const dt9 = Math.round(agoraMs() - t9);
  await sleep(600);
  const d9b = await dialogo();
  const s9 = await configuracoes('main');
  checar(
    'na partida direto no Full, sem confirmação o app também volta ao tema anterior e oferece o modo opaco',
    !tomate() && dt9 <= 11500 && s9.theme === 'lite' && s9.fullValidated === '' && d9b.aberto && /Sem resposta/.test(d9b.texto) && d9b.pref === 'lite',
    { ms: dt9, dialogo: d9b, theme: s9.theme },
  );
  await clicarNoDialogo('dismiss');
  await sleep(500);
  checar('sem pânico na partida 2', !/panicked at/.test(logDoApp(2)) && vivo(), { vivo: vivo() });
  await fechar();

  // Partida 3: WEBKIT_DISABLE_DMABUF_RENDERER=1 → full_mode() = Opaque.
  await abrir({ WEBKIT_DISABLE_DMABUF_RENDERER: '1' });
  const m3 = await esperar(() => main(), 60000, 'a main na partida 3');
  await esperar(() => infos('main') > mainsAntes + 1, 30000, 'a página da main na partida 3');
  await sleep(1500);
  m3.move_resize_frame(true, 960, 150, 900, 700);
  await sleep(500);
  await comando('main', "(location.hash = '#/configuracoes', 'ok')");
  const s10a = await configuracoes('main');
  const logAntes10 = bytesDoLog().length;
  await clicarNaPrevia('full');
  const so10 = await esperar(() => doApp().length === 1 && tomate(), 12000, 'o tomate opaco pela variável').catch(() => null);
  await sleep(800);
  const tm10 = JSON.parse(await comando('tomato', LER_TOMATE));
  const v10 = await estadoDaValidacao('tomato');
  const a10 = so10 ? analisarTomate(tomate(), 'opaco-pela-variavel') : null;
  const trecho10 = trechoDesde(logAntes10);
  R.medidas.opacoPelaVariavel = { tomate: a10, pagina: tm10 };
  checar(
    'com WEBKIT_DISABLE_DMABUF_RENDERER=1, o full_mode() devolve Opaque: o Full abre opaco (registro "opaca", data-full-mode, cantos em --tt-tomato-10), sem pergunta, com fullMode ainda auto',
    Boolean(so10) && s10a.fullMode === 'auto' && s10a.fullValidated === '' && tm10.modo === 'opaque' && tm10.fundo === 'rgb(33, 2, 1)' && a10 && opaco(a10) && v10.state === 'none' && /entrada no Full: [^\n]*, opaca/.test(trecho10) && !/validação pedida/.test(trecho10) && /WEBKIT_DISABLE_DMABUF_RENDERER=1/.test(trecho10),
    { fullMode: s10a.fullMode, pagina: tm10, validacao: v10, tomate: a10, trecho: trecho10.split('\n').filter((l) => /entrada no Full|tomate pronto/.test(l)) },
  );
  // O arraste vale no quadrado todo (o canto de cima, fora do desenho).
  if (so10) {
    await semVisaoGeral();
    const r0 = rect(tomate());
    const [x, y] = [r0.x + 12, r0.y + 12];
    mover(x, y);
    await sleep(150);
    botao(true);
    await sleep(400);
    for (let i = 1; i <= 15; i++) {
      mover(x + (140 * i) / 15, y + (60 * i) / 15);
      await sleep(30);
    }
    await sleep(200);
    botao(false);
    await sleep(600);
    const r1 = rect(tomate());
    const delta = [r1.x - r0.x, r1.y - r0.y];
    checar('no modo opaco, arrastar pelo canto do quadrado move o tomate', Math.abs(delta[0] - 140) <= 3 && Math.abs(delta[1] - 60) <= 3, { delta });
  }
  await escNa(tomate());
  await esperar(() => !tomate() && main(), 6000, 'a volta na partida 3').catch(() => null);
  await sleep(500);
  const s10 = await configuracoes('main');
  checar('Esc volta ao Lite também no modo opaco', !tomate() && s10.theme === 'lite', { theme: s10.theme });
  checar('sem pânico na partida 3', !/panicked at/.test(logDoApp(3)) && vivo(), { vivo: vivo() });

  const erros = sonda().filter((x) => x.tipo === 'erro').map((x) => `${x.janela}: ${x.dados}`);
  checar('nenhum erro nas páginas', erros.length === 0, erros.slice(0, 10));
  await fechar();
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
