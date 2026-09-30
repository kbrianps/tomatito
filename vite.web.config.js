// Build da versão web (PLANO-WEB, 3.9; PLANO-WEB-V1, 3.4): o mesmo app, com
// o `#plataforma` apontando para src/platform/web (condição "tomatito-web")
// e um script clássico no começo do <head> fazendo o papel do
// initialization_script do Rust (o boot-web.js, pelo plugin-web.mjs). Só o
// index.html entra: o tomato.html (Full) fica fora da web.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defaultClientConditions } from 'vite';
import base from './vite.config.js';
import pluginWeb from './scripts/web/plugin-web.mjs';

const raiz = (arquivo) => fileURLToPath(new URL(arquivo, import.meta.url));

// A versão do Sobre é a do Cargo.toml, como no desktop (M39).
const cargo = readFileSync(raiz('src-tauri/Cargo.toml'), 'utf8');
const versao = /^\[package\][^[]*?^version = "([^"]+)"/m.exec(cargo)?.[1];
if (!versao) throw new Error('vite.web.config.js: versão não encontrada no src-tauri/Cargo.toml');

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
    // W07a: boot-web.js, theme-color, viewport, CSP no build e os documentos
    // do notices_read (scripts/web/plugin-web.mjs).
    pluginWeb({ cspNoDev: process.env.TOMATITO_WEB_CSP_DEV === '1' }),
  ],
};
