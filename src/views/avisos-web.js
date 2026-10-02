// A seção "Avisos" das Configurações, só na versão web (PLANO-WEB, 4 e W14;
// PLANO-WEB-V1, 7 e W14). Um cartão com os quatro estados da permissão:
//
// - `default`: "Mostrar um aviso…" e [Permitir avisos], que pede a permissão
//   (o único pedido fora do InfoBar da Foco, e só por clique);
// - `granted`: "Ativadas neste navegador." e [Testar aviso];
// - `denied`: "Bloqueadas neste navegador…", sem botão (o navegador não deixa
//   pedir de novo);
// - `sem-suporte`: "Neste navegador não há notificações.", com a linha do
//   iPhone e do iPad.
//
// O rodapé traz as limitações honestas (a aba aberta e o celular). O
// cartão acompanha a permissão (o `permissions.query` do navegador), então
// mudar pelo cadeado também aparece aqui.
//
// Quem decide se a seção existe é a casca (`casca.web`); o estado vem do
// `recursosDaCasca.notificacoes` (sem ele, o 4º estado) e da permissão
// (`avisosDaCasca`, platform/web/permissao.js). No desktop não aparece nada.
// Módulo à parte, ligado por uma linha no settings.js, como o opcao-x11.js.
import t from '../lib/i18n/pt-BR.js';

const a = t.configuracoes.avisos;
const semIcone = () => '';

// A plataforma, carregada só quando a tela monta (os testes em Node passam
// uma de mentira).
const plataformaPadrao = () => import('#plataforma');

/** O estado da seção: o 4º sem notificações na casca; senão, a permissão. */
export function estadoDaSecao({ recursos, avisos }) {
  if (!recursos?.notificacoes || !avisos) return 'sem-suporte';
  return avisos.estado();
}

/** O botão de cada estado (só `default` e `granted` têm). */
export function marcacaoDoBotao(estado) {
  if (estado === 'default') {
    return `<button type="button" data-permitir aria-describedby="config-notificacoes-desc">${a.permitir}</button>`;
  }
  if (estado === 'granted') {
    return `<button type="button" data-testar-aviso aria-describedby="config-notificacoes-desc">${a.testar}</button>`;
  }
  return '';
}

/** As linhas do rodapé: a do iPhone no 4º estado; as da aba e do celular nos outros. */
export function linhasDoRodape(estado) {
  return estado === 'sem-suporte' ? [a.iphone] : [a.abaAberta, a.celular];
}

/** HTML do conteúdo do cartão num estado. */
export function marcacaoDoCartao(estado, icone = semIcone) {
  const botao = marcacaoDoBotao(estado);
  return (
    `<div class="tt-config-cabecalho"><span class="tt-config-icone">${icone('alert', 20)}</span>` +
    `<span class="tt-config-textos"><span id="config-notificacoes" class="tt-config-titulo">${a.titulo}</span>` +
    `<span id="config-notificacoes-desc" class="tt-config-descricao tt-t-caption">${a.estados[estado]}</span></span>` +
    (botao ? `<span class="tt-config-controle">${botao}</span>` : '') +
    '</div>' +
    `<div class="tt-config-rodape tt-avisos-rodape">${linhasDoRodape(estado)
      .map((l) => `<p class="tt-t-caption">${l}</p>`)
      .join('')}</div>`
  );
}

/** HTML da seção. */
export function marcacao(estado, icone = semIcone) {
  return (
    '<section class="tt-config-secao" aria-labelledby="config-avisos-web" data-secao="avisos">' +
    `<h2 id="config-avisos-web" class="tt-t-body-strong">${a.secao}</h2>` +
    `<div class="tt-config-cartao" data-cartao="notificacoes" data-estado-avisos="${estado}">` +
    marcacaoDoCartao(estado, icone) +
    '</div></section>'
  );
}

/**
 * Liga a seção na página (`.tt-pagina`), depois da Aparência (ou antes do
 * Sobre, ou no fim). Só com `casca.web`. Devolve a limpeza.
 */
export function ligarAvisosWeb(pagina, { icone = semIcone, plataforma = plataformaPadrao } = {}) {
  let desligada = false;
  let secao = null;
  let desassinar = () => {};

  const montar = async () => {
    const plat = await plataforma();
    if (desligada || !plat?.casca?.web) return;
    const avisos = plat.avisosDaCasca ?? null;
    const estado = () => estadoDaSecao({ recursos: plat.recursosDaCasca?.(), avisos });
    const html = marcacao(estado(), icone);
    const aparencia = pagina.querySelector?.('[aria-labelledby="config-aparencia"]');
    const sobre = pagina.querySelector?.('[aria-labelledby="config-sobre-secao"]');
    if (aparencia) {
      aparencia.insertAdjacentHTML('afterend', html);
      secao = aparencia.nextElementSibling;
    } else if (sobre) {
      sobre.insertAdjacentHTML('beforebegin', html);
      secao = sobre.previousElementSibling;
    } else {
      pagina.insertAdjacentHTML('beforeend', html);
      secao = pagina.lastElementChild;
    }
    const cartao = secao.querySelector('[data-cartao="notificacoes"]');

    const mostrar = (novo) => {
      if (desligada || cartao.dataset.estadoAvisos === novo) return;
      const doc = cartao.ownerDocument;
      const tinhaFoco = Boolean(doc?.activeElement && cartao.contains(doc.activeElement));
      cartao.dataset.estadoAvisos = novo;
      cartao.innerHTML = marcacaoDoCartao(novo, icone);
      // O botão trocou (Permitir → Testar): o foco vai para o novo.
      if (tinhaFoco) cartao.querySelector('button')?.focus();
    };

    cartao.addEventListener('click', async (e) => {
      const permitir = e.target.closest?.('[data-permitir]');
      if (permitir && avisos) {
        permitir.disabled = true;
        await avisos.pedir();
        if (permitir.isConnected) permitir.disabled = false;
        mostrar(estado());
        return;
      }
      const testar = e.target.closest?.('[data-testar-aviso]');
      if (testar && avisos) {
        const ok = await avisos.testar(a.teste.titulo, a.teste.corpo);
        if (!ok) mostrar(estado());
      }
    });
    if (avisos?.assinar) desassinar = avisos.assinar(() => mostrar(estado()));
  };
  montar().catch((erro) => console.warn('[avisos]', erro));
  return () => {
    desligada = true;
    desassinar();
    secao?.remove();
  };
}
