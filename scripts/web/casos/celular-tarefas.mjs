// W35: Tarefas e Progresso no celular (PLANO-WEB-V1, 5.4).
//
//   node scripts/web/verificar.mjs celular-tarefas
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';

const CAPTURAS = fileURLToPath(new URL('../../../docs/capturas/', import.meta.url));
const TEMAS = { lite: 'lite', suave: 'suave', claro: 'light', escuro: 'dark' };
const pausa = (ms) => `new Promise((ok) => setTimeout(ok, ${ms}))`;

async function tocarEm(p, expressao, nome, espera = 350) {
  const achou = await p.avaliar(`(() => { const b = ${expressao}; if (b) { b.dataset.alvoDoTeste = '1'; b.scrollIntoView({ block: 'center' }); } return !!b; })()`);
  if (!achou) throw new Error('sem o alvo: ' + nome);
  await p.avaliar(pausa(120));
  await p.tocar('[data-alvo-do-teste]');
  await p.avaliar(`(document.querySelector('[data-alvo-do-teste]')?.removeAttribute('data-alvo-do-teste'), ${pausa(espera)})`);
}
async function capturar(p, prefixo, seletor) {
  for (const [nome, tema] of Object.entries(TEMAS)) {
    await p.avaliar(`(document.documentElement.dataset.theme = ${JSON.stringify(tema)}, document.querySelector(${JSON.stringify(seletor)}).scrollIntoView({ block: 'center' }), ${pausa(300)})`);
    const { data } = await p.cmd('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${CAPTURAS}${prefixo}-${nome}.png`, Buffer.from(data, 'base64'));
  }
  await p.avaliar(`(document.documentElement.dataset.theme = 'lite', ${pausa(150)})`);
}
const visivel = (sel) => `[...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => e.getBoundingClientRect().width && !e.closest('[hidden]'))`;

export default async function celularTarefas(t) {
  const p = await t.novaAba({ celular: 'm', caminho: '/#/foco' });
  await p.avaliar(pausa(1200));

  await tocarEm(p, visivel('.tt-tarefas [data-adicionar-vazio], .tt-tarefas [data-adicionar]'), 'Adicionar tarefa');
  await tocarEm(p, visivel('.tt-tarefas [data-campo]'), 'campo da tarefa');
  await p.cmd('Input.insertText', { text: 'Estudar álgebra linear' });
  for (const type of ['keyDown', 'keyUp']) {
    await p.cmd('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: type === 'keyDown' ? '\r' : undefined });
  }
  await p.avaliar(pausa(500));
  const lista = await p.avaliar(`[...document.querySelectorAll('.tt-tarefa .tt-tarefa-titulo')].map((e) => e.textContent.trim())`);
  t.conferir('adicionar por toque no campo, digitar e Enter mostra a tarefa na lista', lista.includes('Estudar álgebra linear'), lista);

  await tocarEm(p, `document.querySelector('.tt-tarefa .tt-tarefa-check')`, 'caixa da tarefa');
  const feita = await p.avaliar(`document.querySelector('.tt-tarefa .tt-tarefa-check').getAttribute('aria-checked')`);
  t.conferir('concluir por toque na caixa marca a tarefa', feita === 'true', feita);
  await capturar(p, 'web-cel-tarefas', '.tt-card.tt-tarefas');

  const alvo = await p.avaliar(`(() => { const b = document.querySelector('.tt-tarefa .tt-tarefa-apagar'); if (!b) return null; const r = b.getBoundingClientRect(); const a = getComputedStyle(b, '::after'); return { w: Math.max(r.width, parseFloat(a.width) || 0), h: Math.max(r.height, parseFloat(a.height) || 0), visivel: r.width > 0 && getComputedStyle(b).visibility !== 'hidden' && getComputedStyle(b).opacity !== '0' }; })()`);
  t.conferir('o botão de apagar está à vista, com alvo de 48', !!alvo && alvo.visivel && alvo.w >= 48 && alvo.h >= 48, alvo);
  await tocarEm(p, `document.querySelector('.tt-tarefa .tt-tarefa-apagar')`, 'apagar a tarefa', 600);
  const depois = await p.avaliar(`[...document.querySelectorAll('.tt-tarefa .tt-tarefa-titulo')].map((e) => e.textContent.trim())`);
  t.conferir('apagar pelo botão remove a tarefa', !depois.includes('Estudar álgebra linear'), depois);

  const metaAntes = await p.avaliar(`JSON.parse(localStorage.getItem('tomatito:config') || '{}').dailyGoalMinutes ?? null`);
  await tocarEm(p, `document.querySelector('.tt-progresso-editar')`, 'Editar meta diária', 600);
  const d = await p.avaliar(`(() => {
    const dlg = document.querySelector('fluent-dialog');
    const caixa = dlg?.dialog ?? dlg?.shadowRoot?.querySelector('dialog');
    if (!caixa?.open) return null;
    const r = caixa.getBoundingClientRect();
    return { left: r.left, right: r.right, largura: r.width, iw: innerWidth, campos: [...dlg.querySelectorAll('fluent-dropdown')].map((x) => x.dataset.campo) };
  })()`);
  t.conferir('"Editar meta diária" abre por toque e cabe na largura', !!d && d.left >= 0 && d.right <= d.iw && d.largura <= d.iw - 32 + 1, d);
  await tocarEm(p, `document.querySelector('fluent-dialog fluent-dropdown')`, 'lista da meta', 500);
  await tocarEm(p, `[...document.querySelectorAll('fluent-dialog fluent-dropdown')][0].querySelectorAll('fluent-option:not([selected])')[0]`, 'opção da meta', 400);
  await tocarEm(p, `document.querySelector('fluent-dialog [data-salvar]')`, 'Salvar', 700);
  const metaDepois = await p.avaliar(`JSON.parse(localStorage.getItem('tomatito:config') || '{}').dailyGoalMinutes ?? null`);
  const fechou = await p.avaliar(`(() => { const dlg = document.querySelector('fluent-dialog'); const c = dlg?.dialog ?? dlg?.shadowRoot?.querySelector('dialog'); return !c?.open; })()`);
  t.conferir('o diálogo grava a meta por toque', fechou && metaDepois !== metaAntes && metaDepois !== null, { metaAntes, metaDepois, fechou });
  await capturar(p, 'web-cel-progresso', '.tt-card.tt-progresso');
  await p.fechar();

  const q = await t.novaAba({ celular: 'minimo', caminho: '/#/foco' });
  await q.avaliar(pausa(1200));
  const nums = await q.avaliar(`(() => {
    const els = [...document.querySelectorAll('.tt-progresso .tt-progresso-numero, .tt-progresso .tt-progresso-rotulo, .tt-progresso .tt-progresso-unidade')].filter((e) => e.getBoundingClientRect().width);
    const rs = els.map((e) => { const r = e.getBoundingClientRect(); return { t: e.textContent.trim(), l: r.left, r: r.right, top: r.top, b: r.bottom }; });
    const sobrepostos = [];
    for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
      const a = rs[i], c = rs[j];
      if (els[i].contains(els[j]) || els[j].contains(els[i])) continue;
      if (a.l < c.r - 0.5 && c.l < a.r - 0.5 && a.top < c.b - 0.5 && c.top < a.b - 0.5) sobrepostos.push([a.t, c.t]);
    }
    const cartao = document.querySelector('.tt-progresso').getBoundingClientRect();
    return { n: rs.length, sobrepostos, fora: rs.filter((x) => x.l < cartao.left - 0.5 || x.r > cartao.right + 0.5).map((x) => x.t) };
  })()`);
  t.conferir('perfil minimo: os números do Progresso não se sobrepõem nem saem do cartão', nums.n >= 3 && nums.sobrepostos.length === 0 && nums.fora.length === 0, nums);
  t.conferir('capturas web-cel-tarefas-* e web-cel-progresso-* nos 4 temas', true);
  await q.fechar();
}
