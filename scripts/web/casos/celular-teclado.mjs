// W37: teclado virtual no celular (PLANO-WEB-V1, 5.5).
//
//   node scripts/web/verificar.mjs celular-teclado
const pausa = (ms) => `new Promise((ok) => setTimeout(ok, ${ms}))`;
const visivel = (sel) => `[...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => e.getBoundingClientRect().width && !e.closest('[hidden]'))`;

async function tocarEm(p, expressao, nome, espera = 400) {
  const achou = await p.avaliar(`(() => { const b = ${expressao}; if (b) { b.dataset.alvoDoTeste = '1'; b.scrollIntoView({ block: 'center' }); } return !!b; })()`);
  if (!achou) throw new Error('sem o alvo: ' + nome);
  await p.avaliar(pausa(150));
  await p.tocar('[data-alvo-do-teste]');
  await p.avaliar(`(document.querySelector('[data-alvo-do-teste]')?.removeAttribute('data-alvo-do-teste'), ${pausa(espera)})`);
}

const MEDIR = `(() => {
  const campo = document.activeElement;
  const r = campo.getBoundingClientRect();
  const barra = document.querySelector('.tt-barra-inferior');
  return {
    teclado: document.documentElement.hasAttribute('data-teclado'),
    barra: getComputedStyle(barra).display,
    campo: campo.localName + '.' + campo.className, topo: r.top, fim: r.bottom, innerHeight,
  };
})()`;

export default async function celularTeclado(t) {
  const p = await t.novaAba({ celular: 'm', caminho: '/#/foco' });
  await p.avaliar(pausa(1200));

  await tocarEm(p, visivel('.tt-tarefas [data-adicionar-vazio], .tt-tarefas [data-adicionar]'), 'Adicionar tarefa');
  await tocarEm(p, visivel('.tt-tarefas [data-campo]'), 'campo da tarefa');
  await p.avaliar(`document.querySelector('.tt-tarefas [data-campo]').focus()`);
  const antes = await p.avaliar(MEDIR);
  await p.teclado(300);
  await p.avaliar(pausa(500));
  const a = await p.avaliar(MEDIR);
  t.conferir('campo de tarefa focado, sem teclado: sem data-teclado e com a barra', antes.teclado === false && antes.barra !== 'none', antes);
  t.conferir(
    'com teclado(300): <html data-teclado>, a barra inferior escondida e o campo inteiro visível',
    a.teclado && a.barra === 'none' && a.topo >= 0 && a.fim <= a.innerHeight - 8,
    a,
  );
  await p.teclado(0);
  await p.avaliar(`(document.activeElement.blur(), ${pausa(500)})`);
  const b = await p.avaliar(`({ teclado: document.documentElement.hasAttribute('data-teclado'), barra: getComputedStyle(document.querySelector('.tt-barra-inferior')).display })`);
  t.conferir('ao tirar o teclado e o foco, a barra volta', b.teclado === false && b.barra !== 'none', b);

  await p.avaliar(`(location.hash = '#/temporizador', ${pausa(900)})`);
  await tocarEm(p, `document.querySelector('[data-adicionar]')`, 'Adicionar temporizador', 700);
  await p.avaliar(`document.querySelector('fluent-dialog [data-nome]').focus()`);
  await p.teclado(300);
  await p.avaliar(pausa(500));
  const c = await p.avaliar(MEDIR);
  t.conferir(
    'o mesmo no nome do diálogo de temporizador',
    c.teclado && c.barra === 'none' && c.topo >= 0 && c.fim <= c.innerHeight - 8,
    c,
  );
  await p.teclado(0);
  await p.fechar();
}
