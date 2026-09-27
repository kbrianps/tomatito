// Servidor Vite da prévia, comum ao shot.mjs e ao webkit-shot.mjs.
//
// Fora do middlewareMode, o Vite registra um process.once('SIGTERM') (e um
// 'end' no stdin) que fecha o servidor e chama process.exit(). Isso cortaria
// no meio a limpeza dos scripts de prévia (fechar o navegador e apagar o
// perfil temporário). Os ouvintes que o Vite acrescenta são removidos aqui;
// quem chama fica responsável por fechar o servidor nos sinais.
import { createServer } from 'vite';
import previewConfig from './vite.config.js';

export async function startPreviewServer() {
  const before = {
    sigterm: new Set(process.listeners('SIGTERM')),
    stdinEnd: new Set(process.stdin.listeners('end')),
  };
  const server = await createServer({ ...previewConfig, logLevel: 'warn' });
  for (const l of process.listeners('SIGTERM')) if (!before.sigterm.has(l)) process.off('SIGTERM', l);
  for (const l of process.stdin.listeners('end')) if (!before.stdinEnd.has(l)) process.stdin.off('end', l);
  try {
    await server.listen();
  } catch (err) {
    await server.close().catch(() => {});
    throw err;
  }
  return { server, origin: server.resolvedUrls.local[0].replace(/\/$/, '') };
}
