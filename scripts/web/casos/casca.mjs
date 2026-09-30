// Caso casca (PLANO-WEB, W03b; PLANO-WEB-V1, W03b): a interface do desktop
// roda no navegador, com a casca web, sem tomar do navegador o que é dele.
//
//   npm run build:web && node scripts/web/verificar.mjs casca
//
// Em http://localhost:4273/#/foco (o dist-web pelo vite preview):
// (a) o Foco aparece (a grade da tela e o item Foco do painel como atual);
// (b) getComputedStyle(.tt-titlebar).display === 'none';
// (c) <html data-casca="web">;
// (d) um keydown F5 e um contextmenu sintéticos voltam com
//     defaultPrevented === false, e uma marca em window sobrevive (nada
//     recarregou);
// (e) um Ctrl+1 sintético volta com defaultPrevented === false e a rota não
//     muda; o mesmo vale para Ctrl+1 e Ctrl+, a partir do Temporizador, onde
//     o atalho do desktop trocaria de tela;
// (f) a 320 px de largura, nas 4 rotas, scrollWidth === clientWidth (no
//     <html> e na área que rola).
export const servidor = 'preview';
export const caminho = '/#/foco';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Espera `expr` (avaliada na página) ficar verdadeira, até `ms`. */
async function esperar(p, expr, ms = 5000) {
  const fim = Date.now() + ms;
  for (;;) {
    if (await p.avaliar(expr)) return true;
    if (Date.now() > fim) return false;
    await sleep(50);
  }
}

// Dispara no body (os atalhos ouvem no document, na fase de bolha) e devolve
// o defaultPrevented, o hash antes e depois.
const teclar = (init) => `(async () => {
  const antes = location.hash;
  const e = new KeyboardEvent('keydown', Object.assign({ bubbles: true, cancelable: true, composed: true }, ${JSON.stringify(init)}));
  document.body.dispatchEvent(e);
  await new Promise((r) => setTimeout(r, 300));
  return { defaultPrevented: e.defaultPrevented, antes, depois: location.hash };
})()`;

export default async function casca(t) {
  const p = t.pagina;

  // (a)
  const foco = await esperar(p, `(() => {
    const g = document.querySelector('.tt-rolagem .tt-foco-grade');
    return !!g && g.getBoundingClientRect().height > 0;
  })()`);
  const a = await p.avaliar(`({
    hash: location.hash,
    grade: !!document.querySelector('.tt-rolagem .tt-foco-grade'),
    atual: document.querySelector('.tt-nav [aria-current="page"]')?.textContent.trim() ?? null,
  })`);
  t.conferir('(a) o Foco aparece', foco && a.hash === '#/foco' && a.grade && /Foco/.test(a.atual ?? ''), a);

  // (b)
  const b = await p.avaliar(`(() => {
    const el = document.querySelector('.tt-titlebar');
    return { existe: !!el, display: el ? getComputedStyle(el).display : null };
  })()`);
  t.conferir("(b) getComputedStyle(.tt-titlebar).display === 'none'", b.existe && b.display === 'none', b);

  // (c)
  const c = await p.avaliar('document.documentElement.dataset.casca ?? null');
  t.conferir('(c) <html data-casca="web">', c === 'web', { casca: c });

  // (d) A marca fica em window; se o F5 recarregasse, ela sumiria.
  await p.avaliar('window.__ttMarcaW03b = 42');
  const f5 = await p.avaliar(teclar({ key: 'F5', code: 'F5' }));
  const menu = await p.avaliar(`(async () => {
    const alvo = document.querySelector('.tt-foco-grade') ?? document.body;
    const r = alvo.getBoundingClientRect();
    const e = new MouseEvent('contextmenu', {
      bubbles: true, cancelable: true, composed: true, button: 2,
      clientX: r.left + r.width / 2, clientY: r.top + Math.min(r.height / 2, 40),
    });
    alvo.dispatchEvent(e);
    await new Promise((res) => setTimeout(res, 300));
    return { defaultPrevented: e.defaultPrevented };
  })()`);
  await sleep(500);
  const marca = await p.avaliar('window.__ttMarcaW03b ?? null');
  t.conferir(
    '(d) F5 e contextmenu sintéticos com defaultPrevented === false, e a marca em window sobrevive',
    f5.defaultPrevented === false && menu.defaultPrevented === false && marca === 42,
    { f5: f5.defaultPrevented, contextmenu: menu.defaultPrevented, marca },
  );

  // (e) Em #/foco, como pede o plano; e no Temporizador, onde o Ctrl+1 e o
  // Ctrl+, do desktop levariam a outra tela.
  const ctrl1 = { key: '1', code: 'Digit1', ctrlKey: true };
  const ctrlVirgula = { key: ',', code: 'Comma', ctrlKey: true };
  const e1 = await p.avaliar(teclar(ctrl1));
  await p.avaliar(`location.hash = '#/temporizador'`);
  await esperar(p, `location.hash === '#/temporizador'`);
  await sleep(300);
  const e2 = await p.avaliar(teclar(ctrl1));
  const e3 = await p.avaliar(teclar(ctrlVirgula));
  const semMudar = (r, hash) => r.defaultPrevented === false && r.antes === hash && r.depois === hash;
  t.conferir(
    '(e) Ctrl+1 sintético com defaultPrevented === false e a rota não muda (e Ctrl+1 e Ctrl+, no Temporizador)',
    semMudar(e1, '#/foco') && semMudar(e2, '#/temporizador') && semMudar(e3, '#/temporizador'),
    { focoCtrl1: e1, temporizadorCtrl1: e2, temporizadorCtrlVirgula: e3 },
  );

  // (f) Largura de 320 px (sem emular celular: o layout de celular chega no
  // W07a/W30; aqui é o layout de hoje que não pode estourar a largura).
  await p.cmd('Emulation.setDeviceMetricsOverride', { width: 320, height: 568, deviceScaleFactor: 1, mobile: false });
  const larguras = {};
  for (const rota of ['foco', 'temporizador', 'cronometro', 'configuracoes']) {
    await p.avaliar(`location.hash = '#/${rota}'`);
    await esperar(p, `location.hash === '#/${rota}'`);
    await sleep(700);
    larguras[rota] = await p.avaliar(`(() => {
      const h = document.documentElement;
      const r = document.querySelector('.tt-rolagem');
      return {
        innerWidth,
        html: [h.scrollWidth, h.clientWidth],
        rolagem: r ? [r.scrollWidth, r.clientWidth] : null,
      };
    })()`);
  }
  await p.cmd('Emulation.clearDeviceMetricsOverride');
  const cabe = (m) =>
    m.innerWidth === 320 && m.html[0] === m.html[1] && (m.rolagem === null || m.rolagem[0] === m.rolagem[1]);
  t.conferir('(f) a 320 px, nas 4 rotas, scrollWidth === clientWidth', Object.values(larguras).every(cabe), larguras);
}
