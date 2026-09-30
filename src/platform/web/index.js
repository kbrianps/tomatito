// Plataforma da versão web (PLANO-WEB, 3.2; PLANO-WEB-V1, 3.2). O
// `#plataforma` cai aqui com a condição "tomatito-web" (vite.web.config.js).
// `invoke` tem os mesmos nomes e argumentos do Rust (commands.rs) e rejeita
// com `{ code, message }`.
//
// W06b: o foco, os temporizadores e o cronômetro são do motor em wasm
// (motor.js). O `get_state` junta o retrato do motor com as configurações e
// os recursos. Os comandos do desktop sem equivalente no navegador respondem
// aqui (PLANO-WEB-V1, 3.2, "Comandos na web").
// W07a: as configurações (settings_get e settings_set) também, pelo
// configuracoes.js (o settings.rs do motor, com o localStorage no lugar do
// arquivo).
// W08: as estatísticas e as tarefas, pelo estatisticas.js e pelo tarefas.js
// (o stats.rs e o tasks.rs, com o IndexedDB no lugar do SQLite). O motor
// provisório saiu; o `sound_test` resolve sem tocar até o som (W12).
import * as motor from './motor.js';
import * as configuracoes from './configuracoes.js';
import * as estatisticas from './estatisticas.js';
import * as tarefas from './tarefas.js';
import { emitir } from './barramento.js';

// Os períodos que o motor fecha vão para o IndexedDB.
motor.aoEfeito('period', estatisticas.gravarPeriodo);

export { emit, listen } from './barramento.js';
export { janelaAtual } from './janela.js';

/** Comandos do desktop que não existem no navegador (o Full, reiniciar e sair). */
export const SEM_SUPORTE = Object.freeze([
  'switch_window_mode',
  'show_main',
  'full_validation_answer',
  'set_tomato_region',
  'tomato_debug_size',
  'app_restart',
  'app_quit',
]);

const naoDisponivel = () => ({ code: 'unsupported', message: 'Não disponível na versão web.' });

/** O `recursos` do get_state (platform/recursos.js): nenhum, no navegador. */
const RECURSOS = Object.freeze({ bandeja: false, sempreNaFrente: false, regiaoDeEntrada: false });

// notices_read{doc}: os mesmos arquivos do pacote do desktop (M46), servidos
// ao lado do index.html (vite.web.config.js os copia para o dist-web).
const DOCUMENTOS = Object.freeze({ avisos: 'THIRD_PARTY_NOTICES.md', ofl: 'OFL-Inter.txt' });

async function lerDocumento({ doc } = {}) {
  const arquivo = Object.hasOwn(DOCUMENTOS, doc) ? DOCUMENTOS[doc] : null;
  if (!arquivo) throw { code: 'invalidArgs', message: `documento desconhecido: ${doc}` };
  const naoAchou = (motivo) => ({ code: 'notFound', message: `${arquivo}: ${motivo}` });
  let r;
  try {
    r = await fetch(`${import.meta.env.BASE_URL}${arquivo}`, { cache: 'no-cache' });
  } catch (erro) {
    throw naoAchou(erro?.message ?? String(erro));
  }
  // Um servidor de SPA devolve o index.html (200, text/html) no lugar de um
  // arquivo que não existe.
  if (!r.ok) throw naoAchou(`HTTP ${r.status}`);
  if ((r.headers.get('content-type') ?? '').includes('text/html')) throw naoAchou('o servidor devolveu uma página HTML');
  return r.text();
}

/**
 * `settings_set{patch}`, como o comando do desktop (commands.rs,
 * gravar_configuracoes): aplica e grava; as preferências do motor e o
 * `tt://settings` acompanham. O volume do som entra com o som.js (W12).
 */
async function gravarConfiguracoes({ patch } = {}) {
  await motor.iniciar();
  const s = configuracoes.gravar(patch);
  await motor.configurar(s);
  emitir('tt://settings', structuredClone(s));
  return s;
}

/** Os comandos atendidos aqui mesmo, sem o motor. */
const LOCAIS = Object.freeze({
  get_state: async () => ({
    ...(await motor.estado()),
    settings: configuracoes.ler(),
    recursos: RECURSOS,
  }),
  settings_get: async () => {
    await motor.iniciar();
    return configuracoes.ler();
  },
  settings_set: gravarConfiguracoes,
  notices_read: lerDocumento,
  // No navegador, a região aria-live basta (o desktop fala com o ATK, M43).
  a11y_announce: async () => null,
  x11_compat_get: async () => ({ disponivel: false, ativa: false, xwayland: false }),
  tomato_on_top_available: async () => false,
  // O retrato inerte da validação do Full (window/validacao.rs, Fase::Nenhuma).
  full_validation_get: async () => ({ seq: 0, state: 'none' }),
  stats_get: () => estatisticas.obter(),
  task_list: () => tarefas.listar(),
  task_add: tarefas.adicionar,
  task_complete: tarefas.concluir,
  task_delete: tarefas.apagar,
  // Até o som (W12): resolve sem tocar.
  sound_test: async ({ sound } = {}) => {
    console.debug('[sem som] sound_test', sound ?? 'ambos');
    return null;
  },
});

export async function invoke(cmd, args = {}) {
  if (Object.hasOwn(LOCAIS, cmd)) return LOCAIS[cmd](args);
  if (SEM_SUPORTE.includes(cmd)) throw naoDisponivel();
  // O resto é do motor (o espelho do generate_handler!); um nome que ele não
  // atende rejeita com `unknownCommand`.
  return motor.comando(cmd, args);
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

// O que só o navegador oferece (PLANO-WEB-V1, 3.2): fora do `recursos` do
// get_state (o platform/recursos.js é o do desktop e não muda). No desktop,
// SEM_RECURSOS_DA_CASCA (platform/tauri.js), com as mesmas chaves.
let recebeuConvite = false;
globalThis.addEventListener?.('beforeinstallprompt', () => {
  recebeuConvite = true;
});

/**
 * `{ notificacoes, instalavel }`: avisos pelo service worker e o convite de
 * instalação do navegador (o `beforeinstallprompt`) já recebido.
 */
export function recursosDaCasca() {
  return Object.freeze({
    notificacoes: 'Notification' in globalThis && 'serviceWorker' in (globalThis.navigator ?? {}),
    instalavel: recebeuConvite,
  });
}
