#!/usr/bin/env node
// M50: lê o console do DevTools da janela tomato pelo inspetor remoto do
// WebKitGTK, sem abrir o DevTools, num build com a CSP (`npm run
// build:debug`). O app precisa ter subido com
// WEBKIT_INSPECTOR_HTTP_SERVER=<host:porta>.
//
//   node scripts/gnome-aninhado/console-tomate.mjs 127.0.0.1:9450 saida.json
//
// Passos, como o console.mjs do M08 faz com a main:
//   1. acha a página da main entre os alvos do inspetor e, por ela, pede o
//      `switch_window_mode(true)` (M51; no M50, o comando de debug `tomato_debug_open`);
//   2. acha a página nova (tomato.html) e liga o Console: o WebKit reenvia as
//      mensagens guardadas desde o carregamento, que são as mesmas que o
//      DevTools mostraria aberto depois;
//   3. lê o estado da página (atributos do <html>, fundo, textos) e o cabeçalho
//      Content-Security-Policy que o Tauri mandou com o tomato.html;
//   4. exercita os botões pelo JS (iniciar, pausar, retomar, encerrar), com
//      as mensagens desse trecho à parte;
//   5. roda o controle positivo: um <script> inline sem hash, que a CSP
//      recusa com um "Refused to" (prova que a CSP está ativa e que a mensagem
//      chegaria até aqui).
// Grava { alvos, mensagens, estado, exercicio, mensagensDoExercicio, controle,
// mensagensDoControle } e sai com 0; sai com 1 se não conseguir falar com o
// inspetor.
import { writeFileSync } from 'node:fs';

const [endereco, saida] = process.argv.slice(2);
if (!endereco || !saida) {
  console.error('uso: console-tomate.mjs <host:porta> <saida.json>');
  process.exit(2);
}
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function alvos() {
  const html = await (await fetch(`http://${endereco}/`)).text();
  return [...new Set([...html.matchAll(/socket\/\d+\/\d+\/WebPage/g)].map((m) => `ws://${endereco}/${m[0]}`))];
}

// Uma conexão com um alvo: `avaliar(js)` espera promessas (Runtime.awaitPromise)
// e devolve o valor; as mensagens do console vão para `lista()`.
async function conectar(url) {
  const ws = new WebSocket(url);
  let id = 0;
  let pagina = null;
  const pendentes = new Map();
  const conj = { atual: [] };
  const enviar = (method, params = {}) =>
    new Promise((resolve) => {
      const interno = ++id;
      pendentes.set(interno, resolve);
      ws.send(JSON.stringify({ id: ++id, method: 'Target.sendMessageToTarget', params: { targetId: pagina, message: JSON.stringify({ id: interno, method, params }) } }));
    });
  await new Promise((resolve, reject) => {
    ws.onerror = () => reject(new Error(`falha no WebSocket: ${url}`));
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
        conj.atual.push({ fonte: c.source, nivel: c.level, texto: c.text, url: c.url ?? null, linha: c.line ?? null });
      }
    };
  });
  const avaliar = async (js) => {
    // Sem returnByValue aqui: com ele, uma promessa volta serializada como {}.
    // O Runtime.evaluate do WebKit não tem awaitPromise; a promessa volta como
    // objeto e é esperada com o Runtime.awaitPromise.
    const p = await enviar('Runtime.evaluate', { expression: js });
    const r = p?.result?.objectId && p.result.subtype !== 'null'
      ? await enviar('Runtime.awaitPromise', { promiseObjectId: p.result.objectId, returnByValue: true })
      : p;
    return r?.result?.value ?? r;
  };
  return {
    enviar,
    avaliar,
    // Troca a lista que recebe as mensagens (cada fase do teste tem a sua).
    fase: (lista) => (conj.atual = lista),
    fechar: () => ws.close(),
  };
}

const R = { alvos: [], mensagens: [], estado: null, exercicio: null, mensagensDoExercicio: [], controle: null, mensagensDoControle: [] };
const salvar = () => writeFileSync(saida, JSON.stringify(R, null, 2));

const ESTADO = `(async () => {
  const h = document.documentElement, q = (s) => document.querySelector(s);
  let csp = null;
  try { csp = (await fetch(location.origin + '/tomato.html')).headers.get('content-security-policy'); } catch (e) { csp = 'erro: ' + e; }
  return JSON.stringify({ url: location.href, dataset: { ...h.dataset }, fundo: [getComputedStyle(h).backgroundColor, getComputedStyle(document.body).backgroundColor],
    estado: q('.stage')?.dataset.state, rotulo: q('[data-rotulo]')?.textContent, tempo: q('[data-tempo]')?.textContent, contagem: q('[data-contagem]')?.textContent,
    interCarregada: document.fonts.check('14px "Inter Variable"'), folhas: document.styleSheets.length, csp });
})()`;
// Clica pelo JS nos botões (os comandos focus_* e o setProperty do anel), com
// uma pausa para os retratos chegarem, e devolve os estados vistos.
const EXERCICIO = `(async () => {
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  const q = (s) => document.querySelector(s), vistos = [];
  const ler = () => vistos.push([q('.stage').dataset.state, q('[data-tempo]').textContent, getComputedStyle(q('[data-anel]')).strokeDasharray]);
  ler();
  for (const acao of ['principal', 'principal', 'principal', 'encerrar']) { q('[data-acao="' + acao + '"]').click(); await espera(600); ler(); }
  return JSON.stringify(vistos);
})()`;
const CONTROLE = `(() => {
  const s = document.createElement('script');
  s.textContent = 'window.__ttControle = 1';
  document.head.append(s);
  s.remove();
  return window.__ttControle === 1 ? 'script inline executado' : 'script inline recusado';
})()`;

try {
  let lista = [];
  for (let i = 0; i < 60 && !lista.length; i++) {
    try {
      lista = await alvos();
    } catch {
      // o servidor ainda não subiu
    }
    if (!lista.length) await espera(250);
  }
  const caminho = async (url) => {
    const c = await conectar(url);
    const p = await c.avaliar('location.pathname');
    c.fechar();
    return p;
  };
  let main = null;
  for (const url of lista) if ((await caminho(url)) !== '/tomato.html') main = url;
  if (!main) throw new Error(`sem a main entre os alvos: ${lista}`);
  const cm = await conectar(main);
  // M52: o "Manter" da validação com reversão, que senão fecharia o tomate em 10 s.
  R.abrir = await cm.avaliar("window.__TAURI_INTERNALS__.invoke('switch_window_mode', { full: true }).then(() => window.__TAURI_INTERNALS__.invoke('full_validation_answer', { answer: 'keep' })).then(() => 'aberto', (e) => 'erro: ' + e)");
  cm.fechar();
  let tomato = null;
  for (let i = 0; i < 40 && !tomato; i++) {
    await espera(250);
    for (const url of await alvos()) if (url !== main && (await caminho(url).catch(() => null)) === '/tomato.html') tomato = url;
  }
  R.alvos = { main, tomato };
  if (!tomato) throw new Error('a página do tomate não apareceu no inspetor');
  await espera(1500); // o boot da página: get_state e o primeiro desenho
  const ct = await conectar(tomato);
  ct.fase(R.mensagens);
  await ct.enviar('Console.enable');
  await ct.enviar('Runtime.enable');
  await espera(500); // as mensagens guardadas chegam logo depois do enable
  const e = await ct.avaliar(ESTADO);
  R.estado = typeof e === 'string' ? JSON.parse(e) : e;
  ct.fase(R.mensagensDoExercicio);
  const x = await ct.avaliar(EXERCICIO);
  R.exercicio = typeof x === 'string' ? JSON.parse(x) : x;
  await espera(300);
  ct.fase(R.mensagensDoControle);
  R.controle = await ct.avaliar(CONTROLE);
  await espera(500);
  ct.fechar();
  salvar();
  process.exit(0);
} catch (err) {
  R.erro = String(err);
  salvar();
  process.exit(1);
}
