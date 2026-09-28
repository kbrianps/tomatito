// Roteiro do M21b (o Tomatito instalado), carregado pelo dentro.sh com
// `gnome-shell --automation-script`. Roda com o AppImage de ~/.local/bin (ou
// outro TOMATITO_BIN), que traz a página embutida e não tem a sonda do Vite:
// tudo aqui sai da janela e dos pixels. Confere:
//   - a janela "Tomatito" aparece e é desenhada (fundo do Lite, não branco);
//   - o shell casa a janela com o Tomatito.desktop (o que o dock e o Alt+Tab
//     mostram), quando o instalado.sh põe o .desktop na rodada;
//   - fechar a janela pelo shell encerra o app (o dentro.sh confere a saída).
import GdkPixbuf from 'gi://GdkPixbuf';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import 'resource:///org/gnome/shell/ui/screenshot.js'; // promisifica Shell.Screenshot

export const METRICS = {};

const OUT = GLib.getenv('TT_OUT');
const R = { passos: [], checagens: {} };
const BG_APP = [0xa5, 0x34, 0x2b]; // --tt-bg-app do Lite
const CAMADA = [0xaa, 0x39, 0x2f]; // --tt-bg-surface do Lite

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
    perto(barra, BG_APP) && (perto(meio, CAMADA) || perto(meio, BG_APP)) && brancos / total < 0.2,
    { area, barra: hex(barra), meio: hex(meio), fracao_branca: +(brancos / total).toFixed(3) },
  );

  const app = Shell.WindowTracker.get_default().get_window_app(W);
  const id = app?.get_id() ?? null;
  R.app = { id, nome: app?.get_name() ?? null, wm_class: W.get_wm_class(), gtk_app_id: W.get_gtk_application_id() };
  if (GLib.getenv('TT_ESPERA_DESKTOP')) {
    checar('o shell casa a janela com o Tomatito.desktop (dock e Alt+Tab)', id === 'Tomatito.desktop' && app.get_name() === 'Tomatito', R.app);
  } else {
    passo(`app no shell: ${JSON.stringify(R.app)}`);
  }

  W.delete(global.get_current_time());
  const sumiu = await aguardar(() => janelas().length === 0, 5000);
  checar('fechar pelo shell fecha a janela', sumiu, { janelas: janelas().length });
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
