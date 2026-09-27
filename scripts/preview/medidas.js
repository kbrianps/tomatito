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
//   __ttFluent()           (M11) os tokens do Fluent no <html> e as cores que
//                          os fluent-switch e fluent-radio da tela pintam agora
//   __ttFluent('suave')    o mesmo, depois de trocar o data-theme e esperar
//                          dois quadros (a troca que se faz no DevTools)
//   __ttFluentAninhado('suave')
//                          o mesmo num <div data-theme="suave"> com um switch,
//                          posto e tirado da página (prévia aninhada)
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

  // M11: tokens do Fluent (todas as propriedades --* do <html> que não são
  // --tt-*), os --tt-* (para conferir a ponte) e, para cada componente da
  // tela, as cores do próprio elemento e do indicador dentro do shadow root,
  // que é onde os tokens viram pixel.
  window.__ttFluent = async (tema) => {
    const h = document.documentElement;
    if (tema) {
      h.dataset.theme = tema;
      await doisQuadros();
    }
    return { tema: h.dataset.theme, ...fluentEm(h, document) };
  };
  // Prévia aninhada (o motivo de os seletores serem [data-theme], e não
  // :root; PLANO.md, 4.2): um <div data-theme="suave"> com um switch marcado
  // dentro do <html> de outro tema. Mede o div e o switch e os tira da tela.
  window.__ttFluentAninhado = async (tema) => {
    const div = document.createElement('div');
    div.dataset.theme = tema;
    div.innerHTML = '<fluent-switch checked></fluent-switch>';
    document.body.append(div);
    await doisQuadros();
    const r = { tema, temaDoHtml: document.documentElement.dataset.theme, ...fluentEm(div, div) };
    div.remove();
    return r;
  };
  function fluentEm(el, raiz) {
    const cs = getComputedStyle(el);
    const props = [...cs].filter((p) => p.startsWith('--'));
    const valores = (doTomatito) =>
      Object.fromEntries(
        props.filter((p) => p.startsWith('--tt-') === doTomatito).map((p) => [p.slice(2), cs.getPropertyValue(p).trim()]),
      );
    const componentes = [...raiz.querySelectorAll('fluent-switch, fluent-radio')].map((c) => {
      const s = getComputedStyle(c);
      const ind = c.shadowRoot?.querySelector('.checked-indicator');
      const si = ind && getComputedStyle(ind);
      return {
        tag: c.localName,
        marcado: Boolean(c.checked),
        fundo: s.backgroundColor,
        borda: s.borderTopColor,
        indicador: si && { fundo: si.backgroundColor, cor: si.color },
      };
    });
    return { tokens: valores(false), tt: valores(true), componentes };
  }
  // M12: os controles do #/dev que abrem por cima da tela (as listas do
  // dropdown, os menus, as dicas e o diálogo). Nomes = data-amostra do
  // dev-catalog.js (as dicas, pelo id do botão):
  //
  //   __ttPosicionar('menu-sessao', 'baixo')
  //                          rola a tela para o controle ficar no meio da
  //                          janela ('meio'), colado na borda de baixo
  //                          ('baixo', para a lista virar para cima) ou logo
  //                          abaixo da barra de título ('cima', para a dica
  //                          virar para baixo); devolve o ponto de clique em
  //                          px da página (o roteiro aninhado soma a posição
  //                          da janela e clica com o ponteiro virtual)
  //   __ttAbrir('menu-sessao')
  //                          abre pelo JS (clique no gatilho; nas dicas, o
  //                          mouseenter, com o atraso de 250 ms)
  //   __ttMedirPopover('menu-sessao')
  //                          caixas do gatilho e do que abriu, de que lado
  //                          abriu, os desvios de alinhamento, se cabe na
  //                          janela, o foco e as cores
  //   __ttRolarAberto('menu-sessao', 40)
  //                          rola a tela 40 px com o controle aberto e mede
  //                          de novo (a lista acompanha o gatilho?)
  //   __ttFecharPopovers()   fecha tudo e devolve quantos continuam abertos
  //   __ttCaixas()           cores das caixas de seleção (marcada, desmarcada)
  const POPOVERS = {
    'menu-sessao': 'menu',
    'menu-temporizador': 'menu',
    meta: 'dropdown',
    zerar: 'dropdown',
    'dialogo-meta': 'dropdown',
    'dica-reiniciar': 'dica',
    'dica-volta': 'dica',
    dialogo: 'dialogo',
  };
  const partesDe = (nome) => {
    const tipo = POPOVERS[nome];
    if (!tipo) throw new Error(`controle desconhecido: ${nome}`);
    const q = (s) => document.querySelector(s);
    if (tipo === 'menu') {
      const host = q(`fluent-menu[data-amostra="${nome}"]`);
      const gatilho = host.querySelector('[slot="trigger"]');
      return { tipo, host, ancora: gatilho, alvo: gatilho, popup: host.querySelector('fluent-menu-list') };
    }
    if (tipo === 'dropdown') {
      const host = q(`fluent-dropdown[data-amostra="${nome}"]`);
      return { tipo, host, ancora: host, alvo: host.control ?? host, popup: host.querySelector('fluent-listbox') };
    }
    if (tipo === 'dica') {
      const ancora = q(`#amostra-${nome}`);
      return { tipo, host: ancora, ancora, alvo: ancora, popup: q(`fluent-tooltip[anchor="amostra-${nome}"]`) };
    }
    const host = q('#amostra-dialogo-meta');
    const botao = q('[data-abre="amostra-dialogo-meta"]');
    return { tipo, host, ancora: botao, alvo: botao, popup: host.dialog ?? host.shadowRoot?.querySelector('dialog') };
  };
  const areaDaTela = () => {
    const r = document.querySelector('.tt-rolagem')?.getBoundingClientRect();
    return r ? { topo: r.top, base: r.bottom } : { topo: 0, base: innerHeight };
  };
  window.__ttPosicionar = async (nome, onde = 'meio') => {
    const { ancora, alvo } = partesDe(nome);
    const rolagem = document.querySelector('.tt-rolagem');
    const tela = rolagem?.firstElementChild;
    // Um bloco alto no fim da tela, para dar para rolar a última seção até o
    // topo (o mesmo do __ttMedir(..., { alto: true })).
    if (tela && !tela.querySelector('.tt-teste-alto')) {
      const bloco = document.createElement('div');
      bloco.className = 'tt-teste-alto';
      bloco.style.setProperty('height', '3000px');
      tela.append(bloco);
    }
    const area = areaDaTela();
    const r = ancora.getBoundingClientRect();
    const alvoY = { meio: (area.topo + area.base) / 2 - r.height / 2, baixo: area.base - 8 - r.height, cima: area.topo + 8 }[onde];
    if (alvoY === undefined) throw new Error(`posição desconhecida: ${onde}`);
    rolagem.scrollTop += r.top - alvoY;
    await doisQuadros();
    const a = alvo.getBoundingClientRect();
    return { onde, rolagem: rolagem.scrollTop, ancora: caixa(ancora), clique: [Math.round(a.x + a.width / 2), Math.round(a.y + a.height / 2)] };
  };
  window.__ttAbrir = async (nome) => {
    const { tipo, alvo } = partesDe(nome);
    if (tipo === 'dica') alvo.dispatchEvent(new MouseEvent('mouseenter'));
    else alvo.click();
    await new Promise((r) => setTimeout(r, tipo === 'dica' ? 450 : 300));
    await doisQuadros();
    return window.__ttMedirPopover(nome);
  };
  const descrever = (el) => {
    if (!el || el === document.body) return 'body';
    const t = el.textContent?.trim().replace(/\s+/g, ' ').slice(0, 40);
    return `${el.localName}${t ? ` "${t}"` : ''}`;
  };
  window.__ttMedirPopover = (nome) => {
    const { tipo, host, ancora, popup } = partesDe(nome);
    const aberto = tipo === 'dialogo' ? Boolean(popup?.open) : Boolean(popup?.matches(':popover-open'));
    const janela = [innerWidth, innerHeight];
    const base = { nome, tipo, aberto, janela, foco: descrever(document.activeElement) };
    if (!aberto) return base;
    const a = ancora.getBoundingClientRect();
    const p = popup.getBoundingClientRect();
    const cs = getComputedStyle(popup);
    const arred = (v) => Math.round(v * 10) / 10;
    const r = {
      ...base,
      ancora: caixa(ancora),
      popup: caixa(popup),
      dentro: p.left >= -0.5 && p.top >= -0.5 && p.right <= janela[0] + 0.5 && p.bottom <= janela[1] + 0.5,
      fundo: cs.backgroundColor,
      borda: cs.borderTopColor,
      posicao: cs.position,
    };
    if (tipo === 'dialogo') {
      return {
        ...r,
        modal: popup.matches(':modal'),
        centro: [arred(p.left + p.width / 2 - janela[0] / 2), arred(p.top + p.height / 2 - janela[1] / 2)],
        cortina: getComputedStyle(popup, '::backdrop').backgroundColor,
        titulo: host.querySelector('[slot="title"]')?.textContent,
      };
    }
    // Lado em que abriu e os desvios (0 = no lugar): embaixo, o topo da lista
    // menos a base do gatilho; em cima, a base do gatilho... ao contrário.
    const abaixo = p.top >= a.bottom - 1;
    const acima = p.bottom <= a.top + 1;
    Object.assign(r, {
      lado: abaixo ? 'abaixo' : acima ? 'acima' : 'sobre',
      vao: arred(abaixo ? p.top - a.bottom : acima ? a.top - p.bottom : NaN),
      esquerda: arred(p.left - a.left),
      centro: arred(p.left + p.width / 2 - (a.left + a.width / 2)),
      largura: [arred(a.width), arred(p.width)],
    });
    if (tipo !== 'dica') {
      const item = popup.querySelector('fluent-menu-item, fluent-option');
      if (item) r.item = { cor: getComputedStyle(item).color, fundo: getComputedStyle(item).backgroundColor };
      r.expandido = (tipo === 'menu' ? ancora : host.control)?.getAttribute('aria-expanded');
    }
    return r;
  };
  window.__ttRolarAberto = async (nome, dy) => {
    const antes = window.__ttMedirPopover(nome);
    document.querySelector('.tt-rolagem').scrollTop += dy;
    await doisQuadros();
    await doisQuadros();
    const depois = window.__ttMedirPopover(nome);
    const mov = (k) => (antes[k] && depois[k] ? Math.round((depois[k][1] - antes[k][1]) * 10) / 10 : null);
    return { dy, antes, depois, moveuAncora: mov('ancora'), moveuPopup: mov('popup') };
  };
  window.__ttFecharPopovers = async () => {
    // Os componentes acompanham o evento toggle do popover (o menu atualiza o
    // aria-expanded, e o dropdown, o open), então basta fechar cada popover.
    for (const p of document.querySelectorAll(':popover-open')) p.hidePopover();
    for (const d of document.querySelectorAll('fluent-dialog')) if (d.dialog?.open) d.hide();
    document.activeElement?.blur?.();
    await doisQuadros();
    const dialogos = [...document.querySelectorAll('fluent-dialog')].filter((d) => d.dialog?.open).length;
    return document.querySelectorAll(':popover-open').length + dialogos;
  };
  // Cores das caixas de seleção e, para conferir a ponte, os tokens que o
  // checkbox marcado lê no hover e no clique ao lado dos --tt-* do tema.
  window.__ttCaixas = () =>
    [...document.querySelectorAll('fluent-checkbox')].map((c) => {
      const s = getComputedStyle(c);
      const ind = c.shadowRoot?.querySelector('.checked-indicator');
      const v = (p) => s.getPropertyValue(p).trim().toUpperCase();
      return {
        marcada: Boolean(c.checked),
        desabilitada: Boolean(c.disabled),
        fundo: s.backgroundColor,
        borda: s.borderTopColor,
        glifo: ind ? getComputedStyle(ind).color : null,
        caixa: caixa(c),
        tokens: {
          bordaHover: v('--colorCompoundBrandStrokeHover'),
          bordaClique: v('--colorCompoundBrandStrokePressed'),
          accent: v('--tt-accent'),
          accentHover: v('--tt-accent-hover'),
          accentClique: v('--tt-accent-pressed'),
        },
      };
    });
  // Controle negativo do M12: tira a âncora das listas do menu e do dropdown
  // (um nome de âncora que não existe, com !important, que vence o estilo do
  // componente e o que o dropdown grava no elemento). As listas passam a abrir
  // fora do lugar, e as conferências de posição precisam acusar.
  window.__ttSabotarAncoras = () => {
    const folha = new CSSStyleSheet();
    folha.replaceSync('fluent-menu-list, fluent-listbox { position-anchor: --tt-sem-ancora !important; }');
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, folha];
    return document.adoptedStyleSheets.length;
  };
})();
