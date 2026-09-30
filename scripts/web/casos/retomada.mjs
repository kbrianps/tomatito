// Caso retomada (PLANO-WEB, W09; PLANO-WEB-V1, W09): o `tomatito:estado`
// no localStorage e o `Engine::restaurar` do M40 no navegador, com o relógio
// de teste do verificar.mjs.
//
//   node scripts/web/verificar.mjs retomada
//
// Roda no servidor de desenvolvimento (`--servidor dev`), como o `foco`: a
// página importa o /src/platform/web/index.js (o `#plataforma` do app, com o
// `invoke`) e o /src/platform/web/motor.js, os mesmos módulos do app (o
// `semDono` guarda o `notice`, que ainda não tem dono na web até o W13; o
// `sound` vai ao som.js desde o W12, que anota cada pedido no `historico`).
//
// (a) recarregar no meio de um foco de 25 min (7 min andados) mantém o tempo
//     restante, com diferença de até 1 s, e a tela volta ao andamento; o
//     `tomatito:estado` tem `schemaVersion` 1 e o prazo da sessão;
// (b) um temporizador de 5 min correndo e o cronômetro (correndo, com 1
//     volta) sobrevivem a recarregar: o mesmo prazo, o mesmo `startedAt` e a
//     volta;
// (c) fechar a aba (`Target.closeTarget`), somar ao deslocamento até 2 min
//     depois do fim do foco e reabrir: o período entra no IndexedDB (com o
//     fim no prazo, completo), o progresso da tela diz "Concluído: 25
//     minutos", sai um aviso só, o do atraso (`late`, `sessionCompleted`,
//     com o `endedAt` no prazo, ou seja "Sessão concluída às HH:MM" com a
//     hora do prazo; o texto é do i18n do motor e aparece como notificação
//     no W13), e nenhum efeito `sound`; a sessão fica concluída (o
//     `completed` do núcleo, com `completedAt` no prazo), com a tela no
//     preparo, e é isso que fica gravado; recarregar de novo não grava o
//     período outra vez nem repete o aviso.
export const servidor = 'dev';
export const caminho = '/#/foco';

const MIN = 60_000;
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

const ipc = (p, corpo) =>
  p.avaliar(`(async () => {
  const ipc = await import('/src/platform/web/index.js');
  ${corpo}
})()`);

const ESTADO = `ipc.invoke('get_state').then((e) => ({
  agora: Date.now(),
  status: e.focus.status,
  concluidaEm: e.focus.session?.completedAt ?? null,
  restante: e.focus.session?.remainingMs ?? null,
  prazo: e.focus.session?.endsAt ?? null,
  timers: e.timers.timers,
  cronometro: e.stopwatch,
}))`;

const ler = (p) => ipc(p, `return ${ESTADO};`);

// Os períodos gravados, lidos direto do IndexedDB da página.
const PERIODOS = `new Promise((ok, falha) => {
  const r = indexedDB.open('tomatito');
  r.onerror = () => falha(r.error);
  r.onsuccess = () => {
    const q = r.result.transaction('periods').objectStore('periods').getAll();
    q.onsuccess = () => { r.result.close(); ok(q.result); };
    q.onerror = () => falha(q.error);
  };
})`;

async function telaPronta(p) {
  const ok = await esperar(
    p,
    `(() => {
    const b = document.querySelector('[data-preparo] [data-iniciar]');
    return !!b && !document.querySelector('[data-progresso]')?.hasAttribute('data-carregando');
  })()`,
  );
  if (!ok) throw new Error('a tela Foco não apareceu (ou o progresso não carregou)');
}

const emAndamento = `(() => { const a = document.querySelector('[data-andamento]'); return !!a && !a.hidden; })()`;

export default async function retomada(t) {
  let p = t.pagina;
  await telaPronta(p);

  // (a) Foco de 25 min, 7 min andados, recarregar.
  await ipc(p, `await ipc.invoke('focus_start', { minutes: 25 });`);
  await esperar(p, emAndamento, 3000);
  await t.relogio.avancar(7 * MIN);
  const antes = await ler(p);
  const gravado = await p.avaliar(`JSON.parse(localStorage.getItem('tomatito:estado'))`);
  await p.recarregar();
  await telaPronta(p);
  const depois = await ler(p);
  // O restante esperado depois é o de antes menos o tempo real da recarga.
  const esperado = antes.restante - (depois.agora - antes.agora);
  t.conferir(
    '(a) recarregar no meio do foco mantém o tempo restante (até 1 s)',
    depois.status === 'focus' && Math.abs(depois.restante - esperado) <= 1000 && depois.prazo === antes.prazo,
    { antes: antes.restante, depois: depois.restante, esperado, prazo: [antes.prazo, depois.prazo] },
  );
  t.conferir('(a) a tela volta ao andamento', await esperar(p, emAndamento, 3000));
  t.conferir(
    '(a) o tomatito:estado tem a versão 1 e o prazo da sessão',
    gravado?.schemaVersion === 1 && gravado?.focus?.session?.endsAt === antes.prazo && gravado?.focus?.session?.status === 'running',
    gravado?.focus,
  );

  // (b) Um temporizador e o cronômetro correndo, recarregar.
  const criado = await ipc(
    p,
    `const r = await ipc.invoke('timer_create', { name: 'Chá', durationMs: ${5 * MIN} });
    const id = r.timers[r.timers.length - 1].id;
    await ipc.invoke('timer_start', { id });
    await ipc.invoke('stopwatch_start');
    return id;`,
  );
  await t.relogio.avancar(10_000);
  await ipc(p, `await ipc.invoke('stopwatch_lap');`);
  const b1 = await ler(p);
  await p.recarregar();
  await telaPronta(p);
  const b2 = await ler(p);
  const cha1 = b1.timers.find((x) => x.id === criado);
  const cha2 = b2.timers.find((x) => x.id === criado);
  t.conferir(
    '(b) o temporizador correndo sobrevive a recarregar',
    !!cha2 && cha2.status === 'running' && cha2.endsAt === cha1.endsAt && cha2.name === 'Chá' && b2.timers.length === b1.timers.length,
    { antes: cha1, depois: cha2 },
  );
  t.conferir(
    '(b) o cronômetro correndo, com a volta, sobrevive a recarregar',
    b2.cronometro.status === 'running' &&
      b2.cronometro.startedAt === b1.cronometro.startedAt &&
      b2.cronometro.accumulatedMs === b1.cronometro.accumulatedMs &&
      JSON.stringify(b2.cronometro.laps) === JSON.stringify(b1.cronometro.laps) &&
      b2.cronometro.laps.length === 1,
    { antes: b1.cronometro, depois: b2.cronometro },
  );
  // Fora do caminho do (c): o temporizador e o cronômetro voltam a zero.
  await ipc(p, `await ipc.invoke('timer_delete', { id: ${criado} }); await ipc.invoke('stopwatch_reset');`);

  // (c) Fechar a aba, passar 2 min do fim, reabrir.
  const prazo = b2.prazo;
  const agora = await p.avaliar('Date.now()');
  const periodosAntes = (await p.avaliar(PERIODOS)).length;
  // A aba nova nasce vazia antes de a outra fechar (o Chrome não fica sem abas).
  const nova = await t.novaAba();
  await p.fechar();
  await t.relogio.avancarComAbaFechada(prazo - agora + 2 * MIN);
  await nova.abrir('/#/foco');
  p = nova;
  await telaPronta(p);
  const c = await ler(p);
  const periodos = await p.avaliar(PERIODOS);
  const novo = periodos.slice(periodosAntes);
  t.conferir(
    '(c) o período do foco vencido com a aba fechada é gravado',
    novo.length === 1 && novo[0].kind === 'focus' && novo[0].endedAt === prazo && novo[0].completed === true && novo[0].actualS === 1500,
    novo,
  );
  t.conferir(
    '(c) a tela mostra os 25 minutos concluídos, no preparo, e a sessão concluída no prazo',
    (await esperar(p, `document.querySelector('[data-concluido]')?.textContent.includes('25 minutos')`, 5000)) &&
      c.status === 'completed' &&
      c.concluidaEm === prazo &&
      !(await p.avaliar(emAndamento)),
    { status: c.status, concluido: await p.avaliar(`document.querySelector('[data-concluido]')?.textContent.trim()`) },
  );
  const semDono = await p.avaliar(`import('/src/platform/web/motor.js').then((m) => m.semDono)`);
  const avisos = semDono.filter((e) => e.tipo === 'notice').map((e) => e.dados);
  const hhmm = await p.avaliar(
    `new Date(${prazo}).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false })`,
  );
  const aviso = avisos[0];
  t.conferir(
    `(c) um aviso só, o do atraso: "Sessão concluída às ${hhmm}"`,
    avisos.length === 1 && aviso?.kind === 'late' && aviso.sessionCompleted === true && aviso.endedAt === prazo,
    avisos,
  );
  // W12: o `sound` tem dono (som.js), que anota cada pedido no `historico`.
  const pedidosDeSom = await p.avaliar(`import('/src/platform/web/som.js').then((m) => m.historico)`);
  const sons = [...semDono.filter((e) => e.tipo === 'sound'), ...pedidosDeSom];
  t.conferir('(c) nenhum efeito sound', sons.length === 0, sons);
  const estado = await p.avaliar(`JSON.parse(localStorage.getItem('tomatito:estado'))`);
  t.conferir(
    '(c) o tomatito:estado grava a sessão concluída, com o lastSessionId dela',
    estado?.focus?.session?.status === 'completed' &&
      estado.focus.session.completedAt === prazo &&
      estado.focus.lastSessionId === novo[0]?.sessionId,
    estado?.focus,
  );
  await p.recarregar();
  await telaPronta(p);
  const deNovo = await p.avaliar(PERIODOS);
  const semDono2 = await p.avaliar(`import('/src/platform/web/motor.js').then((m) => m.semDono)`);
  const pedidosDeSom2 = await p.avaliar(`import('/src/platform/web/som.js').then((m) => m.historico)`);
  t.conferir(
    '(c) recarregar de novo não grava o período outra vez nem repete o aviso',
    deNovo.length === periodos.length && !semDono2.some((e) => e.tipo === 'notice' || e.tipo === 'sound') &&
      pedidosDeSom2.length === 0,
    { periodos: deNovo.length, semDono: semDono2, pedidosDeSom: pedidosDeSom2 },
  );
}
