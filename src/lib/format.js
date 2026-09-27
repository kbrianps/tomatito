// Formatos de tempo da interface (PLANO.md, 3.8). M16: só o mm:ss da
// contagem provisória; hh:mm:ss, -hh:mm:ss, hh:mm:ss,cc e as durações por
// extenso chegam com as telas que os usam.

const dois = (n) => String(n).padStart(2, '0');

/**
 * Restante de uma contagem regressiva em `mm:ss`. Arredonda o segundo para
 * cima, como o Relógio: 25:00 no início, 00:01 no último segundo e 00:00 só
 * no fim. Os minutos não param em 59 (um bloco único de 240 min começa em
 * 240:00). Negativo ou inválido vira 00:00.
 */
export function mmss(ms) {
  const s = Number.isFinite(ms) && ms > 0 ? Math.ceil(ms / 1000) : 0;
  return `${dois(Math.floor(s / 60))}:${dois(s % 60)}`;
}
