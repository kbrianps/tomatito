#!/usr/bin/env node
// Roda uma expressão JS na janela main de um build com os arquivos embutidos
// (sem o Vite, e portanto sem a sonda), pelo inspetor remoto do WebKitGTK, e
// escreve o resultado em JSON na saída padrão (M37). O app precisa ter subido
// com WEBKIT_INSPECTOR_HTTP_SERVER=<host:porta> e ser um build de debug (que
// liga o developer-extras do WebView), como no console.mjs.
//
//   node scripts/gnome-aninhado/inspetor.mjs 127.0.0.1:9737 'location.href'
//
// Saída: {"valor": ...} ou {"erro": "..."}. Uma promessa é esperada. Cada
// chamada abre uma conexão nova: depois de uma recarga, a página nova é a que
// responde (é assim que o roteiro instancia confere que o F5 não recarregou).
const [endereco, expressao] = process.argv.slice(2);
if (!endereco || !expressao) {
  console.error('uso: inspetor.mjs <host:porta> <expressão>');
  process.exit(2);
}

async function alvo() {
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

function sair(obj, codigo) {
  process.stdout.write(`${JSON.stringify(obj)}\n`);
  process.exit(codigo);
}

setTimeout(() => sair({ erro: 'tempo esgotado' }, 1), 10000);

try {
  const ws = new WebSocket(await alvo());
  let id = 0;
  let pagina = null;
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
  await new Promise((resolve, reject) => {
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
      }
    };
  });
  // O Runtime.evaluate do WebKit não tem awaitPromise: a promessa volta como
  // objeto e é esperada com o Runtime.awaitPromise.
  const texto = `Promise.resolve(${expressao}).then((v) => JSON.stringify(v === undefined ? null : v))`;
  const p = await enviar('Runtime.evaluate', { expression: texto });
  const r = p?.result?.objectId
    ? await enviar('Runtime.awaitPromise', { promiseObjectId: p.result.objectId, returnByValue: true })
    : p;
  ws.close();
  if (r?.wasThrown || r?.erro) sair({ erro: JSON.stringify(r.result ?? r.erro) }, 1);
  sair({ valor: typeof r?.result?.value === 'string' ? JSON.parse(r.result.value) : null }, 0);
} catch (e) {
  sair({ erro: String(e) }, 1);
}
