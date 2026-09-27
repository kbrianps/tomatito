// Sonda do teste aninhado: roda dentro da janela main (WebKitGTK real) e
// manda para o Vite (sonda.config.mjs) o console, os eventos de mouse e de
// teclado e, a cada mudança, o estado que o roteiro confere: tamanho da página
// (muda com o zoom), estado da barra de título e cores dos botões em hover.
// Só existe no servidor do teste; o app nunca a importa.
//
// M08: também manda o estado da página cada vez que a visibilidade muda (a
// main nasce escondida, e o show() a torna visível): atributos do <html> e
// fontes carregadas no momento em que a janela aparece. Com CONTROLE =
// "tema-errado" (definida pelo sonda.config.mjs a partir de TT_CONTROLE), a
// sonda estraga o boot de propósito: pinta o tema Claro e mostra a janela
// antes do main.js, e só volta ao Lite 600 ms depois. Serve de controle
// negativo do roteiro partida-a-frio: a captura precisa acusar os quadros.
const t0 = performance.now();
const janela = window.__TAURI_INTERNALS__?.metadata?.currentWindow?.label ?? '?';
const enviar = (tipo, dados) =>
  fetch('/__sonda', { method: 'POST', body: JSON.stringify({ ms: Math.round(performance.now() - t0), janela, tipo, dados }) }).catch(() => {});
const origLog = console.log.bind(console);
console.log = (...a) => { origLog(...a); enviar('log', a.map(String).join(' ')); };
const origErr = console.error.bind(console);
console.error = (...a) => { origErr(...a); enviar('erro', a.map(String).join(' ')); };
addEventListener('error', (e) => enviar('erro', String(e.message)));
addEventListener('unhandledrejection', (e) => enviar('erro', String(e.reason)));

const desc = (el) => {
  if (!el || !el.tagName) return String(el);
  const cls = el.getAttribute('class');
  return `${el.tagName.toLowerCase()}${cls ? '.' + cls.split(' ').join('.') : ''}${el.dataset?.acao ? '[' + el.dataset.acao + ']' : ''}`;
};
for (const tipo of ['mousedown', 'mouseup', 'click', 'dblclick']) {
  addEventListener(tipo, (e) => enviar(tipo, { x: e.clientX, y: e.clientY, detail: e.detail, alvo: desc(e.target) }), true);
}
addEventListener('keydown', (e) => enviar('keydown', { key: e.key, ctrl: e.ctrlKey, shift: e.shiftKey }), true);

function estado() {
  const h = document.documentElement;
  const meio = document.querySelector('.tt-caption-btn[data-acao="maximizar"]');
  const pairado = document.querySelector('.tt-caption-btn:hover');
  const borda = document.querySelector('.tt-janela') ? getComputedStyle(document.querySelector('.tt-janela'), '::after') : null;
  return {
    inner: [innerWidth, innerHeight],
    dpr: devicePixelRatio,
    tema: h.dataset.theme,
    plataforma: h.dataset.platform ?? null,
    maximizada: h.hasAttribute('data-maximized'),
    meio: meio ? { rotulo: meio.getAttribute('aria-label'), title: meio.title, glifo: meio.querySelector('svg')?.children.length } : null,
    botoes: [...document.querySelectorAll('.tt-caption-btn')].map((b) => ({
      acao: b.dataset.acao,
      rotulo: b.getAttribute('aria-label'),
      tabindex: b.getAttribute('tabindex'),
      caixa: [...Object.values(b.getBoundingClientRect().toJSON())].slice(0, 4).map(Math.round),
    })),
    pairado: pairado ? { acao: pairado.dataset.acao, fundo: getComputedStyle(pairado).backgroundColor, cor: getComputedStyle(pairado).color } : null,
    borda: borda ? { display: borda.display, cor: borda.borderTopColor, largura: borda.borderTopWidth } : null,
    foco: desc(document.activeElement),
    rolagem: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
  };
}
let ultimo = '';
function vigiar() {
  const e = JSON.stringify(estado());
  if (e !== ultimo) {
    ultimo = e;
    enviar('estado', JSON.parse(e));
  }
}
addEventListener('load', () => {
  enviar('info', { ua: navigator.userAgent, label: janela, platform: window.__TT_PLATFORM__, pref: window.__TT_PREF__ });
  setInterval(vigiar, 100);
});

const pagina = () => ({
  visibilidade: document.visibilityState,
  dataset: { ...document.documentElement.dataset },
  fontes: document.fonts.status,
  interCarregada: document.fonts.check('14px "Inter Variable"'),
  definidos: ['fluent-switch', 'fluent-radio', 'fluent-radio-group'].filter((t) => customElements.get(t)),
});
enviar('pagina', { quando: 'sonda', ...pagina() });
document.addEventListener('visibilitychange', () => enviar('pagina', { quando: 'visibilitychange', ...pagina() }));

if (CONTROLE === 'tema-errado') {
  document.documentElement.dataset.theme = 'light';
  window.__TAURI_INTERNALS__.invoke('plugin:window|show', { label: janela });
  setTimeout(() => (document.documentElement.dataset.theme = 'lite'), 600);
}
