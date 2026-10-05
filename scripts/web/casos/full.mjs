// Caso full (v0.3; views/palco-tomate.js): o Tomatito Full na versão web.
//
//   node scripts/web/verificar.mjs full
//
// (a) a Aparência oferece o Tomatito Full; escolhido, o palco cobre o app (a
//     casca fica `inert`), com o tomate em "Pronto", 30:00, e a
//     `tomatito:config` com `theme: 'full'`;
// (b) o botão principal inicia a sessão de 30 min: "Foco", e o tempo anda
//     com o relógio; o Espaço pausa ("Pausado");
// (c) recarregada, a página já abre no palco, com a sessão pausada;
// (d) o Esc volta ao modo normal: o palco some, o tema volta ao anterior e a
//     tela Foco mostra a mesma sessão;
// (e) "Configurações" (a engrenagem do tomate) sai do Full e abre as
//     Configurações;
// (f) a barra tem "Voltar ao modo normal" e, onde o navegador oferece,
//     "Tela cheia" (que entra e sai) e "Mini tomate".
// A captura vai para docs/capturas/web-full.png (web-cel-full.png no celular).
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const caminho = '/#/configuracoes';
const CAPTURAS = fileURLToPath(new URL('../../../docs/capturas/', import.meta.url));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function esperar(p, expr, ms = 8000) {
  const fim = Date.now() + ms;
  for (;;) {
    if (await p.avaliar(expr)) return true;
    if (Date.now() > fim) return false;
    await sleep(50);
  }
}
const LER = `(() => {
  const palco = document.querySelector('.tt-palco');
  const s = palco?.querySelector('.stage');
  const caixa = s?.getBoundingClientRect();
  return {
    aberto: !!palco && !palco.hidden,
    inerte: document.querySelector('.tt-janela').hasAttribute('inert'),
    pref: document.documentElement.dataset.themePref,
    tema: document.documentElement.dataset.theme,
    gravado: JSON.parse(localStorage.getItem('tomatito:config') || '{}').theme ?? null,
    estado: s?.dataset.state ?? null,
    rotulo: s?.querySelector('[data-rotulo]').textContent ?? null,
    tempo: s?.querySelector('[data-tempo]').textContent ?? null,
    lado: caixa ? [Math.round(caixa.width), Math.round(caixa.height)] : null,
    barra: palco ? [...palco.querySelectorAll('.tt-palco-barra button')].map((b) => b.textContent.trim()) : [],
    rota: location.hash,
    rolaX: document.documentElement.scrollWidth - innerWidth,
  };
})()`;
const ABERTO = `(${LER}).aberto`;

export default async function full(t) {
  const p = t.pagina;
  await esperar(p, `!!document.querySelector('.tt-tema[data-tema="full"] .tt-previa-moldura')`);
  const antes = await p.avaliar(LER);

  // (a)
  await p.avaliar(`document.querySelector('.tt-tema[data-tema="full"] .tt-previa-moldura').click()`);
  const abriu = await esperar(p, `${ABERTO} && (${LER}).tempo === '30:00'`);
  const a = await p.avaliar(LER);
  t.conferir(
    '(a) escolher o Full abre o palco por cima do app: "Pronto", 30:00, theme full gravado',
    !antes.aberto && abriu && a.inerte && a.pref === 'full' && a.gravado === 'full' && a.estado === 'idle' && a.rotulo === 'Pronto' &&
      a.lado[0] >= 240 && a.lado[0] === a.lado[1] && a.rolaX <= 0,
    { antes: { aberto: antes.aberto, pref: antes.pref }, a },
  );
  await sleep(400);
  const { data } = await p.cmd('Page.captureScreenshot', { format: 'png' });
  mkdirSync(CAPTURAS, { recursive: true });
  writeFileSync(`${CAPTURAS}${t.celular ? 'web-cel-full' : 'web-full'}.png`, Buffer.from(data, 'base64'));

  // (b)
  await p.avaliar(`document.querySelector('.tt-palco [data-acao="principal"]').click()`);
  const correu = await esperar(p, `(${LER}).estado === 'focus'`, 4000);
  await t.relogio.avancar(61_000);
  const andou = await esperar(p, `(${LER}).tempo === '28:59'`, 4000);
  const b1 = await p.avaliar(LER);
  await p.cmd('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
  await p.cmd('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
  const pausou = await esperar(p, `(${LER}).estado === 'paused'`, 4000);
  const b2 = await p.avaliar(LER);
  t.conferir('(b) o botão principal inicia os 30 min, o tempo anda e o Espaço pausa', correu && andou && b1.rotulo === 'Foco' && pausou && b2.rotulo === 'Pausado', { b1, b2 });

  // (c)
  await p.recarregar();
  const voltou = await esperar(p, `${ABERTO} && (${LER}).estado === 'paused'`);
  const c = await p.avaliar(LER);
  t.conferir('(c) recarregada, a página já abre no palco, com a sessão pausada', voltou && c.inerte && c.tempo === b2.tempo, c);

  // (d)
  await p.cmd('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await p.cmd('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  const saiu = await esperar(p, `!${ABERTO}`, 4000);
  const d = await p.avaliar(LER);
  await p.avaliar(`location.hash = '#/foco'`);
  const naFoco = await esperar(p, `!!document.querySelector('[data-andamento]') && !document.querySelector('[data-andamento]').hidden`, 4000);
  t.conferir(
    '(d) o Esc volta ao modo normal: sem palco, o tema anterior, e a tela Foco com a mesma sessão',
    saiu && !d.inerte && d.pref === antes.pref && d.tema === antes.tema && d.gravado === antes.pref && naFoco,
    { d, naFoco },
  );

  // (e)
  await p.avaliar(`import('/src/lib/ipc.js').catch(() => null)`);
  await p.avaliar(`location.hash = '#/configuracoes'`);
  await esperar(p, `!!document.querySelector('.tt-tema[data-tema="full"] .tt-previa-moldura')`);
  // A tela acabou de montar: um instante para os ouvintes dela.
  await sleep(500);
  await p.avaliar(`document.querySelector('.tt-tema[data-tema="full"] .tt-previa-moldura').click()`);
  const reabriu = await esperar(p, ABERTO);
  await p.avaliar(`location.hash = '#/foco'`);
  await sleep(300);
  await p.avaliar(`document.querySelector('.tt-palco [data-acao="configuracoes"]').click()`);
  const e = (await esperar(p, `!${ABERTO} && location.hash === '#/configuracoes'`, 4000)) && (await p.avaliar(LER));
  t.conferir('(e) a engrenagem do tomate sai do Full e abre as Configurações', reabriu && e && e.pref === antes.pref && e.rota === '#/configuracoes', e);

  // (f)
  await esperar(p, `!!document.querySelector('.tt-tema[data-tema="full"] .tt-previa-moldura')`);
  await sleep(500);
  await p.avaliar(`document.querySelector('.tt-tema[data-tema="full"] .tt-previa-moldura').click()`);
  await esperar(p, ABERTO);
  const f = await p.avaliar(`({ ...${LER}, recursos: { telaCheia: document.fullscreenEnabled, mini: 'documentPictureInPicture' in window } })`);
  // A tela cheia de verdade: entra pelo botão (um clique real) e sai.
  let cheia = { entrou: null, saiu: null };
  if (f.recursos.telaCheia && !t.celular) {
    const c = await p.avaliar(`(() => { const r = document.querySelector('[data-palco="tela-cheia"]').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
    for (const type of ['mousePressed', 'mouseReleased']) await p.cmd('Input.dispatchMouseEvent', { type, x: c[0], y: c[1], button: 'left', clickCount: 1 });
    cheia.entrou = await esperar(p, `document.fullscreenElement?.classList.contains('tt-palco') && document.querySelector('[data-palco="tela-cheia"]').textContent === 'Sair da tela cheia'`, 4000);
    await p.avaliar(`document.exitFullscreen()`);
    cheia.saiu = await esperar(p, `!document.fullscreenElement && document.querySelector('[data-palco="tela-cheia"]').textContent === 'Tela cheia'`, 4000);
  }
  // O mini tomate (Document Picture-in-Picture), também por um clique real.
  let mini = { abriu: null, tempo: null, fechou: null };
  if (f.recursos.mini && !t.celular) {
    const c = await p.avaliar(`(() => { const r = document.querySelector('[data-palco="mini"]').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
    for (const type of ['mousePressed', 'mouseReleased']) await p.cmd('Input.dispatchMouseEvent', { type, x: c[0], y: c[1], button: 'left', clickCount: 1 });
    mini.abriu = await esperar(p, `!!documentPictureInPicture.window?.document.querySelector('.stage [data-tempo]')?.textContent`, 5000);
    if (mini.abriu) {
      mini.tempo = await p.avaliar(`(() => { const d = documentPictureInPicture.window.document; const s = d.querySelector('.stage'); const r = s.getBoundingClientRect(); return { tempo: s.querySelector('[data-tempo]').textContent, estado: s.dataset.state, lado: [Math.round(r.width), Math.round(r.height)], janela: [documentPictureInPicture.window.innerWidth, documentPictureInPicture.window.innerHeight], cor: getComputedStyle(s).color, folhas: d.adoptedStyleSheets.length + d.querySelectorAll('link[rel=stylesheet]').length }; })()`);
      await p.avaliar(`documentPictureInPicture.window.document.querySelector('[data-acao="voltar"]').click()`);
      mini.fechou = await esperar(p, `!documentPictureInPicture.window`, 4000);
    }
  }
  const esperada = [...(f.recursos.telaCheia ? ['Tela cheia'] : []), ...(f.recursos.mini ? ['Mini tomate'] : []), 'Voltar ao modo normal'];
  await p.avaliar(`document.querySelector('.tt-palco [data-palco="voltar"]').click()`);
  const fechou = await esperar(p, `!${ABERTO}`, 4000);
  t.conferir('(f) a barra: "Voltar ao modo normal" (que sai) e os botões do que o navegador oferece', f.barra.join('|') === esperada.join('|') && fechou && cheia.entrou !== false && cheia.saiu !== false && mini.abriu !== false && mini.fechou !== false, { barra: f.barra, recursos: f.recursos, cheia, mini });
}
