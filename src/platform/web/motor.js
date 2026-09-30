// O motor da versão web (PLANO-WEB, 3.3 e W06b): o `tomatito-motor` em wasm
// (src-tauri/tomatito-wasm), o mesmo `Engine` do desktop, hospedado na aba.
//
// - `init()` carrega o wasm uma vez (`await init()` do glue, sem plugin do
//   Vite) e cria o `Motor`. Todas as chamadas esperam por ele: antes de o
//   wasm chegar, a tela mostra o preparo padrão do store, e o primeiro
//   get_state a completa (sem estado de carregamento próprio; W06b, anotado
//   em docs/web/linha-de-base.md).
// - Cada resposta do wasm traz os efeitos desde a chamada anterior, em ordem.
//   Os que têm evento no desktop (`state`, `tick`, `phase`, `timers`,
//   `stopwatch`) vão ao barramento com o mesmo nome (`tt://<tipo>`). Os que o
//   desktop faz no Rust (`sound`, `notice`, `timerNotice`) ficam
//   anotados em `semDono`, sem tocar nada: o som é do W12 e o aviso do W13.
//   O `period` (W08) vai ao estatisticas.js, que o grava no IndexedDB
//   (`aoEfeito`, registrado pelo index.js).
// - As preferências (F, B e os sons) vêm das configurações (configuracoes.js)
//   ao criar o motor e a cada `settings_set` (`configurar`; W07a).
// - Tick de 1 Hz só com a aba visível, por um `setTimeout` único encadeado
//   (nenhum `setInterval` na camada web, regra 5), armado quando algo corre.
//   Com a aba oculta, a cadeia para; na volta, o `visibilitychange` a religa
//   (e o store pede um get_state, que fecha o que venceu no meio-tempo).
// - Pânico (3.3): o `set_hook` do Rust já escreveu a mensagem no console; o
//   `RuntimeError` do wasm faz o motor parar (nenhuma chamada nem gravação
//   depois) e recarregar a página, ou, se o pânico se repetir logo depois da
//   recarga, mostrar o aviso (panico.js).
import init, { Motor } from './pkg/tomatito_wasm.js';
import { emitir } from './barramento.js';
import * as configuracoes from './configuracoes.js';
import { MARCA, decidir, mostrarAviso } from './panico.js';

/** Os efeitos que viram eventos, com o nome do desktop. */
export const EVENTOS = Object.freeze({
  state: 'tt://state',
  tick: 'tt://tick',
  phase: 'tt://phase',
  timers: 'tt://timers',
  stopwatch: 'tt://stopwatch',
});

/** O intervalo do tick com a aba visível (o TICK_EVERY do motor). */
export const TICK_MS = 1000;

/** Quantos efeitos sem dono ficam anotados (os mais recentes). */
const LIMITE_SEM_DONO = 50;

/**
 * Os efeitos que a web ainda não executa, `{ tipo, dados }`, do mais antigo
 * ao mais novo (até 50). Os marcos do som, dos avisos e das estatísticas os
 * tiram daqui.
 */
export const semDono = [];

let motor = null;
let carregando = null;
let quebrado = false;
let proximoTick = null;

const visivel = () => globalThis.document?.visibilityState !== 'hidden';

/**
 * Carrega o wasm e cria o motor, uma vez, já com as preferências das
 * configurações salvas (F e B, sons; W07a), antes do primeiro comando.
 * Resolve com o motor.
 */
export function iniciar() {
  carregando ??= init().then(() => {
    motor = new Motor();
    motor.configurar(JSON.stringify(configuracoes.ler()));
    globalThis.document?.addEventListener('visibilitychange', aoMudarVisibilidade);
    return motor;
  });
  return carregando;
}

/** Se o motor parou por pânico (nenhuma chamada nem gravação depois). */
export const parado = () => quebrado;

const ERRO_PARADO = () => ({ code: 'panicked', message: 'o motor parou depois de um erro interno' });

// Quem executa os efeitos que não viram evento (W08: o `period`, pelo
// estatisticas.js), registrado pelo index.js; assim o motor.js não importa
// quem o importa.
const donos = new Map();

/**
 * `f(dados)` passa a receber o efeito `tipo` (um dono por tipo), na ordem em
 * que ele sai, antes dos eventos que vêm depois dele na mesma resposta.
 */
export function aoEfeito(tipo, f) {
  donos.set(tipo, f);
}

/** Leva os efeitos ao dono, ao barramento ou à lista `semDono`, na ordem. */
function distribuir(efeitos) {
  for (const { tipo, dados } of efeitos ?? []) {
    const dono = donos.get(tipo);
    if (dono) {
      try {
        dono(dados);
      } catch (erro) {
        console.error(`[motor] efeito ${tipo}`, erro);
      }
      continue;
    }
    const evento = EVENTOS[tipo];
    if (evento) {
      emitir(evento, dados);
      continue;
    }
    semDono.push({ tipo, dados });
    if (semDono.length > LIMITE_SEM_DONO) semDono.shift();
    console.debug(`[motor] efeito ${tipo} ainda sem dono na web`, dados);
  }
}

/**
 * Roda `f(motor)` (uma chamada ao wasm que devolve `{ resultado, efeitos,
 * proximoPrazo }`), distribui os efeitos, religa o tick e devolve o
 * `resultado`. Um erro do motor (`{ code, message }`) passa adiante, depois
 * de esvaziar a fila (um comando recusado pode ter fechado uma fase vencida
 * antes de recusar). Um `RuntimeError` do wasm é o pânico.
 */
function chamar(f) {
  if (quebrado) throw ERRO_PARADO();
  let resposta;
  try {
    resposta = f(motor);
  } catch (erro) {
    if (erro instanceof WebAssembly.RuntimeError) {
      aoEntrarEmPanico(erro);
      throw ERRO_PARADO();
    }
    esvaziarDepoisDoErro();
    throw erro;
  }
  distribuir(resposta.efeitos);
  armarTick();
  return resposta.resultado;
}

function esvaziarDepoisDoErro() {
  try {
    distribuir(motor.tick().efeitos);
    armarTick();
  } catch (erro) {
    if (erro instanceof WebAssembly.RuntimeError) aoEntrarEmPanico(erro);
    else console.error('[motor] ao esvaziar a fila depois de um erro', erro);
  }
}

/** Um comando do motor (focus_*, timer_*, stopwatch_*), com os args em camelCase. */
export async function comando(nome, args) {
  await iniciar();
  return chamar((m) => m.comando(nome, args ?? null));
}

/** O retrato do motor (o get_state sem `settings` nem `recursos`). */
export async function estado() {
  await iniciar();
  return chamar((m) => m.estado());
}

/**
 * As configurações novas viram as preferências do motor (o `configurar` do
 * `settings_set` do desktop, M38).
 */
export async function configurar(settings) {
  await iniciar();
  if (quebrado) throw ERRO_PARADO();
  try {
    motor.configurar(JSON.stringify(settings));
  } catch (erro) {
    if (erro instanceof WebAssembly.RuntimeError) {
      aoEntrarEmPanico(erro);
      throw ERRO_PARADO();
    }
    throw erro;
  }
}

// ---------------------------------------------------------------------------
// Tick de 1 Hz com a aba visível.
// ---------------------------------------------------------------------------

function armarTick() {
  if (proximoTick !== null || quebrado || !motor || !visivel()) return;
  let correndo;
  try {
    correndo = motor.estaCorrendo();
  } catch (erro) {
    if (erro instanceof WebAssembly.RuntimeError) aoEntrarEmPanico(erro);
    return;
  }
  if (!correndo) return;
  proximoTick = setTimeout(aoTick, TICK_MS);
}

function aoTick() {
  proximoTick = null;
  if (quebrado || !visivel()) return;
  try {
    // O chamar religa o tick enquanto algo corre.
    chamar((m) => m.tick());
  } catch (erro) {
    if (erro?.code !== 'panicked') console.error('[motor] tick', erro);
  }
}

function aoMudarVisibilidade() {
  if (!visivel()) {
    clearTimeout(proximoTick);
    proximoTick = null;
    return;
  }
  // Na volta, um passo já: fecha o que venceu e acerta a contagem.
  aoTick();
}

// ---------------------------------------------------------------------------
// Pânico.
// ---------------------------------------------------------------------------

function lerMarca() {
  try {
    return sessionStorage.getItem(MARCA);
  } catch {
    return null;
  }
}

function aoEntrarEmPanico(erro) {
  if (quebrado) return;
  quebrado = true;
  clearTimeout(proximoTick);
  proximoTick = null;
  console.error('[motor] o wasm parou (pânico)', erro);
  const agora = Date.now();
  if (decidir(lerMarca(), agora) === 'recarregar') {
    try {
      sessionStorage.setItem(MARCA, String(agora));
    } catch {
      // Sem sessionStorage, a próxima vez recarrega de novo; o set_hook já
      // deixou a causa no console.
    }
    location.reload();
    return;
  }
  mostrarAviso(document, () => location.reload());
}
