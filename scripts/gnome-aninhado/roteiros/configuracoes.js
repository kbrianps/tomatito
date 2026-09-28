// Roteiro do M38 (Configurações: foco e sons), carregado com
// `gnome-shell --automation-script` pelo dentro.sh. Abre o app sozinho, duas
// vezes (LANCA_O_APP abaixo), com o relógio a 60× e sem saída de áudio (o
// próprio roteiro abre o app com o ALSA sem configuração, como o TT_SEM_AUDIO
// do dentro.sh, que não vale para o app aberto pelo roteiro): cada som que o
// motor pede vira, no log do app,
// "som: <Som> não tocou: sem saída de áudio", e cada som desligado nas
// configurações vira "som <Som> desligado nas configurações" (só no debug).
// É o proxy do "Pronto quando" (o som que não toca) sem tocar nada na máquina.
//   partida 1 (sem dados do app):
//     - Configurações em Title Large, com os quatro cartões nos padrões;
//     - o ponteiro desliga o "Som de fim de foco" (o switch e o settings.json);
//     - abre "Períodos de foco" e escolhe 15 e 10 min pelas listas; o volume
//       vai a 97 pelo teclado (End e três setas para a esquerda);
//     - a tela Foco mostra a frase com o F e o B novos, e uma sessão de 26
//       min (foco, intervalo, foco) sai com o plano novo e termina: os dois
//       fins de foco não pedem som, o fim do intervalo pede;
//   partida 2 (reaberta): os valores voltam do disco (listas, switches e
//     volume); o som de fim de foco volta a ligado e o de fim de intervalo
//     desliga; o "Testar" do intervalo desligado toca mesmo assim; outra
//     sessão de 26 min: os fins de foco pedem som, o do intervalo não.
// O resumo-configuracoes.mjs confere as checagens e os logs.
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
function lerTexto(arq) {
  try {
    const [, bytes] = GLib.file_get_contents(arq);
    return new TextDecoder().decode(bytes);
  } catch {
    return '';
  }
}

async function esperar(fn, ms, oque) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const v = await fn();
    if (v) return v;
    await sleep(150);
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
  let it;
  try {
    it = Gio.File.new_for_path(base).enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
  } catch {
    return null;
  }
  for (let info = it.next_file(null); info; info = it.next_file(null)) {
    if (!/tomatito/i.test(info.get_name())) continue;
    const texto = lerTexto(`${base}/${info.get_name()}/settings.json`);
    if (texto) return JSON.parse(texto);
  }
  return null;
}
function esperarProcesso(p, ms) {
  return new Promise((resolve) => {
    let feito = false;
    const fim = (v) => !feito && ((feito = true), resolve(v));
    p.wait_async(null, () => fim(true));
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => (fim(false), GLib.SOURCE_REMOVE));
  });
}
const codigoDe = (p) => (p.get_if_exited() ? p.get_exit_status() : p.get_if_signaled() ? `sinal ${p.get_term_sig()}` : null);

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
  await sleep(350);
}

let W = null;
let proc = null;
// Rola até o elemento e clica no centro dele (px CSS da página = px da janela, a 100%).
async function clicar(seletor) {
  const c = await comando(
    `(() => { const e = document.querySelector(${JSON.stringify(seletor)}); if (!e) return null; e.scrollIntoView({ block: 'nearest' }); const b = e.getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; })()`,
  );
  if (!c) throw new Error(`sem elemento: ${seletor}`);
  const r = W.get_frame_rect();
  await clicarEm(r.x + c[0], r.y + c[1]);
}
// Abre a lista pelo clique na caixa e escolhe a opção pelo clique nela.
async function escolher(chave, valor) {
  await clicar(`fluent-dropdown[data-config="${chave}"] [role="combobox"]`);
  await sleep(300);
  await clicar(`fluent-dropdown[data-config="${chave}"] fluent-option[value="${valor}"]`);
  await sleep(300);
}

// O que a seção mostra, lido do DOM.
const LER = `(() => {
  const sec = document.querySelector('[aria-labelledby="config-sessoes"]');
  if (!sec) return null;
  const h1 = document.querySelector('.tt-pagina h1');
  const sw = (id) => { const s = sec.querySelector('[data-cartao="' + id + '"] fluent-switch'); return { ligado: s.checked, estado: s.parentElement.querySelector('[data-estado]').textContent }; };
  const exp = (id) => sec.querySelector('[data-cartao="' + id + '"] [data-expansor]').getAttribute('aria-expanded');
  const cab = sec.querySelector('[data-cartao="periodos"] .tt-expansor-topo').getBoundingClientRect();
  return {
    titulo: h1.textContent, fonte: getComputedStyle(h1).fontSize,
    cartoes: [...sec.querySelectorAll('.tt-config-cartao')].map((c) => c.dataset.cartao),
    alturaDoCabecalho: Math.round(cab.height),
    foco: sec.querySelector('[data-config="focusMinutes"]').value,
    intervalo: sec.querySelector('[data-config="breakMinutes"]').value,
    somFoco: sw('som-foco'), somIntervalo: sw('som-intervalo'),
    volume: sec.querySelector('.tt-deslizante').value, volumeTexto: sec.querySelector('[data-volume-valor]').textContent,
    abertos: ['periodos', 'som-foco', 'som-intervalo'].filter((id) => exp(id) === 'true'),
  };
})()`;
const ler = () => comando(LER);

async function abrir(i) {
  const L = new Gio.SubprocessLauncher({ flags: Gio.SubprocessFlags.STDERR_MERGE });
  L.setenv('WAYLAND_DISPLAY', 'tt-aninhado', true);
  L.setenv('GDK_BACKEND', 'wayland', true);
  L.setenv('TOMATITO_SPEED', '60', true);
  // Sem saída de áudio: nada toca na máquina, e cada som pedido vira erro no log.
  L.setenv('ALSA_CONFIG_PATH', '/dev/null', true);
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
  if (W.is_maximized()) W.unmaximize();
  W.move_resize_frame(true, 300, 100, 1000, 800);
  await sleep(800);
  Main.activateWindow(W);
  await sleep(600);
  const r = W.get_frame_rect();
  mover(r.x + 40, r.y + 80);
  await sleep(400);
}
async function sair(i) {
  // O app_quit (o "Sair" da 3.4): fechar a janela só a esconderia (M36).
  GLib.file_set_contents(`${OUT}/comando.json`, JSON.stringify({ id: `c${++nComando}`, js: "window.__TAURI_INTERNALS__.invoke('app_quit')" }));
  const saiu = await esperarProcesso(proc, 10000);
  if (!saiu) proc.force_exit();
  const codigo = saiu ? codigoDe(proc) : 'forçado';
  R.partidas.push({ partida: i, codigo });
  checar(`partida ${i}: o app_quit fecha o app com código 0`, codigo === 0, codigo);
  // A sonda da próxima página rodaria o último comando de novo (o app_quit).
  GLib.file_set_contents(`${OUT}/comando.json`, '{}');
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
async function irPara(hash) {
  await comando(`(location.hash = '${hash}', document.querySelector('.tt-rolagem').scrollTop = 0, 'ok')`);
  await sleep(600);
}

// As linhas de som do log de uma partida.
function sonsNoLog(i) {
  const log = lerTexto(`${OUT}/app-${i}.log`);
  const conta = (re) => (log.match(re) ?? []).length;
  return {
    pedidosFoco: conta(/som: FocusEnd não tocou/g),
    pedidosIntervalo: conta(/som: BreakEnd não tocou/g),
    desligadosFoco: conta(/som FocusEnd desligado nas configurações/g),
    desligadosIntervalo: conta(/som BreakEnd desligado nas configurações/g),
  };
}
const menos = (a, b) => Object.fromEntries(Object.keys(a).map((k) => [k, a[k] - b[k]]));

// Uma sessão de 26 min com F = 15 e B = 10: foco de 8, intervalo de 10, foco
// de 8 (26 s a 60×). Devolve o retrato do início e os sons pedidos até o fim.
async function sessao(i) {
  const antes = sonsNoLog(i);
  const inicio = await invoke('focus_start', { minutes: 26 });
  await esperar(async () => (await invoke('get_state'))?.focus?.status === 'completed', 60000, 'o fim da sessão');
  await sleep(2500); // a thread de som registra depois do motor
  return { inicio: inicio?.session ?? inicio, sons: menos(sonsNoLog(i), antes) };
}

async function principal() {
  passo('início');
  Main.messageTray.bannerBlocked = true;
  new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' }).set_boolean('enable-animations', false);
  if (Main.overview.visible) Main.overview.hide();
  const seat = global.stage.context.get_backend().get_default_seat();
  ptr = seat.create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
  kb = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
  await sleep(200);
  mover(960, 1070);
  await sleep(300);
  limparDadosDoApp();

  // ===== Partida 1 =====
  await abrir(1);
  await irPara('#/configuracoes');
  const e0 = await ler();
  R.inicial = e0;
  checar(
    'Configurações em Title Large, com os quatro cartões nos padrões da 3.3, fechados, e o cabeçalho de 68 px',
    e0?.fonte === '40px' && JSON.stringify(e0.cartoes) === '["periodos","som-foco","som-intervalo","volume"]' &&
      e0.foco === '25' && e0.intervalo === '5' && e0.somFoco.ligado && e0.somIntervalo.ligado && e0.somFoco.estado === 'Ativado' &&
      e0.volume === '80' && e0.abertos.length === 0 && e0.alturaDoCabecalho === 68,
    e0,
  );

  await clicar('[data-cartao="som-foco"] fluent-switch');
  await sleep(400);
  const e1 = await ler();
  const d1 = settingsNoDisco();
  checar(
    'o ponteiro desliga o "Som de fim de foco": o switch, o "Desativado" e o settings.json',
    e1?.somFoco?.ligado === false && e1.somFoco.estado === 'Desativado' && e1.somIntervalo.ligado &&
      d1?.sounds?.focusEnd === false && d1?.sounds?.breakEnd === true && e1.abertos.length === 0,
    { tela: e1?.somFoco, disco: d1?.sounds, abertos: e1?.abertos },
  );

  await clicar('[data-cartao="periodos"] [data-expansor]');
  await sleep(300);
  await escolher('focusMinutes', 15);
  await escolher('breakMinutes', 10);
  await comando(`(document.querySelector('.tt-deslizante').focus(), 'ok')`);
  await apertar(Clutter.KEY_End);
  for (let k = 0; k < 3; k++) await apertar(Clutter.KEY_Left);
  await sleep(300);
  const e2 = await ler();
  const d2 = settingsNoDisco();
  const g2 = await invoke('get_state');
  checar(
    'as listas gravam 15 e 10 min, e o volume vai a 97 pelo teclado (tela, disco e get_state)',
    e2?.foco === '15' && e2.intervalo === '10' && e2.volume === '97' && e2.volumeTexto === '97' &&
      d2?.focusMinutes === 15 && d2?.breakMinutes === 10 && d2?.volume === 97 &&
      g2?.setup?.focusMinutes === 15 && g2?.setup?.breakMinutes === 10 && g2?.settings?.volume === 97,
    { tela: e2, disco: d2 && { f: d2.focusMinutes, b: d2.breakMinutes, v: d2.volume }, setup: g2?.setup },
  );
  await comando(`(document.querySelector('.tt-rolagem').scrollTop = 0, 'ok')`);
  await clicar('[data-cartao="som-foco"] [data-expansor]');
  await comando(`(document.querySelector('.tt-rolagem').scrollTop = 0, document.activeElement.blur(), 'ok')`);
  mover(W.get_frame_rect().x + 150, W.get_frame_rect().y + 780);
  await sleep(400);
  capturar('m38-configuracoes-lite.png');

  // A tela Foco: a frase dos intervalos com o F e o B novos.
  await irPara('#/foco');
  const frase = await comando(`(() => { const s = document.querySelector('[role="spinbutton"]'); return { minutos: Number(s.getAttribute('aria-valuenow')), frase: document.querySelector('[data-frase]').textContent }; })()`);
  const n = Math.floor((frase.minutos - 1) / 25);
  const esperada = n === 0 ? 'Sem intervalos.' : `Você terá ${n} ${n === 1 ? 'intervalo' : 'intervalos'}.`;
  checar('a tela Foco usa o F e o B novos na frase dos intervalos', frase.frase === esperada, { ...frase, esperada });

  const s1 = await sessao(1);
  R.sessao1 = s1;
  checar(
    'a sessão nova sai com o plano novo (F 15, B 10: dois focos e um intervalo)',
    s1.inicio?.focusMinutes === 15 && s1.inicio?.breakMinutes === 10 && s1.inicio?.blocks === 2 && s1.inicio?.intervals === 1,
    s1.inicio && { f: s1.inicio.focusMinutes, b: s1.inicio.breakMinutes, blocos: s1.inicio.blocks, intervalos: s1.inicio.intervals },
  );
  checar(
    'com o som de fim de foco desligado, os dois fins de foco não pedem som, e o fim do intervalo pede',
    s1.sons.pedidosFoco === 0 && s1.sons.desligadosFoco === 2 && s1.sons.pedidosIntervalo === 1 && s1.sons.desligadosIntervalo === 0,
    s1.sons,
  );
  const erros1 = sonda().filter((x) => x.tipo === 'erro').map((x) => x.dados);
  await sair(1);

  // ===== Partida 2 =====
  await abrir(2);
  await irPara('#/configuracoes');
  const f0 = await ler();
  R.reaberto = f0;
  checar(
    'partida 2: os valores voltam do disco (15 e 10 min, fim de foco desligado, volume 97), e os cartões abertos da partida anterior não',
    f0?.foco === '15' && f0.intervalo === '10' && f0.somFoco.ligado === false && f0.somFoco.estado === 'Desativado' &&
      f0.somIntervalo.ligado && f0.volume === '97' && f0.abertos.length === 0,
    f0,
  );
  await clicar('[data-cartao="som-foco"] fluent-switch');
  await clicar('[data-cartao="som-intervalo"] fluent-switch');
  await sleep(400);
  const f1 = await ler();
  const d3 = settingsNoDisco();
  checar(
    'partida 2: liga o de fim de foco e desliga o de fim de intervalo (tela e disco)',
    f1?.somFoco?.ligado === true && f1.somIntervalo.ligado === false && f1.somIntervalo.estado === 'Desativado' &&
      d3?.sounds?.focusEnd === true && d3?.sounds?.breakEnd === false,
    { tela: [f1?.somFoco, f1?.somIntervalo], disco: d3?.sounds },
  );
  const antesDoTeste = sonsNoLog(2);
  await clicar('[data-cartao="som-intervalo"] [data-expansor]');
  await clicar('[data-testar="breakEnd"]');
  await sleep(2500);
  const teste = menos(sonsNoLog(2), antesDoTeste);
  checar('"Testar" toca o som de fim de intervalo mesmo desligado', teste.pedidosIntervalo === 1 && teste.desligadosIntervalo === 0 && teste.pedidosFoco === 0, teste);

  await irPara('#/foco');
  const s2 = await sessao(2);
  R.sessao2 = s2;
  checar(
    'partida 2: com o som de fim de intervalo desligado, o fim do intervalo não pede som, e os dois fins de foco pedem',
    s2.sons.pedidosFoco === 2 && s2.sons.desligadosFoco === 0 && s2.sons.pedidosIntervalo === 0 && s2.sons.desligadosIntervalo === 1,
    s2.sons,
  );
  const erros = [...erros1, ...sonda().filter((x) => x.tipo === 'erro').map((x) => x.dados)];
  checar('nenhum erro na página', erros.length === 0, erros);
  await sair(2);
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
