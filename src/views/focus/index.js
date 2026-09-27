// Tela Foco (#/foco). Vazia no M09: só o título. O card de sessão
// chega no M17, o de progresso no M27 e o de tarefas no M30.
import t from '../../lib/i18n/pt-BR.js';

export function montar(raiz) {
  raiz.innerHTML = `<div class="tt-pagina"><h1 class="tt-t-title" tabindex="-1">${t.navegacao.foco}</h1></div>`;
}
