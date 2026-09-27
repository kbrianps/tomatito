// Atalhos de teclado dentro do app (PLANO.md, 3.8). Atalhos globais, fora da
// janela, ficam para depois.
//
// M09: Ctrl+1, Ctrl+2 e Ctrl+3 abrem Foco, Temporizador e Cronômetro, e
// Ctrl+, abre as Configurações. Os atalhos valem com o foco em qualquer lugar
// da janela, inclusive num campo de texto (nenhum deles tem uso ali).
//
// Os dígitos são lidos pela posição da tecla (event.code), e não pelo
// caractere: no AZERTY, a tecla do 1 dá "&" sem Shift. O teclado numérico
// também vale. A vírgula é lida pelo caractere (no AZERTY ela fica em outra
// tecla) ou pela posição da tecla Comma do ABNT2 e do US.

const ROTA_DO_DIGITO = Object.freeze({ 1: 'foco', 2: 'temporizador', 3: 'cronometro' });

/**
 * A rota que o atalho abre, ou null se o evento não é um atalho de navegação.
 * Só Ctrl, sem Alt, Shift nem Meta (Ctrl+Shift+1 não é o mesmo atalho).
 * @param {{ key: string, code: string, ctrlKey: boolean, altKey: boolean, shiftKey: boolean, metaKey: boolean }} e
 * @returns {string|null}
 */
export function rotaDoAtalho(e) {
  if (!e.ctrlKey || e.altKey || e.shiftKey || e.metaKey) return null;
  const digito = /^(?:Digit|Numpad)([1-3])$/.exec(e.code ?? '');
  if (digito) return ROTA_DO_DIGITO[digito[1]];
  if (e.key === ',' || e.code === 'Comma') return 'configuracoes';
  return null;
}

/**
 * Liga os atalhos de navegação no documento. `navegar(rota)` troca a tela.
 * Devolve uma função que desliga os atalhos.
 */
export function ligarAtalhosDeNavegacao(navegar, alvo = document) {
  const aoTeclar = (e) => {
    if (e.defaultPrevented) return;
    const rota = rotaDoAtalho(e);
    if (!rota) return;
    e.preventDefault();
    navegar(rota);
  };
  alvo.addEventListener('keydown', aoTeclar);
  return () => alvo.removeEventListener('keydown', aoTeclar);
}
