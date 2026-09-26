import { fileURLToPath } from 'node:url';

const entrada = (arquivo) => fileURLToPath(new URL(arquivo, import.meta.url));

export default {
  clearScreen: false,
  server: { strictPort: true },
  build: {
    // Duas páginas: a `main` e a `tomato` (Full). No Vite 8 a opção é
    // `rolldownOptions`; `rollupOptions` ficou como apelido obsoleto.
    rolldownOptions: {
      input: {
        main: entrada('index.html'),
        tomato: entrada('tomato.html'),
      },
    },
  },
};
