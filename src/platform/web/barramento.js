// Barramento de eventos da versão web: o papel do `app.emit` do Rust e do
// `listen` do Tauri, dentro da página. O formato do que o ouvinte recebe é o
// do Tauri (`{ event, id, payload }`), para o lib/ipc.js não mudar.
const ouvintes = new Map();
let proximo = 1;

export function listen(evento, cb) {
  const id = proximo++;
  if (!ouvintes.has(evento)) ouvintes.set(evento, new Map());
  ouvintes.get(evento).set(id, cb);
  return Promise.resolve(() => ouvintes.get(evento)?.delete(id));
}

export function emitir(evento, payload) {
  for (const [id, cb] of ouvintes.get(evento) ?? []) {
    try {
      cb({ event: evento, id, payload });
    } catch (erro) {
      console.error(`[web] ouvinte de ${evento}`, erro);
    }
  }
}

export const emit = (evento, payload) => (emitir(evento, payload), Promise.resolve());
