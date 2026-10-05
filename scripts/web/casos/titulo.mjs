// Caso titulo (PLANO-WEB-V1, W17): o título da aba com o tempo da sessão.
//
//   node scripts/web/verificar.mjs titulo [--celular m]
//
// Primeiro com a aba oculta e o relógio real (sem `__ttAvancar`): inicia
// 25 min, esconde a aba ativando uma segunda (`Target.activateTarget`) e
// espera a virada do minuto (até 60 s reais). Um MutationObserver no
// <title> anota cada título com a visibilidade e a hora real
// (`performance.timeOrigin + performance.now()`) da troca. Confere que:
// (a) com a sessão iniciada, "25 min · Tomatito";
// (b) com a aba oculta, "24 min · Tomatito" chega em até 2 s reais depois da
//     virada (quando restam 24:00), com `visibilityState === 'hidden'` lido
//     na hora da troca.
// Depois, de volta à frente, para a sessão e, com o relógio de teste:
// (c) sem sessão, "Tomatito";
// (d) 25 min: "25 min · Tomatito"; depois de 61 s (`__ttAvancar`),
//     "24 min · Tomatito";
// (e) em pausa, "Pausado · 24 min · Tomatito";
// (f) com a chave `tomatito:web.tempoNaAba` desligada (`definirTempoNaAba`
//     do aba.js), "Tomatito", e continua assim depois de recarregar (a
//     pausa foi retomada do `tomatito:estado`); religada, o tempo volta.
//
// Roda no servidor de desenvolvimento, como o segundo-plano: a página
// importa o /src/lib/ipc.js e o /src/platform/web/aba.js, os mesmos módulos
// que o app usa.
export const servidor = 'dev';
export const caminho = '/#/foco';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MIN = 60_000;

async function esperar(p, expr, ms = 8000) {
  const fim = Date.now() + ms;
  for (;;) {
    if (await p.avaliar(expr)) return true;
    if (Date.now() > fim) return false;
    await sleep(50);
  }
}

const TITULO = 'document.title';
const titulo = (p) => p.avaliar(TITULO);
const ipc = (p, corpo) => p.avaliar(`(async () => { const ipc = await import('/src/lib/ipc.js'); ${corpo} })()`);
const titEh = (texto) => `document.title === ${JSON.stringify(texto)}`;

async function prontoNaFoco(p) {
  const ok = await esperar(p, `(() => {
    // O preparo ou, com uma sessão retomada, o andamento (um dos dois à vista).
    return ['[data-preparo] [data-iniciar]', '[data-andamento]'].some((sel) => document.querySelector(sel)?.getBoundingClientRect().height > 0);
  })()`);
  if (!ok) throw new Error('a tela Foco não apareceu');
}

export default async function tituloDaAba(t) {
  const p = t.pagina;
  await prontoNaFoco(p);
  await ipc(p, `localStorage.removeItem('tomatito:web.tempoNaAba')`);

  // --- Aba oculta, relógio real. ---
  await p.avaliar(`(() => {
    const real = () => performance.timeOrigin + performance.now();
    window.__ttTitulos = [];
    new MutationObserver(() => {
      window.__ttTitulos.push({ titulo: document.title, visibilidade: document.visibilityState, real: real() });
    }).observe(document.querySelector('title'), { childList: true, subtree: true, characterData: true });
  })()`);
  const inicio = await ipc(p, `
    const e = await ipc.foco.iniciar(25);
    const agora = Date.now();
    const endsAt = e.session?.endsAt ?? null;
    return {
      status: e.status,
      restanteMs: endsAt === null ? null : endsAt - agora,
      // A virada: quando restam 24:00 (o número cai de 25 para 24).
      viradaReal: endsAt === null ? null : performance.timeOrigin + performance.now() + (endsAt - 24 * ${MIN} - agora),
    };`);
  const a = await esperar(p, titEh('25 min · Tomatito'), 3000);
  t.conferir('(a) com a sessão iniciada, "25 min · Tomatito"', a && inicio.status === 'focus', { titulo: await titulo(p), inicio });

  const outra = await t.novaAba({ caminho: 'about:blank' });
  await t.ativarAba(outra);
  const escondeu = await esperar(p, `document.visibilityState === 'hidden'`, 3000);
  const ESPERADO = '24 min · Tomatito';
  const faltaMs = Math.max(0, inicio.viradaReal - (await p.avaliar('performance.timeOrigin + performance.now()')));
  // Espera máxima de 60 s pela virada, mais os 2 s do critério.
  await esperar(p, `window.__ttTitulos.some((m) => m.titulo === ${JSON.stringify(ESPERADO)})`, Math.min(60_000, faltaMs) + 2500);
  const titulos = await p.avaliar('window.__ttTitulos.slice()');
  const troca = titulos.find((m) => m.titulo === ESPERADO);
  const atrasoMs = troca ? Math.round(troca.real - inicio.viradaReal) : null;
  t.conferir(
    '(b) com a aba oculta, "24 min · Tomatito" em até 2 s reais depois da virada, com visibilityState hidden',
    escondeu && troca?.visibilidade === 'hidden' && atrasoMs !== null && atrasoMs >= 0 && atrasoMs <= 2000,
    { atrasoMs, faltavaAoEsconderMs: Math.round(faltaMs), titulos },
  );
  await t.ativarAba(p);
  await esperar(p, `document.visibilityState === 'visible'`, 3000);
  await outra.fechar();

  // --- Aba visível, relógio de teste. ---
  await ipc(p, `await ipc.foco.parar();`);
  const c = await esperar(p, titEh('Tomatito'), 3000);
  t.conferir('(c) sem sessão, "Tomatito"', c, await titulo(p));

  await ipc(p, `await ipc.foco.iniciar(25);`);
  const d1 = await esperar(p, titEh('25 min · Tomatito'), 3000);
  await t.relogio.avancar(61_000);
  const d2 = await esperar(p, titEh('24 min · Tomatito'), 3000);
  t.conferir('(d) 25 min, e depois de 61 s "24 min · Tomatito"', d1 && d2, await titulo(p));

  await ipc(p, `await ipc.foco.pausar();`);
  const e = await esperar(p, titEh('Pausado · 24 min · Tomatito'), 3000);
  t.conferir('(e) em pausa, "Pausado · 24 min · Tomatito"', e, await titulo(p));

  await p.avaliar(`import('/src/platform/web/aba.js').then((m) => m.definirTempoNaAba(false))`);
  const f1 = await esperar(p, titEh('Tomatito'), 2000);
  const chave = await p.avaliar(`localStorage.getItem('tomatito:web.tempoNaAba')`);
  await p.recarregar();
  await prontoNaFoco(p);
  await sleep(1500);
  const depois = await titulo(p);
  const aindaPausado = await ipc(p, `return (await ipc.obterEstado()).focus.status;`);
  await p.avaliar(`import('/src/platform/web/aba.js').then((m) => m.definirTempoNaAba(true))`);
  const f2 = await esperar(p, titEh('Pausado · 24 min · Tomatito'), 3000);
  t.conferir(
    '(f) com a chave desligada, "Tomatito" (também depois de recarregar); religada, o tempo volta',
    f1 && chave === '0' && depois === 'Tomatito' && aindaPausado === 'paused' && f2,
    { chave, depois, aindaPausado, religado: await titulo(p) },
  );

  await ipc(p, `await ipc.foco.parar();`);
  await ipc(p, `localStorage.removeItem('tomatito:web.tempoNaAba')`);
}
