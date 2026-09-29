// Movimento (PLANO.md, M41 e 3.8). O CSS cuida do que é transição de estado
// (hover, pressionado, o diálogo e o chevron dos expansíveis); aqui fica a
// entrada de página, que só acontece quando a tela troca.
//
// Entrada de página: a tela nova sobe 24 px e aparece, em --tt-dur-page
// (300 ms) com --tt-ease-decel, como a EntranceNavigationTransition do
// WinUI. Com prefers-reduced-motion (o "Animações" desligado no GNOME, que o
// WebKitGTK repassa), só o fade, em --tt-dur-page, que a mídia já baixa para
// 83 ms (tokens.css), linear: tudo vira fades de 83 ms (3.8).
//
// Web Animations, e não uma classe com @keyframes: a animação só roda na
// troca de tela (a primeira tela, desenhada com a janela escondida, não
// anima) e não depende de a tela redesenhar o próprio conteúdo depois. Sem
// estilo em linha (a Web Animations não passa pela CSP).

export const SUBIDA_PX = 24;

/** Se o sistema pede menos movimento. */
export const movimentoReduzido = (mm = globalThis.matchMedia) =>
  Boolean(mm?.('(prefers-reduced-motion: reduce)')?.matches);

/** Um token de tempo ("300ms", "0.3s") em ms; 0 se não for um tempo. */
export function msDoToken(valor) {
  const v = String(valor ?? '').trim();
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return 0;
  return v.endsWith('ms') ? n : v.endsWith('s') ? n * 1000 : n;
}

/** Os quadros e o tempo da entrada de página, com ou sem movimento. */
export function entradaDePagina({ reduzido, duracao, curva }) {
  if (reduzido) return { quadros: [{ opacity: 0 }, { opacity: 1 }], opcoes: { duration: duracao, easing: 'linear' } };
  return {
    quadros: [
      { opacity: 0, transform: `translateY(${SUBIDA_PX}px)` },
      { opacity: 1, transform: 'none' },
    ],
    opcoes: { duration: duracao, easing: curva || 'ease-out' },
  };
}

const emCurso = new WeakMap();

/**
 * Anima a entrada da tela que acabou de ser montada em `raiz` (a .tt-rolagem).
 * Anima os filhos da raiz (a .tt-pagina), e não a raiz, que é a área que rola.
 * Enquanto a tela sobe, os 24 px de baixo passariam da área e criariam uma
 * barra de rolagem por 300 ms (a clássica do WebView2 ocupa espaço); se a tela
 * cabia sem rolar, a raiz fica com `data-entrando` (overflow: hidden no
 * shell.css) até o fim. Devolve as animações.
 */
export function entrarPagina(raiz, { reduzido = movimentoReduzido(), estilo } = {}) {
  const css = estilo ?? getComputedStyle(raiz.ownerDocument.documentElement);
  const { quadros, opcoes } = entradaDePagina({
    reduzido,
    duracao: msDoToken(css.getPropertyValue('--tt-dur-page')),
    curva: css.getPropertyValue('--tt-ease-decel').trim(),
  });
  for (const a of emCurso.get(raiz) ?? []) a.cancel();
  emCurso.delete(raiz);
  delete raiz.dataset.entrando;
  if (!opcoes.duration) return [];
  if (!reduzido && raiz.scrollHeight <= raiz.clientHeight) raiz.dataset.entrando = '';
  const animacoes = [...raiz.children].map((el) => el.animate(quadros, opcoes));
  emCurso.set(raiz, animacoes);
  Promise.allSettled(animacoes.map((a) => a.finished)).then(() => {
    if (emCurso.get(raiz) !== animacoes) return;
    emCurso.delete(raiz);
    delete raiz.dataset.entrando;
  });
  return animacoes;
}
