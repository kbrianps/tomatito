// O título da aba (PLANO-WEB-V1, W17): o tempo da sessão, como a bandeja do
// desktop (tray.rs), no `document.title`. O favicon com o progresso ficou
// para depois (PLANO-WEB-V1, 2).
//
// - A contagem (fase e restante) segue o barramento: o `tt://state` (o
//   `Contagem::do_foco`), o `tt://tick` (o `Contagem::do_tick`) e, com a aba
//   oculta, o `tt-web://virada` do motor.js (W11), que sai uma vez a cada
//   minuto novo da fase sem o tick de 1 Hz. Na carga, o retrato do motor já
//   retomado (W09) a completa.
// - O texto do tempo é o `i18n::tray_time` do motor, pelo `tempoNaAba` do
//   wasm; a montagem é do titulo.js. O `document.title` só é escrito quando
//   muda (uma vez por minuto, e nas transições).
// - A chave `tomatito:web.tempoNaAba` (titulo.js, `CHAVE`) desliga o tempo:
//   fica só "Tomatito". `definirTempoNaAba` a grava (o cartão das
//   Configurações, W18); uma mudança feita em outra aba chega pelo `storage`.
import { listen } from './barramento.js';
import * as motor from './motor.js';
import { EVENTO_VIRADA } from './motor.js';
import { tempoNaAba } from './pkg/tomatito_wasm.js';
import { CHAVE, SEM_SESSAO, contagemDoFoco, contagemDoTick, gravarLigado, ligado, titulo } from './titulo.js';

const armazenamento = () => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

let contagem = SEM_SESSAO;
let ligadoAqui = ligado(armazenamento());
let wasmPronto = false;

/** Reescreve o título, se mudou. */
function aplicar() {
  const doc = globalThis.document;
  if (!doc) return;
  const novo = titulo(contagem, ligadoAqui, wasmPronto ? tempoNaAba : null);
  if (doc.title !== novo) doc.title = novo;
}

listen('tt://state', ({ payload }) => {
  contagem = contagemDoFoco(payload);
  aplicar();
});
listen('tt://tick', ({ payload }) => {
  contagem = contagemDoTick(payload);
  aplicar();
});
listen(EVENTO_VIRADA, ({ payload }) => {
  // O passo da virada já mandou o tt://tick; a virada garante os minutos
  // dela mesmo que um tick tenha sido perdido.
  if (contagem.fase && Number.isFinite(payload?.minutos)) {
    const restanteMs = payload.minutos * 60_000;
    if (Math.ceil(contagem.restanteMs / 60_000) !== payload.minutos) contagem = { ...contagem, restanteMs };
  }
  aplicar();
});

globalThis.addEventListener?.('storage', (e) => {
  if (e.key !== CHAVE && e.key !== null) return;
  ligadoAqui = ligado(armazenamento());
  aplicar();
});

motor
  .iniciar()
  .then(async () => {
    wasmPronto = true;
    const retrato = await motor.estado();
    contagem = contagemDoFoco(retrato?.focus);
    aplicar();
  })
  .catch(() => {
    // Sem o motor, o título fica o do index.html.
  });

/** Se o tempo na aba está ligado. */
export const tempoNaAbaLigado = () => ligadoAqui;

/** Liga ou desliga o tempo na aba (grava a chave) e reescreve o título. */
export function definirTempoNaAba(valor) {
  ligadoAqui = !!valor;
  gravarLigado(armazenamento(), ligadoAqui);
  aplicar();
}
