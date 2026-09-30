// Troca de tema (PLANO.md, 4.6; M24). Os atributos do <html>:
//   - data-theme-pref: a escolha salva (lite, suave, light, dark, system ou full);
//   - data-theme: o tema resolvido, o único que o CSS lê.
// O Rust é o dono das configurações (settings.rs): `aplicarTema` grava pelo
// `settings_set`, e a main reflete cada gravação pelo `tt://settings`
// (`ligarTema`), inclusive as que não saíram desta janela.
//
// O Full (a janela-tomate; M51): escolher o Full chama o `switch_window_mode`
// (o Rust grava `theme = full`, mostra a `tomato` e esconde a main); na main
// com o Full ativo, escolher outro tema sai do Full antes (o Rust volta ao
// `lastNormalTheme`, mostra a main e fecha a `tomato`) e depois aplica a
// escolha, como no `applyTheme` da 4.6.
//
// O modo Sistema segue a guarda (c) da 4.6: `setTheme(null)`, depois
// `theme()`, depois, no Linux, `setTheme(t)`. As guardas (a) e (b), com o
// `onThemeChanged`, estão em `ligarSistema` (M25).

/**
 * A07a (PLANO-ANDROID 5.7): no Android, o `theme()` da janela devolve sempre
 * `light` (o Tauri não lê o modo noturno) e o `setTheme` não faz nada; quem
 * acompanha o sistema é o `prefers-color-scheme` da WebView (targetSdk ≥ 33,
 * tema DayNight). O tema do sistema vem da mídia, como no Linux, e não há
 * tema nativo a reaplicar (guarda (b)).
 */
const android = (h) => h?.dataset?.platform === 'android';

/**
 * O tema do sistema agora, para o boot no modo Sistema: o `theme()` da
 * janela ou, no Android (e se a janela não souber), a mídia.
 */
export async function temaDoSistemaAgora(win, h, escuroPelaMidia = () => false) {
  if (android(h)) return escuroPelaMidia() ? 'dark' : 'light';
  return (await win.theme()) ?? (escuroPelaMidia() ? 'dark' : 'light');
}

/** O tema nativo (menus e diálogos do sistema) de cada tema resolvido, pelo color-scheme. */
export const NATIVO = Object.freeze({ lite: 'dark', suave: 'light', light: 'light', dark: 'dark' });

/**
 * As escolhas da interface, na ordem de Configurações > Aparência: os cinco
 * temas e, por último, a opção do sistema (1.1, item 3). O Full entrou no M51.
 */
export const ESCOLHAS = Object.freeze(['lite', 'suave', 'light', 'dark', 'full', 'system']);

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
  if (plataforma === 'android') return escuroPelaMidia() ? 'dark' : 'light'; // A07a
  await win.setTheme(null);
  const t = (await win.theme()) ?? (escuroPelaMidia() ? 'dark' : 'light');
  if (plataforma === 'linux') await win.setTheme(t);
  return t;
}

/**
 * Sai do Full pela main (4.6 e 5.7): pede o `switch_window_mode(false)` e
 * espera o `tt://settings` da saída chegar ao <html> (o evento `tt-tema` com
 * uma preferência que não é o Full), por no máximo `espera` ms. Sem essa
 * espera, o evento da saída (o `lastNormalTheme`) poderia chegar depois da
 * escolha nova e pintar a main de volta no tema anterior por um instante.
 */
export async function sairDoFull({ h, trocarModo, espera = 1000, relogio = globalThis } = {}) {
  const refletido = new Promise((resolve) => {
    if (!h.addEventListener) return resolve();
    const fim = () => {
      relogio.clearTimeout(limite);
      h.removeEventListener(EVENTO, aoTrocar);
      resolve();
    };
    const aoTrocar = (e) => e.detail?.pref !== 'full' && fim();
    const limite = relogio.setTimeout(fim, espera);
    h.addEventListener(EVENTO, aoTrocar);
  });
  await trocarModo(false);
  await refletido;
}

/**
 * `applyTheme` da 4.6. `deps`:
 *   - `win`: a janela atual (`getCurrentWindow()`), com `label`, `setTheme` e `theme`;
 *   - `gravar(patch)`: o `settings_set` (lib/ipc.js, `configuracoes.gravar`);
 *   - `trocarModo(full)`: o `switch_window_mode` (lib/ipc.js, `full.trocarModo`);
 *   - `h`: o <html>; `quadro`: o requestAnimationFrame;
 *   - `escuroPelaMidia()`: o `prefers-color-scheme: dark`, reserva do modo Sistema.
 * O Full (M51): na main, escolher o Full só chama `trocarModo(true)` (o Rust
 * grava o `theme` e troca as janelas); com o Full ativo, outra escolha sai
 * do Full antes (`sairDoFull`). No tomate, só o Full vale; outra escolha
 * chama `trocarModo(false)`.
 * Resolve com as configurações que o Rust devolveu (nada, nas trocas de
 * janela). Se a gravação falhar, os atributos voltam ao que eram e o erro
 * sobe (`{ code, message }`).
 */
export async function aplicarTema(pref, { win, gravar, trocarModo, h, quadro, escuroPelaMidia } = {}) {
  if (!ESCOLHAS.includes(pref)) throw new Error(`tema desconhecido: ${pref}`);
  const tomate = win.label === 'tomato';
  if (!tomate && h.dataset.themePref === 'full' && pref !== 'full') await sairDoFull({ h, trocarModo }); // sai do Full pelas Configurações (5.7)
  if ((pref === 'full') !== tomate) {
    await trocarModo(pref === 'full'); // entra no Full (5.7), ou o tomate sai dele
    return null;
  }
  if (tomate) return null; // o tomate é sempre "full"
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

/**
 * As cores das barras do sistema no Android (A07a; PLANO-ANDROID 4.2 e 5.7):
 * o `--tt-bg-app` do tema resolvido, em `#rrggbb`, e se o tema é claro (os
 * ícones das barras ficam escuros). `null` se o fundo não for uma cor opaca
 * em hexadecimal (o `transparent` do tomate).
 */
export function coresDasBarras(h, estilo = globalThis.getComputedStyle) {
  const bruto = estilo(h).getPropertyValue('--tt-bg-app').trim().toLowerCase();
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(bruto);
  if (!m) return null;
  const hex = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  return { fundo: `#${hex}`, claro: NATIVO[h.dataset.theme] === 'light' };
}

/**
 * No Android, a cada troca de tema (o evento `tt-tema`, que toda troca pela
 * interface, pelo `tt://settings` ou pelo modo Sistema dispara) e uma vez já
 * na chamada: manda ao plugin (`cores(fundo, claro)`) as cores do tema, só
 * quando mudam. É o que o `applyTheme` da 4.6 faz com o `setTheme` nativo no
 * desktop. Fora do Android, não faz nada: como a guarda do Linux acima, é um
 * ajuste nativo da plataforma, não uma escolha da tela (a casca do Android,
 * A05, pode passar a decidir). Devolve o `desligar`.
 */
export function ligarCoresDasBarras({ h, cores, estilo = globalThis.getComputedStyle, log = globalThis.console } = {}) {
  if (h.dataset.platform !== 'android') return () => {};
  let ultima = null;
  const enviar = () => {
    const c = coresDasBarras(h, estilo);
    if (!c) return;
    const chave = `${c.fundo}/${c.claro}`;
    if (chave === ultima) return;
    ultima = chave;
    Promise.resolve(cores(c.fundo, c.claro)).catch((erro) => {
      ultima = null; // a próxima troca tenta de novo
      log.error?.('[tema] cores das barras', erro);
    });
  };
  h.addEventListener(EVENTO, enviar);
  enviar();
  return () => h.removeEventListener(EVENTO, enviar);
}

/**
 * O tema de base que a main mostra: a escolha salva ou, no Full, o
 * `lastNormalTheme` (4.6). Pode ser `system`.
 */
export function temaDeBase(h, global = globalThis) {
  return h.dataset.themePref === 'full' ? global.__TT_LAST__ || 'lite' : h.dataset.themePref;
}

/**
 * Seguir o sistema (M25; guardas (a) e (b) da 4.6). Ouve dois sinais:
 *   - o `onThemeChanged` da janela, que é o caminho no Windows;
 *   - o `change` do `prefers-color-scheme` (`midia`), que é o caminho no Linux:
 *     o tao 0.37 aplica a mudança do portal (`SettingChanged` de
 *     `org.freedesktop.appearance color-scheme`) como `SetTheme(Some(x))` ao
 *     app inteiro, com a janela "falsa" (`WindowId::dummy()`), e o Tauri não
 *     entrega esse `ThemeChanged` a nenhuma janela. O que muda de fato é o
 *     `gtk-application-prefer-dark-theme`, e o WebKitGTK repassa isso ao
 *     `prefers-color-scheme` da página (docs/decisoes.md, M25).
 * Os sinais esperam `atraso` ms sem sinal novo antes de a conferência rodar,
 * porque a guarda (c) passa por um valor intermediário (o `setTheme(null)`
 * grava `prefer-dark = false` antes do `setTheme(t)`), e a conferência lê o
 * estado daquele momento, não o conteúdo do sinal:
 *   - (a) só no modo Sistema o `data-theme` muda; o tema novo vai para o
 *     `settings_set` (`resolvedTheme`), para a próxima partida nascer na cor
 *     certa; no Linux, o `setTheme(t)` acompanha, porque o tao não atualiza o
 *     tema fixado da janela quando o portal muda (o `theme()` ficaria velho);
 *   - (b) fora do modo Sistema, o tema nativo só é reaplicado se for diferente
 *     do esperado (`NATIVO`), e no máximo uma vez por valor dentro de
 *     `janelaDoLaco` ms: sem essa guarda, a troca entra em laço.
 * `deps`: `win`, `h`, `gravar` (o `settings_set`), `midia` (um
 * MediaQueryList), `quadro`, `log` (o console), `relogio` ({ setTimeout,
 * clearTimeout, agora }). Devolve `{ ouvindo, durante(promessa), conferir(), desligar() }`:
 * `durante` segura as conferências enquanto uma troca pela interface
 * (`aplicarTema`) está em curso, e até a mídia chegar ao tema pedido, e
 * confere de novo quando ela termina.
 */
export function ligarSistema({
  win,
  h,
  gravar,
  midia,
  quadro,
  log = globalThis.console,
  relogio = { setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: (id) => clearTimeout(id), agora: () => Date.now() },
  atraso = 150,
  janelaDoLaco = 2000,
  esperaDaMidia = 1000,
  global = globalThis,
} = {}) {
  let espera = null;
  let ocupado = 0;
  let rodando = null;
  let reaplicado = { valor: null, em: -Infinity };
  const linux = () => h.dataset.platform === 'linux';
  const daMidia = () => (midia?.matches ? 'dark' : 'light');

  // O tema nativo agora. No Linux, o do WebKit (que segue o prefer-dark do
  // GTK); o `theme()` do tao só devolve o que foi fixado por último.
  async function lerNativo() {
    if (linux() || android(h)) return daMidia();
    return (await win.theme()) ?? daMidia();
  }

  async function conferirAgora() {
    const base = temaDeBase(h, global);
    const atual = await lerNativo();
    if (base === 'system') {
      if (linux() && (await win.theme()) !== atual) await win.setTheme(atual);
      if (atual === h.dataset.theme) return 'igual';
      const antes = h.dataset.theme;
      trocarAtributos(h, h.dataset.themePref, atual, { quadro });
      log.log?.(`[tema] sistema: ${antes} → ${atual}`);
      try {
        await gravar({ resolvedTheme: atual });
      } catch (erro) {
        log.error?.('[tema] resolvedTheme não gravado', erro);
      }
      return 'trocou';
    }
    if (android(h)) return 'igual'; // sem tema nativo a reaplicar (A07a)
    const esperado = NATIVO[base] ?? NATIVO[h.dataset.theme];
    if (!esperado || atual === esperado) return 'igual';
    const t = relogio.agora();
    if (reaplicado.valor === esperado && t - reaplicado.em < janelaDoLaco) {
      log.error?.(`[tema] tema nativo ainda ${atual} depois de reaplicar ${esperado}; sem nova tentativa`);
      return 'laço';
    }
    reaplicado = { valor: esperado, em: t };
    log.log?.(`[tema] tema nativo ${atual} fora do Sistema; reaplicado ${esperado}`);
    await win.setTheme(esperado);
    return 'reaplicou';
  }

  function conferir() {
    if (ocupado) return Promise.resolve('ocupado');
    // Uma conferência de cada vez; a que chega no meio roda depois.
    rodando = (rodando ?? Promise.resolve()).then(conferirAgora, conferirAgora).catch((erro) => {
      log.error?.('[tema]', erro);
      return 'erro';
    });
    return rodando;
  }

  function midiaChegar() {
    const base = temaDeBase(h, global);
    const alvo = base === 'system' ? h.dataset.theme : NATIVO[base];
    if (!midia || !alvo || daMidia() === alvo) return Promise.resolve();
    return new Promise((resolve) => {
      const fim = () => {
        relogio.clearTimeout(limite);
        midia.removeEventListener?.('change', aoMudar);
        resolve();
      };
      const aoMudar = () => daMidia() === alvo && fim();
      const limite = relogio.setTimeout(fim, esperaDaMidia);
      midia.addEventListener?.('change', aoMudar);
    });
  }

  function agendar() {
    if (espera !== null) relogio.clearTimeout(espera);
    espera = relogio.setTimeout(() => {
      espera = null;
      conferir();
    }, atraso);
  }

  function sinal(fonte, valor) {
    log.log?.(`[tema] ThemeChanged ${valor} (${fonte})`);
    agendar();
  }

  const aoMudarMidia = (e) => sinal('prefers-color-scheme', e.matches ? 'dark' : 'light');
  midia?.addEventListener?.('change', aoMudarMidia);
  let desligarJanela = null;
  const ouvindo = Promise.resolve(win.onThemeChanged?.(({ payload }) => sinal('janela', payload)))
    .then((u) => (desligarJanela = u ?? null))
    .catch((erro) => log.error?.('[tema] onThemeChanged', erro));

  return {
    ouvindo,
    conferir,
    async durante(promessa) {
      ocupado++;
      try {
        return await promessa;
      } finally {
        // O WebKit recebe o prefer-dark do GTK por IPC: o claro intermediário
        // da guarda (c) pode chegar à página depois de a troca acabar. A
        // conferência só volta quando a mídia chega ao tema pedido (ou depois
        // de `esperaDaMidia` ms, se o sistema mudou no meio).
        await midiaChegar();
        ocupado--;
        if (!ocupado) agendar();
      }
    },
    desligar() {
      if (espera !== null) relogio.clearTimeout(espera);
      midia?.removeEventListener?.('change', aoMudarMidia);
      desligarJanela?.();
    },
  };
}
