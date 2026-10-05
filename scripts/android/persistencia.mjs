// Persistência, retomada e virada do dia (PLANO-ANDROID; A14), no tt37 com o
// build de depuração instalado:
//
//   node scripts/android/persistencia.mjs
//
// 1. Arquivos: settings.json, state.json e stats.sqlite na pasta do app.
// 2. Tema: trocar para o Escuro, matar o app (`am kill`, em segundo plano) e
//    reabrir mantém o tema.
// 3. Retomada: sessão correndo (receita da seção 6) → HOME → `am kill` →
//    reabrir: o fim da fase é o mesmo (±1 s) e a agenda no `dumpsys alarm`
//    volta igual (os mesmos instantes, exatos).
// 4. Virada do dia: com um bloco de 1 min concluído, o "hoje" do stats_get o
//    conta; com o relógio do aparelho no dia seguinte (adb root + date), ele
//    passa para o "ontem". O relógio volta ao do host no fim.
// O modo Sistema (cmd uimode night) é do `barras.mjs`. Imprime um JSON e sai 1
// se algo falhou. Nunca usa `force-stop` (apagaria os alarmes).
import { conectar } from './cdp.mjs';
import { abrir, esperarPid, PACOTE_DEBUG } from './instalar.mjs';
import { carregarAmbiente, criarAdb, esperar } from './lib/ambiente.mjs';
import { ler } from './painel.mjs';

const env = carregarAmbiente();
const adb = criarAdb(env);
adb.serial = env.ANDROID_SERIAL;
const pacote = process.env.TT_PACOTE || PACOTE_DEBUG;
const resultados = [];
const conferir = (nome, ok, detalhe) => resultados.push({ nome, ok: Boolean(ok), detalhe });
const pid = () => adb.solto(['-s', env.ANDROID_SERIAL, 'shell', 'pidof', pacote]).stdout?.trim() ?? '';
const painel = () => ler(adb, pacote);

async function comCdp(fn) {
  const cdp = await conectar({ pacote });
  try {
    return await fn(cdp);
  } finally {
    await cdp.fechar();
  }
}
async function abrirEsperar() {
  abrir(adb, pacote);
  const p = await esperarPid(adb, pacote);
  if (!p) throw new Error('o app não abriu');
  await esperar(2500);
  return p;
}
/** HOME, `am kill` (só mata em segundo plano) e espera o processo sumir. */
async function matarEmSegundoPlano() {
  const antes = pid();
  adb(['shell', 'input', 'keyevent', 'KEYCODE_HOME']);
  await esperar(1500);
  adb(['shell', 'am', 'kill', pacote]);
  for (let i = 0; i < 20 && pid() === antes; i++) await esperar(300);
  return { antes, depois: pid() };
}

try {
  await abrirEsperar();

  // 1. Arquivos.
  await comCdp((cdp) => cdp.invoke('settings_set', { patch: { theme: 'lite' } }));
  const arquivos = adb.shell(`run-as ${pacote} sh -c 'ls files 2>/dev/null; ls . 2>/dev/null'`).split(/\s+/);
  const achados = adb.shell(`run-as ${pacote} sh -c 'find . -maxdepth 3 -name settings.json -o -maxdepth 3 -name state.json -o -maxdepth 3 -name stats.sqlite'`).split(/\s+/).filter(Boolean);
  conferir(
    'settings.json, state.json e stats.sqlite na pasta do app',
    ['settings.json', 'state.json', 'stats.sqlite'].every((n) => achados.some((a) => a.endsWith(n))),
    { achados, arquivos: arquivos.slice(0, 12) },
  );

  // 2. Tema.
  await comCdp(async (cdp) => {
    await cdp.invoke('settings_set', { patch: { theme: 'dark' } });
    await esperar(600);
  });
  const m1 = await matarEmSegundoPlano();
  await abrirEsperar();
  const tema = await comCdp((cdp) => cdp.avaliar(`({ tema: document.documentElement.dataset.theme, pref: document.documentElement.dataset.themePref })`));
  conferir('trocar o tema e reabrir (app morto pelo sistema) mantém o tema', m1.depois !== m1.antes && tema.tema === 'dark' && tema.pref === 'dark', { m1, tema });
  await comCdp((cdp) => cdp.invoke('settings_set', { patch: { theme: 'lite' } }));

  // 3. Retomada.
  const antes = await comCdp(async (cdp) => {
    await cdp.invoke('settings_set', { patch: { focusMinutes: 1, breakMinutes: 1 } });
    await cdp.invoke('focus_start', { minutes: 3 });
    await esperar(1500);
    return (await cdp.invoke('get_state')).focus;
  });
  const inicio = Date.now();
  const alarmesAntes = painel().alarmes.map((a) => ({ quandoMs: a.quandoMs, relogio: a.relogio }));
  const m2 = await matarEmSegundoPlano();
  await esperar(800);
  const semApp = painel().alarmes.length;
  await abrirEsperar();
  const depois = await comCdp(async (cdp) => (await cdp.invoke('get_state')).focus);
  await esperar(1500);
  const alarmesDepois = painel().alarmes.map((a) => ({ quandoMs: a.quandoMs, relogio: a.relogio }));
  conferir(
    'retomada: depois do `am kill`, a mesma fase com o mesmo fim (±1 s)',
    m2.depois !== m2.antes && depois.session && antes.session && depois.session.phaseIndex === antes.session.phaseIndex &&
      Math.abs(depois.session.endsAt - antes.session.endsAt) <= 1000,
    { m2, antes: antes.session, depois: depois.session },
  );
  conferir(
    'retomada: a agenda no `dumpsys alarm` igual à de antes (mesmos instantes, exatos)',
    alarmesAntes.length === 3 && alarmesDepois.length === alarmesAntes.length &&
      alarmesDepois.every((a, i) => Math.abs(a.quandoMs - alarmesAntes[i].quandoMs) <= 1000 && a.relogio),
    { alarmesAntes, semApp, alarmesDepois },
  );

  // 4. Virada do dia: espera o primeiro bloco (1 min) terminar.
  const falta = Math.max(0, antes.session.endsAt - Number(adb.shell('date +%s%3N'))) + 2500;
  await esperar(Math.min(falta, 75_000));
  const hoje = await comCdp(async (cdp) => {
    await cdp.invoke('focus_stop');
    return cdp.invoke('stats_get');
  });
  conferir('o bloco de 1 min concluído entra no "hoje" do stats_get', hoje.todayS >= 60 || hoje.today_s >= 60, hoje);
  const dataDoAparelho = adb.shell('date +%F');
  adb.solto(['-s', env.ANDROID_SERIAL, 'root']);
  await esperar(3000);
  adb.shell('settings put global auto_time 0');
  // O dia seguinte, 00:01, no fuso do aparelho.
  const amanha = adb.shell(`date -d "${dataDoAparelho} 23:59:30" +%s 2>/dev/null`) || '';
  const epocaBase = Number(amanha) || Math.floor(Date.now() / 1000);
  adb.shell(`date @${epocaBase}`); // 23:59:30 do mesmo dia
  await esperar(1500);
  const antesDaMeiaNoite = await comCdp((cdp) => cdp.invoke('stats_get'));
  adb.shell(`date @${epocaBase + 120}`); // 00:01:30 do dia seguinte
  await esperar(1500);
  const depoisDaMeiaNoite = await comCdp((cdp) => cdp.invoke('stats_get'));
  const dataNova = adb.shell('date +%F');
  const t = (s) => s.todayS ?? s.today_s;
  const o = (s) => s.yesterdayS ?? s.yesterday_s;
  conferir(
    'virada do dia: às 23:59 ainda é "hoje"; às 00:01 o bloco passa para o "ontem"',
    t(antesDaMeiaNoite) >= 60 && t(depoisDaMeiaNoite) === 0 && o(depoisDaMeiaNoite) >= 60 && dataNova !== dataDoAparelho,
    { dataDoAparelho, dataNova, antesDaMeiaNoite, depoisDaMeiaNoite },
  );
} finally {
  // O relógio de volta ao do host, e a rede acertando sozinha de novo.
  adb.solto(['-s', env.ANDROID_SERIAL, 'shell', `date @${Math.floor(Date.now() / 1000)}`]);
  adb.solto(['-s', env.ANDROID_SERIAL, 'shell', 'settings put global auto_time 1']);
  adb.solto(['-s', env.ANDROID_SERIAL, 'unroot']);
  await esperar(2500);
  try {
    await comCdp(async (cdp) => {
      await cdp.invoke('focus_stop').catch(() => {});
      await cdp.invoke('settings_set', { patch: { focusMinutes: 25, breakMinutes: 5, theme: 'lite' } });
    });
  } catch {
    /* o app pode não estar de pé */
  }
}
const falhas = resultados.filter((r) => !r.ok);
console.log(JSON.stringify({ ok: falhas.length === 0, total: resultados.length, falhas: falhas.length, resultados }, null, 2));
process.exit(falhas.length ? 1 : 0);
