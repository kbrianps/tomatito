// Caso estatisticas (PLANO-WEB, W08; PLANO-WEB-V1, W08): o progresso diário e
// as tarefas no IndexedDB, com as regras do desktop, pelo relógio de teste do
// verificar.mjs.
//
//   node scripts/web/verificar.mjs estatisticas
//
// Roda no servidor de desenvolvimento (`--servidor dev`), como o `foco`: os
// itens que não passam pela tela importam o /src/lib/ipc.js, o mesmo módulo
// do app. O perfil do Chrome é novo a cada rodada, então o banco nasce vazio.
// O relógio vai para um instante fixo (30/09/2026 12:00 em São Paulo, pelo
// `Emulation.setTimezoneOverride`), longe da virada do dia.
//
// (a) 2 focos completos de 25 min, pela tela: o rodapé diz "Concluído: 50
//     minutos", o stats_get dá 3000 s em Hoje e o banco tem os 2 períodos;
// (b) depois de recarregar, continua "Concluído: 50 minutos";
// (c) uma tarefa só com espaços é recusada com o code do desktop
//     (`emptyTitle`, o teste titulo_vazio_ou_longo_e_recusado do tasks.rs),
//     uma de 256 caracteres com `titleTooLong`, e nenhuma é gravada;
// (d) uma tarefa concluída fica na lista, marcada, e continua depois de
//     recarregar; passada a hora de zerar (meia-noite), ela some da lista e
//     da tela, a pendente fica, e os 50 minutos passam a "Ontem" (o teste
//     concluidas_somem_na_virada_do_dia do tasks.rs);
// (e) horário de verão: com `Emulation.setTimezoneOverride('America/New_York')`,
//     o dia 08/03/2026 tem 23 h e termina às 00:00 EDT de 09/03 (04:00 UTC),
//     como fixa o teste `horario_de_verao` do tomatito-core/src/days.rs
//     (`day_range(date(2026, 3, 8), &ny, 0).len_ms() == 23 h`). Um foco que
//     termina às 23:49 EDT de 08/03 cai em "Ontem", e um que termina às 00:14
//     EDT de 09/03 cai em "Hoje" e na semana (09/03 é segunda). Com o fuso
//     fixo em -05:00 (sem horário de verão), os dois cairiam no mesmo dia;
// (f) o motor provisório saiu: o console não tem "[provisório]" e o
//     `sound_test` resolve sem tocar ("[sem som] sound_test").
// O item (g) é do Node: `src/platform/web/motor-prototipo.js` não existe e
// nada no `src/` o cita.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const servidor = 'dev';
export const caminho = '/#/foco';

const RAIZ = fileURLToPath(new URL('../../../', import.meta.url));
const MIN = 60_000;
/** 30/09/2026 12:00 em São Paulo (-03:00). */
const MEIO_DIA_SP = Date.UTC(2026, 8, 30, 15, 0);
/** 08/03/2026 23:24 EDT (-04:00), em Nova York. */
const NY_2324 = Date.UTC(2026, 2, 9, 3, 24);
/** 09/03/2026 00:00 EDT: o fim do dia 08/03, de 23 h (days.rs). */
const NY_SEG_0H = Date.UTC(2026, 2, 9, 4, 0);

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

const LER = `(() => {
  const andamento = document.querySelector('[data-andamento]');
  const coluna = (id) => {
    const c = document.querySelector('[data-progresso] [data-coluna="' + id + '"]');
    return c ? (c.querySelector('[data-numero]').textContent + ' ' + c.querySelector('[data-unidade]').textContent).trim() : null;
  };
  return {
    emAndamento: !!andamento && !andamento.hidden,
    seletor: document.querySelector('[data-preparo] [data-numero]')?.textContent.trim() ?? null,
    concluido: document.querySelector('[data-concluido]')?.textContent.trim() ?? null,
    carregando: document.querySelector('[data-progresso]')?.hasAttribute('data-carregando') ?? null,
    ontem: coluna('ontem'),
    semana: coluna('semana'),
    tarefas: [...document.querySelectorAll('[data-lista] [data-tarefa]')].map((el) => ({
      titulo: el.querySelector('.tt-tarefa-titulo')?.textContent.trim() ?? null,
      feita: el.hasAttribute('data-feita'),
    })),
  };
})()`;

const ipc = (p, corpo) =>
  p.avaliar(`(async () => {
  const ipc = await import('/src/lib/ipc.js');
  ${corpo}
})()`);

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

async function telaPronta(p) {
  const ok = await esperar(p, `(() => {
    const b = document.querySelector('[data-preparo] [data-iniciar]');
    return !!b && b.getBoundingClientRect().height > 0 && !document.querySelector('[data-progresso]')?.hasAttribute('data-carregando');
  })()`);
  if (!ok) throw new Error('a tela Foco não apareceu (ou o progresso não carregou)');
}

/** Um foco de 25 min pela tela, do "Iniciar" até o fim. */
async function focoCompleto(t, p) {
  if (!(await escolherMinutos(p, 25))) return false;
  await p.avaliar(`document.querySelector('[data-preparo] [data-iniciar]').click()`);
  if (!(await esperar(p, `(${LER}).emAndamento`, 3000))) return false;
  await t.relogio.avancar(25 * MIN);
  return esperar(p, `!(${LER}).emAndamento`, 5000);
}

/** O fuso da página (o Intl) e o que o wasm enxerga. */
const fusos = (p) =>
  p.avaliar(`(async () => {
  const { fusoDoSistema } = await import('/src/platform/web/pkg/tomatito_wasm.js');
  return { intl: Intl.DateTimeFormat().resolvedOptions().timeZone, wasm: fusoDoSistema() };
})()`);

function arquivosDe(pasta) {
  return readdirSync(pasta).flatMap((nome) => {
    const caminhoDoArquivo = join(pasta, nome);
    return statSync(caminhoDoArquivo).isDirectory() ? arquivosDe(caminhoDoArquivo) : [caminhoDoArquivo];
  });
}

export default async function estatisticas(t) {
  const p = t.pagina;

  await p.cmd('Emulation.setTimezoneOverride', { timezoneId: 'America/Sao_Paulo' });
  await t.relogio.posicionar(MEIO_DIA_SP);
  await p.recarregar();
  await telaPronta(p);
  const fusoSp = await fusos(p);
  if (fusoSp.wasm !== 'America/Sao_Paulo') throw new Error(`o wasm não viu o fuso de São Paulo: ${JSON.stringify(fusoSp)}`);

  // (a)
  const zero = await p.avaliar(LER);
  const f1 = await focoCompleto(t, p);
  const f2 = await focoCompleto(t, p);
  const cinquenta = await esperar(p, `(${LER}).concluido === 'Concluído: 50 minutos'`, 4000);
  const a = await p.avaliar(LER);
  const statsA = await ipc(p, `return await ipc.estatisticas.obter();`);
  const periodosA = await p.avaliar(PERIODOS);
  const focos = periodosA.filter((x) => x.kind === 'focus');
  t.conferir(
    '(a) 2 focos completos de 25 min: "Concluído: 50 minutos", 3000 s em Hoje, 2 períodos no banco',
    zero.concluido === 'Concluído: 0 minutos' && f1 && f2 && cinquenta && statsA.todayS === 3000 && statsA.weekS === 3000 &&
      statsA.yesterdayS === 0 && focos.length === 2 &&
      focos.every((x) => x.completed === true && x.actualS === 1500 && x.plannedS === 1500 && Number.isInteger(x.id) && Number.isInteger(x.endedAt)),
    { antes: zero.concluido, depois: a.concluido, stats: statsA, periodos: periodosA },
  );

  // (b)
  await p.recarregar();
  await telaPronta(p);
  const b = await p.avaliar(LER);
  t.conferir('(b) depois de recarregar, continua "Concluído: 50 minutos"', b.concluido === 'Concluído: 50 minutos', b.concluido);

  // (c)
  const c = await ipc(
    p,
    `const rejeita = async (titulo) => { try { await ipc.tarefas.adicionar(titulo); return 'resolveu'; } catch (e) { return e; } };
  return { espacos: await rejeita('   '), controles: await rejeita('\\n\\t'), longo: await rejeita('á'.repeat(256)), lista: await ipc.tarefas.listar() };`,
  );
  t.conferir(
    "(c) tarefa só com espaços: 'emptyTitle', como no desktop; 256 caracteres: 'titleTooLong'; nada gravado",
    c.espacos?.code === 'emptyTitle' && typeof c.espacos.message === 'string' && c.controles?.code === 'emptyTitle' &&
      c.longo?.code === 'titleTooLong' && c.lista.length === 0,
    c,
  );

  // (d)
  const d0 = await ipc(
    p,
    `const a = await ipc.tarefas.adicionar('  Ler o capítulo 3 ');
  const b = await ipc.tarefas.adicionar('Lista 2');
  const feita = await ipc.tarefas.concluir(a.id);
  const outra = await ipc.tarefas.concluir(a.id);
  let inexistente;
  try { await ipc.tarefas.concluir(999); } catch (e) { inexistente = e?.code; }
  return { a, b, feita, outra, inexistente, lista: await ipc.tarefas.listar() };`,
  );
  await p.recarregar();
  await telaPronta(p);
  await esperar(p, `(${LER}).tarefas.length === 2`, 3000);
  const d1 = await p.avaliar(LER);
  // Até a meia-noite (a hora de zerar padrão, 0) e 1 min depois.
  const agora = await p.avaliar('Date.now()');
  const meiaNoite = Date.UTC(2026, 9, 1, 3, 0);
  await t.relogio.avancar(meiaNoite + MIN - agora);
  await p.recarregar();
  await telaPronta(p);
  await esperar(p, `(${LER}).tarefas.length === 1`, 3000);
  const d2 = await p.avaliar(LER);
  const listaD2 = await ipc(p, `return await ipc.tarefas.listar();`);
  t.conferir(
    '(d) a concluída fica marcada (e sobrevive a recarregar); depois da meia-noite some, a pendente fica, e os 50 min viram "Ontem"',
    d0.a.title === 'Ler o capítulo 3' && d0.a.doneAt === null && d0.feita.doneAt !== null && d0.outra.doneAt === d0.feita.doneAt &&
      d0.inexistente === 'notFound' &&
      JSON.stringify(d0.lista.map((x) => [x.title, x.doneAt !== null])) === JSON.stringify([['Ler o capítulo 3', true], ['Lista 2', false]]) &&
      JSON.stringify(d1.tarefas) === JSON.stringify([{ titulo: 'Ler o capítulo 3', feita: true }, { titulo: 'Lista 2', feita: false }]) &&
      JSON.stringify(d2.tarefas) === JSON.stringify([{ titulo: 'Lista 2', feita: false }]) &&
      listaD2.length === 1 && listaD2[0].id === d0.b.id &&
      d2.concluido === 'Concluído: 0 minutos' && d2.ontem === '50 minutos',
    { d0, antes: d1.tarefas, depois: d2.tarefas, concluido: d2.concluido, ontem: d2.ontem },
  );

  // (e)
  await p.cmd('Emulation.setTimezoneOverride', { timezoneId: 'America/New_York' });
  await t.relogio.posicionar(NY_2324);
  await p.recarregar();
  await telaPronta(p);
  const fusoNy = await fusos(p);
  const e1 = await focoCompleto(t, p);
  const e2 = await focoCompleto(t, p);
  await sleep(300);
  const statsE = await ipc(p, `return await ipc.estatisticas.obter();`);
  const periodosE = (await p.avaliar(PERIODOS)).filter((x) => x.kind === 'focus' && x.endedAt < MEIO_DIA_SP);
  const [antes, depois] = periodosE.map((x) => x.endedAt).sort((x, y) => x - y);
  const e = await p.avaliar(LER);
  t.conferir(
    "(e) America/New_York: o 08/03 de 23 h (days.rs, horario_de_verao) põe o foco das 23:49 EDT em Ontem e o das 00:14 EDT em Hoje e na semana",
    fusoNy.intl === 'America/New_York' && fusoNy.wasm === 'America/New_York' && e1 && e2 && periodosE.length === 2 &&
      antes < NY_SEG_0H && antes >= NY_SEG_0H - 12 * MIN && depois >= NY_SEG_0H && depois < NY_SEG_0H + 20 * MIN &&
      statsE.yesterdayS === 1500 && statsE.todayS === 1500 && statsE.weekS === 1500 &&
      e.concluido === 'Concluído: 25 minutos' && e.ontem === '25 minutos',
    { fusoNy, fins: periodosE.map((x) => new Date(x.endedAt).toISOString()), stats: statsE, tela: { concluido: e.concluido, ontem: e.ontem, semana: e.semana } },
  );

  // (f)
  const somResolveu = await p.avaliar(`(async () => {
  const { invoke } = await import('/src/platform/web/index.js');
  try { return (await invoke('sound_test', { sound: 'focusEnd' })) ?? 'null'; } catch (e) { return e; }
})()`);
  await sleep(200);
  const provisorios = p.consoles.filter((x) => x.texto.startsWith('[provisório]')).map((x) => x.texto);
  const semSom = p.consoles.some((x) => x.texto.startsWith('[sem som] sound_test'));
  t.conferir(
    '(f) sem "[provisório]" no console, e o sound_test resolve sem tocar',
    provisorios.length === 0 && somResolveu === 'null' && semSom,
    { provisorios, somResolveu, semSom },
  );

  // (g)
  const citam = arquivosDe(join(RAIZ, 'src'))
    .filter((f) => !f.includes('/pkg/') && readFileSync(f, 'utf8').includes('motor-prototipo'))
    .map((f) => f.slice(RAIZ.length));
  t.conferir(
    '(g) o motor-prototipo.js não existe e nada no src/ o cita',
    !existsSync(join(RAIZ, 'src/platform/web/motor-prototipo.js')) && citam.length === 0,
    citam,
  );
}
