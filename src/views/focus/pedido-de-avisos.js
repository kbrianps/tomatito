// O InfoBar do pedido de avisos, só na versão web (PLANO-WEB, 4, "Foco", e
// W14; PLANO-WEB-V1, W14). Depois de um "Iniciar sessão de foco" (o evento
// `tt-foco-iniciado` do card-session.js), se a casca tem notificações
// (`recursosDaCasca.notificacoes`), a permissão ainda está em `default` e o
// "Agora não" não foi escolhido, aparece no cartão de sessão, logo abaixo de
// "A seguir:". A sessão já começou: nada espera por ele.
//
// - [Permitir avisos] pede a permissão (o clique é a ativação que o
//   navegador exige). Concedida, ou o pedido fechado sem resposta, o InfoBar
//   some; recusada, o texto vira "Avisos bloqueados…" com [Fechar].
// - [Agora não] guarda `tomatito:web.avisoDispensado` (permissao.js) e some;
//   ele não volta, nem depois de recarregar.
//
// Nada aqui pede permissão ao carregar nem ao iniciar. No desktop, a casca
// não tem notificações e nada aparece.
import t from '../../lib/i18n/pt-BR.js';

const p = t.pedidoDeAvisos;
const semIcone = () => '';

/** O evento que o cartão de sessão emite depois de um início aceito. */
export const EVENTO_INICIADO = 'tt-foco-iniciado';

const plataformaPadrao = () => import('#plataforma');

/** Se o InfoBar deve aparecer, pela casca e pela permissão. */
export function deveMostrar({ recursos, avisos }) {
  return Boolean(recursos?.notificacoes && avisos?.deveOferecer?.());
}

/** HTML do InfoBar: a pergunta ou o aviso de bloqueio. */
export function marcacao(modo = 'pergunta', icone = semIcone) {
  const botoes =
    modo === 'bloqueado'
      ? `<button type="button" data-pedido="fechar">${p.fechar}</button>`
      : `<button type="button" class="tt-accent" data-pedido="permitir">${p.permitir}</button>` +
        `<button type="button" data-pedido="agora-nao">${p.agoraNao}</button>`;
  const textos =
    modo === 'bloqueado'
      ? `<p class="tt-infobar-texto" id="foco-pedido-texto">${p.bloqueados}</p>`
      : `<p class="tt-infobar-titulo tt-t-body-strong" id="foco-pedido-titulo">${p.titulo}</p>` +
        `<p class="tt-infobar-texto" id="foco-pedido-texto">${p.texto}</p>`;
  const rotulo = modo === 'bloqueado' ? 'foco-pedido-texto' : 'foco-pedido-titulo';
  return (
    `<div class="tt-infobar" role="group" data-pedido-de-avisos="${modo}" aria-labelledby="${rotulo}"` +
    `${modo === 'bloqueado' ? '' : ' aria-describedby="foco-pedido-texto"'}>` +
    `<span class="tt-infobar-icone">${icone('info', 16)}</span>` +
    `<div class="tt-infobar-corpo">${textos}<div class="tt-infobar-botoes">${botoes}</div></div></div>`
  );
}

/**
 * Liga o pedido ao cartão de sessão (`[data-cartao="sessao"]`). O InfoBar
 * entra depois do rodapé "A seguir:" do bloco da sessão em andamento (e some
 * com ele quando a sessão acaba). Devolve a limpeza.
 */
export function ligar(cartao, { icone = semIcone, plataforma = plataformaPadrao } = {}) {
  let desligado = false;
  let barra = null;
  // O `avisosDaCasca` de quando o InfoBar apareceu: o pedido sai no mesmo
  // clique, sem esperar nada antes (a ativação do navegador é curta).
  let avisos = null;

  const tirar = () => {
    const tinhaFoco = barra?.contains(cartao.ownerDocument?.activeElement ?? null);
    barra?.remove();
    barra = null;
    // O foco do teclado não fica num botão que sumiu.
    if (tinhaFoco) cartao.querySelector('[data-andamento] button[data-acao]')?.focus();
  };
  const por = (modo) => {
    const lugar = cartao.querySelector('[data-andamento] [data-rodape]');
    if (!lugar) return;
    const tinhaFoco = barra?.contains(cartao.ownerDocument?.activeElement ?? null);
    barra?.remove();
    lugar.insertAdjacentHTML('afterend', marcacao(modo, icone));
    barra = lugar.nextElementSibling;
    if (tinhaFoco) barra.querySelector('button')?.focus();
  };

  const aoIniciar = async () => {
    const plat = await plataforma();
    if (desligado || barra) return;
    if (!deveMostrar({ recursos: plat?.recursosDaCasca?.(), avisos: plat?.avisosDaCasca })) return;
    avisos = plat.avisosDaCasca;
    por('pergunta');
  };
  const aoClicar = async (e) => {
    const botao = e.target.closest?.('[data-pedido]');
    if (!botao || !barra?.contains(botao)) return;
    const acao = botao.dataset.pedido;
    if (acao === 'fechar') return tirar();
    if (acao === 'agora-nao') {
      avisos?.dispensar();
      return tirar();
    }
    if (acao === 'permitir' && avisos) {
      botao.disabled = true;
      const estado = await avisos.pedir();
      if (desligado) return;
      if (estado === 'denied') por('bloqueado');
      else tirar();
    }
  };

  const ouvirInicio = () => {
    aoIniciar().catch((erro) => console.warn('[avisos]', erro));
  };
  cartao.addEventListener(EVENTO_INICIADO, ouvirInicio);
  cartao.addEventListener('click', aoClicar);
  return () => {
    desligado = true;
    cartao.removeEventListener(EVENTO_INICIADO, ouvirInicio);
    cartao.removeEventListener('click', aoClicar);
    barra?.remove();
  };
}
