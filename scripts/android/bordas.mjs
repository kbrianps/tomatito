// Borda a borda, teclado e voltar (PLANO-ANDROID 5.7; A06), no tt37 com o
// build de depuração instalado e o app aberto:
//
//   node scripts/android/bordas.mjs
//
// 1. A página não recebe as faixas das barras: `.tt-janela` sem padding de
//    área segura, e a WebView menor que a tela (as barras viraram padding do
//    conteúdo, na MainActivity). Captura em docs/capturas/android-bordas.png.
// 2. Teclado: toque no campo de tarefa (input tap), `dumpsys input_method`
//    com mInputShown=true e o campo inteiro acima do fim da WebView.
// 3. Voltar: em Configurações, KEYCODE_BACK leva à Foco; na Foco, deixa o app
//    em segundo plano com o mesmo pid.
// Imprime um JSON e sai 1 se algo falhou.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { conectar } from './cdp.mjs';
import { carregarAmbiente, criarAdb, esperar } from './lib/ambiente.mjs';

const PACOTE = process.env.TT_PACOTE || 'io.github.kbrianps.tomatito.debug';
const env = carregarAmbiente();
const adb = criarAdb(env);
const resultados = [];
const conferir = (nome, ok, detalhe) => resultados.push({ nome, ok: Boolean(ok), detalhe });
const pid = () => adb.solto(['-s', env.ANDROID_SERIAL, 'shell', 'pidof', PACOTE]).stdout?.trim() ?? '';
const naFrente = () => adb.shell('dumpsys activity activities').match(/topResumedActivity=.*?\s(\S+\/\S+)/)?.[1] ?? '';

let cdp = await conectar();
const ir = (rota) =>
  cdp.avaliar(`new Promise((ok) => { const t0 = Date.now(); location.hash = '#/${rota}'; const olhar = () => Date.now() - t0 > 250 && location.hash === '#/${rota}' && document.querySelector('.tt-pagina') && !document.querySelector('.tt-rolagem[data-entrando]') ? setTimeout(ok, 300) : setTimeout(olhar, 50); olhar(); })`);
try {
  await ir('foco');
  const m = await cdp.avaliar(`(() => { const j = getComputedStyle(document.querySelector('.tt-janela')); return { top: j.paddingTop, left: j.paddingLeft, right: j.paddingRight, barra: getComputedStyle(document.querySelector('.tt-barra-inferior')).paddingBottom, innerHeight, telaCss: screen.height, dpr: devicePixelRatio }; })()`);
  conferir(
    'a página sem faixas de área segura (.tt-janela e barra inferior com padding 0)',
    m.top === '0px' && m.left === '0px' && m.right === '0px' && m.barra === '0px',
    m,
  );
  conferir('a WebView menor que a tela: as barras do sistema viraram padding do conteúdo', m.telaCss - m.innerHeight >= 40, m);
  const png = adb(['exec-out', 'screencap', '-p'], { encoding: 'buffer' });
  writeFileSync(fileURLToPath(new URL('../../docs/capturas/android-bordas.png', import.meta.url)), png);

  // Teclado: o toque de verdade no campo (o foco por CDP não abre o teclado).
  await cdp.avaliar(`(document.querySelector('.tt-tarefas [data-adicionar-vazio], .tt-tarefas [data-adicionar]')?.click(), new Promise((ok) => setTimeout(ok, 400)))`);
  const campo = await cdp.avaliar(`(() => { const c = document.querySelector('.tt-tarefas [data-campo]'); c.scrollIntoView({ block: 'center' }); const r = c.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, alturaPx: outerHeight * devicePixelRatio }; })()`);
  // Onde a WebView está na tela, pelo uiautomator (px do aparelho); o campo,
  // pelo CDP (px CSS) a partir do canto dela.
  adb.shell('uiautomator dump /sdcard/tt-ui.xml');
  const xml = adb.shell('cat /sdcard/tt-ui.xml');
  const no = /class="android\.webkit\.WebView"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(xml);
  if (!no) throw new Error('a WebView não apareceu no uiautomator');
  const [wx, wy] = [Number(no[1]), Number(no[2])];
  adb(['shell', 'input', 'tap', String(Math.round(wx + campo.x * m.dpr)), String(Math.round(wy + campo.y * m.dpr))]);
  await esperar(2000);
  const imeVisivel = /mInputShown=true/.test(adb.shell('dumpsys input_method'));
  const comTeclado = await cdp.avaliar(`(() => { const c = document.querySelector('.tt-tarefas [data-campo]'); const r = c.getBoundingClientRect(); return { foco: document.activeElement === c, fim: r.bottom, innerHeight }; })()`);
  conferir(
    'teclado aberto no campo de tarefa: mInputShown=true e o campo inteiro acima do fim da WebView',
    imeVisivel && comTeclado.fim < comTeclado.innerHeight && comTeclado.innerHeight < m.innerHeight,
    { imeVisivel, comTeclado, antes: m.innerHeight, webview: [wx, wy] },
  );
  // Fechar o teclado como uma pessoa: o "voltar" do sistema (o primeiro
  // voltar com o teclado aberto só o fecha), e tirar o foco do campo.
  for (let i = 0; i < 3 && /mInputShown=true/.test(adb.shell('dumpsys input_method')); i++) {
    adb(['shell', 'input', 'keyevent', 'KEYCODE_BACK']);
    await esperar(800);
  }
  await cdp.avaliar(`(document.activeElement?.blur(), new Promise((ok) => setTimeout(ok, 800)))`);

  // Voltar.
  await ir('configuracoes');
  adb(['shell', 'input', 'keyevent', 'KEYCODE_BACK']);
  await esperar(1200);
  const hash = await cdp.avaliar('location.hash');
  conferir('voltar em Configurações leva à Foco', hash === '#/foco', hash);
  const antes = pid();
  adb(['shell', 'input', 'keyevent', 'KEYCODE_BACK']);
  await esperar(2000);
  const depois = pid();
  const frente = naFrente();
  conferir('voltar na Foco deixa o app em segundo plano, com o mesmo pid', antes && antes === depois && !frente.includes('tomatito'), { antes, depois, frente });
} finally {
  await cdp.fechar();
}
const falhas = resultados.filter((r) => !r.ok);
console.log(JSON.stringify({ ok: falhas.length === 0, total: resultados.length, falhas: falhas.length, resultados }, null, 2));
process.exit(falhas.length ? 1 : 0);
