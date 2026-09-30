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
// - Relógio (PLANO-WEB-V1, W11): três temporizadores, todos `setTimeout`
//   (nenhum `setInterval` na camada web, regra 5), sem Worker:
//   - prazo: um `setTimeout` único até o próximo prazo (`proximoPrazo` do
//     prazo.js: fim da fase ou zero de um temporizador), com a aba visível
//     ou oculta. É rearmado só a partir do efeito do motor e do
//     `visibilitychange`, nunca de dentro de outro `setTimeout`: depois de
//     cada chamada ao wasm, o rearme vai por uma mensagem de um
//     MessageChannel (`pedirRearme`), uma tarefa que não é de timer e zera o
//     nível de aninhamento. Assim o prazo nunca entra numa cadeia de 5 ou
//     mais `setTimeout` aninhados, que o Chrome limita a 1 por minuto com a
//     aba oculta há mais de 5 min (intensive throttling); um `setTimeout`
//     fora de cadeia é conferido 1 vez por segundo;
//   - tick visível: o `setTimeout` encadeado de 1 Hz, só com a aba visível
//     e algo correndo. Com a aba oculta, a cadeia para; na volta, o
//     `visibilitychange` a religa com um passo já (e o store pede um
//     get_state, que fecha o que venceu no meio-tempo);
//   - virada de minuto com a aba oculta: um `setTimeout` até a próxima
//     mudança dos minutos da sessão (`proximaViradaDeMinuto`, + 50 ms), que
//     dá um passo no motor (o `tt://tick` leva o restante novo) e se rearma
//     pelo mesmo caminho do prazo. A cada minuto novo de uma fase sai uma
//     vez (deduplicado por `fase.id` e minuto) o `tt-web://virada`, que o
//     título da aba (W17) escuta. Essa cadeia pode cair no limite de 1 por
//     minuto, e isso basta para um título em minutos; o prazo não depende
//     dela.
// - Retomada (W09): o `tomatito:estado` (estado.js) é gravado inteiro a cada
//   transição (os efeitos `state`, `timers` e `stopwatch`, os mesmos que
//   gravam o state.json no desktop), nunca a cada tick. Ao criar o motor, o
//   `restaurar` do wasm o lê e roda o `Engine::restaurar` (M40): o que
//   venceu com a aba fechada é fechado ali, com a regra do atraso (mais de
//   60 s: sem som e um aviso "concluída às …"), e os efeitos vão aos donos
//   (o período ao IndexedDB) antes do primeiro comando. Depois, uma
//   gravação completa, como o `save_all` do desktop ao abrir.
// - Pânico (3.3): o `set_hook` do Rust já escreveu a mensagem no console; o
//   `RuntimeError` do wasm faz o motor parar (nenhuma chamada nem gravação
//   depois) e recarregar a página, ou, se o pânico se repetir logo depois da
//   recarga, mostrar o aviso (panico.js).
import init, { Motor } from './pkg/tomatito_wasm.js';
import { emitir } from './barramento.js';
import * as configuracoes from './configuracoes.js';
import * as estadoGravado from './estado.js';
import { MARCA, decidir, mostrarAviso } from './panico.js';
import { criarDeduplicador, idDaFase, minutosNoTitulo, proximaViradaDeMinuto, proximoPrazo } from './prazo.js';

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

/** A virada de minuto com a aba oculta (W11), para o título da aba (W17). */
export const EVENTO_VIRADA = 'tt-web://virada';

/** A folga depois da virada de minuto (o `setTimeout` não dispara antes do atraso pedido). */
export const FOLGA_DA_VIRADA_MS = 50;

/**
 * A folga depois do prazo. O `setTimeout` mede o atraso num relógio
 * monotônico e o motor lê o `Date.now`; alguns ms de diferença fariam o passo
 * chegar antes do prazo e só fechar a fase no rearme seguinte.
 */
export const FOLGA_DO_PRAZO_MS = 15;

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
let temporizadorDoPrazo = null;
let temporizadorDaVirada = null;
let rearmePendente = false;
let canal = null;
const viradas = criarDeduplicador();

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
    retomar();
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
  if (resposta.efeitos?.some((e) => GRAVAM.has(e.tipo))) gravarEstado();
  armarTick();
  pedirRearme();
  return resposta.resultado;
}

// ---------------------------------------------------------------------------
// Retomada (W09).
// ---------------------------------------------------------------------------

/** Os efeitos que regravam o `tomatito:estado` (as transições). */
const GRAVAM = new Set(['state', 'timers', 'stopwatch']);

/** Uma vez, ao criar o motor (depois do `configurar`). */
function retomar() {
  const texto = estadoGravado.ler();
  let carga;
  try {
    carga = chamar((m) => m.restaurar(texto));
  } catch (erro) {
    if (erro?.code !== 'panicked') console.error('[motor] retomada', erro);
    return;
  }
  for (const aviso of carga.avisos) console.warn(`[motor] ${aviso}`);
  if (carga.corrompido && texto !== null) estadoGravado.guardarCorrompido(texto);
  gravarEstado();
}

/**
 * Grava as três partes (o `save_all` do desktop), a partir do retrato atual.
 * Depois de um pânico, nada mais é gravado.
 */
function gravarEstado() {
  if (quebrado || !motor) return;
  let resposta;
  try {
    resposta = motor.gravavel();
  } catch (erro) {
    if (erro instanceof WebAssembly.RuntimeError) aoEntrarEmPanico(erro);
    else console.error('[motor] ao gravar o estado', erro);
    return;
  }
  // O retrato fecha o que venceu; o texto já é o de depois disso.
  distribuir(resposta.efeitos);
  estadoGravado.gravar(JSON.stringify(resposta.resultado));
}

function esvaziarDepoisDoErro() {
  try {
    distribuir(motor.tick().efeitos);
    armarTick();
    pedirRearme();
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
    // O prazo armado por um tick visível vinha de dentro da cadeia de 1 Hz;
    // rearmado aqui, fora de qualquer timer, e com a virada de minuto junto.
    rearmar();
    return;
  }
  clearTimeout(temporizadorDaVirada);
  temporizadorDaVirada = null;
  // Na volta, um passo já: fecha o que venceu e acerta a contagem.
  aoTick();
}

// ---------------------------------------------------------------------------
// Prazo único e virada de minuto (W11).
// ---------------------------------------------------------------------------

/**
 * Pede um rearme do prazo (e da virada) numa tarefa própria: a mensagem de
 * um MessageChannel, que não é de timer e zera o nível de aninhamento dos
 * `setTimeout` (o `chamar` roda dentro do tick, do prazo e da virada).
 * Vários pedidos antes da mensagem chegar viram um só.
 */
function pedirRearme() {
  if (rearmePendente || quebrado || !motor) return;
  rearmePendente = true;
  if (!canal) {
    canal = new MessageChannel();
    canal.port1.onmessage = () => {
      rearmePendente = false;
      rearmar();
    };
  }
  canal.port2.postMessage(null);
}

/**
 * Lê o retrato (o `estado` do wasm fecha o que venceu, e os efeitos vão aos
 * donos como numa chamada comum, mas sem pedir outro rearme) e arma o prazo
 * e, com a aba oculta, a virada de minuto. Chamado só pela mensagem do
 * `pedirRearme` e pelo `visibilitychange`.
 */
function rearmar() {
  if (quebrado || !motor) return;
  let resposta;
  try {
    resposta = motor.estado();
  } catch (erro) {
    if (erro instanceof WebAssembly.RuntimeError) aoEntrarEmPanico(erro);
    else console.error('[motor] ao rearmar o prazo', erro);
    return;
  }
  distribuir(resposta.efeitos);
  if (resposta.efeitos?.some((e) => GRAVAM.has(e.tipo))) gravarEstado();
  armarTick();
  const retrato = resposta.resultado;
  const agora = Date.now();
  const prazo = proximoPrazo(retrato);
  // O prazo.js e o Engine::proximo_prazo têm de concordar.
  if (prazo !== (resposta.proximoPrazo ?? null)) {
    console.warn('[motor] prazo diverge do motor', { prazoJs: prazo, motor: resposta.proximoPrazo });
  }
  clearTimeout(temporizadorDoPrazo);
  temporizadorDoPrazo = null;
  if (prazo !== null) {
    temporizadorDoPrazo = setTimeout(aoPrazo, Math.max(0, prazo - agora) + FOLGA_DO_PRAZO_MS);
  }
  clearTimeout(temporizadorDaVirada);
  temporizadorDaVirada = null;
  if (visivel()) return;
  const minutos = minutosNoTitulo(retrato, agora);
  if (minutos !== null && viradas.primeira(`${idDaFase(retrato)}:${minutos}`)) {
    emitir(EVENTO_VIRADA, { fase: idDaFase(retrato), minutos, at: agora });
  }
  const virada = proximaViradaDeMinuto(retrato, agora);
  if (virada !== null) {
    temporizadorDaVirada = setTimeout(aoVirar, Math.max(0, virada - agora) + FOLGA_DA_VIRADA_MS);
  }
}

function aoPrazo() {
  temporizadorDoPrazo = null;
  if (quebrado) return;
  try {
    // Fecha o que venceu; o chamar pede o rearme para o prazo seguinte.
    chamar((m) => m.tick());
  } catch (erro) {
    if (erro?.code !== 'panicked') console.error('[motor] prazo', erro);
  }
}

function aoVirar() {
  temporizadorDaVirada = null;
  if (quebrado || visivel()) return;
  try {
    // O passo leva o restante novo (tt://tick); o rearme emite a virada.
    chamar((m) => m.tick());
  } catch (erro) {
    if (erro?.code !== 'panicked') console.error('[motor] virada de minuto', erro);
  }
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
  for (const t of [proximoTick, temporizadorDoPrazo, temporizadorDaVirada]) clearTimeout(t);
  proximoTick = temporizadorDoPrazo = temporizadorDaVirada = null;
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
