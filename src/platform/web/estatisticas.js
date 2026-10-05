// Estatísticas da versão web (PLANO-WEB, 3.5 e W08): o `stats.rs` do desktop
// com o IndexedDB no lugar do SQLite.
//   - Gravação: o efeito `period` do motor (o `record_period` que o
//     `TauriSink` leva ao `Stats::record`) vira uma linha em `periods`. A
//     gravação é assíncrona; o `stats_get` espera as pendentes, então o
//     cartão, que relê a cada `tt://state` (emitido logo depois do
//     `period`), já sai com o período novo, como no desktop (decisoes.md,
//     M26, item 6).
//   - Soma: as faixas (ontem, hoje, esta semana) vêm do wasm (`faixas`, o
//     `stats_ranges` do core, no fuso do navegador e com a hora de zerar), e
//     a regra de soma é a do `contagem.js`. Um erro de leitura vira 0, como
//     no desktop: o cartão mostra zero, não quebra.
import { faixas, historico as historicoDoMotor } from './pkg/tomatito_wasm.js';
import { esperar, transacao } from './armazenamento.js';
import { conta, somarFoco } from './contagem.js';
import * as configuracoes from './configuracoes.js';
import * as motor from './motor.js';

const pendentes = new Set();

/**
 * Grava um período (o `dados` do efeito `period`). Nunca lança: uma falha
 * vai para o console, e o foco segue.
 */
export function gravarPeriodo(periodo) {
  const p = transacao(['periods'], 'readwrite', ({ periods }) => esperar(periods.add({ ...periodo })))
    .catch((erro) => console.error('[estatísticas] não gravei o período', erro))
    .finally(() => pendentes.delete(p));
  pendentes.add(p);
  return p;
}

/** Espera as gravações que já começaram. */
export const gravacoesPendentes = () => Promise.all([...pendentes]);

async function somar(f) {
  if (!f) return { yesterdayS: 0, todayS: 0, weekS: 0 };
  // Uma leitura só, da menor à maior borda das três faixas.
  const inicio = Math.min(f.yesterday.start, f.week.start);
  const fim = Math.max(f.today.end, f.week.end);
  const lidos = await transacao(['periods'], 'readonly', ({ periods }) =>
    esperar(periods.index('endedAt').getAll(IDBKeyRange.bound(inicio, fim, false, true))),
  );
  return {
    yesterdayS: somarFoco(lidos, f.yesterday),
    todayS: somarFoco(lidos, f.today),
    weekS: somarFoco(lidos, f.week),
  };
}

/** `stats_get`: `{ yesterdayS, todayS, weekS, dailyGoalMinutes, resetHour }`. */
export async function obter() {
  // Fecha o que venceu antes de somar, como o `engine.state()` do desktop.
  await motor.estado();
  await gravacoesPendentes();
  const { resetHour, dailyGoalMinutes } = configuracoes.ler();
  let somas;
  try {
    somas = await somar(faixas(Date.now(), resetHour));
  } catch (erro) {
    console.error('[estatísticas] falha ao somar', erro);
    somas = { yesterdayS: 0, todayS: 0, weekS: 0 };
  }
  return { ...somas, dailyGoalMinutes, resetHour };
}

const SEM_HISTORICO = Object.freeze({ totalS: 0, periods: 0, days: 0, since: null, weeks: [] });

/**
 * `stats_history` (v0.3): `{ totalS, periods, days, since, weeks }`. Lê todos
 * os períodos, fica com os de foco que contam (a regra do `contagem.js`) e
 * entrega os pares `[endedAt, segundos]` ao mesmo cálculo do desktop
 * (`history` do core, em wasm), no fuso do navegador e com a hora de zerar.
 * Um erro de leitura vira o histórico vazio, como no desktop.
 */
export async function historico() {
  await motor.estado();
  await gravacoesPendentes();
  try {
    const lidos = await transacao(['periods'], 'readonly', ({ periods }) => esperar(periods.getAll()));
    const pares = new Float64Array(
      lidos
        .filter(conta)
        .sort((a, b) => a.endedAt - b.endedAt)
        .flatMap((p) => [p.endedAt, Math.max(0, p.actualS)]),
    );
    return historicoDoMotor(pares, Date.now(), configuracoes.ler().resetHour);
  } catch (erro) {
    console.error('[estatísticas] falha ao ler o histórico', erro);
    return { ...SEM_HISTORICO };
  }
}
