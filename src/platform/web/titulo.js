// O título da aba (PLANO-WEB-V1, W17), em funções puras, sem o wasm, para os
// testes do Node. É o tempo na bandeja do desktop (tray.rs, `vista`) com
// " · Tomatito" no fim:
//   - `25 min · Tomatito`, `Intervalo · 4 min · Tomatito`,
//     `Pausado · 24 min · Tomatito`;
//   - `Tomatito` sem sessão em andamento (ociosa ou concluída) ou com a chave
//     `tomatito:web.tempoNaAba` desligada.
// A fase vem do retrato como no `Contagem::do_foco` e no `Contagem::do_tick`
// do tray.rs; os minutos são arredondados para cima (`div_ceil(60_000)`),
// como no mostrador: com 24:13 faltando, "25 min". O texto do tempo é o do
// `i18n::tray_time`, pelo `tempoNaAba` do wasm, que chega aqui como
// parâmetro (o aba.js o passa).

/** O nome no fim do título, e o título inteiro sem tempo. */
export const MARCA = 'Tomatito';

/** A chave do localStorage: `'0'` desliga o tempo na aba; ausente, ligado. */
export const CHAVE = 'tomatito:web.tempoNaAba';

const MINUTO_MS = 60_000;

/** Uma contagem vazia: nenhuma sessão em andamento. */
export const SEM_SESSAO = Object.freeze({ fase: null, restanteMs: 0 });

/** Os status do foco que a bandeja mostra, com a fase dela. */
const FASE_DO_STATUS = Object.freeze({ focus: 'focus', break: 'break', paused: 'paused' });

/** `{ fase, restanteMs }` a partir do `FocusDto` (o `tt://state`). */
export function contagemDoFoco(foco) {
  const fase = Object.hasOwn(FASE_DO_STATUS, foco?.status ?? '') ? FASE_DO_STATUS[foco.status] : null;
  if (!fase) return SEM_SESSAO;
  return { fase, restanteMs: Math.max(0, Number(foco.session?.remainingMs) || 0) };
}

/** `{ fase, restanteMs }` a partir do `TickDto` (o `tt://tick`, só com uma fase correndo). */
export function contagemDoTick(tick) {
  const fase = tick?.phase?.kind === 'break' ? 'break' : 'focus';
  return { fase, restanteMs: Math.max(0, Number(tick?.remainingMs) || 0) };
}

/** Os minutos do título (arredondados para cima). */
export const minutos = (restanteMs) => Math.ceil(Math.max(0, restanteMs) / MINUTO_MS);

/**
 * O título para a contagem. `tempoNaAba(fase, minutos)` devolve o texto da
 * bandeja (ou `null`, e aí fica só a marca).
 */
export function titulo({ fase, restanteMs } = SEM_SESSAO, ligado, tempoNaAba) {
  if (!ligado || !fase || typeof tempoNaAba !== 'function') return MARCA;
  const tempo = tempoNaAba(fase, minutos(restanteMs));
  return tempo ? `${tempo} · ${MARCA}` : MARCA;
}

/** Se o tempo na aba está ligado (o padrão), lido de `armazenamento` (localStorage). */
export function ligado(armazenamento) {
  try {
    return armazenamento?.getItem(CHAVE) !== '0';
  } catch {
    return true;
  }
}

/** Grava a chave (`'1'` ou `'0'`); sem armazenamento, não faz nada. */
export function gravarLigado(armazenamento, valor) {
  try {
    armazenamento?.setItem(CHAVE, valor ? '1' : '0');
  } catch {
    // Sem localStorage (bloqueado), vale só nesta página.
  }
}
