// Componentes Fluent usados, um import por arquivo. Todo fluent-* precisa do
// seu import: o base.css esconde o que não foi definido (:not(:defined)).
import '@fluentui/web-components/switch.js';
import '@fluentui/web-components/radio.js';
import '@fluentui/web-components/radio-group.js';
import { setTheme } from '@fluentui/web-components/theme/set-theme.js';
import { webDarkTheme } from '@fluentui/tokens';
import { Updates } from '@microsoft/fast-element';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { montarBarraDeTitulo } from './components/title-bar.js';
setTheme(webDarkTheme);   // provisório: sai no M11

// Boot sem clarão (PLANO.md, 4.7). Os atributos de tema e de plataforma já
// estão no <html>, gravados pelo script do <head>. A main nasce escondida
// (visible(false)) e só aparece depois que os componentes usados estão
// definidos e as fontes carregadas, para o primeiro quadro já sair pintado.
// USADOS lista só as tags importadas acima; um teste confere as duas listas.
const USADOS = ['fluent-switch', 'fluent-radio', 'fluent-radio-group'];
const pronto = Promise.all([...USADOS.map((t) => customElements.whenDefined(t)), document.fonts.ready]);
await Promise.race([pronto, new Promise((r) => setTimeout(r, 2000))]);   // nunca deixar a janela presa escondida

const h = document.documentElement;
const win = getCurrentWindow();
try {
  await montarBarraDeTitulo(document.querySelector('.tt-titlebar'), win);
  const base = h.dataset.themePref === 'full' ? (window.__TT_LAST__ || 'lite') : h.dataset.themePref;
  if (base === 'system') {
    const t = await win.theme();
    if (t) h.dataset.theme = t;
  }
} finally {
  // A fila de atualizações do FAST (a base dos componentes Fluent) roda num
  // requestAnimationFrame, que não dispara com a janela escondida. Sem esvaziar
  // a fila aqui, o primeiro quadro sairia com os componentes pela metade (o
  // radio marcado só aparecia no quadro seguinte; docs/decisoes.md, M08).
  Updates.process();
  // Sem requestAnimationFrame aqui, ao contrário da 4.7, pelo mesmo motivo: o
  // callback só rodaria depois do show() (docs/decisoes.md, M07 e M08). O
  // finally mostra a janela mesmo se a barra ou o tema falharem.
  await win.show();
}
