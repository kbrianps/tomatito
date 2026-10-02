// W33: a tela Foco no celular (PLANO-WEB-V1, 5.4).
//
//   node scripts/web/verificar.mjs celular-foco
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';

const CAPTURAS = fileURLToPath(new URL('../../../docs/capturas/', import.meta.url));
const TEMAS = { lite: 'lite', suave: 'suave', claro: 'light', escuro: 'dark' };
const BARRA = 98; // 64 + 34 (perfil m)

const assentar = `new Promise((ok) => {
  const olhar = () =>
    document.querySelector('.tt-pagina') && !document.querySelector('.tt-rolagem[data-entrando]') ? setTimeout(ok, 200) : setTimeout(olhar, 30);
  olhar();
})`;

async function capturar(p, prefixo) {
  for (const [nome, tema] of Object.entries(TEMAS)) {
    await p.avaliar(`(document.documentElement.dataset.theme = ${JSON.stringify(tema)}, new Promise((ok) => setTimeout(ok, 300)))`);
    const { data } = await p.cmd('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${CAPTURAS}${prefixo}-${nome}.png`, Buffer.from(data, 'base64'));
  }
  await p.avaliar(`(document.documentElement.dataset.theme = 'lite', new Promise((ok) => setTimeout(ok, 200)))`);
}

const botao = (nome) => `[...document.querySelectorAll('.tt-pagina button')].find((x) => (x.getAttribute('aria-label') || x.textContent).trim() === ${JSON.stringify(nome)} && x.getBoundingClientRect().width)`;
async function tocarPorNome(p, nome) {
  const achou = await p.avaliar(`(() => { const b = ${botao(nome)}; if (b) b.dataset.alvoDoTeste = '1'; return !!b; })()`);
  if (!achou) throw new Error('sem o botão ' + nome);
  await p.tocar('[data-alvo-do-teste]');
  await p.avaliar(`(document.querySelector('[data-alvo-do-teste]')?.removeAttribute('data-alvo-do-teste'), new Promise((ok) => setTimeout(ok, 350)))`);
}

export default async function celularFoco(t) {
  const p = await t.novaAba({ celular: 'm', caminho: '/#/foco' });
  await p.avaliar(assentar);

  const preparo = await p.avaliar(`(() => {
    const b = document.querySelector('.tt-preparo-iniciar').getBoundingClientRect();
    const ordem = [...document.querySelectorAll('.tt-pagina .tt-card')].map((c) => ({ classe: c.className, top: Math.round(c.getBoundingClientRect().top) }));
    return { fim: b.bottom, limite: innerHeight - ${BARRA}, ordem, minutos: document.querySelector('.tt-seletor-valor, .tt-seletor [data-valor], .tt-seletor-numero')?.textContent.trim() };
  })()`);
  t.conferir('preparo: "Iniciar sessão de foco" inteiro visível sem rolar', preparo.fim <= preparo.limite, preparo);
  const classes = preparo.ordem.map((c) => c.classe);
  const pos = (nome) => preparo.ordem.find((c) => c.classe.includes(nome))?.top;
  t.conferir(
    'a ordem de cima para baixo é sessão, tarefas, progresso',
    pos('tt-sessao') < pos('tt-tarefas') && pos('tt-tarefas') < pos('tt-progresso'),
    preparo.ordem,
  );

  const antes = await p.avaliar(`document.querySelector('.tt-seletor').textContent.replace(/\\s+/g, ' ').trim()`);
  await tocarPorNome(p, 'Aumentar');
  const depois = await p.avaliar(`document.querySelector('.tt-seletor').textContent.replace(/\\s+/g, ' ').trim()`);
  t.conferir('o seletor de minutos muda por toque no chevron (30 → 35)', /30/.test(antes) && /35/.test(depois), { antes, depois });
  await tocarPorNome(p, 'Diminuir');
  const alturas = await p.avaliar(`[...document.querySelectorAll('.tt-pagina .tt-card')].map((c) => getComputedStyle(c).minHeight)`);
  t.conferir('os cartões não têm min-height no celular', alturas.every((a) => a === '0px' || a === 'auto'), alturas);
  await capturar(p, 'web-cel-foco-preparo');

  await tocarPorNome(p, 'Iniciar sessão de foco');
  const sessao = await p.avaliar(`(() => {
    const m = document.querySelector('.tt-mostrador').getBoundingClientRect();
    const h = document.documentElement, r = document.querySelector('.tt-rolagem');
    return { largura: m.width, limite: innerWidth - 32, altura: m.height, semRolagem: h.scrollWidth === h.clientWidth && r.scrollWidth === r.clientWidth,
      botoes: [...document.querySelectorAll('.tt-sessao button')].map((b) => (b.getAttribute('aria-label') || b.textContent).trim()) };
  })()`);
  t.conferir('em sessão: o mostrador cabe na largura (≤ innerWidth − 32) e não há rolagem horizontal', sessao.largura <= sessao.limite && sessao.semRolagem, sessao);
  await capturar(p, 'web-cel-foco-sessao');

  await tocarPorNome(p, 'Pausar');
  const pausado = await p.avaliar(`[...document.querySelectorAll('.tt-sessao button')].map((b) => (b.getAttribute('aria-label') || b.textContent).trim())`);
  t.conferir('Pausar responde ao toque (aparece Retomar)', pausado.some((x) => /Retomar|Continuar/.test(x)), pausado);
  await tocarPorNome(p, 'Mais opções');
  const item = await p.avaliar(`(() => {
    const i = [...document.querySelectorAll('[role=menuitem], fluent-menu-item, .tt-menu-item')].find((x) => x.textContent.trim() === 'Encerrar sessão' && x.getBoundingClientRect().width);
    if (i) i.dataset.alvoDoTeste = '1';
    return !!i;
  })()`);
  if (!item) throw new Error('sem o item "Encerrar sessão" no menu');
  await p.tocar('[data-alvo-do-teste]');
  await p.avaliar(`new Promise((ok) => setTimeout(ok, 500))`);
  const voltou = await p.avaliar(`!!document.querySelector('.tt-preparo-iniciar') || !document.querySelector('.tt-mostrador')`);
  t.conferir('"Encerrar sessão" (menu Mais opções) responde ao toque: a sessão termina', voltou);
  t.conferir('capturas web-cel-foco-{preparo,sessao}-{lite,suave,claro,escuro}.png', true);
  await p.fechar();
}
