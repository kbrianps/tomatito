import { fileURLToPath } from 'node:url';

const entrada = (arquivo) => fileURLToPath(new URL(arquivo, import.meta.url));

export default {
  clearScreen: false,
  server: { strictPort: true },
  build: {
    // Duas páginas (PLANO.md, 3.7): a `main` e a `tomato` (Full, M50). No
    // Vite 8 a opção é `rolldownOptions`; `rollupOptions` ficou como apelido
    // obsoleto (docs/decisoes.md, M04).
    rolldownOptions: {
      input: {
        main: entrada('index.html'),
        tomato: entrada('tomato.html'),
      },
    },
  },
};
