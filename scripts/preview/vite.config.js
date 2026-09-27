// Configuração do Vite só para a prévia no navegador. Estende a do app e
// injeta o mock do Tauri no <head>. O build de produção usa o vite.config.js
// da raiz, que não conhece esta pasta.
import { fileURLToPath } from 'node:url';
import base from '../../vite.config.js';

const root = fileURLToPath(new URL('../..', import.meta.url));

// Globais do initialization_script (src-tauri/src/window/main_window.rs), lidas
// da URL (--path do shot.mjs): ?pref=lite|suave|light|dark|system|full,
// ?ultimo=<lastNormalTheme> e ?plataforma=linux|windows. Sem parâmetro, a
// global fica indefinida, como num navegador comum (o boot cai em lite e web).
const GLOBAIS = `(function(){var q=new URLSearchParams(location.search),w=window;
if(q.get('pref'))w.__TT_PREF__=q.get('pref');if(q.get('ultimo'))w.__TT_LAST__=q.get('ultimo');
if(q.get('plataforma'))w.__TT_PLATFORM__=q.get('plataforma');})();`;

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
      // Dois scripts no começo do <head>, antes do script de boot do app:
      // 1. um clássico e inline, que faz o papel do initialization_script do
      //    Rust (window.__TT_PREF__ e afins). Precisa ser clássico: o script de
      //    boot roda durante o parse, antes de qualquer módulo;
      // 2. o mock do Tauri, que é módulo e roda depois do parse.
      transformIndexHtml: () => [
        { tag: 'script', children: GLOBAIS, injectTo: 'head-prepend' },
        {
          tag: 'script',
          attrs: { type: 'module', src: '/scripts/preview/tauri-mock.js' },
          injectTo: 'head-prepend',
        },
      ],
    },
  ],
};
