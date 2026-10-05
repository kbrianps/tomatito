#!/usr/bin/env node
// O painel do aparelho (PLANO-ANDROID 6): extrai do `dumpsys alarm`, do
// `dumpsys notification --noredact`, do `dumpsys deviceidle`, das
// `SharedPreferences` do plugin (`run-as`) e do `logcat -d -s tomatito:*` os
// campos que os marcos conferem (A10a em diante), em JSON:
//
//   node scripts/android/painel.mjs [--pacote <pacote>]
//
// Os leitores são exportados para os roteiros (`alarmes.mjs` e os seguintes).
// O pacote padrão é o do build de depuração (`TT_PACOTE` troca).
import { pathToFileURL } from 'node:url';
import { PACOTE_DEBUG } from './instalar.mjs';
import { carregarAmbiente, criarAdb } from './lib/ambiente.mjs';

/**
 * Os alarmes do pacote no `dumpsys alarm` (lista de pendentes), sem
 * repetir o "Next wake from idle": `{ tipo, quandoMs, relogio, tag }`, em
 * ordem de instante. `relogio` é o `setAlarmClock` (bloco "Alarm clock:").
 */
export function alarmesDoPacote(dump, pacote) {
  const alarmes = [];
  const linhas = dump.split('\n');
  for (let i = 0; i < linhas.length; i++) {
    const m = /^\s+(RTC_WAKEUP|RTC|ELAPSED_WAKEUP|ELAPSED) #\d+: Alarm\{(\w+) type \d+ origWhen (\d+) whenElapsed \d+ (\S+)\}/.exec(linhas[i]);
    if (!m || m[4] !== pacote) continue;
    const recuo = /^\s*/.exec(linhas[i])[0].length;
    let relogio = false;
    let tag = null;
    for (let j = i + 1; j < linhas.length; j++) {
      const r = /^\s*/.exec(linhas[j])[0].length;
      if (linhas[j].trim() === '' || r <= recuo) break;
      if (/^\s+Alarm clock:/.test(linhas[j])) relogio = true;
      const t = /^\s+tag=(\S+)/.exec(linhas[j]);
      if (t) tag = t[1];
    }
    alarmes.push({ tipo: m[1], quandoMs: Number(m[3]), relogio, tag, ref: m[2] });
  }
  // O mesmo alarme aparece de novo no "Next wake from idle" (sem o tipo #n,
  // mas por garantia a lista é filtrada pela referência).
  const vistos = new Set();
  return alarmes
    .filter((a) => (vistos.has(a.ref) ? false : vistos.add(a.ref)))
    .map(({ ref, ...a }) => a)
    .sort((a, b) => a.quandoMs - b.quandoMs);
}

const extra = (bloco, chave) => {
  const m = new RegExp(`^\\s+${chave.replaceAll('.', '\\.')}=(\\w+) \\((.*)\\)$`, 'm').exec(bloco);
  if (!m) return undefined;
  if (m[1] === 'Boolean') return m[2] === 'true';
  if (m[1] === 'Long' || m[1] === 'Integer') return Number(m[2]);
  return m[2];
};

/**
 * As notificações ativas do pacote no `dumpsys notification --noredact`:
 * `{ tag, id, chave, canal, flags, icone, quando, titulo, texto, cronometro,
 * contagemRegressiva, importancia, postadoMs, atualizadoMs, som }`. `icone` é
 * o id do recurso (`0x7f...`); `postadoMs` é o `mCreationTimeMs` do registro
 * (relógio de parede, o `postTime` da primeira postagem), `atualizadoMs` o
 * `mUpdateTimeMs` e `som` o `mSound` (o do canal, A12).
 */
export function notificacoesDoPacote(dump, pacote) {
  const partes = dump.split(/\n(?=\s+NotificationRecord\()/);
  const vistas = new Set();
  const lista = [];
  for (const bloco of partes) {
    const cab = /^\s+NotificationRecord\(0x\w+: pkg=(\S+) user=\S+ id=(-?\d+) tag=(\S+) importance=(-?\d+) key=(\S+): Notification\(channel=(\S+) .*? flags=(\S+)/m.exec(bloco);
    if (!cab || cab[1] !== pacote || vistas.has(cab[5])) continue;
    vistas.add(cab[5]);
    // Só o registro, sem o que vier depois dele no dump.
    const corpo = bloco.split(/\n\s*\n/)[0];
    lista.push({
      tag: cab[3] === 'null' ? null : cab[3],
      id: Number(cab[2]),
      chave: cab[5],
      importancia: Number(cab[4]),
      canal: cab[6],
      flags: cab[7].split('|'),
      icone: /^\s+icon=Icon\(typ=RESOURCE pkg=\S+ id=(0x[0-9a-f]+)\)/m.exec(corpo)?.[1] ?? null,
      quando: Number(/^\s+when=(\d+)/m.exec(corpo)?.[1] ?? NaN),
      titulo: extra(corpo, 'android.title') ?? null,
      texto: extra(corpo, 'android.text') ?? null,
      cronometro: extra(corpo, 'android.showChronometer') ?? false,
      contagemRegressiva: extra(corpo, 'android.chronometerCountDown') ?? false,
      postadoMs: Number(/^\s+mCreationTimeMs=(\d+)/m.exec(bloco)?.[1] ?? NaN),
      atualizadoMs: Number(/^\s+mUpdateTimeMs=(\d+)/m.exec(bloco)?.[1] ?? NaN),
      som: /^\s+mSound=\s*(\S+)/m.exec(bloco)?.[1] ?? null,
    });
  }
  return lista;
}

const desescapar = (s) =>
  s
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&#10;', '\n')
    .replaceAll('&amp;', '&');

/** A agenda gravada pelo plugin (`shared_prefs/tomatito-android.xml`), ou `null` sem ela. */
export function agendaGravada(xml) {
  const m = /<string name="agenda">([^]*?)<\/string>/.exec(xml ?? '');
  return m ? JSON.parse(desescapar(m[1])) : null;
}

/**
 * Os efeitos de som do `dumpsys notification`: `mSoundNotificationKey` (a
 * chave do último aviso que tocou, ou `null`), `mZenMode` e
 * `mDisableNotificationEffects` (A02: o `audiblyAlerted` não aparece no dump).
 */
export function efeitosDeSom(dump) {
  const chave = /^\s+mSoundNotificationKey=(\S+)/m.exec(dump)?.[1] ?? null;
  return {
    somDoUltimo: chave === 'null' ? null : chave,
    zen: /^\s+mZenMode=(\S+)/m.exec(dump)?.[1] ?? null,
    efeitosDesligados: /^\s+mDisableNotificationEffects=(\S+)/m.exec(dump)?.[1] === 'true',
  };
}

/** O `mState` do `dumpsys deviceidle` (ACTIVE, IDLE, ...). */
export function estadoDoDoze(dump) {
  return /^\s+mState=(\S+)/m.exec(dump)?.[1] ?? null;
}

/** Lê o aparelho inteiro de uma vez. */
export function ler(adb, pacote) {
  const prefs = adb.solto(['-s', adb.serial, 'shell', 'run-as', pacote, 'cat', 'shared_prefs/tomatito-android.xml']);
  const xml = prefs.status === 0 ? prefs.stdout : null;
  const pid = adb.solto(['-s', adb.serial, 'shell', 'pidof', pacote]).stdout.trim();
  return {
    pacote,
    agoraMs: Number(adb.shell('date +%s%3N')),
    pid: /^\d+$/.test(pid) ? Number(pid) : null,
    alarmes: alarmesDoPacote(adb.shell('dumpsys alarm'), pacote),
    notificacoes: notificacoesDoPacote(adb.shell('dumpsys notification --noredact'), pacote),
    agendaGravada: agendaGravada(xml),
    xmlDasPreferencias: xml,
    doze: estadoDoDoze(adb.shell('dumpsys deviceidle')),
    logcat: adb(['logcat', '-d', '-s', 'tomatito:*'])
      .split('\n')
      .filter((l) => /\bI tomatito|\bW tomatito|\bE tomatito/.test(l)),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const env = carregarAmbiente();
  const adb = criarAdb(env);
  adb.serial = env.ANDROID_SERIAL;
  const i = process.argv.indexOf('--pacote');
  const pacote = i > 0 ? process.argv[i + 1] : process.env.TT_PACOTE || PACOTE_DEBUG;
  console.log(JSON.stringify(ler(adb, pacote), null, 2));
}
