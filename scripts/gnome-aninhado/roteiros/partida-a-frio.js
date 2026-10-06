// Roteiro do M08 (boot sem clarão), carregado com `gnome-shell
// --automation-script` pelo dentro.sh. Este roteiro abre o app sozinho, várias
// vezes (LANCA_O_APP abaixo: o dentro.sh não abre), e grava
// $TT_OUT/resultado.json. Em cada partida a frio:
//   1. apaga os dados e o cache do app (WebKit) na pasta isolada do teste;
//   2. abre o binário ($TOMATITO_BIN) com o inspetor remoto do WebKitGTK numa
//      porta própria (WEBKIT_INSPECTOR_HTTP_SERVER);
//   3. guarda cada quadro que o compositor pinta com a janela, do primeiro até
//      2,5 s depois: a cada after-paint do palco, o conteúdo da janela
//      (Meta.WindowActor.get_image) vira um PNG, e os repetidos são
//      descartados. É o que uma gravação da tela (Ctrl+Alt+Shift+R) veria da
//      janela, quadro a quadro, sem depender de olho;
//   4. lê o console do DevTools pelo inspetor (console.mjs);
//   5. fecha a janela pelo compositor (como o X do sistema) e espera o app
//      sair.
// Depois das partidas, cada quadro é classificado pelas cores: o nome do tema
// (fundo e cartões dele; "lite" sem TT_TEMA), "branco", "escuro" (preto ou
// outro tema escuro), "transparente" ou "outro". O resumo-partida-a-frio.mjs confere tudo.
//
// Variáveis: TT_PARTIDAS (padrão 10), TT_MODO (rótulo: build ou dev) e
// TT_CONTROLE (repassada pelo rodar.sh à sonda do dev; ver sonda.js).
//
// M23: TT_TEMA=lite|suave|light|dark. Antes de cada partida, o roteiro grava
// um settings.json do Lite com só o `theme` trocado (como uma troca à mão),
// nas pastas de dados dos dois IDs (o de uso diário e o .dev), e os quadros
// passam a ser classificados pelas cores desse tema. Sem TT_TEMA, nenhum
// settings.json é escrito antes (o app nasce nos padrões, no Lite). Depois de
// fechar, o roteiro lê o settings.json que o app gravou (o console.mjs grava
// volume 37 pelo settings_set).
import GdkPixbuf from 'gi://GdkPixbuf';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

// runPerfScript exige METRICS; o teste não mede desempenho.
export const METRICS = {};
// O rodar.sh procura esta linha: com ela, o dentro.sh não abre o app.
export const LANCA_O_APP = true;

const OUT = GLib.getenv('TT_OUT');
const BIN = GLib.getenv('TOMATITO_BIN');
const NODE = GLib.getenv('TT_NODE');
const CONSOLE_MJS = GLib.getenv('TT_CONSOLE_MJS');
const PARTIDAS = Number(GLib.getenv('TT_PARTIDAS') || 10);
const CAPTURA_MS = 2500;
const TEMA = GLib.getenv('TT_TEMA') || null;
const R = {
  tema: TEMA ?? 'lite',
  modo: GLib.getenv('TT_MODO') || '?',
  controle: GLib.getenv('TT_CONTROLE') || null,
  binario: BIN,
  partidas: [],
  passos: [],
};

// Fundo, superfície e cartão de cada tema (src/styles/tokens.css).
const PALETAS = {
  lite: [0xa5342b, 0xaa392f, 0xaf4135],
  suave: [0xf6ece9, 0xfaf3f1, 0xfffaf9],
  light: [0xf3f3f3, 0xf9f9f9, 0xfbfbfb],
  dark: [0x202020, 0x282828, 0x2b2b2b],
};
const CORES = PALETAS[R.tema].map((c) => [c >> 16, (c >> 8) & 0xff, c & 0xff]);
const IDS = ['io.github.kbrianps.tomatito', 'io.github.kbrianps.tomatito.dev'];
// O settings.json dos padrões da 3.3 (settings.rs), com só o theme trocado.
const settingsATrocar = (tema) =>
  JSON.stringify({
    schemaVersion: 1, theme: tema, lastNormalTheme: 'lite', resolvedTheme: 'lite', focusMinutes: 25,
    breakMinutes: 5, sounds: { focusEnd: true, breakEnd: true }, volume: 80, closeToTray: true, trayTime: false,
    dailyGoalMinutes: 120, resetHour: 0, tomatoSize: 280, tomatoOnTop: true, fullMode: 'auto',
    fullValidated: '', linuxX11: false, autoUpdate: false, compact: false,
  }, null, 2);
function gravarSettings() {
  if (!TEMA) return;
  for (const id of IDS) {
    const dir = `${GLib.get_user_data_dir()}/${id}`;
    GLib.mkdir_with_parents(dir, 0o700);
    GLib.file_set_contents(`${dir}/settings.json`, settingsATrocar(TEMA));
  }
}
function lerSettings() {
  const achados = {};
  for (const id of IDS) {
    try {
      const [, bytes] = GLib.file_get_contents(`${GLib.get_user_data_dir()}/${id}/settings.json`);
      achados[id] = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      // sem arquivo nesse ID
    }
  }
  return achados;
}

const salvar = () => GLib.file_set_contents(`${OUT}/resultado.json`, JSON.stringify(R, null, 2));
const sleep = (ms) =>
  new Promise((r) => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => (r(), GLib.SOURCE_REMOVE)));
const agora = () => GLib.get_monotonic_time() / 1000;
const passo = (m) => {
  R.passos.push(`${Math.round(agora())} ${m}`);
  salvar();
};

// Dados e cache do app ficam em XDG_DATA_HOME e XDG_CACHE_HOME, isolados pelo
// rodar.sh. Apagar só o que é do app deixa a partida seguinte a frio.
function limparDadosDoApp() {
  for (const base of [GLib.get_user_data_dir(), GLib.get_user_cache_dir()]) {
    const dir = Gio.File.new_for_path(base);
    let it;
    try {
      it = dir.enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
    } catch {
      continue;
    }
    for (let info = it.next_file(null); info; info = it.next_file(null)) {
      if (!/tomatito/i.test(info.get_name())) continue;
      GLib.spawn_command_line_sync(`rm -rf ${GLib.shell_quote(`${base}/${info.get_name()}`)}`);
    }
  }
}

function esperarProcesso(proc, ms) {
  return new Promise((resolve) => {
    let feito = false;
    const fim = (v) => {
      if (!feito) {
        feito = true;
        resolve(v);
      }
    };
    proc.wait_async(null, () => fim(true));
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => (fim(false), GLib.SOURCE_REMOVE));
  });
}

async function lerConsole(porta, i) {
  const arq = `${OUT}/console-${i}.json`;
  const p = Gio.Subprocess.new([NODE, CONSOLE_MJS, `127.0.0.1:${porta}`, arq], Gio.SubprocessFlags.NONE);
  if (!(await esperarProcesso(p, 20000))) p.force_exit();
  try {
    const [, bytes] = GLib.file_get_contents(arq);
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (e) {
    return { erro: `sem saída do console.mjs: ${e}` };
  }
}

async function partida(i) {
  limparDadosDoApp();
  gravarSettings();
  const porta = 9400 + i;
  const L = new Gio.SubprocessLauncher({ flags: Gio.SubprocessFlags.STDERR_MERGE });
  L.setenv('WAYLAND_DISPLAY', 'tt-aninhado', true);
  L.setenv('GDK_BACKEND', 'wayland', true);
  L.setenv('WEBKIT_INSPECTOR_HTTP_SERVER', `127.0.0.1:${porta}`, true);
  L.set_stdout_file_path(`${OUT}/app-${i}.log`);

  const P = { partida: i, quadros: [] };
  let janela = null;
  let ator = null;
  let capturando = true;
  let pendente = false;
  let ultimaSoma = null;
  let t0 = 0;

  // get_image() antes do primeiro quadro derruba o shell (a textura ainda não
  // existe: "meta_multi_texture_get_n_planes: assertion failed"). A captura
  // só começa depois do sinal first-frame.
  let temQuadro = false;
  const capturar = () => {
    pendente = false;
    if (!capturando || !ator || !temQuadro) return;
    const t = Math.round(agora() - t0);
    let img = null;
    try {
      img = ator.get_image(null);
    } catch (e) {
      P.quadros.push({ t, erro: String(e) });
      return;
    }
    if (!img) return; // ainda sem buffer
    const arq = `${OUT}/p${i}-q${P.quadros.length}.png`;
    img.writeToPNG(arq);
    const [, bytes] = GLib.file_get_contents(arq);
    const soma = GLib.compute_checksum_for_data(GLib.ChecksumType.MD5, bytes);
    if (soma === ultimaSoma) {
      Gio.File.new_for_path(arq).delete(null);
      P.quadros.at(-1).repeticoes++;
      return;
    }
    ultimaSoma = soma;
    P.quadros.push({ t, arq, largura: img.getWidth(), altura: img.getHeight(), repeticoes: 0 });
  };
  const idPintura = global.stage.connect('after-paint', () => {
    if (!ator || !temQuadro || pendente || !capturando) return;
    pendente = true;
    // Logo depois da pintura, antes de o laço atender o próximo commit do app.
    GLib.idle_add(GLib.PRIORITY_HIGH, () => (capturar(), GLib.SOURCE_REMOVE));
  });

  let pid = null;
  const seguir = (w) => {
    if (janela || String(w.get_pid()) !== pid) return;
    janela = w;
    P.t_janela = Math.round(agora() - t0);
    const pegarAtor = () => {
      ator = w.get_compositor_private();
      if (!ator) return GLib.SOURCE_CONTINUE;
      ator.connect('first-frame', () => {
        P.t_primeiro_quadro = Math.round(agora() - t0);
        temQuadro = true; // o after-paint deste mesmo quadro faz a primeira captura
      });
      return GLib.SOURCE_REMOVE;
    };
    if (pegarAtor() === GLib.SOURCE_CONTINUE) GLib.idle_add(GLib.PRIORITY_HIGH, pegarAtor);
  };
  const idCriada = global.display.connect('window-created', (_d, w) => seguir(w));

  t0 = agora();
  const proc = L.spawnv([BIN]);
  pid = proc.get_identifier();
  P.pid = pid;
  passo(`partida ${i}: pid ${pid}`);

  const t1 = agora();
  while (!janela && agora() - t1 < 60000) await sleep(20);
  if (!janela) {
    P.erro = 'a janela não apareceu em 60 s';
    capturando = false;
  } else {
    P.titulo = janela.get_title();
    const t2 = agora();
    while (P.t_primeiro_quadro === undefined && agora() - t2 < 20000) await sleep(20);
    await sleep(CAPTURA_MS);
    capturando = false;
    const r = janela.get_frame_rect();
    P.frame = { x: r.x, y: r.y, w: r.width, h: r.height };
    P.console = await lerConsole(porta, i);
    janela.delete(global.get_current_time());
  }
  global.stage.disconnect(idPintura);
  global.display.disconnect(idCriada);
  const saiu = await esperarProcesso(proc, 10000);
  if (!saiu) {
    proc.force_exit();
    await esperarProcesso(proc, 3000);
  }
  P.saida = saiu ? (proc.get_if_exited() ? `saiu ${proc.get_exit_status()}` : 'sinal') : 'forçado';
  P.settingsNoDisco = lerSettings();
  passo(`partida ${i}: ${P.quadros.length} quadros distintos, ${P.saida}`);
  return P;
}

// Classificação pelas cores, numa amostra de 1 a cada 2 pixels nos dois eixos.
function analisar(arq) {
  const pb = GdkPixbuf.Pixbuf.new_from_file(arq);
  const w = pb.get_width();
  const h = pb.get_height();
  const n = pb.get_n_channels();
  const rs = pb.get_rowstride();
  const px = pb.get_pixels();
  const amostra = [];
  let branco = 0;
  let escuro = 0;
  let tema = 0;
  let transparente = 0;
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      const k = y * rs + x * n;
      const r = px[k];
      const g = px[k + 1];
      const b = px[k + 2];
      const a = n === 4 ? px[k + 3] : 255;
      amostra.push(r, g, b);
      // O branco puro vem antes do tema: no Claro e no Suave, o cartão fica a
      // menos de 8 do branco, e um quadro branco passaria por tema.
      if (a < 250) transparente++;
      else if (Math.min(r, g, b) >= 254) branco++;
      else if (CORES.some((c) => Math.abs(r - c[0]) <= 8 && Math.abs(g - c[1]) <= 8 && Math.abs(b - c[2]) <= 8)) tema++;
      else if (Math.min(r, g, b) >= 235) branco++;
      else if (Math.max(r, g, b) <= 64) escuro++;
    }
  }
  const tot = amostra.length / 3;
  const q = { branco: branco / tot, escuro: escuro / tot, tema: tema / tot, transparente: transparente / tot };
  q.veredito =
    q.transparente > 0.2
      ? 'transparente'
      : q.branco > 0.2
        ? 'branco'
        : q.escuro > 0.2 && !(R.tema === 'dark' && q.tema >= 0.5) // no Escuro, o fundo é escuro
          ? 'escuro'
          : q.tema >= 0.5
            ? R.tema
            : 'outro';
  return { q, amostra, w, h };
}

// Fração da amostra que muda entre dois quadros. A faixa da direita (12 px)
// fica de fora: a barra de rolagem sobreposta do WebKitGTK aparece quando a
// página carrega e some sozinha uns 2 s depois, e isso não é quadro errado.
const FAIXA_DA_ROLAGEM = 12;
function diferenca(a, b) {
  if (a.w !== b.w || a.h !== b.h) return 1;
  const colunas = Math.ceil(a.w / 2);
  let dif = 0;
  let tot = 0;
  for (let k = 0; k < a.amostra.length; k += 3) {
    if (((k / 3) % colunas) * 2 >= a.w - FAIXA_DA_ROLAGEM) continue;
    tot++;
    if (
      Math.abs(a.amostra[k] - b.amostra[k]) > 16 ||
      Math.abs(a.amostra[k + 1] - b.amostra[k + 1]) > 16 ||
      Math.abs(a.amostra[k + 2] - b.amostra[k + 2]) > 16
    )
      dif++;
  }
  return dif / tot;
}

// Folha de contato com os quadros distintos de uma partida, a 30%.
function folhaDeContato(quadros, destino) {
  const pbs = quadros.filter((q) => q.arq).map((q) => GdkPixbuf.Pixbuf.new_from_file(q.arq));
  if (!pbs.length) return;
  const esc = 0.3;
  const larg = pbs.map((pb) => Math.round(pb.get_width() * esc));
  const alt = Math.max(...pbs.map((pb) => Math.round(pb.get_height() * esc)));
  const folha = GdkPixbuf.Pixbuf.new(GdkPixbuf.Colorspace.RGB, true, 8, larg.reduce((s, l) => s + l + 8, 8), alt + 16);
  folha.fill(0x808080ff);
  let x = 8;
  pbs.forEach((pb, k) => {
    pb.scale(folha, x, 8, larg[k], Math.round(pb.get_height() * esc), x, 8, esc, esc, GdkPixbuf.InterpType.BILINEAR);
    x += larg[k] + 8;
  });
  folha.savev(destino, 'png', [], []);
}

async function principal() {
  passo(`início: ${PARTIDAS} partidas no tema ${R.tema} (${R.modo}${R.controle ? `, controle ${R.controle}` : ''})`);
  Main.messageTray.bannerBlocked = true; // sem GDM, o shell avisa que não há bloqueio de tela
  // Sem as animações do shell: o get_image() pega a janela com a escala e a
  // opacidade da animação de abrir (que cresce a partir da base, em ~150 ms),
  // e esses quadros misturariam o efeito do GNOME ao que o app desenhou.
  new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' }).set_boolean('enable-animations', false);
  if (Main.overview.visible) Main.overview.hide();
  await sleep(1500);
  for (let i = 1; i <= PARTIDAS; i++) {
    R.partidas.push(await partida(i));
    salvar();
    await sleep(800);
  }
  // Análise, depois de todas as partidas, para não pesar na captura.
  for (const P of R.partidas) {
    const analisados = P.quadros.filter((q) => q.arq).map((q) => ({ q, a: analisar(q.arq) }));
    const final = analisados.at(-1)?.a;
    for (const { q, a } of analisados) {
      Object.assign(q, a.q);
      q.diferenca_do_final = final ? diferenca(a, final) : null;
    }
    salvar();
  }
  const P1 = R.partidas[0];
  if (P1) folhaDeContato(P1.quadros, `${OUT}/quadros-partida-1.png`);
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
