// Fumaça do pacote de release no emulador (PLANO-ANDROID; A20):
//
//   node scripts/android/fumaca-release.mjs [--avd tt37|tt37k]
//
// Instala o AAB assinado (instalar.mjs --release, bundletool), abre o app e,
// sem CDP (o release não é depurável), por toques e pelos registros do
// sistema:
// 1. o app abre (pid, sem FATAL) e a tela Foco está pintada (o botão creme
//    "Iniciar sessão de foco" no lugar, pelo pixel da captura);
// 2. o toque no botão começa a sessão: alarme exato do pacote no
//    `dumpsys alarm` (com AlarmClockInfo) e a notificação contínua;
// 3. HOME, tela apagada e Doze forçado; com o relógio do aparelho posto 3 s
//    antes do fim (adb root + date), o aviso de fim chega até 5 s depois do
//    instante agendado, pelo FimReceiver (que o R8 não pode ter quebrado);
// 4. logcat sem FATAL EXCEPTION, panicked nem ClassNotFoundException.
// O relógio volta ao do host no fim. Sai 1 se algo falhou.
//
// Em vez da sessão de 5 min por toques nas Configurações (o plano), o relógio
// do aparelho é adiantado até o fim da primeira fase: confere o mesmo caminho
// (alarme exato → receiver → aviso) sem depender de coordenadas de várias telas.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ATIVIDADE, PACOTE, esperarPid } from './instalar.mjs';
import { pixel } from './barras.mjs';
import { carregarAmbiente, criarAdb, esperar } from './lib/ambiente.mjs';
import { ler } from './painel.mjs';

const avd = process.argv.includes('--avd') ? process.argv[process.argv.indexOf('--avd') + 1] : 'tt37';
const AQUI = fileURLToPath(new URL('.', import.meta.url));
const no = (script, args = []) => execFileSync(process.execPath, [`${AQUI}${script}`, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });

no('emulador.mjs', ['parar']);
no('emulador.mjs', ['subir', '--avd', avd]);
const env = carregarAmbiente();
const adb = criarAdb(env);
adb.serial = env.ANDROID_SERIAL;
const resultados = [];
const conferir = (nome, ok, detalhe) => resultados.push({ nome, ok: Boolean(ok), detalhe });
const painel = () => ler(adb, PACOTE);
const semFalha = (log) => !/FATAL EXCEPTION|panicked|ClassNotFoundException|NoSuchMethodError/.test(log);
const agora = () => Number(adb.shell('date +%s%3N'));

try {
  adb.solto(['-s', env.ANDROID_SERIAL, 'uninstall', PACOTE]);
  no('instalar.mjs', ['--release']);
  adb(['shell', 'pm', 'grant', PACOTE, 'android.permission.POST_NOTIFICATIONS']);
  adb(['logcat', '-c']);
  adb(['shell', 'am', 'start', '-n', `${PACOTE}/${ATIVIDADE}`]);
  const pid = await esperarPid(adb, PACOTE);
  await esperar(7000);

  // 1. A tela Foco pintada: o botão creme (#FFF4EE) e o fundo do Lite (#A5342B).
  const [, w, h] = adb.shell('wm size').match(/(\d+)x(\d+)/).map(Number);
  const png = adb(['exec-out', 'screencap', '-p'], { encoding: 'buffer' });
  writeFileSync(fileURLToPath(new URL(`../../docs/android/capturas/a20-release-${avd}.png`, import.meta.url)), png);
  const bruto = adb(['exec-out', 'screencap'], { encoding: 'buffer' });
  const botao = [Math.round(w * 0.36), Math.round((h * 373) / 640)];
  const corDoBotao = pixel(bruto, botao[0], botao[1]);
  const corDoFundo = pixel(bruto, Math.round(w * 0.02), Math.round(h * 0.5));
  const creme = corDoBotao.every((c, i) => Math.abs(c - [255, 244, 238][i]) <= 12);
  const vermelho = corDoFundo[0] > 140 && corDoFundo[1] < 90 && corDoFundo[2] < 90;
  conferir('o app de release abre e a tela Foco está pintada (botão creme sobre o Lite)', pid && creme && vermelho, { pid, corDoBotao, corDoFundo });

  // 2. Iniciar por toque.
  adb(['shell', 'input', 'tap', String(Math.round(w / 2)), String(botao[1])]);
  await esperar(3000);
  const p1 = painel();
  const exatos = p1.alarmes.filter((a) => a.relogio);
  conferir('o toque em "Iniciar sessão de foco" agenda o fim como alarme exato (AlarmClockInfo)', exatos.length >= 1, p1.alarmes);
  conferir('a notificação contínua da sessão está de pé', p1.notificacoes.some((n) => n.flags.includes('ONGOING_EVENT') || n.cronometro), p1.notificacoes.map((n) => ({ canal: n.canal, flags: n.flags })));

  // 3. Segundo plano, tela apagada, Doze, e o relógio perto do fim.
  const fim = exatos[0]?.quandoMs;
  adb(['shell', 'input', 'keyevent', 'KEYCODE_HOME']);
  await esperar(1000);
  adb(['shell', 'input', 'keyevent', 'KEYCODE_SLEEP']);
  adb.solto(['-s', env.ANDROID_SERIAL, 'shell', 'dumpsys', 'deviceidle', 'force-idle']);
  adb.solto(['-s', env.ANDROID_SERIAL, 'root']);
  await esperar(3000);
  adb.shell('settings put global auto_time 0');
  if (fim) adb.shell(`date @${Math.floor(fim / 1000) - 3}`);
  let aviso = null;
  for (let i = 0; i < 40 && !aviso; i++) {
    await esperar(500);
    aviso = painel().notificacoes.find((n) => /^fim/.test(n.canal)) ?? null;
  }
  conferir(
    'com a tela apagada e em Doze, o aviso de fim chega até 5 s depois do instante agendado',
    aviso && fim && aviso.postadoMs - fim <= 5000 && aviso.postadoMs - fim >= -1000,
    { fim, aviso: aviso && { canal: aviso.canal, postadoMs: aviso.postadoMs, atrasoMs: aviso.postadoMs - fim, titulo: aviso.titulo }, agora: agora() },
  );
  conferir('logcat sem FATAL EXCEPTION, panicked nem classe faltando (R8)', semFalha(adb(['logcat', '-d'])));
} finally {
  adb.solto(['-s', env.ANDROID_SERIAL, 'shell', `date @${Math.floor(Date.now() / 1000)}`]);
  adb.solto(['-s', env.ANDROID_SERIAL, 'shell', 'settings put global auto_time 1']);
  adb.solto(['-s', env.ANDROID_SERIAL, 'shell', 'dumpsys', 'deviceidle', 'unforce']);
  adb.solto(['-s', env.ANDROID_SERIAL, 'unroot']);
}
const falhas = resultados.filter((r) => !r.ok);
console.log(JSON.stringify({ ok: falhas.length === 0, avd, total: resultados.length, falhas: falhas.length, resultados }, null, 2));
process.exit(falhas.length ? 1 : 0);
