#!/usr/bin/env node
// Os comandos do plugin tomatito-android que abrem outra tela ou tocam
// (PLANO-ANDROID 4.2, A07b), no emulador de pé e com o build de depuração
// instalado:
//
//   node scripts/android/comandos.mjs
//
// Começa do zero (`pm clear`: nenhuma permissão, nenhuma preferência) e, por
// CDP e adb, confere:
//  1. abrir_url('https://example.org') resolve, o `dumpsys activity
//     activities` mostra um ACTION_VIEW com esse endereço numa tarefa que não
//     é a do app (o navegador) e a WebView do app continua no mesmo
//     `location.href` (não navegou para fora); o app volta com o mesmo pid;
//  2. abrir_url recusa `javascript:`, `file:` e endereço relativo;
//  3. abrir_config_avisos resolve com `{ tela: 'AVISOS_DO_APP' }` e abre a
//     tela de avisos do app (APP_NOTIFICATION_SETTINGS);
//  4. pedir_notificacoes mostra o pedido do sistema; com "Permitir" tocado,
//     resolve com `notificacoes: 'granted'`, e o `permissoes` concorda;
//  5. tocar recusa um som desconhecido e toca `focusEnd` (os WAV em res/raw
//     são do A08; o som tocado é conferido pelo canais.mjs).
// Imprime um JSON com cada conferência e sai 1 se alguma falhou.
import { conectar } from './cdp.mjs';
import { abrir, esperarPid, PACOTE_DEBUG } from './instalar.mjs';
import { carregarAmbiente, criarAdb, esperar } from './lib/ambiente.mjs';

const env = carregarAmbiente();
const adb = criarAdb(env);
adb.serial = env.ANDROID_SERIAL;
const pacote = process.env.TT_PACOTE || PACOTE_DEBUG;
const plugin = (c) => `plugin:tomatito-android|${c}`;

const resultados = [];
const conferir = (nome, ok, detalhe) => {
  resultados.push({ nome, ok: Boolean(ok), detalhe });
};

// O erro de um invoke recusado (a mensagem do reject da Kotlin), ou null.
async function recusa(cdp, cmd, args) {
  return cdp.avaliar(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args)})
    .then(() => null, (e) => String(e?.message ?? e))`);
}

// As linhas de Intent do dumpsys de atividades, a tarefa do topo e o pid.
function atividades() {
  return adb.shell('dumpsys activity activities');
}
const topo = () => /topResumedActivity=ActivityRecord\{\S+ \S+ (\S+)/.exec(atividades())?.[1] ?? '';

async function voltarAoApp(pid) {
  abrir(adb, pacote);
  await esperar(1500);
  const agora = await esperarPid(adb, pacote);
  return { mesmoPid: agora === pid, topo: topo() };
}

// O Chrome do AVD abre a primeira vez na tela de boas-vindas, que troca a
// Intent do topo da tarefa dele e esconde o ACTION_VIEW. As linhas de comando
// do Chrome (só valem com ele marcado como app de depuração) pulam essa tela.
function chromeSemBoasVindas() {
  adb.shell('am set-debug-app --persistent com.android.chrome');
  adb.shell("echo '_ --disable-fre --no-default-browser-check --no-first-run' > /data/local/tmp/chrome-command-line");
  adb.shell('am force-stop com.android.chrome');
}

async function principal() {
  chromeSemBoasVindas();
  adb(['shell', 'logcat', '-c']);
  adb(['shell', 'pm', 'clear', pacote]);
  abrir(adb, pacote);
  const pid = await esperarPid(adb, pacote);
  let cdp = await conectar({ pacote });
  try {
    // 1. abrir_url
    const antes = await cdp.avaliar('location.href');
    const r1 = await recusa(cdp, plugin('abrir_url'), { url: 'https://example.org' });
    await esperar(3000);
    const dump = atividades();
    const linhaView = dump.split('\n').find((l) => l.includes('act=android.intent.action.VIEW') && l.includes('dat=https://example.org'));
    const top = topo();
    conferir('abrir_url resolve', r1 === null, r1);
    conferir('dumpsys: ACTION_VIEW para https://example.org', Boolean(linhaView), linhaView?.trim());
    const inicio = adb.shell('logcat -d -s ActivityTaskManager:I').split('\n')
      .find((l) => l.includes('START') && l.includes('act=android.intent.action.VIEW') && l.includes('example.org'));
    conferir('logcat: START do ACTION_VIEW', Boolean(inicio), inicio?.trim());
    conferir('o topo é outro app (o navegador)', top && !top.startsWith(pacote), top);
    const depois = await cdp.avaliar('location.href');
    conferir('a WebView não navegou (location.href igual)', depois === antes, { antes, depois });
    const volta = await voltarAoApp(pid);
    conferir('o app volta com o mesmo pid', volta.mesmoPid && volta.topo.startsWith(pacote), volta);

    // 2. recusas do abrir_url
    for (const url of ['javascript:alert(1)', 'file:///sdcard/x', '/privacidade']) {
      const e = await recusa(cdp, plugin('abrir_url'), { url });
      conferir(`abrir_url recusa ${url}`, e?.includes('url recusada'), e);
    }
    conferir('ainda no app depois das recusas', topo().startsWith(pacote), topo());

    // 3. abrir_config_avisos
    const tela = await cdp.avaliar(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(plugin('abrir_config_avisos'))})`);
    await esperar(2500);
    const dumpAvisos = atividades();
    const linhaAvisos = dumpAvisos.split('\n').find((l) => l.includes('act=android.settings.APP_NOTIFICATION_SETTINGS'));
    conferir('abrir_config_avisos resolve com AVISOS_DO_APP', tela?.tela === 'AVISOS_DO_APP', tela);
    conferir('dumpsys: APP_NOTIFICATION_SETTINGS', Boolean(linhaAvisos), linhaAvisos?.trim());
    conferir('o topo são as configurações', topo().startsWith('com.android.settings'), topo());
    const volta2 = await voltarAoApp(pid);
    conferir('o app volta das configurações com o mesmo pid', volta2.mesmoPid, volta2);

    // 4. pedir_notificacoes
    const p0 = await cdp.invoke(plugin('permissoes'));
    conferir('permissoes antes: prompt', p0?.notificacoes === 'prompt' && p0?.sdk === 37, p0);
    await cdp.avaliar(`(window.__ttPedido = window.__TAURI_INTERNALS__.invoke(${JSON.stringify(plugin('pedir_notificacoes'))}), true)`);
    await esperar(2500);
    const topoPedido = topo();
    conferir('o pedido do sistema aparece', topoPedido.includes('permissioncontroller') || topoPedido.includes('GrantPermissions'), topoPedido);
    const botao = await tocarNoBotao('permission_allow_button');
    conferir('"Permitir" tocado', botao, botao);
    const p1 = await cdp.avaliar('window.__ttPedido');
    conferir('pedir_notificacoes resolve com granted', p1?.notificacoes === 'granted', p1);
    const p2 = await cdp.invoke(plugin('permissoes'));
    conferir('permissoes depois: granted', p2?.notificacoes === 'granted', p2);
    const p3 = await cdp.invoke(plugin('pedir_notificacoes'));
    conferir('pedir de novo não mostra nada e devolve granted', p3?.notificacoes === 'granted' && topo().startsWith(pacote), p3);

    // 5. tocar
    const t1 = await recusa(cdp, plugin('tocar'), { som: 'nenhum' });
    conferir('tocar recusa som desconhecido', t1?.includes('som desconhecido'), t1);
    const t2 = await recusa(cdp, plugin('tocar'), { som: 'focusEnd' });
    conferir('tocar focusEnd resolve', t2 === null, t2);
    conferir('o mesmo pid do começo ao fim', (await esperarPid(adb, pacote)) === pid, pid);
  } finally {
    await cdp.fechar();
  }
}

// Toca no botão do diálogo de permissão pelo id do recurso (uiautomator).
async function tocarNoBotao(id) {
  for (let i = 0; i < 5; i++) {
    adb.shell('uiautomator dump /sdcard/tt-ui.xml');
    const xml = adb.shell('cat /sdcard/tt-ui.xml');
    const no = new RegExp(`resource-id="[^"]*:id/${id}"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`).exec(xml);
    if (no) {
      const [x1, y1, x2, y2] = no.slice(1).map(Number);
      adb.shell(`input tap ${Math.round((x1 + x2) / 2)} ${Math.round((y1 + y2) / 2)}`);
      await esperar(1500);
      return `${id} em ${x1},${y1}`;
    }
    await esperar(1000);
  }
  return null;
}

try {
  await principal();
} catch (e) {
  conferir('roteiro sem exceção', false, String(e?.stack ?? e));
}
const falhas = resultados.filter((r) => !r.ok);
console.log(JSON.stringify({ ok: falhas.length === 0, total: resultados.length, falhas: falhas.length, resultados }, null, 2));
process.exit(falhas.length ? 1 : 0);
