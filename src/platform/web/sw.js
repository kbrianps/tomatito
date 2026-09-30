// O service worker da versão web (PLANO-WEB, 3.6; W13), mínimo: sem
// precache e sem `fetch` (a rede segue como sem ele; o precache e o offline
// chegam no W16). Serve aos avisos: o `showNotification` do avisos.js sai
// pelo registro dele, que também funciona no Chrome do Android (onde o
// `new Notification()` lança), e o clique num aviso volta ao Tomatito.
//
// Publicado na raiz do site (`/sw.js`, escopo `/`) pelo plugin-web.mjs: no
// build, emitido no dist-web; no dev, servido deste arquivo. Script clássico,
// sem import.
//
// notificationclick: fecha o aviso, traz para a frente uma aba do Tomatito
// que já esteja aberta (a que estiver visível, se houver) ou, sem nenhuma,
// abre uma nova no escopo.

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
