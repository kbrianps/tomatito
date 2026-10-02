// A seção "Navegador" das Configurações, só na versão web (PLANO-WEB, 4;
// PLANO-WEB-V1, W18). Dois cartões:
//
// - "Tempo na aba": o switch da chave `tomatito:web.tempoNaAba` (o título da
//   aba com os minutos, W17), pelo `abaDaCasca` (platform/web/aba.js);
// - "Instalar o Tomatito": só com o convite do navegador (o
//   `beforeinstallprompt`, guardado pelo `instalacaoDaCasca`,
//   platform/web/instalacao.js). O botão abre a janela de instalação do
//   navegador; aceito, recusado ou instalado pelo menu, o cartão some.
//
// Quem decide se a seção existe é a casca (`casca.web`). No desktop não
// aparece nada. Módulo à parte, ligado por uma linha no settings.js, como o
// avisos-web.js. Fica antes da Atualização e do Sobre.
import t from '../lib/i18n/pt-BR.js';

const n = t.configuracoes.navegador;
const semIcone = () => '';

// A plataforma, carregada só quando a tela monta (os testes em Node passam
// uma de mentira).
const plataformaPadrao = () => import('#plataforma');

const estadoDoSwitch = (ligado) => (ligado ? t.configuracoes.ativado : t.configuracoes.desativado);

/** HTML do cartão "Tempo na aba", com o switch em `ligado`. */
export function marcacaoDoTempo(ligado, icone = semIcone) {
  return (
    '<div class="tt-config-cartao" data-cartao="tempo-aba"><div class="tt-config-cabecalho">' +
    `<span class="tt-config-icone">${icone('clock', 20)}</span>` +
    `<span class="tt-config-textos"><span id="config-tempo-aba" class="tt-config-titulo">${n.tempoNaAba.titulo}</span>` +
    `<span id="config-tempo-aba-desc" class="tt-config-descricao tt-t-caption">${n.tempoNaAba.descricao}</span></span>` +
    `<label class="tt-config-controle"><span class="tt-config-estado" data-estado aria-hidden="true">${estadoDoSwitch(ligado)}</span>` +
    `<fluent-switch data-tempo-aba aria-labelledby="config-tempo-aba" aria-describedby="config-tempo-aba-desc"${ligado ? ' checked' : ''}></fluent-switch></label>` +
    '</div></div>'
  );
}

/** HTML do cartão "Instalar o Tomatito". */
export function marcacaoDoInstalar(icone = semIcone) {
  // O nome do botão é o título do cartão, que começa pelo texto visível (WCAG 2.5.3).
  return (
    '<div class="tt-config-cartao" data-cartao="instalar"><div class="tt-config-cabecalho">' +
    `<span class="tt-config-icone">${icone('arrow_download', 20)}</span>` +
    `<span class="tt-config-textos"><span id="config-instalar" class="tt-config-titulo">${n.instalar.titulo}</span>` +
    `<span id="config-instalar-desc" class="tt-config-descricao tt-t-caption">${n.instalar.descricao}</span></span>` +
    '<span class="tt-config-controle"><button type="button" data-instalar aria-labelledby="config-instalar" aria-describedby="config-instalar-desc">' +
    `${n.instalar.botao}</button></span></div></div>`
  );
}

/** HTML da seção: o Tempo na aba sempre; o Instalar só com o convite. */
export function marcacao({ ligado = true, instalavel = false, icone = semIcone } = {}) {
  return (
    '<section class="tt-config-secao" aria-labelledby="config-navegador-web" data-secao="navegador">' +
    `<h2 id="config-navegador-web" class="tt-t-body-strong">${n.secao}</h2>` +
    marcacaoDoTempo(ligado, icone) +
    (instalavel ? marcacaoDoInstalar(icone) : '') +
    '</section>'
  );
}

/**
 * Liga a seção na página (`.tt-pagina`), antes da Atualização (se já
 * estiver lá) ou do Sobre, ou no fim. Só com `casca.web`. Devolve a limpeza.
 */
export function ligarNavegadorWeb(pagina, { icone = semIcone, plataforma = plataformaPadrao } = {}) {
  let desligada = false;
  let secao = null;
  let desassinar = () => {};

  const montar = async () => {
    const plat = await plataforma();
    if (desligada || !plat?.casca?.web) return;
    const aba = plat.abaDaCasca ?? null;
    const inst = plat.instalacaoDaCasca ?? null;
    const html = marcacao({ ligado: aba ? aba.ligado() : true, instalavel: Boolean(inst?.disponivel()), icone });
    const antes =
      pagina.querySelector?.('[data-secao="atualizacao"]') ?? pagina.querySelector?.('[aria-labelledby="config-sobre-secao"]');
    if (antes) {
      antes.insertAdjacentHTML('beforebegin', html);
      secao = antes.previousElementSibling;
    } else {
      pagina.insertAdjacentHTML('beforeend', html);
      secao = pagina.lastElementChild;
    }

    const sw = secao.querySelector('[data-tempo-aba]');
    secao.addEventListener('change', (e) => {
      if (e.target !== sw) return;
      const ligado = Boolean(sw.checked);
      aba?.definir(ligado);
      const estado = sw.parentElement?.querySelector('[data-estado]');
      if (estado) estado.textContent = estadoDoSwitch(ligado);
    });

    // O cartão Instalar acompanha o convite.
    const mostrarInstalar = (disponivel) => {
      if (desligada) return;
      const cartao = secao.querySelector('[data-cartao="instalar"]');
      if (disponivel && !cartao) secao.insertAdjacentHTML('beforeend', marcacaoDoInstalar(icone));
      else if (!disponivel && cartao) {
        const doc = cartao.ownerDocument;
        const tinhaFoco = Boolean(doc?.activeElement && cartao.contains(doc.activeElement));
        cartao.remove();
        if (tinhaFoco) sw?.focus?.();
      }
    };
    secao.addEventListener('click', async (e) => {
      const botao = e.target.closest?.('[data-instalar]');
      if (!botao || botao.disabled || !inst) return;
      botao.disabled = true;
      await inst.instalar();
      if (botao.isConnected) botao.disabled = false;
      mostrarInstalar(inst.disponivel());
    });
    if (inst?.assinar) desassinar = inst.assinar(mostrarInstalar);
  };
  montar().catch((erro) => console.warn('[navegador]', erro));
  return () => {
    desligada = true;
    desassinar();
    secao?.remove();
  };
}
