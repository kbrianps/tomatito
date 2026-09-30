// Tarefas da versão web (PLANO-WEB, 3.5 e W08): o `tasks.rs` do desktop com a
// store `tasks` do IndexedDB no lugar da tabela. O título limpo e a virada do
// dia são os do motor (`limparTitulo` e `visivelDesde`, no wasm), e o
// "agora" é o relógio do motor (o `Date.now`). Os erros são os do desktop:
// `emptyTitle`, `titleTooLong`, `notFound` e `storage`.
import { limparTitulo, visivelDesde } from './pkg/tomatito_wasm.js';
import { esperar, transacao } from './armazenamento.js';
import { erroDoBanco, naoExiste, tarefa, visiveis } from './contagem.js';
import * as configuracoes from './configuracoes.js';
import * as motor from './motor.js';

/** Roda a transação e troca um erro do banco pelo `storage`. */
async function noBanco(modo, f) {
  try {
    return await transacao(['tasks'], modo, ({ tasks }) => f(tasks));
  } catch (erro) {
    if (erro && typeof erro.code === 'string' && 'message' in erro) throw erro;
    console.error('[tarefas]', erro);
    throw erroDoBanco(erro);
  }
}

/** `task_list`: as pendentes e as concluídas desde a virada de hoje. */
export async function listar() {
  await motor.iniciar();
  const desde = visivelDesde(Date.now(), configuracoes.ler().resetHour);
  return visiveis(await noBanco('readonly', (tasks) => esperar(tasks.getAll())), desde);
}

/** `task_add{title}`: a tarefa criada, pendente. */
export async function adicionar({ title } = {}) {
  await motor.iniciar();
  const titulo = limparTitulo(String(title ?? ''));
  const nova = { title: titulo, createdAt: Date.now(), doneAt: null };
  return noBanco('readwrite', async (tasks) => tarefa({ ...nova, id: await esperar(tasks.add(nova)) }));
}

/** O id como o Rust o lê (i64): um número inteiro, ou `invalidArgs`. */
function chave(id) {
  if (!Number.isSafeInteger(id)) throw { code: 'invalidArgs', message: `id inválido: ${id}` };
  return id;
}

/** `task_complete{id, done}`: `done` vale `true` se faltar. */
export async function concluir({ id, done = true } = {}) {
  await motor.iniciar();
  const agora = Date.now();
  return noBanco('readwrite', async (tasks) => {
    const t = await esperar(tasks.get(chave(id)));
    if (!t) throw naoExiste(id);
    // Concluir de novo guarda o primeiro horário.
    const feita = { ...t, doneAt: done === false ? null : (t.doneAt ?? agora) };
    await esperar(tasks.put(feita));
    return tarefa(feita);
  });
}

/** `task_delete{id}`. Os períodos com esse `taskId` ficam como estão. */
export async function apagar({ id } = {}) {
  await motor.iniciar();
  return noBanco('readwrite', async (tasks) => {
    const k = chave(id);
    if ((await esperar(tasks.getKey(k))) === undefined) throw naoExiste(id);
    await esperar(tasks.delete(k));
    return null;
  });
}
