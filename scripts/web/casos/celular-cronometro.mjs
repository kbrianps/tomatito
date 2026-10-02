// W34: a tela Cronômetro no celular (PLANO-WEB-V1, 5.4).
//
//   node scripts/web/verificar.mjs celular-cronometro
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';

const CAPTURAS = fileURLToPath(new URL('../../../docs/capturas/', import.meta.url));
const TEMAS = { lite: 'lite', suave: 'suave', claro: 'light', escuro: 'dark' };
const pausa = (ms) => `new Promise((ok) => setTimeout(ok, ${ms}))`;
const botao = (nome) => `document.querySelector('.tt-cronometro-botoes button[aria-label="${nome}"]')`;

async function tocarEm(p, expressao, nome, espera = 120) {
  const achou = await p.avaliar(`(() => { const b = ${expressao}; if (b) b.dataset.alvoDoTeste = '1'; return !!b; })()`);
  if (!achou) throw new Error('sem o alvo: ' + nome);
  await p.tocar('[data-alvo-do-teste]');
  await p.avaliar(`(document.querySelector('[data-alvo-do-teste]')?.removeAttribute('data-alvo-do-teste'), ${pausa(espera)})`);
}

const MEDIR = `(() => {
  const n = document.querySelector('.tt-cronometro-tempo').getBoundingClientRect();
  const h = document.documentElement;
  const v = document.querySelector('.tt-voltas');
  const inferior = document.querySelector('.tt-barra-inferior').getBoundingClientRect().top;
  const botoes = [...document.querySelectorAll('.tt-cronometro-botoes button')].map((b) => { const r = b.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), w: r.width }; });
  return {
    numero: [n.left, n.right], iw: innerWidth, semRolagemHorizontal: h.scrollWidth === h.clientWidth,
    voltas: v && !v.hidden ? { linhas: v.querySelectorAll('tbody tr').length, rola: v.scrollHeight > v.clientHeight, fim: v.getBoundingClientRect().bottom, overflowY: getComputedStyle(v).overflowY } : null,
    botoes, inferior,
  };
})()`;

export default async function celularCronometro(t) {
  const p = await t.novaAba({ celular: 'minimo', caminho: '/#/cronometro' });
  await p.avaliar(pausa(1200));
  const a = await p.avaliar(MEDIR);
  t.conferir(
    'a 320 × 568, o número inteiro (com os centésimos) cabe na largura',
    a.numero[0] >= 0 && a.numero[1] <= a.iw && a.semRolagemHorizontal,
    a,
  );

  await tocarEm(p, botao('Iniciar'), 'Iniciar', 300);
  for (let i = 0; i < 30; i++) await tocarEm(p, botao('Marcar volta'), 'Marcar volta', 60);
  await p.avaliar(pausa(300));
  const b = await p.avaliar(MEDIR);
  t.conferir('30 voltas marcadas por toque', b.voltas?.linhas === 30, b.voltas);
  t.conferir('a lista de voltas rola por dentro e termina acima da barra inferior', b.voltas?.rola === true && b.voltas.fim <= b.inferior + 1, b.voltas);
  await p.avaliar(`(document.querySelector('.tt-voltas').scrollTop = 600, ${pausa(200)})`);
  const c = await p.avaliar(MEDIR);
  t.conferir(
    'com a lista rolada, os botões continuam no lugar e visíveis',
    c.botoes.length >= 2 && c.botoes.every((x, i) => x.top === b.botoes[i].top && x.top >= 0 && x.bottom <= c.inferior),
    { antes: b.botoes, depois: c.botoes, inferior: c.inferior },
  );
  t.conferir('com 30 voltas, o número continua cabendo na largura', c.numero[0] >= 0 && c.numero[1] <= c.iw && c.semRolagemHorizontal, c.numero);
  await tocarEm(p, botao('Pausar'), 'Pausar', 300);

  for (const [nome, tema] of Object.entries(TEMAS)) {
    await p.avaliar(`(document.documentElement.dataset.theme = ${JSON.stringify(tema)}, ${pausa(300)})`);
    const { data } = await p.cmd('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${CAPTURAS}web-cel-cronometro-${nome}.png`, Buffer.from(data, 'base64'));
  }
  t.conferir('capturas web-cel-cronometro-{lite,suave,claro,escuro}.png', true);
  await p.fechar();
}
