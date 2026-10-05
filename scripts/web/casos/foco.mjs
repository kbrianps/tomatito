// Caso foco (PLANO-WEB, W06b; PLANO-WEB-V1, W06b): a sessão de foco pelo
// motor em wasm, com o relógio de teste do verificar.mjs.
//
//   node scripts/web/verificar.mjs foco
//
// Roda no servidor de desenvolvimento (`--servidor dev`): assim a página
// pode importar o /src/lib/ipc.js, o mesmo módulo que o app usa, para os
// itens que não passam pela tela ((g) a (j)), sem gancho de teste no app.
//
// (a) iniciar 25 min mostra 25 no mostrador, com "Período de foco (1 de 1)";
// (b) __ttAvancar(60000) seguido de um visibilitychange sintético (aba
//     visível) mostra 24;
// (c) pausar e retomar trocam o botão (Pausar/Retomar) e o " · Pausado" do
//     título, com os rótulos do desktop;
// (d) "Encerrar sessão" volta ao preparo ("Pronto para focar") e a região
//     viva diz "Sessão de foco encerrada.";
// (e) numa sessão de 55 min (25 + 5 + 25), avançar 25 min leva ao intervalo,
//     com o título "Intervalo" (o intervalo não leva contagem no título, como
//     no desktop), e a região viva anuncia "Começou o intervalo 1 de 1." uma
//     vez só;
// (f) "Pular intervalo" leva ao "Período de foco (2 de 2)";
// (g) pausar sem fase correndo rejeita com o code do CommandError do
//     desktop (notRunning);
// (h) ipc.full.trocarModo entra no Full e sai dele pelas configurações (v0.3);
// (i) ipc.anunciarAoLeitor('x') resolve;
// (j) os demais comandos novos do desktop (PLANO-WEB-V1, 3.2): notices_read
//     lê os dois documentos, x11_compat_get, tomato_on_top_available e
//     full_validation_get devolvem o inerte, e os do Full, reiniciar e sair
//     rejeitam com 'unsupported';
// (k) o console não tem "[provisório] get_state" nem "[provisório] focus_".
export const servidor = 'dev';
export const caminho = '/#/foco';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Espera `expr` (avaliada na página) ficar verdadeira, até `ms`. */
async function esperar(p, expr, ms = 8000) {
  const fim = Date.now() + ms;
  for (;;) {
    if (await p.avaliar(expr)) return true;
    if (Date.now() > fim) return false;
    await sleep(50);
  }
}

// O que a tela Foco mostra agora.
const LER = `(() => {
  const andamento = document.querySelector('[data-andamento]');
  const principal = document.querySelector('.tt-andamento button[data-acao]');
  return {
    titulo: document.querySelector('#foco-sessao')?.textContent.replace(/\\s+/g, ' ').trim() ?? null,
    emAndamento: !!andamento && !andamento.hidden,
    minutos: document.querySelector('[data-andamento] [data-minutos]')?.textContent.trim() ?? null,
    botao: principal?.getAttribute('aria-label') ?? null,
    seletor: document.querySelector('[data-preparo] [data-numero]')?.textContent.trim() ?? null,
  };
})()`;

/** Leva o seletor de minutos a `alvo`, pelos chevrons (Aumentar/Diminuir). */
async function escolherMinutos(p, alvo) {
  for (let i = 0; i < 60; i++) {
    const atual = Number((await p.avaliar(LER)).seletor);
    if (atual === alvo) return true;
    const rotulo = atual < alvo ? 'Aumentar' : 'Diminuir';
    await p.avaliar(`document.querySelector('[data-preparo] button[data-passo][aria-label="${rotulo}"]').click()`);
    await sleep(60);
  }
  return false;
}

/** Escolhe um item do menu "Mais opções" da sessão. */
async function itemDoMenu(p, item) {
  await p.avaliar(`document.querySelector('.tt-andamento [data-mais]').click()`);
  await sleep(300);
  await p.avaliar(`document.querySelector('fluent-menu-item[data-item="${item}"]').click()`);
}

const anuncios = (p) => p.avaliar('window.__ttAnuncios.slice()');
const ipc = (p, corpo) =>
  p.avaliar(`(async () => {
  const ipc = await import('/src/lib/ipc.js');
  ${corpo}
})()`);

export default async function foco(t) {
  const p = t.pagina;
  const inicio = Date.now();
  const pronto = await esperar(p, `(() => {
    const b = document.querySelector('[data-preparo] [data-iniciar]');
    return !!b && b.getBoundingClientRect().height > 0;
  })()`);
  if (!pronto) throw new Error('a tela Foco não apareceu');
  // Quanto o wasm levou para chegar (o "estado de carregamento" é a
  // confirmar no W06b; o resultado vai para o linha-de-base.md).
  const carga = await p.avaliar(`(() => {
    const w = performance.getEntriesByType('resource').find((e) => e.name.includes('.wasm'));
    return w ? { wasmMs: Math.round(w.duration), fimMs: Math.round(w.responseEnd) } : null;
  })()`);
  console.log(`carga do wasm: ${JSON.stringify(carga)}; tela em ${Date.now() - inicio} ms`);

  // A região viva, anotada a cada parágrafo novo (a11y.js).
  await p.avaliar(`(() => {
    window.__ttAnuncios = [];
    const r = document.querySelector('[data-anuncio]');
    new MutationObserver(() => {
      const texto = r.textContent.trim();
      if (texto) window.__ttAnuncios.push(texto);
    }).observe(r, { childList: true, subtree: true, characterData: true });
  })()`);

  // (a)
  const escolheu25 = await escolherMinutos(p, 25);
  await p.avaliar(`document.querySelector('[data-preparo] [data-iniciar]').click()`);
  await esperar(p, `(${LER}).minutos === '25'`);
  const a = await p.avaliar(LER);
  t.conferir(
    '(a) iniciar 25 min mostra 25, com "Período de foco (1 de 1)"',
    escolheu25 && a.emAndamento && a.minutos === '25' && a.titulo === 'Período de foco (1 de 1)' && a.botao === 'Pausar',
    a,
  );

  // (b)
  await t.relogio.avancar(60_000);
  await p.avaliar(`document.dispatchEvent(new Event('visibilitychange'))`);
  await esperar(p, `(${LER}).minutos === '24'`, 3000);
  const b = await p.avaliar(`({ ...${LER}, visibilidade: document.visibilityState })`);
  t.conferir('(b) __ttAvancar(60000) + visibilitychange sintético mostra 24', b.minutos === '24' && b.visibilidade === 'visible', b);

  // (c)
  await p.avaliar(`document.querySelector('.tt-andamento button[data-acao="pausar"]').click()`);
  await esperar(p, `(${LER}).botao === 'Retomar'`, 3000);
  const pausado = await p.avaliar(LER);
  await p.avaliar(`document.querySelector('.tt-andamento button[data-acao="retomar"]').click()`);
  await esperar(p, `(${LER}).botao === 'Pausar'`, 3000);
  const retomado = await p.avaliar(LER);
  t.conferir(
    '(c) pausar e retomar: "Retomar" e " · Pausado"; depois "Pausar" sem o "Pausado"',
    pausado.botao === 'Retomar' && pausado.titulo === 'Período de foco (1 de 1) · Pausado' && pausado.minutos === '24' &&
      retomado.botao === 'Pausar' && retomado.titulo === 'Período de foco (1 de 1)',
    { pausado, retomado },
  );

  // (d)
  await itemDoMenu(p, 'parar');
  await esperar(p, `!(${LER}).emAndamento`, 3000);
  await sleep(400);
  const d = await p.avaliar(LER);
  const anunciosD = await anuncios(p);
  t.conferir(
    '(d) "Encerrar sessão" volta a "Pronto para focar", e a região viva diz "Sessão de foco encerrada."',
    !d.emAndamento && d.titulo === 'Pronto para focar' && anunciosD.at(-1) === 'Sessão de foco encerrada.',
    { tela: d, anuncios: anunciosD },
  );

  // (e)
  const escolheu55 = await escolherMinutos(p, 55);
  await p.avaliar(`document.querySelector('[data-preparo] [data-iniciar]').click()`);
  await esperar(p, `(${LER}).titulo === 'Período de foco (1 de 2)'`);
  const e0 = await p.avaliar(LER);
  await t.relogio.avancar(25 * 60_000);
  const chegou = await esperar(p, `(${LER}).titulo === 'Intervalo'`, 5000);
  // Uns ticks a mais, para um anúncio repetido ter tempo de aparecer.
  await sleep(2500);
  const e1 = await p.avaliar(LER);
  const anunciosE = await anuncios(p);
  const doIntervalo = anunciosE.filter((x) => x === 'Começou o intervalo 1 de 1.').length;
  t.conferir(
    '(e) 55 min: avançar 25 min leva ao intervalo, anunciado uma vez',
    escolheu55 && e0.minutos === '25' && chegou && e1.minutos === '5' && doIntervalo === 1 &&
      anunciosE.includes('Começou o período de foco 1 de 2.'),
    { antes: e0, depois: e1, anuncios: anunciosE },
  );

  // (f)
  await itemDoMenu(p, 'pular');
  await esperar(p, `(${LER}).titulo === 'Período de foco (2 de 2)'`, 3000);
  const f = await p.avaliar(LER);
  t.conferir('(f) "Pular intervalo" leva ao "Período de foco (2 de 2)"', f.titulo === 'Período de foco (2 de 2)' && f.minutos === '25', f);
  await itemDoMenu(p, 'parar');
  await esperar(p, `!(${LER}).emAndamento`, 3000);

  // (g)
  const g = await ipc(p, `try { await ipc.foco.pausar(); return { resolveu: true }; } catch (e) { return e; }`);
  t.conferir("(g) pausar sem fase correndo rejeita com code 'notRunning'", g?.code === 'notRunning' && typeof g.message === 'string', g);

  // (h)
  // v0.3: o Full existe na web (o palco, caso `full`): entrar grava o tema, e sair volta ao anterior.
  const h = await ipc(
    p,
    `const antes = (await ipc.configuracoes.obter()).theme;
  await ipc.full.trocarModo(true);
  const dentro = (await ipc.configuracoes.obter()).theme;
  await ipc.full.trocarModo(false);
  return { antes, dentro, depois: (await ipc.configuracoes.obter()).theme };`,
  );
  t.conferir('(h) ipc.full.trocarModo entra no Full (theme full) e volta ao tema anterior', h.dentro === 'full' && h.depois === h.antes && h.antes !== 'full', h);

  // (i)
  const i = await ipc(p, `try { return { resolveu: true, valor: await ipc.anunciarAoLeitor('x') }; } catch (e) { return { resolveu: false, e }; }`);
  t.conferir("(i) ipc.anunciarAoLeitor('x') resolve", i?.resolveu === true, i);

  // (j)
  const j = await ipc(
    p,
    `const rejeita = async (f) => { try { await f(); return 'resolveu'; } catch (e) { return e?.code; } };
  const avisos = await ipc.avisos.ler('avisos');
  const ofl = await ipc.avisos.ler('ofl');
  return {
    avisos: typeof avisos === 'string' && avisos.length > 1000 && !/<html/i.test(avisos),
    ofl: /SIL OPEN FONT LICENSE/i.test(ofl),
    x11: await ipc.compatX11.situacao(),
    naFrente: await ipc.full.sempreNaFrente(),
    validacao: await ipc.full.validacao(),
    semSuporte: {
      responderValidacao: await rejeita(() => ipc.full.responderValidacao('keep')),
      definirRegiao: await rejeita(() => ipc.full.definirRegiao([])),
      tamanhoDeDebug: await rejeita(() => ipc.full.tamanhoDeDebug(280)),
      reiniciar: await rejeita(() => ipc.compatX11.reiniciar()),
      sair: await rejeita(() => ipc.sair()),
    },
  };`,
  );
  t.conferir(
    '(j) notices_read, x11_compat_get, tomato_on_top_available e full_validation_get na web; o resto rejeita com unsupported',
    j.avisos && j.ofl && JSON.stringify(j.x11) === '{"disponivel":false,"ativa":false,"xwayland":false}' &&
      j.naFrente === false && JSON.stringify(j.validacao) === '{"seq":0,"state":"none"}' &&
      Object.values(j.semSuporte).every((c) => c === 'unsupported'),
    j,
  );

  // (k)
  await sleep(200);
  const provisorios = p.consoles.filter((c) => c.texto.startsWith('[provisório]')).map((c) => c.texto);
  const proibidos = provisorios.filter((x) => x === '[provisório] get_state' || x.startsWith('[provisório] focus_'));
  t.conferir('(k) o console não tem "[provisório] get_state" nem "[provisório] focus_"', proibidos.length === 0, {
    proibidos,
    provisorios: [...new Set(provisorios)],
  });
}
