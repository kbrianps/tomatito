// Componentes Fluent usados, um import por arquivo. Todo fluent-* precisa do
// seu import: o base.css esconde o que não foi definido (:not(:defined)).
import '@fluentui/web-components/switch.js';
import '@fluentui/web-components/radio.js';
import '@fluentui/web-components/radio-group.js';
import { setTheme } from '@fluentui/web-components/theme/set-theme.js';
import { webDarkTheme } from '@fluentui/tokens';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { montarBarraDeTitulo } from './components/title-bar.js';
setTheme(webDarkTheme);   // provisório: sai no M11

// Provisório até o M08, quando o script de boot do <head> grava os atributos a
// partir das globais do initialization_script (PLANO.md, 4.7).
const h = document.documentElement;
if (!h.dataset.platform) h.dataset.platform = window.__TT_PLATFORM__ ?? 'web';

const win = getCurrentWindow();
try {
  await montarBarraDeTitulo(document.querySelector('.tt-titlebar'), win);
} finally {
  // A main nasce com visible(false). Sem requestAnimationFrame aqui: com a
  // janela escondida, o WebKitGTK não gera quadros, e o callback só rodaria
  // depois do show() (ver docs/decisoes.md, M07). No M08, antes do show() o
  // main.js passa a esperar também os componentes e as fontes (PLANO.md, 4.7).
  await win.show();
}
