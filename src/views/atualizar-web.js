// O cartão "Atualizar" das Configurações, só na versão web (PLANO-WEB, 3.8 e
// W16). Aparece só com uma versão nova do service worker em `waiting`
// (platform/web/atualizacao.js), numa seção "Atualização" antes do Sobre:
//
// - com nada correndo: "Já baixada. Ao atualizar, a página recarrega." e
//   [Atualizar], que manda o SKIP_WAITING (a página recarrega quando o SW
//   novo assume);
// - com uma fase ou um temporizador correndo: o texto pede para encerrar, e o
//   botão fica desabilitado (nunca recarrega com algo correndo).
//
// Quem decide se a seção pode existir é a casca (`casca.web`); o estado vem
// do `atualizacaoDaCasca` (null no desktop). Módulo à parte, ligado por uma
// linha no settings.js, como o avisos-web.js.
import t from '../lib/i18n/pt-BR.js';

const a = t.configuracoes.atualizar;
const semIcone = () => '';

// A plataforma, carregada só quando a tela monta (os testes em Node passam
// uma de mentira).
const plataformaPadrao = () => import('#plataforma');

/** HTML do conteúdo do cartão: `podeAplicar` decide o texto e o botão. */
export function marcacaoDoCartao(podeAplicar, icone = semIcone) {
  return (
    `<div class="tt-config-cabecalho"><span class="tt-config-icone">${icone('arrow_sync', 20)}</span>` +
    `<span class="tt-config-textos"><span id="config-atualizar" class="tt-config-titulo">${a.titulo}</span>` +
    `<span id="config-atualizar-desc" class="tt-config-descricao tt-t-caption">${podeAplicar ? a.pronta : a.correndo}</span></span>` +
    `<span class="tt-config-controle"><button type="button" class="tt-accent" data-atualizar aria-describedby="config-atualizar config-atualizar-desc"${podeAplicar ? '' : ' disabled'}>${a.botao}</button></span>` +
    '</div>'
  );
}

/** HTML da seção. */
export function marcacao(podeAplicar, icone = semIcone) {
  return (
    '<section class="tt-config-secao" aria-labelledby="config-atualizacao-web" data-secao="atualizacao">' +
    `<h2 id="config-atualizacao-web" class="tt-t-body-strong">${a.secao}</h2>` +
    `<div class="tt-config-cartao" data-cartao="atualizar" data-pode-aplicar="${podeAplicar}">` +
    marcacaoDoCartao(podeAplicar, icone) +
    '</div></section>'
  );
}

/**
 * Liga a seção na página (`.tt-pagina`), antes do Sobre (ou no fim), e a
 * mantém em dia com a atualização e o motor. Só com `casca.web`. Devolve a
 * limpeza.
 */
export function ligarAtualizarWeb(pagina, { icone = semIcone, plataforma = plataformaPadrao } = {}) {
  let desligada = false;
  let secao = null;
  let desassinar = () => {};

  const montar = async () => {
    const plat = await plataforma();
    const at = plat?.atualizacaoDaCasca ?? null;
    if (desligada || !plat?.casca?.web || !at) return;

    const inserir = (html) => {
      const sobre = pagina.querySelector?.('[aria-labelledby="config-sobre-secao"]');
      if (sobre) {
        sobre.insertAdjacentHTML('beforebegin', html);
        return sobre.previousElementSibling;
      }
      pagina.insertAdjacentHTML('beforeend', html);
      return pagina.lastElementChild;
    };

    const mostrar = () => {
      if (desligada) return;
      if (at.estado() !== 'pronta') {
        secao?.remove();
        secao = null;
        return;
      }
      const pode = at.podeAplicar();
      if (!secao) {
        secao = inserir(marcacao(pode, icone));
        secao.addEventListener('click', (e) => {
          const botao = e.target.closest?.('[data-atualizar]');
          if (!botao || botao.disabled) return;
          botao.disabled = true;
          if (!at.aplicar()) mostrar();
        });
        return;
      }
      const cartao = secao.querySelector('[data-cartao="atualizar"]');
      if (cartao.dataset.podeAplicar === String(pode)) return;
      const doc = cartao.ownerDocument;
      const tinhaFoco = Boolean(doc?.activeElement && cartao.contains(doc.activeElement));
      cartao.dataset.podeAplicar = String(pode);
      cartao.innerHTML = marcacaoDoCartao(pode, icone);
      if (tinhaFoco) cartao.querySelector('button')?.focus();
    };

    mostrar();
    desassinar = at.assinar(mostrar);
  };
  montar().catch((erro) => console.warn('[atualização]', erro));
  return () => {
    desligada = true;
    desassinar();
    secao?.remove();
  };
}
