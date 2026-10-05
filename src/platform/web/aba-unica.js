// Uma aba só (v0.3; o antigo W15 do PLANO-WEB). Duas abas rodariam dois
// motores sobre os mesmos dados, e o tempo de foco contaria em dobro. A
// primeira aba pega a trava `tomatito:aba` (Web Locks) e a segura enquanto
// viver; as outras mostram um aviso e ficam na fila da trava:
//
// - se a aba dona fecha, a próxima da fila assume sozinha;
// - "Usar nesta aba" pede a vez pelo BroadcastChannel: a dona marca
//   `tomatito:cedida` no sessionStorage e recarrega (soltando a trava); ao
//   voltar, vê a marca e entra direto no aviso, atrás de quem pediu.
//
// Quem espera por `esperarVez()` é o `motor.iniciar()`: sem a trava, o motor
// não nasce nesta aba, e nenhum comando, estado ou gravação anda. A casca
// monta por baixo do aviso, parada (`inert`). Navegador sem Web Locks: segue
// como antes (sem bloqueio).
import t from '../../lib/i18n/pt-BR.js';

const a = t.abaUnica;
export const TRAVA = 'tomatito:aba';
export const CANAL = 'tomatito:aba';
export const CEDIDA = 'tomatito:cedida';

/** HTML do aviso da aba bloqueada. */
export function marcacao() {
  return (
    '<div class="tt-aba-unica-caixa" role="alertdialog" aria-labelledby="tt-aba-unica-titulo" aria-describedby="tt-aba-unica-texto">' +
    `<h1 id="tt-aba-unica-titulo" class="tt-t-subtitle">${a.titulo}</h1>` +
    `<p id="tt-aba-unica-texto" class="tt-t-body">${a.texto}</p>` +
    `<button type="button" class="tt-accent" data-usar-aqui>${a.usarAqui}</button>` +
    '</div>'
  );
}

/**
 * Resolve quando esta aba tem a trava (e pode ligar o motor). As dependências
 * são as do navegador; os testes passam falsas.
 */
export function esperarVez({
  locks = globalThis.navigator?.locks,
  novoCanal = () => (typeof BroadcastChannel === 'function' ? new BroadcastChannel(CANAL) : null),
  sessao = globalThis.sessionStorage,
  doc = globalThis.document,
  recarregar = () => globalThis.location.reload(),
} = {}) {
  if (!locks?.request || !doc?.body) return Promise.resolve('sem-trava');

  let canal = null;
  try {
    canal = novoCanal();
  } catch {
    canal = null;
  }
  const lerMarca = () => {
    try {
      const marcada = sessao?.getItem(CEDIDA) === '1';
      sessao?.removeItem(CEDIDA);
      return marcada;
    } catch {
      return false;
    }
  };

  /** Dona da trava: segura-a para sempre e cede a quem pedir. */
  const assumir = () => {
    canal?.addEventListener('message', (ev) => {
      if (ev.data?.tipo !== 'ceder') return;
      try {
        sessao?.setItem(CEDIDA, '1');
      } catch {
        // Sem sessionStorage, a aba recarrega e entra na fila pela trava.
      }
      recarregar();
    });
  };
  const segurar = () => new Promise(() => {});

  return new Promise((pronto) => {
    let aviso = null;
    const mostrarAviso = () => {
      if (aviso) return;
      aviso = doc.createElement('div');
      aviso.className = 'tt-aba-unica';
      aviso.innerHTML = marcacao();
      doc.body.append(aviso);
      doc.documentElement.dataset.abaBloqueada = '';
      // A casca por baixo fica fora do teclado e do leitor de tela.
      doc.querySelector?.('.tt-janela')?.toggleAttribute?.('inert', true);
      const botao = aviso.querySelector('[data-usar-aqui]');
      botao?.addEventListener('click', () => {
        botao.disabled = true;
        botao.textContent = a.passando;
        canal?.postMessage({ tipo: 'ceder' });
      });
      botao?.focus?.();
    };
    const liberar = (como) => {
      aviso?.remove();
      aviso = null;
      delete doc.documentElement.dataset.abaBloqueada;
      doc.querySelector?.('.tt-janela')?.toggleAttribute?.('inert', false);
      assumir();
      pronto(como);
    };
    /** Entra na fila: o aviso fica até a trava chegar. */
    const naFila = () => {
      mostrarAviso();
      void locks.request(TRAVA, () => {
        liberar('depois');
        return segurar();
      });
    };

    // Quem acabou de ceder não disputa: vai para trás de quem pediu.
    if (lerMarca()) {
      naFila();
      return;
    }
    void locks.request(TRAVA, { ifAvailable: true }, (trava) => {
      if (!trava) {
        naFila();
        return undefined;
      }
      liberar('primeira');
      return segurar();
    });
  });
}
