// O estado do foco no JS (PLANO.md, 3.1 e 3.2). Quem manda é o Rust: o store
// só guarda o último retrato (`tt://state`, `get_state` e a resposta dos
// comandos) e corrige a contagem com o `tt://tick`.
//
// Entre dois ticks, o restante é estimado pelo relógio de parede do JS:
// `restante = restante do último retrato ou tick − (agora − quando chegou) ×
// velocidade`. Com o relógio de parede (Date.now), um minimizar ou uma
// suspensão já saem descontados na primeira leitura, mesmo antes da
// ressincronização; a velocidade é a do `TOMATITO_SPEED` (1 fora do debug).
//
// Ressincroniza (get_state) ao abrir, no `visibilitychange` e quando a janela
// ganha foco: o WebView escondido pode ter perdido eventos ou ter sido
// recarregado.
//
// Os retratos levam `seq` (events.rs): um retrato mais velho que o atual é
// descartado, e um tick de uma transição que o JS não viu pede um get_state.
//
// M32: o store guarda também o retrato dos temporizadores (`tt://timers`, o
// `timers` do get_state e a resposta dos comandos `timer_*`), com o `seq`
// próprio. O restante de cada um que corre é estimado do mesmo jeito, e segue
// negativo depois do zero (o Rust não manda tick de temporizador).
//
// M34: e o retrato do cronômetro (`tt://stopwatch`, o `stopwatch` do
// get_state e a resposta dos comandos `stopwatch_*`), também com `seq`
// próprio. Correndo, o decorrido sai do próprio retrato: `accumulatedMs +
// (Date.now() − startedAt)`, o mesmo relógio de parede do Rust, sem
// estimativa nem tick, e por isso não desvia nem perde tempo com a janela
// escondida. Com o relógio acelerado (`TOMATITO_SPEED`, só no debug), o
// relógio do Rust não é o do JS, e o decorrido é estimado como o dos
// temporizadores.
//
// M38: e a última cópia das configurações (o `settings` do get_state, o
// `tt://settings` e a resposta do `settings_set`), sem `seq`: cada uma é o
// arquivo inteiro, e o Rust as emite na ordem das gravações. O F e o B delas
// entram no preparo, para a frase dos intervalos mudar assim que o período ou
// o intervalo mudam nas Configurações.

import * as ipc from './ipc.js';

/** Estados em que uma fase corre e a contagem anda. */
export const CORRENDO = Object.freeze(['focus', 'break']);

/**
 * M17: o preparo de uma sessão (o `setup` do get_state, events.rs): a faixa e
 * o passo do seletor de minutos e o F e o B da regra dos intervalos. Até o
 * primeiro get_state responder, valem os números do build de produção.
 */
export const PREPARO_PADRAO = Object.freeze({
  minMinutes: 5,
  maxMinutes: 240,
  stepMinutes: 5,
  focusMinutes: 25,
  breakMinutes: 5,
});

/**
 * Cria o store. `ipc` precisa de `obterEstado()` e `ouvir(evento, cb)`, e
 * `foco.*` para os comandos (o lib/ipc.js; os testes passam um falso).
 * `agora` é o relógio de parede em ms.
 */
export function criarStore({ ipc, eventos, agora = () => Date.now() }) {
  let foco = null;
  let velocidade = 1;
  let preparo = PREPARO_PADRAO;
  // Base da estimativa: { restanteMs, em } com uma fase correndo; senão null.
  let base = null;
  let pedido = null;
  const ouvintes = new Set();
  // M32: os temporizadores e a base da estimativa de cada um que corre.
  let temporizadores = null;
  const basesDosTemporizadores = new Map();
  const ouvintesDosTemporizadores = new Set();
  // M34: o cronômetro e a base da estimativa (só usada no relógio acelerado).
  let cronometro = null;
  let baseDoCronometro = null;
  const ouvintesDoCronometro = new Set();
  // M38: as configurações.
  let configuracoes = null;
  const ouvintesDasConfiguracoes = new Set();

  function aplicarConfiguracoes(dto) {
    if (!dto || typeof dto !== 'object' || Array.isArray(dto)) return false;
    configuracoes = dto;
    const f = dto.focusMinutes;
    const b = dto.breakMinutes;
    if (Number.isInteger(f) && f > 0 && Number.isInteger(b) && b > 0) {
      preparo = Object.freeze({ ...preparo, focusMinutes: f, breakMinutes: b });
    }
    for (const cb of ouvintesDasConfiguracoes) cb(configuracoes);
    return true;
  }

  function aplicarCronometro(dto) {
    if (!dto || typeof dto.status !== 'string' || (cronometro && dto.seq < cronometro.seq)) return false;
    cronometro = dto;
    baseDoCronometro = dto.status === 'running' ? { decorridoMs: dto.elapsedMs, em: agora() } : null;
    for (const f of ouvintesDoCronometro) f(cronometro);
    return true;
  }

  function aplicarTemporizadores(dto) {
    if (!dto || !Array.isArray(dto.timers) || (temporizadores && dto.seq < temporizadores.seq)) return false;
    temporizadores = dto;
    const em = agora();
    basesDosTemporizadores.clear();
    for (const t of dto.timers) {
      if (t.status === 'running') basesDosTemporizadores.set(t.id, { restanteMs: t.remainingMs, em });
    }
    for (const f of ouvintesDosTemporizadores) f(temporizadores);
    return true;
  }

  function aplicarFoco(dto) {
    if (!dto || (foco && dto.seq < foco.seq)) return false;
    foco = dto;
    const s = dto.session;
    base = s && s.endsAt != null ? { restanteMs: s.remainingMs, em: agora() } : null;
    for (const f of ouvintes) f(foco);
    return true;
  }

  function aplicarTick(t) {
    if (!foco || t.seq < foco.seq) return;
    const s = foco.session;
    const mesmaFase = s && s.endsAt != null && s.id === t.sessionId && s.phaseIndex === t.phaseIndex;
    if (t.seq > foco.seq || !mesmaFase) {
      void sincronizar();
      return;
    }
    base = { restanteMs: t.remainingMs, em: agora() };
  }

  /** get_state. Chamadas seguidas dividem o mesmo pedido. */
  function sincronizar() {
    pedido ??= Promise.resolve(ipc.obterEstado())
      .then((estado) => {
        if (Number.isFinite(estado?.speed) && estado.speed > 0) velocidade = estado.speed;
        if (preparoValido(estado?.setup)) preparo = Object.freeze({ ...estado.setup });
        aplicarConfiguracoes(estado?.settings);
        aplicarFoco(estado?.focus);
        aplicarTemporizadores(estado?.timers);
        aplicarCronometro(estado?.stopwatch);
      })
      .finally(() => {
        pedido = null;
      });
    return pedido;
  }

  const store = {
    get foco() {
      return foco;
    },
    get velocidade() {
      return velocidade;
    },
    /** O preparo de uma sessão nova (PREPARO_PADRAO até o get_state). */
    get preparo() {
      return preparo;
    },
    /** Se uma fase corre (a contagem anda). */
    get correndo() {
      return base !== null;
    },
    /** O restante da fase atual em ms, agora; null sem sessão. */
    restanteMs() {
      if (!foco?.session) return null;
      if (!base) return foco.session.remainingMs;
      return Math.max(0, base.restanteMs - Math.max(0, agora() - base.em) * velocidade);
    },
    /** `cb(foco)` a cada retrato novo. Devolve a função que desliga. */
    assinar(cb) {
      ouvintes.add(cb);
      return () => ouvintes.delete(cb);
    },
    /** M32: o último retrato dos temporizadores (null até o get_state). */
    get temporizadores() {
      return temporizadores;
    },
    /**
     * M32: o restante do temporizador `id` em ms, agora; negativo depois do
     * zero. Null se não existe.
     */
    restanteDoTemporizador(id) {
      const t = temporizadores?.timers.find((x) => x.id === id);
      if (!t) return null;
      const b = basesDosTemporizadores.get(id);
      if (!b) return t.remainingMs;
      return Math.min(t.durationMs, b.restanteMs - Math.max(0, agora() - b.em) * velocidade);
    },
    /** M32: `cb(retrato)` a cada retrato novo dos temporizadores. */
    assinarTemporizadores(cb) {
      ouvintesDosTemporizadores.add(cb);
      return () => ouvintesDosTemporizadores.delete(cb);
    },
    /**
     * M32: um comando dos temporizadores (`iniciar`, `pausar`, `redefinir`,
     * `criar`, `editar`, `excluir`, do `ipc.temporizadores`): aplica o
     * retrato da resposta. Recusado, pede um get_state e rejeita com o erro.
     */
    async comandoDoTemporizador(nome, ...args) {
      try {
        aplicarTemporizadores(await ipc.temporizadores[nome](...args));
      } catch (erro) {
        void sincronizar();
        throw erro;
      }
    },
    /** M34: o último retrato do cronômetro (null até o get_state). */
    get cronometro() {
      return cronometro;
    },
    /**
     * M34: o decorrido do cronômetro em ms, agora; null sem retrato. Nunca
     * menos que o decorrido do retrato.
     */
    decorridoDoCronometro() {
      if (!cronometro) return null;
      if (cronometro.status !== 'running') return cronometro.elapsedMs;
      if (velocidade === 1 && Number.isFinite(cronometro.startedAt)) {
        return Math.max(cronometro.elapsedMs, cronometro.accumulatedMs + Math.max(0, agora() - cronometro.startedAt));
      }
      return cronometro.elapsedMs + Math.max(0, agora() - baseDoCronometro.em) * velocidade;
    },
    /** M34: `cb(retrato)` a cada retrato novo do cronômetro. */
    assinarCronometro(cb) {
      ouvintesDoCronometro.add(cb);
      return () => ouvintesDoCronometro.delete(cb);
    },
    /**
     * M34: um comando do cronômetro (`iniciar`, `pausar`, `volta`,
     * `redefinir`, do `ipc.cronometro`): aplica o retrato da resposta.
     * Recusado, pede um get_state e rejeita com o erro.
     */
    async comandoDoCronometro(nome) {
      try {
        aplicarCronometro(await ipc.cronometro[nome]());
      } catch (erro) {
        void sincronizar();
        throw erro;
      }
    },
    /** M38: a última cópia das configurações (null até o get_state). */
    get configuracoes() {
      return configuracoes;
    },
    /** M38: `cb(configuracoes)` a cada cópia nova. */
    assinarConfiguracoes(cb) {
      ouvintesDasConfiguracoes.add(cb);
      return () => ouvintesDasConfiguracoes.delete(cb);
    },
    /**
     * M38: grava um patch pelo `settings_set` e aplica a resposta (as
     * configurações inteiras). Recusado, rejeita com o erro do Rust, e nada
     * muda aqui.
     */
    async gravarConfiguracoes(patch) {
      const novas = await ipc.configuracoes.gravar(patch);
      aplicarConfiguracoes(novas);
      return novas;
    },
    aplicarConfiguracoes,
    aplicarCronometro,
    aplicarTemporizadores,
    aplicarFoco,
    aplicarTick,
    sincronizar,
    /**
     * Um comando do foco (`iniciar`, `pausar`, `retomar`, `pular`, `parar`):
     * aplica o retrato da resposta. Um comando recusado (o estado mudou por
     * outro caminho) pede um get_state e rejeita com o erro do Rust.
     */
    async comando(nome, ...args) {
      try {
        aplicarFoco(await ipc.foco[nome](...args));
      } catch (erro) {
        void sincronizar();
        throw erro;
      }
    },
    /**
     * Ouve os eventos e as mudanças de visibilidade e foco da janela, e faz
     * o primeiro get_state.
     */
    async ligar({ doc = globalThis.document, janela = globalThis.window } = {}) {
      await Promise.all([
        ipc.ouvir(eventos.estado, aplicarFoco),
        ipc.ouvir(eventos.tick, aplicarTick),
        eventos.temporizadores && ipc.ouvir(eventos.temporizadores, aplicarTemporizadores),
        eventos.cronometro && ipc.ouvir(eventos.cronometro, aplicarCronometro),
        eventos.configuracoes && ipc.ouvir(eventos.configuracoes, aplicarConfiguracoes),
      ]);
      doc?.addEventListener('visibilitychange', () => {
        if (doc.visibilityState === 'visible') void sincronizar();
      });
      janela?.addEventListener('focus', () => void sincronizar());
      await sincronizar();
    },
  };
  return store;
}

/** Um `setup` coerente: inteiros positivos, mínimo ≤ máximo e B ≥ 1. */
function preparoValido(p) {
  if (!p) return false;
  const campos = ['minMinutes', 'maxMinutes', 'stepMinutes', 'focusMinutes', 'breakMinutes'];
  return campos.every((c) => Number.isInteger(p[c]) && p[c] > 0) && p.minMinutes <= p.maxMinutes;
}

// O store do app, ligado ao Rust pelo lib/ipc.js. O main.js chama `ligar()`
// no boot; as telas só leem e assinam.
export const store = criarStore({ ipc, eventos: ipc.EVENTOS });
