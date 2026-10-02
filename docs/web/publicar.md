# Publicar a versão web (Cloudflare Pages)

## Uma vez: o login

```bash
/opt/cargo-target/ferramentas/wrangler/node_modules/.bin/wrangler login
```

Abre o navegador; entre na conta da Cloudflare (ou crie uma, é grátis) e clique em **Allow**. O Wrangler espera poucos minutos pela autorização; se passar do tempo, rode de novo.

## Publicar

```bash
node scripts/web/publicar.mjs
```

O script faz o build (`npm run build:web`), cria o projeto `tomatito` no Pages se ele ainda não existir e envia a pasta `dist-web`. No fim, o Wrangler imprime o endereço (algo como `https://tomatito.pages.dev`; se o nome já estiver tomado, a Cloudflare acrescenta um sufixo). Sem login, o script avisa e sai com o código 3, sem publicar nada.

**Endereço publicado:** (preencher depois do primeiro deploy, W41)

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

A documentação do Pages recomenda Workers Static Assets para projetos novos (developers.cloudflare.com/pages/, 25/08/2026). Ficamos no Pages: o `_headers` e o deploy por pasta são os mesmos, e a troca é só deste script e do nome do comando.
