// A política de atualização do PWA (PLANO-WEB, 3.8; W16). O service worker
// novo instala e fica em `waiting` (o sw.js não chama `skipWaiting` sozinho).
// Daqui:
//
// - quando um SW fica em `waiting` (já estava na carga, ou chegou agora) e
//   nada corre (nenhuma fase de foco nem temporizador rumo ao zero), a página
//   manda `SKIP_WAITING` na hora e recarrega quando o SW novo assume;
// - com algo correndo, nada acontece sozinho: a atualização fica "pronta"
//   (o cartão "Atualizar" das Configurações aparece) e só o botão a aplica,
//   e só com nada correndo. Nunca recarrega com uma fase correndo.
//
// A primeira instalação (sem SW anterior controlando a página) não é
// atualização: não há `waiting` nem recarga.
//
// Sem DOM e sem globais: o index.js passa o `navigator.serviceWorker`, o
// `correndo` do motor e o `recarregar`. Testado em atualizacao.test.js.

/**
 * `{ estado, podeAplicar, aplicar, acompanhar, assinar, revisar }`.
 * - `estado()`: 'nenhuma' ou 'pronta' (um SW em `waiting`);
 * - `podeAplicar()`: pronta e nada correndo;
 * - `aplicar()`: manda `SKIP_WAITING` (false se não pode);
 * - `acompanhar(registro)`: liga os ouvintes num registro (o do sw.js);
 * - `assinar(fn)`: chama `fn()` a cada mudança (devolve o cancelamento);
 * - `revisar()`: o motor mudou (o index.js chama a cada `tt://state` e
 *   `tt://timers`), avisa os assinantes.
 */
export function criarAtualizacao({ servico, correndo, recarregar }) {
  let registro = null;
  let pedida = false;
  let recarregou = false;
  const assinantes = new Set();
  const avisar = () => {
    for (const fn of assinantes) {
      try {
        fn();
      } catch (erro) {
        console.warn('[atualização]', erro);
      }
    }
  };

  const esperando = () => registro?.waiting ?? null;
  const estado = () => (esperando() ? 'pronta' : 'nenhuma');
  const podeAplicar = () => Boolean(esperando()) && !correndo();

  function aplicar() {
    const sw = esperando();
    if (!sw || correndo()) return false;
    pedida = true;
    sw.postMessage({ type: 'SKIP_WAITING' });
    return true;
  }

  // Um SW chegou a `waiting`: com nada correndo, aplica; senão, espera o botão.
  function aoFicarPronta() {
    if (!esperando()) return;
    if (!correndo()) aplicar();
    avisar();
  }

  function vigiar(sw) {
    if (!sw) return;
    sw.addEventListener('statechange', () => {
      // `installed` com um SW já controlando a página: é uma atualização.
      if (sw.state === 'installed' && servico.controller) aoFicarPronta();
      else if (sw.state === 'redundant' || sw.state === 'activated') avisar();
    });
  }

  servico?.addEventListener?.('controllerchange', () => {
    // Só recarrega o que a página pediu (e uma vez só).
    if (!pedida || recarregou) return;
    recarregou = true;
    recarregar();
  });

  function acompanhar(reg) {
    if (!reg || registro === reg) return;
    registro = reg;
    if (reg.waiting && servico.controller) aoFicarPronta();
    vigiar(reg.installing);
    reg.addEventListener('updatefound', () => vigiar(reg.installing));
  }

  return {
    estado,
    podeAplicar,
    aplicar,
    acompanhar,
    assinar(fn) {
      assinantes.add(fn);
      return () => assinantes.delete(fn);
    },
    revisar: avisar,
  };
}
