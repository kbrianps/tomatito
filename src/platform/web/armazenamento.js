// O banco da versão web (PLANO-WEB, 3.5; W08): o IndexedDB `tomatito`, no
// lugar do stats.sqlite do desktop, sem dependência. Duas stores, com a chave
// numérica crescente do SQLite (`id`):
//   - `periods`, um período por linha (o PeriodoDto do wasm), com o índice
//     `endedAt` (o `periods_ended_at` do desktop);
//   - `tasks`, as tarefas (`{ id, title, createdAt, doneAt }`).
// Uma aba nova com um banco mais novo pede para esta fechar o dela
// (`versionchange`), e a próxima chamada abre de novo.
export const BANCO = 'tomatito';
export const VERSAO = 1;

let aberto = null;

/** Um pedido do IndexedDB como promessa. */
export const esperar = (pedido) =>
  new Promise((ok, falha) => {
    pedido.onsuccess = () => ok(pedido.result);
    pedido.onerror = () => falha(pedido.error);
  });

function abrir() {
  aberto ??= new Promise((ok, falha) => {
    const pedido = indexedDB.open(BANCO, VERSAO);
    pedido.onupgradeneeded = () => {
      const db = pedido.result;
      db.createObjectStore('periods', { keyPath: 'id', autoIncrement: true }).createIndex('endedAt', 'endedAt');
      db.createObjectStore('tasks', { keyPath: 'id', autoIncrement: true });
    };
    pedido.onsuccess = () => {
      const db = pedido.result;
      db.onversionchange = () => {
        db.close();
        aberto = null;
      };
      ok(db);
    };
    pedido.onerror = () => falha(pedido.error);
    pedido.onblocked = () => console.warn('[armazenamento] o banco está aberto numa versão antiga em outra aba');
  }).catch((erro) => {
    aberto = null;
    throw erro;
  });
  return aberto;
}

/**
 * Roda `f(stores)` numa transação sobre `nomes` e resolve com o que `f`
 * devolveu (esperado, se for promessa) quando a transação terminar.
 */
export async function transacao(nomes, modo, f) {
  const tx = (await abrir()).transaction(nomes, modo);
  const fim = new Promise((ok, falha) => {
    tx.oncomplete = ok;
    tx.onerror = () => falha(tx.error);
    tx.onabort = () => falha(tx.error ?? new Error('transação abortada'));
  });
  let resultado;
  try {
    resultado = await f(Object.fromEntries(nomes.map((n) => [n, tx.objectStore(n)])));
  } catch (erro) {
    fim.catch(() => {}); // o erro que vale é o de `f`
    try {
      tx.abort();
    } catch {
      // já terminou
    }
    throw erro;
  }
  await fim;
  return resultado;
}
