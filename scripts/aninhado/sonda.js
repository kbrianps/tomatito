// Sonda do teste aninhado: roda dentro da janela tomato (WebKitGTK real) e
// manda para o Vite (sonda.config.mjs) o console, os eventos de mouse e dados
// do ambiente. Só existe no servidor do teste; o app nunca a importa.
const t0 = performance.now();
const enviar = (tipo, dados) =>
  fetch('/__sonda', { method: 'POST', body: JSON.stringify({ ms: Math.round(performance.now() - t0), tipo, dados }) }).catch(() => {});
const origLog = console.log.bind(console);
console.log = (...a) => { origLog(...a); enviar('log', a.map(String).join(' ')); };
addEventListener('error', (e) => enviar('erro', String(e.message)));
addEventListener('unhandledrejection', (e) => enviar('erro', String(e.reason)));
const desc = (el) => {
  if (!el || !el.tagName) return String(el);
  const cls = el.getAttribute('class');
  const pai = el.parentElement;
  return `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${cls ? '.' + cls.split(' ').join('.') : ''}${el.dataset?.acao ? '[' + el.dataset.acao + ']' : ''} < ${pai ? pai.tagName.toLowerCase() + (pai.getAttribute('class') ? '.' + pai.getAttribute('class').split(' ')[0] : '') : '-'}`;
};
for (const tipo of ['mousedown', 'mouseup', 'click']) {
  addEventListener(tipo, (e) => enviar(tipo, { x: e.clientX, y: e.clientY, botao: e.button, detail: e.detail, alvo: desc(e.target) }), true);
}
function webgl() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return null;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      vendor: gl.getParameter(ext ? ext.UNMASKED_VENDOR_WEBGL : gl.VENDOR),
      renderer: gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER),
      versao: gl.getParameter(gl.VERSION),
    };
  } catch (err) {
    return String(err);
  }
}
addEventListener('load', () =>
  requestAnimationFrame(() =>
    requestAnimationFrame(() =>
      enviar('info', {
        ua: navigator.userAgent,
        webgl: webgl(),
        label: window.__TAURI_INTERNALS__?.metadata?.currentWindow?.label,
        inner: [innerWidth, innerHeight],
        dpr: devicePixelRatio,
        bgHtml: getComputedStyle(document.documentElement).backgroundColor,
        bgBody: getComputedStyle(document.body).backgroundColor,
        stage: document.getElementById('stage')?.getBoundingClientRect().toJSON(),
        dragAttr: document.getElementById('stage')?.dataset.tauriDragRegion,
        rolagem: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
      }),
    ),
  ),
);
