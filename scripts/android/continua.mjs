#!/usr/bin/env node
// A notificação contínua (PLANO-ANDROID 5.3; A11), no emulador de pé e com o
// build de depuração instalado:
//
//   node scripts/android/continua.mjs
//
// Começa do zero (`pm clear`), concede POST_NOTIFICATIONS, abre o app e, pela
// receita da seção 6 (`settings_set` F = B = 1 e `focus_start {minutes: 3}`,
// por CDP), confere com o painel.mjs (`dumpsys notification --noredact`):
//  1. durante a fase: uma notificação do canal `sessao`, com as flags de
//     contínua (ONGOING_EVENT, ONLY_ALERT_ONCE), `when` = o fim da fase
//     (±1 s), `android.showChronometer=true`, `android.chronometerCountDown=true`,
//     título "Foco" e texto "Termina às HH:MM" (no fuso do aparelho);
//  2. focus_pause: a mesma notificação sem cronômetro e com o texto
//     "Pausado · faltam 1 min";
//  3. focus_resume: o cronômetro volta, com o `when` no fim novo (±1 s);
//  4. HOME e `am kill` (os alarmes ficam): no fim do foco, o FimReceiver
//     sobe um processo novo e a contínua passa para o intervalo, com o
//     `when` no fim dele (±1 s) e o cronômetro;
//  5. reabre e para a sessão: a contínua some, 0 alarmes; `logcat` sem
//     FATAL EXCEPTION nem panicked.
// Imprime um JSON com cada conferência e sai 1 se alguma falhou.
import { pathToFileURL } from 'node:url';
import { conectar } from './cdp.mjs';
import { abrir, esperarPid, PACOTE_DEBUG } from './instalar.mjs';
import { carregarAmbiente, criarAdb, esperar } from './lib/ambiente.mjs';
import { ler } from './painel.mjs';

const env = carregarAmbiente();
const adb = criarAdb(env);
adb.serial = env.ANDROID_SERIAL;
const pacote = process.env.TT_PACOTE || PACOTE_DEBUG;
const TOLERANCIA_MS = 1000;

const resultados = [];
const conferir = (nome, ok, detalhe) => {
  resultados.push({ nome, ok: Boolean(ok), detalhe });
};
const perto = (a, b) => Math.abs(a - b) <= TOLERANCIA_MS;
const painel = () => ler(adb, pacote);
const continua = (p) => p.notificacoes.find((n) => n.tag === 'sessao') ?? null;
const resumo = (n) =>
  n && {
    canal: n.canal,
    flags: n.flags,
    quando: n.quando,
    titulo: n.titulo,
    texto: n.texto,
    cronometro: n.cronometro,
    contagemRegressiva: n.contagemRegressiva,
  };

// "HH:MM" de um instante no fuso do aparelho (o emulador fica em São Paulo, A02).
const horaMinuto = (ms, fuso) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: fuso, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms);

async function esperarPainel(condicao, limiteMs = 8000) {
  const ate = Date.now() + limiteMs;
  let p = painel();
  while (!condicao(p) && Date.now() < ate) {
    await esperar(300);
    p = painel();
  }
  return p;
}

// A contínua de uma fase correndo, como a 5.3 pede.
function conferirCorrendo(rotulo, n, titulo, fim, fuso) {
  conferir(`${rotulo}: uma notificação do canal sessao`, n?.canal === 'sessao', resumo(n));
  conferir(
    `${rotulo}: flags de contínua (ONGOING_EVENT, ONLY_ALERT_ONCE)`,
    n && n.flags.includes('ONGOING_EVENT') && n.flags.includes('ONLY_ALERT_ONCE'),
    n?.flags,
  );
  conferir(`${rotulo}: when = o fim da fase (±1 s)`, n && perto(n.quando, fim), { quando: n?.quando, fim });
  conferir(
    `${rotulo}: showChronometer e chronometerCountDown`,
    n?.cronometro === true && n?.contagemRegressiva === true,
    resumo(n),
  );
  const texto = `Termina às ${horaMinuto(fim, fuso)}`;
  conferir(`${rotulo}: "${titulo}" e "${texto}"`, n?.titulo === titulo && n?.texto === texto, { titulo: n?.titulo, texto: n?.texto });
}

async function principal() {
  const fuso = adb.shell('getprop persist.sys.timezone') || 'America/Sao_Paulo';
  adb(['shell', 'pm', 'clear', pacote]);
  adb(['shell', 'pm', 'grant', pacote, 'android.permission.POST_NOTIFICATIONS']);
  adb(['logcat', '-c']);
  abrir(adb, pacote);
  const pid = await esperarPid(adb, pacote);
  if (!pid) throw new Error(`o app ${pacote} não abriu`);
  await esperar(1500);

  let p = painel();
  conferir('ao abrir, sem sessão: nenhuma contínua', !continua(p), resumo(continua(p)));

  let cdp = await conectar({ pacote });
  let focus;
  try {
    // 1. A receita da seção 6: foco de 60 s.
    await cdp.invoke('settings_set', { patch: { focusMinutes: 1, breakMinutes: 1 } });
    focus = await cdp.invoke('focus_start', { minutes: 3 });
    p = await esperarPainel((x) => continua(x)?.cronometro);
    conferirCorrendo('foco', continua(p), 'Foco', focus.session.endsAt, fuso);

    // 2. Pausa.
    await esperar(1000);
    focus = await cdp.invoke('focus_pause');
    p = await esperarPainel((x) => continua(x) && !continua(x).cronometro);
    let n = continua(p);
    conferir('pausado: ainda na bandeja, canal sessao, contínua', n?.canal === 'sessao' && n?.flags.includes('ONGOING_EVENT'), resumo(n));
    conferir('pausado: sem cronômetro', n && !n.cronometro && !n.contagemRegressiva, resumo(n));
    conferir('pausado: "Foco" e "Pausado · faltam 1 min"', n?.titulo === 'Foco' && n?.texto === 'Pausado · faltam 1 min', {
      titulo: n?.titulo,
      texto: n?.texto,
    });

    // 3. Retomada: o cronômetro volta, no fim novo.
    await esperar(3000);
    focus = await cdp.invoke('focus_resume');
    p = await esperarPainel((x) => continua(x)?.cronometro && perto(continua(x).quando, focus.session.endsAt));
    conferirCorrendo('retomado', continua(p), 'Foco', focus.session.endsAt, fuso);
  } finally {
    await cdp.fechar();
  }

  // 4. Processo morto; a troca de fase vem só do FimReceiver.
  const fimDoFoco = focus.session.endsAt;
  const fimDoIntervalo = fimDoFoco + 60_000;
  adb(['shell', 'input', 'keyevent', 'KEYCODE_HOME']);
  await esperar(1500);
  adb(['shell', 'am', 'kill', pacote]);
  await esperar(1000);
  const semProcesso = painel();
  conferir(
    'am kill: o processo morreu, a contínua e os 3 alarmes ficaram',
    semProcesso.pid === null && semProcesso.alarmes.length === 3 && continua(semProcesso)?.titulo === 'Foco',
    { pid: semProcesso.pid, alarmes: semProcesso.alarmes.length, continua: resumo(continua(semProcesso)) },
  );
  await esperar(Math.max(0, fimDoFoco - semProcesso.agoraMs) + 2000);
  p = await esperarPainel((x) => continua(x)?.titulo === 'Intervalo', 10_000);
  conferirCorrendo('troca de fase com o processo morto', continua(p), 'Intervalo', fimDoIntervalo, fuso);
  conferir(
    'a troca veio do FimReceiver, num processo novo',
    p.logcat.some((l) => /FimReceiver: fim 1 no canal fim-foco/.test(l)) && p.pid !== null && p.pid !== pid,
    { pidAntes: pid, pidDepois: p.pid, log: p.logcat.filter((l) => /FimReceiver/.test(l)) },
  );

  // 5. Reabre (a retomada do motor manda a mesma contínua) e para: some.
  abrir(adb, pacote);
  await esperarPid(adb, pacote);
  await esperar(2000);
  p = painel();
  conferir(
    'ao reabrir no intervalo: a contínua segue a do motor',
    continua(p)?.titulo === 'Intervalo' && perto(continua(p).quando, fimDoIntervalo),
    resumo(continua(p)),
  );
  cdp = await conectar({ pacote });
  try {
    await cdp.invoke('focus_stop');
  } finally {
    await cdp.fechar();
  }
  p = await esperarPainel((x) => !continua(x) && x.alarmes.length === 0);
  conferir('parado: a contínua sumiu e 0 alarmes', !continua(p) && p.alarmes.length === 0, {
    continua: resumo(continua(p)),
    alarmes: p.alarmes.length,
  });
  const log = adb(['logcat', '-d']);
  conferir('logcat sem FATAL EXCEPTION nem panicked', !/FATAL EXCEPTION|panicked/.test(log));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  principal()
    .catch((e) => conferir('execução', false, String(e?.stack ?? e)))
    .finally(() => {
      const falhas = resultados.filter((r) => !r.ok);
      console.log(JSON.stringify({ ok: falhas.length === 0, resultados }, null, 2));
      process.exitCode = falhas.length ? 1 : 0;
    });
}
