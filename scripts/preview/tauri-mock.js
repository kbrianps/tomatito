// Mock da API do Tauri, só para prévia no navegador (scripts/preview).
// Nunca é importado pelo app: entra na página apenas pelo vite.config.js
// desta pasta. Os comandos respondem com dados fixos; acrescente aqui os
// que as telas passarem a chamar.
//
// Parâmetros na URL (--path do shot.mjs):
//   ?plataforma=linux|windows   simula o window.__TT_PLATFORM__ do
//                               initialization_script (sem ele, fica "web")
//   ?maximizada=1               a janela começa maximizada
import { emit } from '@tauri-apps/api/event';
import { mockIPC, mockWindows } from '@tauri-apps/api/mocks';

const params = new URLSearchParams(location.search);
if (params.get('plataforma')) window.__TT_PLATFORM__ = params.get('plataforma');

// Estado da janela simulada; os botões da barra de título o alteram.
const janela = { maximizada: params.get('maximizada') === '1', visivel: false };
const redimensionou = () =>
  emit('tauri://resize', janela.maximizada ? { width: 1920, height: 1080 } : { width: 1000, height: 700 });

const handlers = {
  'plugin:window|is_maximized': () => janela.maximizada,
  'plugin:window|toggle_maximize': () => {
    janela.maximizada = !janela.maximizada;
    setTimeout(redimensionou);
    return null;
  },
  'plugin:window|show': () => ((janela.visivel = true), null),
  'plugin:window|minimize': () => (console.info('[prévia] minimizar'), null),
  'plugin:window|close': () => (console.info('[prévia] fechar'), null),
};

mockWindows('main');
mockIPC(
  (cmd, args) => {
    const h = handlers[cmd];
    if (!h) {
      console.warn('[prévia] comando sem mock:', cmd, args);
      return null;
    }
    return h(args);
  },
  { shouldMockEvents: true },
);

window.__TOMATITO_PREVIEW__ = true;
window.__TOMATITO_PREVIEW_JANELA__ = janela;
