// Plataforma da versão web (PLANO-WEB, 3.2; PLANO-WEB-V1, 3.2). O
// `#plataforma` cai aqui com a condição "tomatito-web" (vite.web.config.js).
// `invoke` tem os mesmos nomes e argumentos do Rust (commands.rs) e rejeita
// com `{ code, message }`.
//
// W06b: o foco, os temporizadores e o cronômetro são do motor em wasm
// (motor.js). O `get_state` junta o retrato do motor com as configurações e
// os recursos. Os comandos do desktop sem equivalente no navegador respondem
// aqui (PLANO-WEB-V1, 3.2, "Comandos na web"). PROVISÓRIO: configurações,
// estatísticas, tarefas e o teste de som ainda vêm do motor-prototipo.js (o
// mock da prévia), com um `console.debug('[provisório] …')` a cada uso, até
// o W07a (configurações), o W08 (estatísticas e tarefas) e o W12 (som).
import * as motor from './motor.js';
import { handlers as prototipo } from './motor-prototipo.js';

export { emit, listen } from './barramento.js';
export { janelaAtual } from './janela.js';

/** Os comandos que ainda passam pelo motor provisório. */
export const PROVISORIOS = Object.freeze([
  'settings_get',
  'settings_set',
  'stats_get',
  'task_list',
  'task_add',
  'task_complete',
  'task_delete',
  'sound_test',
]);

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

/** Os comandos atendidos aqui mesmo, sem o motor. */
const LOCAIS = Object.freeze({
  get_state: async () => ({
    ...(await motor.estado()),
    // PROVISÓRIO até o W07a: as configurações do motor provisório.
    settings: structuredClone(await prototipo.settings_get()),
    recursos: RECURSOS,
  }),
  notices_read: lerDocumento,
  // No navegador, a região aria-live basta (o desktop fala com o ATK, M43).
  a11y_announce: async () => null,
  x11_compat_get: async () => ({ disponivel: false, ativa: false, xwayland: false }),
  tomato_on_top_available: async () => false,
  // O retrato inerte da validação do Full (window/validacao.rs, Fase::Nenhuma).
  full_validation_get: async () => ({ seq: 0, state: 'none' }),
});

export async function invoke(cmd, args = {}) {
  if (Object.hasOwn(LOCAIS, cmd)) return LOCAIS[cmd](args);
  if (SEM_SUPORTE.includes(cmd)) throw naoDisponivel();
  if (PROVISORIOS.includes(cmd)) {
    console.debug(`[provisório] ${cmd}`);
    return structuredClone(await prototipo[cmd](args));
  }
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
