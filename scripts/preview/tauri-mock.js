// Mock da API do Tauri, só para prévia no navegador (scripts/preview).
// Nunca é importado pelo app: entra na página apenas pelo vite.config.js
// desta pasta. Os comandos respondem com dados fixos; acrescente aqui os
// que as telas passarem a chamar.
import { mockIPC, mockWindows } from '@tauri-apps/api/mocks';

const handlers = {};

mockWindows('main');
mockIPC((cmd, args) => {
  const h = handlers[cmd];
  if (!h) {
    console.warn('[prévia] comando sem mock:', cmd, args);
    return null;
  }
  return h(args);
});

window.__TOMATITO_PREVIEW__ = true;
