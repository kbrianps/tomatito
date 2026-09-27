// Anúncio das fases para leitores de tela (PLANO.md, 3.8; M19): uma única
// região `aria-live="polite"`, escondida (a do index.html, .tt-anuncio), que
// recebe um texto a cada troca de fase e nada mais. O número que muda a cada
// segundo e o rótulo do mostrador (uma vez por minuto) ficam fora dela.
//
// O texto sai do `tt://phase` (src-tauri/src/events.rs, PhaseEventDto), que
// leva a fase que começou e quantas fases do mesmo tipo a sessão tem: o
// anúncio não depende da ordem em que o `tt://state` e o `tt://phase` chegam.
// Pausar e retomar não trocam de fase e não são anunciados (o botão de
// destaque já muda de rótulo).
import t from './i18n/pt-BR.js';

const f = t.foco.fases;

/**
 * O texto do anúncio de um `tt://phase`, ou null se não há o que dizer.
 *   - começou uma fase (início, fim da anterior ou pulo): "Começou o período
 *     de foco 2 de 2." / "Começou o intervalo 1 de 1.";
 *   - a última fase venceu ou foi pulada: "Sessão de foco concluída.";
 *   - "Encerrar sessão": "Sessão de foco encerrada.".
 */
export function textoDaFase(evento) {
  if (!evento) return null;
  if (evento.status === 'completed') return f.concluida;
  if (evento.status === 'idle') return evento.cause === 'stopped' ? f.encerrada : null;
  const fase = evento.phase;
  if (!fase || !f.comecou[fase.kind]) return null;
  return f.comecou[fase.kind](fase.n, evento.of ?? fase.n);
}

/**
 * O anunciador sobre a região `regiao`. `anunciar(texto)` esvazia a região e
 * escreve o texto um instante depois (`agendar`, um setTimeout): um texto
 * igual ao anterior (duas sessões seguidas) também é lido. `fase(evento)`
 * anuncia um `tt://phase`, uma vez por `seq` (um evento repetido não fala
 * duas vezes).
 */
export function criarAnunciador(regiao, { agendar = (cb) => setTimeout(cb, 100), cancelar = clearTimeout } = {}) {
  let pendente = null;
  let ultimoSeq = null;
  const anunciar = (texto) => {
    if (!regiao || !texto) return;
    if (pendente !== null) cancelar(pendente);
    regiao.textContent = '';
    pendente = agendar(() => {
      pendente = null;
      regiao.textContent = texto;
    });
  };
  return {
    anunciar,
    fase(evento) {
      if (evento?.seq && evento.seq === ultimoSeq) return;
      ultimoSeq = evento?.seq || null;
      anunciar(textoDaFase(evento));
    },
  };
}

/**
 * Liga o anúncio das fases: ouve o `tt://phase` pelo `ipc` (lib/ipc.js) e
 * escreve na região `.tt-anuncio` do documento. Devolve o anunciador.
 */
export async function ligarAnuncioDeFases({ ipc, doc = globalThis.document } = {}) {
  const anunciador = criarAnunciador(doc?.querySelector('[data-anuncio]'));
  await ipc.ouvir(ipc.EVENTOS.fase, (e) => anunciador.fase(e));
  return anunciador;
}
