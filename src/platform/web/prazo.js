// Prazos da versão web (PLANO-WEB-V1, W11; PLANO-WEB, 3.4), em funções puras
// sobre o retrato do motor (o `StateDto` do get_state: `{ focus, timers,
// stopwatch, … }`), sem o wasm, para os testes do Node.
//
// - `proximoPrazo(retrato)`: o instante (ms de época) em que algo vence, o
//   menor entre o fim da fase que corre e o zero dos temporizadores que
//   correm; `null` quando nada vence (o `Engine::proximo_prazo` do motor, do
//   lado do retrato). O motor.js arma um `setTimeout` único até ele.
// - `proximaViradaDeMinuto(retrato, agora)`: quando o título da aba (W17)
//   muda. O título segue só a sessão de foco, como a bandeja do desktop
//   (tray.rs, `Contagem::do_foco`), com os minutos arredondados para cima
//   (`restante_ms.div_ceil(60_000)`): com 24:13 faltando, "25 min". O número
//   cai quando o restante chega ao múltiplo de 1 min abaixo dele; no último
//   minuto, a próxima mudança é o fim da própria fase.
// - `idDaFase(retrato)` e `criarDeduplicador()`: uma fase da sessão tem o id
//   `<sessão>:<índice da fase>`, e o deduplicador deixa passar cada chave uma
//   vez só (o aviso de fim sai uma vez por fase, e a virada de minuto uma vez
//   por minuto).

/** Um minuto, em ms (o `div_ceil(60_000)` do tray.rs). */
export const MINUTO_MS = 60_000;

/** Os estados do foco com uma fase correndo (o `ends_at` só existe neles). */
const CORRENDO = new Set(['focus', 'break']);

/** A sessão com uma fase correndo, ou `null` (ociosa, em pausa, concluída). */
function sessaoCorrendo(retrato) {
  const foco = retrato?.focus;
  const s = foco?.session;
  if (!s || !CORRENDO.has(foco.status) || !Number.isFinite(s.endsAt)) return null;
  return s;
}

/** Os prazos dos temporizadores rumo ao zero (os que já passaram dele não contam). */
function prazosDosTemporizadores(retrato) {
  const lista = retrato?.timers?.timers ?? [];
  return lista
    .filter((t) => t.status === 'running' && !t.ended && Number.isFinite(t.endsAt))
    .map((t) => t.endsAt);
}

/** O próximo prazo do retrato, em ms de época, ou `null`. */
export function proximoPrazo(retrato) {
  const prazos = prazosDosTemporizadores(retrato);
  const s = sessaoCorrendo(retrato);
  if (s) prazos.push(s.endsAt);
  return prazos.length ? Math.min(...prazos) : null;
}

/**
 * O instante da próxima mudança dos minutos da sessão (o título da aba), em
 * ms de época, ou `null` sem fase correndo. Com o restante em `(0, 1 min]`,
 * é o fim da fase. Com a fase já vencida (restante ≤ 0), `null`: quem a
 * fecha é o prazo.
 */
export function proximaViradaDeMinuto(retrato, agora) {
  const s = sessaoCorrendo(retrato);
  if (!s) return null;
  const restante = s.endsAt - agora;
  if (!(restante > 0)) return null;
  const minutos = Math.ceil(restante / MINUTO_MS);
  return s.endsAt - (minutos - 1) * MINUTO_MS;
}

/** Os minutos que o título mostra em `agora` (`div_ceil`), ou `null` sem fase correndo. */
export function minutosNoTitulo(retrato, agora) {
  const s = sessaoCorrendo(retrato);
  if (!s) return null;
  return Math.max(0, Math.ceil((s.endsAt - agora) / MINUTO_MS));
}

/** O id da fase que corre (`<sessão>:<índice>`), ou `null`. */
export function idDaFase(retrato) {
  const s = sessaoCorrendo(retrato);
  return s ? `${s.id}:${s.phaseIndex}` : null;
}

/**
 * Um deduplicador: `primeira(chave)` é verdadeiro só na primeira vez de cada
 * chave (`null` e `undefined` nunca passam). Guarda as `limite` mais
 * recentes, o bastante para uma sessão inteira.
 */
export function criarDeduplicador(limite = 64) {
  const vistas = new Set();
  return {
    primeira(chave) {
      if (chave === null || chave === undefined) return false;
      if (vistas.has(chave)) return false;
      vistas.add(chave);
      if (vistas.size > limite) vistas.delete(vistas.values().next().value);
      return true;
    },
    get tamanho() {
      return vistas.size;
    },
  };
}
