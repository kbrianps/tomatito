// Configuração do Vite só para a prévia no navegador. Estende a do app e
// injeta o mock do Tauri no <head>. O build de produção usa o vite.config.js
// da raiz, que não conhece esta pasta.
import { fileURLToPath } from 'node:url';
import base from '../../vite.config.js';

const root = fileURLToPath(new URL('../..', import.meta.url));

export default {
  ...base,
  root,
  configFile: false,
  server: { ...base.server, port: 5174, strictPort: false },
  plugins: [
    ...(base.plugins ?? []),
    {
      name: 'tomatito-preview-mock',
      apply: 'serve',
      transformIndexHtml: () => [
        {
          tag: 'script',
          attrs: { type: 'module', src: '/scripts/preview/tauri-mock.js' },
          injectTo: 'head-prepend',
        },
      ],
    },
  ],
};
