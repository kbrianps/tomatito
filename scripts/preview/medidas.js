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
    // Os desabilitados (M13) têm cores próprias e são conferidos pelo botoes.mjs.
    const componentes = [...raiz.querySelectorAll('fluent-switch:not([disabled]), fluent-radio:not([disabled])')].map((c) => {
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
  // M13: botões próprios, foco, a dica dos botões de ícone, os ícones e os
  // desabilitados, no #/dev.
  //
  //   __ttCor('--tt-fg-disabled')
  //                          a cor do token no tema atual, escrita como o
  //                          getComputedStyle escreve (para comparar)
  //   __ttBotoes()           os botões [data-botao] do catálogo: caixa, raio,
  //                          fundo, texto, bordas de cima e de baixo, anel e o
  //                          tamanho do ícone
  //   __ttFoco()             o elemento com o foco, se casa :focus-visible, e
  //                          o contorno e a sombra dele (o anel duplo)
  //   __ttDica()             a dica dos botões de ícone: aberta, texto, de que
  //                          botão, de que lado, o vão, o centro e as cores
  //   __ttMostrarDica('[data-botao="grande"]', { espera: 400 })
  //                          pointerover sintético no botão e mede depois da
  //                          espera (o atraso é de 250 ms)
  //   __ttIcones()           as células do cartão Ícones e os pedidos de rede
  //                          ao @fluentui/svg-icons (tem de ser nenhum)
  //   __ttDesabilitados()    as cores dos componentes Fluent desabilitados e
  //                          dos rótulos ao lado deles
  //   __ttSabotarDica()      controle negativo: a dica perde a âncora
  //   __ttPintura('fluent-option')
  //                          (M22) o fundo e o texto que o elemento pinta agora,
  //                          e se ele está em :hover e :active (o ponteiro da
  //                          prévia, --hover e --press)
  window.__ttCor = (token, prop = 'background-color') => {
    const el = document.createElement('div');
    el.style.setProperty(prop, `var(${token})`);
    document.body.append(el);
    const v = getComputedStyle(el).getPropertyValue(prop);
    el.remove();
    return v;
  };
  const icone = (el) => {
    const svg = el.querySelector('svg.tt-icone');
    if (!svg) return null;
    const r = svg.getBoundingClientRect();
    return { tamanho: [arred(r.width), arred(r.height)], cor: getComputedStyle(svg).fill };
  };
  window.__ttBotoes = () =>
    Object.fromEntries(
      [...document.querySelectorAll('[data-botao]')].map((b) => {
        const s = getComputedStyle(b);
        return [
          b.dataset.botao,
          {
            caixa: caixa(b),
            raio: s.borderTopLeftRadius,
            fundo: s.backgroundColor,
            cor: s.color,
            bordaCima: s.borderTopColor,
            bordaBaixo: s.borderBottomColor,
            bordaLargura: s.borderTopWidth,
            desabilitado: b.disabled,
            nome: b.getAttribute('aria-label') ?? b.textContent.trim(),
            dica: b.hasAttribute('data-dica'),
            icone: icone(b),
          },
        ];
      }),
    );
  window.__ttFoco = () => {
    const a = document.activeElement;
    const s = a && getComputedStyle(a);
    return {
      elemento: a === document.body ? 'body' : `${a.localName} "${(a.getAttribute('aria-label') ?? a.textContent).trim().slice(0, 40)}"`,
      visivel: Boolean(a?.matches(':focus-visible')),
      contorno: s && [s.outlineStyle, s.outlineWidth, s.outlineColor, s.outlineOffset],
      sombra: s?.boxShadow,
      raio: s?.borderTopLeftRadius,
      esperado: { fora: window.__ttCor('--tt-focus-outer'), dentro: window.__ttCor('--tt-focus-inner') },
    };
  };
  window.__ttDica = () => {
    const d = document.querySelector('.tt-dica');
    if (!d) return { existe: false };
    const aberta = d.matches(':popover-open');
    const alvo = [...document.querySelectorAll('[data-dica]')].find((b) => b.style.getPropertyValue('anchor-name'));
    const base = {
      existe: true,
      aberta,
      popover: d.getAttribute('popover'),
      ariaHidden: d.getAttribute('aria-hidden'),
      quantas: document.querySelectorAll('.tt-dica').length,
      alvo: alvo ? alvo.getAttribute('aria-label') : null,
    };
    if (!aberta || !alvo) return base;
    const a = alvo.getBoundingClientRect();
    const p = d.getBoundingClientRect();
    const cs = getComputedStyle(d);
    const abaixo = p.top >= a.bottom - 1;
    const acima = p.bottom <= a.top + 1;
    return {
      ...base,
      texto: d.textContent,
      ancora: caixa(alvo),
      dica: caixa(d),
      lado: abaixo ? 'abaixo' : acima ? 'acima' : 'sobre',
      vao: arred(abaixo ? p.top - a.bottom : acima ? a.top - p.bottom : NaN),
      centro: arred(p.left + p.width / 2 - (a.left + a.width / 2)),
      dentro: p.left >= -0.5 && p.top >= -0.5 && p.right <= innerWidth + 0.5 && p.bottom <= innerHeight + 0.5,
      fundo: cs.backgroundColor,
      borda: cs.borderTopColor,
      cor: cs.color,
      fonte: cs.fontSize,
    };
  };
  window.__ttMostrarDica = async (seletor, { espera = 400, evento = 'pointerover' } = {}) => {
    const b = document.querySelector(seletor);
    if (!b) throw new Error(`botão não encontrado: ${seletor}`);
    if (evento === 'focus') b.focus({ focusVisible: true }); // a opção só existe no Chromium
    else b.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }));
    await new Promise((r) => setTimeout(r, espera));
    await doisQuadros();
    return window.__ttDica();
  };
  window.__ttSairDica = async (seletor) => {
    const b = document.querySelector(seletor);
    b.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, pointerType: 'mouse', relatedTarget: document.querySelector('.tt-amostra-topo h1') }));
    document.querySelector('.tt-amostra-topo h1').dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }));
    await new Promise((r) => setTimeout(r, 300));
    await doisQuadros();
    return window.__ttDica();
  };
  window.__ttIcones = () => {
    const celulas = [...document.querySelectorAll('.tt-amostra-icone')].map((li) => ({
      nome: li.dataset.icone,
      grades: [...li.querySelectorAll('[data-grade]')].map((g) => {
        const svg = g.querySelector('svg');
        const r = svg.getBoundingClientRect();
        return { grade: Number(g.dataset.grade), tamanho: [arred(r.width), arred(r.height)], desenho: svg.querySelectorAll('path').length, fill: getComputedStyle(svg).fill };
      }),
    }));
    const pedidos = performance.getEntriesByType('resource').map((e) => e.name);
    return {
      celulas,
      nomes: celulas.map((c) => c.nome),
      svgs: celulas.reduce((n, c) => n + c.grades.length, 0),
      noPacote: pedidos.filter((n) => /svg-icons/.test(n)),
      naPasta: pedidos.filter((n) => /\/src\/assets\/icons\//.test(n)).length,
      corDoTexto: getComputedStyle(document.querySelector('.tt-amostra-icone')).color,
    };
  };
  window.__ttDesabilitados = () => {
    const cs = (el) => getComputedStyle(el);
    const sombra = (el, sel) => el.shadowRoot?.querySelector(sel);
    const caixas = [...document.querySelectorAll('fluent-checkbox[disabled]')].map((c) => ({
      marcada: Boolean(c.checked),
      fundo: cs(c).backgroundColor,
      borda: cs(c).borderTopColor,
      glifo: c.checked ? cs(sombra(c, '.checked-indicator')).color : null,
      rotulo: cs(c.closest('.tt-opcao')).color,
    }));
    const chaves = [...document.querySelectorAll('fluent-switch[disabled]')].map((c) => ({
      ligada: Boolean(c.checked),
      fundo: cs(c).backgroundColor,
      borda: cs(c).borderTopColor,
      bolinha: cs(sombra(c, '.checked-indicator')).backgroundColor,
      rotulo: cs(c.closest('.tt-opcao')).color,
    }));
    const radios = [...document.querySelectorAll('fluent-radio[disabled]')].map((c) => ({
      fundo: cs(c).backgroundColor,
      borda: cs(c).borderTopColor,
      rotulo: cs(c.closest('.tt-opcao')).color,
    }));
    const dd = document.querySelector('fluent-dropdown[disabled]');
    const ctrl = sombra(dd, '.control');
    const lista = {
      fundo: ctrl && cs(ctrl).backgroundColor,
      texto: cs(dd.control ?? dd).color,
      rotulo: cs(dd.closest('.tt-campo').querySelector('.tt-campo-rotulo')).color,
      desabilitada: dd.control?.disabled ?? null,
    };
    // O item mora num popover fechado (display: none), e o WebKitGTK 2.52 não
    // recalcula o estilo herdado ali depois de uma troca de tema (o
    // getComputedStyle devolve as cores do tema anterior; aberto, o menu pinta
    // certo). A lista abre só para a medida.
    const item = document.querySelector('fluent-menu-item[disabled]');
    const listaDoMenu = item.closest('fluent-menu-list');
    const fechada = !listaDoMenu.matches(':popover-open');
    if (fechada) listaDoMenu.showPopover();
    const menu = { fundo: cs(item).backgroundColor, texto: cs(item).color };
    if (fechada) listaDoMenu.hidePopover();
    const esperado = {
      controle: window.__ttCor('--tt-ctl'),
      desabilitado: window.__ttCor('--tt-fg-disabled'),
      transparente: 'rgba(0, 0, 0, 0)',
    };
    return { caixas, chaves, radios, lista, menu, esperado };
  };
  window.__ttSabotarDica = () => {
    const folha = new CSSStyleSheet();
    folha.replaceSync('.tt-dica { position-anchor: --tt-sem-ancora !important; }');
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, folha];
    return document.adoptedStyleSheets.length;
  };
  // M17: o cartão "Pronto para focar". __ttSessao() devolve o estado visível
  // do cartão; __ttTeclaNoSeletor('PageUp') manda a tecla ao campo por
  // dispatchEvent (o WebKitGTK fora da tela não tem teclado de verdade; no
  // Chrome, o cartao-sessao.mjs usa o --key); __ttClicar('seletor') chama o
  // click() do elemento.
  window.__ttSessao = () => {
    const cartao = document.querySelector('[data-cartao="sessao"]');
    const campo = cartao.querySelector('[role="spinbutton"]');
    const [mais, menos] = cartao.querySelectorAll('[data-passo]');
    const caixa = (el) => {
      const c = cartao.getBoundingClientRect();
      const b = el.getBoundingClientRect();
      return [b.x - c.x, b.y - c.y, b.width, b.height].map((v) => Math.round(v * 10) / 10);
    };
    const visivel = (el) => !el.closest('[hidden]') && getComputedStyle(el).display !== 'none';
    return {
      valor: Number(campo.getAttribute('aria-valuenow')),
      numero: cartao.querySelector('[data-numero]').textContent,
      aria: Object.fromEntries(['role', 'tabindex', 'aria-label', 'aria-valuemin', 'aria-valuemax', 'aria-valuenow', 'aria-valuetext', 'aria-describedby'].map((k) => [k, campo.getAttribute(k)])),
      frase: cartao.querySelector('[data-frase]').textContent,
      pular: Boolean(cartao.querySelector('[data-pular]').checked),
      mais: { desabilitado: mais.disabled, tabindex: mais.getAttribute('tabindex') },
      menos: { desabilitado: menos.disabled, tabindex: menos.getAttribute('tabindex') },
      preparo: visivel(cartao.querySelector('[data-preparo]')),
      andamento: visivel(cartao.querySelector('[data-andamento]')),
      foco: document.activeElement?.className || document.activeElement?.tagName || null,
      inicios: window.__TOMATITO_PREVIEW_INICIOS__ ?? [],
      caixas: {
        janela: (({ x, y, width, height }) => [x, y, width, height])(cartao.getBoundingClientRect()),
        cartao: caixa(cartao),
        seletor: caixa(cartao.querySelector('.tt-seletor')),
        campo: caixa(campo),
        chevrons: caixa(cartao.querySelector('.tt-seletor-chevrons')),
        mais: caixa(mais),
        menos: caixa(menos),
        caixa: caixa(cartao.querySelector('[data-pular]')),
        botao: caixa(cartao.querySelector('[data-iniciar]')),
      },
      cores: {
        campo: getComputedStyle(cartao.querySelector('.tt-seletor')).backgroundColor,
        sublinhado: getComputedStyle(cartao.querySelector('.tt-seletor')).borderBottomColor,
        unidade: getComputedStyle(cartao.querySelector('.tt-seletor-unidade')).color,
        texto: getComputedStyle(cartao.querySelector('.tt-preparo-texto')).color,
        esperado: {
          campo: window.__ttCor('--tt-input-bg'),
          sublinhado: window.__ttCor('--tt-stroke-control'),
          unidade: window.__ttCor('--tt-fg-2-on-ctl'),
          texto: window.__ttCor('--tt-fg-2'),
        },
      },
    };
  };
  // M17: devolve o ponto de partida do Tab do Chrome para a barra de título
  // (o mouse o leva para onde passa), como numa janela recém-aberta.
  window.__ttTabDoComeco = () => {
    const t = document.querySelector('.tt-titlebar');
    t.tabIndex = -1;
    t.focus();
    t.removeAttribute('tabindex');
    return document.activeElement === t;
  };
  window.__ttSabotarSessao = async () => {
    const folha = new CSSStyleSheet();
    folha.replaceSync('.tt-card.tt-sessao { padding-top: 42px !important; }');
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, folha];
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return document.adoptedStyleSheets.length;
  };
  window.__ttTeclaNoSeletor = (key) => {
    const campo = document.querySelector('[data-cartao="sessao"] [role="spinbutton"]');
    campo.focus();
    const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    campo.dispatchEvent(e);
    return { cancelado: e.defaultPrevented, ...window.__ttSessao() };
  };
  window.__ttClicar = async (seletor) => {
    document.querySelector(seletor).click();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return window.__ttSessao();
  };
  // M18: a sessão em andamento no cartão de sessão. __ttMostrador() devolve o
  // que se vê: o modo do cartão, o título, o número, o traço aceso, o rótulo
  // do role="img", o botão de destaque, os itens do menu e o rodapé, mais as
  // caixas em px CSS do cartão. __ttSerieDoMostrador(ms, passo) anota
  // { t, minutos, aceso } a cada `passo` ms durante `ms` ms (o traço
  // avançando). __ttMenuSessao('parar'|'pular') abre o "..." pelo click() do
  // gatilho e escolhe o item pelo click() dele (no Chrome, o mostrador.mjs usa
  // cliques de verdade). __ttSabotarMostrador() desce o mostrador 6 px (o
  // controle negativo das posições).
  window.__ttMostrador = () => {
    const cartao = document.querySelector('[data-cartao="sessao"]');
    const m = cartao.querySelector('[data-mostrador]');
    const c = cartao.getBoundingClientRect();
    const cx = (el) => {
      const b = el.getBoundingClientRect();
      return [b.x - c.x, b.y - c.y, b.width, b.height].map((v) => Math.round(v * 10) / 10);
    };
    const principal = cartao.querySelector('.tt-andamento-botoes > button');
    const rodape = cartao.querySelector('[data-rodape]');
    const aceso = [...m.querySelectorAll('[data-traco]')].filter((l) => l.hasAttribute('data-aceso'));
    const cor = (el, prop) => (el ? getComputedStyle(el)[prop] : null);
    return {
      modo: cartao.dataset.modo,
      titulo: cartao.querySelector('h2').textContent,
      andamentoVisivel: !cartao.querySelector('[data-andamento]').hidden,
      minutos: Number(m.querySelector('[data-minutos]').textContent),
      aceso: aceso.map((l) => Number(l.dataset.traco)),
      rotulo: m.getAttribute('aria-label'),
      papel: m.getAttribute('role'),
      principal: { acao: principal.dataset.acao, rotulo: principal.getAttribute('aria-label'), icone: principal.querySelector('svg')?.dataset?.icone ?? null },
      mais: cartao.querySelector('[data-mais]').getAttribute('aria-label'),
      itens: [...cartao.querySelectorAll('fluent-menu-item')].map((i) => ({ item: i.dataset.item, texto: i.textContent.trim(), desabilitado: i.hasAttribute('disabled') })),
      menuAberto: cartao.querySelector('fluent-menu-list')?.matches(':popover-open') ?? false,
      rodape: rodape.hasAttribute('data-vazio') ? null : rodape.textContent,
      cores: {
        traco: cor(m.querySelector('[data-traco]:not([data-aceso])'), 'stroke'),
        aceso: cor(aceso[0], 'stroke'),
        disco: cor(m.querySelector('.tt-mostrador-disco'), 'fill'),
        numero: cor(m.querySelector('[data-minutos]'), 'color'),
        unidade: cor(m.querySelector('.tt-mostrador-unidade'), 'color'),
        esperado: { traco: window.__ttCor('--tt-dial-tick', 'color'), aceso: window.__ttCor('--tt-accent', 'color'), unidade: window.__ttCor('--tt-fg-2', 'color') },
      },
      fonte: { tamanho: getComputedStyle(m.querySelector('.tt-mostrador-centro')).fontSize, peso: getComputedStyle(m.querySelector('.tt-mostrador-centro')).fontWeight },
      caixas: { cartao: [c.x, c.y, c.width, c.height], mostrador: cx(m), botoes: cx(cartao.querySelector('.tt-andamento-botoes')) },
      pedidos: { inicios: window.__TOMATITO_PREVIEW_INICIOS__ ?? null, comandos: window.__TOMATITO_PREVIEW_COMANDOS__ ?? null },
    };
  };
  window.__ttSerieDoMostrador = async (ms, passo = 250) => {
    const serie = [];
    const t0 = performance.now();
    while (performance.now() - t0 <= ms) {
      const m = window.__ttMostrador();
      serie.push({ t: Math.round(performance.now() - t0), minutos: m.minutos, aceso: m.aceso[0] ?? null });
      await new Promise((r) => setTimeout(r, passo));
    }
    return serie;
  };
  window.__ttMenuSessao = async (item) => {
    document.querySelector('[data-cartao="sessao"] [data-mais]').click();
    await doisQuadros();
    const aberto = document.querySelector('[data-cartao="sessao"] fluent-menu-list').matches(':popover-open');
    document.querySelector(`[data-cartao="sessao"] fluent-menu-item[data-item="${item}"]`).click();
    await new Promise((r) => setTimeout(r, 50));
    await doisQuadros();
    return { abriu: aberto, ...window.__ttMostrador() };
  };
  window.__ttSabotarMostrador = async () => {
    const folha = new CSSStyleSheet();
    folha.replaceSync('.tt-mostrador { margin-top: 6px !important; }');
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, folha];
    await doisQuadros();
    return document.adoptedStyleSheets.length;
  };

  // M19: pausado, intervalo e concluído. __ttEstadoDaSessao() devolve o que
  // muda entre os estados: o título, o rodapé, o botão de destaque, os
  // atributos do bloco (data-fase, data-pausado), as cores do número e do
  // traço aceso (com as esperadas) e o texto da região aria-live.
  // __ttOuvirAnuncios() liga um MutationObserver na região e anota cada texto
  // não vazio em __ttAnuncios (o que um leitor de tela receberia; no DevTools,
  // é o que se vê mudar no nó .tt-anuncio). __ttPercorrer(ms, passo) anota a
  // sequência de estados distintos por `ms` ms, ou até o cartão voltar ao
  // preparo depois de ter saído dele. __ttEspaco() manda um Espaço ao
  // documento, com o foco no título da tela (o WebKitGTK fora da tela não tem
  // teclado; no Chrome, o fases.mjs usa o --key Space).
  window.__ttEstadoDaSessao = () => {
    const cartao = document.querySelector('[data-cartao="sessao"]');
    const bloco = cartao.querySelector('.tt-andamento');
    const m = cartao.querySelector('[data-mostrador]');
    const aceso = m.querySelector('[data-traco][data-aceso]');
    const principal = cartao.querySelector('.tt-andamento-botoes > button');
    const rodape = cartao.querySelector('[data-rodape]');
    const regiao = document.querySelector('[data-anuncio]');
    return {
      modo: cartao.dataset.modo,
      titulo: cartao.querySelector('h2').textContent,
      rodape: cartao.dataset.modo === 'andamento' && !rodape.hasAttribute('data-vazio') ? rodape.textContent : null,
      principal: cartao.dataset.modo === 'andamento' ? { acao: principal.dataset.acao, rotulo: principal.getAttribute('aria-label'), icone: principal.querySelector('svg')?.dataset?.icone ?? null } : null,
      fase: bloco.dataset.fase ?? null,
      pausado: bloco.hasAttribute('data-pausado'),
      cores: {
        numero: getComputedStyle(m.querySelector('[data-minutos]')).color,
        aceso: aceso ? getComputedStyle(aceso).stroke : null,
        esperado: { fg1: window.__ttCor('--tt-fg-1', 'color'), fg2: window.__ttCor('--tt-fg-2', 'color'), accent: window.__ttCor('--tt-accent', 'color') },
      },
      regiao: regiao && {
        texto: regiao.textContent,
        live: regiao.getAttribute('aria-live'),
        atomic: regiao.getAttribute('aria-atomic'),
        caixa: (({ width, height }) => [width, height])(regiao.getBoundingClientRect()),
        regioesLive: document.querySelectorAll('[aria-live]').length,
      },
      animacoes: document.getAnimations().length,
      foco: document.activeElement?.tagName ?? null,
    };
  };
  window.__ttOuvirAnuncios = () => {
    window.__ttAnuncios = [];
    const regiao = document.querySelector('[data-anuncio]');
    const t0 = performance.now();
    new MutationObserver(() => {
      if (regiao.textContent) window.__ttAnuncios.push({ t: Math.round(performance.now() - t0), texto: regiao.textContent });
    }).observe(regiao, { childList: true, characterData: true, subtree: true });
    return true;
  };
  window.__ttPercorrer = async (ms, passo = 100) => {
    const seq = [];
    const t0 = performance.now();
    let saiu = false;
    while (performance.now() - t0 < ms) {
      const e = window.__ttEstadoDaSessao();
      const chave = JSON.stringify([e.modo, e.titulo, e.rodape, e.fase, e.pausado, e.cores.aceso, e.cores.numero]);
      if (!seq.length || seq.at(-1).chave !== chave) seq.push({ t: Math.round(performance.now() - t0), chave, modo: e.modo, titulo: e.titulo, rodape: e.rodape, fase: e.fase, pausado: e.pausado, aceso: e.cores.aceso, numero: e.cores.numero, animacoes: e.animacoes });
      if (e.modo === 'andamento') saiu = true;
      if (saiu && e.modo === 'preparo') break;
      await new Promise((r) => setTimeout(r, passo));
    }
    await new Promise((r) => setTimeout(r, 300)); // o último anúncio sai 100 ms depois
    return { sequencia: seq.map(({ chave, ...r }) => r), anuncios: window.__ttAnuncios ?? null, fases: window.__TOMATITO_PREVIEW_FASES__ ?? null, esperado: window.__ttEstadoDaSessao().cores.esperado };
  };
  window.__ttEspaco = async () => {
    document.querySelector('h1[tabindex="-1"]').focus();
    const e = new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true });
    document.activeElement.dispatchEvent(e);
    await new Promise((r) => setTimeout(r, 50));
    await doisQuadros();
    return { cancelado: e.defaultPrevented, ...window.__ttEstadoDaSessao() };
  };
  window.__ttPintura = (seletor) => {
    const el = document.querySelector(seletor);
    if (!el) throw new Error(`elemento não encontrado: ${seletor}`);
    const s = getComputedStyle(el);
    return { fundo: s.backgroundColor, cor: s.color, hover: el.matches(':hover'), ativo: el.matches(':active') };
  };

  // M27: o cartão "Progresso diário". __ttProgresso() devolve o que se vê: os
  // números e as unidades das três colunas, o rodapé, o anel (papel, rótulo,
  // stroke-dashoffset calculado, transição, pontas e cores, com as esperadas)
  // e as caixas em px CSS do cartão. __ttSerieDoAnel(ms, passo) anota o
  // stroke-dashoffset calculado a cada `passo` ms (o arco andando).
  // __ttSabotarProgresso() desce o anel 6 px (o controle negativo das
  // posições).
  window.__ttProgresso = () => {
    const cartao = document.querySelector('[data-cartao="progresso"]');
    const corpo = cartao.querySelector('[data-progresso]');
    const anel = cartao.querySelector('[data-anel]');
    const arco = anel.querySelector('.tt-anel-arco');
    const trilho = anel.querySelector('.tt-anel-trilho');
    const c = cartao.getBoundingClientRect();
    const cx = (el) => {
      const b = el.getBoundingClientRect();
      return [b.x - c.x, b.y - c.y, b.width, b.height].map((v) => Math.round(v * 10) / 10);
    };
    const col = (sel) => {
      const el = cartao.querySelector(sel);
      return { numero: el.querySelector('[data-numero]').textContent, unidade: el.querySelector('[data-unidade]').textContent };
    };
    const s = getComputedStyle(arco);
    return {
      titulo: cartao.querySelector('h2').textContent,
      rotulos: [...cartao.querySelectorAll('dt, .tt-progresso-rotulo')].map((e) => e.textContent),
      alturasDosRotulos: [...cartao.querySelectorAll('dt, .tt-progresso-rotulo')].map((e) => Math.round(e.getBoundingClientRect().height)),
      ontem: col('[data-coluna="ontem"]'),
      semana: col('[data-coluna="semana"]'),
      meta: col('.tt-anel-centro'),
      rodape: cartao.querySelector('[data-concluido]').textContent,
      semMeta: corpo.hasAttribute('data-sem-meta'),
      carregando: corpo.hasAttribute('data-carregando'),
      anelVisivel: getComputedStyle(anel).display !== 'none',
      papel: anel.getAttribute('role'),
      rotulo: anel.getAttribute('aria-label'),
      arco: {
        deslocamento: Math.round(parseFloat(s.strokeDashoffset) * 1000) / 1000,
        tracejado: s.strokeDasharray,
        vazio: arco.hasAttribute('data-vazio'),
        visivel: s.visibility === 'visible',
        pontas: s.strokeLinecap,
        transicao: [s.transitionProperty, s.transitionDuration, s.transitionTimingFunction],
        girado: arco.getAttribute('transform'),
      },
      cores: {
        trilho: getComputedStyle(trilho).stroke,
        arco: s.stroke,
        esperado: { trilho: window.__ttCor('--tt-ring-track', 'color'), arco: window.__ttCor('--tt-ring-progress', 'color') },
      },
      larguras: [getComputedStyle(trilho).strokeWidth, s.strokeWidth],
      caixas: {
        cartao: [c.x, c.y, c.width, c.height],
        anel: cx(anel),
        ontem: cx(cartao.querySelector('[data-coluna="ontem"]')),
        semana: cx(cartao.querySelector('[data-coluna="semana"]')),
        rodape: cx(cartao.querySelector('[data-concluido]')),
      },
      transborda: cartao.scrollWidth > cartao.clientWidth + 0.5,
      pedidos: (window.__TOMATITO_PREVIEW_COMANDOS__ ?? []).filter((x) => x === 'stats_get').length,
    };
  };
  window.__ttSerieDoAnel = async (ms, passo = 100) => {
    const serie = [];
    const t0 = performance.now();
    while (performance.now() - t0 <= ms) {
      const p = window.__ttProgresso();
      serie.push({ t: Math.round(performance.now() - t0), d: p.arco.deslocamento, rodape: p.rodape });
      await new Promise((r) => setTimeout(r, passo));
    }
    return serie;
  };
  window.__ttSabotarProgresso = async () => {
    const folha = new CSSStyleSheet();
    folha.replaceSync('.tt-progresso-anel { margin-top: 12px !important; }');
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, folha];
    await doisQuadros();
    return document.adoptedStyleSheets.length;
  };

  // M28: o diálogo "Editar meta diária" (src/views/focus/goal-dialog.js).
  // __ttMeta() devolve o lápis (nome, dica, centro a partir do canto de cima,
  // à direita, do cartão, e se tem o foco), o diálogo (aberto, nome, papel,
  // largura, sombra, fundo de trás, título, rótulos, opções, valores
  // escolhidos, nomes das listas, botões, foco e aviso), o cartão
  // (__ttProgresso) e os settings_set pedidos. __ttMetaAbrir() clica no lápis
  // pelo click(); __ttMetaEscolher(meta, hora) escolhe nas listas;
  // __ttMetaBotao('salvar'|'cancelar') clica no botão; __ttMetaEsc() manda o
  // cancel do <dialog> (o Esc no WebKitGTK fora da tela, que não tem teclado;
  // no Chrome, o meta.mjs usa a tecla de verdade). __ttSabotarMeta() empilha
  // os botões (o controle negativo).
  window.__ttMeta = () => {
    const cartao = document.querySelector('[data-cartao="progresso"]');
    const lapis = cartao.querySelector('[data-editar-meta]');
    const c = cartao.getBoundingClientRect();
    const l = lapis.getBoundingClientRect();
    const host = document.querySelector('fluent-dialog[data-dialogo="meta"]');
    const dlg = host?.dialog ?? null;
    const aberto = Boolean(dlg?.open);
    const r1 = (v) => Math.round(v * 10) / 10;
    const ativo = document.activeElement;
    const nomeDe = (el) => {
      if (!el) return null;
      const ids = el.getAttribute('aria-labelledby');
      if (ids) return ids.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ');
      return el.getAttribute('aria-label') ?? el.textContent.trim();
    };
    const listas = host ? [...host.querySelectorAll('fluent-dropdown[data-campo]')] : [];
    const d = dlg?.getBoundingClientRect();
    const botoes = host ? [...host.querySelectorAll('[slot="action"]')] : [];
    const erro = host?.querySelector('[data-erro]');
    return {
      lapis: {
        rotulo: lapis.getAttribute('aria-label'),
        dica: lapis.hasAttribute('data-dica'),
        classe: lapis.className,
        icone: lapis.querySelector('svg')?.dataset?.icone ?? null,
        centro: [r1(c.right - (l.x + l.width / 2)), r1(l.y + l.height / 2 - c.y)],
        tamanho: [r1(l.width), r1(l.height)],
        focado: ativo === lapis,
      },
      aberto,
      dialogo: host && aberto ? {
        nome: dlg.getAttribute('aria-label'),
        papel: dlg.getAttribute('role'),
        modal: dlg.getAttribute('aria-modal'),
        caixa: [d.x, d.y, d.width, d.height].map(r1),
        janela: [innerWidth, innerHeight],
        sombra: getComputedStyle(dlg).boxShadow,
        raio: getComputedStyle(dlg).borderTopLeftRadius,
        fundo: getComputedStyle(host.querySelector('fluent-dialog-body')).backgroundColor,
        fundoDeTras: getComputedStyle(dlg, '::backdrop').backgroundColor,
        titulo: host.querySelector('[slot="title"]').textContent,
        tamanhoDoTitulo: getComputedStyle(host.querySelector('[slot="title"]')).fontSize,
        rotulos: [...host.querySelectorAll('.tt-campo-rotulo')].map((e) => e.textContent),
        opcoes: listas.map((dd) => [...dd.querySelectorAll('fluent-option')].map((o) => o.textContent)),
        valores: listas.map((dd) => dd.value),
        mostrados: listas.map((dd) => dd.control?.textContent?.trim() ?? null),
        listasAbertas: listas.map((dd) => Boolean(dd.open)),
        nomes: listas.map((dd) => nomeDe(dd.control)),
        listas: listas.map((dd) => r1(dd.getBoundingClientRect().width)),
        botoes: botoes.map((b) => {
          const r = b.getBoundingClientRect();
          return { texto: b.textContent.trim(), destaque: b.classList.contains('tt-accent'), icone: b.querySelector('svg')?.dataset?.icone ?? null, caixa: [r.x - d.x, r.y - d.y, r.width, r.height].map(r1) };
        }),
        foco: ativo?.getAttribute('role') === 'combobox' ? `lista ${nomeDe(ativo)}` : (ativo?.getAttribute('aria-label') ?? ativo?.localName ?? null),
        erro: erro && !erro.hidden ? { texto: erro.textContent, papel: erro.getAttribute('role'), icone: erro.querySelector('svg')?.dataset?.icone ?? null } : null,
      } : null,
      progresso: window.__ttProgresso(),
      gravacoes: (window.__TOMATITO_PREVIEW_COMANDOS__ ?? []).filter((x) => x.startsWith('settings_set')),
    };
  };
  window.__ttMetaAbrir = async () => {
    document.querySelector('[data-editar-meta]').click();
    await new Promise((r) => setTimeout(r, 400));
    await doisQuadros();
    return window.__ttMeta();
  };
  window.__ttMetaEscolher = async (meta, hora) => {
    document.querySelector('fluent-dropdown[data-campo="meta"]').value = String(meta);
    document.querySelector('fluent-dropdown[data-campo="hora"]').value = String(hora);
    await doisQuadros();
    return window.__ttMeta();
  };
  window.__ttMetaBotao = async (qual, espera = 500) => {
    document.querySelector(`fluent-dialog[data-dialogo="meta"] [data-${qual}]`).click();
    await new Promise((r) => setTimeout(r, espera));
    await doisQuadros();
    return window.__ttMeta();
  };
  window.__ttMetaEsc = async () => {
    document.querySelector('fluent-dialog[data-dialogo="meta"]').dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    await new Promise((r) => setTimeout(r, 400));
    await doisQuadros();
    return window.__ttMeta();
  };
  window.__ttSabotarMeta = async () => {
    const folha = new CSSStyleSheet();
    folha.replaceSync('.tt-dialogo-meta [slot="action"] { flex: none !important; }');
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, folha];
    await doisQuadros();
    return document.adoptedStyleSheets.length;
  };

  // M30: o cartão "Tarefas" (src/views/focus/card-tasks.js). __ttTarefas()
  // devolve o cabeçalho (ícone, título, "+" e "…"), o subtítulo, o estado
  // vazio, o campo, o aviso e cada linha (título, marcada, escolhida, da
  // sessão, altura, raio, fundo e cor do texto), mais as cores dos tokens
  // resolvidas no cartão (para comparar), o que o foco do teclado tem, os
  // focus_start e os períodos da prévia. __ttTarefasAdicionar('A', 'B') abre
  // o campo pelo "+" e envia cada título como o Enter; __ttTarefasAcao(id,
  // 'concluir'|'escolher'|'apagar') clica no botão da linha;
  // __ttTarefasIniciar({ minimo, passos }) clica em "Iniciar sessão de foco"
  // (com o seletor no mínimo e mais alguns passos, se pedido);
  // __ttTarefasEsc() manda o Esc ao campo; __ttTarefasRolar() traz o cartão
  // para o meio da tela (as capturas do roteiro aninhado).
  const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
  window.__ttTarefas = () => {
    const cartao = document.querySelector('[data-cartao="tarefas"]');
    if (!cartao) return null;
    const r1 = (v) => Math.round(v * 10) / 10;
    const token = (nome) => {
      const el = document.createElement('span');
      el.style.color = `var(${nome})`;
      cartao.append(el);
      const c = getComputedStyle(el).color;
      el.remove();
      return c;
    };
    const visivel = (el) => Boolean(el) && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
    const h2 = cartao.querySelector('h2');
    const sub = cartao.querySelector('[data-sub]');
    const vazio = cartao.querySelector('[data-vazio]');
    const campo = cartao.querySelector('[data-campo]');
    const erro = cartao.querySelector('[data-erro]');
    const ativo = document.activeElement;
    return {
      cabecalho: {
        icone: h2.querySelector('svg')?.dataset?.icone ?? null,
        titulo: h2.textContent,
        botoes: [...cartao.querySelectorAll('.tt-tarefas-acoes button')].map((b) => ({ nome: b.getAttribute('aria-label'), icone: b.querySelector('svg')?.dataset?.icone ?? null })),
      },
      subtitulo: visivel(sub) ? sub.textContent : null,
      corDoSubtitulo: getComputedStyle(sub).color,
      vazio: visivel(vazio) ? [...vazio.querySelectorAll('p, button')].map((e) => e.textContent.trim()) : null,
      campo: visivel(campo) ? { valor: campo.value, focado: ativo === campo, nome: campo.getAttribute('aria-label') } : null,
      aviso: erro.hidden ? null : erro.textContent,
      linhas: [...cartao.querySelectorAll('[data-tarefa]')].map((li) => {
        const cs = getComputedStyle(li);
        const check = li.querySelector('[data-acao="concluir"]');
        const tit = li.querySelector('.tt-tarefa-titulo');
        return {
          id: Number(li.dataset.tarefa),
          titulo: tit.textContent,
          marcada: check.getAttribute('aria-checked') === 'true',
          nomeDoCheck: document.getElementById(check.getAttribute('aria-labelledby'))?.textContent ?? null,
          escolhida: li.hasAttribute('data-escolhida'),
          daSessao: li.hasAttribute('data-focada'),
          escolher: li.querySelector('[data-acao="escolher"]')?.getAttribute('aria-label') ?? li.querySelector('[data-acao="escolher"]')?.textContent ?? null,
          escolherVisto: li.querySelector('[data-acao="escolher"]')?.innerText?.trim() ?? null,
          escolherCortado: ((b) => Boolean(b) && b.scrollWidth > b.clientWidth + 0.5)(li.querySelector('[data-acao="escolher"]')),
          escolherVisivel: visivel(li.querySelector('[data-acao="escolher"]')),
          apagarVisivel: visivel(li.querySelector('[data-acao="apagar"]')),
          hover: li.matches(':hover'),
          focoDentro: li.matches(':focus-within'),
          forcado: li.hasAttribute('data-tt-forcado'),
          altura: r1(li.getBoundingClientRect().height),
          raio: cs.borderTopLeftRadius,
          fundo: cs.backgroundColor,
          corDoTitulo: getComputedStyle(tit).color,
          icone: check.querySelector('svg')?.dataset?.icone ?? null,
          preenchido: Boolean(check.querySelector('svg[data-preenchido]')),
        };
      }),
      tokens: { superficie: token('--tt-bg-surface'), fg1: token('--tt-fg-1'), fg2: token('--tt-fg-2') },
      foco: ativo && ativo !== document.body ? (ativo.getAttribute('aria-label') ?? ativo.dataset?.acao ?? ativo.textContent?.trim() ?? ativo.localName) : null,
      inicios: structuredClone(window.__TOMATITO_PREVIEW_INICIOS__ ?? []),
      periodos: structuredClone(window.__TOMATITO_PREVIEW_PERIODOS__ ?? []),
    };
  };
  window.__ttTarefasAdicionar = async (...titulos) => {
    const cartao = document.querySelector('[data-cartao="tarefas"]');
    const campo = cartao.querySelector('[data-campo]');
    if (campo.closest('[hidden]')) cartao.querySelector('[data-adicionar]').click();
    await doisQuadros();
    for (const t of titulos) {
      campo.value = t;
      campo.form.requestSubmit();
      await esperar(150);
    }
    await doisQuadros();
    return window.__ttTarefas();
  };
  window.__ttTarefasAcao = async (id, acao) => {
    document.querySelector(`[data-cartao="tarefas"] [data-tarefa="${id}"] [data-acao="${acao}"]`).click();
    await esperar(200);
    await doisQuadros();
    return window.__ttTarefas();
  };
  window.__ttTarefasIniciar = async ({ minimo = false, passos = 0 } = {}) => {
    // minimo: o seletor no mínimo (Home), 1 min no preparo do debug; passos:
    // depois, quantos ↑ (de 1 em 1 min no debug).
    const sel = document.querySelector('.tt-seletor-campo');
    const tecla = (key) => sel.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    if (minimo) tecla('Home');
    for (let i = 0; i < passos; i++) tecla('ArrowUp');
    document.querySelector('[data-iniciar]').click();
    await esperar(300);
    await doisQuadros();
    return window.__ttTarefas();
  };
  window.__ttTarefasRolar = async () => {
    document.querySelector('[data-cartao="tarefas"]').scrollIntoView({ block: 'center' });
    await doisQuadros();
    return window.__ttTarefas();
  };
  window.__ttTarefasSabotar = async () => {
    document.querySelectorAll('[data-esmaecida]').forEach((e) => e.removeAttribute('data-esmaecida'));
    await doisQuadros();
    return window.__ttTarefas();
  };
  // Correção da verificação do M30: as linhas têm de ficar com 41 px também
  // com o mouse em cima e com o foco do teclado. __ttTarefasFocar(id) põe o
  // foco no círculo da linha (o :focus-within que revela o "Escolher" e o
  // "x"), ou tira o foco com id = null; __ttTarefasSabotarAltura() repõe o CSS
  // de antes da correção (o "Escolher" quebrando em duas linhas), para o
  // controle negativo.
  window.__ttTarefasFocar = async (id) => {
    if (id === null) document.activeElement?.blur?.();
    else document.querySelector(`[data-cartao="tarefas"] [data-tarefa="${id}"] [data-acao="concluir"]`).focus();
    await doisQuadros();
    return window.__ttTarefas();
  };
  // __ttTarefasForcar(id): o "estado forçado" do inspetor, para o WebKitGTK
  // fora da tela (sem mouse e sem janela com foco, o :hover e o
  // :focus-within não acontecem lá): em cada regra das folhas, troca o
  // :hover e o :focus-within por :is(<o mesmo>, [data-tt-forcado]) (também
  // dentro de :not) e marca a linha; com id = null, desmarca. O roteiro
  // aninhado usa o ponteiro e o teclado de verdade.
  let forcadoPronto = false;
  const forcarRegras = (lista) => {
    for (const regra of [...lista]) {
      if (regra.selectorText && /:(hover|focus-within)\b/.test(regra.selectorText)) {
        regra.selectorText = regra.selectorText.replace(/:(hover|focus-within)\b/g, ':is(:$1, [data-tt-forcado])');
      }
      if (regra.cssRules) forcarRegras(regra.cssRules);
    }
  };
  window.__ttTarefasForcar = async (id) => {
    if (!forcadoPronto) {
      for (const folha of [...document.styleSheets]) {
        try {
          forcarRegras(folha.cssRules);
        } catch {
          // folha de outra origem
        }
      }
      forcadoPronto = true;
    }
    document.querySelectorAll('[data-tt-forcado]').forEach((e) => e.removeAttribute('data-tt-forcado'));
    if (id !== null) document.querySelector(`[data-cartao="tarefas"] [data-tarefa="${id}"]`).setAttribute('data-tt-forcado', '');
    await doisQuadros();
    return window.__ttTarefas();
  };
  window.__ttTarefasSabotarAltura = async () => {
    const st = document.createElement('style');
    st.id = 'tt-sabotagem-altura';
    st.textContent =
      '.tt-tarefa{ height:auto !important; min-height:41px; }' +
      '.tt-tarefa-titulo{ flex:1 1 50% !important; white-space:normal !important; }' +
      '.tt-tarefa-escolher{ display:inline-flex !important; max-width:50%; height:auto !important; min-height:32px; white-space:normal !important; line-height:normal !important; }';
    document.head.append(st);
    await doisQuadros();
    return window.__ttTarefas();
  };
  window.__ttTarefasRestaurarAltura = async () => {
    document.getElementById('tt-sabotagem-altura')?.remove();
    await doisQuadros();
    return window.__ttTarefas();
  };
  window.__ttTarefasEsc = async () => {
    const campo = document.querySelector('[data-cartao="tarefas"] [data-campo]');
    campo.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await doisQuadros();
    return window.__ttTarefas();
  };

  // M32: a tela Temporizador (src/views/timers.js). __ttTemporizadores()
  // devolve cada card como se vê (título, tempo, "Encerrado há", cor do tempo,
  // estado, botões, anel e caixa) e as cores dos tokens; __ttCliqueNoTemporizador
  // (id, 'principal' | 'redefinir') chama o click() do botão;
  // __ttEsperarTempo(id, texto, ms) espera o card mostrar o texto (a cada
  // quadro) e devolve a leitura daquele quadro, ou null no prazo.
  window.__ttTemporizadores = () => {
    const grade = document.querySelector('[data-temporizadores]');
    const g = grade.getBoundingClientRect();
    const conteudo = document.querySelector('.tt-rolagem').getBoundingClientRect();
    const cards = [...grade.querySelectorAll('[data-temporizador]')].map((el) => {
      const b = el.getBoundingClientRect();
      const tempo = el.querySelector('[data-tempo]');
      const enc = el.querySelector('[data-encerrado]');
      const anel = el.querySelector('[data-anel]');
      const a = anel.getBoundingClientRect();
      const [principal, redefinir] = el.querySelectorAll('.tt-temporizador-botoes button');
      const arco = anel.querySelector('.tt-anel-arco');
      const r1 = (v) => Math.round(v * 10) / 10;
      return {
        id: Number(el.dataset.temporizador),
        titulo: el.querySelector('h2').textContent,
        tempo: tempo.textContent,
        encerrado: !enc.hidden && getComputedStyle(enc).display !== 'none' ? enc.textContent : null,
        corDoTempo: getComputedStyle(tempo).color,
        fonte: `${getComputedStyle(tempo).fontWeight} ${getComputedStyle(tempo).fontSize}`,
        estado: el.dataset.estado,
        vencido: el.hasAttribute('data-vencido'),
        principal: { acao: principal.dataset.acao, rotulo: principal.getAttribute('aria-label'), largura: principal.offsetWidth },
        redefinir: { desabilitado: redefinir.disabled, cor: getComputedStyle(redefinir).color },
        anel: { rotulo: anel.getAttribute('aria-label'), papel: anel.getAttribute('role'), lado: r1(a.width), traco: arco.getAttribute('stroke-width'), vazio: arco.hasAttribute('data-vazio'), topo: r1(a.top - b.top) },
        caixa: [b.x, b.y, b.width, b.height].map(r1),
        // Dentro do anel (210 − 2 × 12), com 8 px de folga de cada lado.
        tempoCabe: tempo.getBoundingClientRect().width <= a.width - 24 - 16,
        larguraDoTempo: Math.round(tempo.getBoundingClientRect().width),
      };
    });
    return {
      cards,
      grade: { esquerda: Math.round(g.left - conteudo.left), direita: Math.round(conteudo.right - g.right) },
      // A faixa ocupada pelos cards dentro da área de conteúdo: centrada, as
      // duas sobras são iguais.
      faixa: cards.length
        ? {
            esquerda: Math.round(Math.min(...cards.map((c) => c.caixa[0])) - conteudo.left),
            direita: Math.round(conteudo.right - Math.max(...cards.map((c) => c.caixa[0] + c.caixa[2]))),
          }
        : null,
      cores: {
        fg1: window.__ttCor('--tt-fg-1', 'color'),
        fg2: window.__ttCor('--tt-fg-2', 'color'),
        vencido: window.__ttCor('--tt-timer-overdue', 'color'),
        desabilitado: window.__ttCor('--tt-fg-disabled', 'color'),
      },
      comandos: window.__TOMATITO_PREVIEW_COMANDOS__.filter((c) => c.startsWith('timer_')),
      fins: window.__TOMATITO_PREVIEW_FINS__,
    };
  };
  window.__ttCliqueNoTemporizador = async (id, qual = 'principal') => {
    const [principal, redefinir] = document.querySelectorAll(`[data-temporizador="${id}"] .tt-temporizador-botoes button`);
    (qual === 'principal' ? principal : redefinir).click();
    await new Promise((r) => setTimeout(r, 50));
    await doisQuadros();
    return window.__ttTemporizadores();
  };
  window.__ttEsperarTempo = (id, texto, ms = 20000) =>
    new Promise((resolve) => {
      const t0 = performance.now();
      const olhar = () => {
        const el = document.querySelector(`[data-temporizador="${id}"] [data-tempo]`);
        if (el?.textContent === texto) return resolve(window.__ttTemporizadores());
        if (performance.now() - t0 > ms) return resolve(null);
        requestAnimationFrame(olhar);
      };
      olhar();
    });
})();
