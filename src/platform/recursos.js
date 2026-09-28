// Os recursos da plataforma (PLANO.md, 3.8 e M39): o que o sistema permite,
// num objeto só, para as telas esconderem as opções que não se aplicam sem
// perguntar pelo sistema (nada de `if (os === 'linux')` espalhado).
//
//   bandeja          o ícone da bandeja existe (o "Tempo na bandeja" depende dele)
//   sempreNaFrente   o app põe uma janela sempre na frente por código (o
//                    tomatoOnTop do Full); no Wayland, não
//   regiaoDeEntrada  a janela do tomate pode ter região de entrada (5.1)
//
// Quem decide é o Rust (src-tauri/src/recursos.rs; no Linux, pelo
// WAYLAND_DISPLAY e pelo GDK_BACKEND), que manda os três no `recursos` do
// get_state. O store entrega cada get_state ao `definirRecursos`; até o
// primeiro, vale SEM_RECURSOS (nada é prometido antes de o Rust dizer).
//
// `recursos` é um export vivo: `(await import('/src/platform/recursos.js'))
// .recursos` no console mostra o valor atual.

/** Antes do primeiro get_state: nenhum recurso. */
export const SEM_RECURSOS = Object.freeze({ bandeja: false, sempreNaFrente: false, regiaoDeEntrada: false });

/** O objeto de recursos a partir do `recursos` do get_state: só `true` liga. */
export function montarRecursos(dto) {
  return Object.freeze({
    bandeja: dto?.bandeja === true,
    sempreNaFrente: dto?.sempreNaFrente === true,
    regiaoDeEntrada: dto?.regiaoDeEntrada === true,
  });
}

export let recursos = SEM_RECURSOS;

const ouvintes = new Set();
const iguais = (a, b) => Object.keys(SEM_RECURSOS).every((k) => a[k] === b[k]);

/**
 * Guarda os recursos do get_state e avisa quem assina, se mudaram. Um valor
 * que não é objeto (um get_state antigo, sem `recursos`) é ignorado. Devolve
 * se aplicou.
 */
export function definirRecursos(dto) {
  if (!dto || typeof dto !== 'object' || Array.isArray(dto)) return false;
  const novos = montarRecursos(dto);
  if (iguais(novos, recursos)) return true;
  recursos = novos;
  for (const cb of ouvintes) cb(recursos);
  return true;
}

/** `cb(recursos)` a cada mudança. Devolve a função que desliga. */
export function assinarRecursos(cb) {
  ouvintes.add(cb);
  return () => ouvintes.delete(cb);
}
