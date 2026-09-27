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
import { icone } from './components/icon.js';
import { montarNavegacao } from './components/nav-view.js';
import { ligarAtalhosDeNavegacao } from './lib/keys.js';
import { iniciarRoteador } from './router.js';
import * as foco from './views/focus/index.js';
import * as temporizador from './views/timers.js';
import * as cronometro from './views/stopwatch.js';
import * as configuracoes from './views/settings.js';
import * as dev from './views/dev-catalog.js';
setTheme(webDarkTheme);   // provisório: sai no M11

// Boot sem clarão (PLANO.md, 4.7). Os atributos de tema e de plataforma já
// estão no <html>, gravados pelo script do <head>. A main nasce escondida
// (visible(false)) e só aparece depois que a página está montada, os
// componentes usados estão definidos e as fontes carregadas, para o primeiro
// quadro já sair pintado. USADOS lista só as tags importadas acima; um teste
// confere as duas listas. O finally mostra a janela mesmo se algo falhar.
const USADOS = ['fluent-switch', 'fluent-radio', 'fluent-radio-group'];
const h = document.documentElement;
const win = getCurrentWindow();
// Sem transições até o primeiro quadro: a página é montada com a janela
// escondida, e uma troca de estilo aqui (o item atual do painel, por exemplo)
// viraria uma transição que só começa depois do show(), com o primeiro quadro
// ainda no meio dela (docs/decisoes.md, M09). A classe é a da troca de tema
// (4.6) e sai dois quadros depois do show().
h.classList.add('tt-no-transition');
try {
  // Painel e primeira tela (M09): o roteador desenha a tela do hash (ou a
  // Foco) já na chamada. Vêm antes da espera pelas fontes: o index.html não
  // tem texto próprio, e é este texto que faz o WebView pedir a Inter.
  const nav = montarNavegacao(document.querySelector('.tt-nav'), {
    icone,
    navegar: (rota) => roteador.navegar(rota),
  });
  const roteador = iniciarRoteador({
    raiz: document.querySelector('.tt-rolagem'),
    telas: { foco, temporizador, cronometro, configuracoes, dev },
    aoMudar: (rota, anterior) => nav.selecionar(rota, { animar: anterior !== null }),
  });
  ligarAtalhosDeNavegacao((rota) => roteador.navegar(rota));

  // Força o layout do texto novo, para as fontes dele entrarem no
  // document.fonts.ready (sem isso, o ready poderia resolver antes de o
  // WebView pedir a Inter, e a janela abriria com a fonte de reserva).
  void document.body.offsetHeight;
  const pronto = Promise.all([...USADOS.map((t) => customElements.whenDefined(t)), document.fonts.ready]);
  await Promise.race([pronto, new Promise((r) => setTimeout(r, 2000))]);   // nunca deixar a janela presa escondida

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
  // callback só rodaria depois do show() (docs/decisoes.md, M07 e M08).
  await win.show();
}
requestAnimationFrame(() => requestAnimationFrame(() => h.classList.remove('tt-no-transition')));
