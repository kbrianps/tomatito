import t from '../lib/i18n/pt-BR.js';

const f = t.configuracoes.fundoDoFull;

export const deveMostrar = (configuracoes) => configuracoes?.fullMode === 'opaque';

export function marcacao(icone = () => '') {
  return (
    '<div class="tt-config-cartao" data-cartao="fundo-do-full">' +
    '<div class="tt-config-cabecalho">' +
    `<span class="tt-config-icone">${icone('paint_brush', 20)}</span>` +
    `<span class="tt-config-textos"><span id="config-fundo-full" class="tt-config-titulo">${f.titulo}</span>` +
    `<span id="config-fundo-full-desc" class="tt-config-descricao tt-t-caption" data-fundo-texto>${f.descricao}</span></span>` +
    `<span class="tt-config-controle"><button type="button" data-fundo-transparente aria-describedby="config-fundo-full-desc">${f.botao}</button></span>` +
    '</div></div>'
  );
}

export function ligarFundoDoFull(secao, { store, icone = () => '' }) {
  if (!secao) return () => {};
  let cartao = null;
  let desligado = false;

  const aoClicar = async (ev) => {
    const botao = ev.target.closest?.('[data-fundo-transparente]');
    if (!botao) return;
    botao.disabled = true;
    try {
      await store.gravarConfiguracoes({ fullMode: 'auto', fullValidated: '' });
      if (desligado || !cartao) return;
      cartao.querySelector('[data-fundo-texto]').textContent = f.feito;
      botao.remove();
    } catch (erro) {
      console.error('[fundo do Full]', erro);
      botao.disabled = false;
    }
  };

  const mostrar = (configuracoes) => {
    if (desligado) return;
    if (deveMostrar(configuracoes) && !cartao) {
      secao.insertAdjacentHTML('beforeend', marcacao(icone));
      cartao = secao.querySelector('[data-cartao="fundo-do-full"]');
      cartao.addEventListener('click', aoClicar);
    }
  };

  mostrar(store.configuracoes);
  const desassinar = store.assinarConfiguracoes(mostrar);
  return () => {
    desligado = true;
    desassinar();
    cartao?.removeEventListener('click', aoClicar);
  };
}
