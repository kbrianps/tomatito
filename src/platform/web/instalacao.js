// O convite de instalação do navegador (PLANO-WEB, 4; PLANO-WEB-V1, W18):
// o `beforeinstallprompt` do Chrome e do Edge, guardado para o cartão
// "Instalar o Tomatito" das Configurações o usar num clique.
//
// - O evento chega quando o site é instalável (manifest e service worker, W16)
//   e o app ainda não está instalado. O `preventDefault()` troca a faixa
//   automática do navegador (a "mini-infobar" do Android) pelo cartão; o
//   instalar pelo menu do navegador continua.
// - O convite só serve uma vez: depois do `prompt()`, com qualquer resposta,
//   ele é descartado. O navegador manda outro se ainda couber.
// - O `appinstalled` (instalado pelo cartão ou pelo menu) também o descarta.
//
// `criarInstalacao(deps)` recebe a janela por injeção (o index.js passa a
// real), para o instalacao.test.js rodar no Node. As telas chegam a ela pelo
// `instalacaoDaCasca` do `#plataforma` (no desktop, null).

/**
 * @param {object} deps
 * @param {{ addEventListener(tipo: string, f: (e: any) => void): void } | null} deps.janela
 */
export function criarInstalacao({ janela }) {
  const ouvintes = new Set();
  let convite = null;

  const avisar = () => {
    for (const f of ouvintes) {
      try {
        f(convite !== null);
      } catch (erro) {
        console.error('[instalação]', erro);
      }
    }
  };

  janela?.addEventListener?.('beforeinstallprompt', (e) => {
    e.preventDefault?.();
    convite = e;
    avisar();
  });
  janela?.addEventListener?.('appinstalled', () => {
    convite = null;
    avisar();
  });

  return Object.freeze({
    /** Se há um convite guardado (o cartão só aparece com ele). */
    disponivel: () => convite !== null,
    /**
     * Abre a janela de instalação do navegador. Chamado no clique (o
     * `prompt()` pede um gesto). Resolve com `'accepted'`, `'dismissed'` ou
     * `null` sem convite.
     */
    async instalar() {
      const e = convite;
      if (!e) return null;
      convite = null;
      let resposta = null;
      try {
        await e.prompt();
        resposta = (await e.userChoice)?.outcome ?? null;
      } catch (erro) {
        console.warn('[instalação]', erro);
      }
      avisar();
      return resposta;
    },
    /** `f(disponivel)` a cada mudança do convite. Devolve o cancelamento. */
    assinar(f) {
      ouvintes.add(f);
      return () => ouvintes.delete(f);
    },
  });
}
