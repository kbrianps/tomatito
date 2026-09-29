// Roteiro do M21b (o Tomatito instalado), carregado pelo dentro.sh com
// `gnome-shell --automation-script`. Roda com o AppImage de ~/.local/bin (ou
// outro TOMATITO_BIN), que traz a página embutida e não tem a sonda do Vite:
// tudo aqui sai da janela e dos pixels. Confere:
//   - a janela "Tomatito" aparece e é desenhada (fundo do Lite, não branco);
//   - o shell casa a janela com o Tomatito.desktop (o que o dock e o Alt+Tab
//     mostram), quando o instalado.sh põe o .desktop na rodada;
//   - fechar a janela pelo shell a esconde, e o app fica na bandeja (M36:
//     "fechar para a bandeja" vem ligado);
//   - abrir o binário de novo mostra a mesma janela (instância única, M37), e
//     a segunda abertura sai com código 0;
//   - Ctrl+Q encerra o app (o dentro.sh confere a saída com código 0).
// O M45 roda o mesmo roteiro com o binário e o .desktop do .deb.
import Clutter from 'gi://Clutter';
import GdkPixbuf from 'gi://GdkPixbuf';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import 'resource:///org/gnome/shell/ui/screenshot.js'; // promisifica Shell.Screenshot

export const METRICS = {};

const OUT = GLib.getenv('TT_OUT');
const R = { passos: [], checagens: {} };
const BG_APP = [0xa5, 0x34, 0x2b]; // --tt-bg-app do Lite
const CAMADA = [0xaa, 0x39, 0x2f]; // --tt-bg-surface do Lite
const CARTAO = [0xaf, 0x41, 0x35]; // --tt-bg-card do Lite (o layout do M42 põe um cartão no ponto medido)

const salvar = () => GLib.file_set_contents(`${OUT}/resultado.json`, JSON.stringify(R, null, 2));
const sleep = (ms) =>
  new Promise((r) => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => (r(), GLib.SOURCE_REMOVE)));
const janelas = () =>
  global.get_window_actors().map((a) => a.meta_window).filter((w) => w.get_title() === 'Tomatito');
const passo = (m) => {
  R.passos.push(`${Math.round(GLib.get_monotonic_time() / 1000)} ${m}`);
  salvar();
};
const checar = (nome, ok, detalhe) => {
  R.checagens[nome] = { ok: Boolean(ok), detalhe };
  passo(`${ok ? 'ok' : 'FALHA'}: ${nome}`);
};
async function aguardar(fn, ms) {
  const t0 = Date.now();
  let v = fn();
  while (!v && Date.now() - t0 < ms) {
    await sleep(100);
    v = fn();
  }
  return v;
}
const perto = (a, b, tol = 3) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();

async function capturar(nome, area) {
  const shooter = new Shell.Screenshot();
  const s = Gio.File.new_for_path(`${OUT}/${nome}`).replace(null, false, Gio.FileCreateFlags.NONE, null);
  await shooter.screenshot_area(area.x, area.y, area.w, area.h, s);
  s.close(null);
  passo(`captura ${nome}`);
}

async function principal() {
  passo('início');
  const kb = global.stage.context.get_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
  try {
    Main.messageTray.bannerBlocked = true;
  } catch {}
  if (Main.overview.visible) Main.overview.hide();

  const lista = await aguardar(() => (janelas().length && janelas()[0].get_frame_rect().width > 0 ? janelas() : null), 60000);
  checar('a janela "Tomatito" aparece', lista, { janelas: lista?.length ?? 0 });
  if (!lista) return;
  const W = lista[0];
  await sleep(3000); // a página embutida carrega e pinta

  const f = W.get_frame_rect();
  const area = { x: f.x, y: f.y, w: f.width, h: f.height };
  await capturar('instalado.png', area);
  const pb = GdkPixbuf.Pixbuf.new_from_file(`${OUT}/instalado.png`);
  const px = pb.get_pixels();
  const rs = pb.get_rowstride();
  const n = pb.get_n_channels();
  const cor = (x, y) => [0, 1, 2].map((i) => px[y * rs + x * n + i]);
  // Barra de título (y = 16, longe dos botões) e o meio da camada de conteúdo.
  const barra = cor(Math.round(area.w / 2), 16);
  const meio = cor(Math.round(area.w * 0.6), Math.round(area.h * 0.9));
  let brancos = 0;
  let total = 0;
  for (let y = 0; y < area.h; y += 7) {
    for (let x = 0; x < area.w; x += 7) {
      const c = cor(x, y);
      total++;
      if (c.every((v) => v >= 245)) brancos++;
    }
  }
  checar(
    'a página embutida é desenhada no Lite (barra em #A5342B, conteúdo sem clarão branco)',
    perto(barra, BG_APP) && [CAMADA, CARTAO, BG_APP].some((c) => perto(meio, c)) && brancos / total < 0.2,
    { area, barra: hex(barra), meio: hex(meio), fracao_branca: +(brancos / total).toFixed(3) },
  );

  const app = Shell.WindowTracker.get_default().get_window_app(W);
  const id = app?.get_id() ?? null;
  R.app = { id, nome: app?.get_name() ?? null, wm_class: W.get_wm_class(), gtk_app_id: W.get_gtk_application_id() };
  if (GLib.getenv('TT_ESPERA_DESKTOP')) {
    checar('o shell casa a janela com o Tomatito.desktop (dock e Alt+Tab)', id === 'Tomatito.desktop' && app.get_name() === 'Tomatito', R.app);
    // O ícone do .desktop (Icon=tomatito) acha o PNG no tema hicolor da rodada.
    const icone = app?.app_info?.get_icon()?.to_string() ?? null;
    const arquivo = icone ? new St.IconTheme().lookup_icon(icone, 48, 0)?.get_filename() ?? null : null;
    checar('o ícone do .desktop vem do tema hicolor (tomatito.png)', icone === 'tomatito' && /\/hicolor\/.*\/apps\/tomatito\.png$/.test(arquivo ?? ''), { icone, arquivo });
  } else {
    passo(`app no shell: ${JSON.stringify(R.app)}`);
  }

  const visiveis = () => janelas().filter((w) => w.showing_on_its_workspace());
  W.delete(global.get_current_time());
  const sumiu = await aguardar(() => visiveis().length === 0, 5000);
  checar('fechar pelo shell esconde a janela (o app fica na bandeja)', sumiu, { visiveis: visiveis().length });
  await sleep(1000);

  // A segunda abertura avisa a primeira, que mostra a janela, e sai.
  const L = new Gio.SubprocessLauncher({ flags: Gio.SubprocessFlags.STDERR_MERGE });
  L.setenv('WAYLAND_DISPLAY', 'tt-aninhado', true);
  L.setenv('GDK_BACKEND', 'wayland', true);
  L.set_stdout_file_path(`${OUT}/app-segunda.log`);
  const segunda = L.spawnv([GLib.getenv('TOMATITO_BIN')]);
  const saiu = await new Promise((resolve) => {
    let feito = false;
    const fim = (v) => !feito && ((feito = true), resolve(v));
    segunda.wait_async(null, () => fim(true));
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 30000, () => (fim(false), GLib.SOURCE_REMOVE));
  });
  const codigo = saiu && segunda.get_if_exited() ? segunda.get_exit_status() : null;
  if (!saiu) segunda.force_exit();
  const volta = await aguardar(() => (visiveis().length ? visiveis()[0] : null), 15000);
  checar('abrir de novo mostra a janela (instância única) e a segunda abertura sai com 0', volta && visiveis().length === 1 && codigo === 0, {
    saiu,
    codigo,
    visiveis: visiveis().length,
  });
  if (!volta) return;

  // Ctrl+Q com a janela ativa: o app sai (o dentro.sh confere o código).
  Main.activateWindow(volta);
  await sleep(1500);
  const t = () => GLib.get_monotonic_time();
  kb.notify_keyval(t(), Clutter.KEY_Control_L, Clutter.KeyState.PRESSED);
  await sleep(40);
  kb.notify_keyval(t(), Clutter.KEY_q, Clutter.KeyState.PRESSED);
  await sleep(40);
  kb.notify_keyval(t(), Clutter.KEY_q, Clutter.KeyState.RELEASED);
  await sleep(40);
  kb.notify_keyval(t(), Clutter.KEY_Control_L, Clutter.KeyState.RELEASED);
  passo('teclas Control_L+q');
  const fechou = await aguardar(() => janelas().length === 0, 8000);
  checar('Ctrl+Q fecha a janela', fechou, { janelas: janelas().length });
  await sleep(2000);
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
