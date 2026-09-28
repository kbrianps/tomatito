// Atalhos de teclado dentro do app (PLANO.md, 3.8). Atalhos globais, fora da
// janela, ficam para depois.
//
// M09: Ctrl+1, Ctrl+2 e Ctrl+3 abrem Foco, Temporizador e Cronômetro, e
// Ctrl+, abre as Configurações. Os atalhos valem com o foco em qualquer lugar
// da janela, inclusive num campo de texto (nenhum deles tem uso ali).
//
// Os dígitos são lidos pela posição da tecla (event.code), e não pelo
// caractere: no AZERTY, a tecla do 1 dá "&" sem Shift. O teclado numérico
// também vale. A vírgula é lida pelo caractere (no AZERTY ela fica em outra
// tecla) ou pela posição da tecla Comma do ABNT2 e do US.
//
// M12: o Esc numa lista suspensa aberta fecha só a lista, e não o diálogo em
// volta (ligarEscDasListas).

const ROTA_DO_DIGITO = Object.freeze({ 1: 'foco', 2: 'temporizador', 3: 'cronometro' });

/**
 * A rota que o atalho abre, ou null se o evento não é um atalho de navegação.
 * Só Ctrl, sem Alt, Shift nem Meta (Ctrl+Shift+1 não é o mesmo atalho).
 * @param {{ key: string, code: string, ctrlKey: boolean, altKey: boolean, shiftKey: boolean, metaKey: boolean }} e
 * @returns {string|null}
 */
export function rotaDoAtalho(e) {
  if (!e.ctrlKey || e.altKey || e.shiftKey || e.metaKey) return null;
  const digito = /^(?:Digit|Numpad)([1-3])$/.exec(e.code ?? '');
  if (digito) return ROTA_DO_DIGITO[digito[1]];
  if (e.key === ',' || e.code === 'Comma') return 'configuracoes';
  return null;
}

/**
 * Liga os atalhos de navegação no documento. `navegar(rota)` troca a tela.
 * Devolve uma função que desliga os atalhos.
 */
export function ligarAtalhosDeNavegacao(navegar, alvo = document) {
  const aoTeclar = (e) => {
    if (e.defaultPrevented) return;
    const rota = rotaDoAtalho(e);
    if (!rota) return;
    e.preventDefault();
    navegar(rota);
  };
  alvo.addEventListener('keydown', aoTeclar);
  return () => alvo.removeEventListener('keydown', aoTeclar);
}

/**
 * Esc numa lista suspensa aberta: a tecla é da lista (M12).
 *
 * O fluent-dropdown 3.1.3 fecha a lista no Esc, mas não cancela o evento; o
 * <dialog> do fluent-dialog em volta recebe o mesmo Esc e fecha junto, e a
 * edição se perde. No ComboBox do WinUI, o Esc fecha só a lista. Cancelar o
 * padrão do keydown impede o pedido de fechar do diálogo; a lista continua
 * fechando pelo próprio componente, que não olha o defaultPrevented no Esc
 * (docs/decisoes.md, M12).
 * @param {{ key: string, target?: { closest?: (s: string) => { open?: boolean } | null } }} e
 * @returns {boolean}
 */
export function escDeListaAberta(e) {
  return e.key === 'Escape' && Boolean(e.target?.closest?.('fluent-dropdown')?.open);
}

/**
 * Liga a regra do Esc nas listas suspensas, na fase de captura (antes do
 * componente e do diálogo). Devolve uma função que a desliga.
 */
export function ligarEscDasListas(alvo = document) {
  const aoTeclar = (e) => {
    if (escDeListaAberta(e)) e.preventDefault();
  };
  alvo.addEventListener('keydown', aoTeclar, true);
  return () => alvo.removeEventListener('keydown', aoTeclar, true);
}

/**
 * Controles em que o Espaço já tem dono (M19): botões, links, campos, o
 * seletor de minutos, as caixas de marcar, os menus e os diálogos. Um
 * elemento com tabindex ≥ 0 também é um controle; o título da tela, que
 * recebe o foco ao trocar de tela, tem tabindex="-1" e não conta.
 */
const DONOS_DO_ESPACO = [
  'button', 'a[href]', 'input', 'textarea', 'select', '[contenteditable]:not([contenteditable="false"])',
  '[role="button"]', '[role="spinbutton"]', '[role="checkbox"]', '[role="switch"]', '[role="radio"]',
  '[role="menuitem"]', '[role="option"]', '[role="link"]', '[role="dialog"]', 'dialog',
  'fluent-checkbox', 'fluent-switch', 'fluent-radio', 'fluent-dropdown', 'fluent-menu', 'fluent-menu-item',
  'fluent-option', 'fluent-dialog', '[tabindex]:not([tabindex^="-"])',
].join(',');

/**
 * O Espaço da tela Foco (PLANO.md, 3.8, "Iniciar ou pausar"): a tecla sozinha,
 * sem repetição nem modificadores, ainda não tratada, com o foco fora de
 * botões e campos. `e.target` é o elemento com o foco (ou o <body>).
 * @param {{ key: string, code?: string, repeat?: boolean, ctrlKey?: boolean, altKey?: boolean, shiftKey?: boolean, metaKey?: boolean, defaultPrevented?: boolean, isComposing?: boolean, target?: { closest?: (s: string) => unknown } }} e
 * @returns {boolean}
 */
export function espacoLivre(e) {
  if (e.key !== ' ' && e.code !== 'Space') return false;
  return livre(e);
}

/** A tecla sozinha, sem repetição nem modificadores, fora de botões e campos. */
function livre(e) {
  if (e.repeat || e.defaultPrevented || e.isComposing) return false;
  if (e.ctrlKey || e.altKey || e.shiftKey || e.metaKey) return false;
  return !e.target?.closest?.(DONOS_DO_ESPACO);
}

/**
 * M34: uma letra da tela Cronômetro (o L de "marcar volta", 3.8), com as
 * mesmas regras do Espaço: sozinha, sem repetição nem modificadores, com o
 * foco fora de botões e campos. A letra é lida pelo caractere (`key`), sem
 * diferença de maiúscula (o Caps Lock ligado dá "L"): o L fica em lugares
 * diferentes nos layouts.
 * @param {{ key: string, repeat?: boolean, ctrlKey?: boolean, altKey?: boolean, shiftKey?: boolean, metaKey?: boolean, defaultPrevented?: boolean, isComposing?: boolean, target?: { closest?: (s: string) => unknown } }} e
 * @param {string} letra
 * @returns {boolean}
 */
export function teclaLivre(e, letra) {
  if (typeof e.key !== 'string' || e.key.toLowerCase() !== letra.toLowerCase()) return false;
  return livre(e);
}

/**
 * M37: os atalhos da janela (PLANO.md, 3.8), com as regras de "Fechar e
 * sair" (3.4). Ctrl+W fecha a janela (o `close()` passa pelo mesmo
 * CloseRequested do X e do Alt+F4: com "fechar para a bandeja" ligado, só
 * esconde); Ctrl+Q sai do app (`app_quit`). Só Ctrl, sem Alt, Shift nem Meta.
 *
 * A letra é lida pelo caractere, como nos navegadores: no AZERTY, o Ctrl+Q é
 * a tecla onde está o Q (a do A no QWERTY). Num teclado sem letras latinas
 * (cirílico, grego), vale a posição da tecla (KeyW, KeyQ).
 * @param {{ key: string, code?: string, repeat?: boolean, ctrlKey: boolean, altKey: boolean, shiftKey: boolean, metaKey: boolean }} e
 * @returns {'fechar'|'sair'|null}
 */
export function acaoDaJanela(e) {
  if (!e.ctrlKey || e.altKey || e.shiftKey || e.metaKey || e.repeat) return null;
  const k = typeof e.key === 'string' ? e.key.toLowerCase() : '';
  const letra = /^[a-z]$/.test(k) ? k : /^Key([A-Z])$/.exec(e.code ?? '')?.[1]?.toLowerCase();
  if (letra === 'w') return 'fechar';
  if (letra === 'q') return 'sair';
  return null;
}

/**
 * Liga o Ctrl+W e o Ctrl+Q no documento. `acoes` tem `fechar()` e `sair()`.
 * Devolve uma função que desliga os atalhos.
 */
export function ligarAtalhosDaJanela(acoes, alvo = document) {
  const aoTeclar = (e) => {
    if (e.defaultPrevented) return;
    const acao = acaoDaJanela(e);
    if (!acao) return;
    e.preventDefault();
    Promise.resolve()
      .then(() => acoes[acao]())
      .catch((erro) => console.error(`[${acao}]`, erro));
  };
  alvo.addEventListener('keydown', aoTeclar);
  return () => alvo.removeEventListener('keydown', aoTeclar);
}
