// Plugin do Vite da versão web (PLANO-WEB, 3.9; PLANO-WEB-V1, 3.2 e 5.1;
// W07a). Sem dependência. Só o vite.web.config.js o usa: o index.html do
// desktop não muda.
//
// transformIndexHtml (dev e build), logo depois do <meta charset>:
//   - no build, a <meta http-equiv="Content-Security-Policy"> (primeiro, para
//     valer sobre tudo o que vem depois), com o hash do script inline de boot
//     do index.html. Worker, manifest e fetch dos sons caem no
//     default-src 'self'. No dev não há CSP, como no `tauri dev` (o
//     verificar.mjs a liga no servidor dele com TOMATITO_WEB_CSP_DEV=1, para
//     os casos que rodam no dev também passarem por ela);
//   - <meta name="theme-color">, que o boot-web.js acompanha a cada tema;
//   - o boot-web.js como script clássico, antes do script de boot que já
//     existe (ele põe as globais do tema, o data-casca e o data-forma);
//   - a <meta name="viewport"> da 5.1 no lugar da do desktop.
// Os documentos do notices_read (THIRD_PARTY_NOTICES.md e OFL-Inter.txt) ao
// lado do index.html: no build, copiados para o dist-web; no dev, servidos do
// lugar deles.
// W13: o service worker (src/platform/web/sw.js) na raiz do site, como
// `sw.js` (escopo = a base): no build, emitido no dist-web sem hash no nome
// (o endereço dele não pode mudar); no dev, servido do arquivo.
// W16 (PLANO-WEB, 3.8; PLANO-WEB-V1, 4.2): o PWA.
//   - Os ícones do manifest (src/platform/web/icones/, gerados do
//     src-tauri/icons/icon.svg pelo scripts/web/icones.mjs), publicados em
//     assets/ com hash no nome.
//   - O `manifest.webmanifest` na raiz da base (sem hash: o endereço dele não
//     pode mudar), com o <link rel="manifest"> no <head> (dev e build).
//   - No build, o sw.js com o precache: a lista de tudo o que o bundle
//     publicou (a página entra como `./`, nunca pelo nome do arquivo; o
//     próprio sw.js fica de fora), o nome do cache
//     `tomatito-<versão>-<hash8>` e o TOMATITO_WEB_BUILD. No dev, o sw.js
//     sai como está (lista vazia, sem interceptar nada).
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const raiz = (arquivo) => fileURLToPath(new URL(`../../${arquivo}`, import.meta.url));

/** A viewport da web (5.1): safe areas e o layout encolhendo com o teclado. */
export const VIEWPORT = 'width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content';

/** A cor inicial da barra (o Lite, o tema padrão); o boot-web.js a acerta. */
export const COR_INICIAL = '#A5342B';

/** Os arquivos do notices_read da web (platform/web/index.js), pelo nome publicado. */
export const DOCUMENTOS = Object.freeze({
  'THIRD_PARTY_NOTICES.md': 'THIRD_PARTY_NOTICES.md',
  'OFL-Inter.txt': 'src/assets/OFL-Inter.txt',
});

const BOOT_WEB = 'src/platform/web/boot-web.js';

/** O service worker (W13): a fonte e o nome publicado, na raiz da base. */
export const SW = Object.freeze({ fonte: 'src/platform/web/sw.js', nome: 'sw.js' });

/** O manifest (W16), na raiz da base. */
export const MANIFESTO = 'manifest.webmanifest';

/** Os ícones do manifest (W16): a fonte no repositório, o lado e o propósito. */
export const ICONES = Object.freeze([
  Object.freeze({ fonte: 'src/platform/web/icones/icone-192.png', lado: 192, proposito: 'any' }),
  Object.freeze({ fonte: 'src/platform/web/icones/icone-512.png', lado: 512, proposito: 'any' }),
  Object.freeze({ fonte: 'src/platform/web/icones/icone-maskable-512.png', lado: 512, proposito: 'maskable' }),
]);

const sha256 = (texto) => createHash('sha256').update(texto).digest('base64');
const hex8 = (conteudo) => createHash('sha256').update(conteudo).digest('hex').slice(0, 8);

/** A versão do Cargo.toml (a mesma do Sobre; o vite.web.config.js lê igual). */
export function versaoDoCargo(texto = readFileSync(raiz('src-tauri/Cargo.toml'), 'utf8')) {
  const versao = /^\[package\][^[]*?^version = "([^"]+)"/m.exec(texto)?.[1];
  if (!versao) throw new Error('plugin-web: versão não encontrada no src-tauri/Cargo.toml');
  return versao;
}

/** O nome publicado de um ícone no build: em assets/, com hash no nome. */
export function nomeDoIcone(fonte, conteudo) {
  const nome = fonte.split('/').pop().replace(/\.png$/, '');
  return `assets/${nome}-${hex8(conteudo)}.png`;
}

/**
 * O manifest (3.8 do PLANO-WEB): `id`, `start_url` e `scope` na base, o nome,
 * a cor do Lite e os ícones (`{ src, lado, proposito }`, com `src` já
 * relativo à base).
 */
export function manifesto({ base, icones }) {
  return {
    id: base,
    name: 'Tomatito',
    short_name: 'Tomatito',
    description: 'Timer de foco.',
    lang: 'pt-BR',
    dir: 'ltr',
    start_url: base,
    scope: base,
    display: 'standalone',
    theme_color: COR_INICIAL,
    background_color: COR_INICIAL,
    launch_handler: { client_mode: 'focus-existing' },
    icons: icones.map(({ src, lado, proposito }) => ({
      src: `${base}${src}`,
      sizes: `${lado}x${lado}`,
      type: 'image/png',
      purpose: proposito,
    })),
  };
}

/** W40a: páginas estáticas publicadas ao lado do app (a de privacidade). */
export const PUBLICO = 'src/platform/web/publico';

/** Os arquivos de `publico/`, pelo nome. */
export function arquivosPublicos(pasta = raiz(PUBLICO)) {
  return existsSync(pasta) ? readdirSync(pasta).sort() : [];
}

/** O arquivo de cabeçalhos do Cloudflare Pages (W40a). */
export const CABECALHOS = '_headers';

/**
 * O `_headers` (PLANO-WEB-V1, 4.2), com a mesma política da <meta> mais o que
 * só o cabeçalho aceita (frame-ancestors, base-uri, form-action). Sem regras de
 * Content-Type: o Pages já serve o .wasm certo, e um cabeçalho repetido viria
 * "application/wasm, application/wasm", que quebra o instantiateStreaming.
 */
export function textoDosCabecalhos(html) {
  const csp = `${politica(html)}; frame-ancestors 'none'; base-uri 'self'; form-action 'none'`;
  return [
    '/*',
    '  X-Content-Type-Options: nosniff',
    '  Referrer-Policy: no-referrer',
    '  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()',
    `  Content-Security-Policy: ${csp}`,
    '',
    '/assets/*',
    '  Cache-Control: public, max-age=31536000, immutable',
    '',
    '/sw.js',
    '  Cache-Control: no-cache',
    '',
    '/manifest.webmanifest',
    '  Cache-Control: no-cache',
    '',
    '/',
    '  Cache-Control: no-cache',
    '',
  ].join('\n');
}

/**
 * A lista do precache a partir dos nomes publicados: a página vira `./`, o
 * sw.js sai (ele não se guarda), o `_headers` e as páginas de `publico/` saem
 * (vão sempre à rede, W40a), e o resto fica, em ordem.
 */
export function listaDoPrecache(nomes, fora = arquivosPublicos()) {
  const lista = new Set();
  for (const nome of nomes) {
    if (nome === SW.nome || nome === CABECALHOS || nome.endsWith('.map') || fora.includes(nome)) continue;
    lista.add(nome === 'index.html' ? './' : nome);
  }
  return [...lista].sort();
}

/**
 * O nome do cache (3.8 do PLANO-WEB, com o item 9 das correções):
 * `tomatito-<versão>-<hash8>`, com o hash8 dos 8 primeiros hex do sha256 da
 * lista ordenada, cada entrada com o sha256 do conteúdo (a página e os
 * documentos não têm hash no nome), mais `\n` e o TOMATITO_WEB_BUILD.
 */
export function nomeDoCache({ versao, conteudos, build = '' }) {
  const linhas = Object.keys(conteudos)
    .sort()
    .map((url) => `${url} ${createHash('sha256').update(conteudos[url]).digest('hex')}`);
  return `tomatito-${versao}-${hex8(`${linhas.join('\n')}\n${build}`)}`;
}

/** O sw.js do build: troca as três linhas marcadas da fonte. */
export function swDoBuild(fonte, { precache, cache, build = '' }) {
  const trocas = [
    [/^const PRECACHE = \[\]; \/\/ tomatito:precache$/m, `const PRECACHE = ${JSON.stringify(precache)};`],
    [/^const CACHE = 'tomatito-dev'; \/\/ tomatito:cache$/m, `const CACHE = ${JSON.stringify(cache)};`],
    [/^const BUILD = ''; \/\/ tomatito:build$/m, `const BUILD = ${JSON.stringify(build)};`],
  ];
  let saida = fonte;
  for (const [marca, linha] of trocas) {
    if (!marca.test(saida)) throw new Error(`plugin-web: marca do sw.js não encontrada (${marca})`);
    saida = saida.replace(marca, linha);
  }
  return saida;
}

/** Os scripts inline (sem `src`) de um HTML, com o conteúdo exato. */
export function scriptsInline(html) {
  return [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter((m) => !/\ssrc\s*=/i.test(m[1]))
    .map((m) => m[2]);
}

/**
 * A política do build (3.9), com o hash de cada script inline do HTML final
 * (hoje, só o boot do index.html).
 */
export function politica(html) {
  const hashes = scriptsInline(html).map((s) => `'sha256-${sha256(s)}'`);
  return [
    "default-src 'self'",
    `script-src 'self' 'wasm-unsafe-eval' ${hashes.join(' ')}`.trim(),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
  ].join('; ');
}

/** Põe `tags` logo depois do <meta charset> e troca a viewport. */
export function montarHead(html, { bootSrc, csp, manifestHref = null }) {
  const charset = /<meta charset="UTF-8" \/>\n?/i.exec(html);
  if (!charset) throw new Error('plugin-web: <meta charset> não encontrado no index.html');
  const viewport = /<meta name="viewport" content="[^"]*" \/>/;
  if (!viewport.test(html)) throw new Error('plugin-web: <meta name="viewport"> não encontrada no index.html');
  const recuo = '    ';
  const tags = [
    `<meta name="theme-color" content="${COR_INICIAL}" />`,
    ...(manifestHref ? [`<link rel="manifest" href="${manifestHref}" />`] : []),
    `<script src="${bootSrc}"></script>`,
  ];
  const fim = charset.index + charset[0].length;
  let saida = `${html.slice(0, fim)}${tags.map((t) => `${recuo}${t}\n`).join('')}${html.slice(fim)}`;
  saida = saida.replace(viewport, `<meta name="viewport" content="${VIEWPORT}" />`);
  if (csp) {
    // Primeira depois do charset: só vale para o que vem depois dela.
    const meta = `${recuo}<meta http-equiv="Content-Security-Policy" content="${politica(saida)}" />\n`;
    saida = `${saida.slice(0, fim)}${meta}${saida.slice(fim)}`;
  }
  return saida;
}

/**
 * `cspNoDev`: a CSP também no servidor de desenvolvimento (só o
 * verificar.mjs liga, para conferir os casos que rodam no dev).
 */
export default function pluginWeb({ cspNoDev = false } = {}) {
  let base = '/';
  let build = false;
  const fonte = readFileSync(raiz(BOOT_WEB), 'utf8');
  // No build, com o hash no nome: o arquivo pode ficar em cache para sempre.
  const nomeNoBuild = `assets/boot-web-${createHash('sha256').update(fonte).digest('hex').slice(0, 8)}.js`;
  const versao = versaoDoCargo();
  const buildDoTeste = process.env.TOMATITO_WEB_BUILD ?? '';
  const icones = ICONES.map((i) => {
    const conteudo = readFileSync(raiz(i.fonte));
    return { ...i, conteudo, publicado: nomeDoIcone(i.fonte, conteudo) };
  });
  // No dev, os ícones saem do lugar deles (o Vite serve o src/).
  const textoDoManifesto = (noBuild) =>
    `${JSON.stringify(
      manifesto({ base, icones: icones.map((i) => ({ src: noBuild ? i.publicado : i.fonte, lado: i.lado, proposito: i.proposito })) }),
      null,
      2,
    )}\n`;

  return {
    name: 'tomatito-web',
    configResolved(config) {
      base = config.base;
      build = config.command === 'build';
    },
    configureServer(servidor) {
      servidor.middlewares.use((req, res, next) => {
        const caminho = decodeURIComponent((req.url ?? '').split('?')[0]);
        const nome = caminho.startsWith(base) ? caminho.slice(base.length) : null;
        if (nome === SW.nome) {
          res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
          res.setHeader('Cache-Control', 'no-cache');
          res.end(readFileSync(raiz(SW.fonte)));
          return;
        }
        if (nome === MANIFESTO) {
          res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-cache');
          res.end(textoDoManifesto(false));
          return;
        }
        if (!nome || !Object.hasOwn(DOCUMENTOS, nome)) return next();
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end(readFileSync(raiz(DOCUMENTOS[nome])));
      });
    },
    buildStart() {
      if (!build) return;
      this.emitFile({ type: 'asset', fileName: nomeNoBuild, source: fonte });
      for (const [nome, origem] of Object.entries(DOCUMENTOS)) {
        this.emitFile({ type: 'asset', fileName: nome, source: readFileSync(raiz(origem)) });
      }
      for (const i of icones) this.emitFile({ type: 'asset', fileName: i.publicado, source: i.conteudo });
      this.emitFile({ type: 'asset', fileName: MANIFESTO, source: textoDoManifesto(true) });
      // W40a: as páginas estáticas (privacidade), como estão.
      for (const nome of arquivosPublicos()) {
        this.emitFile({ type: 'asset', fileName: nome, source: readFileSync(raiz(`${PUBLICO}/${nome}`)) });
      }
    },
    // Depois de tudo (inclusive o index.html do Vite): o sw.js com a lista
    // do que foi publicado.
    generateBundle: {
      order: 'post',
      handler(_opcoes, bundle) {
        if (!bundle['index.html']) throw new Error('plugin-web: o index.html não está no bundle do generateBundle');
        const conteudos = {};
        for (const [nome, item] of Object.entries(bundle)) {
          const [url] = listaDoPrecache([nome]);
          if (!url) continue;
          conteudos[url] = item.type === 'asset' ? item.source : item.code;
        }
        const precache = listaDoPrecache(Object.keys(bundle));
        const cache = nomeDoCache({ versao, conteudos, build: buildDoTeste });
        const sw = swDoBuild(readFileSync(raiz(SW.fonte), 'utf8'), { precache, cache, build: buildDoTeste });
        this.emitFile({ type: 'asset', fileName: SW.nome, source: sw });
        // W40a: os cabeçalhos do Pages, com o hash do boot do index.html final.
        const pagina = bundle['index.html'];
        this.emitFile({ type: 'asset', fileName: CABECALHOS, source: textoDosCabecalhos(String(pagina.source ?? pagina.code)) });
      },
    },
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const bootSrc = build ? `${base}${nomeNoBuild}` : `${base}${BOOT_WEB}`;
        return montarHead(html, { bootSrc, csp: build || cspNoDev, manifestHref: `${base}${MANIFESTO}` });
      },
    },
  };
}
