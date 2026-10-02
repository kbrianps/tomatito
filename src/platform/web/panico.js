// O pânico do motor em wasm (PLANO-WEB, 3.3, "Pânico"), sem o motor: a
// decisão entre recarregar e mostrar o aviso, e o aviso. Puro o bastante para
// o `node --test` (nada de pkg/, motor.js nem index.js, regra 4).
//
// - O `set_hook` do lado Rust já mostrou a mensagem no console.
// - O motor.js pega o `RuntimeError: unreachable`, para de gravar e recarrega
//   a página, deixando a marca `tomatito:panico` (o instante) no
//   sessionStorage.
// - Se o pânico se repetir até 10 s depois dessa recarga, não recarrega de
//   novo (seria um laço): mostra o aviso com o botão Recarregar.

/** A chave da marca no sessionStorage. */
export const MARCA = 'tomatito:panico';

/** Quanto tempo depois de uma recarga por pânico um novo pânico é "repetido". */
export const JANELA_MS = 10_000;

export const TEXTOS = Object.freeze({
  mensagem: 'O Tomatito encontrou um erro. Recarregue a página.',
  recarregar: 'Recarregar',
});

/**
 * `'recarregar'` ou `'mostrar'`, pela marca da última recarga por pânico
 * (o texto guardado no sessionStorage, ou null) e o instante `agora`, em ms.
 */
export function decidir(marca, agora) {
  if (marca === null || marca === undefined || marca === '') return 'recarregar';
  const quando = Number(marca);
  if (!Number.isFinite(quando)) return 'recarregar';
  const desde = agora - quando;
  return desde >= 0 && desde <= JANELA_MS ? 'mostrar' : 'recarregar';
}

/**
 * O aviso por cima da página: o texto e o botão Recarregar, com o foco no
 * botão. Devolve o elemento. `recarregar` é chamado no clique.
 */
export function mostrarAviso(doc, recarregar) {
  const existente = doc.querySelector('[data-panico]');
  if (existente) return existente;
  const fundo = doc.createElement('div');
  fundo.dataset.panico = '';
  fundo.setAttribute('role', 'alertdialog');
  fundo.setAttribute('aria-modal', 'true');
  fundo.setAttribute('aria-labelledby', 'tt-panico-texto');
  fundo.style.cssText =
    'position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:16px;' +
    'background:var(--tt-bg-app, #f3f3f3);color:var(--tt-fg-1, #1a1a1a);font-family:var(--tt-font-text, system-ui, sans-serif);';
  const caixa = doc.createElement('div');
  caixa.style.cssText =
    'max-width:360px;display:grid;gap:16px;justify-items:start;padding:24px;border-radius:8px;' +
    'background:var(--tt-bg-card, #fff);border:1px solid var(--tt-border, #e5e5e5);';
  const texto = doc.createElement('p');
  texto.id = 'tt-panico-texto';
  texto.style.margin = '0';
  texto.textContent = TEXTOS.mensagem;
  const botao = doc.createElement('button');
  botao.type = 'button';
  botao.className = 'tt-accent';
  botao.textContent = TEXTOS.recarregar;
  botao.addEventListener('click', () => recarregar());
  caixa.append(texto, botao);
  fundo.append(caixa);
  doc.body.append(fundo);
  botao.focus();
  return fundo;
}
