// Plataforma da versão web (PLANO-WEB, 3.2; PLANO-WEB-V1, 3.2). O
// `#plataforma` cai aqui com a condição "tomatito-web" (vite.web.config.js).
// `invoke` tem os mesmos nomes e argumentos do Rust (commands.rs) e rejeita
// com `{ code, message }`.
// PROVISÓRIO (W03a): os comandos vão para o motor-prototipo.js, o mock da
// prévia; no W06b, passam ao motor.js (tomatito-motor em wasm).
import { handlers } from './motor-prototipo.js';

export { emit, listen } from './barramento.js';
export { janelaAtual } from './janela.js';

export async function invoke(cmd, args = {}) {
  const h = handlers[cmd];
  if (!h) throw { code: 'unknownCommand', message: `comando sem equivalente na web: ${cmd}` };
  return structuredClone(await h(args));
}

// A versão do Cargo.toml, gravada no build (`define` do vite.web.config.js).
// Função, como no desktop: a tela chama `ipc.versao?.()`.
export const versao = async () => __TOMATITO_VERSAO__;

/** O que o navegador oferece como invólucro (a do desktop está no platform/tauri.js). */
export const casca = Object.freeze({
  web: true,
  barraDeTitulo: false, // a janela é a do navegador
  bloqueiosDeProducao: false, // F5 e menu de contexto são do navegador
  atalhosDaJanela: false, // Ctrl+W e Ctrl+Q são do navegador
  atalhosDeNavegacao: false, // Ctrl+1–3 trocam de aba no navegador
  sair: false,
  full: false, // o Full na web fica para depois
  formaCelular: true, // pode usar o layout de celular (quem liga é o boot-web.js, W07a)
});
