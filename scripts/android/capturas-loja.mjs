// Capturas de tela para a Play (PLANO-ANDROID 8.2; A21), no tt37 (1080 × 1920)
// com o build de DEPURAÇÃO instalado (o estado de demonstração entra por CDP):
//
//   node scripts/android/capturas-loja.mjs
//
// Seis telas em docs/android/play/capturas/, 1080 × 1920, PNG de 24 bits sem
// alfa: Foco em preparo, Foco em sessão, Temporizador, Cronômetro com voltas,
// Progresso e tarefas, e Aparência (o tomate em tela cheia ficou para depois).
// Estado de demonstração: tarefas, cerca de 50 min de foco "hoje" (uma sessão
// de 60 min com o relógio do aparelho adiantado fase a fase), temporizador
// correndo e voltas no cronômetro. Barra de status no modo demo do SystemUI
// (10:00, bateria cheia, sem notificações). Confere que nenhum texto das telas
// traz a palavra "Pomodoro". O relógio do aparelho e as configurações voltam ao
// normal no fim.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { conectar } from './cdp.mjs';
import { abrir, esperarPid, PACOTE_DEBUG } from './instalar.mjs';
import { carregarAmbiente, criarAdb, esperar } from './lib/ambiente.mjs';

const PASTA = fileURLToPath(new URL('../../docs/android/play/capturas/', import.meta.url));
const env = carregarAmbiente();
const adb = criarAdb(env);
const pacote = PACOTE_DEBUG;
const s = (cmd) => adb.solto(['-s', env.ANDROID_SERIAL, 'shell', cmd]);
const demo = (extras) => s(`am broadcast -a com.android.systemui.demo ${extras}`);
const textos = [];
const feitas = [];

async function comCdp(fn) {
  const cdp = await conectar({ pacote });
  try {
    return await fn(cdp);
  } finally {
    await cdp.fechar();
  }
}
const ir = (cdp, rota) =>
  cdp.avaliar(`new Promise((ok) => { const t0 = Date.now(); location.hash = '#/${rota}'; const olhar = () => Date.now() - t0 > 300 && location.hash === '#/${rota}' && document.querySelector('.tt-pagina') && !document.querySelector('.tt-rolagem[data-entrando]') ? setTimeout(ok, 500) : setTimeout(olhar, 50); olhar(); })`);
const tema = (cdp, t) => cdp.invoke('settings_set', { patch: { theme: t } }).then(() => esperar(2500)); // a troca de tema e as cores das barras assentam

async function capturar(cdp, nome) {
  textos.push(await cdp.avaliar('document.body.innerText'));
  await esperar(400);
  const png = adb(['exec-out', 'screencap', '-p'], { encoding: 'buffer' });
  const arquivo = `${PASTA}${nome}.png`;
  writeFileSync(arquivo, png);
  // 24 bits, sem alfa.
  execFileSync('python3', ['-c', `from PIL import Image; import sys; Image.open(sys.argv[1]).convert('RGB').save(sys.argv[1], optimize=True)`, arquivo]);
  feitas.push(nome);
}

adb.solto(['-s', env.ANDROID_SERIAL, 'root']);
await esperar(3000);
try {
  // Dados limpos e o relógio do aparelho às 10:00 de hoje.
  s(`pm clear ${pacote}`);
  s(`pm grant ${pacote} android.permission.POST_NOTIFICATIONS`);
  s('settings put global auto_time 0');
  const dez = Number(adb.shell('date -d "$(date +%F) 09:00:00" +%s'));
  s(`date @${dez}`);
  abrir(adb, pacote);
  await esperarPid(adb, pacote);
  await esperar(5000);

  // Cerca de 50 min de foco "hoje": sessão de 60 min (25/5/25/5), fase a fase.
  await comCdp(async (cdp) => {
    await cdp.invoke('settings_set', { patch: { focusMinutes: 25, breakMinutes: 5, theme: 'lite', dailyGoalMinutes: 120 } });
    for (const titulo of ['Revisar Álgebra Linear', 'Lista de exercícios de LFA', 'Ler o capítulo 4']) await cdp.invoke('task_add', { title: titulo });
    await cdp.invoke('focus_start', { minutes: 60 });
  });
  let t = dez;
  for (const minutos of [25, 5, 25, 5]) {
    t += minutos * 60 + 2;
    s(`date @${t}`);
    await esperar(2500);
    await comCdp((cdp) => cdp.invoke('get_state'));
  }
  await comCdp((cdp) => cdp.invoke('focus_stop').catch(() => {}));
  s(`date @${dez + 3600}`); // 10:00
  // Tira os avisos de fim da gaveta e liga o modo demo da barra de status.
  s('cmd notification cancel_all 2>/dev/null; service call notification 1 >/dev/null 2>&1');
  s('settings put global sysui_demo_allowed 1');
  demo('-e command enter');
  demo('-e command clock -e hhmm 1000');
  demo('-e command battery -e level 100 -e plugged false');
  demo('-e command notifications -e visible false');
  demo('-e command network -e wifi show -e level 4 -e mobile show -e datatype none -e level 4');
  await esperar(1500);

  await comCdp(async (cdp) => {
    await cdp.avaliar('location.reload()').catch(() => {});
  });
  await esperar(4000);
  await comCdp(async (cdp) => {
    // 1. Foco em preparo (Lite).
    await ir(cdp, 'foco');
    await capturar(cdp, '1-foco-preparo');
    // 5. Progresso e tarefas (Claro).
    await tema(cdp, 'light');
    await cdp.avaliar(`(document.querySelector('.tt-card.tt-tarefas').scrollIntoView({ block: 'start' }), new Promise((ok) => setTimeout(ok, 500)))`);
    await capturar(cdp, '5-progresso-e-tarefas');
    // 2. Foco em sessão (Escuro).
    await tema(cdp, 'dark');
    await cdp.invoke('focus_start', { minutes: 50 });
    await ir(cdp, 'foco');
    await cdp.avaliar(`(document.querySelector('.tt-rolagem').scrollTop = 0, document.querySelector('.tt-info-bar button:last-child, [data-agora-nao]')?.click(), new Promise((ok) => setTimeout(ok, 700)))`);
    await capturar(cdp, '2-foco-sessao');
    await cdp.invoke('focus_stop');
    // 3. Temporizador (Suave), com um correndo.
    await tema(cdp, 'suave');
    const timers = (await cdp.invoke('get_state')).timers;
    const id = timers.timers?.[1]?.id ?? timers.items?.[1]?.id;
    if (id !== undefined) await cdp.invoke('timer_start', { id });
    await ir(cdp, 'temporizador');
    await esperar(1500);
    await capturar(cdp, '3-temporizador');
    if (id !== undefined) await cdp.invoke('timer_reset', { id });
    // 4. Cronômetro com voltas (Lite).
    await tema(cdp, 'lite');
    await cdp.invoke('stopwatch_reset').catch(() => {});
    await cdp.invoke('stopwatch_start');
    for (const ms of [1300, 900, 1700, 1100]) {
      await esperar(ms);
      await cdp.invoke('stopwatch_lap');
    }
    await ir(cdp, 'cronometro');
    await esperar(800);
    await cdp.invoke('stopwatch_pause');
    await esperar(500);
    await capturar(cdp, '4-cronometro');
    await cdp.invoke('stopwatch_reset');
    // 6. Aparência (Lite).
    await ir(cdp, 'configuracoes');
    await cdp.avaliar(`(document.querySelector('.tt-temas').closest('.tt-config-secao').scrollIntoView({ block: 'start' }), new Promise((ok) => setTimeout(ok, 600)))`);
    await capturar(cdp, '6-aparencia');
  });
} finally {
  demo('-e command exit');
  s(`date @${Math.floor(Date.now() / 1000)}`);
  s('settings put global auto_time 1');
  try {
    await comCdp((cdp) => cdp.invoke('settings_set', { patch: { theme: 'lite' } }));
  } catch { /* sem app */ }
  adb.solto(['-s', env.ANDROID_SERIAL, 'unroot']);
}
const proibida = textos.some((x) => /pomodoro/i.test(x));
console.log(JSON.stringify({ ok: feitas.length === 6 && !proibida, feitas, semPomodoro: !proibida }, null, 2));
process.exit(feitas.length === 6 && !proibida ? 0 : 1);
