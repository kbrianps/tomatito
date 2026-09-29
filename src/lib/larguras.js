// Larguras em px CSS para os tamanhos de fonte que acompanham a janela (M43).
//
// No WebKitGTK 2.52, com zoom (o Ctrl + do app, ou o "Texto grande" do GNOME,
// que o WebKitGTK aplica como zoom da página), as unidades de janela e de
// contêiner (vw, cqi) dentro de um `font-size` valem a medida SEM o zoom: a
// 160%, o `100cqi` da área de conteúdo de 251 px dá 402 px na fonte (e 251 px
// num `width`), e o número cresce o zoom duas vezes. Um `@property` registrado
// não escapa (o valor é calculado do mesmo jeito). O Chrome (WebView2) acerta
// os dois. Medido em docs/decisoes.md, M43.
//
// A saída: o JS mede a largura (que o motor dá certo, em px CSS) e a entrega
// ao CSS numa variável em px, que o `font-size` usa com o zoom certo:
//   - `--tt-vw` no <html>: 1% da largura da janela (o `1vw`);
//   - todo elemento com `data-largura="--tt-nome"` recebe `--tt-nome` com a
//     largura da própria caixa de conteúdo (o `100cqi` de quem está dentro,
//     se ele é o contêiner).
// O CSS guarda a unidade original como reserva (`var(--tt-vw, 1vw)`), para o
// primeiro quadro e para as prévias sem JS. Só variáveis vão para o estilo em
// linha (`style.setProperty`, que a CSP aceita, 3.8).

/** Largura da caixa de conteúdo de uma entrada do ResizeObserver, em px CSS. */
export function larguraDaEntrada(entrada) {
  const caixa = entrada.contentBoxSize;
  const c = Array.isArray(caixa) ? caixa[0] : caixa;
  if (c && Number.isFinite(c.inlineSize)) return c.inlineSize;
  return entrada.contentRect?.width ?? 0;
}

/** O valor da variável: px com até 3 casas, sem zeros à toa. */
export const px = (n) => `${Math.round(n * 1000) / 1000}px`;

/**
 * Liga as larguras. Mede na hora o que já existe (o primeiro quadro sai
 * certo, sem depender do ResizeObserver, que não roda com a janela
 * escondida), acompanha com um ResizeObserver e pega os elementos novos das
 * telas com um MutationObserver. Devolve `desligar()`.
 */
export function ligarLarguras({
  doc = globalThis.document,
  win = globalThis.window,
  RO = globalThis.ResizeObserver,
  MO = globalThis.MutationObserver,
} = {}) {
  const h = doc.documentElement;
  const vw = () => h.style.setProperty('--tt-vw', px(win.innerWidth / 100));
  const aplicar = (el, largura) => {
    const nome = el.dataset?.largura;
    if (nome && nome.startsWith('--')) el.style.setProperty(nome, px(largura));
  };
  const ro = new RO((entradas) => {
    for (const e of entradas) {
      if (e.target === h) vw();
      else if (!e.target.isConnected) ro.unobserve(e.target);
      else aplicar(e.target, larguraDaEntrada(e));
    }
  });
  const acompanhar = (el) => {
    // clientWidth: a caixa de conteúdo mais o padding, sem a borda; os
    // elementos marcados não têm padding.
    aplicar(el, el.clientWidth);
    ro.observe(el);
  };
  const buscar = (no) => {
    if (no.nodeType !== 1) return;
    if (no.matches('[data-largura]')) acompanhar(no);
    for (const el of no.querySelectorAll('[data-largura]')) acompanhar(el);
  };
  vw();
  ro.observe(h);
  buscar(doc.body);
  const mo = new MO((mudancas) => {
    for (const m of mudancas) for (const no of m.addedNodes) buscar(no);
  });
  mo.observe(doc.body, { childList: true, subtree: true });
  return {
    desligar() {
      mo.disconnect();
      ro.disconnect();
    },
  };
}
