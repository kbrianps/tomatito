#!/usr/bin/env node
// Emulador Android sem janela (PLANO-ANDROID, A02 e 6).
//
//   node scripts/android/emulador.mjs subir [--avd tt37|tt31|tt37k] [--com-audio]
//   node scripts/android/emulador.mjs parar
//   node scripts/android/emulador.mjs estado
//
// subir: confere o KVM (ambiente.sh --emulador), sobe o AVD (tt37 por padrão)
// sem janela, sem animação de boot, com 2 GB (as imagens do Android 17 sobem
// para 4 GB por conta própria) e sem gravar snapshot (toda partida é a frio),
// espera o adb e o sys.boot_completed = 1 (limite de 180 s contados do
// lançamento), reinicia uma vez se o aparelho subiu com os efeitos de
// notificação desligados (primeira partida de um AVD novo), desliga as
// animações e o "notification cooldown" do Android 15+ e fixa o fuso do
// usuário (America/Sao_Paulo). Sai 0 com o emulador de pé; qualquer falha
// derruba o que subiu e sai 1. --com-audio troca o -no-audio por -audio none
// (o aparelho tem placa de som, e o host joga a saída fora). O -no-audio não
// esconde o som das notificações (docs/android/kit.md, validação do som).
//
// parar: pede ao emulador que desligue (adb emu kill), espera o processo sair
// (depois SIGTERM e SIGKILL), mata o que sobrar do emulador do kit (netsimd,
// crashpad) e o servidor do adb desta faixa. Sai 0 só se o adb não lista
// aparelho nenhum e não há processo do emulador do kit vivo.
//
// Um emulador por vez (a memória é de 14 GB; 3.2). Tudo o que é mexido aqui é
// só desta faixa: o adb da porta 5041 e processos cujo executável mora em
// $ANDROID_HOME/emulator. O adb do sistema, na 5037, fica intocado.
import { spawn } from 'node:child_process';
import { openSync, readFileSync, readdirSync, readlinkSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { carregarAmbiente, criarAdb, esperar } from './lib/ambiente.mjs';

const AVDS = ['tt37', 'tt31', 'tt37k'];
const LIMITE_BOOT_MS = 180_000;
const FUSO = 'America/Sao_Paulo';

const args = process.argv.slice(2);
const acao = args[0];
const opcao = (nome) => {
  const i = args.indexOf(nome);
  return i >= 0 ? args[i + 1] : undefined;
};

// Processos vivos cujo executável é do emulador do kit (qemu-system-x86_64,
// o lançador, netsimd, crashpad_handler).
function processosDoEmulador(env) {
  const raiz = join(env.ANDROID_HOME, 'emulator') + '/';
  const achados = [];
  for (const d of readdirSync('/proc')) {
    if (!/^\d+$/.test(d)) continue;
    let exe;
    try {
      exe = readlinkSync(`/proc/${d}/exe`);
    } catch {
      continue;
    }
    if (exe.startsWith(raiz)) achados.push({ pid: Number(d), exe: exe.slice(raiz.length) });
  }
  return achados;
}

function aparelhos(adb) {
  const r = adb.solto(['devices']);
  return (r.stdout || '')
    .split('\n')
    .slice(1)
    .map((l) => l.trim())
    .filter(Boolean);
}

function lerProp(adb, prop) {
  const r = adb.solto(['-s', adb.serial, 'shell', 'getprop', prop]);
  return r.status === 0 ? r.stdout.trim() : '';
}

async function subir() {
  const avd = opcao('--avd') ?? 'tt37';
  if (!AVDS.includes(avd)) throw new Error(`AVD desconhecido: ${avd} (use ${AVDS.join(', ')})`);
  const env = carregarAmbiente({ emulador: true });
  const adb = criarAdb(env);
  adb.serial = env.ANDROID_SERIAL;

  const vivos = processosDoEmulador(env).filter((p) => p.exe.includes('qemu-system'));
  if (vivos.length) {
    throw new Error(`já há um emulador do kit de pé (pid ${vivos.map((p) => p.pid).join(', ')}); rode "parar" antes`);
  }

  adb.solto(['start-server']);
  const log = join(env.TT_ANDROID, 'logs', `emulador-${avd}.log`);
  const argsEmu = [
    '-avd', avd,
    '-port', env.TT_EMU_PORTA,
    '-no-window',
    '-no-boot-anim',
    '-gpu', 'swiftshader_indirect',
    '-memory', '2048',
    '-no-snapshot-save',
    '-no-metrics',
  ];
  // -no-audio tira a placa de som do aparelho emulado. --com-audio mantém a
  // placa e liga o lado do host ao backend nulo (-audio none): o Android toca
  // de verdade, mas nada sai nas caixas de som da sessão do usuário.
  argsEmu.push(...(args.includes('--com-audio') ? ['-audio', 'none'] : ['-no-audio']));

  const t0 = Date.now();
  const saida = openSync(log, 'w');
  const filho = spawn('emulator', argsEmu, { env, detached: true, stdio: ['ignore', saida, saida] });
  let morreu = null;
  filho.on('exit', (codigo, sinal) => {
    morreu = `emulador saiu (código ${codigo}, sinal ${sinal})`;
  });
  filho.unref();
  writeFileSync(join(env.TT_ANDROID, 'logs', 'emulador.pid'), `${filho.pid}\n`);

  const cauda = () => readFileSync(log, 'utf8').split('\n').slice(-15).join('\n');
  const falhar = async (motivo) => {
    await parar({ silencioso: true });
    throw new Error(`${motivo}\n--- ${log} (fim) ---\n${cauda()}`);
  };

  // adb de pé e boot completo, no mesmo prazo.
  const esperarBoot = async (inicio) => {
    while (Date.now() - inicio < LIMITE_BOOT_MS) {
      if (morreu) return false;
      if (lerProp(adb, 'sys.boot_completed') === '1') return true;
      await esperar(2000);
    }
    return false;
  };
  if (!(await esperarBoot(t0))) return falhar(morreu ?? `sem sys.boot_completed = 1 em ${LIMITE_BOOT_MS / 1000} s`);
  const segundos = ((Date.now() - t0) / 1000).toFixed(1);

  // Primeira partida de um AVD novo: o NotificationManagerService sobe antes
  // de o aparelho ficar "provisionado" e começa com os efeitos de notificação
  // desligados (mDisableNotificationEffects=true: sem som nem vibração até a
  // próxima partida). Visto no tt31 no A02 (docs/android/kit.md, validação do
  // som). Uma reinicialização resolve, e da segunda partida em diante o
  // provisionado já vale desde o início.
  let reinicio = null;
  if (/mDisableNotificationEffects=true/.test(adb.solto(['-s', adb.serial, 'shell', 'dumpsys', 'notification']).stdout || '')) {
    const t1 = Date.now();
    adb.solto(['-s', adb.serial, 'reboot']);
    for (let i = 0; i < 60 && lerProp(adb, 'sys.boot_completed') === '1'; i++) await esperar(500);
    if (!(await esperarBoot(t1))) return falhar(morreu ?? 'sem sys.boot_completed = 1 depois de reiniciar');
    reinicio = Number(((Date.now() - t1) / 1000).toFixed(1));
  }
  const efeitos = adb.solto(['-s', adb.serial, 'shell', 'dumpsys', 'notification']).stdout || '';
  if (/mDisableNotificationEffects=true/.test(efeitos)) return falhar('efeitos de notificação ainda desligados');

  for (const chave of ['window_animation_scale', 'transition_animation_scale', 'animator_duration_scale']) {
    adb.shell(`settings put global ${chave} 0`);
  }
  // Android 15+: o "notification cooldown" abaixa e depois cala os avisos
  // seguidos do mesmo app (no A02, um aviso 30 s depois de outro saiu mudo).
  // As receitas da seção 6 dão fins a cada 60 s; desligado aqui, o som de
  // cada fim é conferível. No 12 (tt31) a chave não existe e não faz nada.
  adb.shell('settings put system notification_cooldown_enabled 0');
  await definirFuso(adb);

  const resumo = {
    avd,
    serial: env.ANDROID_SERIAL,
    boot_s: Number(segundos),
    reinicio_s: reinicio,
    total_s: Number(((Date.now() - t0) / 1000).toFixed(1)),
    sdk: lerProp(adb, 'ro.build.version.sdk'),
    fuso: lerProp(adb, 'persist.sys.timezone'),
    cooldown_de_avisos: adb.shell('settings get system notification_cooldown_enabled'),
    audio: argsEmu.includes('-no-audio') ? 'sem placa (-no-audio)' : 'placa com saída nula (-audio none)',
    log,
  };
  console.log(JSON.stringify(resumo));
  if (resumo.fuso !== FUSO) return falhar(`fuso ficou "${resumo.fuso}", e não ${FUSO}`);
}

// O setprop direto do shell não pode gravar persist.sys.timezone; o serviço
// de alarme pode (é o que o Configurações usa), e o "cmd alarm" do shell
// chama esse serviço.
async function definirFuso(adb) {
  if (lerProp(adb, 'persist.sys.timezone') === FUSO) return;
  adb.solto(['-s', adb.serial, 'shell', 'setprop', 'persist.sys.timezone', FUSO]);
  if (lerProp(adb, 'persist.sys.timezone') === FUSO) return;
  adb.solto(['-s', adb.serial, 'shell', 'cmd', 'alarm', 'set-timezone', FUSO]);
  for (let i = 0; i < 10 && lerProp(adb, 'persist.sys.timezone') !== FUSO; i++) await esperar(500);
}

async function parar({ silencioso = false } = {}) {
  const env = carregarAmbiente();
  const adb = criarAdb(env);
  const log = (...m) => silencioso || console.log(...m);

  const pidArquivo = join(env.TT_ANDROID, 'logs', 'emulador.pid');
  const qemu = () => processosDoEmulador(env).filter((p) => /qemu-system|^emulator$/.test(p.exe));

  if (qemu().length) {
    adb.solto(['-s', env.ANDROID_SERIAL, 'emu', 'kill'], { timeout: 15_000 });
    for (let i = 0; i < 40 && qemu().length; i++) await esperar(500);
  }
  for (const sinal of ['SIGTERM', 'SIGKILL']) {
    const resto = processosDoEmulador(env);
    if (!resto.length) break;
    for (const p of resto) {
      try {
        process.kill(p.pid, sinal);
      } catch {}
    }
    for (let i = 0; i < 20 && processosDoEmulador(env).length; i++) await esperar(250);
  }
  rmSync(pidArquivo, { force: true });

  // adb devices vazio (o servidor desta faixa esquece o emulador quando a
  // porta fecha) e só então o servidor desta faixa sai.
  let lista = aparelhos(adb);
  for (let i = 0; i < 20 && lista.length; i++) {
    await esperar(250);
    lista = aparelhos(adb);
  }
  adb.solto(['kill-server']);
  // O adb grava o caminho do binário do servidor em $HOME/.android/adb.<porta>
  // (48 bytes; não obedece ao ANDROID_USER_HOME). O arquivo da porta desta
  // faixa sai junto com o servidor; o adb.5037 do sistema fica.
  rmSync(join(homedir(), '.android', `adb.${env.ANDROID_ADB_SERVER_PORT}`), { force: true });

  const sobras = processosDoEmulador(env);
  log(JSON.stringify({ aparelhos: lista, processos_do_emulador: sobras }));
  if (!silencioso && (lista.length || sobras.length)) process.exitCode = 1;
}

// Só olha: não sobe o servidor do adb.
function estado() {
  const env = carregarAmbiente();
  console.log(JSON.stringify({ processos_do_emulador: processosDoEmulador(env) }));
}

try {
  if (acao === 'subir') await subir();
  else if (acao === 'parar') await parar();
  else if (acao === 'estado') estado();
  else {
    console.error('uso: emulador.mjs subir [--avd tt37|tt31|tt37k] [--com-audio] | parar | estado');
    process.exitCode = 2;
  }
} catch (e) {
  console.error(`emulador.mjs: ${e.message}`);
  process.exitCode = 1;
}
