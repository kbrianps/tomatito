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
  // O mock entra pelo transformIndexHtml, que o Vite não varre ao pré-empacotar
  // as dependências. Sem esta lista, a primeira prévia depois de limpar o cache
  // descobre as dependências do mock com a página aberta, o Vite recarrega a
  // página, e o shot.mjs fica esperando uma avaliação que não volta (M07).
  optimizeDeps: {
    ...base.optimizeDeps,
    include: [...(base.optimizeDeps?.include ?? []), '@tauri-apps/api/mocks', '@tauri-apps/api/event'],
  },
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
