// Os avisos da versão web (PLANO-WEB, 1.1 "Notificações" e 3.6; W13): o
// papel do notify.rs, com o `showNotification` do service worker (sw.js).
//
// - Textos: os do `i18n.rs`, que o wasm já manda prontos em cada efeito
//   (`notice` e `timerNotice`), no fuso do navegador. Nada de texto aqui.
// - Atraso: com a aba em segundo plano, o fim pode chegar alguns segundos
//   depois do prazo. De 10 s em diante (`ATRASO_COM_HORA_MS`), o título leva
//   "às HH:MM", a hora do prazo (`textoComAtraso`, do
//   `i18n::notice_com_atraso` e do `i18n::timer_ended` atrasado). Com mais de
//   60 s, o motor já manda o aviso atrasado, com a hora no próprio `texto`.
// - `tag`: 'tomatito:fase' para os fins de fase e 'tomatito:temporizador'
//   para os temporizadores; um aviso novo substitui o anterior da mesma
//   `tag`, e o `renotify` o faz alertar de novo.
// - `silent`: quando o som do app tocou (o `sound` que veio logo antes, no
//   mesmo passo do motor, resolvido pelo som.js), o aviso sai sem o som do
//   sistema. O `renotify` é o contrário do `silent` (os dois juntos lançam
//   TypeError).
// - Permissão: só com `Notification.permission === 'granted'`. O pedido é
//   do W14, e só por clique; aqui nunca se pede. Sem permissão, sem suporte
//   ou sem service worker, nada aparece e nada lança: fica anotado no
//   `historico`.
//
// `criarAvisos(deps)` recebe o navegador por injeção (o index.js passa o
// real), para o avisos.test.js rodar no Node.

/** A partir de quanto atraso o título leva a hora do prazo (PLANO-WEB, 3.6). */
export const ATRASO_COM_HORA_MS = 10_000;

/** Quanto o aviso espera o service worker ficar ativo. */
export const ESPERA_DO_SW_MS = 5_000;

export const TAG_DA_FASE = 'tomatito:fase';
export const TAG_DO_TEMPORIZADOR = 'tomatito:temporizador';

/**
 * Os últimos avisos (até 50), `{ tipo, dados, titulo, corpo, silent,
 * mostrado, motivo? }`, do mais antigo ao mais novo, para os casos
 * conferirem (o que o `semDono` do motor.js guardava antes deste marco).
 */
export const historico = [];
const LIMITE_DO_HISTORICO = 50;

function anotar(item) {
  historico.push(item);
  if (historico.length > LIMITE_DO_HISTORICO) historico.shift();
}

/**
 * O texto a mostrar, `{ title, body }`: o `textoComAtraso` quando o aviso
 * sai 10 s ou mais depois do prazo (o `prazo` do fim de fase, o `endedAt`
 * do temporizador); senão, o `texto`.
 */
export function escolherTexto(dados, agora) {
  const prazo = dados?.prazo ?? dados?.endedAt ?? null;
  if (dados?.textoComAtraso && Number.isFinite(prazo) && agora - prazo >= ATRASO_COM_HORA_MS) {
    return dados.textoComAtraso;
  }
  return dados.texto;
}

/** As opções do `showNotification`. */
export function opcoesDoAviso({ texto, tag, silent, timestamp }) {
  const opcoes = { tag, silent, renotify: !silent, lang: 'pt-BR' };
  if (texto.body) opcoes.body = texto.body;
  if (Number.isFinite(timestamp)) opcoes.timestamp = timestamp;
  return opcoes;
}

/**
 * @param {object} deps
 * @param {() => string} deps.permissao o `Notification.permission` ('sem suporte' sem a API)
 * @param {() => Promise<ServiceWorkerRegistration | null>} deps.registro o registro ativo, ou null
 * @param {() => number} [deps.agora]
 */
export function criarAvisos({ permissao, registro, agora = () => Date.now() }) {
  /**
   * Mostra um aviso. `som` é o que o `som.tocar` devolveu para o `sound` do
   * mesmo passo (uma promise de "tocou"), ou null. Resolve com `true` se o
   * aviso foi entregue ao navegador. Nunca rejeita.
   */
  async function mostrar(tipo, dados, tag, som) {
    // O atraso é medido na hora do efeito, antes de qualquer espera.
    const texto = escolherTexto(dados, agora());
    const item = { tipo, dados, titulo: texto.title, corpo: texto.body ?? null, silent: false, mostrado: false };
    anotar(item);
    try {
      const p = permissao();
      if (p !== 'granted') return nao(item, `permissão: ${p}`);
      item.silent = await tocou(som);
      const reg = await registro();
      if (!reg) return nao(item, 'sem service worker ativo');
      const timestamp = dados.prazo ?? dados.endedAt;
      await reg.showNotification(texto.title, opcoesDoAviso({ texto, tag, silent: item.silent, timestamp }));
      item.mostrado = true;
      return true;
    } catch (erro) {
      console.warn(`[avisos] ${tipo} não apareceu`, erro);
      return nao(item, String(erro?.message ?? erro));
    }
  }

  async function tocou(som) {
    if (!som) return false;
    try {
      return (await som) === true;
    } catch {
      return false;
    }
  }

  function nao(item, motivo) {
    item.motivo = motivo;
    console.info(`[avisos] "${item.titulo}" não apareceu: ${motivo}`);
    return false;
  }

  return {
    /** O efeito `notice` do motor (fim de fase ou de sessão). */
    fase: (dados, som = null) => mostrar('notice', dados, TAG_DA_FASE, som),
    /** O efeito `timerNotice` do motor. */
    temporizador: (dados, som = null) => mostrar('timerNotice', dados, TAG_DO_TEMPORIZADOR, som),
  };
}

/**
 * Registra o sw.js da raiz do site (`base` é o `import.meta.env.BASE_URL`).
 * Resolve com o registro, ou null sem suporte ou com erro (que vira log).
 */
export async function registrarServiceWorker(base, navegador = globalThis.navigator) {
  if (!navegador?.serviceWorker) return null;
  try {
    return await navegador.serviceWorker.register(`${base}sw.js`, { scope: base });
  } catch (erro) {
    console.warn('[avisos] o service worker não registrou', erro);
    return null;
  }
}

/**
 * O registro ativo, esperando até `ms` pelo `serviceWorker.ready`; null sem
 * suporte ou se ele não ficar ativo a tempo.
 */
export function registroAtivo(ms = ESPERA_DO_SW_MS, navegador = globalThis.navigator) {
  if (!navegador?.serviceWorker) return Promise.resolve(null);
  return new Promise((resolver) => {
    const t = setTimeout(() => resolver(null), ms);
    navegador.serviceWorker.ready.then((reg) => {
      clearTimeout(t);
      resolver(reg);
    });
  });
}
