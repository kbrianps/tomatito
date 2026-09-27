// Tela Cronômetro (#/cronometro). Vazia no M09: só o título. O cronômetro e
// as voltas chegam no M34 e no M35.
import t from '../lib/i18n/pt-BR.js';

export function montar(raiz) {
  raiz.innerHTML = `<div class="tt-pagina"><h1 class="tt-t-title" tabindex="-1">${t.navegacao.cronometro}</h1></div>`;
}
