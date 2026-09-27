// Medidas do layout da janela main (M10), para as prévias e para o teste
// aninhado. Não é módulo nem importa nada: o tauri-mock.js da prévia o importa
// pelo efeito, e o sonda.config.mjs do teste aninhado o cola na sonda. Nunca
// entra no app.
//
//   __ttMedidas()          o estado do layout agora (ver abaixo)
//   __ttMedir('#/foco')    vai para a rota, espera dois quadros e mede
//   __ttMedir('#/foco', { alto: true })
//                          o mesmo, com um bloco de 3000 px no fim da tela,
//                          para a camada ganhar a barra de rolagem vertical
//   __ttTema('light')      troca o data-theme, espera dois quadros e mede
//
// "Rolagem horizontal" é medida pelo efeito, e não por scrollWidth >
// clientWidth: o teste manda rolar para a direita e vê quanto andou. Com zoom
// fracionário (1,5 no WebKitGTK), o scrollWidth arredonda para cima frações de
// 0,00001 px e acusaria 1 px que não rola (docs/decisoes.md, M10).
(() => {
  const arred = (v) => Math.round(v * 100) / 100;
  const caixa = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return [r.x, r.y, r.width, r.height].map(arred);
  };
  const visivel = (el) => {
    const s = getComputedStyle(el);
    return s.display !== 'none' && s.visibility === 'visible' && Number(s.opacity) > 0;
  };
  // Quanto o elemento rola para a direita (0 = sem rolagem horizontal).
  const rolaDentro = (el) => {
    if (!el) return null;
    const antes = el.scrollLeft;
    el.scrollLeft = 1e6;
    const andou = el.scrollLeft;
    el.scrollLeft = antes;
    return andou;
  };
  const rolaPagina = () => {
    const [x, y] = [scrollX, scrollY];
    scrollTo(1e6, y);
    const andou = scrollX;
    scrollTo(x, y);
    return andou;
  };
  // Elementos visíveis que passam da borda direita da janela (0,5 px de folga
  // para o arredondamento do zoom).
  const foraDaJanela = (largura) =>
    [...document.body.querySelectorAll('*')]
      .filter((el) => el.getBoundingClientRect().right > largura + 0.5 && el.getClientRects().length && visivel(el))
      .map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`);

  window.__ttMedidas = () => {
    const nav = document.querySelector('.tt-nav');
    const cont = document.querySelector('.tt-conteudo');
    const rolagem = document.querySelector('.tt-rolagem');
    const grade = document.querySelector('.tt-foco-grade');
    const largura = visualViewport?.width ?? innerWidth;
    const cs = cont ? getComputedStyle(cont) : null;
    return {
      janela: [arred(largura), arred(visualViewport?.height ?? innerHeight)],
      dpr: devicePixelRatio,
      tema: document.documentElement.dataset.theme,
      rota: location.hash,
      barraVertical: rolagem ? rolagem.offsetWidth - rolagem.clientWidth : null,
      rolagem: { pagina: rolaPagina(), conteudo: rolaDentro(rolagem), camada: rolaDentro(cont) },
      foraDaJanela: foraDaJanela(largura),
      painel: nav && {
        largura: arred(nav.getBoundingClientRect().width),
        rotulosVisiveis: [...nav.querySelectorAll('.tt-nav-rotulo')].filter((r) => r.getBoundingClientRect().width > 1).length,
        rotulos: [...nav.querySelectorAll('.tt-nav-rotulo')].map((r) => r.textContent),
        itens: [...nav.querySelectorAll('a.tt-nav-item')].map(caixa),
        icones: [...nav.querySelectorAll('a.tt-nav-item .tt-icone')].map(caixa),
        dicas: [...nav.querySelectorAll('.tt-nav-dica')].filter(visivel).map((d) => ({ texto: d.textContent, caixa: caixa(d) })),
      },
      camada: cs && {
        caixa: caixa(cont),
        larguraUtil: cont.clientWidth,
        larguraDaTela: rolagem?.clientWidth ?? null,
        fundo: cs.backgroundColor,
        bordas: [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth],
        corDaBorda: [cs.borderTopColor, cs.borderLeftColor],
        raios: [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius],
        superficie: cs.getPropertyValue('--tt-bg-surface').trim(),
        borda: cs.getPropertyValue('--tt-border').trim(),
      },
      grade: grade && {
        colunas: getComputedStyle(grade).gridTemplateColumns.split(' ').length,
        caixa: caixa(grade),
        cartoes: [...grade.querySelectorAll('[data-cartao]')].map((c) => ({ id: c.dataset.cartao, caixa: caixa(c) })),
      },
    };
  };
  const doisQuadros = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  window.__ttMedir = async (hash, { alto = false } = {}) => {
    if (location.hash !== hash) {
      location.hash = hash;
      await new Promise((r) => addEventListener('hashchange', r, { once: true }));
    }
    const tela = document.querySelector('.tt-rolagem > *');
    if (alto && tela && !tela.querySelector('.tt-teste-alto')) {
      const bloco = document.createElement('div');
      bloco.className = 'tt-teste-alto';
      bloco.style.setProperty('height', '3000px');
      tela.append(bloco);
    }
    await doisQuadros();
    return window.__ttMedidas();
  };
  window.__ttTema = async (tema) => {
    document.documentElement.dataset.theme = tema;
    await doisQuadros();
    return window.__ttMedidas();
  };
})();
