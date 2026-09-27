// Formatos de tempo e de números da interface (PLANO.md, 3.8). M16: o mm:ss
// da contagem provisória. M17: os plurais (Intl.PluralRules) e a regra dos
// intervalos da frase do cartão "Pronto para focar". hh:mm:ss, -hh:mm:ss,
// hh:mm:ss,cc e as durações por extenso ("2,5 horas") chegam com as telas que
// os usam.
import t from './i18n/pt-BR.js';

const dois = (n) => String(n).padStart(2, '0');
const plural = new Intl.PluralRules('pt-BR');

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

/**
 * Escolhe o texto de `formas` ({ one, other }, funções de n) pela categoria
 * do Intl.PluralRules('pt-BR'). Uma categoria sem forma usa a `other`.
 */
export function plurais(n, formas) {
  return (formas[plural.select(n)] ?? formas.other)(n);
}

/** "1 minuto", "25 minutos" (o aria-valuetext do seletor de minutos). */
export const minutosPorExtenso = (n) => plurais(n, t.unidades.minutos);

/**
 * Quantos intervalos uma sessão de `minutos` (T) terá, com F e B do preparo
 * (`focusMinutes` e `breakMinutes`, o `setup` do get_state): ⌊(T − 1) / (F +
 * B)⌋, ou 0 com "Pular intervalos". É a regra do `plan.rs` (M14), repetida
 * aqui só para a frase do cartão: quem monta a sessão é o Rust, e o
 * format.test.js trava os mesmos exemplos do `plan.rs` (docs/decisoes.md,
 * M17). Entrada inválida (T < 1, F < 1 ou B < 1) dá 0.
 */
export function intervalos(minutos, { focusMinutes, breakMinutes }, pular = false) {
  const ok = [minutos, focusMinutes, breakMinutes].every((v) => Number.isInteger(v) && v >= 1);
  if (pular || !ok) return 0;
  return Math.floor((minutos - 1) / (focusMinutes + breakMinutes));
}

/** "Você terá 1 intervalo.", "Você terá 2 intervalos." ou "Sem intervalos.". */
export function fraseDosIntervalos(n) {
  const p = t.foco.preparo;
  return n > 0 ? plurais(n, p.intervalos) : p.semIntervalos;
}
