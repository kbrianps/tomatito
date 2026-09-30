// Plataforma do app de desktop: o Tauri (PLANO-WEB, 3.2). Só reexporta a API
// oficial; o `#plataforma` (package.json, "imports") cai aqui fora do build
// web e no `node --test`. Dos arquivos alcançáveis a partir do src/main.js,
// este é o único que importa @tauri-apps (regras-do-repo.test.mjs).
export { invoke } from '@tauri-apps/api/core';
export { emit, listen } from '@tauri-apps/api/event';
export { getCurrentWindow as janelaAtual } from '@tauri-apps/api/window';
// M39: a versão do Cargo.toml (a configuração não tem `version`, 1.1). É
// função nas duas plataformas, porque a tela chama `ipc.versao?.()`.
export { getVersion as versao } from '@tauri-apps/api/app';

/**
 * O que o invólucro oferece (PLANO-WEB-V1, 3.2). Estático: não depende do
 * sistema. A decisão de cada tela é por aqui, nunca pelo `data-platform`.
 */
export const casca = Object.freeze({
  web: false,
  barraDeTitulo: true, // minimizar, maximizar e fechar próprios
  bloqueiosDeProducao: true, // F5, Ctrl+R e menu do WebView presos no build
  atalhosDaJanela: true, // Ctrl+W e Ctrl+Q
  atalhosDeNavegacao: true, // Ctrl+1–3 trocam de tela
  sair: true,
  full: true, // o modo Full (M50–M57)
  formaCelular: false, // nunca o layout de celular
});

/**
 * O que só a web oferece (PLANO-WEB-V1, 3.2): no desktop, nada. A web devolve
 * as mesmas chaves (platform/web/index.js).
 */
export const SEM_RECURSOS_DA_CASCA = Object.freeze({ notificacoes: false, instalavel: false });
export const recursosDaCasca = () => SEM_RECURSOS_DA_CASCA;

/**
 * W14: a permissão dos avisos do navegador (platform/web/permissao.js). O
 * desktop avisa pelo notify.rs, sem pedido: nada.
 */
export const avisosDaCasca = null;

/**
 * W16: a atualização do service worker da web (platform/web/atualizacao.js).
 * O desktop atualiza pelo instalador: nada.
 */
export const atualizacaoDaCasca = null;
