// Tela Configurações (#/configuracoes). Vazia no M09: só o título. A
// aparência chega no M24, e o resto no M38 e no M39.
import t from '../lib/i18n/pt-BR.js';

export function montar(raiz) {
  raiz.innerHTML = `<div class="tt-pagina"><h1 class="tt-t-title" tabindex="-1">${t.navegacao.configuracoes}</h1></div>`;
}
