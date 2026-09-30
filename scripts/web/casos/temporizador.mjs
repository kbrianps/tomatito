// Caso temporizador (PLANO-WEB, W07b; PLANO-WEB-V1, W07b): os temporizadores
// pelo motor em wasm, na tela Temporizador, com o relógio de teste do
// verificar.mjs.
//
//   node scripts/web/verificar.mjs temporizador
//
// Roda no servidor de desenvolvimento (`--servidor dev`), para a página
// importar o /src/lib/ipc.js e o /src/platform/web/*.js, os mesmos módulos
// que o app usa, sem gancho de teste no app.
//
// (a) a tela nasce com os padrões do desktop (1, 3, 5 e 10 min, parados, como
//     o teste padroes_de_1_3_5_e_10_min do tomatito-core);
// (b) "Iniciar" no card de 1 min o põe correndo (botão "Pausar", "Redefinir"
//     habilitado);
// (c) avançar 61 s: o card fica como encerrado, igual ao desktop (o teste
//     contagem_negativa_depois_do_zero do tomatito-core e o M32): continua
//     correndo, "Encerrado há" à vista, tempo negativo ("-00:00:01" mais os
//     segundos reais desde o clique, medidos aqui), data-vencido; o retrato
//     tem ended e overdue, com remainingMs igual a -1 s menos o tempo real;
//     o fim saiu uma vez só (timerNotice, sem atraso), e os outros três
//     seguem parados;
// (d) o tt://timers chega à tela: um temporizador criado e depois excluído
//     pelo ipc (fora do store da tela) aparece e some da grade, e o
//     barramento viu os retratos;
// (e) "Redefinir" volta o card a 00:01:00, parado, sem "Encerrado há";
// (f) o console não tem "[provisório] timer_".
export const servidor = 'dev';
export const caminho = '/#/temporizador';

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

// Os cards da tela, na ordem.
const CARDS = `[...document.querySelectorAll('[data-temporizador]')].map((el) => ({
  id: Number(el.dataset.temporizador),
  titulo: el.querySelector('[data-titulo]')?.textContent.trim() ?? null,
  tempo: el.querySelector('[data-tempo]')?.textContent.trim() ?? null,
  estado: el.dataset.estado,
  vencido: el.hasAttribute('data-vencido'),
  encerradoHa: el.querySelector('[data-encerrado]')?.hidden === false,
  rotuloDoEncerrado: el.querySelector('[data-encerrado]')?.textContent.trim() ?? null,
  botao: el.querySelector('.tt-temporizador-botoes button[data-acao]:not([data-acao="redefinir"])')?.getAttribute('aria-label') ?? null,
  redefinirHabilitado: el.querySelector('button[data-acao="redefinir"]')?.disabled === false,
}))`;

const card = (p, titulo) => p.avaliar(`(${CARDS}).find((c) => c.titulo === ${JSON.stringify(titulo)}) ?? null`);
const clicar = (p, id, acao) =>
  p.avaliar(`document.querySelector('[data-temporizador="${id}"] .tt-temporizador-botoes button[data-acao="${acao}"]').click()`);
const ipc = (p, corpo) =>
  p.avaliar(`(async () => {
  const ipc = await import('/src/lib/ipc.js');
  ${corpo}
})()`);

export default async function temporizador(t) {
  const p = t.pagina;
  const apareceu = await esperar(p, `(${CARDS}).length >= 4`);
  if (!apareceu) throw new Error('a tela Temporizador não mostrou os cards');

  // Anota cada tt://timers do barramento (o mesmo módulo do app).
  await p.avaliar(`(async () => {
    const { listen } = await import('/src/platform/web/barramento.js');
    window.__ttTimers = [];
    await listen('tt://timers', (e) => window.__ttTimers.push(e.payload));
  })()`);

  // (a)
  const a = await p.avaliar(CARDS);
  t.conferir(
    '(a) os padrões do desktop: 1, 3, 5 e 10 min, parados',
    JSON.stringify(a.map((c) => [c.titulo, c.tempo, c.estado, c.botao, c.redefinirHabilitado])) ===
      JSON.stringify([
        ['1 min', '00:01:00', 'idle', 'Iniciar', false],
        ['3 min', '00:03:00', 'idle', 'Iniciar', false],
        ['5 min', '00:05:00', 'idle', 'Iniciar', false],
        ['10 min', '00:10:00', 'idle', 'Iniciar', false],
      ]),
    a,
  );
  const um = a.find((c) => c.titulo === '1 min');

  // (b) O relógio de teste soma o tempo real ao deslocamento: `t0` limita
  // quanto o restante pode ter andado além dos 61 s.
  const t0 = Date.now();
  await clicar(p, um.id, 'iniciar');
  await esperar(p, `(${CARDS}).find((c) => c.id === ${um.id})?.estado === 'running'`, 3000);
  const b = await card(p, '1 min');
  t.conferir(
    '(b) "Iniciar" no de 1 min: correndo, com "Pausar" e "Redefinir" habilitado',
    b.estado === 'running' && b.botao === 'Pausar' && b.redefinirHabilitado && !b.vencido && ['00:01:00', '00:00:59'].includes(b.tempo),
    b,
  );

  // (c) 61 s pelo relógio de teste; o tick de 1 Hz (aba visível) fecha o fim.
  await t.relogio.avancar(61_000);
  const encerrou = await esperar(
    p,
    `(${CARDS}).find((c) => c.id === ${um.id})?.vencido && window.__ttTimers.some((r) => r.timers.some((x) => x.id === ${um.id} && x.ended))`,
    4000,
  );
  const c = await card(p, '1 min');
  const retrato = await ipc(p, `return (await ipc.obterEstado()).timers;`);
  const real = Date.now() - t0;
  const doUm = retrato.timers.find((x) => x.id === um.id);
  // O tempo do card, em segundos passados do zero (o "-00:00:ss").
  const passados = /^-00:00:(\d\d)$/.exec(c.tempo)?.[1];
  const fins = await p.avaliar(`(async () => {
    // W13: o timerNotice tem dono (avisos.js), que anota cada aviso.
    const { historico } = await import('/src/platform/web/avisos.js');
    return historico.filter((e) => e.tipo === 'timerNotice').map((e) => e.dados);
  })()`);
  const outros = (await p.avaliar(CARDS)).filter((x) => x.id !== um.id);
  t.conferir(
    '(c) 1 min + 61 s: encerrado como no desktop ("Encerrado há", tempo negativo, ainda correndo, ended e overdue, um fim só)',
    encerrou && c.estado === 'running' && c.vencido && c.encerradoHa && c.rotuloDoEncerrado === 'Encerrado há' &&
      passados !== undefined && Number(passados) >= 1 && Number(passados) <= 1 + Math.ceil(real / 1000) &&
      c.botao === 'Pausar' && c.redefinirHabilitado &&
      doUm.status === 'running' && doUm.ended === true && doUm.overdue === true &&
      doUm.remainingMs <= -1000 && doUm.remainingMs >= -1000 - real &&
      fins.length === 1 && fins[0].late === false &&
      outros.every((x) => x.estado === 'idle' && !x.vencido),
    { card: c, retrato: doUm, realMs: real, fins, outros: outros.map((x) => [x.titulo, x.estado, x.tempo]) },
  );

  // (d) Criado e excluído pelo ipc, fora do store: só o evento leva à tela.
  const antes = await p.avaliar('window.__ttTimers.length');
  const criado = await ipc(p, `return await ipc.temporizadores.criar('Chá', 120000);`);
  const novo = criado.timers.find((x) => x.name === 'Chá');
  const apareceuNaTela = await esperar(p, `(${CARDS}).some((c) => c.titulo === 'Chá' && c.tempo === '00:02:00')`, 3000);
  await ipc(p, `return await ipc.temporizadores.excluir(${novo?.id ?? -1});`);
  const sumiuDaTela = await esperar(p, `!(${CARDS}).some((c) => c.titulo === 'Chá')`, 3000);
  const eventos = await p.avaliar(`window.__ttTimers.slice(${antes})`);
  t.conferir(
    '(d) o tt://timers chega à tela: criar e excluir pelo ipc aparecem na grade',
    Boolean(novo) && apareceuNaTela && sumiuDaTela &&
      eventos.some((r) => r.timers.some((x) => x.name === 'Chá')) &&
      eventos.at(-1)?.timers.every((x) => x.name !== 'Chá'),
    { apareceuNaTela, sumiuDaTela, eventos: eventos.length },
  );

  // (e)
  await clicar(p, um.id, 'redefinir');
  await esperar(p, `(${CARDS}).find((c) => c.id === ${um.id})?.estado === 'idle'`, 3000);
  const e = await card(p, '1 min');
  t.conferir(
    '(e) "Redefinir" volta a 00:01:00, parado, sem "Encerrado há"',
    e.estado === 'idle' && e.tempo === '00:01:00' && !e.vencido && !e.encerradoHa && e.botao === 'Iniciar' && !e.redefinirHabilitado,
    e,
  );

  // (f)
  await sleep(200);
  const provisorios = p.consoles.filter((x) => x.texto.startsWith('[provisório] timer_')).map((x) => x.texto);
  t.conferir('(f) o console não tem "[provisório] timer_"', provisorios.length === 0, provisorios);
}
