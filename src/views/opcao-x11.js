// A opção avançada "Compatibilidade X11" (PLANO.md, 5.9, plano B2, e M57).
// Só no Linux, numa sessão Wayland: grava a `linuxX11` pelo `settings_set`;
// no próximo início, o Rust abre o app pelo Xwayland (src-tauri/src/
// compat_x11.rs), onde o "Sempre na frente" do tomate funciona por código.
// Como a troca só vale num início novo, a tela oferece "Reiniciar agora".
//
// Módulo à parte, ligado por uma linha no settings.js, como a dica do M56:
// as Configurações crescem na frente A (M38 e M39), e a junção só precisa
// manter essa linha (docs/decisoes.md, M57). A seção entra no fim da página.
import t from '../lib/i18n/pt-BR.js';

const x = t.configuracoes.x11;
const semIcone = () => '';

// O IPC, carregado só no Linux (os testes em Node montam a tela sem o Tauri).
const ipcPadrao = () =>
  import('../lib/ipc.js').then((ipc) => ({
    situacao: ipc.compatX11.situacao,
    reiniciar: ipc.compatX11.reiniciar,
    obter: ipc.configuracoes.obter,
    gravar: ipc.configuracoes.gravar,
  }));

/**
 * O que o rodapé do cartão mostra, dado o valor gravado (`ligada`) e a
 * situação deste processo (`x11_compat_get`): `'reiniciar'` quando o gravado
 * difere do que está valendo, `'semXwayland'` quando ligada numa sessão sem
 * Xwayland (não há o que reiniciar), ou `null`.
 */
export function rodape(ligada, { ativa, xwayland }) {
  if (ligada && !ativa && !xwayland) return 'semXwayland';
  return ligada !== ativa ? 'reiniciar' : null;
}

/** HTML do rodapé (vazio quando não há o que dizer). */
export function marcacaoRodape(qual) {
  if (qual === 'reiniciar') {
    return `<span class="tt-t-caption">${x.proximoInicio}</span><button type="button" data-reiniciar>${x.reiniciar}</button>`;
  }
  if (qual === 'semXwayland') return `<span class="tt-t-caption">${x.semXwayland}</span>`;
  return '';
}

/** HTML da seção Avançado, com o cartão da opção. */
export function marcacao({ ligada, situacao, icone = semIcone }) {
  const qual = rodape(ligada, situacao);
  return (
    '<section class="tt-config-secao" aria-labelledby="config-avancado" data-secao="avancado">' +
    `<h2 id="config-avancado" class="tt-t-body-strong">${t.configuracoes.avancado}</h2>` +
    '<div class="tt-config-cartao" data-cartao="x11">' +
    `<div class="tt-config-cabecalho"><span class="tt-config-icone">${icone('window_wrench', 20)}</span>` +
    `<span class="tt-config-textos"><span id="config-x11" class="tt-config-titulo">${x.titulo}</span>` +
    `<span id="config-x11-desc" class="tt-config-descricao tt-t-caption">${x.descricao}</span></span>` +
    `<fluent-switch class="tt-config-controle" aria-labelledby="config-x11" aria-describedby="config-x11-desc"${ligada ? ' checked' : ''}></fluent-switch></div>` +
    `<div class="tt-config-rodape" role="status"${qual ? '' : ' hidden'}>${marcacaoRodape(qual)}</div>` +
    '</div></section>'
  );
}

/**
 * Liga a opção na página (`.tt-pagina`). Fora do Linux, ou numa sessão sem
 * Wayland (o X11 de verdade, como o Cinnamon), não mostra nada. Devolve a
 * limpeza.
 */
export function ligarOpcaoX11(pagina, { doc = globalThis.document, icone = semIcone, ipc = ipcPadrao } = {}) {
  let desligada = false;
  let secao = null;
  if (doc.documentElement.dataset.platform !== 'linux') return () => {};

  const montar = async () => {
    const api = await ipc();
    const [situacao, cfg] = await Promise.all([api.situacao(), api.obter()]);
    if (desligada || !situacao?.disponivel) return;
    pagina.insertAdjacentHTML('beforeend', marcacao({ ligada: cfg.linuxX11 === true, situacao, icone }));
    secao = pagina.lastElementChild;
    const chave = secao.querySelector('fluent-switch');
    const pe = secao.querySelector('.tt-config-rodape');
    const mostrar = (ligada) => {
      const qual = rodape(ligada, situacao);
      pe.innerHTML = marcacaoRodape(qual);
      pe.hidden = !qual;
    };
    chave.addEventListener('change', async () => {
      const ligada = chave.checked === true;
      try {
        const depois = await api.gravar({ linuxX11: ligada });
        mostrar(depois?.linuxX11 === true);
      } catch (erro) {
        console.error('[x11]', erro);
        chave.checked = !ligada;
      }
    });
    pe.addEventListener('click', (e) => {
      if (!e.target.closest?.('[data-reiniciar]')) return;
      e.target.closest('[data-reiniciar]').disabled = true;
      api.reiniciar().catch((erro) => console.error('[x11]', erro));
    });
  };
  montar().catch((erro) => console.warn('[x11]', erro));
  return () => {
    desligada = true;
    secao?.remove();
  };
}
