// A "janela" na versão web: o subconjunto do getCurrentWindow() que o
// main.js, o title-bar.js e o lib/theme.js usam. No navegador não há tema
// nativo: `setTheme` fixa um valor e `theme()` o devolve (ou o
// prefers-color-scheme, sem valor fixo), como o tao no Linux e o mock da
// prévia; sem isso, a guarda (b) do ligarSistema entraria em laço.
const midia = () => matchMedia('(prefers-color-scheme: dark)');
let fixo = null;

export function janelaAtual() {
  return {
    label: location.pathname.includes('tomato') ? 'tomato' : 'main',
    show: async () => {},
    minimize: async () => {},
    toggleMaximize: async () => {},
    close: async () => {},
    isMaximized: async () => false,
    onResized: async (cb) => {
      const f = () => cb({ payload: { width: innerWidth, height: innerHeight } });
      addEventListener('resize', f);
      return () => removeEventListener('resize', f);
    },
    theme: async () => fixo ?? (midia().matches ? 'dark' : 'light'),
    setTheme: async (t) => {
      fixo = t ?? null;
    },
    // O caminho do "seguir o sistema" no navegador é o change do
    // prefers-color-scheme, que o ligarSistema já ouve.
    onThemeChanged: async () => () => {},
  };
}
