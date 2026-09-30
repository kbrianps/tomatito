#!/usr/bin/env node
// Instala o Tomatito no emulador desta faixa (PLANO-ANDROID, A04 e 6).
//
//   node scripts/android/instalar.mjs [--release] [--apk <arquivo>] [--abrir]
//
// debug (padrão): `adb install -r` do APK de depuração que o
//   `npx tauri android build --debug --apk --target x86_64` deixa em
//   $TT_GRADLE_SAIDAS/app/outputs/apk/universal/debug/ (as saídas do Gradle
//   ficam fora do /home, 7.1; o CLI imprime o caminho padrão dentro do
//   gen/android, que não existe).
// --release: `bundletool build-apks --connected-device` + `install-apks` do AAB
//   de $TT_GRADLE_SAIDAS/app/outputs/bundle/universalRelease/. Os .apks vão
//   para $TT_ANDROID/saidas/apks/. Com a chave de upload (A19), assina com ela;
//   sem, o bundletool usa a chave de depuração padrão.
// --apk: instala esse APK em vez do de depuração.
// --abrir: depois de instalar, abre o app (a MainActivity) e espera o processo.
//
// Imprime, em JSON, o pacote, o arquivo instalado e, com --abrir, o pid.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { carregarAmbiente, criarAdb, esperar } from './lib/ambiente.mjs';

export const PACOTE = 'io.github.kbrianps.tomatito';
export const PACOTE_DEBUG = `${PACOTE}.debug`;
// A MainActivity mora no namespace do app (sem o sufixo .debug).
export const ATIVIDADE = `${PACOTE}.MainActivity`;

export function caminhoApkDebug(env) {
  return join(env.TT_GRADLE_SAIDAS, 'app/outputs/apk/universal/debug/app-universal-debug.apk');
}

export function caminhoAab(env) {
  return join(env.TT_GRADLE_SAIDAS, 'app/outputs/bundle/universalRelease/app-universal-release.aab');
}

// Lê o keystore.properties (7.3) sem depender de shell.
function lerPropriedades(arquivo) {
  const props = {};
  for (const linha of readFileSync(arquivo, 'utf8').split('\n')) {
    const m = /^\s*([\w.]+)\s*=\s*(.*)\s*$/.exec(linha);
    if (m) props[m[1]] = m[2];
  }
  return props;
}

// Espera o processo do app aparecer (pidof), até o limite.
export async function esperarPid(adb, pacote, limiteMs = 30_000) {
  const fim = Date.now() + limiteMs;
  while (Date.now() < fim) {
    const r = adb.solto(['-s', adb.serial, 'shell', 'pidof', pacote]);
    const pid = (r.stdout || '').trim();
    if (r.status === 0 && /^\d+$/.test(pid)) return Number(pid);
    await esperar(500);
  }
  return null;
}

export function abrir(adb, pacote) {
  adb(['shell', 'am', 'start', '-W', '-n', `${pacote}/${ATIVIDADE}`]);
}

async function principal() {
  const args = process.argv.slice(2);
  const release = args.includes('--release');
  const iApk = args.indexOf('--apk');
  const apkPedido = iApk >= 0 ? args[iApk + 1] : undefined;
  const querAbrir = args.includes('--abrir');

  const env = carregarAmbiente();
  const adb = criarAdb(env);
  adb.serial = env.ANDROID_SERIAL;
  if (!(adb.solto(['devices']).stdout || '').includes(`${env.ANDROID_SERIAL}\tdevice`)) {
    throw new Error(`o emulador ${env.ANDROID_SERIAL} não está de pé (node scripts/android/emulador.mjs subir)`);
  }

  let pacote;
  let arquivo;
  if (release) {
    pacote = PACOTE;
    arquivo = caminhoAab(env);
    if (!existsSync(arquivo)) throw new Error(`AAB não encontrado: ${arquivo}`);
    const pasta = join(env.TT_ANDROID, 'saidas/apks');
    mkdirSync(pasta, { recursive: true });
    const apks = join(pasta, 'tomatito-release.apks');
    const assinatura = [];
    const props = env.TOMATITO_KEYSTORE_PROPS || join(homedir(), '.config/tomatito/android/keystore.properties');
    if (existsSync(props)) {
      const p = lerPropriedades(props);
      assinatura.push(`--ks=${p.storeFile}`, `--ks-key-alias=${p.keyAlias}`, `--ks-pass=pass:${p.password}`, `--key-pass=pass:${p.password}`);
    }
    const adbBin = join(env.ANDROID_HOME, 'platform-tools/adb');
    const java = join(env.JAVA_HOME, 'bin/java');
    const opcoes = { env, stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' };
    execFileSync(java, ['-jar', env.BUNDLETOOL, 'build-apks', `--bundle=${arquivo}`, `--output=${apks}`, '--overwrite',
      '--connected-device', `--device-id=${env.ANDROID_SERIAL}`, `--adb=${adbBin}`, ...assinatura], opcoes);
    execFileSync(java, ['-jar', env.BUNDLETOOL, 'install-apks', `--apks=${apks}`,
      `--device-id=${env.ANDROID_SERIAL}`, `--adb=${adbBin}`], opcoes);
  } else {
    pacote = PACOTE_DEBUG;
    arquivo = apkPedido ?? caminhoApkDebug(env);
    if (!existsSync(arquivo)) throw new Error(`APK não encontrado: ${arquivo} (npx tauri android build --debug --apk --target x86_64)`);
    const saida = adb(['install', '-r', arquivo], { timeout: 180_000 });
    if (!/Success/.test(saida)) throw new Error(`adb install falhou: ${saida.trim()}`);
  }

  const resultado = { pacote, arquivo, bytes: statSync(arquivo).size };
  if (querAbrir) {
    abrir(adb, pacote);
    resultado.pid = await esperarPid(adb, pacote);
    if (!resultado.pid) throw new Error(`o app ${pacote} não abriu (sem pid em 30 s)`);
  }
  console.log(JSON.stringify(resultado));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  principal().catch((e) => {
    console.error(`instalar.mjs: ${e.message}`);
    process.exitCode = 1;
  });
}
