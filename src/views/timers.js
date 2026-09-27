// Tela Temporizador (#/temporizador). Vazia no M09: só o título. Os
// temporizadores chegam no M32 e no M33.
import t from '../lib/i18n/pt-BR.js';

export function montar(raiz) {
  raiz.innerHTML = `<div class="tt-pagina"><h1 class="tt-t-title" tabindex="-1">${t.navegacao.temporizador}</h1></div>`;
}
