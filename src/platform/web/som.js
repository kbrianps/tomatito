// O som da versão web (PLANO-WEB, 1.1 "Som" e 3.6; W12): o papel do
// audio.rs, com Web Audio e os mesmos WAVs (src-tauri/sounds).
//
// - Carga: `carregar()` busca e decodifica os dois WAVs uma vez (`fetch` e
//   `decodeAudioData`, num contexto offline, que não depende de gesto).
// - O `AudioContext` nasce no primeiro gesto que deixa algo correndo
//   (Iniciar, Retomar, Pular, iniciar temporizador, Testar: `despertar()`,
//   chamado pelo index.js na hora do comando) e, a cada um desses gestos,
//   leva um `resume()` se não estiver `running`.
// - Parado (`!correndo()`: nenhuma fase correndo e nenhum temporizador rumo
//   ao zero) por 30 s: `suspend()`. `revisar()` roda a cada transição do
//   motor (tt://state e tt://timers) e depois de cada gesto.
// - Fim de fase ou de temporizador (`tocar(som)`, o efeito `sound` do
//   motor): com o contexto `suspended`, tenta um `resume()` (vale depois da
//   ativação da página); se ele não ficar `running` em pouco tempo (sem gesto
//   nenhum desde a carga, ou o `interrupted` do Chrome 136+), não toca: fica
//   só a notificação (W13). Sem contexto ainda (uma retomada sem gesto), cria
//   um e tenta o mesmo.
// - Volume: um `GainNode` por som, com `gain = volume / 100` (linear, como o
//   `Pedido::ganho` do audio.rs), lido das configurações na hora de tocar.
// - Fila: como a thread `tomatito-som`, um som por vez, cada um segurando a
//   saída por 1,5 s (`SEGURAR`); o "Testar" sem som escolhido toca os dois,
//   um depois do outro.
// - Erro nunca derruba o app: vira log.
//
// `criarSom(deps)` recebe o navegador por injeção (o index.js passa o real),
// para o som.test.js rodar no Node com um AudioContext de mentira.

/** Quanto tempo parado antes do `suspend()` (3.6). */
export const SUSPENDER_DEPOIS_MS = 30_000;

/** Quanto o fim de fase espera o `resume()` antes de desistir do som. */
export const ESPERA_DO_RESUME_MS = 500;

/** O `SEGURAR` do audio.rs: o intervalo entre o começo de um som e o do seguinte, em s. */
export const SEGURAR_S = 1.5;

/** Os sons que o motor e o `sound_test` pedem. */
export const SONS = Object.freeze(['focusEnd', 'breakEnd']);

/** O ganho linear de um volume de 0 a 100 (o `Pedido::ganho` do audio.rs). */
export function ganho(volume) {
  const v = Number(volume);
  if (!Number.isFinite(v)) return 1;
  return Math.min(100, Math.max(0, Math.round(v))) / 100;
}

/**
 * O que aconteceu com os últimos pedidos de som (até 50), `{ som, origem,
 * tocou, motivo? }`, do mais antigo ao mais novo: o registro que o `semDono`
 * do motor.js guardava antes deste marco, para os casos conferirem.
 */
export const historico = [];
const LIMITE_DO_HISTORICO = 50;

function anotar(item) {
  historico.push(item);
  if (historico.length > LIMITE_DO_HISTORICO) historico.shift();
}

/**
 * @param {object} deps
 * @param {{ focusEnd: string, breakEnd: string }} deps.urls os WAVs publicados
 * @param {() => AudioContext} deps.novoContexto
 * @param {(url: string) => Promise<AudioBuffer>} deps.decodificar busca e decodifica
 * @param {() => boolean} deps.correndo o `estaCorrendo()` do motor
 * @param {() => number} deps.volume o `volume` das configurações (0 a 100)
 * @param {typeof setTimeout} [deps.agendar]
 * @param {typeof clearTimeout} [deps.cancelar]
 */
export function criarSom({
  urls,
  novoContexto,
  decodificar,
  correndo,
  volume,
  agendar = (f, ms) => setTimeout(f, ms),
  cancelar = (t) => clearTimeout(t),
}) {
  let ctx = null;
  let carga = null;
  let suspensao = null;
  let livreEm = 0;

  function carregar() {
    carga ??= Promise.all(
      SONS.map((som) =>
        decodificar(urls[som]).catch((erro) => {
          console.error(`[som] não foi possível carregar ${som}`, erro);
          return null;
        }),
      ),
    ).then((buffers) => Object.fromEntries(SONS.map((som, i) => [som, buffers[i]])));
    return carga;
  }

  function contexto() {
    if (ctx) return ctx;
    try {
      ctx = novoContexto();
    } catch (erro) {
      console.error('[som] sem AudioContext', erro);
      ctx = null;
    }
    return ctx;
  }

  function retomarContexto(c) {
    return c.resume().catch((erro) => console.warn('[som] resume recusado', erro));
  }

  /** Gesto que deixa algo correndo: cria ou retoma o contexto. */
  function despertar() {
    const c = contexto();
    if (c && c.state !== 'running' && c.state !== 'closed') retomarContexto(c);
    carregar();
    revisar();
  }

  /** Suspende o contexto depois de 30 s parado; cancela se algo voltar a correr. */
  function revisar() {
    let corre = false;
    try {
      corre = correndo();
    } catch (erro) {
      console.error('[som] ao ler se o motor corre', erro);
    }
    if (corre) {
      if (suspensao !== null) cancelar(suspensao);
      suspensao = null;
      return;
    }
    if (suspensao !== null || !ctx || ctx.state === 'suspended' || ctx.state === 'closed') return;
    suspensao = agendar(() => {
      suspensao = null;
      let aindaParado = true;
      try {
        aindaParado = !correndo();
      } catch {
        // Na dúvida, suspende: o próximo gesto retoma.
      }
      if (aindaParado && ctx && ctx.state === 'running') {
        ctx.suspend().catch((erro) => console.warn('[som] suspend recusado', erro));
      }
    }, SUSPENDER_DEPOIS_MS);
  }

  /** Espera o `resume()` até `ms`; resolve com o estado depois disso. */
  function esperarRetomada(c, ms) {
    return new Promise((resolver) => {
      let feito = false;
      const fim = (v) => {
        if (feito) return;
        feito = true;
        resolver(v);
      };
      const t = agendar(() => fim(c.state), ms);
      retomarContexto(c).then(() => {
        cancelar(t);
        fim(c.state);
      });
    });
  }

  /**
   * Toca `som` ('focusEnd' ou 'breakEnd') com o volume atual. `origem` é só
   * para o histórico ('motor' ou 'teste'). Resolve com `true` se tocou.
   */
  async function tocar(som, origem = 'motor') {
    const registro = { som, origem, tocou: false };
    try {
      if (!SONS.includes(som)) throw new Error(`som desconhecido: ${som}`);
      const c = contexto();
      if (!c) return registrar(registro, 'sem AudioContext');
      if (c.state !== 'running') {
        const estado = await esperarRetomada(c, ESPERA_DO_RESUME_MS);
        if (estado !== 'running') return registrar(registro, `contexto ${estado}`);
      }
      const buffer = (await carregar())[som];
      if (!buffer) return registrar(registro, 'WAV não carregado');
      const fonte = c.createBufferSource();
      fonte.buffer = buffer;
      const g = c.createGain();
      g.gain.value = ganho(volume());
      fonte.connect(g);
      g.connect(c.destination);
      const quando = Math.max(c.currentTime, livreEm);
      livreEm = quando + Math.max(SEGURAR_S, buffer.duration ?? 0);
      fonte.start(quando);
      registro.tocou = true;
      anotar(registro);
      return true;
    } catch (erro) {
      console.error(`[som] ${som}`, erro);
      return registrar(registro, String(erro?.message ?? erro));
    } finally {
      revisar();
    }
  }

  function registrar(registro, motivo) {
    registro.motivo = motivo;
    anotar(registro);
    console.info(`[som] ${registro.som} não tocou: ${motivo}`);
    return false;
  }

  /** O `sound_test{sound?}`: sem `sound`, os dois, um depois do outro. */
  function testar(sound) {
    despertar();
    const sons = sound === undefined || sound === null ? SONS : [sound];
    for (const s of sons) {
      if (!SONS.includes(s)) throw { code: 'invalidArgs', message: `som desconhecido: ${s}` };
    }
    for (const s of sons) tocar(s, 'teste');
    return null;
  }

  return { carregar, despertar, revisar, tocar, testar, contexto: () => ctx };
}
