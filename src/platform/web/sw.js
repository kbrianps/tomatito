// O service worker da versão web (PLANO-WEB, 3.6 e 3.8; PLANO-WEB-V1, 4.2;
// W13 e W16). Script clássico, sem import, publicado na raiz do site
// (`/sw.js`, escopo `/`) pelo plugin-web.mjs.
//
// - notificationclick (W13): fecha o aviso, traz para a frente uma aba do
//   Tomatito que já esteja aberta (a visível, se houver) ou, sem nenhuma,
//   abre uma nova no escopo.
// - Precache (W16): no build, o plugin-web.mjs troca as três linhas marcadas
//   abaixo pela lista do bundle, pelo nome do cache
//   (`tomatito-<versão>-<hash8>`, 3.8 do PLANO-WEB) e pelo
//   TOMATITO_WEB_BUILD (que só identifica o build). A página entra na lista
//   como `./` (a raiz), nunca pelo nome do arquivo: no Pages o nome do
//   arquivo redireciona para `/`, e uma resposta redirecionada no cache não
//   serve a uma navegação (4.2 do PLANO-WEB-V1). No servidor de
//   desenvolvimento a lista fica vazia, e o `fetch` não intercepta nada.
// - Atualização (3.8): o SW novo instala e fica em `waiting` (sem
//   `skipWaiting` no `install`); só a página manda `SKIP_WAITING`
//   (platform/web/atualizacao.js), com nada correndo. O `activate` apaga os
//   caches antigos do Tomatito.

const PRECACHE = []; // tomatito:precache
const CACHE = 'tomatito-dev'; // tomatito:cache
const BUILD = ''; // tomatito:build

const PREFIXO = 'tomatito-';
const PAGINA = './';

self.addEventListener('install', (evento) => {
  if (!PRECACHE.length) return;
  evento.waitUntil(
    caches.open(CACHE).then((cache) =>
      // `reload`: direto da rede, sem passar pelo cache HTTP do navegador.
      cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' }))),
    ),
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n.startsWith(PREFIXO) && n !== CACHE).map((n) => caches.delete(n)))),
  );
});

self.addEventListener('message', (evento) => {
  if (evento.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

// A raiz do escopo (a página do app), com ou sem busca.
const ehAPagina = (url) => url.origin === self.location.origin && url.pathname === new URL(self.registration.scope).pathname;

self.addEventListener('fetch', (evento) => {
  if (!PRECACHE.length) return;
  const pedido = evento.request;
  if (pedido.method !== 'GET') return;
  const url = new URL(pedido.url);
  if (url.origin !== self.location.origin) return;
  const navegacao = pedido.mode === 'navigate' && ehAPagina(url);
  evento.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      // `ignoreVary`: o servidor pode responder com `Vary: Origin`, e os
      // módulos (pedidos com Origin) não casariam com o que o precache
      // guardou (pedido sem Origin).
      const guardado = await cache.match(navegacao ? PAGINA : pedido, { ignoreVary: true });
      if (guardado) return guardado;
      return fetch(pedido);
    })(),
  );
});

self.addEventListener('notificationclick', (evento) => {
  evento.notification.close();
  evento.waitUntil(
    (async () => {
      const abas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const escopo = self.registration.scope;
      const doTomatito = abas.filter((c) => c.url.startsWith(escopo));
      const aba = doTomatito.find((c) => c.visibilityState === 'visible') ?? doTomatito[0];
      if (aba) {
        try {
          await aba.focus();
          return;
        } catch {
          // Sem permissão para focar (fora da ativação do clique): abre outra.
        }
      }
      await self.clients.openWindow(escopo);
    })(),
  );
});
