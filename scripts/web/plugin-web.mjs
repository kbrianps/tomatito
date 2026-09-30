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
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
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

const sha256 = (texto) => createHash('sha256').update(texto).digest('base64');

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
export function montarHead(html, { bootSrc, csp }) {
  const charset = /<meta charset="UTF-8" \/>\n?/i.exec(html);
  if (!charset) throw new Error('plugin-web: <meta charset> não encontrado no index.html');
  const viewport = /<meta name="viewport" content="[^"]*" \/>/;
  if (!viewport.test(html)) throw new Error('plugin-web: <meta name="viewport"> não encontrada no index.html');
  const recuo = '    ';
  const tags = [
    `<meta name="theme-color" content="${COR_INICIAL}" />`,
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
        if (!nome || !Object.hasOwn(DOCUMENTOS, nome)) return next();
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end(readFileSync(raiz(DOCUMENTOS[nome])));
      });
    },
    buildStart() {
      if (!build) return;
      this.emitFile({ type: 'asset', fileName: nomeNoBuild, source: fonte });
      this.emitFile({ type: 'asset', fileName: SW.nome, source: readFileSync(raiz(SW.fonte), 'utf8') });
      for (const [nome, origem] of Object.entries(DOCUMENTOS)) {
        this.emitFile({ type: 'asset', fileName: nome, source: readFileSync(raiz(origem)) });
      }
    },
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const bootSrc = build ? `${base}${nomeNoBuild}` : `${base}${BOOT_WEB}`;
        return montarHead(html, { bootSrc, csp: build || cspNoDev });
      },
    },
  };
}
