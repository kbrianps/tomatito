#!/usr/bin/env node
// Lê o console do DevTools da janela main pelo inspetor remoto do WebKitGTK,
// sem abrir o DevTools. O app precisa ter subido com
// WEBKIT_INSPECTOR_HTTP_SERVER=<host:porta> e ser um build de debug (que liga
// o developer-extras do WebView).
//
//   node scripts/gnome-aninhado/console.mjs 127.0.0.1:9400 saida.json
//
// O WebKit guarda as mensagens do console desde o carregamento e as reenvia
// quando o Console é ligado, então o que sai aqui é o mesmo que o DevTools
// mostraria aberto depois da partida. Depois disso, o script:
//   - lê o estado da página (atributos do <html>, fontes, URL) e o cabeçalho
//     Content-Security-Policy que o Tauri mandou com o index.html;
//   - roda um controle positivo (um <script> inline sem hash, que a CSP do
//     build recusa), para provar que a CSP está ativa e que um "Refused to"
//     chegaria até aqui. As mensagens do controle ficam à parte.
// Grava um JSON com { alvo, mensagens, estado, controle } e sai com 0; sai com
// 1 se não conseguir falar com o inspetor.
import { writeFileSync } from 'node:fs';

const [endereco, saida] = process.argv.slice(2);
if (!endereco || !saida) {
  console.error('uso: console.mjs <host:porta> <saida.json>');
  process.exit(2);
}

const ESTADO = `(async () => {
  const h = document.documentElement;
  let csp = null;
  try { csp = (await fetch(location.origin + '/')).headers.get('content-security-policy'); } catch (e) { csp = 'erro: ' + e; }
  return JSON.stringify({
    url: location.href,
    dataset: { ...h.dataset },
    fontes: [...document.fonts].map((f) => f.family + ' ' + f.unicodeRange.slice(0, 12) + ': ' + f.status),
    fontesStatus: document.fonts.status,
    interCarregada: document.fonts.check('14px "Inter Variable"'),
    csp,
    // M10: o layout que a janela abriu (largura, painel, camada e colunas da Foco).
    layout: (() => {
      const c = document.querySelector('.tt-conteudo');
      const g = document.querySelector('.tt-foco-grade');
      const cs = c && getComputedStyle(c);
      return {
        janela: innerWidth,
        painel: document.querySelector('.tt-nav')?.getBoundingClientRect().width ?? null,
        camada: cs && [cs.backgroundColor, cs.borderTopWidth + ' ' + cs.borderTopColor, cs.borderLeftWidth, cs.borderTopLeftRadius],
        colunas: g ? getComputedStyle(g).gridTemplateColumns : null,
        rolagemHorizontal: h.scrollWidth > h.clientWidth,
      };
    })(),
  });
})()`;
// Um <script> inline sem hash, posto pela página: a CSP do build o recusa. (Um
// new Function() não serve de controle: o que o inspetor avalia passa por fora
// da regra de eval da CSP.)
const CONTROLE = `(() => {
  const s = document.createElement('script');
  s.textContent = 'window.__ttControle = 1';
  document.head.append(s);
  s.remove();
  return window.__ttControle === 1 ? 'script inline executado' : 'script inline recusado';
})()`;

async function alvo() {
  // A página inicial do servidor lista os alvos com o caminho do socket.
  for (let i = 0; i < 50; i++) {
    try {
      const html = await (await fetch(`http://${endereco}/`)).text();
      const m = html.match(/socket\/(\d+)\/(\d+)\/WebPage/);
      if (m) return `ws://${endereco}/${m[0]}`;
    } catch {
      // o servidor ainda não subiu
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`nenhum alvo WebPage em http://${endereco}/`);
}

const resultado = { alvo: null, mensagens: [], estado: null, controle: null, mensagensDoControle: [] };
const salvar = () => writeFileSync(saida, JSON.stringify(resultado, null, 2));

try {
  resultado.alvo = await alvo();
  const ws = new WebSocket(resultado.alvo);
  let id = 0;
  let pagina = null;
  let fase = 'partida';
  const pendentes = new Map();
  const enviar = (method, params = {}) =>
    new Promise((resolve) => {
      const interno = ++id;
      pendentes.set(interno, resolve);
      ws.send(
        JSON.stringify({
          id: ++id,
          method: 'Target.sendMessageToTarget',
          params: { targetId: pagina, message: JSON.stringify({ id: interno, method, params }) },
        }),
      );
    });
  const pronta = new Promise((resolve, reject) => {
    ws.onerror = () => reject(new Error('falha no WebSocket do inspetor'));
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.method === 'Target.targetCreated' && m.params.targetInfo.type === 'page' && !pagina) {
        pagina = m.params.targetInfo.targetId;
        resolve();
      }
      if (m.method !== 'Target.dispatchMessageFromTarget') return;
      const d = JSON.parse(m.params.message);
      if (d.id && pendentes.has(d.id)) {
        pendentes.get(d.id)(d.result ?? { erro: d.error });
        pendentes.delete(d.id);
      } else if (d.method === 'Console.messageAdded') {
        const c = d.params.message;
        const msg = { fonte: c.source, nivel: c.level, texto: c.text, url: c.url ?? null, linha: c.line ?? null };
        (fase === 'partida' ? resultado.mensagens : resultado.mensagensDoControle).push(msg);
      } else if (d.method === 'Console.messageRepeatCountUpdated') {
        const lista = fase === 'partida' ? resultado.mensagens : resultado.mensagensDoControle;
        if (lista.length) lista.at(-1).repeticoes = d.params.count;
      }
    };
  });
  await pronta;
  await enviar('Console.enable');
  await enviar('Runtime.enable');
  await new Promise((r) => setTimeout(r, 500)); // as mensagens guardadas chegam logo depois do enable
  // O Runtime.evaluate do WebKit não tem awaitPromise: a promessa volta como
  // objeto e é esperada com o Runtime.awaitPromise.
  const p = await enviar('Runtime.evaluate', { expression: ESTADO });
  const e = p?.result?.objectId
    ? await enviar('Runtime.awaitPromise', { promiseObjectId: p.result.objectId, returnByValue: true })
    : p;
  resultado.estado = typeof e?.result?.value === 'string' ? JSON.parse(e.result.value) : e;
  fase = 'controle';
  const c = await enviar('Runtime.evaluate', { expression: CONTROLE, returnByValue: true });
  resultado.controle = c?.result?.value ?? c;
  await new Promise((r) => setTimeout(r, 500));
  ws.close();
  salvar();
  process.exit(0);
} catch (err) {
  resultado.erro = String(err);
  salvar();
  process.exit(1);
}
