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
 * O que o invólucro oferece (PLANO-WEB-V1, 3.2). A decisão de cada tela é por
 * aqui, nunca pelo `data-platform`. No desktop, estática; no Android (o mesmo
 * Tauri, PLANO-ANDROID 4.3, A05), decidida na carga pelo `__TT_PLATFORM__` que
 * o initialization_script grava (`std::env::consts::OS`).
 */
const DESKTOP = Object.freeze({
  web: false,
  android: false,
  barraDeTitulo: true, // minimizar, maximizar e fechar próprios
  bloqueiosDeProducao: true, // F5, Ctrl+R e menu do WebView presos no build
  atalhosDaJanela: true, // Ctrl+W e Ctrl+Q
  atalhosDeNavegacao: true, // Ctrl+1–3 trocam de tela
  sair: true,
  full: true, // o modo Full (M50–M57)
  tomateTelaCheia: false,
  formaCelular: false, // nunca o layout de celular
  secaoSistema: true, // bandeja, sempre na frente, X11, sair
  volume: true, // o som toca pelo app
});
const ANDROID = Object.freeze({
  ...DESKTOP,
  android: true,
  barraDeTitulo: false,
  atalhosDaJanela: false,
  atalhosDeNavegacao: false,
  sair: false,
  full: false, // o Full de janela não; o tomate em tela cheia é o A16
  tomateTelaCheia: true,
  formaCelular: true,
  secaoSistema: false,
  volume: false, // o som é do canal de notificação (5.5)
});
export const casca = globalThis.__TT_PLATFORM__ === 'android' ? ANDROID : DESKTOP;

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

/**
 * W18: o tempo no título da aba e o convite de instalação do navegador
 * (platform/web/aba.js e platform/web/instalacao.js). O desktop tem a
 * bandeja e o instalador: nada.
 */
export const abaDaCasca = null;
export const instalacaoDaCasca = null;
