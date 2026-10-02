// W31: a barra de navegação inferior do layout de celular (PLANO-WEB-V1, 5.2).
//
//   node scripts/web/verificar.mjs celular-navegacao
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';

const CAPTURAS = fileURLToPath(new URL('../../../docs/capturas/', import.meta.url));
const ROTAS = ['foco', 'temporizador', 'cronometro', 'configuracoes'];
const ROTULOS = ['Foco', 'Temporizador', 'Cronômetro', 'Configurações'];
const TEMAS = { lite: 'lite', suave: 'suave', claro: 'light', escuro: 'dark' };

const assentar = (rota) => `new Promise((ok) => {
  const olhar = () =>
    location.hash === '#/${rota}' && document.querySelector('.tt-pagina') && !document.querySelector('.tt-rolagem[data-entrando]')
      ? requestAnimationFrame(() => requestAnimationFrame(ok))
      : setTimeout(olhar, 30);
  olhar();
})`;

export default async function celularNavegacao(t) {
  const p = await t.novaAba({ celular: 'm', caminho: '/' });
  await p.avaliar(assentar('foco'));

  const m = await p.avaliar(`(() => {
    const barra = document.querySelector('.tt-barra-inferior');
    const r = barra.getBoundingClientRect();
    const itens = [...barra.querySelectorAll('a.tt-nav-item')].map((a) => {
      const b = a.getBoundingClientRect();
      const rot = a.querySelector('.tt-nav-rotulo').getBoundingClientRect();
      return { rotulo: a.textContent.trim(), w: b.width, h: b.height, rotuloVisivel: rot.width > 1 && rot.height > 1, atual: a.getAttribute('aria-current') };
    });
    return {
      lateral: getComputedStyle(document.querySelector('.tt-nav')).display,
      altura: r.height, fim: r.bottom, innerHeight, itens,
      rotulo: barra.getAttribute('aria-label'),
      overscroll: getComputedStyle(document.querySelector('.tt-rolagem')).overscrollBehaviorY,
    };
  })()`);
  t.conferir('a .tt-nav lateral tem display none', m.lateral === 'none', m.lateral);
  t.conferir(
    'a barra tem 4 itens: Foco, Temporizador, Cronômetro e Configurações, com o rótulo à vista',
    m.itens.length === 4 && m.itens.every((i, n) => i.rotulo === ROTULOS[n] && i.rotuloVisivel) && m.rotulo === 'Principal',
    m.itens,
  );
  t.conferir('cada item mede ≥ 48 × 48', m.itens.every((i) => i.w >= 48 && i.h >= 48), m.itens);
  t.conferir('no perfil m, a barra mede 64 + 34 = 98 px e encosta no fim do viewport', m.altura === 98 && m.fim === m.innerHeight, m);
  t.conferir('overscroll-behavior-y contain na .tt-rolagem', m.overscroll === 'contain', m.overscroll);

  const trocas = [];
  for (const rota of [...ROTAS.slice(1), 'foco']) {
    await p.tocar(`.tt-barra-inferior a[data-rota="${rota}"]`);
    await p.avaliar(assentar(rota));
    trocas.push(await p.avaliar(`({
      rota: ${JSON.stringify(rota)},
      hash: location.hash,
      atuais: [...document.querySelectorAll('.tt-barra-inferior a[aria-current="page"]')].map((a) => a.dataset.rota),
    })`));
  }
  t.conferir(
    'tocar em cada item troca a rota e o aria-current, e só o atual tem aria-current="page"',
    trocas.every((x) => x.hash === `#/${x.rota}` && x.atuais.length === 1 && x.atuais[0] === x.rota),
    trocas,
  );

  await p.avaliar(`document.querySelector('.tt-barra-inferior a[data-rota="foco"]').focus()`);
  const tecla = async (key) => {
    await p.cmd('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key, windowsVirtualKeyCode: key === 'ArrowRight' ? 39 : 37 });
    await p.cmd('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, windowsVirtualKeyCode: key === 'ArrowRight' ? 39 : 37 });
    return p.avaliar('document.activeElement?.dataset?.rota');
  };
  const direita = await tecla('ArrowRight');
  const direita2 = await tecla('ArrowRight');
  const esquerda = await tecla('ArrowLeft');
  t.conferir(
    'com o foco na barra, → e ← movem entre os itens',
    direita === 'temporizador' && direita2 === 'cronometro' && esquerda === 'temporizador',
    { direita, direita2, esquerda },
  );

  await p.tocar('.tt-barra-inferior a[data-rota="configuracoes"]');
  await p.avaliar(assentar('configuracoes'));
  const fim = await p.avaliar(`(() => {
    const r = document.querySelector('.tt-rolagem');
    r.scrollTop = r.scrollHeight;
    const todos = [...document.querySelectorAll('.tt-pagina *')].filter((e) => e.getClientRects().length);
    const ultimo = todos.reduce((a, e) => (e.getBoundingClientRect().bottom > a ? e.getBoundingClientRect().bottom : a), 0);
    return { ultimo, limite: innerHeight - 98 };
  })()`);
  t.conferir('o último elemento das Configurações, rolado até o fim, fica acima da barra', fim.ultimo <= fim.limite, fim);

  for (const [nome, tema] of Object.entries(TEMAS)) {
    await p.tocar('.tt-barra-inferior a[data-rota="foco"]');
    await p.avaliar(assentar('foco'));
    await p.avaliar(`(document.documentElement.dataset.theme = ${JSON.stringify(tema)}, new Promise((ok) => setTimeout(ok, 500)))`);
    const { data } = await p.cmd('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${CAPTURAS}web-cel-navegacao-${nome}.png`, Buffer.from(data, 'base64'));
  }
  t.conferir('capturas web-cel-navegacao-{lite,suave,claro,escuro}.png', true);
  await p.fechar();
}
