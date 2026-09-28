// Roteiro do M28 (diálogo "Editar meta diária"), carregado com
// `gnome-shell --automation-script` pelo dentro.sh. Abre o app sozinho, duas
// vezes (LANCA_O_APP abaixo), e confere o "Pronto quando" do M28 no app de
// verdade (Rust, settings.json e WebKitGTK), com ponteiro e teclado virtuais,
// pelo DOM (a sonda, com as medidas __ttMeta e __ttProgresso de
// scripts/preview/medidas.js) e por capturas da janela:
//   partida 1 (sem dados do app):
//     - o lápis abre o diálogo com a meta e a hora das configurações (2 horas
//       e 00:00), com o foco na primeira lista; Esc fecha sem gravar e o
//       foco volta ao lápis;
//     - escolher "1 hora" e "05:00" com o ponteiro e clicar em Salvar: o
//       diálogo fecha, o foco volta ao lápis, o anel mostra a meta nova na
//       hora, e o settings.json no disco tem as duas chaves;
//     - "Desativada" e Salvar: o anel e a meta somem;
//   partida 2 (reaberta): o cartão abre sem o anel, o diálogo mostra
//     "Desativada" e "05:00", e Cancelar fecha sem gravar.
// O resumo-meta.mjs confere as checagens.
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

// runPerfScript exige METRICS; o teste não mede desempenho.
export const METRICS = {};
// O rodar.sh procura esta linha: com ela, o dentro.sh não abre o app.
export const LANCA_O_APP = true;

const OUT = GLib.getenv('TT_OUT');
const BIN = GLib.getenv('TOMATITO_BIN');
const SONDA_LOG = GLib.getenv('SONDA_LOG');
const R = { passos: [], checagens: {}, partidas: [] };

const salvar = () => GLib.file_set_contents(`${OUT}/resultado.json`, JSON.stringify(R, null, 2));
const sleep = (ms) =>
  new Promise((r) => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => (r(), GLib.SOURCE_REMOVE)));
const agoraMs = () => GLib.get_monotonic_time() / 1000;
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
  const antes = sonda().length;
  GLib.file_set_contents(`${OUT}/comando.json`, JSON.stringify({ id, js }));
  const r = await esperar(
    () => sonda().slice(antes).find((e) => e.tipo === 'comando' && e.dados.id === id),
    10000,
    `comando ${js}`,
  );
  const texto = JSON.stringify(r.dados.resultado) ?? 'null';
  passo(`comando ${js.slice(0, 120)} => ${texto.length > 300 ? `${texto.slice(0, 300)}…` : texto}`);
  return r.dados.resultado;
}
const invoke = (cmd, args = {}) =>
  comando(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args)}).catch((e) => ({ erro: e }))`);

function limparDadosDoApp() {
  for (const base of [GLib.get_user_data_dir(), GLib.get_user_cache_dir()]) {
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
// O settings.json da pasta de dados do app (a desta rodada, isolada).
function settingsNoDisco() {
  const base = GLib.get_user_data_dir();
  const it = Gio.File.new_for_path(base).enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
  for (let info = it.next_file(null); info; info = it.next_file(null)) {
    if (!/tomatito/i.test(info.get_name())) continue;
    try {
      const [, bytes] = GLib.file_get_contents(`${base}/${info.get_name()}/settings.json`);
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      // sem o arquivo ainda
    }
  }
  return null;
}
function esperarProcesso(proc, ms) {
  return new Promise((resolve) => {
    let feito = false;
    const fim = (v) => !feito && ((feito = true), resolve(v));
    proc.wait_async(null, () => fim(true));
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => (fim(false), GLib.SOURCE_REMOVE));
  });
}

let ptr;
let kb;
const agora = () => GLib.get_monotonic_time();
const mover = (x, y) => ptr.notify_absolute_motion(agora(), x, y);
const botao = (apertado) =>
  ptr.notify_button(agora(), Clutter.BUTTON_PRIMARY, apertado ? Clutter.ButtonState.PRESSED : Clutter.ButtonState.RELEASED);
const tecla = (keyval, apertada) =>
  kb.notify_keyval(agora(), keyval, apertada ? Clutter.KeyState.PRESSED : Clutter.KeyState.RELEASED);
async function clicarEm(x, y) {
  mover(x, y);
  await sleep(150);
  botao(true);
  await sleep(60);
  botao(false);
  await sleep(500);
}
async function apertar(keyval) {
  tecla(keyval, true);
  await sleep(40);
  tecla(keyval, false);
  await sleep(450);
}

let W = null;
let proc = null;
// Clica no centro do elemento do seletor (px CSS da página = px da janela, a 100%).
async function clicar(seletor) {
  const c = await comando(
    `(() => { const e = document.querySelector(${JSON.stringify(seletor)}); if (!e) return null; const b = e.getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; })()`,
  );
  if (!c) throw new Error(`sem elemento: ${seletor}`);
  const r = W.get_frame_rect();
  await clicarEm(r.x + c[0], r.y + c[1]);
}
// Abre a lista pelo clique na caixa e escolhe a opção pelo clique nela.
async function escolher(campo, valor) {
  await clicar(`fluent-dropdown[data-campo="${campo}"] [role="combobox"]`);
  await sleep(300);
  await comando(`document.querySelector('fluent-dropdown[data-campo="${campo}"] fluent-option[value="${valor}"]').scrollIntoView({ block: 'nearest' })`);
  await clicar(`fluent-dropdown[data-campo="${campo}"] fluent-option[value="${valor}"]`);
  await sleep(300);
}

async function abrir(i) {
  const L = new Gio.SubprocessLauncher({ flags: Gio.SubprocessFlags.STDERR_MERGE });
  L.setenv('WAYLAND_DISPLAY', 'tt-aninhado', true);
  L.setenv('GDK_BACKEND', 'wayland', true);
  L.set_stdout_file_path(`${OUT}/app-${i}.log`);
  const antes = sonda().filter((e) => e.tipo === 'estado').length;
  proc = L.spawnv([BIN]);
  const pid = proc.get_identifier();
  passo(`partida ${i}: pid ${pid}`);
  W = await esperar(
    () => global.get_window_actors().map((a) => a.meta_window).find((w) => String(w.get_pid()) === pid && w.get_frame_rect().width > 0),
    60000,
    `a janela da partida ${i}`,
  );
  await esperar(() => sonda().filter((e) => e.tipo === 'estado').length > antes, 30000, 'a sonda da página');
  Main.activateWindow(W);
  await sleep(800);
  // O ponteiro entra na janela (no título da tela, sem controle) antes do
  // primeiro clique: sem isso, o primeiro clique do ponteiro virtual numa
  // janela recém-aberta se perdia.
  const r = W.get_frame_rect();
  mover(r.x + 40, r.y + 80);
  await sleep(400);
  let m = await comando('__ttMeta()');
  for (let k = 0; k < 20 && m?.progresso?.carregando; k++) {
    await sleep(100);
    m = await comando('__ttMeta()');
  }
  return m;
}
async function fechar(i) {
  W.delete(global.get_current_time());
  const saiu = await esperarProcesso(proc, 10000);
  if (!saiu) proc.force_exit();
  const saida = saiu ? (proc.get_if_exited() ? `saiu ${proc.get_exit_status()}` : 'sinal') : 'forçado';
  R.partidas.push({ partida: i, saida });
  checar(`partida ${i}: o app sai sozinho ao fechar a janela`, saida === 'saiu 0', saida);
  await sleep(800);
}
function capturar(nome) {
  try {
    W.get_compositor_private().get_image(null).writeToPNG(`${OUT}/${nome}`);
    passo(`captura ${nome}`);
  } catch (e) {
    passo(`captura ${nome} falhou: ${e}`);
  }
}
const meta = () => comando('__ttMeta()');

async function principal() {
  passo('início');
  Main.messageTray.bannerBlocked = true;
  if (Main.overview.visible) Main.overview.hide();
  const seat = global.stage.context.get_backend().get_default_seat();
  ptr = seat.create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
  kb = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
  await sleep(200);
  mover(960, 1070);
  await sleep(300);
  limparDadosDoApp();

  // Partida 1.
  const m0 = await abrir(1);
  checar(
    'partida 1: o cartão tem o lápis (nome, dica e ícone) e a meta padrão no anel',
    m0?.lapis?.rotulo === 'Editar meta diária' && m0.lapis.dica && m0.lapis.icone === 'edit' &&
      JSON.stringify(m0.progresso?.meta) === '{"numero":"2","unidade":"horas"}' && !m0.aberto,
    { lapis: m0?.lapis, meta: m0?.progresso?.meta },
  );

  await clicar('[data-editar-meta]');
  await sleep(300);
  const m1 = await meta();
  R.aberto = m1;
  const d1 = m1?.dialogo;
  checar(
    'o lápis abre o diálogo com as configurações atuais e o foco na primeira lista',
    m1?.aberto && JSON.stringify(d1?.mostrados) === '["2 horas","00:00"]' && d1?.foco === 'lista Meta diária' &&
      d1?.nome === 'Editar meta diária' && d1?.modal === 'true',
    { mostrados: d1?.mostrados, foco: d1?.foco, nome: d1?.nome },
  );
  checar(
    'o diálogo: 320 px, fundo de trás --tt-smoke, sombra de 64, botões lado a lado e com a mesma largura',
    d1?.caixa?.[2] === 320 && d1?.fundoDeTras === 'rgba(0, 0, 0, 0.3)' && /0px 32px 64px/.test(d1?.sombra ?? '') &&
      d1?.botoes?.length === 2 && d1.botoes[0].caixa[2] === d1.botoes[1].caixa[2] && d1.botoes[0].caixa[1] === d1.botoes[1].caixa[1] &&
      d1.botoes[0].texto === 'Salvar' && d1.botoes[0].destaque,
    { caixa: d1?.caixa, fundoDeTras: d1?.fundoDeTras, sombra: d1?.sombra, botoes: d1?.botoes },
  );
  capturar('m28-app-dialogo.png');

  await apertar(Clutter.KEY_Escape);
  const m2 = await meta();
  const s2 = await invoke('settings_get');
  checar(
    'Esc fecha sem gravar, e o foco volta ao lápis',
    !m2?.aberto && m2?.lapis?.focado && s2?.dailyGoalMinutes === 120 && s2?.resetHour === 0,
    { aberto: m2?.aberto, focado: m2?.lapis?.focado, meta: s2?.dailyGoalMinutes, hora: s2?.resetHour },
  );

  // 1 hora e 05:00 com o ponteiro; Salvar.
  await clicar('[data-editar-meta]');
  await sleep(300);
  await escolher('meta', 60);
  await escolher('hora', 5);
  const m3 = await meta();
  await clicar('fluent-dialog[data-dialogo="meta"] [data-salvar]');
  const m4 = await meta();
  await sleep(1300);
  const m5 = await meta();
  const s5 = await invoke('settings_get');
  const disco = settingsNoDisco();
  R.salvo = { escolhido: m3?.dialogo?.mostrados, logo: m4, depois: m5?.progresso, settings: s5, disco };
  checar(
    'Salvar fecha o diálogo e devolve o foco ao lápis',
    JSON.stringify(m3?.dialogo?.mostrados) === '["1 hora","05:00"]' && !m4?.aberto && m4?.lapis?.focado,
    { escolhido: m3?.dialogo?.mostrados, aberto: m4?.aberto, focado: m4?.lapis?.focado },
  );
  checar(
    'salvar muda o anel na hora (a meta nova no centro e no rótulo)',
    JSON.stringify(m4?.progresso?.meta) === '{"numero":"1","unidade":"hora"}' && /^Meta diária de 1 hora\./.test(m5?.progresso?.rotulo ?? ''),
    { logo: m4?.progresso?.meta, rotulo: m5?.progresso?.rotulo },
  );
  checar(
    'o settings_set gravou as duas chaves (configurações e settings.json no disco)',
    s5?.dailyGoalMinutes === 60 && s5?.resetHour === 5 && disco?.dailyGoalMinutes === 60 && disco?.resetHour === 5,
    { settings: [s5?.dailyGoalMinutes, s5?.resetHour], disco: [disco?.dailyGoalMinutes, disco?.resetHour] },
  );
  const stats = await invoke('stats_get');
  checar('o stats_get devolve a meta e a hora novas', stats?.dailyGoalMinutes === 60 && stats?.resetHour === 5, stats);
  capturar('m28-app-salvo.png');

  // Desativada.
  await clicar('[data-editar-meta]');
  await sleep(300);
  await escolher('meta', 0);
  await clicar('fluent-dialog[data-dialogo="meta"] [data-salvar]');
  await sleep(600);
  const m6 = await meta();
  checar(
    '"Desativada" esconde o anel e a meta',
    !m6?.aberto && m6?.progresso?.semMeta && !m6?.progresso?.anelVisivel && m6?.lapis?.focado &&
      JSON.stringify(m6?.progresso?.ontem) === '{"numero":"0","unidade":"minutos"}' && m6?.progresso?.rodape === 'Concluído: 0 minutos',
    { semMeta: m6?.progresso?.semMeta, anelVisivel: m6?.progresso?.anelVisivel, focado: m6?.lapis?.focado },
  );
  capturar('m28-app-desativada.png');
  const erros1 = sonda().filter((x) => x.tipo === 'erro').map((x) => x.dados);
  await fechar(1);

  // Partida 2: a meta desativada sobrevive; Cancelar não grava.
  const n0 = await abrir(2);
  checar('partida 2: o cartão abre sem o anel', n0?.progresso?.semMeta && !n0?.progresso?.anelVisivel, { semMeta: n0?.progresso?.semMeta });
  await clicar('[data-editar-meta]');
  await sleep(300);
  const n1 = await meta();
  await escolher('meta', 480);
  await clicar('fluent-dialog[data-dialogo="meta"] [data-cancelar]');
  const n2 = await meta();
  const s6 = await invoke('settings_get');
  checar(
    'partida 2: o diálogo mostra Desativada e 05:00; Cancelar fecha sem gravar e o foco volta ao lápis',
    JSON.stringify(n1?.dialogo?.mostrados) === '["Desativada","05:00"]' && !n2?.aberto && n2?.lapis?.focado &&
      s6?.dailyGoalMinutes === 0 && s6?.resetHour === 5 && n2?.progresso?.semMeta,
    { mostrados: n1?.dialogo?.mostrados, aberto: n2?.aberto, focado: n2?.lapis?.focado, settings: [s6?.dailyGoalMinutes, s6?.resetHour] },
  );
  const erros = [...erros1, ...sonda().filter((x) => x.tipo === 'erro').map((x) => x.dados)];
  checar('nenhum erro na página', erros.length === 0, erros);
  await fechar(2);
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
