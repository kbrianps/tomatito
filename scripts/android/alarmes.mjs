#!/usr/bin/env node
// Alarmes exatos e o FimReceiver (PLANO-ANDROID 5.2, itens 2 a 4; A10a), no
// emulador de pé e com o build de depuração instalado:
//
//   node scripts/android/alarmes.mjs
//
// Começa do zero (`pm clear`, que também tira alarmes e avisos do pacote),
// concede POST_NOTIFICATIONS, abre o app e, pela receita da seção 6
// (`settings_set` F = B = 1 e `focus_start {minutes: 3}`, por CDP), confere
// com o painel.mjs:
//  1. 3 alarmes do pacote, RTC_WAKEUP com AlarmClockInfo, nos instantes da
//     agenda (±1 s): os fins da sessão (fim da fase atual, +60 s, +120 s) e
//     os `quandoMs` da agenda gravada nas SharedPreferences;
//  2. focus_pause → 0 alarmes (e agenda gravada vazia);
//  3. focus_resume (alguns segundos depois) → 3 alarmes, deslocados pela
//     pausa (o mesmo deslocamento do fim da fase no retrato do motor, ±1 s);
//  4. timer_start de um temporizador novo de 1 min → 4 alarmes, o novo no
//     `endsAt` dele;
//  5. o JS não alcança o `agendar` (fora da ACL);
//  6. HOME e `am kill` (o processo morre, os alarmes ficam): no primeiro fim,
//     o FimReceiver sobe um processo novo e posta a notificação no canal
//     `fim-foco`, com o `ic_stat_tomatito` (o id do ícone confere no `aapt2`),
//     `when` = o fim e o texto da agenda; o temporizador, uns segundos depois,
//     no `fim-temporizador`; a agenda gravada perde os dois itens, os 2
//     alarmes restantes continuam e a contínua passa para o intervalo;
//  7. limpeza: reabre, para a sessão e o temporizador → 0 alarmes, e o
//     `logcat` sem FATAL EXCEPTION nem panicked.
// Imprime um JSON com cada conferência e sai 1 se alguma falhou.
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { conectar } from './cdp.mjs';
import { abrir, caminhoApkDebug, esperarPid, PACOTE_DEBUG } from './instalar.mjs';
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

// Os fins da sessão de 3 min com F = B = 1 a partir do fim da fase atual.
const finsDaSessao = (focus) => {
  const fim = focus.session.endsAt;
  const faltam = 3 - focus.session.phaseIndex;
  return Array.from({ length: faltam }, (_, k) => fim + k * 60_000);
};

// Espera o painel satisfazer `condicao` (o `agendar` roda numa thread à parte).
async function esperarPainel(condicao, limiteMs = 8000) {
  const ate = Date.now() + limiteMs;
  let p = painel();
  while (!condicao(p) && Date.now() < ate) {
    await esperar(300);
    p = painel();
  }
  return p;
}

async function principal() {
  adb(['shell', 'pm', 'clear', pacote]);
  adb(['shell', 'pm', 'grant', pacote, 'android.permission.POST_NOTIFICATIONS']);
  adb(['logcat', '-c']);
  abrir(adb, pacote);
  const pid = await esperarPid(adb, pacote);
  if (!pid) throw new Error(`o app ${pacote} não abriu`);
  await esperar(1500);

  let cdp = await conectar({ pacote });
  let temporizador;
  let fimDoTemporizador;
  let fins;
  try {
    // 1. A receita da seção 6.
    await cdp.invoke('settings_set', { patch: { focusMinutes: 1, breakMinutes: 1 } });
    let focus = await cdp.invoke('focus_start', { minutes: 3 });
    fins = finsDaSessao(focus);
    let p = await esperarPainel((x) => x.alarmes.length === 3);
    conferir('focus_start: 3 alarmes do pacote', p.alarmes.length === 3, p.alarmes);
    conferir('todos RTC_WAKEUP com AlarmClockInfo', p.alarmes.every((a) => a.tipo === 'RTC_WAKEUP' && a.relogio), p.alarmes);
    conferir('nos fins da sessão (±1 s)', p.alarmes.length === 3 && p.alarmes.every((a, k) => perto(a.quandoMs, fins[k])), {
      alarmes: p.alarmes.map((a) => a.quandoMs),
      fins,
    });
    const gravada = p.agendaGravada ?? [];
    conferir(
      'a agenda gravada (run-as ... shared_prefs) tem os mesmos instantes e os textos',
      gravada.length === 3 &&
        gravada.every((g, k) => perto(g.quandoMs, p.alarmes[k].quandoMs)) &&
        gravada[0].canal === 'fim-foco' && gravada[1].canal === 'fim-intervalo' && gravada[0].titulo,
      gravada.map(({ id, quandoMs, canal, titulo }) => ({ id, quandoMs, canal, titulo })),
    );
    const antes = focus.session.endsAt;

    // 2. Pausa.
    await esperar(1000);
    focus = await cdp.invoke('focus_pause');
    p = await esperarPainel((x) => x.alarmes.length === 0);
    conferir('focus_pause: 0 alarmes', p.alarmes.length === 0, p.alarmes);
    conferir('focus_pause: agenda gravada vazia', Array.isArray(p.agendaGravada) && p.agendaGravada.length === 0, p.agendaGravada);

    // 3. Retomada, alguns segundos depois.
    await esperar(4000);
    focus = await cdp.invoke('focus_resume');
    fins = finsDaSessao(focus);
    const deslocamento = focus.session.endsAt - antes;
    p = await esperarPainel((x) => x.alarmes.length === 3);
    conferir('focus_resume: 3 alarmes', p.alarmes.length === 3, p.alarmes);
    conferir(
      'deslocados pela pausa (±1 s)',
      deslocamento >= 4000 && p.alarmes.length === 3 && p.alarmes.every((a, k) => perto(a.quandoMs, fins[k])),
      { deslocamento, alarmes: p.alarmes.map((a) => a.quandoMs), fins },
    );

    // 4. Um temporizador de 1 min.
    const criados = await cdp.invoke('timer_create', { name: 'Chá', durationMs: 60_000 });
    temporizador = criados.timers.at(-1).id;
    const timers = await cdp.invoke('timer_start', { id: temporizador });
    fimDoTemporizador = timers.timers.find((t) => t.id === temporizador).endsAt;
    p = await esperarPainel((x) => x.alarmes.length === 4);
    conferir('timer_start: 4 alarmes', p.alarmes.length === 4 && p.alarmes.every((a) => a.relogio), p.alarmes);
    conferir('um deles no fim do temporizador (±1 s)', p.alarmes.some((a) => perto(a.quandoMs, fimDoTemporizador)), {
      fimDoTemporizador,
      alarmes: p.alarmes.map((a) => a.quandoMs),
    });
    const itemDoTemporizador = p.agendaGravada.find((g) => perto(g.quandoMs, fimDoTemporizador));
    conferir('o do temporizador no canal fim-temporizador', itemDoTemporizador?.canal === 'fim-temporizador', itemDoTemporizador);

    // 5. O JS não chama o agendar.
    const recusa = await cdp
      .avaliar(`window.__TAURI_INTERNALS__.invoke('plugin:tomatito-android|agendar', { agenda: [] }).then(() => 'aceito', (e) => String(e))`)
      .catch((e) => String(e));
    const depois = painel();
    conferir('o JS não alcança o agendar (ACL)', recusa !== 'aceito' && /not allowed/i.test(recusa) && depois.alarmes.length === 4, recusa);
  } finally {
    await cdp.fechar();
  }

  // 6. Processo morto; o primeiro fim chega pelo FimReceiver.
  adb(['shell', 'input', 'keyevent', 'KEYCODE_HOME']);
  await esperar(1500);
  adb(['shell', 'am', 'kill', pacote]);
  await esperar(1000);
  const semProcesso = painel();
  conferir('am kill: o processo morreu e os 4 alarmes ficaram', semProcesso.pid === null && semProcesso.alarmes.length === 4, {
    pid: semProcesso.pid,
    alarmes: semProcesso.alarmes.length,
  });
  // Espera o primeiro fim e o do temporizador (que vem uns segundos depois).
  const ultimo = Math.max(fins[0], fimDoTemporizador);
  await esperar(Math.max(0, ultimo - semProcesso.agoraMs) + 3000);
  const disparo = await esperarPainel((x) => x.notificacoes.filter((n) => n.tag === 'fim').length >= 2, 10_000);
  const aviso = disparo.notificacoes.find((n) => n.tag === 'fim' && n.canal === 'fim-foco');
  conferir('o primeiro fim postou no canal fim-foco', Boolean(aviso), disparo.notificacoes);
  conferir('com when = o fim (±1 s) e o título da agenda', aviso && perto(aviso.quando, fins[0]) && aviso.titulo === 'Período de foco concluído', aviso);
  const aapt2 = `${env.ANDROID_HOME}/build-tools/37.0.0/aapt2`;
  const recursos = execFileSync(aapt2, ['dump', 'resources', caminhoApkDebug(env)], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  const icone = aviso?.icone ? new RegExp(`resource ${aviso.icone} (\\S+)`).exec(recursos)?.[1] : null;
  conferir('com o ic_stat_tomatito', icone === 'drawable/ic_stat_tomatito', { id: aviso?.icone, recurso: icone });
  conferir(
    'pelo FimReceiver, num processo novo',
    disparo.logcat.some((l) => /FimReceiver: fim 1 no canal fim-foco/.test(l)) && disparo.pid !== null && disparo.pid !== pid,
    { pidAntes: pid, pidDepois: disparo.pid, log: disparo.logcat.filter((l) => /FimReceiver/.test(l)) },
  );
  const doTemporizador = disparo.notificacoes.find((n) => n.tag === 'fim' && n.canal === 'fim-temporizador');
  conferir('o fim do temporizador também, no canal fim-temporizador', doTemporizador && perto(doTemporizador.quando, fimDoTemporizador), doTemporizador);
  conferir(
    'a agenda gravada perdeu os 2 itens e os 2 alarmes restantes ficaram',
    disparo.agendaGravada?.length === 2 &&
      disparo.agendaGravada.every((g, k) => perto(g.quandoMs, fins[k + 1])) &&
      disparo.alarmes.length === 2 && disparo.alarmes.every((a, k) => perto(a.quandoMs, fins[k + 1])),
    { gravada: disparo.agendaGravada?.map((g) => g.id), alarmes: disparo.alarmes.map((a) => a.quandoMs), fins },
  );
  // A contínua é a do último disparo: o temporizador acabou, a fase é o intervalo.
  conferir(
    'a contínua passou para o intervalo',
    disparo.notificacoes.some((n) => n.tag === 'sessao' && n.titulo === 'Intervalo' && perto(n.quando, fins[1]) && n.cronometro && n.contagemRegressiva),
    disparo.notificacoes.filter((n) => n.tag === 'sessao'),
  );

  // 7. Limpeza: reabre, para tudo.
  abrir(adb, pacote);
  await esperarPid(adb, pacote);
  await esperar(2000);
  cdp = await conectar({ pacote });
  try {
    await cdp.invoke('focus_stop');
    await cdp.invoke('timer_reset', { id: temporizador });
    await cdp.invoke('timer_delete', { id: temporizador });
  } finally {
    await cdp.fechar();
  }
  const fim = await esperarPainel((x) => x.alarmes.length === 0);
  conferir('limpeza: 0 alarmes e a contínua saiu', fim.alarmes.length === 0 && !fim.notificacoes.some((n) => n.tag === 'sessao'), fim.alarmes);
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
