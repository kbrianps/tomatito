#!/usr/bin/env node
// CDP na WebView do build de depuração (PLANO-ANDROID, A04 e 6).
//
//   node scripts/android/cdp.mjs tela                    # {title, hash, h1, url}
//   node scripts/android/cdp.mjs avaliar '<expressão>'
//   node scripts/android/cdp.mjs invoke <comando> ['<args em JSON>']
//   node scripts/android/cdp.mjs clicar '<seletor>'
//   node scripts/android/cdp.mjs geometria '<seletor>' ['<seletor>'...]
//
// Acha o socket `webview_devtools_remote_<pid>` do app em /proc/net/unix do
// aparelho, faz `adb forward tcp:<porta> localabstract:<socket>` (porta 9333,
// ou TT_CDP_PORTA), lê o /json, conecta no WebSocket da página do app e
// desfaz o forward ao sair. Só no build de depuração: o Tauri liga a
// depuração da WebView no debug. Pacote: io.github.kbrianps.tomatito.debug,
// ou TT_PACOTE.
//
// Como módulo: `const cdp = await conectar(); await cdp.avaliar('1+1');
// await cdp.fechar();`.
import { pathToFileURL } from 'node:url';
import { carregarAmbiente, criarAdb, esperar } from './lib/ambiente.mjs';

const PACOTE_PADRAO = 'io.github.kbrianps.tomatito.debug';

// O nome do socket de depuração do processo `pid`, se a WebView já abriu.
export function socketDaWebView(unix, pid) {
  const alvo = `@webview_devtools_remote_${pid}`;
  for (const linha of unix.split('\n')) {
    const campos = linha.trim().split(/\s+/);
    if (campos.at(-1) === alvo) return alvo.slice(1);
  }
  return null;
}

// Abre o WebSocket de uma página e devolve `enviar(método, params)`.
async function abrirWs(url) {
  const ws = new WebSocket(url);
  await new Promise((ok, erro) => {
    ws.addEventListener('open', ok, { once: true });
    ws.addEventListener('error', () => erro(new Error('WebSocket do CDP não abriu')), { once: true });
  });
  let seq = 0;
  const pendentes = new Map();
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pendentes.has(msg.id)) {
      pendentes.get(msg.id)(msg);
      pendentes.delete(msg.id);
    }
  });
  ws.addEventListener('close', () => {
    for (const [id, responder] of pendentes) responder({ id, error: { message: 'WebSocket fechado' } });
    pendentes.clear();
  });
  const enviar = (method, params = {}) =>
    new Promise((ok, erro) => {
      const id = ++seq;
      const t = setTimeout(() => {
        pendentes.delete(id);
        erro(new Error(`CDP ${method}: sem resposta em 15 s`));
      }, 15_000);
      pendentes.set(id, (msg) => {
        clearTimeout(t);
        if (msg.error) erro(new Error(`CDP ${method}: ${msg.error.message}`));
        else ok(msg.result);
      });
      ws.send(JSON.stringify({ id, method, params }));
    });
  return { ws, enviar };
}

export async function conectar({
  pacote = process.env.TT_PACOTE || PACOTE_PADRAO,
  porta = Number(process.env.TT_CDP_PORTA || 9333),
  limiteMs = 60_000,
} = {}) {
  const env = carregarAmbiente();
  const adb = criarAdb(env);
  const fim = Date.now() + limiteMs;

  // pid e socket: o processo sobe antes de a WebView abrir o socket.
  let pid = null;
  let socket = null;
  while (Date.now() < fim) {
    const r = adb.solto(['-s', env.ANDROID_SERIAL, 'shell', 'pidof', pacote]);
    pid = /^\d+$/.test((r.stdout || '').trim()) ? Number(r.stdout.trim()) : null;
    if (pid) {
      socket = socketDaWebView(adb.shell('cat /proc/net/unix'), pid);
      if (socket) break;
    }
    await esperar(500);
  }
  if (!pid) throw new Error(`o app ${pacote} não está rodando`);
  if (!socket) throw new Error(`sem webview_devtools_remote_${pid} (a WebView não é de depuração?)`);

  adb(['forward', `tcp:${porta}`, `localabstract:${socket}`]);
  const desfazer = () => adb.solto(['-s', env.ANDROID_SERIAL, 'forward', '--remove', `tcp:${porta}`]);

  try {
    // A página do app (tauri.localhost). Logo depois da partida, o /json pode vir
    // vazio e a página ainda pode navegar (o primeiro Runtime.evaluate volta com
    // "Inspected target navigated or closed"): tenta de novo até ela estar
    // carregada (readyState "complete").
    let pagina = null;
    let ws = null;
    let enviar = null;
    let ultimoErro = null;
    while (Date.now() < fim) {
      try {
        const lista = await (await fetch(`http://127.0.0.1:${porta}/json`)).json();
        pagina = lista.find((p) => p.type === 'page' && p.webSocketDebuggerUrl) ?? null;
        if (pagina) {
          ({ ws, enviar } = await abrirWs(pagina.webSocketDebuggerUrl));
          const r = await enviar('Runtime.evaluate', { expression: 'document.readyState', returnByValue: true });
          if (r.result?.value === 'complete') break;
          ws.close();
          ws = null;
        }
      } catch (e) {
        ultimoErro = e;
        ws?.close();
        ws = null;
      }
      await esperar(500);
    }
    if (!ws) throw new Error(`a página da WebView não carregou${ultimoErro ? ` (${ultimoErro.message})` : ''}`);

    // Avalia uma expressão (promessas são esperadas) e devolve o valor em JSON.
    const avaliar = async (expressao) => {
      const r = await enviar('Runtime.evaluate', { expression: expressao, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) {
        const d = r.exceptionDetails;
        throw new Error(`exceção na página: ${d.exception?.description ?? d.text}`);
      }
      return r.result.value;
    };

    return {
      pid,
      socket,
      pagina: { url: pagina.url, title: pagina.title },
      enviar,
      avaliar,
      invoke: (cmd, args = {}) =>
        avaliar(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args)})`),
      clicar: (seletor) =>
        avaliar(`(() => { const el = document.querySelector(${JSON.stringify(seletor)});
          if (!el) throw new Error('sem ' + ${JSON.stringify(seletor)}); el.click(); return true; })()`),
      geometria: (seletores) =>
        avaliar(`(${JSON.stringify(seletores)}).map((s) => { const el = document.querySelector(s);
          if (!el) return { seletor: s, existe: false };
          const r = el.getBoundingClientRect();
          return { seletor: s, existe: true, x: r.x, y: r.y, largura: r.width, altura: r.height }; })`),
      tela: () =>
        avaliar(`({ title: document.title, hash: location.hash, url: location.href,
          h1: document.querySelector('h1')?.textContent ?? null })`),
      async fechar() {
        ws.close();
        desfazer();
      },
    };
  } catch (e) {
    desfazer();
    throw e;
  }
}

async function principal() {
  const [acao, ...resto] = process.argv.slice(2);
  const acoes = ['tela', 'avaliar', 'invoke', 'clicar', 'geometria'];
  if (!acoes.includes(acao)) {
    console.error(`uso: cdp.mjs ${acoes.join('|')} [...]`);
    process.exitCode = 2;
    return;
  }
  const cdp = await conectar();
  try {
    let r;
    if (acao === 'tela') r = await cdp.tela();
    else if (acao === 'avaliar') r = await cdp.avaliar(resto[0]);
    else if (acao === 'invoke') r = await cdp.invoke(resto[0], resto[1] ? JSON.parse(resto[1]) : {});
    else if (acao === 'clicar') r = await cdp.clicar(resto[0]);
    else r = await cdp.geometria(resto);
    console.log(JSON.stringify(r ?? null));
  } finally {
    await cdp.fechar();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  principal().catch((e) => {
    console.error(`cdp.mjs: ${e.message}`);
    process.exitCode = 1;
  });
}
