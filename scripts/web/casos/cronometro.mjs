// Caso cronometro (PLANO-WEB, W07b; PLANO-WEB-V1, W07b): o cronômetro pelo
// motor em wasm, na tela Cronômetro, com o relógio de teste do verificar.mjs.
//
//   node scripts/web/verificar.mjs cronometro
//
// Roda no servidor de desenvolvimento (`--servidor dev`), para a página
// importar o /src/lib/ipc.js e o /src/lib/format.js, os mesmos módulos que o
// app usa, sem gancho de teste no app.
//
// (a) a tela nasce zerada: 00:00:00,00, "Iniciar", volta e redefinir
//     desabilitados, sem voltas;
// (b) iniciar, avançar 12,34 s, volta, avançar 10 s, volta e pausar, tudo
//     pela tela: as voltas batem com o relógio de teste (como o teste
//     voltas_guardam_o_total_e_so_correndo do tomatito-core: 12 340 e
//     22 340), com a folga só do tempo real entre os cliques, medido aqui;
// (c) a tela mostra o decorrido do retrato pausado e as 2 voltas, a mais nova
//     em cima, com Tempo = total menos o total da anterior;
// (d) o tt://stopwatch chega à tela: "redefinir" pelo ipc (fora do store da
//     tela) zera o número e esconde as voltas, e o barramento viu os retratos
//     de cada transição;
// (e) o console não tem "[provisório] stopwatch_".
export const servidor = 'dev';
export const caminho = '/#/cronometro';

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

// O que a tela Cronômetro mostra agora.
const LER = `(() => {
  const q = (s) => document.querySelector(s);
  const campo = (c) => q('[data-cronometro] [data-' + c + ']')?.textContent.trim() ?? '';
  return {
    estado: q('[data-cronometro]')?.dataset.estado ?? null,
    tempo: campo('horas') + ':' + campo('minutos') + ':' + campo('segundos') + ',' + campo('centesimos'),
    botao: q('.tt-cronometro-botoes button:first-child')?.getAttribute('aria-label') ?? null,
    volta: q('button[data-acao="volta"]')?.disabled === false,
    redefinir: q('button[data-acao="redefinir"]')?.disabled === false,
    voltasVisiveis: q('[data-voltas]')?.hidden === false,
    linhas: [...document.querySelectorAll('[data-linhas] tr')].map((tr) => [...tr.cells].map((td) => td.textContent.trim())),
  };
})()`;

const clicar = (p, acao) => p.avaliar(`document.querySelector('.tt-cronometro-botoes button[data-acao="${acao}"]').click()`);
const ipc = (p, corpo) =>
  p.avaliar(`(async () => {
  const ipc = await import('/src/lib/ipc.js');
  ${corpo}
})()`);
const formatar = (p, ms) => p.avaliar(`import('/src/lib/format.js').then((f) => f.tempoDoCronometro(${Number(ms)}).texto)`);

export default async function cronometro(t) {
  const p = t.pagina;
  const apareceu = await esperar(p, `(${LER}).estado === 'idle'`);
  if (!apareceu) throw new Error('a tela Cronômetro não apareceu');

  await p.avaliar(`(async () => {
    const { listen } = await import('/src/platform/web/barramento.js');
    window.__ttCronometro = [];
    await listen('tt://stopwatch', (e) => window.__ttCronometro.push(e.payload));
  })()`);

  // (a)
  const a = await p.avaliar(LER);
  t.conferir(
    '(a) zerado: 00:00:00,00, "Iniciar", volta e redefinir desabilitados, sem voltas',
    a.tempo === '00:00:00,00' && a.botao === 'Iniciar' && !a.volta && !a.redefinir && !a.voltasVisiveis,
    a,
  );

  // (b) A folga de cada volta é o tempo real entre os dois cliques que a
  // cercam (o relógio de teste soma o real ao deslocamento).
  const t0 = Date.now();
  await clicar(p, 'iniciar');
  await esperar(p, `(${LER}).estado === 'running'`, 3000);
  await t.relogio.avancar(12_340);
  await clicar(p, 'volta');
  const t1 = Date.now();
  await esperar(p, `(${LER}).linhas.length === 1`, 3000);
  await t.relogio.avancar(10_000);
  await clicar(p, 'volta');
  const t2 = Date.now();
  await esperar(p, `(${LER}).linhas.length === 2`, 3000);
  await clicar(p, 'pausar');
  const t3 = Date.now();
  await esperar(p, `(${LER}).estado === 'paused'`, 3000);
  const retrato = await ipc(p, `return (await ipc.obterEstado()).stopwatch;`);
  const [v1, v2] = retrato.laps ?? [];
  const folga1 = t1 - t0;
  const folga2 = t2 - t0;
  t.conferir(
    '(b) 2 voltas batem com o relógio de teste (12 340 e 22 340 ms, mais o tempo real entre os cliques)',
    retrato.status === 'paused' && retrato.laps.length === 2 &&
      v1 >= 12_340 && v1 <= 12_340 + folga1 &&
      v2 >= 22_340 && v2 <= 22_340 + folga2 && v2 - v1 >= 10_000 &&
      retrato.elapsedMs >= v2 && retrato.elapsedMs <= 22_340 + (t3 - t0),
    { laps: retrato.laps, elapsedMs: retrato.elapsedMs, folgas: [folga1, folga2, t3 - t0] },
  );

  // (c)
  const c = await p.avaliar(LER);
  const esperado = {
    tempo: await formatar(p, retrato.elapsedMs),
    linhas: [
      ['2', await formatar(p, v2 - v1), await formatar(p, v2)],
      ['1', await formatar(p, v1), await formatar(p, v1)],
    ],
  };
  t.conferir(
    '(c) a tela mostra o decorrido pausado e as 2 voltas, a mais nova em cima',
    c.estado === 'paused' && c.botao === 'Retomar' && !c.volta && c.redefinir && c.voltasVisiveis &&
      c.tempo === esperado.tempo && JSON.stringify(c.linhas) === JSON.stringify(esperado.linhas) &&
      esperado.linhas[1][2].startsWith('00:00:12,3') && esperado.linhas[0][2].startsWith('00:00:22,3'),
    { tela: c, esperado },
  );

  // (d) Redefinir pelo ipc, fora do store: só o evento leva à tela.
  await ipc(p, `return await ipc.cronometro.redefinir();`);
  const zerou = await esperar(p, `(${LER}).estado === 'idle'`, 3000);
  const d = await p.avaliar(LER);
  const eventos = await p.avaliar(`window.__ttCronometro.map((r) => [r.status, r.laps.length])`);
  t.conferir(
    '(d) o tt://stopwatch chega à tela: redefinir pelo ipc zera o número e esconde as voltas',
    zerou && d.tempo === '00:00:00,00' && d.botao === 'Iniciar' && !d.voltasVisiveis && !d.redefinir &&
      JSON.stringify(eventos) === JSON.stringify([['running', 0], ['running', 1], ['running', 2], ['paused', 2], ['idle', 0]]),
    { tela: d, eventos },
  );

  // (e)
  await sleep(200);
  const provisorios = p.consoles.filter((x) => x.texto.startsWith('[provisório] stopwatch_')).map((x) => x.texto);
  t.conferir('(e) o console não tem "[provisório] stopwatch_"', provisorios.length === 0, provisorios);
}
