// Build da versão web (PLANO-WEB, 3.9; PLANO-WEB-V1, 3.4): o mesmo app, com
// o `#plataforma` apontando para src/platform/web (condição "tomatito-web")
// e um script clássico no começo do <head> fazendo o papel do
// initialization_script do Rust. Só o index.html entra: o tomato.html (Full)
// fica fora da web.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defaultClientConditions } from 'vite';
import base from './vite.config.js';

const raiz = (arquivo) => fileURLToPath(new URL(arquivo, import.meta.url));

// A versão do Sobre é a do Cargo.toml, como no desktop (M39).
const cargo = readFileSync(raiz('src-tauri/Cargo.toml'), 'utf8');
const versao = /^\[package\][^[]*?^version = "([^"]+)"/m.exec(cargo)?.[1];
if (!versao) throw new Error('vite.web.config.js: versão não encontrada no src-tauri/Cargo.toml');

// PROVISÓRIO (W03a): antes do script de boot do index.html, o tema salvo e o
// data-casca="web". No W07a passa para o boot-web.js (plugin-web.mjs).
const GLOBAIS = `(function(){var w=window;try{var s=JSON.parse(localStorage.getItem('tomatito:config')||'null');
if(s&&s.theme){w.__TT_PREF__=s.theme;w.__TT_LAST__=s.lastNormalTheme;}}catch(e){}
document.documentElement.dataset.casca='web';})();`;

// W06b: os arquivos que o notices_read da web busca (PLANO-WEB-V1, 3.2), os
// mesmos do bundle.resources do desktop (M46), ao lado do index.html: no
// build, copiados para o dist-web; no dev, servidos do lugar deles. No W07a
// passa para o plugin-web.mjs.
const DOCUMENTOS = { 'THIRD_PARTY_NOTICES.md': 'THIRD_PARTY_NOTICES.md', 'OFL-Inter.txt': 'src/assets/OFL-Inter.txt' };
const documentos = {
  name: 'tomatito-web-documentos',
  configureServer(servidor) {
    servidor.middlewares.use((req, res, next) => {
      const caminho = decodeURIComponent((req.url ?? '').split('?')[0]);
      const base = servidor.config.base;
      const nome = caminho.startsWith(base) ? caminho.slice(base.length) : null;
      if (!nome || !Object.hasOwn(DOCUMENTOS, nome)) return next();
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end(readFileSync(raiz(DOCUMENTOS[nome])));
    });
  },
  generateBundle() {
    for (const [nome, origem] of Object.entries(DOCUMENTOS)) {
      this.emitFile({ type: 'asset', fileName: nome, source: readFileSync(raiz(origem)) });
    }
  },
};

export default {
  ...base,
  base: process.env.TOMATITO_WEB_BASE ?? '/',
  resolve: { ...base.resolve, conditions: ['tomatito-web', ...defaultClientConditions] },
  define: { ...base.define, __TOMATITO_VERSAO__: JSON.stringify(versao) },
  // Portas próprias (a 5173 e a 5174 são do desktop e da prévia; a 4273, dos
  // testes do verificar.mjs, que passa a sua).
  server: { ...base.server, port: 5273, strictPort: true },
  preview: { ...base.preview, port: 4173, strictPort: true },
  build: {
    ...base.build,
    outDir: 'dist-web',
    emptyOutDir: true,
    rolldownOptions: { ...base.build?.rolldownOptions, input: { main: raiz('index.html') } },
  },
  plugins: [
    ...(base.plugins ?? []),
    documentos,
    { name: 'tomatito-web-globais', transformIndexHtml: () => [{ tag: 'script', children: GLOBAIS, injectTo: 'head-prepend' }] },
  ],
};
