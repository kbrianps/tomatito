#!/usr/bin/env node
// Canais e som (PLANO-ANDROID 5.5, A08), no emulador de pé e com o build de
// depuração instalado e aberto:
//
//   node scripts/android/canais.mjs
//
// Confere:
//  1. `dumpsys notification`: os 5 canais do pacote, com a importância (4 =
//     alta, 2 = baixa) e o som esperados (`android.resource://<pacote>/raw/...`
//     pelo nome, ou nenhum);
//  2. o APK: `aapt2 dump resources` lista `raw/focus_end`, `raw/break_end` e
//     `drawable/ic_stat_tomatito`; os dois WAV do APK têm o SHA-256 dos de
//     `src-tauri/sounds/`; a tabela de recursos tem o nome do pacote (é por
//     ele que o sistema acha `.../raw/focus_end`);
//  3. o "Testar" das Configurações, clicado por CDP (o botão chama o
//     `sound_test`, que no Android vai ao `tocar` do plugin): cada clique põe
//     no histórico do `dumpsys audio` um player novo do pacote com
//     `USAGE_NOTIFICATION_EVENT`; o `sound_test` sem som toca os dois;
//  4. `logcat` com o comando `tocar` do plugin e sem `FATAL EXCEPTION` nem
//     `panicked`.
// O emulador sobe sem `--com-audio`: o A02 mostrou que o `-no-audio` não
// esconde os players (docs/android/kit.md). Imprime um JSON com cada
// conferência e sai 1 se alguma falhou.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { conectar } from './cdp.mjs';
import { caminhoApkDebug, esperarPid, PACOTE_DEBUG } from './instalar.mjs';
import { carregarAmbiente, criarAdb, esperar } from './lib/ambiente.mjs';

const env = carregarAmbiente();
const adb = criarAdb(env);
adb.serial = env.ANDROID_SERIAL;
const pacote = process.env.TT_PACOTE || PACOTE_DEBUG;
const SONS = fileURLToPath(new URL('../../src-tauri/sounds/', import.meta.url));

const resultados = [];
const conferir = (nome, ok, detalhe) => {
  resultados.push({ nome, ok: Boolean(ok), detalhe });
};

const esperados = {
  'fim-foco': { importancia: 4, som: 'focus_end' },
  'fim-intervalo': { importancia: 4, som: 'break_end' },
  'fim-temporizador': { importancia: 4, som: 'focus_end' },
  'fim-sem-som': { importancia: 4, som: null },
  sessao: { importancia: 2, som: null },
};

// Os canais do pacote na seção `AppSettings: <pacote> (<uid>)` do dumpsys.
export function canaisDoPacote(dump, pac) {
  const canais = {};
  let dentro = false;
  for (const linha of dump.split('\n')) {
    const cabeca = /^\s*AppSettings: (\S+) /.exec(linha);
    if (cabeca) {
      dentro = cabeca[1] === pac;
      continue;
    }
    if (!dentro) continue;
    const m = /NotificationChannel\{mId='([^']+)'.*?mImportance=(\d+),.*?mSound=([^,]+),/.exec(linha);
    if (m) canais[m[1]] = { importancia: Number(m[2]), som: m[3] === 'null' ? null : m[3] };
  }
  return canais;
}

// Os players do pacote com USAGE_NOTIFICATION_EVENT no histórico do `dumpsys audio`.
export function playersDeTeste(dump, pac) {
  const doPacote = new Set();
  const deTeste = new Set();
  for (const linha of dump.split('\n')) {
    const novo = /new player piid:(\d+) .*package:(\S+)/.exec(linha);
    if (novo && novo[2] === pac) doPacote.add(novo[1]);
    const attr = /player piid:(\d+) new AudioAttributes:.*usage=USAGE_NOTIFICATION_EVENT/.exec(linha);
    if (attr && doPacote.has(attr[1])) deTeste.add(attr[1]);
  }
  return deTeste;
}

const sha = (buf) => createHash('sha256').update(buf).digest('hex');

async function principal() {
  const pid = await esperarPid(adb, pacote);
  if (!pid) throw new Error(`o app ${pacote} não está rodando (node scripts/android/instalar.mjs --abrir)`);

  // 1. Canais.
  const canais = canaisDoPacote(adb.shell('dumpsys notification'), pacote);
  conferir('5 canais do pacote', Object.keys(canais).sort().join() === Object.keys(esperados).sort().join(), Object.keys(canais));
  for (const [id, e] of Object.entries(esperados)) {
    const c = canais[id];
    const som = e.som ? `android.resource://${pacote}/raw/${e.som}` : null;
    conferir(`canal ${id}: importância ${e.importancia}, som ${e.som ?? 'nenhum'}`, c?.importancia === e.importancia && c?.som === som, c);
  }

  // 2. APK.
  const apk = caminhoApkDebug(env);
  const aapt2 = `${env.ANDROID_HOME}/build-tools/37.0.0/aapt2`;
  const recursos = execFileSync(aapt2, ['dump', 'resources', apk], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  for (const r of ['raw/focus_end', 'raw/break_end', 'drawable/ic_stat_tomatito']) {
    conferir(`aapt2 lista ${r}`, new RegExp(`resource 0x[0-9a-f]+ ${r}\\b`).test(recursos));
  }
  const tabela = /Package name=(\S+)/.exec(recursos)?.[1];
  conferir('a tabela de recursos tem o nome do pacote', tabela === pacote, tabela);
  for (const [raw, wav] of [['focus_end', 'focus-end.wav'], ['break_end', 'break-end.wav']]) {
    const noApk = sha(execFileSync('unzip', ['-p', apk, `res/raw/${raw}.wav`], { maxBuffer: 16 * 1024 * 1024 }));
    const fonte = sha(readFileSync(`${SONS}${wav}`));
    conferir(`raw/${raw} com o SHA-256 de src-tauri/sounds/${wav}`, noApk === fonte, { noApk, fonte });
  }

  // 3. "Testar".
  const cdp = await conectar({ pacote });
  const players = () => playersDeTeste(adb.shell('dumpsys audio'), pacote);
  try {
    await cdp.avaliar(`(location.hash = '#/configuracoes', new Promise((r) => setTimeout(r, 800)))`);
    for (const som of ['focusEnd', 'breakEnd']) {
      const antes = players();
      const clicou = await cdp.avaliar(`(() => { const b = document.querySelector('[data-testar="${som}"]'); b?.click(); return Boolean(b); })()`);
      await esperar(1000);
      const novos = [...players()].filter((p) => !antes.has(p));
      conferir(`"Testar" ${som}: um player novo com USAGE_NOTIFICATION_EVENT`, clicou && novos.length === 1, { clicou, novos });
      await esperar(1000);
    }
    const antes = players();
    await cdp.avaliar(`window.__TAURI_INTERNALS__.invoke('sound_test', {})`);
    await esperar(3500);
    const novos = [...players()].filter((p) => !antes.has(p));
    conferir('sound_test sem som: os dois, um depois do outro', novos.length === 2, novos);
    await cdp.avaliar(`location.hash = '#/foco'`);
  } finally {
    await cdp.fechar();
  }

  // 4. logcat.
  const log = adb(['logcat', '-d']);
  conferir('o plugin recebeu o comando tocar', /pluginId: tomatito-android, command: tocar/.test(log));
  conferir('logcat sem FATAL EXCEPTION nem panicked', !/FATAL EXCEPTION|panicked/.test(log));
  conferir('o mesmo pid do começo ao fim', (await esperarPid(adb, pacote)) === pid, pid);
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
