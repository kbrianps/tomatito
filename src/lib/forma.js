// A regra do layout de celular (PLANO-WEB-V1, 5.1; PLANO-ANDROID, 4.3, A05):
// celular em pé (largura < 600) ou deitado (toque e altura < 500). Na web,
// quem liga o data-forma é o boot-web.js (script clássico, com a mesma
// consulta copiada; o forma.test.js confere que são iguais); no Android, o
// main.js chama `ligarFormaCelular`. O desktop nunca chama.

export const CONSULTA_CELULAR = '(width < 600px) or ((pointer: coarse) and (height < 500px))';

/** Liga e desliga `data-forma="celular"` no <html> enquanto valer a consulta. */
export function ligarFormaCelular({ win = globalThis.window, doc = globalThis.document } = {}) {
  const h = doc.documentElement;
  const forma = win.matchMedia(CONSULTA_CELULAR);
  const aplicar = () => {
    if (forma.matches) h.dataset.forma = 'celular';
    else delete h.dataset.forma;
  };
  aplicar();
  forma.addEventListener('change', aplicar);
  return () => forma.removeEventListener('change', aplicar);
}
