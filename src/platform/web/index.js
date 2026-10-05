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
// provisório saiu.
// W12: o som (som.js), com os WAVs do desktop publicados pelo Vite. O efeito
// `sound` do motor toca; os comandos que deixam algo correndo despertam o
// AudioContext (o gesto); cada transição do motor revisa o `suspend()`.
// W13: os avisos (avisos.js), pelo service worker da raiz (sw.js). Os
// efeitos `notice` e `timerNotice` do motor viram notificações, `silent`
// quando o som do mesmo passo tocou.
// W14: o pedido de permissão (permissao.js), exposto às telas como
// `avisosDaCasca` (o InfoBar da Foco e a seção Avisos das Configurações).
// W16: o PWA. O sw.js guarda o app para funcionar offline; a política de
// atualização (atualizacao.js) é exposta às telas como `atualizacaoDaCasca`
// (o cartão Atualizar das Configurações).
// W17: o título da aba (aba.js), com o tempo da sessão como na bandeja do
// desktop, desligável pela chave `tomatito:web.tempoNaAba`.
// v0.3: uma aba só (aba-unica.js). Quem espera pela trava é o motor (o
// `motor.iniciar()`): sem ela, nenhum comando, estado ou gravação anda.
// W18: o cartão "Tempo na aba" chega à chave pelo `abaDaCasca`, e o
// "Instalar o Tomatito" ao convite do navegador pelo `instalacaoDaCasca`
// (instalacao.js).
import focusEndUrl from '../../../src-tauri/sounds/focus-end.wav?url';
import breakEndUrl from '../../../src-tauri/sounds/break-end.wav?url';
import * as motor from './motor.js';
import { criarSom } from './som.js';
import { criarAvisos, registrarServiceWorker, registroAtivo } from './avisos.js';
import { criarPermissao } from './permissao.js';
import { criarAtualizacao } from './atualizacao.js';
import { criarInstalacao } from './instalacao.js';
import * as configuracoes from './configuracoes.js';
import * as estatisticas from './estatisticas.js';
import * as tarefas from './tarefas.js';
import { emitir, listen } from './barramento.js';
import { definirTempoNaAba, tempoNaAbaLigado } from './aba.js';
import { ligarTeclado } from '../../lib/teclado.js';
import { criarDados } from './dados.js';

// Os períodos que o motor fecha vão para o IndexedDB.
motor.aoEfeito('period', estatisticas.gravarPeriodo);

const som = criarSom({
  urls: { focusEnd: focusEndUrl, breakEnd: breakEndUrl },
  novoContexto: () => new AudioContext(),
  // Um contexto offline decodifica sem gesto nenhum; o AudioBuffer serve a
  // qualquer contexto.
  decodificar: async (url) => {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
    const bytes = await r.arrayBuffer();
    return new OfflineAudioContext(1, 1, 44_100).decodeAudioData(bytes);
  },
  correndo: motor.estaCorrendo,
  // Lido na hora de tocar: o settings_set já regravou as configurações.
  volume: () => configuracoes.ler().volume,
});
// O pedido de som do passo fica guardado até o aviso que vem logo depois
// dele (o núcleo emite o `sound` antes do `notice` e do `timerNotice`).
let somDoPasso = null;
motor.aoEfeito('sound', (sound) => {
  somDoPasso = som.tocar(sound, 'motor');
});
const tomarSom = () => {
  const s = somDoPasso;
  somDoPasso = null;
  return s;
};
listen('tt://state', () => som.revisar());
listen('tt://timers', () => som.revisar());
// Os WAVs chegam na carga, sem esperar o primeiro fim de fase.
som.carregar();

const avisos = criarAvisos({
  permissao: () => globalThis.Notification?.permission ?? 'sem suporte',
  registro: () => registroAtivo(),
});
motor.aoEfeito('notice', (dados) => avisos.fase(dados, tomarSom()));
motor.aoEfeito('timerNotice', (dados) => avisos.temporizador(dados, tomarSom()));
/**
 * W16: a atualização do service worker (atualizacao.js): aplicada sozinha só
 * com nada correndo; senão, pelo cartão Atualizar. No desktop, null
 * (platform/tauri.js).
 */
export const atualizacaoDaCasca = criarAtualizacao({
  servico: globalThis.navigator?.serviceWorker ?? null,
  correndo: motor.estaCorrendo,
  recarregar: () => globalThis.location.reload(),
});
listen('tt://state', () => atualizacaoDaCasca.revisar());
listen('tt://timers', () => atualizacaoDaCasca.revisar());
// W37: o teclado virtual esconde a barra inferior (data-teclado).
ligarTeclado();
// Registrado na carga, sem pedir permissão (o pedido é por clique, W14).
// A atualização só é acompanhada com o motor já retomado: antes disso o
// `correndo` diria "nada" mesmo com uma fase guardada, e a página recarregaria.
Promise.all([registrarServiceWorker(import.meta.env.BASE_URL), motor.iniciar().catch(() => null)]).then(([reg]) =>
  atualizacaoDaCasca.acompanhar(reg),
);

/** Os comandos que deixam algo correndo: o gesto que desperta o som (3.6). */
const DESPERTAM = new Set(['focus_start', 'focus_resume', 'focus_skip', 'timer_start']);

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
  stats_history: () => estatisticas.historico(),
  task_list: () => tarefas.listar(),
  task_add: tarefas.adicionar,
  task_complete: tarefas.concluir,
  task_delete: tarefas.apagar,
  // Toca mesmo com o som desligado nas configurações, como no desktop.
  sound_test: async ({ sound } = {}) => som.testar(sound),
});

export async function invoke(cmd, args = {}) {
  if (Object.hasOwn(LOCAIS, cmd)) return LOCAIS[cmd](args);
  // Ainda dentro do gesto (antes de qualquer await): cria ou retoma o
  // AudioContext.
  if (DESPERTAM.has(cmd)) som.despertar();
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
  android: false,
  tomateTelaCheia: false,
  secaoSistema: false, // nada de bandeja, X11 ou sair
  volume: true,
});

// O que só o navegador oferece (PLANO-WEB-V1, 3.2): fora do `recursos` do
// get_state (o platform/recursos.js é o do desktop e não muda). No desktop,
// SEM_RECURSOS_DA_CASCA (platform/tauri.js), com as mesmas chaves.
/**
 * W18: o convite de instalação do navegador (instalacao.js), para o cartão
 * "Instalar o Tomatito" das Configurações. No desktop, null
 * (platform/tauri.js).
 */
export const instalacaoDaCasca = criarInstalacao({ janela: globalThis });

/**
 * `{ notificacoes, instalavel }`: avisos pelo service worker e o convite de
 * instalação do navegador (o `beforeinstallprompt`) já recebido.
 */
export function recursosDaCasca() {
  return Object.freeze({
    notificacoes: 'Notification' in globalThis && 'serviceWorker' in (globalThis.navigator ?? {}),
    instalavel: instalacaoDaCasca.disponivel(),
  });
}

/**
 * W14: a permissão dos avisos (permissao.js), para o InfoBar da Foco e a
 * seção Avisos das Configurações. No desktop, null (platform/tauri.js).
 */
export const avisosDaCasca = criarPermissao({
  notificacao: () => globalThis.Notification,
  armazenamento: () => globalThis.localStorage ?? null,
  permissoes: () => globalThis.navigator?.permissions ?? null,
  registro: () => registroAtivo(),
});

/**
 * v0.3: exportar e importar os dados deste navegador (dados.js), para a seção
 * "Dados" das Configurações. No desktop, null (platform/tauri.js).
 */
export const dadosDaCasca = criarDados({
  versaoDoApp: typeof __TOMATITO_VERSAO__ === 'string' ? __TOMATITO_VERSAO__ : '',
  antesDeLer: () => estatisticas.gravacoesPendentes(),
});

/**
 * W18: o tempo no título da aba (aba.js), para o cartão "Tempo na aba" das
 * Configurações. No desktop, null (platform/tauri.js).
 */
export const abaDaCasca = Object.freeze({ ligado: tempoNaAbaLigado, definir: definirTempoNaAba });
