// Roteiro do M13 (botões próprios, foco e ícones), carregado com
// `gnome-shell --automation-script` pelo dentro.sh. Roda dentro do próprio
// shell, com ponteiro e teclado virtuais, e grava $TT_OUT/resultado.json; quem
// confere é o resumo-botoes.mjs, com as mesmas regras da prévia
// (scripts/preview/botoes.mjs). Na janela main de verdade (WebKitGTK no
// Mutter 50, Wayland), no #/dev e no Lite:
//   1. os botões e os desabilitados do Fluent com as cores dos tokens
//      (__ttBotoes e __ttDesabilitados) e os ícones do catálogo (__ttIcones);
//   2. o anel duplo com o Tab do teclado virtual: na página (:focus-visible,
//      contorno e sombra) e nos pixels (2 px de creme por fora, 1 px do
//      cartão colado ao botão); o clique do ponteiro não mostra o anel;
//   3. o Tab passa pelos desabilitados sem parar e chega ao sutil "Mais
//      opções", com o anel e a dica; Esc fecha a dica e o foco fica;
//   4. hover e clique do ponteiro num botão padrão e num sutil, nos pixels;
//   5. a dica com o ponteiro parado num circular grande: fechada antes do
//      atraso, aberta depois, em cima e centrada a 4 px (página e pixels);
//      passando ao vizinho, a dica dele vem sem o atraso;
//      some com Esc, ao sair (também para fora da janela, com um movimento de
//      verdade) e ao apertar o botão; nada no botão desabilitado; com um menu
//      aberto, a dica aparece e o menu continua aberto.
// No fim, fecha a janela pelo compositor, e o dentro.sh confere se o app saiu.
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
const R = { passos: [], checagens: {}, medidas: {}, anel: {}, tab: {}, estados: {}, dica: {} };
const ALTURA = 700;
// As cores esperadas nos pixels saem do tokens.css, no resumo-botoes.mjs.

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

// Comando para a página, como no console do DevTools (sonda.config.mjs).
let nComando = 0;
async function comando(js) {
  const id = `c${++nComando}`;
  GLib.file_set_contents(`${OUT}/comando.json`, JSON.stringify({ id, js }));
  const r = await esperar(() => sonda().find((e) => e.tipo === 'comando' && e.dados.id === id), 5000, `comando ${js}`);
  const texto = JSON.stringify(r.dados.resultado) ?? 'null';
  passo(`comando ${js} => ${texto.length > 300 ? `${texto.slice(0, 300)}…` : texto}`);
  return r.dados.resultado;
}

let ptr;
let kb;
const agora = () => GLib.get_monotonic_time();
const mover = (x, y) => ptr.notify_absolute_motion(agora(), x, y);
const botao = (apertado) =>
  ptr.notify_button(agora(), Clutter.BUTTON_PRIMARY, apertado ? Clutter.ButtonState.PRESSED : Clutter.ButtonState.RELEASED);
const tecla = (keyval, apertada) =>
  kb.notify_keyval(agora(), keyval, apertada ? Clutter.KeyState.PRESSED : Clutter.KeyState.RELEASED);

async function clicar(x, y) {
  mover(x, y);
  await sleep(150);
  botao(true);
  await sleep(60);
  botao(false);
  await sleep(500);
}
// Move o ponteiro de um ponto a outro em passos de 8 px, a uns 60 Hz, como
// um mouse de verdade (o compositor manda cada posição à janela).
async function deslizar([x0, y0], [x1, y1]) {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 8));
  for (let i = 1; i <= n; i++) {
    mover(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n);
    await sleep(16);
  }
}
async function apertar(keyval) {
  tecla(keyval, true);
  await sleep(40);
  tecla(keyval, false);
  await sleep(450);
}

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
const doHex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const perto = (a, b, tol = 3) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
// Azul: matiz de 190° a 250° com saturação de verdade (o brand do Fluent).
function azul([r, g, b]) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = (max - min) / 255;
  if (d < 0.1) return false;
  let h = max === r ? ((g - b) / (max - min)) % 6 : max === g ? (b - r) / (max - min) + 2 : (r - g) / (max - min) + 4;
  h = (h * 60 + 360) % 360;
  return h >= 190 && h <= 250;
}

// Pixels de uma caixa [x, y, w, h] (px da página) numa captura da janela:
// quantos têm a cor dada (com tolerância) e quantos são azuis.
function contarNaCaixa(arquivo, [x, y, w, h], cor) {
  const { px } = leitorDePixels(arquivo);
  const alvo = doHex(cor);
  let total = 0;
  let iguais = 0;
  let azuis = 0;
  for (let j = Math.ceil(y); j < Math.floor(y + h); j++) {
    for (let i = Math.ceil(x); i < Math.floor(x + w); i++) {
      const p = px(i, j);
      total++;
      if (perto(p, alvo)) iguais++;
      if (azul(p)) azuis++;
    }
  }
  return { total, iguais, azuis, fracao: total ? Math.round((iguais / total) * 100) / 100 : 0 };
}

// Pixels diferentes entre duas capturas do mesmo tamanho, e a caixa [x0, y0,
// x1, y1] que os contém (null se nada mudou). A faixa de 14 px da direita fica
// de fora: a barra de rolagem sobreposta do WebKitGTK aparece a cada rolagem e
// some sozinha (a mesma exclusão do roteiro partida-a-frio, M08).
const FAIXA_DA_BARRA = 14;
function diferenca(a, b) {
  const A = leitorDePixels(a);
  const B = leitorDePixels(b);
  if (A.w !== B.w || A.h !== B.h) return { pixels: null, tamanhos: [[A.w, A.h], [B.w, B.h]] };
  let n = 0;
  const caixa = [Infinity, Infinity, -1, -1];
  for (let y = 0; y < A.h; y++) {
    for (let x = 0; x < A.w - FAIXA_DA_BARRA; x++) {
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

const js = (v) => JSON.stringify(v);
// Cor de um pixel da captura (px da página, com a janela em 1 × 1).
const pixel = (arquivo, x, y) => hex(leitorDePixels(arquivo).px(Math.round(x), Math.round(y)));
// O anel em volta de uma caixa [x, y, w, h]: 1 a 4 px para fora, no meio da
// borda esquerda, da direita e da de cima.
function anelNosPixels(arquivo, [x, y, w, h]) {
  const { px } = leitorDePixels(arquivo);
  const meioY = Math.round(y + h / 2);
  const meioX = Math.round(x + w / 2);
  const x0 = Math.round(x);
  const x1 = Math.round(x + w);
  const y0 = Math.round(y);
  const fora = (d) => ({
    esquerda: hex(px(x0 - d, meioY)),
    direita: hex(px(x1 - 1 + d, meioY)),
    cima: hex(px(meioX, y0 - d)),
  });
  return { 1: fora(1), 2: fora(2), 3: fora(3), 4: fora(4) };
}

async function principal() {
  passo('início');
  tente(() => new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' }).set_boolean('enable-hot-corners', false));
  tente(() => (Main.messageTray.bannerBlocked = true));
  const seat = global.stage.context.get_backend().get_default_seat();
  ptr = seat.create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
  kb = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
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
  const longe = () => mover(r.x + r.w + 200, r.y + r.h + 100);
  const neutro = () => mover(r.x + 140, r.y + 400);
  longe();
  await sleep(300);
  await comando("location.hash = '#/dev'");
  const e = await esperar(() => (estado()?.titulo === 'Catálogo de controles' ? estado() : null), 3000, 'o #/dev');
  checar('o #/dev abre o catálogo, no Lite', e.tema === 'lite', { titulo: e.titulo, tema: e.tema });

  // 1. Medidas da página: botões, desabilitados do Fluent e ícones.
  R.medidas.cores = await comando(
    "Object.fromEntries(['--tt-ctl','--tt-ctl-stroke-top','--tt-ctl-stroke-bottom','--tt-fg-1','--tt-accent','--tt-fg-on-accent','--tt-accent-disabled','--tt-fg-disabled','--tt-bg-card','--tt-border'].map((t) => [t, __ttCor(t)]))",
  );
  R.medidas.botoes = await comando('__ttBotoes()');
  R.medidas.desabilitados = await comando('__ttDesabilitados()');
  R.medidas.icones = await comando('__ttIcones()');
  salvar();
  // Capturas de registro (docs/capturas/m13-*.png): cada cartão no meio da tela.
  for (const cartao of ['botoes', 'opcoes', 'caixas', 'listas', 'icones']) {
    const sel = cartao === 'opcoes' ? '[aria-labelledby="amostra-opcoes"]' : `[data-amostra="${cartao}"]`;
    await comando(`(document.querySelector('${sel}').scrollIntoView({ block: 'center' }), true)`);
    await sleep(300);
    R.medidas[`cartao-${cartao}`] = await comando(`(() => { const b = document.querySelector('${sel}').getBoundingClientRect(); return [b.x, b.y, b.width, b.height].map(Math.round); })()`);
    await captura(`cartao-${cartao}.png`, r);
  }

  // 2. Anel duplo pelo Tab: o foco no título da tela (tabindex -1, como o
  // roteador faz), e o Tab vai ao primeiro botão.
  const rolarTopo = "(document.querySelector('.tt-rolagem').scrollTop = 0, true)";
  await comando(rolarTopo);
  await comando("(document.querySelector('.tt-amostra-topo h1').focus(), true)");
  await sleep(200);
  await captura('anel-antes.png', r);
  await apertar(Clutter.KEY_Tab);
  const b = await comando('__ttBotoes()');
  R.anel.foco = await comando('__ttFoco()');
  await captura('anel.png', r);
  R.anel.caixa = b.destaque.caixa;
  R.anel.pixels = anelNosPixels(`${OUT}/anel.png`, b.destaque.caixa);
  R.anel.antes = anelNosPixels(`${OUT}/anel-antes.png`, b.destaque.caixa);
  R.anel.dentro = pixel(`${OUT}/anel.png`, b.destaque.caixa[0] + 4, b.destaque.caixa[1] + b.destaque.caixa[3] / 2);
  salvar();

  // 3. Tab até o sutil "Mais opções" (Cancelar e, pulando os dois
  // desabilitados, o sutil); a dica aparece pelo teclado; Esc fecha só a dica.
  await apertar(Clutter.KEY_Tab);
  R.tab.segundo = (await comando('__ttFoco()')).elemento;
  await apertar(Clutter.KEY_Tab);
  await sleep(300);
  R.tab.sutil = await comando('({ foco: __ttFoco(), dica: __ttDica() })');
  await captura('tab-sutil.png', r);
  const bs = await comando('__ttBotoes()');
  R.tab.pixels = anelNosPixels(`${OUT}/tab-sutil.png`, bs.sutil.caixa);
  await apertar(Clutter.KEY_Escape);
  R.tab.esc = await comando('({ foco: __ttFoco(), dica: __ttDica() })');
  salvar();

  // 4. O clique do ponteiro não mostra o anel; hover e clique nos pixels.
  {
    const c = (await comando('__ttBotoes()')).padrao.caixa;
    const alvo = [r.x + Math.round(c[0] + c[2] / 2), r.y + Math.round(c[1] + c[3] / 2)];
    const fundo = [c[0] + 4, c[1] + c[3] / 2];
    await captura('padrao-repouso.png', r);
    R.estados.repouso = pixel(`${OUT}/padrao-repouso.png`, ...fundo);
    mover(...alvo);
    await sleep(400);
    await captura('padrao-hover.png', r);
    R.estados.hover = pixel(`${OUT}/padrao-hover.png`, ...fundo);
    botao(true);
    await sleep(300);
    await captura('padrao-clique.png', r);
    R.estados.clique = pixel(`${OUT}/padrao-clique.png`, ...fundo);
    R.estados.cliqueBaixo = pixel(`${OUT}/padrao-clique.png`, c[0] + c[2] / 2, c[1] + c[3] - 1);
    R.estados.repousoBaixo = pixel(`${OUT}/padrao-repouso.png`, c[0] + c[2] / 2, c[1] + c[3] - 1);
    botao(false);
    await sleep(300);
    R.estados.focoDoClique = await comando('__ttFoco()');
    await captura('padrao-clicado.png', r);
    R.estados.anelDoClique = anelNosPixels(`${OUT}/padrao-clicado.png`, c);
    neutro();
    await sleep(300);
    const s = (await comando('__ttBotoes()')).sutil.caixa;
    // Perto do canto de baixo: a dica aparece em cima do botão, e a sombra
    // dela escurece a parte de cima.
    const fundoSutil = [s[0] + 3, s[1] + s[3] - 4];
    mover(r.x + Math.round(s[0] + s[2] / 2), r.y + Math.round(s[1] + s[3] / 2));
    await sleep(600);
    await captura('sutil-hover.png', r);
    R.estados.sutilHover = pixel(`${OUT}/sutil-hover.png`, ...fundoSutil);
    R.estados.sutilRepouso = pixel(`${OUT}/padrao-repouso.png`, ...fundoSutil);
    neutro();
    await sleep(300);
    salvar();
  }

  // 5. A dica com o ponteiro.
  {
    await comando(`(document.querySelector('[data-amostra="botoes-icone"]').scrollIntoView({ block: 'center' }), true)`);
    await sleep(300);
    const g = (await comando('__ttBotoes()')).grande.caixa;
    const centro = [r.x + Math.round(g[0] + g[2] / 2), r.y + Math.round(g[1] + g[3] / 2)];
    await captura('dica-antes.png', r);
    mover(...centro);
    await sleep(120);
    R.dica.cedo = await comando('__ttDica()');
    await sleep(500);
    R.dica.mouse = await comando('__ttDica()');
    await captura('dica.png', r);
    R.dica.diferenca = diferenca(`${OUT}/dica-antes.png`, `${OUT}/dica.png`);
    R.dica.pixelDentro = R.dica.mouse.dica ? pixel(`${OUT}/dica.png`, R.dica.mouse.dica[0] + 3, R.dica.mouse.dica[1] + 3) : null;
    // Com a dica aberta, o vizinho da esquerda ("Pausar") ganha a dica sem o atraso.
    const gd = (await comando('__ttBotoes()'))['grande-destaque'].caixa;
    const vizinho = [r.x + Math.round(gd[0] + gd[2] / 2), r.y + Math.round(gd[1] + gd[3] / 2)];
    await deslizar(centro, vizinho);
    await sleep(80);
    R.dica.vizinho = await comando('__ttDica()');
    await apertar(Clutter.KEY_Escape);
    R.dica.esc = await comando('__ttDica()');
    // Sai e volta: aparece de novo; sai para o neutro: some.
    await deslizar(centro, [r.x + 140, r.y + 400]);
    await sleep(400);
    await deslizar([r.x + 140, r.y + 400], centro);
    await sleep(600);
    R.dica.deNovo = await comando('__ttDica()');
    await deslizar(centro, [r.x + 140, r.y + 400]);
    await sleep(500);
    R.dica.saiu = await comando('__ttDica()');
    // Para fora da janela, com um movimento de verdade (até a borda esquerda).
    await deslizar([r.x + 140, r.y + 400], centro);
    await sleep(600);
    const abertaAntesDeSair = (await comando('__ttDica()')).aberta;
    await deslizar(centro, [r.x - 60, centro[1]]);
    await sleep(600);
    R.dica.foraDaJanela = { antes: abertaAntesDeSair, depois: (await comando('__ttDica()')).aberta };
    // Apertar o botão fecha a dica.
    await deslizar([r.x - 60, centro[1]], centro);
    await sleep(600);
    const antesDoClique = (await comando('__ttDica()')).aberta;
    botao(true);
    await sleep(200);
    R.dica.clique = { antes: antesDoClique, depois: (await comando('__ttDica()')).aberta };
    botao(false);
    await sleep(200);
    // Nada no botão desabilitado.
    const d = (await comando('__ttBotoes()'))['grande-desabilitado'].caixa;
    await deslizar(centro, [r.x + Math.round(d[0] + d[2] / 2), r.y + Math.round(d[1] + d[3] / 2)]);
    await sleep(700);
    R.dica.desabilitado = await comando('__ttDica()');
    neutro();
    await sleep(300);
    salvar();
  }

  // 6. Com um menu aberto, a dica aparece e o menu continua aberto.
  {
    const p = await comando("__ttPosicionar('menu-sessao', 'meio')");
    await clicar(r.x + p.clique[0], r.y + p.clique[1]);
    const antes = await comando("__ttMedirPopover('menu-sessao')");
    // A roda do mouse sobe até os botões de ícone (o menu fica aberto; some
    // da tela com o botão, pelo position-visibility).
    await comando(`(document.querySelector('[data-amostra="botoes-icone"]').scrollIntoView({ block: 'center' }), true)`);
    await sleep(300);
    const g = (await comando('__ttBotoes()')).grande.caixa;
    await deslizar([r.x + p.clique[0], r.y + p.clique[1]], [r.x + Math.round(g[0] + g[2] / 2), r.y + Math.round(g[1] + g[3] / 2)]);
    await sleep(700);
    R.dica.comMenu = { menuAntes: antes.aberto, dica: await comando('__ttDica()'), menuDepois: (await comando("__ttMedirPopover('menu-sessao')")).aberto };
    neutro();
    await sleep(300);
    await comando('__ttFecharPopovers()');
    salvar();
  }

  // 7. Erros na página e fim.
  const erros = sonda().filter((x) => x.tipo === 'erro').map((x) => x.dados);
  checar('nenhum erro na página', erros.length === 0, erros);
  W.delete(global.get_current_time());
  const sumiu = await aguardar(() => janelas().length === 0, 5000);
  checar('fechar pelo compositor fecha a janela', sumiu, { janelas: janelas().length });
  await sleep(1500);
  passo('fim');
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
