// Roteiro do M11 (tokens do Fluent gerados), carregado com `gnome-shell
// --automation-script` pelo dentro.sh. Roda dentro do próprio shell e grava
// $TT_OUT/resultado.json; quem confere é o resumo-temas-fluent.mjs, que tem os
// tokens gerados à mão (o roteiro roda no GJS, sem os pacotes do npm). Na
// janela main de verdade (WebKitGTK no Mutter 50, Wayland):
//   1. no Lite, captura a janela nas cinco telas, com o ponteiro fora dela.
//      Com TT_ANTES apontando para a pasta de uma rodada anterior (por
//      exemplo, com o index.html e o main.js do M10, ainda com o setTheme
//      provisório), compara pixel a pixel: "nada muda na tela";
//   2. no #/dev, troca o data-theme do <html> entre lite, suave, light e dark
//      pela sonda (como quem usa o console do DevTools) e, em cada tema, lê na
//      captura as cores do switch ligado (trilho e bolinha), do desligado
//      (bolinha), do radio marcado (ponto) e do cartão, e pede à página os
//      tokens e as cores dos componentes (__ttFluent, de
//      scripts/preview/medidas.js);
//   3. a prévia aninhada: um <div data-theme="suave"> com um switch dentro do
//      <html> do Lite.
// No fim, volta ao Lite, fecha a janela pelo compositor, e o dentro.sh confere
// se o app saiu.
import Clutter from 'gi://Clutter';
import GdkPixbuf from 'gi://GdkPixbuf';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import 'resource:///org/gnome/shell/ui/screenshot.js'; // promisifica Shell.Screenshot

// runPerfScript exige METRICS; o teste não mede desempenho.
export const METRICS = {};

const OUT = GLib.getenv('TT_OUT');
const SONDA_LOG = GLib.getenv('SONDA_LOG');
const ANTES = GLib.getenv('TT_ANTES');
const R = { passos: [], checagens: {}, lite: {}, pixels: {}, fluent: {}, aninhado: null, antes: ANTES || null };
const ALTURA = 700;
const ROTAS = ['foco', 'temporizador', 'cronometro', 'configuracoes', 'dev'];
const TEMAS = ['lite', 'suave', 'light', 'dark'];

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
    return new TextDecoder()
      .decode(bytes)
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));
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
async function aguardar(fn, ms) {
  const t0 = Date.now();
  let v = fn();
  while (!v && Date.now() - t0 < ms) {
    await sleep(100);
    v = fn();
  }
  return v;
}

// Comando para a página, como no console do DevTools (sonda.config.mjs). O
// resultado do __ttFluent é grande: no registro de passos, só o começo.
let nComando = 0;
async function comando(js) {
  const id = `c${++nComando}`;
  GLib.file_set_contents(`${OUT}/comando.json`, JSON.stringify({ id, js }));
  const r = await esperar(() => sonda().find((e) => e.tipo === 'comando' && e.dados.id === id), 5000, `comando ${js}`);
  const texto = JSON.stringify(r.dados.resultado) ?? 'null';
  passo(`comando ${js} => ${texto.length > 200 ? `${texto.slice(0, 200)}…` : texto}`);
  return r.dados.resultado;
}

let ptr;
const agora = () => GLib.get_monotonic_time();
const mover = (x, y) => ptr.notify_absolute_motion(agora(), x, y);

async function captura(nome, area) {
  const shooter = new Shell.Screenshot();
  const s = Gio.File.new_for_path(`${OUT}/${nome}`).replace(null, false, Gio.FileCreateFlags.NONE, null);
  await shooter.screenshot_area(area.x, area.y, area.w, area.h, s);
  s.close(null);
  passo(`captura ${nome}`);
}

function leitorDePixels(arquivo) {
  const pb = GdkPixbuf.Pixbuf.new_from_file(arquivo);
  const p = pb.get_pixels();
  const r = pb.get_rowstride();
  const n = pb.get_n_channels();
  return { w: pb.get_width(), h: pb.get_height(), px: (x, y) => [p[y * r + x * n], p[y * r + x * n + 1], p[y * r + x * n + 2]] };
}
const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();

// Pixels diferentes entre duas capturas do mesmo tamanho (null se o tamanho
// não bate), e a caixa que os contém.
function diferenca(a, b) {
  const A = leitorDePixels(a);
  const B = leitorDePixels(b);
  if (A.w !== B.w || A.h !== B.h) return { pixels: null, tamanhos: [[A.w, A.h], [B.w, B.h]] };
  let n = 0;
  const caixa = [Infinity, Infinity, -1, -1];
  for (let y = 0; y < A.h; y++) {
    for (let x = 0; x < A.w; x++) {
      const p = A.px(x, y);
      const q = B.px(x, y);
      if (p[0] !== q[0] || p[1] !== q[1] || p[2] !== q[2]) {
        n++;
        caixa[0] = Math.min(caixa[0], x);
        caixa[1] = Math.min(caixa[1], y);
        caixa[2] = Math.max(caixa[2], x);
        caixa[3] = Math.max(caixa[3], y);
      }
    }
  }
  return { pixels: n, caixa: n ? caixa : null };
}

// Onde ler cada cor no #/dev, em px da página (a captura começa no canto da
// janela). Trilho do switch ligado: 8 px para dentro da borda esquerda (a
// bolinha fica à direita). Cartão: canto de cima à direita, longe do texto.
// M13: o cartão "Opções" desceu (o "Botões de ícone" entrou antes dele), e a
// tela rola até ele ficar no meio da janela antes de medir.
const GEOMETRIA = `(async () => {
  document.querySelector('[aria-labelledby="amostra-opcoes"]').scrollIntoView({ block: 'center' });
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const c = (el) => { const b = el.getBoundingClientRect(); return [Math.round(b.x + b.width / 2), Math.round(b.y + b.height / 2)]; };
  const [lig, des] = document.querySelectorAll('fluent-switch');
  const radio = [...document.querySelectorAll('fluent-radio')].find((r) => r.checked);
  const cartao = document.querySelector('[aria-labelledby="amostra-opcoes"]').getBoundingClientRect();
  const bl = lig.getBoundingClientRect();
  return {
    trilhoLigado: [Math.round(bl.x + 8), Math.round(bl.y + bl.height / 2)],
    bolinhaLigado: c(lig.shadowRoot.querySelector('.checked-indicator')),
    bolinhaDesligado: c(des.shadowRoot.querySelector('.checked-indicator')),
    pontoRadio: c(radio.shadowRoot.querySelector('.checked-indicator')),
    cartao: [Math.round(cartao.right - 24), Math.round(cartao.top + 12)],
    marcados: [lig.checked, des.checked, radio.value],
  };
})()`;

async function principal() {
  passo(`início${ANTES ? ` (comparando com ${ANTES})` : ''}`);
  tente(() => new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' }).set_boolean('enable-hot-corners', false));
  tente(() => (Main.messageTray.bannerBlocked = true));
  const seat = global.stage.context.get_backend().get_default_seat();
  ptr = seat.create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
  await sleep(200);
  mover(960, 1070);
  await sleep(300);
  if (Main.overview.visible) Main.overview.hide();

  const W = (await esperar(() => (janelas().length && rect(janelas()[0]).w > 0 ? janelas() : null), 120000, 'a janela do Tomatito'))[0];
  await esperar(() => estado()?.nav?.itens?.length === 4, 30000, 'o painel desenhado (sonda)');
  if (W.is_maximized()) W.unmaximize();
  W.move_resize_frame(true, 300, 150, 1000, ALTURA);
  await sleep(1000);
  const r = rect(W);
  Main.activateWindow(W);
  await sleep(500);
  await esperar(() => estado()?.inner?.[1] === ALTURA, 5000, 'a janela em 1000 x 700');
  // O ponteiro fica fora da janela: nenhum hover nas capturas.
  mover(r.x + r.w + 200, r.y + r.h + 100);
  await sleep(300);
  const tema = await comando('document.documentElement.dataset.theme');
  checar('a janela abre no Lite', tema === 'lite', tema);

  // 1. As cinco telas no Lite.
  for (const rota of ROTAS) {
    await comando(`location.hash = '#/${rota}'`);
    await esperar(() => estado()?.nav?.hash === `#/${rota}`, 3000, `#/${rota}`);
    await sleep(700); // o indicador desliza em 250 ms
    const nome = `lite-${rota}.png`;
    await captura(nome, r);
    R.lite[rota] = ANTES ? diferenca(`${OUT}/${nome}`, `${ANTES}/${nome}`) : null;
    salvar();
  }

  // 2. Os quatro temas no #/dev.
  const g = await comando(GEOMETRIA);
  R.geometria = g;
  checar('#/dev com o switch "Tocar som" ligado, o "Pular intervalos" desligado e o radio de 5 minutos marcado', JSON.stringify(g?.marcados) === '[true,false,"5"]', g?.marcados);
  for (const t of TEMAS) {
    await comando(`document.documentElement.dataset.theme = '${t}'`);
    await sleep(600);
    const nome = `dev-${t}.png`;
    await captura(nome, r);
    const { px } = leitorDePixels(`${OUT}/${nome}`);
    R.pixels[t] = Object.fromEntries(
      ['trilhoLigado', 'bolinhaLigado', 'bolinhaDesligado', 'pontoRadio', 'cartao'].map((k) => [k, hex(px(...g[k]))]),
    );
    R.fluent[t] = await comando('__ttFluent()');
    salvar();
  }

  // 3. Prévia aninhada, com o <html> de volta no Lite.
  await comando("document.documentElement.dataset.theme = 'lite'");
  await sleep(300);
  R.aninhado = await comando("__ttFluentAninhado('suave')");

  // 4. Erros na página e fim.
  const erros = sonda().filter((x) => x.tipo === 'erro').map((x) => x.dados);
  checar('nenhum erro na página', erros.length === 0, erros);
  W.delete(global.get_current_time());
  const sumiu = await aguardar(() => janelas().length === 0, 5000);
  checar('fechar pelo compositor fecha a janela', sumiu, { janelas: janelas().length });
  await sleep(1500);
  passo('fim');
}

function tente(fn) {
  try {
    fn();
  } catch (e) {
    passo(`aviso: ${e}`);
  }
}

export async function run() {
  try {
    await principal();
  } catch (e) {
    R.erro = `${e}\n${e.stack}`;
    salvar();
  }
}
