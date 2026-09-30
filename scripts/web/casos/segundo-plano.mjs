// Caso segundo-plano (PLANO-WEB-V1, W11): o prazo único na página, sem
// Worker, com a aba oculta de verdade.
//
//   node scripts/web/verificar.mjs segundo-plano
//
// Com a aba visível, inicia 25 min e avança o relógio de teste até restarem
// 5 s (`__ttAvancar(24 min 55 s)`), espera um tick e esconde a aba ativando
// uma segunda aba (`Target.activateTarget`), com o `visibilitychange` real.
// Um MutationObserver injetado anota cada texto da região viva com a
// visibilidade e a hora real (`performance.timeOrigin + performance.now()`,
// fora do relógio de teste) do instante da mudança. Confere que:
// (a) a aba ficou oculta antes do prazo (o caminho testado é o oculto);
// (b) "Sessão de foco concluída." chegou à região viva com
//     `visibilityState === 'hidden'`, em até 3 s reais depois do prazo;
// (c) com a aba oculta saiu o `tt-web://virada` da fase (o título do W17);
// (d) o prazo do prazo.js concordou com o do motor o tempo todo (nenhum
//     "[motor] prazo diverge" no console);
// (e) de volta à frente, a tela mostra o preparo, sem sessão em andamento.
//
// Roda no servidor de desenvolvimento, como o caso foco: a página importa o
// /src/lib/ipc.js e o barramento, os mesmos módulos que o app usa.
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

const NUMERO = `document.querySelector('[data-preparo] [data-numero]')?.textContent.trim()`;
const MINUTOS = `document.querySelector('[data-andamento] [data-minutos]')?.textContent.trim()`;

async function escolherMinutos(p, alvo) {
  for (let i = 0; i < 60; i++) {
    const atual = Number(await p.avaliar(NUMERO));
    if (atual === alvo) return true;
    const rotulo = atual < alvo ? 'Aumentar' : 'Diminuir';
    await p.avaliar(`document.querySelector('[data-preparo] button[data-passo][aria-label="${rotulo}"]').click()`);
    await sleep(60);
  }
  return false;
}

export default async function segundoPlano(t) {
  const p = t.pagina;
  const pronto = await esperar(p, `(() => {
    const b = document.querySelector('[data-preparo] [data-iniciar]');
    return !!b && b.getBoundingClientRect().height > 0;
  })()`);
  if (!pronto) throw new Error('a tela Foco não apareceu');

  // A região viva e a virada, anotadas com a visibilidade e a hora real.
  await p.avaliar(`(async () => {
    const real = () => performance.timeOrigin + performance.now();
    window.__ttMudancas = [];
    window.__ttViradas = [];
    window.__ttVisibilidade = [];
    const r = document.querySelector('[data-anuncio]');
    new MutationObserver(() => {
      const texto = r.textContent.trim();
      if (texto) window.__ttMudancas.push({ texto, visibilidade: document.visibilityState, real: real() });
    }).observe(r, { childList: true, subtree: true, characterData: true });
    document.addEventListener('visibilitychange', () => {
      window.__ttVisibilidade.push({ visibilidade: document.visibilityState, real: real() });
    });
    const { listen } = await import('/src/platform/web/barramento.js');
    await listen('tt-web://virada', (e) => {
      window.__ttViradas.push({ ...e.payload, visibilidade: document.visibilityState, real: real() });
    });
  })()`);

  const escolheu = await escolherMinutos(p, 25);
  await p.avaliar(`document.querySelector('[data-preparo] [data-iniciar]').click()`);
  const comecou = await esperar(p, `${MINUTOS} === '25'`);
  if (!escolheu || !comecou) throw new Error('não iniciou a sessão de 25 min');

  // Restam 5 s; um tick com a aba visível.
  await t.relogio.avancar(24 * MIN + 55_000);
  await sleep(1200);
  const antes = await p.avaliar(`(async () => {
    const ipc = await import('/src/lib/ipc.js');
    const e = await ipc.obterEstado();
    const agora = Date.now();
    const endsAt = e.focus.session?.endsAt ?? null;
    return {
      status: e.focus.status,
      endsAt,
      restanteMs: endsAt === null ? null : endsAt - agora,
      prazoReal: endsAt === null ? null : performance.timeOrigin + performance.now() + (endsAt - agora),
      visibilidade: document.visibilityState,
    };
  })()`);
  if (antes.status !== 'focus' || !(antes.restanteMs > 1500)) {
    throw new Error(`antes de esconder: ${JSON.stringify(antes)}`);
  }

  // Esconde a aba: outra aba vem para a frente.
  const outra = await t.novaAba({ caminho: 'about:blank' });
  await t.ativarAba(outra);
  const escondeu = await esperar(p, `document.visibilityState === 'hidden'`, 3000);
  const ocultaEm = (await p.avaliar('window.__ttVisibilidade.slice()')).find((v) => v.visibilidade === 'hidden');

  // Espera o prazo e mais uma folga (sem tocar na aba oculta além de ler).
  const CONCLUIDA = 'Sessão de foco concluída.';
  const chegou = await esperar(
    p,
    `window.__ttMudancas.some((m) => m.texto === ${JSON.stringify(CONCLUIDA)})`,
    antes.restanteMs + 8000,
  );
  const mudancas = await p.avaliar('window.__ttMudancas.slice()');
  const viradas = await p.avaliar('window.__ttViradas.slice()');
  const fim = mudancas.find((m) => m.texto === CONCLUIDA);
  const atrasoMs = fim ? Math.round(fim.real - antes.prazoReal) : null;

  t.conferir(
    '(a) a aba ficou oculta (Target.activateTarget) antes do prazo',
    escondeu && ocultaEm && ocultaEm.real < antes.prazoReal - 500,
    { restanteAoEsconder: ocultaEm ? Math.round(antes.prazoReal - ocultaEm.real) : null },
  );
  t.conferir(
    '(b) a região viva muda com a aba oculta, em até 3 s reais depois do prazo',
    chegou && fim?.visibilidade === 'hidden' && atrasoMs !== null && atrasoMs >= -50 && atrasoMs <= 3000,
    { atrasoMs, visibilidade: fim?.visibilidade, mudancas: mudancas.map((m) => m.texto) },
  );
  const viradaOculta = viradas.find((v) => v.visibilidade === 'hidden' && v.minutos === 1);
  t.conferir(
    '(c) com a aba oculta, sai o tt-web://virada da fase (1 min no título)',
    !!viradaOculta && typeof viradaOculta.fase === 'string',
    viradas,
  );
  const divergencias = p.consoles.filter((c) => /prazo diverge/.test(c.texto));
  t.conferir('(d) o prazo.js concorda com o Engine::proximo_prazo (nenhum "prazo diverge")', divergencias.length === 0, divergencias);

  await t.ativarAba(p);
  await esperar(p, `document.visibilityState === 'visible'`, 3000);
  const voltou = await esperar(p, `(() => {
    const a = document.querySelector('[data-andamento]');
    return (!a || a.hidden) && !!document.querySelector('[data-preparo] [data-iniciar]');
  })()`, 3000);
  t.conferir('(e) de volta à frente, a tela mostra o preparo', voltou);
  await outra.fechar();
}
