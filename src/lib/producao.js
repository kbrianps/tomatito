// M37: no app de produção (`import.meta.env.PROD`), a página deixa de se
// comportar como navegador (PLANO.md, 3.8): o botão direito não abre o menu
// do WebView (Voltar, Recarregar, Inspecionar...), exceto nos campos de
// texto, onde o menu tem Copiar e Colar; e o F5 e o Ctrl+R não recarregam a
// página. No `npm run dev:app` (o Vite em modo dev), nada disto é ligado: o
// menu e a recarga continuam servindo para depurar.
//
// As variantes de recarga do Chromium (WebView2) também ficam presas:
// Ctrl+Shift+R, Shift+F5, Ctrl+F5 e a tecla "Atualizar" de alguns teclados
// (BrowserRefresh). O código é o mesmo nas duas plataformas.
//
// O WebKitGTK não tem atalho de recarga próprio (no Linux, o F5 e o Ctrl+R
// não faziam nada nem no `dev:app`; conferido no roteiro aninhado
// `instancia`). Para o "continuam funcionando" do M37 valer também ali, o
// `dev:app` ganha a recarga pelas mesmas teclas (`ligarRecargaDoDev`).

/** Campos em que o menu de contexto do sistema continua valendo. */
const CAMPOS = 'input, textarea';

/**
 * O evento é um pedido de recarga do navegador?
 * @param {{ key: string, code?: string, ctrlKey?: boolean, metaKey?: boolean, altKey?: boolean }} e
 * @returns {boolean}
 */
export function teclaDeRecarga(e) {
  if (e.key === 'F5' || e.code === 'F5' || e.key === 'BrowserRefresh') return true;
  if (!e.ctrlKey || e.altKey || e.metaKey) return false;
  const k = typeof e.key === 'string' ? e.key.toLowerCase() : '';
  return k === 'r' || (!/^[a-z]$/.test(k) && e.code === 'KeyR');
}

/**
 * O menu de contexto do WebView pode abrir aqui? Só num campo de texto
 * (`e.target` é o elemento clicado, ou o host de um componente com shadow
 * DOM).
 * @param {{ closest?: (s: string) => unknown } | null | undefined} alvo
 * @returns {boolean}
 */
export function menuPermitido(alvo) {
  return Boolean(alvo?.closest?.(CAMPOS));
}

/**
 * Liga os bloqueios no documento, na fase de captura (antes de qualquer
 * outro ouvinte). Devolve uma função que os desliga.
 */
export function ligarBloqueiosDeProducao(alvo = document) {
  const aoMenu = (e) => {
    if (!menuPermitido(e.target)) e.preventDefault();
  };
  const aoTeclar = (e) => {
    if (teclaDeRecarga(e)) e.preventDefault();
  };
  const captura = { capture: true };
  alvo.addEventListener('contextmenu', aoMenu, captura);
  alvo.addEventListener('keydown', aoTeclar, captura);
  return () => {
    alvo.removeEventListener('contextmenu', aoMenu, captura);
    alvo.removeEventListener('keydown', aoTeclar, captura);
  };
}

/**
 * Só no `dev:app` (`import.meta.env.DEV`): F5 e Ctrl+R recarregam a página,
 * como no WebView2, também no WebKitGTK, que não tem esses atalhos. Devolve
 * uma função que desliga.
 */
export function ligarRecargaDoDev(alvo = document, recarregar = () => location.reload()) {
  const aoTeclar = (e) => {
    if (e.defaultPrevented || e.repeat || !teclaDeRecarga(e)) return;
    e.preventDefault();
    recarregar();
  };
  alvo.addEventListener('keydown', aoTeclar);
  return () => alvo.removeEventListener('keydown', aoTeclar);
}
