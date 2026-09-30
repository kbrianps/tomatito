#!/usr/bin/env node
// Segundo plano, tela bloqueada e Doze (PLANO-ANDROID 5.2 e 6; A12), no
// emulador de pé e com o build de depuração instalado:
//
//   node scripts/android/segundo-plano.mjs [--cooldown-do-sistema]
//
// O roteiro: começa do zero (`pm clear`), concede POST_NOTIFICATIONS, abre o
// app e roda a receita da seção 6 por CDP (`settings_set` F = B = 1 e
// `focus_start {minutes: 3}`: fins em 60, 120 e 180 s) → HOME →
// `KEYCODE_SLEEP` → `dumpsys battery unplug` → `dumpsys deviceidle
// force-idle` → `am kill` → espera até 10 s depois do último fim (3 min 10 s
// desde o início), lendo o aparelho a cada segundo → coleta. Confere:
//  1. antes do primeiro disparo: processo morto, tela apagada, 3 alarmes
//     `setAlarmClock` e o Doze em IDLE até o sistema o tirar, a até 3 s do
//     instante (o "exits Doze shortly before" do `setAlarmClock`), sem
//     passar por ACTIVE;
//  2. as 3 notificações de fim (fim-foco, fim-intervalo, fim-foco da sessão
//     concluída) em `dumpsys notification`, cada uma com o `postTime`
//     (`mCreationTimeMs`) entre o instante agendado e 5 s depois, inclusive a
//     segunda, 1 min depois da primeira;
//  3. o som: o `mSound` de cada uma é o do canal (`raw/focus_end`,
//     `raw/break_end`), cada chave passou pelo `mSoundNotificationKey` (o A02
//     mostrou que o `audiblyAlerted` não aparece no dump), o `RingtonePlayer`
//     do SystemUI tocou 3 vezes um `android.resource://` do pacote, com o DND
//     desligado e os efeitos ligados;
//  4. acorda, desbloqueia e reabre: o motor diz sessão concluída
//     (`get_state` com `focus.status = "completed"`), a tela Foco voltou ao
//     preparo com "Concluído: 2 minutos" no Progresso diário (o "Concluída"
//     visível é do tomate, A16a; ver docs/decisoes.md, A12), e o
//     `stats_get` tem os 2 blocos de foco (`todayS = 120`);
//     `logcat` sem FATAL EXCEPTION nem panicked.
// Para o Doze com fases de 60 s, baixa três constantes do sistema (`adb
// root` + `device_config`; ver `baixarConstantesDoDoze`). No fim devolve o
// aparelho como achou: `deviceidle unforce`, `battery reset`, as constantes
// apagadas, `adb unroot`, tela acesa. `--cooldown-do-sistema` roda com o *notification
// cooldown* do Android 15+ no padrão do sistema (o `emulador.mjs subir` o
// desliga; ver docs/android/kit.md) e o desliga de novo ao sair.
// Imprime um JSON com cada conferência e sai 1 se alguma falhou.
import { pathToFileURL } from 'node:url';
import { conectar } from './cdp.mjs';
import { abrir, esperarPid, PACOTE_DEBUG } from './instalar.mjs';
import { carregarAmbiente, criarAdb, esperar } from './lib/ambiente.mjs';
import { efeitosDeSom, estadoDoDoze, ler, notificacoesDoPacote } from './painel.mjs';

const env = carregarAmbiente();
const adb = criarAdb(env);
adb.serial = env.ANDROID_SERIAL;
const pacote = process.env.TT_PACOTE || PACOTE_DEBUG;
const comCooldown = process.argv.includes('--cooldown-do-sistema');
const ATRASO_MAX_MS = 5000;
const SOM_DO_CANAL = {
  'fim-foco': `android.resource://${pacote}/raw/focus_end`,
  'fim-intervalo': `android.resource://${pacote}/raw/break_end`,
};

const resultados = [];
const conferir = (nome, ok, detalhe) => {
  resultados.push({ nome, ok: Boolean(ok), detalhe });
};

// Uma leitura leve (só o que muda a cada segundo): os avisos de fim, o
// último que tocou e o Doze.
function leitura() {
  const notificacao = adb.shell('dumpsys notification --noredact');
  return {
    agoraMs: Number(adb.shell('date +%s%3N')),
    doze: estadoDoDoze(adb.shell('dumpsys deviceidle')),
    fins: notificacoesDoPacote(notificacao, pacote).filter((n) => n.tag === 'fim'),
    ...efeitosDeSom(notificacao),
  };
}

const telaAcesa = () => /mWakefulness=Awake/.test(adb.shell('dumpsys power'));

// Duas constantes do sistema tiram o aparelho do Doze bem antes de um alarme
// que acorda do Doze (o `setAlarmClock`), e com fases de 60 s o IDLE nunca
// chegaria ao instante do disparo:
//  - `device_idle/min_time_to_alarm` (1 h no Android 17): com um alarme
//    desses a menos disso, o aparelho nem entra em IDLE ("Unable to go deep
//    idle; stopped at INACTIVE");
//  - `alarm_manager/min_device_idle_fuzz` e `max_device_idle_fuzz` (2 e 15
//    min): o fim do IDLE é antecipado de um sorteio nessa faixa antes do
//    alarme; a menos de 2 min, a janela de manutenção abre na hora.
// O roteiro baixa as três (10 s, 1 s e 2 s; só com `adb root`: o shell não
// pode escrever no DeviceConfig) e as devolve no fim. Ver docs/decisoes.md,
// A12.
let virouRoot = false;
function baixarConstantesDoDoze() {
  if (adb.shell('id -u') !== '0') {
    adb.solto(['-s', adb.serial, 'root']);
    adb(['wait-for-device']);
    virouRoot = true;
  }
  adb(['shell', 'device_config', 'put', 'device_idle', 'min_time_to_alarm', '10000']);
  adb(['shell', 'device_config', 'put', 'alarm_manager', 'min_device_idle_fuzz', '1000']);
  adb(['shell', 'device_config', 'put', 'alarm_manager', 'max_device_idle_fuzz', '2000']);
  const alarm = adb.shell('dumpsys alarm');
  return {
    minTimeToAlarm: /min_time_to_alarm=(\S+)/.exec(adb.shell('dumpsys deviceidle'))?.[1] ?? null,
    minDeviceIdleFuzz: /min_device_idle_fuzz=(\S+)/.exec(alarm)?.[1] ?? null,
    maxDeviceIdleFuzz: /max_device_idle_fuzz=(\S+)/.exec(alarm)?.[1] ?? null,
  };
}

async function principal() {
  if (comCooldown) adb(['shell', 'settings', 'delete', 'system', 'notification_cooldown_enabled']);
  const cooldown = adb.shell('settings get system notification_cooldown_enabled');
  adb(['shell', 'pm', 'clear', pacote]);
  adb(['shell', 'pm', 'grant', pacote, 'android.permission.POST_NOTIFICATIONS']);
  adb(['shell', 'input', 'keyevent', 'KEYCODE_WAKEUP']);
  adb(['shell', 'wm', 'dismiss-keyguard']);
  adb(['logcat', '-c']);
  abrir(adb, pacote);
  let pid = await esperarPid(adb, pacote, 15_000);
  if (!pid) {
    abrir(adb, pacote);
    pid = await esperarPid(adb, pacote);
  }
  if (!pid) throw new Error(`o app ${pacote} não abriu`);
  await esperar(1500);

  // A receita da seção 6.
  let cdp = await conectar({ pacote });
  try {
    await cdp.invoke('settings_set', { patch: { focusMinutes: 1, breakMinutes: 1 } });
    await cdp.invoke('focus_start', { minutes: 3 });
  } finally {
    await cdp.fechar();
  }
  let p = ler(adb, pacote);
  for (let t = 0; t < 20 && (p.agendaGravada?.length ?? 0) < 3; t++) {
    await esperar(300);
    p = ler(adb, pacote);
  }
  const agenda = (p.agendaGravada ?? []).map(({ id, quandoMs, canal, titulo }) => ({ id, quandoMs, canal, titulo }));
  conferir('agenda gravada com os 3 fins', agenda.length === 3, agenda);

  // HOME → tela apagada → sem carregador → Doze → processo morto.
  adb(['shell', 'input', 'keyevent', 'KEYCODE_HOME']);
  await esperar(1000);
  adb(['shell', 'input', 'keyevent', 'KEYCODE_SLEEP']);
  await esperar(1000);
  adb(['shell', 'dumpsys', 'battery', 'unplug']);
  await esperar(2000);
  // Com a constante do sistema, o Doze é recusado (os alarmes estão a menos
  // de 1 h): fica registrado na linha do tempo.
  const comOPadrao = adb.shell('dumpsys deviceidle force-idle');
  const constantes = baixarConstantesDoDoze();
  // O DeviceIdleController só entra em IDLE depois de ver a tela apagada;
  // logo depois do SLEEP, o force-idle pode parar em INACTIVE. Tenta de novo
  // por até 10 s.
  let forcado = '';
  for (let t = 0; t < 10; t++) {
    forcado = adb.shell('dumpsys deviceidle force-idle');
    if (/Now forced in to deep idle/.test(forcado)) break;
    await esperar(1000);
  }
  // O `am kill` só mata um processo em cache; logo depois do HOME ele pode
  // ainda não estar. Tenta de novo por até 10 s.
  for (let t = 0; t < 10; t++) {
    adb(['shell', 'am', 'kill', pacote]);
    await esperar(1000);
    if (!adb.solto(['-s', adb.serial, 'shell', 'pidof', pacote]).stdout.trim()) break;
  }
  p = ler(adb, pacote);
  conferir(
    'antes dos fins: processo morto, tela apagada, 3 alarmes setAlarmClock',
    p.pid === null && !telaAcesa() && p.alarmes.length === 3 && p.alarmes.every((a) => a.relogio && a.tipo === 'RTC_WAKEUP'),
    { pid: p.pid, telaAcesa: telaAcesa(), alarmes: p.alarmes },
  );
  conferir(
    'force-idle com as constantes baixadas: IDLE',
    /Now forced in to deep idle/.test(forcado) && p.doze === 'IDLE',
    { comOPadrao, constantes, forcado, doze: p.doze },
  );

  // Espera, lendo a cada segundo, até 10 s depois do último fim.
  const ultimo = agenda.at(-1)?.quandoMs ?? Date.now() + 180_000;
  const leituras = [];
  const tocados = new Map(); // chave → instante em que apareceu no mSoundNotificationKey
  while (true) {
    const l = leitura();
    leituras.push({ agoraMs: l.agoraMs, doze: l.doze, fins: l.fins.length, somDoUltimo: l.somDoUltimo });
    if (l.somDoUltimo && !tocados.has(l.somDoUltimo)) tocados.set(l.somDoUltimo, l.agoraMs);
    if (l.agoraMs > ultimo + 10_000) break;
    // Mais perto do primeiro disparo, leituras mais frequentes: é ali que o
    // sistema tira o aparelho do IDLE.
    const faltam = (agenda[0]?.quandoMs ?? 0) - l.agoraMs;
    await esperar(faltam > 0 && faltam < 6000 ? 150 : 1000);
  }
  const final = leitura();

  // 1. O Doze antes do primeiro disparo.
  const primeiro = agenda[0]?.quandoMs ?? 0;
  // O sistema tira o aparelho do IDLE um sorteio de `min..max_device_idle_fuzz`
  // (aqui 1 a 2 s) antes do alarme e, a menos de `min_time_to_alarm`, o deixa
  // em INACTIVE até o disparo: a última leitura em IDLE fica a até 3 s do
  // instante, e nenhuma leitura antes dele é ACTIVE (tela, carregador ou app).
  const antes = leituras.filter((l) => l.agoraMs < primeiro);
  const ultimoIdle = antes.filter((l) => l.doze === 'IDLE').at(-1);
  conferir(
    'o Doze estava em IDLE até o sistema o tirar, a até 3 s do primeiro disparo',
    ultimoIdle && primeiro - ultimoIdle.agoraMs <= 3000 && antes.every((l) => l.doze !== 'ACTIVE'),
    { ultimoIdleAntesMs: ultimoIdle ? primeiro - ultimoIdle.agoraMs : null, estados: [...new Set(antes.map((l) => l.doze))] },
  );

  // 2. As 3 notificações de fim, na hora.
  const porId = new Map(final.fins.map((n) => [n.id, n]));
  const avisos = agenda.map((a) => {
    const n = porId.get(a.id);
    return {
      id: a.id,
      canal: a.canal,
      titulo: n?.titulo ?? null,
      agendadoMs: a.quandoMs,
      postadoMs: n?.postadoMs ?? null,
      atrasoMs: n ? n.postadoMs - a.quandoMs : null,
      som: n?.som ?? null,
      chave: n?.chave ?? null,
      tocouEm: n && tocados.has(n.chave) ? tocados.get(n.chave) - a.quandoMs : null,
    };
  });
  const nomes = ['1ª (fim do foco)', '2ª (fim do intervalo, 1 min depois)', '3ª (fim da sessão)'];
  avisos.forEach((a, k) => {
    conferir(
      `${nomes[k]}: postada no canal ${a.canal} até 5 s depois do instante`,
      a.postadoMs !== null && a.atrasoMs >= 0 && a.atrasoMs <= ATRASO_MAX_MS && porId.get(a.id)?.canal === a.canal,
      a,
    );
  });
  conferir(
    'canais: fim-foco, fim-intervalo, fim-foco',
    agenda.map((a) => a.canal).join() === 'fim-foco,fim-intervalo,fim-foco',
    agenda.map((a) => a.canal),
  );

  // 3. O som saiu pelo canal.
  avisos.forEach((a, k) => {
    conferir(`${nomes[k]}: mSound = o som do canal`, a.som === SOM_DO_CANAL[a.canal], { som: a.som, esperado: SOM_DO_CANAL[a.canal] });
    conferir(`${nomes[k]}: passou pelo mSoundNotificationKey`, a.tocouEm !== null, { chave: a.chave, tocouEm: a.tocouEm });
  });
  const log = adb(['logcat', '-d']);
  const toques = log.split('\n').filter((l) => l.includes('RingtonePlayer') && l.includes(`play uri=android.resource://${pacote}/`));
  conferir('RingtonePlayer tocou os 3 (android.resource:// do pacote)', toques.length === 3, toques);
  conferir('DND desligado e efeitos de som ligados', final.zen === 'ZEN_MODE_OFF' && !final.efeitosDesligados, {
    zen: final.zen,
    efeitosDesligados: final.efeitosDesligados,
    cooldown,
  });

  // 4. Acorda, desbloqueia e reabre.
  adb(['shell', 'dumpsys', 'deviceidle', 'unforce']);
  adb(['shell', 'dumpsys', 'battery', 'reset']);
  adb(['shell', 'input', 'keyevent', 'KEYCODE_WAKEUP']);
  adb(['shell', 'wm', 'dismiss-keyguard']);
  await esperar(1000);
  abrir(adb, pacote);
  await esperarPid(adb, pacote);
  await esperar(2500);
  cdp = await conectar({ pacote });
  try {
    const estado = await cdp.invoke('get_state');
    const foco = estado.focus;
    conferir('ao reabrir: o motor diz sessão concluída', foco?.status === 'completed', {
      status: foco?.status,
      fase: foco?.session?.phaseIndex,
    });
    // O cartão Progresso diário carrega depois do primeiro quadro.
    const lerTela = () =>
      cdp.avaliar(`({ hash: location.hash, texto: document.body.innerText, anuncio: document.querySelector('[data-anuncio]')?.textContent ?? null })`);
    let tela = await lerTela();
    for (let t = 0; t < 16 && !tela.texto.includes('Concluído: 2 minutos'); t++) {
      await esperar(500);
      tela = await lerTela();
    }
    conferir(
      'ao reabrir: a tela Foco, de volta ao preparo, com "Concluído: 2 minutos"',
      /foco/.test(tela.hash) && tela.texto.includes('Iniciar sessão de foco') && tela.texto.includes('Concluído: 2 minutos'),
      { hash: tela.hash, anuncio: tela.anuncio, fim: tela.texto.slice(-120) },
    );
    const stats = await cdp.invoke('stats_get');
    conferir('stats_get: os 2 blocos de foco (todayS = 120)', stats.todayS === 120, stats);
  } finally {
    await cdp.fechar();
  }
  conferir('logcat sem FATAL EXCEPTION nem panicked', !/FATAL EXCEPTION|panicked/.test(adb(['logcat', '-d'])));
  resultados.push({
    nome: 'linha do tempo',
    ok: true,
    detalhe: { cooldown, forceIdleComOPadrao: comOPadrao, avisos, doze: leituras.filter((l, k) => k === 0 || l.doze !== leituras[k - 1].doze).map((l) => [l.agoraMs - primeiro, l.doze]) },
  });
}

function devolver() {
  try {
    adb(['shell', 'dumpsys', 'deviceidle', 'unforce']);
    adb(['shell', 'dumpsys', 'battery', 'reset']);
    adb(['shell', 'input', 'keyevent', 'KEYCODE_WAKEUP']);
    if (comCooldown) adb(['shell', 'settings', 'put', 'system', 'notification_cooldown_enabled', '0']);
    adb.solto(['-s', adb.serial, 'shell', 'device_config', 'delete', 'device_idle', 'min_time_to_alarm']);
    adb.solto(['-s', adb.serial, 'shell', 'device_config', 'delete', 'alarm_manager', 'min_device_idle_fuzz']);
    adb.solto(['-s', adb.serial, 'shell', 'device_config', 'delete', 'alarm_manager', 'max_device_idle_fuzz']);
    if (virouRoot) {
      adb.solto(['-s', adb.serial, 'unroot']);
      adb.solto(['-s', adb.serial, 'wait-for-device']);
    }
  } catch {
    // o aparelho pode ter caído; o JSON já diz o que falhou
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  principal()
    .catch((e) => conferir('execução', false, String(e?.stack ?? e)))
    .finally(() => {
      devolver();
      const falhas = resultados.filter((r) => !r.ok);
      console.log(JSON.stringify({ ok: falhas.length === 0, resultados }, null, 2));
      process.exitCode = falhas.length ? 1 : 0;
    });
}
