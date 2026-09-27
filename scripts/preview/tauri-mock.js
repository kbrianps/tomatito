// Mock da API do Tauri, só para prévia no navegador (scripts/preview).
// Nunca é importado pelo app: entra na página apenas pelo vite.config.js
// desta pasta. Os comandos respondem com dados fixos; acrescente aqui os
// que as telas passarem a chamar.
//
// Parâmetros na URL (--path do shot.mjs):
//   ?maximizada=1               a janela começa maximizada
//   ?tema-do-sistema=dark|light o que o win.theme() responde (padrão: dark)
// As globais do initialization_script (?pref, ?ultimo e ?plataforma) não são
// daqui: precisam existir antes do script de boot do <head>, e vêm do script
// clássico que o vite.config.js desta pasta põe antes dele.
import { emit } from '@tauri-apps/api/event';
import { mockIPC, mockWindows } from '@tauri-apps/api/mocks';
// Medidas do layout (M10): __ttMedidas, __ttMedir e __ttTema, para o --eval.
import './medidas.js';

const params = new URLSearchParams(location.search);

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
  'plugin:window|theme': () => params.get('tema-do-sistema') ?? 'dark',
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
