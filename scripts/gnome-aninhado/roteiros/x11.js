// Roteiro do M57 (Compatibilidade X11, plano B2), carregado com
// `gnome-shell --automation-script` pelo dentro.sh, com o Xwayland ligado:
//
//   TT_X11=1 bash scripts/gnome-aninhado/rodar.sh x11
//   TT_X11=1 TT_PORT=5174 bash scripts/gnome-aninhado/rodar.sh x11   # binário compilado para a 5174
//
// O "Pronto quando" do M57, no que dá para medir sem um humano:
//   1. no Wayland, as Configurações mostram a opção desligada; ligá-la grava
//      a `linuxX11` e oferece "Reiniciar agora";
//   2. o botão reinicia o app, e o app novo é um cliente X11 (Xwayland), com
//      o `tomato_on_top_available` verdadeiro;
//   3. no Full, o tomate é um cliente X11 e fica por cima pelo código: o
//      `tomatoOnTop` gravado liga e desliga o "acima" que o Mutter vê; e a
//      região de entrada vale no X11 (a forma de entrada que o X vê, pelo
//      x11-forma.py, e o clique no canto chegando à main);
//   4. desligar a opção e reiniciar volta ao Wayland (o `GDK_BACKEND` que o
//      app pôs sai do ambiente herdado pelo reinício).
//
// O app é aberto por este roteiro (no Wayland, com o DISPLAY do Xwayland do
// shell no ambiente, como numa sessão GNOME de verdade), e o reinício é do
// próprio app: o processo novo é filho do antigo e herda o app.log.
export const LANCA_O_APP = true;

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import 'resource:///org/gnome/shell/ui/screenshot.js'; // promisifica Shell.Screenshot

export const METRICS = {};

const OUT = GLib.getenv('TT_OUT');
const SONDA_LOG = GLib.getenv('SONDA_LOG');
const BIN = GLib.getenv('TOMATITO_BIN');
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
const cliente = (w) => (w.get_client_type() === Meta.WindowClientType.X11 ? 'x11' : 'wayland');
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
const logDoApp = () => {
  try {
    return new TextDecoder().decode(GLib.file_get_contents(`${OUT}/app.log`)[1]);
  } catch {
    return '';
  }
};

async function esperar(fn, ms, oque) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const v = await fn();
    if (v) return v;
    await sleep(100);
  }
  throw new Error(`tempo esgotado: ${oque}`);
}
const talvez = (fn, ms, oque) => esperar(fn, ms, oque).catch(() => null);

let nComando = 0;
function mandar(janela, js) {
  const id = `c${++nComando}`;
  GLib.file_set_contents(`${OUT}/comando.json`, JSON.stringify({ id, janela, js }));
  return id;
}
async function comando(janela, js, prazo = 15000) {
  const id = mandar(janela, js);
  const r = await esperar(
    () => sonda().find((e) => e.tipo === 'comando' && e.dados.id === id),
    prazo,
    `comando (${janela}) ${js.slice(0, 80)}`,
  );
  const texto = JSON.stringify(r.dados.resultado) ?? 'null';
  passo(`comando ${janela}: ${js.slice(0, 100)} => ${texto.length > 300 ? `${texto.slice(0, 300)}…` : texto}`);
  return r.dados.resultado;
}
const ipc = (cmd, args = {}, janela = 'main') =>
  comando(janela, `window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args)}).then((r) => JSON.stringify(r ?? null), (e) => 'erro: ' + e)`).then(
    (t) => (typeof t === 'string' && !t.startsWith('erro') ? JSON.parse(t) : t),
  );

async function captura(nome, area) {
  const shooter = new Shell.Screenshot();
  const s = Gio.File.new_for_path(`${OUT}/${nome}`).replace(null, false, Gio.FileCreateFlags.NONE, null);
  await shooter.screenshot_area(area.x, area.y, area.w, area.h, s);
  s.close(null);
  passo(`captura ${nome}`);
}

async function semVisaoGeral() {
  for (let i = 0; i < 20 && (Main.overview.visible || Main.overview.animationInProgress); i++) {
    if (!Main.overview.animationInProgress) Main.overview.hide();
    await sleep(400);
  }
}

// A main de um processo: a janela "Tomatito" que não é a anterior, desenhada
// (a sonda manda o estado com os 4 itens do painel).
async function novaMain(anterior, oque) {
  // A sonda antes da janela: a página pode mandar o estado antes de o
  // compositor mostrar a janela.
  const desde = sonda().length;
  const w = await esperar(() => janelas().find((j) => j !== anterior && rect(j).w > 320), 90000, oque);
  await esperar(() => sonda().slice(desde).some((e) => e.janela === 'main' && e.tipo === 'estado' && e.dados?.nav?.itens?.length === 4), 60000, `${oque} (desenhada)`);
  await semVisaoGeral();
  if (w.is_maximized()) w.unmaximize();
  w.move_resize_frame(true, 200, 120, 1000, 700);
  await sleep(800);
  return w;
}

// O cartão da opção, lido na página das Configurações.
const LER_OPCAO =
  "JSON.stringify((() => { const c = document.querySelector('[data-cartao=\"x11\"]'); if (!c) return null; const s = c.querySelector('fluent-switch'); const p = c.querySelector('.tt-config-rodape'); return { ligada: s.checked === true, rodape: p.hidden ? null : p.textContent, botao: Boolean(p.querySelector('[data-reiniciar]')), titulo: c.querySelector('.tt-config-titulo').textContent }; })())";
async function abrirConfiguracoes() {
  await comando('main', "(location.hash = '#/configuracoes', 'ok')");
  return JSON.parse(await esperar(async () => {
    const v = await comando('main', LER_OPCAO);
    return v && v !== 'null' ? v : null;
  }, 15000, 'o cartão da Compatibilidade X11'));
}
const lerOpcao = async () => JSON.parse(await comando('main', LER_OPCAO));

// Reinicia pelo botão da tela, depois de o comando responder (o reinício
// mata a página antes da resposta), e troca o comando.json por um neutro,
// para a página do processo novo não clicar de novo.
async function reiniciarPeloBotao(main) {
  const r = await comando('main', "(setTimeout(() => document.querySelector('[data-reiniciar]').click(), 800), 'agendado')");
  mandar(null, "'neutro'");
  const saiu = await talvez(() => !janelas().includes(main), 20000, 'a main antiga fechada');
  return { r, saiu: Boolean(saiu) };
}

// O ponteiro virtual, como no roteiro do M54 (regiao.js).
let ptr = null;
const agora = () => GLib.get_monotonic_time();
async function clicar(x, y) {
  await semVisaoGeral();
  ptr.notify_absolute_motion(agora(), x, y);
  await sleep(150);
  ptr.notify_button(agora(), Clutter.BUTTON_PRIMARY, Clutter.ButtonState.PRESSED);
  await sleep(80);
  ptr.notify_button(agora(), Clutter.BUTTON_PRIMARY, Clutter.ButtonState.RELEASED);
  await sleep(500);
}

let proc = null;
function abrir(display) {
  const L = new Gio.SubprocessLauncher({ flags: Gio.SubprocessFlags.STDERR_MERGE });
  L.setenv('WAYLAND_DISPLAY', 'tt-aninhado', true);
  if (display) L.setenv('DISPLAY', display, true);
  L.unsetenv('GDK_BACKEND');
  L.set_stdout_file_path(`${OUT}/app.log`);
  proc = L.spawnv([BIN]);
  passo(`app aberto: pid ${proc.get_identifier()}, DISPLAY=${display}`);
}

async function principal() {
  passo('início');
  try {
    Main.messageTray.bannerBlocked = true;
  } catch {
    // segue
  }
  // O Xwayland do shell (sob demanda): o DISPLAY aparece no ambiente dele.
  ptr = global.stage.context.get_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
  const display = await talvez(() => GLib.getenv('DISPLAY'), 20000, 'o DISPLAY do Xwayland');
  checar('o shell aninhado tem Xwayland (DISPLAY)', Boolean(display), display);
  abrir(display);

  // 1. No Wayland: a opção aparece desligada.
  let main = await novaMain(null, 'a main (Wayland)');
  checar('o app abre como cliente Wayland', cliente(main) === 'wayland', cliente(main));
  const sit0 = await ipc('x11_compat_get');
  const topo0 = await ipc('tomato_on_top_available');
  checar('no Wayland: x11_compat_get disponível, não ativa, com Xwayland; sem sempre na frente por código', sit0?.disponivel === true && sit0.ativa === false && sit0.xwayland === true && topo0 === false, { sit0, topo0 });
  const op0 = await abrirConfiguracoes();
  checar('as Configurações mostram a Compatibilidade X11 desligada, sem rodapé', op0.titulo === 'Compatibilidade X11' && op0.ligada === false && op0.rodape === null, op0);
  const r0 = rect(main);
  await captura('m57-opcao.png', r0);

  // Ligar: grava a linuxX11 e oferece o reinício.
  await comando('main', "(document.querySelector('[data-cartao=\"x11\"] fluent-switch').click(), 'ok')");
  const op1 = await esperar(async () => {
    const v = await lerOpcao();
    return v?.botao ? v : null;
  }, 5000, 'o rodapé do reinício').catch(() => null);
  const s1 = await ipc('settings_get');
  checar('ligar grava linuxX11 e mostra "Reiniciar agora"', s1?.linuxX11 === true && op1?.ligada === true && op1?.botao === true, { linuxX11: s1?.linuxX11, op1 });
  await captura('m57-reiniciar.png', rect(main));

  // 2. Reiniciar: o app novo é um cliente X11.
  const re1 = await reiniciarPeloBotao(main);
  checar('"Reiniciar agora" fecha o app', re1.saiu && re1.r === 'agendado', re1);
  const antiga = main;
  main = await novaMain(antiga, 'a main depois do reinício (X11)');
  checar('o app reiniciado é um cliente X11 (Xwayland)', cliente(main) === 'x11', cliente(main));
  const sit1 = await ipc('x11_compat_get');
  const topo1 = await ipc('tomato_on_top_available');
  checar('no X11: x11_compat_get ativa e sempre na frente por código', sit1?.ativa === true && topo1 === true, { sit1, topo1 });
  const log1 = logDoApp();
  checar('o registro: reinício pedido e GDK_BACKEND=x11 posto pelo app', /reiniciando \(Compatibilidade X11\)/.test(log1) && /linuxX11 ligada: GDK_BACKEND=x11\n/.test(log1), null);
  const op2 = await abrirConfiguracoes();
  checar('no X11, a opção aparece ligada e sem rodapé', op2.ligada === true && op2.rodape === null, op2);

  // 3. O Full no X11: o tomate por cima pelo código.
  const s2 = await ipc('settings_get');
  const ESPERAR_DIALOGO =
    "new Promise((r) => { const t0 = Date.now(); const f = () => (document.querySelector('.tt-dialogo-validacao')?.dialog?.open || Date.now() - t0 > 3000 ? r() : setTimeout(f, 50)); f(); })";
  const aberto = await comando(
    'main',
    `window.__TAURI_INTERNALS__.invoke('switch_window_mode', { full: true }).then(() => ${ESPERAR_DIALOGO}).then(() => window.__TAURI_INTERNALS__.invoke('full_validation_answer', { answer: 'keep' })).then(() => window.__TAURI_INTERNALS__.invoke('show_main', { route: null })).then(() => 'aberto', (e) => 'erro: ' + e)`,
  );
  const tomato = await talvez(() => janelas().find((w) => w !== main && rect(w).w === 280 && rect(w).h === 280), 30000, 'o tomate');
  checar('o tomate abre como cliente X11', aberto === 'aberto' && tomato && cliente(tomato) === 'x11', { aberto, cliente: tomato && cliente(tomato) });
  if (tomato) {
    await esperar(() => sonda().some((e) => e.janela === 'tomato' && e.tipo === 'info'), 30000, 'a página do tomate');
    main = await talvez(() => janelas().find((w) => w !== tomato && rect(w).w > 320), 10000, 'a main de volta') ?? main;
    main.move_resize_frame(true, 200, 120, 1000, 700);
    tomato.move_frame(true, 700, 300);
    await sleep(1200);
    checar(`com tomatoOnTop=${s2?.tomatoOnTop}, o tomate está acima`, s2?.tomatoOnTop === true && tomato.is_above(), { tomatoOnTop: s2?.tomatoOnTop, acima: tomato.is_above() });
    // A main ativa não cobre o tomate: ele continua por cima.
    Main.activateWindow(main);
    await sleep(800);
    await captura('m57-tomate-x11.png', { x: 180, y: 100, w: 1000, h: 740 });
    await ipc('settings_set', { patch: { tomatoOnTop: false } });
    const desligou = await talvez(() => !tomato.is_above(), 5000, 'o tomate sem acima');
    await ipc('settings_set', { patch: { tomatoOnTop: true } });
    const religou = await talvez(() => tomato.is_above(), 5000, 'o tomate acima de novo');
    checar('o tomatoOnTop liga e desliga o "acima" pelo código', Boolean(desligou) && Boolean(religou), { desligou: Boolean(desligou), religou: Boolean(religou) });
    // A forma de entrada que o X vê (x11-forma.py, pelo DISPLAY do Xwayland).
    try {
      const pasta = GLib.path_get_dirname(GLib.path_get_dirname(GLib.getenv('TT_ROTEIRO')));
      const L = new Gio.SubprocessLauncher({ flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_MERGE });
      L.setenv('DISPLAY', display, true);
      const p = L.spawnv(['python3', `${pasta}/x11-forma.py`]);
      const [, saida] = await new Promise((res, rej) => p.communicate_utf8_async(null, null, (pp, r) => {
        try {
          res(pp.communicate_utf8_finish(r));
        } catch (e) {
          rej(e);
        }
      }));
      R.medidas.formaX11 = saida.trim();
      passo(`forma no X11: ${saida.trim().slice(0, 600)}`);
    } catch (e) {
      passo(`forma no X11: erro ${e}`);
    }
    // A região de entrada também no X11 (a forma de entrada do GTK vira
    // XShape): o canto, fora do desenho, chega à main; o corpo fica no tomate.
    // O critério é o do M54: o foco (Mutter) e o mousedown (a página).
    const mousedowns = (desde, janela) => sonda().slice(desde).filter((e) => e.tipo === 'mousedown' && e.janela === janela).length;
    const r = rect(tomato);
    const m = rect(main);
    // Aquecimento: no Xwayland aninhado, o primeiro clique do ponteiro
    // virtual numa janela X11 se perde (nem o foco muda, nem a página o vê;
    // em 4 rodadas, sempre o primeiro, fosse no canto ou na main). O clique
    // na main, longe do tomate, fica anotado e não conta.
    Main.activateWindow(tomato);
    await sleep(600);
    let desde = sonda().length;
    await clicar(m.x + 120, m.y + 400);
    await sleep(300);
    const aquecimento = { foco: global.display.focus_window === main, mousedown: mousedowns(desde, 'main') };
    Main.activateWindow(tomato);
    await sleep(600);
    desde = sonda().length;
    await clicar(r.x + 4, r.y + 4);
    await sleep(300);
    const canto = { foco: global.display.focus_window === main ? 'main' : global.display.focus_window === tomato ? 'tomato' : 'outra', main: mousedowns(desde, 'main'), tomato: mousedowns(desde, 'tomato') };
    Main.activateWindow(tomato);
    await sleep(600);
    desde = sonda().length;
    await clicar(r.x + (70 * r.w) / 320, r.y + (200 * r.w) / 320);
    await sleep(300);
    const corpo = { foco: global.display.focus_window === tomato, tomato: mousedowns(desde, 'tomato') };
    R.medidas.cliquesX11 = { aquecimento, canto, corpo };
    checar('no X11, o canto atravessa para a main e o corpo fica no tomate', canto.foco === 'main' && canto.main > 0 && corpo.foco && corpo.tomato > 0, { aquecimento, canto, corpo });
    const sai = await comando('main', "window.__TAURI_INTERNALS__.invoke('switch_window_mode', { full: false }).then(() => 'saiu', (e) => 'erro: ' + e)");
    const fechou = await talvez(() => !janelas().includes(tomato), 8000, 'o tomate fechado');
    checar('sai do Full', sai === 'saiu' && Boolean(fechou), { sai });
  }

  // 4. Desligar e reiniciar: volta ao Wayland.
  main = await esperar(() => janelas().find((w) => rect(w).w > 320), 10000, 'a main');
  await sleep(500);
  await abrirConfiguracoes();
  await comando('main', "(document.querySelector('[data-cartao=\"x11\"] fluent-switch').click(), 'ok')");
  const op3 = await esperar(async () => {
    const v = await lerOpcao();
    return v?.botao ? v : null;
  }, 5000, 'o rodapé do reinício').catch(() => null);
  const s3 = await ipc('settings_get');
  checar('desligar grava linuxX11=false e oferece o reinício', s3?.linuxX11 === false && op3?.ligada === false && op3?.botao === true, { linuxX11: s3?.linuxX11, op3 });
  const re2 = await reiniciarPeloBotao(main);
  const antiga2 = main;
  main = await novaMain(antiga2, 'a main depois do segundo reinício (Wayland)');
  checar('o app reiniciado volta a ser cliente Wayland', re2.saiu && cliente(main) === 'wayland', { saiu: re2.saiu, cliente: cliente(main) });
  const sit2 = await ipc('x11_compat_get');
  const topo2 = await ipc('tomato_on_top_available');
  checar('de volta ao Wayland: não ativa, sem sempre na frente por código', sit2?.ativa === false && topo2 === false, { sit2, topo2 });
  checar('o registro: o GDK_BACKEND herdado do reinício sai', /linuxX11 desligada: GDK_BACKEND volta ao padrão/.test(logDoApp()), null);

  const erros = sonda().filter((x) => x.tipo === 'erro').map((x) => `${x.janela}: ${x.dados}`);
  checar('nenhum erro nas páginas', erros.length === 0, erros);
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
