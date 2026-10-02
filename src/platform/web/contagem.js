// As regras de soma e de lista do desktop que a web aplica sobre o que leu
// do IndexedDB (W08), sem o wasm, para os testes do Node.
//   - Soma (stats.rs, `focus_seconds`; PLANO.md 3.3, "Regra de soma"): só os
//     períodos de foco, os concluídos e os interrompidos com pelo menos
//     `MIN_INTERRUPTED_S` (1 min), cada um no dia do seu `endedAt`.
//   - Lista (tasks.rs, `task_list`): as pendentes e as concluídas desde a
//     virada de hoje, na ordem de criação (`id`).

/** Um período interrompido só conta a partir de 1 min (stats.rs, MIN_INTERRUPTED_S). */
export const MIN_INTERROMPIDO_S = 60;

/** Se o período entra no "Concluído" e em "Esta semana". */
export const conta = (p) => p?.kind === 'focus' && (p.completed === true || p.actualS >= MIN_INTERROMPIDO_S);

/** Os segundos de foco que contam em `periodos`, com o fim em `[faixa.start, faixa.end)`. */
export function somarFoco(periodos, faixa) {
  if (!faixa) return 0;
  let s = 0;
  for (const p of periodos) {
    if (conta(p) && p.endedAt >= faixa.start && p.endedAt < faixa.end) s += Math.max(0, p.actualS);
  }
  return s;
}

/** As tarefas da lista: pendentes, e concluídas em `desde` ou depois, por `id`. */
export const visiveis = (tarefas, desde) =>
  tarefas
    .filter((t) => t.doneAt === null || t.doneAt === undefined || t.doneAt >= desde)
    .sort((a, b) => a.id - b.id)
    .map(tarefa);

/** Uma tarefa como o `TaskDto` do desktop: `{ id, title, createdAt, doneAt }`, nessa ordem. */
export const tarefa = ({ id, title, createdAt, doneAt }) => ({ id, title, createdAt, doneAt: doneAt ?? null });

/** O erro de uma tarefa que não existe (tasks.rs, `TaskError::not_found`). */
export const naoExiste = (id) => ({ code: 'notFound', message: `não existe a tarefa ${id}` });

/** O erro do banco (tasks.rs, `armazenamento`). */
export const erroDoBanco = (erro) => ({ code: 'storage', message: String(erro?.message ?? erro) });
