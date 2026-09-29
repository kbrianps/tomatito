// Página de fumaça do WASM (PLANO-WEB, W01b): um build de verdade, com o
// Vite do projeto e a base `/` da web (PLANO-WEB-V1, 3.4), que importa o
// pacote do `npm run wasm` (src/platform/web/pkg/) sem plugin de wasm. O
// glue do wasm-bindgen pede o `.wasm` por `new URL(…, import.meta.url)`, e o
// Vite o emite em `/assets/` com hash no nome (conferido pelo item (a) do
// caso fumaça).
//
// Quem usa é o `verificar.mjs --servidor fumaca`: ele faz o build numa pasta
// temporária (fora do repositório) e serve com `vite preview` na 4273.
// Tem também a página da sonda de celular (casos/sonda-celular.mjs).
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = (arquivo) => fileURLToPath(new URL(arquivo, import.meta.url));

export default {
  root: aqui('.'),
  base: '/',
  configFile: false,
  clearScreen: false,
  logLevel: 'warn',
  publicDir: false,
  build: {
    outDir: process.env.TOMATITO_FUMACA_DIST ?? join(tmpdir(), 'tomatito-fumaca-dist'),
    emptyOutDir: true,
    rolldownOptions: {
      input: {
        index: aqui('index.html'),
        'sonda-celular': aqui('sonda-celular.html'),
      },
    },
  },
  preview: { host: 'localhost', port: 4273, strictPort: true, open: false },
};
