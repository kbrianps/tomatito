// O pedido de permissão dos avisos na web (PLANO-WEB, 4 e W14; PLANO-WEB-V1,
// W14): o estado da permissão, o pedido (só por clique, nunca na carga nem
// no início de uma sessão), o "Agora não" guardado e o aviso de teste.
//
// Quem mostra os avisos de verdade é o avisos.js (W13). Aqui só se pergunta.
// Os textos são da interface (lib/i18n/pt-BR.js); a tela os passa ao
// `testar`.
//
// `criarPermissao(deps)` recebe o navegador por injeção (o index.js passa o
// real), para o permissao.test.js rodar no Node. As telas chegam a ele pelo
// `avisosDaCasca` do `#plataforma` (no desktop, null).

/** Os quatro estados da seção Avisos: os três da permissão e o sem suporte. */
export const ESTADOS = Object.freeze(['default', 'granted', 'denied', 'sem-suporte']);

/** A tag do aviso de teste (fora das tags do avisos.js). */
export const TAG_DO_TESTE = 'tomatito:teste';

/** O estado da seção a partir do `Notification.permission` (ou da falta dele). */
export function estadoDe(permissao) {
  return ESTADOS.includes(permissao) ? permissao : 'sem-suporte';
}

/**
 * @param {object} deps
 * @param {() => any} deps.notificacao o construtor `Notification`, ou undefined sem a API
 * @param {() => Storage | null} deps.armazenamento o localStorage (pode lançar)
 * @param {() => any} [deps.permissoes] o `navigator.permissions`, para acompanhar mudanças
 * @param {() => Promise<ServiceWorkerRegistration | null>} [deps.registro] o registro ativo (avisos.js)
 */
export function criarPermissao({ notificacao, armazenamento, permissoes = () => null, registro = async () => null }) {
  const ouvintes = new Set();
  let acompanhando = false;

  const estado = () => {
    const N = notificacao();
    return N ? estadoDe(N.permission) : 'sem-suporte';
  };
  const avisar = () => {
    const e = estado();
    for (const f of ouvintes) {
      try {
        f(e);
      } catch (erro) {
        console.error('[permissão]', erro);
      }
    }
  };

  // A permissão também muda fora do app (o cadeado do navegador). Ligado uma
  // vez, no primeiro `assinar`.
  const acompanhar = () => {
    if (acompanhando) return;
    acompanhando = true;
    let p;
    try {
      p = permissoes()?.query?.({ name: 'notifications' });
    } catch {
      return;
    }
    Promise.resolve(p)
      .then((status) => status?.addEventListener?.('change', avisar))
      .catch(() => {});
  };

  return {
    /** 'default', 'granted', 'denied' ou 'sem-suporte'. */
    estado,

    /**
     * Pede a permissão ao navegador. Só dentro de um clique (a ativação que
     * o navegador exige). Resolve com o estado novo; nunca rejeita.
     */
    async pedir() {
      const N = notificacao();
      if (!N?.requestPermission) return 'sem-suporte';
      try {
        await N.requestPermission();
      } catch (erro) {
        console.warn('[permissão] o pedido falhou', erro);
      }
      avisar();
      return estado();
    },

    /** Se o "Agora não" do InfoBar já foi escolhido neste navegador. */
    dispensado() {
      try {
        return armazenamento()?.getItem('tomatito:web.avisoDispensado') === '1';
      } catch {
        return false;
      }
    },

    /** Guarda o "Agora não" (o InfoBar não volta). */
    dispensar() {
      try {
        armazenamento()?.setItem('tomatito:web.avisoDispensado', '1');
      } catch (erro) {
        console.warn('[permissão] não gravou o "Agora não"', erro);
      }
    },

    /** Se o InfoBar deve aparecer: permissão ainda não pedida e sem "Agora não". */
    deveOferecer() {
      return estado() === 'default' && !this.dispensado();
    },

    /** `f(estado)` a cada mudança da permissão. Devolve o cancelamento. */
    assinar(f) {
      ouvintes.add(f);
      acompanhar();
      return () => ouvintes.delete(f);
    },

    /**
     * O "Testar aviso": um aviso na hora, pelo service worker, com o título e
     * o corpo que a tela passa. Resolve com `true` se foi entregue.
     */
    async testar(titulo, corpo) {
      if (estado() !== 'granted') return false;
      try {
        const reg = await registro();
        if (!reg) return false;
        await reg.showNotification(titulo, { body: corpo, tag: TAG_DO_TESTE, lang: 'pt-BR' });
        return true;
      } catch (erro) {
        console.warn('[permissão] o aviso de teste não apareceu', erro);
        return false;
      }
    },
  };
}
