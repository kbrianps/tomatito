// Troca de tema (PLANO.md, 4.6; M24). Os atributos do <html>:
//   - data-theme-pref: a escolha salva (lite, suave, light, dark, system ou full);
//   - data-theme: o tema resolvido, o único que o CSS lê.
// O Rust é o dono das configurações (settings.rs): `aplicarTema` grava pelo
// `settings_set`, e a main reflete cada gravação pelo `tt://settings`
// (`ligarTema`), inclusive as que não saíram desta janela.
//
// O Full (a janela-tomate) só aparece em Configurações no M51, e o
// `switch_window_mode` só existe a partir do M50: até lá, `aplicarTema('full')`
// recusa, e sair de um `theme = full` gravado à mão é só uma gravação comum
// (docs/decisoes.md, M24).
//
// O modo Sistema segue a guarda (c) da 4.6: `setTheme(null)`, depois
// `theme()`, depois, no Linux, `setTheme(t)`. As guardas (a) e (b) e o
// `onThemeChanged` são do M25.

/** O tema nativo (menus e diálogos do sistema) de cada tema resolvido, pelo color-scheme. */
export const NATIVO = Object.freeze({ lite: 'dark', suave: 'light', light: 'light', dark: 'dark' });

/** As escolhas da interface, na ordem de Configurações > Aparência. O Full entra no M51. */
export const ESCOLHAS = Object.freeze(['lite', 'suave', 'light', 'dark', 'system']);

/** Evento do documento a cada troca de tema (daqui ou do `tt://settings`): `detail` = `{ pref, tema }`. */
export const EVENTO = 'tt-tema';

/**
 * Grava os dois atributos no <html> sem transições (a classe da 4.6, que sai
 * dois quadros depois) e avisa as telas pelo evento `tt-tema`.
 */
export function trocarAtributos(h, pref, tema, { quadro = globalThis.requestAnimationFrame } = {}) {
  const mudou = h.dataset.themePref !== pref || h.dataset.theme !== tema;
  if (mudou) {
    h.classList.add('tt-no-transition');
    h.dataset.themePref = pref;
    h.dataset.theme = tema;
    quadro?.(() => quadro(() => h.classList.remove('tt-no-transition')));
  }
  h.dispatchEvent?.(new CustomEvent(EVENTO, { bubbles: false, detail: { pref, tema } }));
  return mudou;
}

/**
 * O tema do sistema pela guarda (c): limpa a escolha explícita, lê o tema da
 * janela (ou o prefers-color-scheme, se a janela não souber) e, no Linux,
 * fixa o lido, porque o `setTheme(null)` do tao grava `prefer-dark = false`.
 */
export async function temaDoSistema(win, { plataforma, escuroPelaMidia = () => false } = {}) {
  await win.setTheme(null);
  const t = (await win.theme()) ?? (escuroPelaMidia() ? 'dark' : 'light');
  if (plataforma === 'linux') await win.setTheme(t);
  return t;
}

/**
 * `applyTheme` da 4.6. `deps`:
 *   - `win`: a janela atual (`getCurrentWindow()`), com `label`, `setTheme` e `theme`;
 *   - `gravar(patch)`: o `settings_set` (lib/ipc.js, `configuracoes.gravar`);
 *   - `h`: o <html>; `quadro`: o requestAnimationFrame;
 *   - `escuroPelaMidia()`: o `prefers-color-scheme: dark`, reserva do modo Sistema.
 * Resolve com as configurações que o Rust devolveu. Se a gravação falhar, os
 * atributos voltam ao que eram e o erro sobe (`{ code, message }`).
 */
export async function aplicarTema(pref, { win, gravar, h, quadro, escuroPelaMidia } = {}) {
  if (!ESCOLHAS.includes(pref)) throw new Error(`tema desconhecido ou ainda indisponível: ${pref}`);
  if (win.label === 'tomato') return null; // o tomate é sempre "full" (a janela só existe a partir do M50)
  const antes = { pref: h.dataset.themePref, tema: h.dataset.theme };
  let tema = pref;
  if (pref === 'system') tema = await temaDoSistema(win, { plataforma: h.dataset.platform, escuroPelaMidia });
  trocarAtributos(h, pref, tema, { quadro });
  let salvas;
  try {
    salvas = await gravar({ theme: pref, resolvedTheme: tema }); // o Rust atualiza o lastNormalTheme
  } catch (erro) {
    trocarAtributos(h, antes.pref, antes.tema, { quadro });
    throw erro;
  }
  if (pref !== 'system') await win.setTheme(NATIVO[tema]); // Lite → menus GTK escuros; Suave → claros
  return salvas;
}

/**
 * Reflete umas configurações (`settings_get` ou `tt://settings`) no <html>:
 * `data-theme-pref` = `theme` e `data-theme` = `resolvedTheme`, que é o tema
 * que a main mostra (no Full, o do `lastNormalTheme`).
 */
export function refletirConfiguracoes(s, { h, quadro, global = globalThis } = {}) {
  if (!s?.theme || !s?.resolvedTheme) return false;
  global.__TT_LAST__ = s.lastNormalTheme;
  return trocarAtributos(h, s.theme, s.resolvedTheme, { quadro });
}

/** Na main: ouve o `tt://settings` e regrava os atributos a cada gravação. Devolve o `unlisten`. */
export function ligarTema({ ipc, h, quadro } = {}) {
  return ipc.ouvir(ipc.EVENTOS.configuracoes, (s) => refletirConfiguracoes(s, { h, quadro }));
}
