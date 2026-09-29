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
import * as ipcDoApp from './ipc.js';

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
 * Escreve o texto numa região viva como um parágrafo novo, e não como texto
 * solto (M43): o WebKitGTK 2.52 não avisa o leitor de tela quando só o texto
 * de um elemento muda (nenhum text-changed nem children-changed chega ao
 * Orca, e a troca de fase ficava muda); um filho novo gera o
 * children-changed:add que o Orca apresenta como mensagem da região. A região
 * não leva role="status": o Orca 50 não entrega os eventos de uma "status
 * bar" ao script da web, que é quem lê regiões vivas (script_manager.py).
 * Texto vazio esvazia a região. Sem documento (os testes), fica o texto.
 */
export function escreverNaRegiao(regiao, texto) {
  const doc = regiao.ownerDocument;
  if (!texto || !doc?.createElement) {
    regiao.textContent = texto ?? '';
    return;
  }
  const p = doc.createElement('p');
  p.textContent = texto;
  regiao.replaceChildren(p);
}

/**
 * O anúncio pelo lado nativo (M43; src-tauri/src/anuncio.rs): no Linux, pede
 * ao Rust que emita o `announcement` do ATK da janela, que é o que o Orca lê;
 * no Windows, não faz nada (a região aria-live do WebView2 fala com o
 * Narrador). `fase: true` só no anúncio das fases (ligarAnuncioDeFases): a
 * `main` e a `tomato` o repetem, e o Rust fica com o da janela da frente; os
 * demais (as voltas copiadas, M43) valem de qualquer janela. Devolve a
 * promessa do invoke, ou null.
 */
export function anunciarNativo(texto, { doc = globalThis.document, ipc = ipcDoApp, fase = false } = {}) {
  if (!texto || doc?.documentElement?.dataset?.platform !== 'linux' || !ipc?.anunciarAoLeitor) return null;
  return ipc.anunciarAoLeitor(texto, { fase }).catch((erro) => console.warn('[anúncio]', erro));
}

/**
 * O anunciador sobre a região `regiao`. `anunciar(texto)` esvazia a região e
 * escreve o texto um instante depois (`agendar`, um setTimeout): um texto
 * igual ao anterior (duas sessões seguidas) também é lido. `fase(evento)`
 * anuncia um `tt://phase`, uma vez por `seq` (um evento repetido não fala
 * duas vezes).
 */
export function criarAnunciador(regiao, { agendar = (cb) => setTimeout(cb, 100), cancelar = clearTimeout, nativo = null } = {}) {
  let pendente = null;
  let ultimoSeq = null;
  const anunciar = (texto) => {
    if (!regiao || !texto) return;
    if (pendente !== null) cancelar(pendente);
    regiao.textContent = '';
    pendente = agendar(() => {
      pendente = null;
      escreverNaRegiao(regiao, texto);
      // M43: no Linux, o mesmo texto pelo ATK da janela, que é o que o Orca
      // lê (o WebKitGTK não lhe entrega a região viva; anuncio.rs).
      nativo?.(texto);
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
  const anunciador = criarAnunciador(doc?.querySelector('[data-anuncio]'), {
    nativo: (texto) => anunciarNativo(texto, { doc, ipc, fase: true }),
  });
  await ipc.ouvir(ipc.EVENTOS.fase, (e) => anunciador.fase(e));
  return anunciador;
}
