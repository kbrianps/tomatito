#!/usr/bin/env node
// Boot e mudança de permissão (PLANO-ANDROID 5.2, item 5; A10b), no emulador
// de pé e com o build de depuração instalado:
//
//   node scripts/android/reagendar.mjs boot        # tt37
//   node scripts/android/reagendar.mjs permissao   # tt31 (Android 12)
//
// Os dois começam do zero (`pm clear`), abrem o app e, pela receita da seção 6
// (`settings_set` F = B = 1 e `focus_start {minutes: 3}`, por CDP), conferem
// os 3 alarmes exatos do pacote. Depois:
//
// boot: HOME e `adb reboot` uns segundos antes do primeiro fim, que vence com
//   o aparelho desligado. Depois do boot e do desbloqueio (`wm
//   dismiss-keyguard`), o BootReceiver reagenda da agenda gravada, sem abrir o
//   app: em `dumpsys alarm` voltam só os fins que ainda não venceram, exatos
//   (AlarmClockInfo), e a agenda gravada perde os vencidos; nenhum aviso do
//   fim vencido. No fim seguinte, o alarme reagendado posta o aviso dele (o
//   reagendado funciona). Limpeza: abre o app e para a sessão.
// permissao: `appops set ... SCHEDULE_EXACT_ALARM deny` (no Android 12, mata o
//   app e cancela os alarmes exatos; a agenda gravada fica) e depois `allow`:
//   o sistema manda ACTION_SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED e o
//   PermissaoAlarmeReceiver põe os 3 de volta como exatos, nos mesmos
//   instantes. Limpeza: abre o app e para a sessão.
//
// Os dois conferem o `logcat` sem FATAL EXCEPTION nem panicked (antes e
// depois do boot). Imprime um JSON com cada conferência e sai 1 se alguma
// falhou. Nunca usa `force-stop` (apagaria os alarmes, seção 6).
import { pathToFileURL } from 'node:url';
import { conectar } from './cdp.mjs';
import { abrir, esperarPid, PACOTE_DEBUG } from './instalar.mjs';
import { carregarAmbiente, criarAdb, esperar } from './lib/ambiente.mjs';
import { ler } from './painel.mjs';

const env = carregarAmbiente();
const adb = criarAdb(env);
adb.serial = env.ANDROID_SERIAL;
const pacote = process.env.TT_PACOTE || PACOTE_DEBUG;
const modo = process.argv[2];
const TOLERANCIA_MS = 1000;

const resultados = [];
const conferir = (nome, ok, detalhe) => {
  resultados.push({ nome, ok: Boolean(ok), detalhe });
};
const perto = (a, b) => Math.abs(a - b) <= TOLERANCIA_MS;
const painel = () => ler(adb, pacote);
const semFalha = (log) => !/FATAL EXCEPTION|panicked/.test(log);

async function esperarPainel(condicao, limiteMs = 8000) {
  const ate = Date.now() + limiteMs;
  let p = painel();
  while (!condicao(p) && Date.now() < ate) {
    await esperar(300);
    p = painel();
  }
  return p;
}

const mesmosInstantes = (alarmes, fins) => alarmes.length === fins.length && alarmes.every((a, k) => perto(a.quandoMs, fins[k]));

// pm clear, abre, receita da seção 6; devolve os 3 fins e o pid.
async function iniciarSessao() {
  const sdk = Number(adb.shell('getprop ro.build.version.sdk'));
  adb(['shell', 'pm', 'clear', pacote]);
  if (sdk >= 33) adb(['shell', 'pm', 'grant', pacote, 'android.permission.POST_NOTIFICATIONS']);
  adb(['logcat', '-c']);
  abrir(adb, pacote);
  const pid = await esperarPid(adb, pacote);
  if (!pid) throw new Error(`o app ${pacote} não abriu`);
  await esperar(1500);
  const cdp = await conectar({ pacote });
  let focus;
  try {
    await cdp.invoke('settings_set', { patch: { focusMinutes: 1, breakMinutes: 1 } });
    focus = await cdp.invoke('focus_start', { minutes: 3 });
  } finally {
    await cdp.fechar();
  }
  const fim = focus.session.endsAt;
  const fins = Array.from({ length: 3 - focus.session.phaseIndex }, (_, k) => fim + k * 60_000);
  const p = await esperarPainel((x) => x.alarmes.length === fins.length);
  conferir(
    `sessão (receita da seção 6, API ${sdk}): ${fins.length} alarmes exatos nos fins`,
    mesmosInstantes(p.alarmes, fins) && p.alarmes.every((a) => a.tipo === 'RTC_WAKEUP' && a.relogio),
    { alarmes: p.alarmes, fins },
  );
  return { sdk, pid, fins };
}

// Abre o app, para a sessão e confere que os alarmes saíram.
async function limpar() {
  abrir(adb, pacote);
  await esperarPid(adb, pacote);
  await esperar(2000);
  const cdp = await conectar({ pacote });
  try {
    // A sessão pode já ter acabado (o último fim passou): aí não há o que parar.
    await cdp.invoke('focus_stop').catch(() => null);
  } finally {
    await cdp.fechar();
  }
  const p = await esperarPainel((x) => x.alarmes.length === 0);
  conferir('limpeza: 0 alarmes', p.alarmes.length === 0, p.alarmes);
}

async function boot() {
  const { fins } = await iniciarSessao();
  adb(['shell', 'input', 'keyevent', 'KEYCODE_HOME']);
  // Desliga uns segundos antes do primeiro fim: ele vence com o aparelho fora.
  const agora = Number(adb.shell('date +%s%3N'));
  await esperar(Math.max(0, fins[0] - agora - 6000));
  const logAntes = adb(['logcat', '-d']);
  conferir('logcat antes do reboot sem FATAL nem panicked', semFalha(logAntes));
  const tReboot = Number(adb.shell('date +%s%3N'));
  adb(['reboot'], { timeout: 60_000 });
  await esperar(5000);
  adb(['wait-for-device'], { timeout: 180_000 });
  const ate = Date.now() + 180_000;
  while (Date.now() < ate) {
    const r = adb.solto(['-s', adb.serial, 'shell', 'getprop', 'sys.boot_completed']);
    if (r.stdout?.trim() === '1') break;
    await esperar(1000);
  }
  adb.solto(['-s', adb.serial, 'shell', 'wm', 'dismiss-keyguard']);
  await esperarPainel((x) => x.logcat.some((l) => /reagendar \(BOOT\)/.test(l)), 30_000);
  // O painel lê o logcat por último: relê para pegar alarmes e agenda depois do receiver.
  const p = painel();
  const linha = p.logcat.find((l) => /reagendar \(BOOT\)/.test(l));
  const pendentes = fins.filter((f) => f > p.agoraMs);
  const vencidos = fins.filter((f) => f <= p.agoraMs);
  conferir('o BootReceiver rodou depois do boot, sem abrir o app', Boolean(linha), {
    linha,
    bootEmS: Math.round((p.agoraMs - tReboot) / 1000),
  });
  conferir('o primeiro fim venceu com o aparelho desligado, e ainda há fins por vir', vencidos.length >= 1 && pendentes.length >= 1, {
    vencidos,
    pendentes,
  });
  conferir(
    'dumpsys alarm: só os que não venceram voltaram, exatos (AlarmClockInfo)',
    mesmosInstantes(p.alarmes, pendentes) && p.alarmes.every((a) => a.tipo === 'RTC_WAKEUP' && a.relogio),
    { alarmes: p.alarmes, pendentes },
  );
  conferir(
    'a agenda gravada perdeu os vencidos',
    p.agendaGravada?.length === pendentes.length && p.agendaGravada.every((g, k) => perto(g.quandoMs, pendentes[k])),
    p.agendaGravada?.map(({ id, quandoMs }) => ({ id, quandoMs })),
  );
  conferir(
    'os vencidos não geraram aviso (e o log diz que foram descartados)',
    !p.notificacoes.some((n) => n.tag === 'fim') && new RegExp(`${vencidos.length} vencido\\(s\\) descartado`).test(linha ?? ''),
    p.notificacoes,
  );

  // O primeiro reagendado dispara na hora, sem o app aberto.
  await esperar(Math.max(0, pendentes[0] - p.agoraMs) + 3000);
  const d = await esperarPainel((x) => x.notificacoes.some((n) => n.tag === 'fim'), 10_000);
  const avisos = d.notificacoes.filter((n) => n.tag === 'fim');
  conferir(
    'o fim reagendado seguinte postou o aviso na hora, e só ele',
    avisos.length === 1 && perto(avisos[0].quando, pendentes[0]),
    avisos,
  );
  conferir('logcat depois do boot sem FATAL nem panicked', semFalha(adb(['logcat', '-d'])));
  await limpar();
  conferir('logcat final sem FATAL nem panicked', semFalha(adb(['logcat', '-d'])));
}

async function permissao() {
  const { sdk, pid, fins } = await iniciarSessao();
  if (sdk < 31 || sdk > 32) throw new Error(`o roteiro de permissão é do Android 12/12L (tt31); este é API ${sdk}`);
  adb(['shell', 'input', 'keyevent', 'KEYCODE_HOME']);
  await esperar(1000);
  adb(['shell', 'appops', 'set', pacote, 'SCHEDULE_EXACT_ALARM', 'deny']);
  const negado = await esperarPainel((x) => x.alarmes.length === 0 && x.pid !== pid, 15_000);
  conferir('deny: o Android 12 matou o app e cancelou os alarmes exatos', negado.alarmes.length === 0 && negado.pid !== pid, {
    pidAntes: pid,
    pidDepois: negado.pid,
    alarmes: negado.alarmes,
  });
  conferir('deny: a agenda gravada ficou', negado.agendaGravada?.length === fins.length, negado.agendaGravada?.length);
  conferir('logcat até o deny sem FATAL nem panicked', semFalha(adb(['logcat', '-d'])));
  adb(['logcat', '-c']);
  adb(['shell', 'appops', 'set', pacote, 'SCHEDULE_EXACT_ALARM', 'allow']);
  await esperarPainel((x) => x.logcat.some((l) => /reagendar \(PERMISSAO\)/.test(l)), 15_000);
  const p = painel();
  const pendentes = fins.filter((f) => f > p.agoraMs);
  conferir(
    'allow: o PermissaoAlarmeReceiver recebeu o broadcast',
    p.logcat.some((l) => /reagendar \(PERMISSAO\)/.test(l)),
    p.logcat,
  );
  conferir(
    'allow: os alarmes voltaram exatos (AlarmClockInfo), nos mesmos instantes',
    pendentes.length === fins.length && mesmosInstantes(p.alarmes, pendentes) && p.alarmes.every((a) => a.tipo === 'RTC_WAKEUP' && a.relogio),
    { alarmes: p.alarmes, fins },
  );
  conferir('logcat sem FATAL nem panicked', semFalha(adb(['logcat', '-d'])));
  await limpar();
  conferir('logcat final sem FATAL nem panicked', semFalha(adb(['logcat', '-d'])));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const roteiro = { boot, permissao }[modo];
  (roteiro ? roteiro() : Promise.reject(new Error('uso: reagendar.mjs boot|permissao')))
    .catch((e) => conferir('execução', false, String(e?.stack ?? e)))
    .finally(() => {
      const falhas = resultados.filter((r) => !r.ok);
      console.log(JSON.stringify({ ok: falhas.length === 0, modo, resultados }, null, 2));
      process.exitCode = falhas.length ? 1 : 0;
    });
}
