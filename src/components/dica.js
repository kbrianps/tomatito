// Dica dos botões só de ícone (PLANO.md, 3.8: "botões só de ícone têm sempre
// aria-label e tooltip"; a escolha ficou para o M13, docs/decisoes.md, M12 e
// M13).
//
// Qualquer elemento com o atributo data-dica ganha a dica, com o texto do
// próprio aria-label. É uma dica só para a página inteira: um <div
// popover="manual"> na camada de cima, ancorado ao botão da vez pelo CSS
// Anchor Positioning (o desenho e a posição estão no controls.css). Por que
// não o fluent-tooltip, que continua valendo para textos que completam um
// rótulo visível:
// - ele é um popover "auto", e mostrar uma dica fechava um menu aberto; a
//   manual não fecha nada;
// - ele grava aria-describedby no botão, e com o mesmo texto do aria-label o
//   leitor de tela repetiria o nome; esta é aria-hidden;
// - uma dica por botão, com o seu id, viraria dezenas de elementos nas telas
//   do temporizador; esta é uma só.
//
// Quando aparece e some (como a dica do painel compacto, M10, e o
// fluent-tooltip):
// - 250 ms depois de o mouse parar no botão ou de o foco do teclado chegar
//   nele (só :focus-visible; o clique não mostra); com outra dica aberta, na
//   hora;
// - some ao apertar o botão, com Esc (sem mover o mouse nem o foco, WCAG
//   1.4.13) e quando o mouse e o foco saem dele; o mouse pode passar para cima
//   da dica sem ela sumir (a folga de 100 ms cobre o vão de 4 px);
// - dispensada (clique ou Esc), só volta depois que o mouse sai do botão ou o
//   foco vai para outro lugar;
// - nunca em botão desabilitado, como no WinUI;
// - some também na troca de tela e quando a janela perde o foco.
export const ATRASO = 250; // ms: o do fluent-tooltip e o da dica do painel (M10)
export const FOLGA = 100; // ms entre sair do botão e a dica sumir
export const ANCORA = '--tt-dica-alvo';

/** O texto da dica de um elemento: o aria-label, sem espaços nas pontas. */
export function textoDaDica(el) {
  return (el?.getAttribute?.('aria-label') ?? '').trim();
}

/**
 * Liga as dicas no documento e devolve { elemento, esconder, desligar }.
 * `doc` e `win` são o document e a window da página.
 */
export function ligarDicas(doc = document, win = window) {
  const dica = doc.createElement('div');
  dica.className = 'tt-dica';
  dica.setAttribute('popover', 'manual');
  dica.setAttribute('aria-hidden', 'true');
  doc.body.append(dica);

  let alvo = null; // o botão com a dica aberta
  let pendente = null; // o botão que vai ganhar a dica quando o atraso acabar
  let dispensado = null; // o botão cuja dica foi dispensada (clique ou Esc)
  let relogio = 0;

  const alvoDe = (no) => (no instanceof win.Element ? no.closest('[data-dica]') : null);
  const aberta = () => dica.matches(':popover-open');
  const soltarAncora = () => {
    alvo?.style.removeProperty('anchor-name');
    alvo = null;
  };
  const esconder = () => {
    win.clearTimeout(relogio);
    pendente = null;
    if (aberta()) dica.hidePopover();
    soltarAncora();
  };
  const mostrar = (el) => {
    pendente = null;
    const texto = textoDaDica(el);
    if (!el.isConnected || el === dispensado || el.matches(':disabled') || !texto) return;
    if (alvo !== el) soltarAncora();
    alvo = el;
    el.style.setProperty('anchor-name', ANCORA);
    dica.textContent = texto;
    if (!aberta()) dica.showPopover();
  };
  const agendar = (el) => {
    if (el === alvo && aberta()) {
      win.clearTimeout(relogio); // voltou para o botão (ou para a dica) antes de sumir
      return;
    }
    if (el === pendente) return;
    win.clearTimeout(relogio);
    pendente = el;
    // Com uma dica já aberta, a do botão seguinte vem sem o atraso, como nas
    // dicas do Windows ao correr o mouse por uma fila de botões.
    relogio = win.setTimeout(() => mostrar(el), aberta() ? 0 : ATRASO);
  };
  // Some depois da folga, a não ser que o mouse esteja no botão ou na dica, ou
  // o foco do teclado continue no botão.
  const talvezEsconder = () => {
    // Uma dica pedida pelo teclado (ainda no atraso) não é cancelada pelo
    // mouse passando por outro lugar da página.
    if (pendente && pendente.matches(':focus-visible')) return;
    win.clearTimeout(relogio);
    pendente = null;
    relogio = win.setTimeout(() => {
      const el = alvo;
      if (el && (el.matches(':hover') || dica.matches(':hover') || el.matches(':focus-visible'))) return;
      esconder();
    }, FOLGA);
  };

  const aoEntrar = (e) => {
    // W32 (PLANO-WEB-V1, 5.3): dica não abre por toque. Vale também no desktop
    // com tela de toque; por mouse e teclado nada muda (docs/decisoes.md).
    if (e.pointerType === 'touch') return;
    if (e.target === dica || dica.contains(e.target)) {
      if (aberta()) win.clearTimeout(relogio);
      return;
    }
    const el = alvoDe(e.target);
    if (el) {
      if (el !== dispensado) agendar(el);
    } else if (alvo || pendente) talvezEsconder();
  };
  const aoSair = (e) => {
    const el = alvoDe(e.target);
    const para = e.relatedTarget;
    if (el && para instanceof win.Node && el.contains(para)) return; // dentro do mesmo botão
    if (el && el === dispensado) dispensado = null;
    if ((el && (el === alvo || el === pendente)) || e.target === dica) talvezEsconder();
  };
  const aoApertar = (e) => {
    const el = alvoDe(e.target);
    if (!el) return;
    dispensado = el;
    esconder();
  };
  const aoFocar = (e) => {
    const el = alvoDe(e.target);
    if (dispensado && el !== dispensado) dispensado = null;
    if (el && el.matches(':focus-visible')) agendar(el);
  };
  const aoDesfocar = (e) => {
    const el = alvoDe(e.target);
    if (el && (el === alvo || el === pendente)) talvezEsconder();
  };
  // Esc fecha só a dica (a tecla não chega ao diálogo em volta, como o Esc de
  // uma lista aberta, keys.js); sem dica aberta, o Esc segue o caminho normal.
  const aoTeclar = (e) => {
    if (e.key !== 'Escape' || !(aberta() || pendente)) return;
    if (aberta()) {
      e.preventDefault();
      e.stopPropagation();
    }
    dispensado = alvo ?? pendente;
    esconder();
  };

  doc.addEventListener('pointerover', aoEntrar);
  doc.addEventListener('pointerout', aoSair);
  doc.addEventListener('pointerdown', aoApertar, true);
  doc.addEventListener('focusin', aoFocar);
  doc.addEventListener('focusout', aoDesfocar);
  doc.addEventListener('keydown', aoTeclar, true);
  win.addEventListener('hashchange', esconder);
  win.addEventListener('blur', esconder);

  return {
    elemento: dica,
    esconder,
    desligar() {
      esconder();
      doc.removeEventListener('pointerover', aoEntrar);
      doc.removeEventListener('pointerout', aoSair);
      doc.removeEventListener('pointerdown', aoApertar, true);
      doc.removeEventListener('focusin', aoFocar);
      doc.removeEventListener('focusout', aoDesfocar);
      doc.removeEventListener('keydown', aoTeclar, true);
      win.removeEventListener('hashchange', esconder);
      win.removeEventListener('blur', esconder);
      dica.remove();
    },
  };
}
