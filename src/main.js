// Componentes Fluent usados, um import por arquivo. Todo fluent-* precisa do
// seu import: o base.css esconde o que não foi definido (:not(:defined)).
import '@fluentui/web-components/switch.js';
import '@fluentui/web-components/radio.js';
import '@fluentui/web-components/radio-group.js';
// M12: os demais controles da seção 1.1 (checkbox, dropdown, dialog, menu e
// tooltip), com as partes que cada um usa: a lista e as opções do dropdown, o
// corpo do diálogo e a lista e os itens do menu.
import '@fluentui/web-components/checkbox.js';
import '@fluentui/web-components/dropdown.js';
import '@fluentui/web-components/listbox.js';
import '@fluentui/web-components/option.js';
import '@fluentui/web-components/dialog.js';
import '@fluentui/web-components/dialog-body.js';
import '@fluentui/web-components/menu.js';
import '@fluentui/web-components/menu-list.js';
import '@fluentui/web-components/menu-item.js';
import '@fluentui/web-components/tooltip.js';
import { Updates } from '@microsoft/fast-element';
import { janelaAtual as getCurrentWindow, casca, palcoDaCasca } from '#plataforma';
import { ligarFormaCelular } from './lib/forma.js';
import { ligarTeclado } from './lib/teclado.js';

// A05 (Android): a casca e o layout de celular, antes de montar a interface.
// Na web, o boot-web.js já fez os dois.
if (casca.android) {
  document.documentElement.dataset.casca = 'android';
  if (casca.formaCelular) ligarFormaCelular();
  // A06: com o teclado aberto, a barra inferior some e o campo vem à vista.
  ligarTeclado();
}
import { montarBarraDeTitulo } from './components/title-bar.js';
import { icone } from './components/icon.js';
import { ligarDicas } from './components/dica.js';
import { montarNavegacao } from './components/nav-view.js';
import { ligarAtalhosDaJanela, ligarAtalhosDeNavegacao, ligarEscDasListas } from './lib/keys.js';
import { ligarBloqueiosDeProducao, ligarRecargaDoDev } from './lib/producao.js';
import { iniciarRoteador } from './router.js';
import { store } from './lib/store.js';
import * as ipc from './lib/ipc.js';
import { ligarAnuncioDeFases } from './lib/a11y.js';
import { entrarPagina } from './lib/movimento.js';
import { ligarLarguras } from './lib/larguras.js';
import { aplicarTema, ligarCoresDasBarras, ligarSistema, ligarTema, temaDeBase, temaDoSistemaAgora } from './lib/theme.js';
import * as foco from './views/focus/index.js';
import * as temporizador from './views/timers.js';
import * as cronometro from './views/stopwatch.js';
import * as configuracoes from './views/settings.js';
import * as dev from './views/dev-catalog.js';
import { ligar as ligarValidacaoDoFull } from './views/validacao-full.js';
import { ligarAvisosDoAndroid } from './views/avisos-android.js';
// Os tokens do Fluent vêm do fluent-tokens.gen.css, um bloco por data-theme
// (PLANO.md, 4.5): sem setTheme() em runtime desde o M11.

// Boot sem clarão (PLANO.md, 4.7). Os atributos de tema e de plataforma já
// estão no <html>, gravados pelo script do <head>. A main nasce escondida
// (visible(false)) e só aparece depois que a página está montada, os
// componentes usados estão definidos e as fontes carregadas, para o primeiro
// quadro já sair pintado. USADOS lista só as tags importadas acima; um teste
// confere as duas listas. O finally mostra a janela mesmo se algo falhar.
const USADOS = [
  'fluent-switch', 'fluent-radio', 'fluent-radio-group',
  'fluent-checkbox', 'fluent-dropdown', 'fluent-listbox', 'fluent-option',
  'fluent-dialog', 'fluent-dialog-body', 'fluent-menu', 'fluent-menu-list', 'fluent-menu-item',
  'fluent-tooltip',
];
const h = document.documentElement;
const win = getCurrentWindow();
// M37: no app de produção, sem o menu do WebView (fora dos campos de texto)
// e sem recarregar pelo F5 ou pelo Ctrl+R. No `dev:app`, os dois continuam
// (a recarga pelas teclas é nossa: o WebKitGTK não a tem). Antes de tudo,
// para valer mesmo se a montagem abaixo falhar. Na web (casca), nenhum dos
// dois: o F5 e o menu de contexto são do navegador.
if (casca.bloqueiosDeProducao) {
  if (import.meta.env.PROD) ligarBloqueiosDeProducao();
  else ligarRecargaDoDev();
}
// Sem transições até o primeiro quadro: a página é montada com a janela
// escondida, e uma troca de estilo aqui (o item atual do painel, por exemplo)
// viraria uma transição que só começa depois do show(), com o primeiro quadro
// ainda no meio dela (docs/decisoes.md, M09). A classe é a da troca de tema
// (4.6) e sai dois quadros depois do show().
h.classList.add('tt-no-transition');
let sistema = null;
try {
  // Painel e primeira tela (M09): o roteador desenha a tela do hash (ou a
  // Foco) já na chamada. Vêm antes da espera pelas fontes: o index.html não
  // tem texto próprio, e é este texto que faz o WebView pedir a Inter.
  // M16: o estado do foco vem do Rust (get_state e eventos). Começa agora e
  // entra na espera do primeiro quadro: a janela já abre com a contagem certa.
  const ligado = store.ligar().catch((erro) => console.error('[store]', erro));
  // M19: a região aria-live anuncia cada troca de fase (tt://phase).
  ligarAnuncioDeFases({ ipc }).catch((erro) => console.error('[anúncio]', erro));
  // M24: o Rust é o dono das configurações, e a main reflete cada gravação
  // (tt://settings) nos atributos de tema do <html> (4.6).
  ligarTema({ ipc, h }).catch((erro) => console.error('[tema]', erro));
  // A07a (PLANO-ANDROID 4.2): no Android, a cor atrás das barras do sistema
  // e a dos ícones delas acompanham o tema (nas outras plataformas, nada).
  ligarCoresDasBarras({ h, cores: ipc.android.cores });
  // M52: a validação com reversão do Full (5.9): a pergunta de 10 s e a
  // oferta do modo opaco, num diálogo por cima de qualquer tela.
  // Só no desktop: na web, o Full é um palco na própria página (abaixo).
  if (casca.full && !casca.web) ligarValidacaoDoFull({ ipc }).pronto.catch((erro) => console.error('[validação do Full]', erro));
  // v0.3: o Tomatito Full na web (views/palco-tomate.js), por cima do app.
  if (casca.full && casca.web) palcoDaCasca?.({ store }).catch((erro) => console.error('[palco]', erro));
  // M25: seguir o sistema, com as guardas (a) e (b) da 4.6. A troca pela
  // interface passa pelo `durante`, que segura as conferências até ela acabar.
  const midia = matchMedia('(prefers-color-scheme: dark)');
  sistema = ligarSistema({ win, h, gravar: ipc.configuracoes.gravar, midia, quadro: requestAnimationFrame });
  const tema = {
    aplicar: (pref) =>
      sistema.durante(
        aplicarTema(pref, {
          win,
          h,
          gravar: ipc.configuracoes.gravar,
          trocarModo: ipc.full.trocarModo, // M51: entrar no Full e sair dele (5.7)
          quadro: requestAnimationFrame,
          escuroPelaMidia: () => midia.matches,
        }),
      ),
  };
  // M43: as larguras em px CSS para as fontes que acompanham a janela (o
  // WebKitGTK erra o vw e o cqi do font-size com zoom). Antes da primeira
  // tela, para o número dela já sair do tamanho certo.
  document.querySelector('.tt-rolagem').dataset.largura = '--tt-larg-rolagem';
  ligarLarguras();
  // A13 (PLANO-ANDROID 4.3): no Android, o cartão "Avisos", a faixa da tela
  // Foco e o pedido no primeiro "Iniciar" (nas outras plataformas, null).
  const avisosDoAndroid = ligarAvisosDoAndroid({ api: ipc.android, store, icone });
  const nav = montarNavegacao(document.querySelector('.tt-nav'), {
    icone,
    navegar: (rota) => roteador.navegar(rota),
  });
  // W31 (web): a barra inferior do layout de celular (PLANO-WEB-V1, 5.2). Só a
  // casca web a cria; quem a mostra é o celular.css, sob [data-forma="celular"].
  let barra = null;
  if (casca.formaCelular) {
    const el = document.createElement('nav');
    el.className = 'tt-barra-inferior';
    document.querySelector('.tt-janela').append(el);
    barra = montarNavegacao(el, { icone, navegar: (rota) => roteador.navegar(rota), orientacao: 'inline' });
  }
  const roteador = iniciarRoteador({
    raiz: document.querySelector('.tt-rolagem'),
    telas: { foco, temporizador, cronometro, configuracoes, dev },
    contexto: { icone, tema },
    // M41: a tela nova entra com fade e subida; a primeira, não (a janela
    // abre já pintada, 4.7).
    aoMudar: (rota, anterior) => {
      nav.selecionar(rota, { animar: anterior !== null });
      barra?.selecionar(rota, { animar: anterior !== null });
      avisosDoAndroid?.aoMudar(rota, document.querySelector('.tt-rolagem'));
      if (anterior !== null) entrarPagina(document.querySelector('.tt-rolagem'));
    },
  });
  // Na web, o Ctrl+1–3 fica com o navegador (trocar de aba).
  if (casca.atalhosDeNavegacao) ligarAtalhosDeNavegacao((rota) => roteador.navegar(rota));
  ligarEscDasListas();
  // M37: Ctrl+W fecha a janela (esconde, com "fechar para a bandeja" ligado)
  // e Ctrl+Q sai do app (3.4 e 3.8).
  if (casca.atalhosDaJanela) ligarAtalhosDaJanela({ fechar: () => win.close(), sair: ipc.sair });
  // Dica dos botões só de ícone (M13): uma para a página inteira.
  ligarDicas();

  // Força o layout do texto novo, para as fontes dele entrarem no
  // document.fonts.ready (sem isso, o ready poderia resolver antes de o
  // WebView pedir a Inter, e a janela abriria com a fonte de reserva).
  void document.body.offsetHeight;
  const pronto = Promise.all([...USADOS.map((t) => customElements.whenDefined(t)), document.fonts.ready, ligado]);
  await Promise.race([pronto, new Promise((r) => setTimeout(r, 2000))]);   // nunca deixar a janela presa escondida

  await montarBarraDeTitulo(document.querySelector('.tt-titlebar'), win);
  if (temaDeBase(h) === 'system') {
    const t = await temaDoSistemaAgora(win, h, () => midia.matches);
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
// M25: uma conferência depois do primeiro quadro. No Sistema, grava o
// resolvedTheme se o sistema mudou com o app fechado (a próxima partida nasce
// na cor certa); fora dele, confere o tema nativo (guarda (b)).
sistema?.conferir().then(async (r) => {
  if (r !== 'igual' || temaDeBase(h) !== 'system') return;
  const s = await ipc.configuracoes.obter();
  if (s?.resolvedTheme !== h.dataset.theme) await ipc.configuracoes.gravar({ resolvedTheme: h.dataset.theme });
}).catch((erro) => console.error('[tema]', erro));
