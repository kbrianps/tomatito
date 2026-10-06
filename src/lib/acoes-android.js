// O controle pela barra de notificações do Android (v0.5). Os botões da
// notificação contínua ("Pausar" ou "Retomar", "Pular" e "Encerrar") abrem o
// app com a ação pedida; o plugin a guarda (TomatitoPlugin.kt), e aqui ela é
// buscada e executada no motor, pelos mesmos comandos da tela Foco. Se o app
// estava em segundo plano, volta para lá em seguida.
//
// A busca roda na partida (o app aberto pelo botão) e sempre que a página
// volta a ficar visível ou ganha o foco (o botão tocado com o app vivo).

/** O comando do store para cada ação da notificação. */
export const COMANDOS = Object.freeze({ pausar: 'pausar', retomar: 'retomar', pular: 'pular', encerrar: 'parar' });

/**
 * Liga a busca. `api` é o `ipc.android`; `store`, o do foco; `doc` e
 * `janela`, os da página. Devolve `{ buscar(), desligar() }`.
 */
export function ligarAcoesDoAndroid({ api, store, doc = globalThis.document, janela = globalThis }) {
  let ocupado = false;
  const buscar = async () => {
    if (ocupado) return null;
    ocupado = true;
    try {
      const pedido = await api.acaoPendente();
      const comando = COMANDOS[pedido?.acao];
      if (!comando) return null;
      try {
        await store.comando(comando);
      } catch (erro) {
        // O estado mudou por outro caminho (pular sem sessão, por exemplo).
        console.warn('[ação da notificação]', pedido.acao, erro);
      }
      if (pedido.voltar) await api.paraOFundo();
      return pedido.acao;
    } catch (erro) {
      console.warn('[ação da notificação]', erro);
      return null;
    } finally {
      ocupado = false;
    }
  };
  const aoVoltar = () => {
    if (doc.visibilityState !== 'hidden') void buscar();
  };
  doc.addEventListener('visibilitychange', aoVoltar);
  janela.addEventListener('focus', aoVoltar);
  return {
    buscar,
    desligar() {
      doc.removeEventListener('visibilitychange', aoVoltar);
      janela.removeEventListener('focus', aoVoltar);
    },
  };
}
