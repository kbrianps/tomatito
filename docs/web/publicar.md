# Publicar a versão web (Cloudflare)

## Uma vez: o login

```bash
/opt/cargo-target/ferramentas/wrangler/node_modules/.bin/wrangler login
```

Abre o navegador; entre na conta da Cloudflare (ou crie uma, é grátis) e clique em **Allow**. O Wrangler espera poucos minutos pela autorização; se passar do tempo, rode de novo.

## Publicar

```bash
node scripts/web/publicar.mjs
```

O script faz o build (`npm run build:web`) e roda `wrangler deploy`, que envia a pasta `dist-web` conforme o `wrangler.jsonc` da raiz (Workers com arquivos estáticos). Sem login, ele avisa e sai com o código 3, sem publicar nada.

**Endereço publicado:** https://tomatito.kbrianps.workers.dev (primeiro deploy em 02/10/2026, conta kbrianps).

## O que vai junto

- `_headers`: política de segurança (CSP com o hash do script de boot), cache longo para `/assets/*` e `no-cache` para a página, o `sw.js` e o manifest. Gerado pelo `scripts/web/plugin-web.mjs`; conferido por `npm run test:cabecalhos`.
- `privacidade.html`: a política de privacidade, em `/privacidade` (a ficha da Play Store aponta para ela).
- O app é uma página só; qualquer caminho desconhecido devolve o `index.html`.

## Conferir sem publicar

```bash
npm run build:web
/opt/cargo-target/ferramentas/wrangler/node_modules/.bin/wrangler pages dev dist-web --port 8791
```

É o emulador local do Pages (não pede login). Conferido em 02/10/2026: o `.wasm` sai como `application/wasm` com cache `immutable`; `/` e `/sw.js` com `no-cache`; `/privacidade` e um caminho qualquer respondem 200.

## Onde ficam os dados

Só no navegador de cada pessoa (configurações, estatísticas e tarefas). Trocar de endereço (outro projeto ou domínio) começa do zero para quem já usava.

## Pages ou Workers

O plano era o Pages, mas em 02/10/2026 a conta respondeu ao `wrangler pages deploy` com "Delegating to the latest version of Cloudflare Pages, now part of Cloudflare Workers" e não publicou nada. O deploy passou a ser `wrangler deploy` com o `wrangler.jsonc` (`assets.directory = ./dist-web`, `not_found_handling = single-page-application`). O `_headers` continua valendo.

Conferido no ar no mesmo dia: `/` 200 com `no-cache` e a CSP; o `.wasm` como `application/wasm` com cache `immutable`; `/sw.js` com `no-cache`; `/privacidade`, o manifest e um caminho qualquer 200; num celular emulado (perfil m), layout de celular, service worker registrado e uma sessão de foco iniciada por toque.
