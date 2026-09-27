// Roteador por hash da janela main (PLANO.md, 3.7 e M09).
//
//   #/foco  #/temporizador  #/cronometro  #/configuracoes  #/dev
//
// O #/dev é o catálogo de controles para desenvolvimento (a amostra do M06,
// que cresce no M12 e no M13). Não aparece no painel nem tem atalho: abre-se
// pelo console do DevTools (location.hash = '#/dev') ou pela URL da prévia.
//
// Um hash vazio ou desconhecido vira #/foco sem criar entrada no histórico. A
// troca de tela também não cria entrada (location.replace): o app não tem
// botão de voltar, e um "voltar" do mouse não deve passear pelas telas.

export const ROTAS = Object.freeze(['foco', 'temporizador', 'cronometro', 'configuracoes', 'dev']);
export const ROTA_PADRAO = 'foco';

export const hashDaRota = (rota) => `#/${rota}`;

/** A rota de um hash (`#/foco` → `foco`), ou null se não for uma rota do app. */
export function rotaDoHash(hash) {
  const m = /^#\/([a-z]+)$/.exec(hash ?? '');
  return m && ROTAS.includes(m[1]) ? m[1] : null;
}

/**
 * Liga o roteador. `telas` associa cada rota a um objeto com `montar(raiz)`,
 * que desenha a tela dentro de `raiz` e pode devolver uma função de limpeza.
 * M17: `montar` recebe também o `contexto` (hoje, o `icone` do
 * components/icon.js, que as telas não importam para rodar no node --test).
 * `aoMudar(rota, anterior)` roda depois de cada troca (e na primeira tela, com
 * `anterior` null).
 *
 * A primeira tela é desenhada já na chamada, de forma síncrona: o main.js só
 * mostra a janela depois, e o primeiro quadro sai com a tela certa.
 *
 * Se o foco do teclado estava dentro da tela que saiu, ele passa para o
 * título da tela nova (o <h1> com tabindex="-1"), em vez de cair no <body>.
 */
export function iniciarRoteador({ raiz, telas, contexto = {}, aoMudar = () => {} }) {
  let atual = null;
  let limpar = null;

  const aplicar = () => {
    const rota = rotaDoHash(location.hash);
    if (!rota) {
      history.replaceState(history.state, '', hashDaRota(ROTA_PADRAO));
      return aplicar();
    }
    if (rota === atual) return;
    const focoDentro = raiz.contains(document.activeElement);
    limpar?.();
    raiz.replaceChildren();
    limpar = telas[rota].montar(raiz, contexto) ?? null;
    raiz.scrollTop = 0;
    const anterior = atual;
    atual = rota;
    aoMudar(rota, anterior);
    if (focoDentro) raiz.querySelector('h1[tabindex="-1"]')?.focus();
  };

  addEventListener('hashchange', aplicar);
  aplicar();

  return {
    get atual() {
      return atual;
    },
    /** Troca de tela sem criar entrada no histórico. */
    navegar(rota) {
      if (!ROTAS.includes(rota)) throw new Error(`rota desconhecida: ${rota}`);
      if (rota !== atual) location.replace(hashDaRota(rota));
    },
  };
}
