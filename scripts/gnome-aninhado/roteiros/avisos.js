// Roteiro do M46 (licenças e avisos), carregado com `gnome-shell
// --automation-script` pelo dentro.sh, pelo avisos.sh: o binário de debug (com
// a página do Vite e a sonda) posto no lugar do binário do .deb extraído
// (<pacote>/usr/bin/tomatito), para o Tauri achar os recursos onde o .deb os
// instala (<pacote>/usr/lib/Tomatito, o `../lib/Tomatito` do binário). Abre
// o app sozinho (LANCA_O_APP), duas vezes, sem saída de áudio, e tudo pelo
// ponteiro virtual:
//   partida 1: Configurações > Sobre > "Ver avisos" mostra o
//     THIRD_PARTY_NOTICES.md do pacote, inteiro (o mesmo tamanho, o começo e o
//     fim); "Fechar" fecha; "Ver licença" mostra o OFL-Inter.txt do pacote; o
//     `notices_read` devolve os dois arquivos byte a byte (comparados pelo
//     tamanho e pelas pontas);
//   partida 2 (controle): com a pasta usr/lib/Tomatito do pacote renomeada,
//     "Ver avisos" mostra o aviso de erro: o texto vem mesmo do pacote.
// O resumo-avisos.mjs confere as checagens e os logs.
//
//   bash scripts/gnome-aninhado/avisos.sh [caminho do .deb]
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export const METRICS = {};
export const LANCA_O_APP = true;

const OUT = GLib.getenv('TT_OUT');
const BIN = GLib.getenv('TOMATITO_BIN');
const SONDA_LOG = GLib.getenv('SONDA_LOG');
const RECURSOS = GLib.getenv('TT_AVISOS_RECURSOS');
const R = { passos: [], checagens: {}, partidas: [] };

const salvar = () => GLib.file_set_contents(`${OUT}/resultado.json`, JSON.stringify(R, null, 2));
const sleep = (ms) =>
  new Promise((r) => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => (r(), GLib.SOURCE_REMOVE)));
const passo = (m) => {
  R.passos.push(`${Math.round(GLib.get_monotonic_time() / 1000)} ${m}`);
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
  const [, bytes] = GLib.file_get_contents(arq);
  return new TextDecoder().decode(bytes);
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
    `comando ${js.slice(0, 80)}`,
  );
  const texto = JSON.stringify(r.dados.resultado) ?? 'null';
  passo(`comando ${js.slice(0, 120)} => ${texto.length > 300 ? `${texto.slice(0, 300)}…` : texto}`);
  return r.dados.resultado;
}

function limparDadosDoApp() {
  for (const base of [GLib.get_user_data_dir(), GLib.get_user_cache_dir(), GLib.get_user_config_dir()]) {
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

// --- Ponteiro virtual.
let ptr;
const agora = () => GLib.get_monotonic_time();
const mover = (x, y) => ptr.notify_absolute_motion(agora(), x, y);
const botao = (apertado) =>
  ptr.notify_button(agora(), Clutter.BUTTON_PRIMARY, apertado ? Clutter.ButtonState.PRESSED : Clutter.ButtonState.RELEASED);
async function clicarEm(x, y) {
  mover(x, y);
  await sleep(150);
  botao(true);
  await sleep(60);
  botao(false);
  await sleep(500);
}

let proc = null;
let pid = null;
const janelaDoApp = () =>
  global.get_window_actors().map((a) => a.meta_window).find((w) => String(w.get_pid()) === String(pid) && w.get_title() === 'Tomatito');
function esperarProcesso(p, ms) {
  return new Promise((resolve) => {
    let feito = false;
    const fim = (v) => !feito && ((feito = true), resolve(v));
    p.wait_async(null, () => fim(true));
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => (fim(false), GLib.SOURCE_REMOVE));
  });
}
const codigoDe = (p) => (p.get_if_exited() ? p.get_exit_status() : p.get_if_signaled() ? `sinal ${p.get_term_sig()}` : null);

async function abrir(i) {
  const antes = sonda().filter((e) => e.tipo === 'estado').length;
  const L = new Gio.SubprocessLauncher({ flags: Gio.SubprocessFlags.STDERR_MERGE });
  L.setenv('WAYLAND_DISPLAY', 'tt-aninhado', true);
  L.setenv('GDK_BACKEND', 'wayland', true);
  L.setenv('ALSA_CONFIG_PATH', '/dev/null', true);
  L.set_stdout_file_path(`${OUT}/app-${i}.log`);
  proc = L.spawnv([BIN]);
  pid = proc.get_identifier();
  passo(`partida ${i}: pid ${pid}`);
  const W = await esperar(() => { const w = janelaDoApp(); return w && w.get_frame_rect().width > 0 ? w : null; }, 60000, `a janela da partida ${i}`);
  await esperar(() => sonda().filter((e) => e.tipo === 'estado').length > antes, 30000, 'a sonda da página');
  if (W.is_maximized()) W.unmaximize();
  W.move_resize_frame(true, 300, 100, 1000, 800);
  for (let k = 0; k < 20 && (Main.overview.visible || Main.overview.animationInProgress); k++) {
    if (!Main.overview.animationInProgress) Main.overview.hide();
    await sleep(500);
  }
  Main.activateWindow(W);
  await sleep(800);
}

async function clicar(seletor) {
  const c = await comando(
    `(() => { const e = document.querySelector(${JSON.stringify(seletor)}); if (!e) return null; e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; })()`,
  );
  if (!c) throw new Error(`sem elemento: ${seletor}`);
  await sleep(200);
  const r = janelaDoApp().get_frame_rect();
  await clicarEm(r.x + c[0], r.y + c[1]);
}

// O diálogo, lido do DOM: o título, o texto (tamanho e pontas) e o erro.
const LER = `(() => {
  const d = document.querySelector('fluent-dialog[data-dialogo="avisos"]');
  const pre = d?.querySelector('[data-texto]');
  const erro = d?.querySelector('[data-erro]');
  return {
    aberto: Boolean(d?.dialog?.open), titulo: d?.querySelector('h2')?.textContent ?? null,
    carregando: pre?.getAttribute('aria-busy') === 'true', textoVisivel: pre ? !pre.hidden : false,
    tamanho: pre?.textContent.length ?? 0, inicio: pre?.textContent.slice(0, 120) ?? '', fim: pre?.textContent.slice(-120) ?? '',
    erro: erro && !erro.hidden ? erro.textContent : null,
    foco: document.activeElement?.matches?.('[data-texto]') ?? false,
  };
})()`;
const ler = () => comando(LER);
const INVOCAR = (doc) =>
  `window.__TAURI_INTERNALS__.invoke('notices_read', { doc: '${doc}' }).then((t) => ({ tamanho: t.length, inicio: t.slice(0, 120), fim: t.slice(-120) }), (e) => ({ erro: e }))`;
const pontas = (t) => ({ tamanho: t.length, inicio: t.slice(0, 120), fim: t.slice(-120) });
const iguais = (a, b) => a && b && a.tamanho === b.tamanho && a.inicio === b.inicio && a.fim === b.fim;

function capturar(nome) {
  try {
    janelaDoApp().get_compositor_private().get_image(null).writeToPNG(`${OUT}/${nome}`);
    passo(`captura ${nome}`);
  } catch (e) {
    passo(`captura ${nome} falhou: ${e}`);
  }
}

async function sair(i) {
  await comando("(window.__TAURI_INTERNALS__.invoke('app_quit'), 'ok')");
  const saiu = await esperarProcesso(proc, 10000);
  const codigo = saiu ? codigoDe(proc) : 'não saiu';
  R.partidas.push({ partida: i, codigo });
  if (!saiu) proc.force_exit();
  GLib.file_set_contents(`${OUT}/comando.json`, '{}');
  await sleep(800);
  return codigo;
}

async function principal() {
  passo('início');
  Main.messageTray.bannerBlocked = true;
  new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' }).set_boolean('enable-animations', false);
  if (Main.overview.visible) Main.overview.hide();
  const seat = global.stage.context.get_backend().get_default_seat();
  ptr = seat.create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
  await sleep(200);
  mover(960, 1070);
  await sleep(300);
  limparDadosDoApp();
  const arquivos = {
    avisos: pontas(lerTexto(`${RECURSOS}/THIRD_PARTY_NOTICES.md`)),
    ofl: pontas(lerTexto(`${RECURSOS}/OFL-Inter.txt`)),
  };
  R.arquivos = arquivos;
  checar('o binário roda de <pacote>/usr/bin, ao lado de <pacote>/usr/lib/Tomatito', BIN.endsWith('/usr/bin/tomatito') && RECURSOS === `${GLib.path_get_dirname(GLib.path_get_dirname(BIN))}/lib/Tomatito`, { BIN, RECURSOS });

  // ===== Partida 1: os arquivos do pacote =====
  await abrir(1);
  await comando("(location.hash = '#/configuracoes', 'ok')");
  await sleep(600);
  await clicar('[data-cartao="sobre"] [data-expansor]');
  await clicar('[data-avisos="avisos"]');
  const a = await esperar(async () => { const e = await ler(); return e?.aberto && !e.carregando ? e : null; }, 10000, 'o texto dos avisos');
  R.avisos = a;
  checar(
    '"Ver avisos" mostra o THIRD_PARTY_NOTICES.md do pacote, inteiro, com o foco no texto',
    a.titulo === 'Avisos de terceiros' && a.textoVisivel && !a.erro && iguais(a, arquivos.avisos) && a.foco,
    { tela: a, arquivo: arquivos.avisos },
  );
  capturar('m46-avisos-no-app.png');
  await clicar('fluent-dialog[data-dialogo="avisos"] [data-fechar]');
  const fechado = await ler();
  checar('"Fechar" fecha o diálogo', !fechado.aberto, fechado);
  await clicar('[data-avisos="ofl"]');
  const o = await esperar(async () => { const e = await ler(); return e?.aberto && !e.carregando ? e : null; }, 10000, 'o texto da OFL');
  R.ofl = o;
  checar(
    '"Ver licença" mostra o OFL-Inter.txt do pacote, inteiro',
    o.titulo === 'Licença da fonte Inter' && o.textoVisivel && !o.erro && iguais(o, arquivos.ofl) && o.inicio.startsWith('Copyright 2016 The Inter Project Authors'),
    { tela: o, arquivo: arquivos.ofl },
  );
  capturar('m46-ofl-no-app.png');
  await clicar('fluent-dialog[data-dialogo="avisos"] [data-fechar]');
  const ia = await comando(INVOCAR('avisos'));
  const io = await comando(INVOCAR('ofl'));
  checar('o notices_read devolve os dois arquivos do pacote', iguais(ia, arquivos.avisos) && iguais(io, arquivos.ofl), { avisos: ia, ofl: io });
  const erros1 = sonda().filter((x) => x.tipo === 'erro').map((x) => x.dados);
  checar('nenhum erro na página', erros1.length === 0, erros1);
  checar('partida 1: o app sai com código 0', (await sair(1)) === 0, R.partidas);

  // ===== Partida 2: sem a pasta do pacote, o aviso de erro =====
  const fora = `${RECURSOS}.fora`;
  Gio.File.new_for_path(RECURSOS).move(Gio.File.new_for_path(fora), Gio.FileCopyFlags.NONE, null, null);
  try {
    await abrir(2);
    await comando("(location.hash = '#/configuracoes', 'ok')");
    await sleep(600);
    await clicar('[data-cartao="sobre"] [data-expansor]');
    await clicar('[data-avisos="avisos"]');
    const f = await esperar(async () => { const e = await ler(); return e?.aberto && !e.carregando ? e : null; }, 10000, 'o erro');
    R.controle = f;
    checar(
      'controle: sem a pasta usr/lib/Tomatito do pacote, "Ver avisos" mostra o aviso de erro',
      !f.textoVisivel && /Não foi possível abrir o arquivo/.test(f.erro ?? ''),
      f,
    );
    capturar('m46-avisos-sem-pacote.png');
    await clicar('fluent-dialog[data-dialogo="avisos"] [data-fechar]');
    checar('partida 2: o app sai com código 0', (await sair(2)) === 0, R.partidas);
  } finally {
    Gio.File.new_for_path(fora).move(Gio.File.new_for_path(RECURSOS), Gio.FileCopyFlags.NONE, null, null);
  }
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
