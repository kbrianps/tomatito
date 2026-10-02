// W34: a tela Temporizador no celular (PLANO-WEB-V1, 5.4).
//
//   node scripts/web/verificar.mjs celular-temporizador
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';

const CAPTURAS = fileURLToPath(new URL('../../../docs/capturas/', import.meta.url));
const TEMAS = { lite: 'lite', suave: 'suave', claro: 'light', escuro: 'dark' };
const pausa = (ms) => `new Promise((ok) => setTimeout(ok, ${ms}))`;

async function tocarEm(p, expressao, nome) {
  const achou = await p.avaliar(`(() => { const b = ${expressao}; if (b) b.dataset.alvoDoTeste = '1'; return !!b; })()`);
  if (!achou) throw new Error('sem o alvo: ' + nome);
  await p.tocar('[data-alvo-do-teste]');
  await p.avaliar(`(document.querySelector('[data-alvo-do-teste]')?.removeAttribute('data-alvo-do-teste'), ${pausa(350)})`);
}

export default async function celularTemporizador(t) {
  const p = await t.novaAba({ celular: 'p', caminho: '/#/temporizador' });
  await p.avaliar(pausa(1200));

  const m = await p.avaliar(`(() => {
    const cartoes = [...document.querySelectorAll('.tt-card.tt-temporizador')].map((c) => Math.round(c.getBoundingClientRect().left));
    const b = document.querySelector('.tt-temporizadores-barra').getBoundingClientRect();
    const inferior = document.querySelector('.tt-barra-inferior').getBoundingClientRect();
    return { cartoes, barra: [b.top, b.bottom, b.left, b.right], inferiorTopo: inferior.top, iw: innerWidth };
  })()`);
  t.conferir('perfil p: os cartões em 1 coluna', m.cartoes.length >= 2 && new Set(m.cartoes).size === 1, m.cartoes);
  t.conferir(
    'a barra flutuante inteira acima da barra inferior e dentro da largura',
    m.barra[1] <= m.inferiorTopo && m.barra[0] >= 0 && m.barra[2] >= 0 && m.barra[3] <= m.iw,
    m,
  );

  const cartao = `document.querySelector('.tt-card.tt-temporizador')`;
  const estado = () => p.avaliar(`${cartao}.dataset.estado`);
  const e0 = await estado();
  await tocarEm(p, `${cartao}.querySelector('button[aria-label="Iniciar"]')`, 'Iniciar');
  const e1 = await estado();
  await tocarEm(p, `${cartao}.querySelector('button[aria-label="Pausar"]')`, 'Pausar');
  const e2 = await estado();
  await tocarEm(p, `${cartao}.querySelector('button[aria-label="Redefinir"]')`, 'Redefinir');
  const e3 = await estado();
  t.conferir('iniciar, pausar e redefinir por toque', e1 !== e0 && e2 !== e1 && e3 === e0, { e0, e1, e2, e3 });

  await tocarEm(p, `document.querySelector('[data-adicionar]')`, 'Adicionar temporizador');
  const d = await p.avaliar(`(() => {
    const dlg = document.querySelector('fluent-dialog');
    const caixa = dlg?.dialog ?? dlg?.shadowRoot?.querySelector('dialog');
    if (!caixa || !caixa.open) return null;
    const r = caixa.getBoundingClientRect();
    const botoes = [...dlg.querySelectorAll('button')].filter((b) => /Salvar|Cancelar/.test(b.textContent)).map((b) => { const q = b.getBoundingClientRect(); return { nome: b.textContent.trim(), top: q.top, bottom: q.bottom, left: q.left, right: q.right }; });
    return { largura: r.width, esperado: innerWidth - 32, botoes, ih: innerHeight, iw: innerWidth };
  })()`);
  t.conferir('o diálogo de edição tem largura innerWidth − 32', !!d && Math.abs(d.largura - d.esperado) <= 1, d);
  t.conferir(
    'os botões de ação do diálogo ficam visíveis',
    !!d && d.botoes.length === 2 && d.botoes.every((b) => b.top >= 0 && b.bottom <= d.ih && b.left >= 0 && b.right <= d.iw),
    d?.botoes,
  );
  const { data: shot } = await p.cmd('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${CAPTURAS}web-cel-temporizador-dialogo.png`, Buffer.from(shot, 'base64'));
  await tocarEm(p, `[...document.querySelectorAll('fluent-dialog button')].find((b) => b.textContent.trim() === 'Cancelar')`, 'Cancelar');

  for (const [nome, tema] of Object.entries(TEMAS)) {
    await p.avaliar(`(document.documentElement.dataset.theme = ${JSON.stringify(tema)}, ${pausa(300)})`);
    const { data } = await p.cmd('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${CAPTURAS}web-cel-temporizador-${nome}.png`, Buffer.from(data, 'base64'));
  }
  t.conferir('capturas web-cel-temporizador-{lite,suave,claro,escuro}.png', true);
  await p.fechar();
}
