// O `state.json` da versão web (PLANO-WEB, W09): o texto JSON em
// `tomatito:estado` no localStorage, no mesmo formato do desktop
// (`tomatito_motor::state_file`). Quem monta e lê o formato é o wasm
// (`Motor.gravavel` e `Motor.restaurar`, com as regras do `StateStore` do
// desktop); aqui fica só o armazenamento.

/** O texto gravado, ou `null` (nada gravado ou localStorage bloqueado). */
export function ler() {
  try {
    return localStorage.getItem('tomatito:estado');
  } catch {
    return null;
  }
}

/**
 * Grava o texto. Uma falha (cota, localStorage bloqueado) vai para o console
 * e não interrompe o motor, como a falha de disco no desktop.
 */
export function gravar(texto) {
  try {
    localStorage.setItem('tomatito:estado', texto);
  } catch (erro) {
    console.error('[estado] tomatito:estado não gravado', erro);
  }
}

/**
 * Um texto que não abriu como objeto JSON fica guardado à parte (o
 * `state.corrompido.json` do desktop), e a aba abre sem ele.
 */
export function guardarCorrompido(texto) {
  try {
    localStorage.setItem('tomatito:estado.corrompido', texto);
  } catch (erro) {
    console.error('[estado] não deu para guardar o original ilegível', erro);
  }
}
