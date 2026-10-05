// Caso aba-unica (v0.3; platform/web/aba-unica.js): o Tomatito roda numa aba
// só.
//
//   node scripts/web/verificar.mjs aba-unica
//
// (a) a primeira aba abre o app, sem aviso;
// (b) a segunda mostra "O Tomatito já está aberto em outra aba", com a casca
//     por baixo parada (`inert`) e o motor sem nascer: um foco iniciado na
//     primeira não ganha um segundo motor (um período só no fim);
// (c) "Usar nesta aba": a segunda assume e a primeira passa a mostrar o aviso;
// (d) fechada a segunda, a primeira assume sozinha;
// (e) recarregar a aba dona volta ao app, sem aviso, também com ela em
//     segundo plano.
export const caminho = '/#/foco';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function esperar(p, expr, ms = 8000) {
  const fim = Date.now() + ms;
  for (;;) {
    if (await p.avaliar(expr)) return true;
    if (Date.now() > fim) return false;
    await sleep(50);
  }
}
const LER = `({
  aviso: document.querySelector('.tt-aba-unica h1')?.textContent ?? null,
  bloqueada: 'abaBloqueada' in document.documentElement.dataset,
  inerte: document.querySelector('.tt-janela').hasAttribute('inert'),
  progresso: document.querySelector('[data-progresso]') ? !document.querySelector('[data-progresso]').hasAttribute('data-carregando') : false,
})`;
// O app de verdade: sem aviso, e com o progresso lido (o motor respondeu).
const NO_APP = `(${LER}).progresso && !(${LER}).aviso`;
const NO_AVISO = `!!(${LER}).aviso`;

export default async function abaUnica(t) {
  const p = t.pagina;
  const a = (await esperar(p, NO_APP)) && (await p.avaliar(LER));
  t.conferir('(a) a primeira aba abre o app, sem aviso', a && a.progresso && !a.bloqueada && !a.inerte, a);

  const q = await t.novaAba({ caminho: '/#/foco', duasAbas: true });
  const viu = await esperar(q, NO_AVISO);
  await sleep(500);
  const b = await q.avaliar(LER);
  const p1 = await p.avaliar(LER);
  t.conferir(
    '(b) a segunda aba mostra o aviso e não monta o app; a primeira segue normal',
    viu && b.aviso === 'O Tomatito já está aberto em outra aba' && b.bloqueada && b.inerte && !b.progresso && p1.progresso && !p1.aviso,
    { segunda: b, primeira: p1 },
  );

  await q.avaliar(`document.querySelector('[data-usar-aqui]').click()`);
  const assumiu = await esperar(q, NO_APP);
  const cedeu = await esperar(p, NO_AVISO);
  t.conferir('(c) "Usar nesta aba": a segunda assume e a primeira mostra o aviso', assumiu && cedeu, { segunda: await q.avaliar(LER), primeira: await p.avaliar(LER) });

  await q.fechar();
  const voltou = await esperar(p, NO_APP);
  t.conferir('(d) fechada a segunda, a primeira assume sozinha', voltou, await p.avaliar(LER));

  await p.recarregar();
  const e1 = await esperar(p, NO_APP);
  const fundo = await t.novaAba({ caminho: 'about:blank' });
  await t.ativarAba(fundo);
  await esperar(p, `document.visibilityState === 'hidden'`, 3000);
  await p.recarregar();
  const e2 = await esperar(p, NO_APP);
  t.conferir('(e) recarregar a aba dona volta ao app, na frente e em segundo plano', e1 && e2, { naFrente: e1, emSegundoPlano: e2, agora: await p.avaliar(LER) });
}
