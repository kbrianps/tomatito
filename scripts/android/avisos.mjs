#!/usr/bin/env node
// Permissões negadas e o Android 12 (PLANO-ANDROID 4.3, 5.2 e 5.4; A13), no
// emulador de pé e com o build de depuração instalado:
//
//   node scripts/android/avisos.mjs notificacoes   # tt37 (Android 17)
//   node scripts/android/avisos.mjs alarme         # tt31 (Android 12)
//   node scripts/android/avisos.mjs cartao         # tt37 (Android 17)
//
// notificacoes: `pm clear` e abrir: nenhum pedido ao abrir e a faixa da tela
//   Foco escondida (o pedido ainda não saiu). O primeiro "Iniciar" (clique no
//   botão, por CDP) mostra o pedido do sistema; "Permitir" pelo uiautomator.
//   Depois `pm revoke ... POST_NOTIFICATIONS` (o sistema mata o app),
//   reabrir: a faixa aparece; receita da seção 6 com o fim do primeiro bloco
//   passado: nenhuma notificação do pacote (nem a contínua, nem o aviso de
//   fim), o app no mesmo pid e o logcat sem FATAL. `pm grant` e a volta do
//   app para a frente (HOME e abrir: `visibilitychange` de verdade): a faixa
//   some. Limpeza: `focus_stop` e 0 alarmes.
// alarme: o roteiro do A13 em ordem: (1) receita e 3 alarmes exatos; (2)
//   `appops set ... SCHEDULE_EXACT_ALARM deny`: o pid sumiu ou mudou e 0
//   alarmes do pacote; (3) reabrir, parar a sessão retomada e iniciar uma
//   nova: 3 alarmes sem AlarmClockInfo (inexatos) e, nas Configurações, o
//   cartão Avisos com "Os avisos podem atrasar alguns minutos"; (4) `appops
//   set ... allow`: o PermissaoAlarmeReceiver reagenda como exatos, e na
//   volta do app para a frente a frase some. Limpeza: `focus_stop`.
//   Com a WebView 91 da imagem do Android 12 a página não sobe: o que é do
//   cartão sai em `naoConferido`, e o estado é conferido pelo `permissoes`.
//   O cartão com esse estado é conferido no roteiro `cartao`.
// cartao (tt37): o app sem alarme exato numa WebView em dia. No Android 13+
//   o USE_EXACT_ALARM vale sempre; `am compat disable ENABLE_USE_EXACT_ALARM`
//   (só em app depurável) o tira, e o `canScheduleExactAlarms()` passa a
//   dizer não, como no Android 12 com a permissão negada. Receita: 3 alarmes
//   inexatos; o cartão mostra a frase do atraso; `am compat reset` (o
//   sistema mata o app), reabrir: a agenda volta exata e a frase some.
//
// Imprime um JSON com cada conferência e sai 1 se alguma falhou. Nunca usa
// `force-stop` (apagaria os alarmes, seção 6).
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
const NOTIF = 'android.permission.POST_NOTIFICATIONS';

const resultados = [];
const conferir = (nome, ok, detalhe) => resultados.push({ nome, ok: Boolean(ok), detalhe });
const perto = (a, b) => Math.abs(a - b) <= TOLERANCIA_MS;
const painel = () => ler(adb, pacote);
const semFalha = (log) => !/FATAL EXCEPTION|panicked/.test(log);
const agoraNoAparelho = () => Number(adb.shell('date +%s%3N'));
const mesmosInstantes = (alarmes, fins) => alarmes.length === fins.length && alarmes.every((a, k) => perto(a.quandoMs, fins[k]));

async function esperarPainel(condicao, limiteMs = 8000) {
  const ate = Date.now() + limiteMs;
  let p = painel();
  while (!condicao(p) && Date.now() < ate) {
    await esperar(300);
    p = painel();
  }
  return p;
}

/** Com o CDP aberto no app: `fn(cdp)`, e fecha. */
async function comCdp(fn) {
  const cdp = await conectar({ pacote });
  try {
    return await fn(cdp);
  } finally {
    await cdp.fechar();
  }
}

/** Espera uma expressão da página dar verdadeiro (ou o limite). */
async function esperarNaPagina(cdp, expressao, limiteMs = 8000) {
  const ate = Date.now() + limiteMs;
  let v = await cdp.avaliar(expressao);
  while (!v && Date.now() < ate) {
    await esperar(250);
    v = await cdp.avaliar(expressao);
  }
  return v;
}

// A imagem do Android 12 do kit traz a WebView 91, que não lê o pacote do
// app (docs/decisoes.md, A13): lá a página não sobe, e o que é da tela fica
// em `naoConferido` (o comando `permissoes` responde do mesmo jeito, pelo
// `__TAURI_INTERNALS__`). Num aparelho com a WebView em dia, tudo é conferido.
const naoConferido = [];
const MOTIVO_WEBVIEW = 'a WebView deste aparelho não lê o pacote do app e a página não sobe; conferido pelo permissoes aqui e, com o mesmo estado (sem alarme exato), pelo cartão no roteiro "cartao" (tt37)';

async function aPaginaSobe(cdp) {
  const sobe = Boolean(await esperarNaPagina(cdp, `!!document.querySelector('.tt-rolagem .tt-pagina')`, 5000));
  const versao = await cdp.avaliar(`(/Chrome\\/([0-9.]+)/.exec(navigator.userAgent) || [])[1] || null`);
  return { sobe, versao };
}

const FAIXA = `(() => { const f = document.querySelector('[data-faixa-avisos]');
  if (!f) return { existe: false };
  const r = f.getBoundingClientRect();
  return { existe: true, hidden: f.hidden, visivel: !f.hidden && r.height > 0, texto: f.textContent.trim() }; })()`;

const CARTAO = `(() => { const s = document.querySelector('[data-cartao="notificacoes"]');
  if (!s) return { existe: false };
  const a = s.querySelector('[data-atraso-avisos]');
  const d = s.querySelector('[data-estado-avisos]');
  return { existe: true, estado: d?.dataset.estadoAvisos, descricao: d?.textContent, atrasoVisivel: !!a && !a.hidden && a.getBoundingClientRect().height > 0,
    atraso: a?.textContent.trim(), permitirVisivel: !s.querySelector('[data-permitir-avisos]').hidden }; })()`;

/** A árvore do uiautomator (texto XML). */
function arvoreDaTela() {
  adb.solto(['-s', adb.serial, 'shell', 'uiautomator', 'dump', '/sdcard/tt-ui.xml']);
  return adb.solto(['-s', adb.serial, 'shell', 'cat', '/sdcard/tt-ui.xml']).stdout ?? '';
}

/** O centro do nó com esse resource-id, ou null. */
function centroDe(xml, id) {
  const no = new RegExp(`<node [^>]*resource-id="${id.replaceAll('.', '\\.')}"[^>]*>`).exec(xml)?.[0];
  const b = no && /bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(no);
  return b ? { x: (Number(b[1]) + Number(b[3])) >> 1, y: (Number(b[2]) + Number(b[4])) >> 1 } : null;
}

/** Os botões visíveis do cartão Avisos ficam dentro dele (não vazam na tela estreita). */
const BOTOES_CABEM = `(() => { const c = document.querySelector('[data-cartao="notificacoes"]').getBoundingClientRect();
  return [...document.querySelectorAll('[data-cartao="notificacoes"] button:not([hidden])')].every((b) => { const r = b.getBoundingClientRect(); return r.left >= c.left && r.right <= c.right; }); })()`;

const PERMITIR = 'com.android.permissioncontroller:id/permission_allow_button';

async function esperarPedido(limiteMs = 10_000) {
  const ate = Date.now() + limiteMs;
  let xml = arvoreDaTela();
  while (!centroDe(xml, PERMITIR) && Date.now() < ate) {
    await esperar(500);
    xml = arvoreDaTela();
  }
  return centroDe(xml, PERMITIR);
}

function receita(cdp) {
  return cdp
    .invoke('settings_set', { patch: { focusMinutes: 1, breakMinutes: 1 } })
    .then(() => cdp.invoke('focus_start', { minutes: 3 }));
}

const finsDe = (focus) => Array.from({ length: 3 - focus.session.phaseIndex }, (_, k) => focus.session.endsAt + k * 60_000);

async function abrirEsperar() {
  abrir(adb, pacote);
  const pid = await esperarPid(adb, pacote);
  if (!pid) throw new Error(`o app ${pacote} não abriu`);
  await esperar(1500);
  return pid;
}

async function limpar() {
  await abrirEsperar();
  await comCdp((cdp) => cdp.invoke('focus_stop').catch(() => null));
  const p = await esperarPainel((x) => x.alarmes.length === 0);
  conferir('limpeza: 0 alarmes', p.alarmes.length === 0, p.alarmes);
}

async function notificacoes() {
  const sdk = Number(adb.shell('getprop ro.build.version.sdk'));
  if (sdk < 33) throw new Error(`o roteiro de notificações é do Android 13+ (tt37); este é API ${sdk}`);
  adb(['shell', 'pm', 'clear', pacote]);
  // O `pm clear` não zera as marcas da permissão: sem isso, a recusa (ou a
  // revogação) de uma rodada anterior fica "decidida pelo usuário" e o
  // sistema recusa o pedido seguinte sem mostrá-lo.
  adb.solto(['-s', adb.serial, 'shell', 'pm', 'revoke', pacote, NOTIF]);
  adb(['shell', 'pm', 'clear-permission-flags', pacote, NOTIF, 'user-set', 'user-fixed']);
  adb(['logcat', '-c']);
  await abrirEsperar();

  // Ao abrir: nada de pedido, faixa escondida.
  await comCdp(async (cdp) => {
    await esperarNaPagina(cdp, `!!document.querySelector('[data-faixa-avisos]')`);
    const perm = await cdp.invoke('plugin:tomatito-android|permissoes');
    const faixa = await cdp.avaliar(FAIXA);
    conferir('ao abrir (pm clear): prompt, sem pedido feito, faixa na tela Foco e escondida', perm.notificacoes === 'prompt' && perm.jaPediu === false && faixa.existe && !faixa.visivel, { perm, faixa });
  });
  await esperar(1000);
  conferir('ao abrir: o pedido do sistema não aparece', !centroDe(arvoreDaTela(), PERMITIR));

  // O primeiro "Iniciar" (o botão da tela, uma sessão de 25 min) pede.
  await comCdp((cdp) => cdp.clicar('[data-iniciar]'));
  const botao = await esperarPedido();
  conferir('o primeiro "Iniciar" mostra o pedido do sistema', Boolean(botao), botao);
  if (botao) adb(['shell', 'input', 'tap', String(botao.x), String(botao.y)]);
  await esperar(1500);
  await comCdp(async (cdp) => {
    const perm = await cdp.invoke('plugin:tomatito-android|permissoes');
    const foco = await cdp.invoke('get_state');
    conferir('"Permitir": granted, jaPediu, e a sessão começou', perm.notificacoes === 'granted' && perm.jaPediu === true && foco.focus.status === 'focus', {
      perm,
      status: foco.focus.status,
    });
    await cdp.invoke('focus_stop');
  });

  // pm revoke: o sistema mata o app; reabrir mostra a faixa.
  const pidAntes = painel().pid;
  adb(['shell', 'pm', 'revoke', pacote, NOTIF]);
  const morto = await esperarPainel((x) => x.pid !== pidAntes, 10_000);
  conferir('pm revoke: o sistema matou o app (como sempre na revogação)', morto.pid !== pidAntes, { pidAntes, pidDepois: morto.pid });
  adb(['logcat', '-c']);
  const pid = await abrirEsperar();
  let fins;
  await comCdp(async (cdp) => {
    const faixa = await esperarNaPagina(cdp, `(${FAIXA}).visivel && ${FAIXA}`);
    const perm = await cdp.invoke('plugin:tomatito-android|permissoes');
    conferir('depois do revoke: a faixa aparece na tela Foco', faixa?.visivel === true, { perm, faixa });
    // O cartão, com o pedido já feito: não promete outro pedido sozinho, e
    // os botões cabem no cartão.
    await cdp.avaliar(`location.hash = '#/configuracoes'`);
    const cartao = await esperarNaPagina(cdp, `(${CARTAO}).existe && ${CARTAO}`);
    const cabe = await cdp.avaliar(BOTOES_CABEM);
    conferir('depois do revoke: o cartão Avisos diz que não estão permitidos, sem prometer o pedido, com "Permitir avisos" e os botões dentro do cartão', cartao?.estado !== 'granted' && cartao.permitirVisivel && !/O pedido aparece/.test(cartao.descricao) && cabe === true, { cartao, cabe });
    await cdp.avaliar(`location.hash = '#/foco'`);
    await esperarNaPagina(cdp, `!!document.querySelector('[data-faixa-avisos]')`);
    fins = finsDe(await receita(cdp));
  });
  const comAlarmes = await esperarPainel((x) => x.alarmes.length === fins.length);
  conferir('sem avisos: a agenda continua (3 alarmes exatos)', mesmosInstantes(comAlarmes.alarmes, fins) && comAlarmes.alarmes.every((a) => a.relogio), comAlarmes.alarmes);
  // Passa o primeiro fim (o FimReceiver roda e tenta postar).
  await esperar(Math.max(0, fins[0] - agoraNoAparelho()) + 4000);
  const depois = painel();
  conferir('passado o primeiro fim: nenhuma notificação do pacote (nem a contínua, nem o aviso)', depois.notificacoes.length === 0, depois.notificacoes);
  conferir('o FimReceiver rodou (o primeiro fim saiu da agenda gravada)', depois.agendaGravada?.length === fins.length - 1, depois.agendaGravada?.length);
  conferir('o app não quebrou: mesmo pid e logcat sem FATAL nem panicked', depois.pid === pid && semFalha(adb(['logcat', '-d'])), { pid, depois: depois.pid });

  // pm grant + volta para a frente: a faixa some.
  adb(['shell', 'pm', 'grant', pacote, NOTIF]);
  adb(['shell', 'input', 'keyevent', 'KEYCODE_HOME']);
  await esperar(1500);
  abrir(adb, pacote);
  await esperar(1500);
  await comCdp(async (cdp) => {
    const sumiu = await esperarNaPagina(cdp, `!(${FAIXA}).visivel`);
    const perm = await cdp.invoke('plugin:tomatito-android|permissoes');
    conferir('pm grant + visibilitychange (HOME e voltar): a faixa some', sumiu === true && perm.notificacoes === 'granted', {
      perm,
      faixa: await cdp.avaliar(FAIXA),
      pidIgual: painel().pid === pid,
    });
  });
  await limpar();
  conferir('logcat final sem FATAL nem panicked', semFalha(adb(['logcat', '-d'])));
}

async function alarme() {
  const sdk = Number(adb.shell('getprop ro.build.version.sdk'));
  if (sdk < 31 || sdk > 32) throw new Error(`o roteiro do alarme é do Android 12/12L (tt31); este é API ${sdk}`);
  adb(['shell', 'pm', 'clear', pacote]);
  adb(['shell', 'appops', 'set', pacote, 'SCHEDULE_EXACT_ALARM', 'default']);
  adb(['logcat', '-c']);
  // (1) sessão correndo e 3 alarmes exatos.
  const pid = await abrirEsperar();
  let fins;
  await comCdp(async (cdp) => {
    fins = finsDe(await receita(cdp));
  });
  const p1 = await esperarPainel((x) => x.alarmes.length === fins.length);
  conferir('(1) receita da seção 6: 3 alarmes exatos (AlarmClockInfo) nos fins', mesmosInstantes(p1.alarmes, fins) && p1.alarmes.every((a) => a.tipo === 'RTC_WAKEUP' && a.relogio), {
    alarmes: p1.alarmes,
    fins,
  });

  // (2) deny: o Android 12 mata o app e cancela os exatos.
  adb(['shell', 'appops', 'set', pacote, 'SCHEDULE_EXACT_ALARM', 'deny']);
  const p2 = await esperarPainel((x) => x.alarmes.length === 0 && x.pid !== pid, 15_000);
  conferir('(2) deny: o pid sumiu ou mudou e dumpsys alarm sem alarmes do pacote', p2.pid !== pid && p2.alarmes.length === 0, {
    pidAntes: pid,
    pidDepois: p2.pid,
    alarmes: p2.alarmes,
  });
  conferir('(2) logcat até o deny sem FATAL nem panicked', semFalha(adb(['logcat', '-d'])));

  // (3) reabrir e iniciar uma sessão nova: inexatos e a frase no cartão.
  adb(['logcat', '-c']);
  await abrirEsperar();
  let fins3;
  let paginaSobe;
  await comCdp(async (cdp) => {
    await cdp.invoke('focus_stop').catch(() => null); // a sessão retomada
    fins3 = finsDe(await receita(cdp));
    const perm = await cdp.invoke('plugin:tomatito-android|permissoes');
    conferir('(3) permissoes: alarmeExato = false no Android 12 com a permissão negada (é o que o cartão lê)', perm.alarmeExato === false && perm.sdk === sdk, perm);
    paginaSobe = await aPaginaSobe(cdp);
    if (paginaSobe.sobe) {
      await cdp.avaliar(`location.hash = '#/configuracoes'`);
      const cartao = await esperarNaPagina(cdp, `(${CARTAO}).atrasoVisivel && ${CARTAO}`);
      conferir('(3) o cartão Avisos mostra "Os avisos podem atrasar alguns minutos"', cartao?.atrasoVisivel === true && /Os avisos podem atrasar alguns minutos/.test(cartao.atraso), {
        perm,
        cartao: cartao || (await cdp.avaliar(CARTAO)),
      });
    } else {
      naoConferido.push({ nome: '(3) o cartão Avisos mostra "Os avisos podem atrasar alguns minutos"', motivo: MOTIVO_WEBVIEW, webview: paginaSobe });
    }
  });
  const p3 = await esperarPainel((x) => x.alarmes.length === fins3.length);
  conferir('(3) sessão nova: 3 alarmes sem AlarmClockInfo (inexatos), nos fins', mesmosInstantes(p3.alarmes, fins3) && p3.alarmes.every((a) => a.tipo === 'RTC_WAKEUP' && !a.relogio), {
    alarmes: p3.alarmes,
    fins: fins3,
  });

  // (4) allow: o PermissaoAlarmeReceiver reagenda como exatos.
  adb(['shell', 'appops', 'set', pacote, 'SCHEDULE_EXACT_ALARM', 'allow']);
  await esperarPainel((x) => x.logcat.some((l) => /reagendar \(PERMISSAO\)/.test(l)), 15_000);
  const p4 = await esperarPainel((x) => x.alarmes.length > 0 && x.alarmes.every((a) => a.relogio), 5000);
  const pendentes = fins3.filter((f) => f > p4.agoraMs);
  conferir('(4) allow: o PermissaoAlarmeReceiver recebeu o broadcast', p4.logcat.some((l) => /reagendar \(PERMISSAO\)/.test(l)), p4.logcat);
  conferir('(4) allow: os alarmes voltaram exatos (AlarmClockInfo), nos mesmos instantes', pendentes.length > 0 && mesmosInstantes(p4.alarmes, pendentes) && p4.alarmes.every((a) => a.tipo === 'RTC_WAKEUP' && a.relogio), {
    alarmes: p4.alarmes,
    pendentes,
  });
  adb(['shell', 'input', 'keyevent', 'KEYCODE_HOME']);
  await esperar(1500);
  abrir(adb, pacote);
  await esperar(1500);
  await comCdp(async (cdp) => {
    const perm = await cdp.invoke('plugin:tomatito-android|permissoes');
    conferir('(4) permissoes: alarmeExato = true de novo', perm.alarmeExato === true, perm);
    if (paginaSobe.sobe) {
      const sumiu = await esperarNaPagina(cdp, `(${CARTAO}).existe && !(${CARTAO}).atrasoVisivel`);
      conferir('(4) na volta do app para a frente, a frase do atraso some', sumiu === true, await cdp.avaliar(CARTAO));
    } else {
      naoConferido.push({ nome: '(4) na volta do app para a frente, a frase do atraso some', motivo: MOTIVO_WEBVIEW, webview: paginaSobe });
    }
  });
  conferir('logcat sem FATAL nem panicked', semFalha(adb(['logcat', '-d'])));
  await limpar();
  conferir('logcat final sem FATAL nem panicked', semFalha(adb(['logcat', '-d'])));
}

async function cartao() {
  const sdk = Number(adb.shell('getprop ro.build.version.sdk'));
  if (sdk < 33) throw new Error(`o roteiro do cartão é do Android 13+ (tt37); este é API ${sdk}`);
  const MUDANCA = 'ENABLE_USE_EXACT_ALARM';
  adb(['shell', 'pm', 'clear', pacote]);
  adb(['shell', 'pm', 'grant', pacote, NOTIF]);
  adb(['shell', 'am', 'compat', 'disable', MUDANCA, pacote]);
  try {
    adb(['logcat', '-c']);
    await abrirEsperar();
    let fins;
    await comCdp(async (cdp) => {
      const perm = await cdp.invoke('plugin:tomatito-android|permissoes');
      conferir('sem USE_EXACT_ALARM: permissoes com alarmeExato = false e os avisos permitidos', perm.alarmeExato === false && perm.notificacoes === 'granted', perm);
      fins = finsDe(await receita(cdp));
      await cdp.avaliar(`location.hash = '#/configuracoes'`);
      const c = await esperarNaPagina(cdp, `(${CARTAO}).atrasoVisivel && ${CARTAO}`);
      const cabe = await cdp.avaliar(BOTOES_CABEM);
      conferir('o cartão Avisos mostra "Os avisos podem atrasar alguns minutos", sem "Permitir avisos" e com o botão dentro do cartão', c?.atrasoVisivel === true && /Os avisos podem atrasar alguns minutos/.test(c.atraso) && c.estado === 'granted' && !c.permitirVisivel && cabe === true, { cartao: c || (await cdp.avaliar(CARTAO)), cabe });
    });
    const inexatos = await esperarPainel((x) => x.alarmes.length === fins.length);
    conferir('sessão sem alarme exato: 3 alarmes sem AlarmClockInfo (inexatos), nos fins', mesmosInstantes(inexatos.alarmes, fins) && inexatos.alarmes.every((a) => a.tipo === 'RTC_WAKEUP' && !a.relogio), { alarmes: inexatos.alarmes, fins });

    // De volta ao normal: o sistema mata o app; ao reabrir, a retomada
    // reagenda como exatos e o cartão perde a frase.
    const pid = painel().pid;
    adb(['shell', 'am', 'compat', 'reset', MUDANCA, pacote]);
    const morto = await esperarPainel((x) => x.pid !== pid, 10_000);
    await abrirEsperar();
    await comCdp(async (cdp) => {
      const perm = await cdp.invoke('plugin:tomatito-android|permissoes');
      await cdp.avaliar(`location.hash = '#/configuracoes'`);
      const sumiu = await esperarNaPagina(cdp, `(${CARTAO}).existe && !(${CARTAO}).atrasoVisivel`);
      conferir('com o alarme exato de volta (app reaberto): alarmeExato = true e a frase some', morto.pid !== pid && perm.alarmeExato === true && sumiu === true, { perm, cartao: await cdp.avaliar(CARTAO) });
    });
    const pendentes = fins.filter((f) => f > painel().agoraMs);
    const exatos = await esperarPainel((x) => x.alarmes.length === pendentes.length && x.alarmes.every((a) => a.relogio));
    conferir('a retomada reagenda como exatos (AlarmClockInfo), nos mesmos instantes', pendentes.length > 0 && mesmosInstantes(exatos.alarmes, pendentes) && exatos.alarmes.every((a) => a.relogio), { alarmes: exatos.alarmes, pendentes });
  } finally {
    adb.solto(['-s', adb.serial, 'shell', 'am', 'compat', 'reset', MUDANCA, pacote]);
  }
  await limpar();
  conferir('logcat final sem FATAL nem panicked', semFalha(adb(['logcat', '-d'])));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const roteiros = { notificacoes, alarme, cartao };
  if (!roteiros[modo]) {
    console.error('uso: node scripts/android/avisos.mjs notificacoes|alarme|cartao');
    process.exit(2);
  }
  try {
    await roteiros[modo]();
  } catch (erro) {
    conferir('o roteiro rodou até o fim', false, String(erro?.stack ?? erro));
  }
  const falhas = resultados.filter((r) => !r.ok);
  console.log(JSON.stringify({ modo, pacote, ok: falhas.length === 0, total: resultados.length, falhas: falhas.length, naoConferido, resultados }, null, 2));
  process.exit(falhas.length ? 1 : 0);
}
