// Perfis de celular e gestos de toque para o verificar.mjs (PLANO-WEB-V1,
// seção 6; marco W01b). Nasce da sonda de 29/09/2026
// (~/dev/tomatito-ref/web/sonda-celular/), conferida no Chrome 153 headless:
// com o perfil `m`, `(pointer: coarse)` e `(hover: none)` verdadeiros,
// `innerWidth` 390, `navigator.maxTouchPoints` 5 e `userAgentData.mobile`;
// `setSafeAreaInsetsOverride` alimenta o `env(safe-area-inset-*)`;
// `Input.dispatchTouchEvent` gera `pointerdown` (touch), `touchstart` e
// `click`; `setVirtualKeyboardGeometryOverride` alimenta o
// `env(keyboard-inset-height)`. O caso `sonda-celular` refaz essa sonda com as
// funções daqui.
//
// Todas as funções recebem a `pagina` do verificar.mjs: `cmd(method, params)`
// já presa à sessão da aba, e `avaliar(expressão)`.
//
// O que a emulação NÃO reproduz: o congelamento real do Android com a tela
// apagada, a barra de endereço que some ao rolar, o Safari (seção 6 e 7).

/** O Chrome do Android que os perfis fingem ser. */
export const UA_ANDROID =
  'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Mobile Safari/537.36';

const METADADOS_ANDROID = {
  brands: [
    { brand: 'Chromium', version: '153' },
    { brand: 'Google Chrome', version: '153' },
    { brand: 'Not.A/Brand', version: '99' },
  ],
  platform: 'Android',
  platformVersion: '15',
  architecture: '',
  model: 'Pixel 8',
  mobile: true,
};

/**
 * A tabela da seção 6. `seguro` são as safe areas (topo, baixo, esquerda,
 * direita), em px CSS. `forma` é o que o `data-forma` deve valer nesse perfil
 * quando a casca web ligar o layout de celular (5.1; o W30 confere).
 */
export const PERFIS = Object.freeze({
  p: { largura: 360, altura: 740, dpr: 3, seguro: { top: 24, bottom: 0, left: 0, right: 0 }, forma: 'celular' },
  m: { largura: 390, altura: 844, dpr: 3, seguro: { top: 47, bottom: 34, left: 0, right: 0 }, forma: 'celular' },
  g: { largura: 412, altura: 915, dpr: 2.625, seguro: { top: 24, bottom: 0, left: 0, right: 0 }, forma: 'celular' },
  paisagem: { largura: 844, altura: 390, dpr: 3, seguro: { top: 0, bottom: 21, left: 47, right: 0 }, forma: 'celular' },
  minimo: { largura: 320, altura: 568, dpr: 2, seguro: { top: 20, bottom: 0, left: 0, right: 0 }, forma: 'celular' },
  // Tablet: sem data-forma (painel lateral), mas com alvos de 48 por `pointer: coarse`.
  tablet: { largura: 800, altura: 1280, dpr: 2, seguro: { top: 24, bottom: 0, left: 0, right: 0 }, forma: undefined },
});

function perfil(nome) {
  const p = PERFIS[nome];
  if (!p) throw new Error(`perfil de celular desconhecido: ${nome} (use ${Object.keys(PERFIS).join(', ')})`);
  return p;
}

function orientacao(p) {
  return p.largura > p.altura ? { type: 'landscapePrimary', angle: 90 } : { type: 'portraitPrimary', angle: 0 };
}

function metricas(p, altura = p.altura) {
  return {
    width: p.largura,
    height: altura,
    deviceScaleFactor: p.dpr,
    mobile: true,
    screenWidth: p.largura,
    screenHeight: p.altura,
    screenOrientation: orientacao(p),
  };
}

/**
 * Liga o perfil na aba: métricas com `mobile: true`, toque com 5 pontos, UA do
 * Chrome Android (com `userAgentData.mobile`) e safe areas. Chamar antes de
 * navegar: o UA e o `pointer` valem para o documento seguinte.
 */
export async function aplicarPerfil(pagina, nome) {
  const p = perfil(nome);
  await pagina.cmd('Emulation.setDeviceMetricsOverride', metricas(p));
  await pagina.cmd('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await pagina.cmd('Emulation.setUserAgentOverride', { userAgent: UA_ANDROID, userAgentMetadata: METADADOS_ANDROID });
  await pagina.cmd('Emulation.setSafeAreaInsetsOverride', { insets: p.seguro });
  pagina.perfil = nome;
  return p;
}

async function centro(pagina, seletor) {
  const sel = JSON.stringify(seletor);
  return pagina.avaliar(`(() => {
    const el = document.querySelector(${sel});
    if (!el) throw new Error('elemento não encontrado: ' + ${sel});
    el.scrollIntoView({ block: 'center', inline: 'center' });
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, largura: r.width, altura: r.height };
  })()`);
}

const quadros = (pagina) =>
  pagina.avaliar('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))');

/** Toque curto (touchStart e touchEnd) no centro do elemento. */
export async function tocar(pagina, seletor) {
  const { x, y } = await centro(pagina, seletor);
  await pagina.cmd('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  await pagina.cmd('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await quadros(pagina);
  return { x, y };
}

/**
 * Arrasta o dedo `dx` px na horizontal a partir do centro (o deslizante do
 * volume). O primeiro movimento, dentro da folga de toque do Chrome (uns
 * 15 px), não gera `touchmove`. Num elemento sem `touch-action: none`, o
 * Chrome trata o arraste como rolagem e passa a mandar os `touchmove` de forma
 * assíncrona e espaçada, e o último se perde (visto na sonda-celular); um
 * deslizante de verdade tem `touch-action: none`.
 */
export async function arrastar(pagina, seletor, dx, passos = 8) {
  const { x, y } = await centro(pagina, seletor);
  await pagina.cmd('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  for (let i = 1; i <= passos; i++) {
    await pagina.cmd('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: x + (dx * i) / passos, y, id: 1 }],
    });
    // Um quadro entre os movimentos, como um dedo de verdade.
    await quadros(pagina);
  }
  await pagina.cmd('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await quadros(pagina);
  return { x, y, ate: x + dx };
}

/**
 * Teclado virtual de `altura` px CSS: `env(keyboard-inset-*)` pelo
 * `setVirtualKeyboardGeometryOverride`, e a viewport encolhida na mesma medida
 * (o `interactive-widget=resizes-content` do Chrome Android). `altura` 0
 * fecha o teclado e devolve a altura do perfil.
 */
export async function teclado(pagina, altura) {
  const p = perfil(pagina.perfil);
  if (altura > 0) {
    await pagina.cmd('Emulation.setVirtualKeyboardGeometryOverride', {
      keyboardRect: { x: 0, y: p.altura - altura, width: p.largura, height: altura },
    });
    await pagina.cmd('Emulation.setDeviceMetricsOverride', metricas(p, p.altura - altura));
  } else {
    await pagina.cmd('Emulation.setVirtualKeyboardGeometryOverride', {});
    await pagina.cmd('Emulation.setDeviceMetricsOverride', metricas(p));
  }
  await quadros(pagina);
}

/** O que conta como alvo de toque (seção 6). */
export const SELETOR_DE_ALVOS = [
  'button', 'a[href]', 'input:not([type=hidden])', 'select', 'textarea',
  '[role=button]', '[role=switch]', '[role=checkbox]', '[role=radio]', '[role=option]', '[role=menuitem]',
  '[role=menuitemradio]', '[role=menuitemcheckbox]', '[role=slider]', '[role=tab]', '[role=link]',
  'fluent-button', 'fluent-toggle-button', 'fluent-switch', 'fluent-checkbox', 'fluent-radio', 'fluent-slider',
  'fluent-dropdown', 'fluent-option', 'fluent-menu-item', 'fluent-text-input', 'fluent-tab', 'fluent-link',
  'fluent-accordion-item', 'fluent-spinbutton',
].join(', ');

/**
 * Mede a área de toque de todo alvo visível: o maior entre o próprio retângulo
 * e o do `::after` (os botões de 32 px ganham a área por um `::after`
 * transparente, 5.3). Devolve `{ medidos, pequenos, excecoes }`, com os
 * alvos abaixo de `minimo` × `minimo` em `pequenos`. `excecoes` é uma lista
 * de `{ seletor, motivo }`: o alvo que casa com o seletor não é cobrado, e o
 * motivo vai junto no resultado (ex.: link dentro de um parágrafo, que a WCAG
 * 2.5.8 aceita).
 */
export async function alvos(pagina, { excecoes = [], minimo = 48 } = {}) {
  return pagina.avaliar(`(() => {
    const excecoes = ${JSON.stringify(excecoes)};
    const minimo = ${Number(minimo)};
    const px = (v) => Number.parseFloat(v) || 0;
    const visivel = (el) => {
      const r = el.getBoundingClientRect();
      const c = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && c.visibility !== 'hidden' && c.display !== 'none' && !el.closest('[inert],[hidden]');
    };
    const descrever = (el) => {
      const nome = el.getAttribute('aria-label') || el.textContent.trim().replace(/\\s+/g, ' ').slice(0, 40);
      const classe = typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\\s+/).join('.') : '';
      return el.localName + (el.id ? '#' + el.id : '') + classe + (nome ? ' "' + nome + '"' : '');
    };
    const medidos = [];
    const pequenos = [];
    const pulados = [];
    for (const el of document.querySelectorAll(${JSON.stringify(SELETOR_DE_ALVOS)})) {
      if (!visivel(el)) continue;
      const r = el.getBoundingClientRect();
      let largura = r.width;
      let altura = r.height;
      const a = getComputedStyle(el, '::after');
      if (a.content !== 'none' && a.content !== 'normal' && a.display !== 'none') {
        const caixa = a.boxSizing === 'border-box' ? 0 : 1;
        const extraL = caixa * (px(a.paddingLeft) + px(a.paddingRight) + px(a.borderLeftWidth) + px(a.borderRightWidth));
        const extraA = caixa * (px(a.paddingTop) + px(a.paddingBottom) + px(a.borderTopWidth) + px(a.borderBottomWidth));
        largura = Math.max(largura, px(a.width) + extraL);
        altura = Math.max(altura, px(a.height) + extraA);
      }
      const item = { alvo: descrever(el), largura: Math.round(largura * 10) / 10, altura: Math.round(altura * 10) / 10 };
      const exc = excecoes.find((e) => el.matches(e.seletor));
      if (exc) {
        pulados.push({ ...item, motivo: exc.motivo });
        continue;
      }
      medidos.push(item);
      if (largura < minimo - 0.5 || altura < minimo - 0.5) pequenos.push(item);
    }
    return { medidos: medidos.length, pequenos, excecoes: pulados };
  })()`);
}
