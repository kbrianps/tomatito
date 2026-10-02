// Painel de navegação da janela main (PLANO.md, M09 e 3.8), no desenho do
// NavigationView do WinUI (medidas no shell.css).
//
// - <nav aria-label="Principal">, com os itens como links (<a href="#/…">) e
//   aria-current="page" no da tela atual. Foco, Temporizador e Cronômetro em
//   cima; Configurações no rodapé.
// - Teclado: o painel inteiro é um grupo de foco (focusgroup), uma parada só
//   do Tab. O Tab entra pelo item da tela atual, ↑/↓ andam entre os quatro
//   itens (Home e End vão ao primeiro e ao último), Enter abre, e o Tab
//   seguinte sai do painel. É o atributo focusgroup nativo onde ele existe (o
//   Chromium do WebView2 no Windows) e o polyfill que já vem com o Fluent
//   (@microsoft/focusgroup-polyfill) onde não existe (o WebKitGTK no Linux),
//   com a mesma definição.
// - O indicador de 3 × 16 px desliza do item anterior para o novo em
//   --tt-dur-in (250 ms) com --tt-ease-point. Cada item tem o seu indicador,
//   e só o do selecionado aparece: a posição de repouso vem do CSS e acompanha
//   qualquer mudança de layout (zoom, altura da janela) sem JS. A animação
//   (Web Animations, sem estilo em linha) parte de onde o indicador anterior
//   estava, inclusive no meio de outra animação. Com prefers-reduced-motion,
//   no lugar do deslize, um fade de 83 ms (--tt-dur-fast).
// - M10: abaixo de 860 px de janela, o painel compacta para 48 px, só com os
//   ícones (shell.css). Cada item traz a sua dica, que só existe no painel
//   compacto; este arquivo só cuida de dispensá-la (ligarDicas).
// - W31 (web, layout de celular): com `orientacao: 'inline'`, o mesmo
//   componente desenha a barra inferior (PLANO-WEB-V1, 5.2): os quatro itens
//   numa lista só, lado a lado, ←/→ no lugar de ↑/↓, o indicador deslizando
//   na horizontal e sem dica. O desktop chama sem o parâmetro e nada muda.
import { FocusGroup } from '@microsoft/focusgroup-polyfill/shadowless';
import t from '../lib/i18n/pt-BR.js';
import { hashDaRota } from '../router.js';

export const ITENS = Object.freeze([
  Object.freeze({ rota: 'foco', icone: 'target' }),
  Object.freeze({ rota: 'temporizador', icone: 'hourglass_half' }),
  Object.freeze({ rota: 'cronometro', icone: 'timer' }),
]);
export const RODAPE = Object.freeze([Object.freeze({ rota: 'configuracoes', icone: 'settings' })]);

// A mesma definição nos dois caminhos: o atributo (nativo) e o objeto (polyfill).
// "toolbar" é só o comportamento-base do grupo; o <nav> não tem papel genérico,
// então nenhum dos dois caminhos troca o papel dele nem o dos links.
export const FOCUSGROUP = 'toolbar block nomemory';
export const DEFINICAO = Object.freeze({ behavior: 'toolbar', axis: 'block', wrap: false, memory: false });
export const FOCUSGROUP_INLINE = 'toolbar inline nomemory';
export const DEFINICAO_INLINE = Object.freeze({ behavior: 'toolbar', axis: 'inline', wrap: false, memory: false });

// A dica (M10) repete o rótulo e só aparece no painel compacto (shell.css). É
// aria-hidden: o nome do link continua vindo do rótulo, que no painel compacto
// sai da tela sem sair da árvore de acessibilidade.
const item = ({ rota, icone: nome }, atual, icone, comDica = true) =>
  `<li><a class="tt-nav-item" href="${hashDaRota(rota)}" data-rota="${rota}" draggable="false"` +
  `${rota === atual ? ' aria-current="page" focusgroupstart' : ''}>` +
  '<span class="tt-nav-indicador" aria-hidden="true"></span>' +
  `${icone(nome)}<span class="tt-nav-rotulo">${t.navegacao[rota]}</span>` +
  `${comDica ? `<span class="tt-nav-dica" aria-hidden="true">${t.navegacao[rota]}</span>` : ''}</a></li>`;

/**
 * HTML interno do painel. `icone(nome)` devolve o SVG de um ícone (o
 * components/icon.js no app; os testes passam um falso).
 */
export function marcacao(atual, icone, { orientacao = 'block' } = {}) {
  const inline = orientacao === 'inline';
  const lista = (itens, classe) =>
    `<ul class="${classe}">${itens.map((i) => item(i, atual, icone, !inline)).join('')}</ul>`;
  // Na barra inferior (W31), os quatro destinos numa lista só.
  if (inline) return lista([...ITENS, ...RODAPE], 'tt-nav-lista');
  return lista(ITENS, 'tt-nav-lista') + lista(RODAPE, 'tt-nav-lista tt-nav-rodape');
}

// Duração de um token de tempo (--tt-dur-*), em ms.
function duracao(nome) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
  const n = parseFloat(v);
  return Number.isFinite(n) ? (v.endsWith('ms') ? n : n * 1000) : 0;
}

/**
 * Anima o indicador de `para` a partir de onde o de `de` estava (`topoDe`,
 * medido antes da troca). Com movimento reduzido, os dois só trocam com fade.
 */
function animarIndicador(indDe, indPara, posDe, inline = false) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const fade = { duration: duracao('--tt-dur-fast'), easing: 'linear' };
    indDe.animate([{ opacity: 1 }, { opacity: 0 }], fade);
    indPara.animate([{ opacity: 0 }, { opacity: 1 }], fade);
    return;
  }
  const agora = indPara.getBoundingClientRect();
  const d = posDe - (inline ? agora.left : agora.top);
  if (!d) return;
  const eixo = inline ? 'X' : 'Y';
  const easing = getComputedStyle(document.documentElement).getPropertyValue('--tt-ease-point').trim() || 'ease';
  indPara.animate([{ transform: `translate${eixo}(${d}px)` }, { transform: `translate${eixo}(0)` }], {
    duration: duracao('--tt-dur-in'),
    easing,
  });
}

const itemDe = (el) => (el instanceof Element ? el.closest('a.tt-nav-item') : null);

/**
 * Dicas do painel compacto (M10). Quando e onde elas aparecem está no
 * shell.css; aqui fica só o que o CSS não sabe fazer: dispensar. A dica some ao
 * apertar o item (como no WinUI) e com Esc, sem mover o mouse nem o foco (WCAG
 * 1.4.13), e continua dispensada até o mouse sair daquele item ou chegar a
 * outro, ou até o foco do teclado ir para outro item.
 */
function ligarDicas(nav) {
  let dispensada = null;
  const dispensar = (a) => {
    dispensada = a;
    nav.classList.add('tt-nav-sem-dica');
  };
  const liberar = () => {
    dispensada = null;
    nav.classList.remove('tt-nav-sem-dica');
  };
  nav.addEventListener('pointerdown', (e) => {
    const a = itemDe(e.target);
    if (a) dispensar(a);
  });
  nav.addEventListener('pointerover', (e) => {
    const a = itemDe(e.target);
    if (a && a !== dispensada) liberar();
  });
  nav.addEventListener('pointerout', (e) => {
    const a = itemDe(e.target);
    if (a && a === dispensada && itemDe(e.relatedTarget) !== a) liberar();
  });
  nav.addEventListener('focusin', (e) => {
    const a = itemDe(e.target);
    if (a && a !== dispensada) liberar();
  });
  // Esc vale com o foco em qualquer lugar: a dica do mouse aparece sem foco.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const a = nav.querySelector('.tt-nav-item:hover') ?? nav.querySelector('.tt-nav-item:focus-visible');
    if (a) dispensar(a);
  });
}

/**
 * Desenha o painel em `nav` e liga cliques e teclado. `navegar(rota)` pede a
 * troca de tela ao roteador; o painel só muda quando o roteador chama
 * `selecionar(rota)`, depois de trocar a tela.
 */
export function montarNavegacao(nav, { icone, navegar, orientacao = 'block' }) {
  const inline = orientacao === 'inline';
  nav.setAttribute('aria-label', t.navegacao.rotulo);
  nav.setAttribute('focusgroup', inline ? FOCUSGROUP_INLINE : FOCUSGROUP);
  nav.innerHTML = marcacao(null, icone, { orientacao });
  const links = [...nav.querySelectorAll('a.tt-nav-item')];
  const doIndice = (i) => (i >= 0 && i < links.length ? links[i] : null);

  // Coleção de itens para o polyfill (a mesma forma da ArrayItemCollection do
  // Fluent). Onde o focusgroup é nativo, o construtor não faz nada.
  const grupo = new FocusGroup(
    nav,
    {
      *items() {
        for (const element of links) yield { element };
      },
      first: () => doIndice(0),
      last: () => doIndice(links.length - 1),
      next: (el) => (links.includes(el) ? doIndice(links.indexOf(el) + 1) : null),
      previous: (el) => (links.includes(el) ? doIndice(links.indexOf(el) - 1) : null),
      contains: (el) => links.includes(el),
      get start() {
        return links.find((a) => a.hasAttribute('focusgroupstart')) ?? null;
      },
    },
    { definition: inline ? DEFINICAO_INLINE : DEFINICAO },
  );

  // Todo clique num item passa pelo roteador, inclusive com Ctrl ou Shift (que
  // pediriam outra janela) e com o botão do meio (auxclick).
  nav.addEventListener('click', (e) => {
    const a = e.target.closest('a.tt-nav-item');
    if (!a) return;
    e.preventDefault();
    navegar(a.dataset.rota);
  });
  nav.addEventListener('auxclick', (e) => {
    if (e.target.closest('a')) e.preventDefault();
  });
  if (!inline) ligarDicas(nav);

  return {
    /** Marca o item da rota (nenhum, no #/dev) e anima o indicador. */
    selecionar(rota, { animar = true } = {}) {
      const de = links.find((a) => a.hasAttribute('aria-current')) ?? null;
      const para = links.find((a) => a.dataset.rota === rota) ?? null;
      if (de === para) return;
      const indDe = de?.querySelector('.tt-nav-indicador');
      const indPara = para?.querySelector('.tt-nav-indicador');
      // Onde o indicador anterior está agora (com a animação em curso, se houver).
      const retDe = indDe?.getBoundingClientRect();
      const posDe = inline ? retDe?.left : retDe?.top;
      for (const ind of [indDe, indPara]) for (const a of ind?.getAnimations() ?? []) a.cancel();
      if (de) {
        de.removeAttribute('aria-current');
        de.removeAttribute('focusgroupstart');
      }
      if (para) {
        para.setAttribute('aria-current', 'page');
        para.setAttribute('focusgroupstart', '');
      }
      grupo.update(); // a parada do Tab passa a ser o item novo
      if (animar && indDe && indPara) animarIndicador(indDe, indPara, posDe, inline);
    },
  };
}
