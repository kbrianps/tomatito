// Teclado virtual no layout de celular (PLANO-WEB-V1, 5.5; marco W37).
//
// Com um campo de texto focado e a área visível menor que 75% da altura da
// tela, o <html> ganha `data-teclado`: o celular.css esconde a barra inferior,
// e o campo é trazido para a vista. Vale no Chrome Android (a viewport encolhe
// pelo `interactive-widget=resizes-content`) e no Safari (pelo
// `visualViewport`, que encolhe sozinho).
//
// Só a casca web liga isto (platform/web/index.js). `ligarTeclado` recebe o
// ambiente para os testes passarem falsos.

/** Campos em que o teclado virtual abre. */
export const CAMPOS = 'input:not([type]), input[type=text], input[type=search], input[type=number], input[type=tel], input[type=url], input[type=email], textarea, [contenteditable=""], [contenteditable=true]';

/** O teclado está aberto? `visivel` e `tela` em px; o limite é 75% da tela. */
export const tecladoAberto = (visivel, tela) => tela > 0 && visivel < tela * 0.75;

export function ligarTeclado({ win = globalThis.window, doc = globalThis.document } = {}) {
  const vv = win?.visualViewport;
  if (!vv || !doc) return { desligar() {} };
  const raiz = doc.documentElement;
  // A altura "de tela cheia": a maior já vista nesta orientação. Ao girar o
  // aparelho, a largura muda e a referência recomeça.
  let largura = vv.width;
  let cheia = vv.height;

  const campoFocado = () => {
    const el = doc.activeElement;
    return el && el.matches?.(CAMPOS) ? el : null;
  };
  const revisar = () => {
    if (vv.width !== largura) {
      largura = vv.width;
      cheia = vv.height;
    }
    const campo = campoFocado();
    if (!campo) cheia = Math.max(cheia, vv.height);
    const aberto = !!campo && tecladoAberto(vv.height, cheia);
    if (aberto === raiz.hasAttribute('data-teclado')) return;
    if (aberto) {
      raiz.setAttribute('data-teclado', '');
      // Depois de a barra sumir e o layout assentar.
      win.requestAnimationFrame(() => campoFocado()?.scrollIntoView({ block: 'nearest' }));
    } else raiz.removeAttribute('data-teclado');
  };

  vv.addEventListener('resize', revisar);
  doc.addEventListener('focusin', revisar);
  doc.addEventListener('focusout', () => win.setTimeout(revisar, 0));
  revisar();
  return {
    desligar() {
      vv.removeEventListener('resize', revisar);
      doc.removeEventListener('focusin', revisar);
    },
  };
}
