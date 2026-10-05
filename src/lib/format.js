// Formatos de tempo e de números da interface (PLANO.md, 3.8). M16: o mm:ss
// (a contagem provisória do M16, que saiu no M18). M18: os minutos
// arredondados para cima do mostrador. M17: os plurais (Intl.PluralRules) e a regra dos
// intervalos da frase do cartão "Pronto para focar". M27: as durações do
// cartão "Progresso diário" ("45 minutos", "2,5 horas"). hh:mm:ss, -hh:mm:ss
// e hh:mm:ss,cc chegam com as telas que os usam. M32: hh:mm:ss e -hh:mm:ss
// do temporizador e a duração curta do título do card ("1 min"). M34:
// hh:mm:ss,cc do cronômetro.
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
 * Minutos restantes do mostrador (M18), arredondados para cima, como no
 * Relógio: 25 no início de um foco de 25 min, 1 no último minuto e 0 só no
 * fim. Negativo ou inválido vira 0.
 */
export function minutosRestantes(ms) {
  return Number.isFinite(ms) && ms > 0 ? Math.ceil(ms / 60_000) : 0;
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

/**
 * A categoria de plural de `n` para uma quantidade medida (M27). Igual ao
 * Intl.PluralRules('pt-BR'), menos o zero: o CLDR põe o 0 em "one" ("0
 * minuto"), e a interface diz "0 minutos", como o andamento.js já fazia no
 * rótulo do mostrador. O 1,5 continua em "one" ("1,5 hora"), a regra do CLDR
 * e da norma (docs/decisoes.md, M27).
 */
export const categoria = (n) => (n === 0 ? 'other' : plural.select(n));

const decimal = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1, useGrouping: false });

/**
 * Uma duração do cartão "Progresso diário" (PLANO.md, 3.8), a partir de
 * segundos: até 59 min, "N minutos"; a partir de 60, horas com uma casa
 * decimal ("2,5 horas"), sem o ",0" ("1 hora", "2 horas"). Arredonda sempre
 * para baixo (minutos inteiros e décimos de hora): o cartão nunca mostra mais
 * do que foi feito (119 min são "1,9 hora", e não "2 horas"). Devolve o número
 * e a unidade separados (o cartão os empilha) e o texto inteiro. Negativo ou
 * inválido vale 0.
 */
export function duracao(segundos) {
  const min = Number.isFinite(segundos) && segundos > 0 ? Math.floor(segundos / 60) : 0;
  const u = t.unidades.palavras;
  if (min < 60) {
    const unidade = u.minutos[categoria(min)] ?? u.minutos.other;
    return { numero: String(min), unidade, texto: `${min} ${unidade}` };
  }
  const horas = Math.floor(min / 6) / 10;
  const numero = decimal.format(horas);
  const unidade = u.horas[categoria(horas)] ?? u.horas.other;
  return { numero, unidade, texto: `${numero} ${unidade}` };
}

/** Minutos inteiros por extenso, com o zero no plural ("0 minutos", "135 minutos"). */
export function minutosInteiros(segundos) {
  const min = Number.isFinite(segundos) && segundos > 0 ? Math.floor(segundos / 60) : 0;
  const u = t.unidades.palavras.minutos;
  return `${min} ${u[categoria(min)] ?? u.other}`;
}

const hms = (s) => `${dois(Math.floor(s / 3600))}:${dois(Math.floor(s / 60) % 60)}:${dois(s % 60)}`;

/**
 * M32: o tempo de um temporizador em `hh:mm:ss`. Antes do zero, o segundo é
 * arredondado para cima, como o `mmss` (00:01:00 no início de 1 min, 00:00:01
 * no último segundo). Depois do zero (`ms` negativo, ou `vencido` no zero
 * exato), `-hh:mm:ss` com o tempo passado arredondado para baixo: −12,4 s é
 * "-00:00:12". As horas passam de 99 no negativo. Inválido vira 00:00:00.
 */
export function tempoDoTemporizador(ms, vencido = false) {
  if (!Number.isFinite(ms)) return hms(0);
  if (ms > 0) return hms(Math.ceil(ms / 1000));
  return ms < 0 || vencido ? `-${hms(Math.floor(-ms / 1000))}` : hms(0);
}

/**
 * M32: a duração curta de um temporizador, o título do card sem nome (e o
 * corpo da notificação, `timer_duration` do src-tauri/src/i18n.rs, com os
 * mesmos exemplos nos testes): "1 min", "1 h 30 min", "45 s", "1 min 30 s".
 * Os segundos quebrados são cortados.
 */
export function duracaoCurta(ms) {
  const total = Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0;
  const u = t.temporizador.unidades;
  const h = Math.floor(total / 3600);
  const m = Math.floor(total / 60) % 60;
  const s = total % 60;
  const partes = [];
  if (h) partes.push(`${h} ${u.h}`);
  if (m) partes.push(`${m} ${u.min}`);
  if (s || !partes.length) partes.push(`${s} ${u.s}`);
  return partes.join(' ');
}

/**
 * M34: o tempo do cronômetro, `hh:mm:ss,cc`, com os centésimos depois da
 * vírgula (3.8). Tudo é cortado para baixo, como num cronômetro: 1,879 s é
 * "00:00:01,87", e o segundo só vira quando se completa. As horas passam de
 * 99 sem parar. Negativo ou inválido vira zero. Devolve as partes (a tela põe
 * os centésimos menores e as unidades embaixo de cada par) e o texto inteiro.
 */
export function tempoDoCronometro(ms) {
  const total = Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 10) : 0;
  const s = Math.floor(total / 100);
  const partes = {
    horas: dois(Math.floor(s / 3600)),
    minutos: dois(Math.floor(s / 60) % 60),
    segundos: dois(s % 60),
    centesimos: dois(total % 100),
  };
  return { ...partes, texto: `${partes.horas}:${partes.minutos}:${partes.segundos},${partes.centesimos}` };
}

/**
 * v0.3 (histórico): uma duração em horas e minutos inteiros, para baixo:
 * "6 h 20 min", "45 min", "3 h". Negativo ou inválido vale 0.
 */
export function horasEMinutos(segundos) {
  const min = Number.isFinite(segundos) && segundos > 0 ? Math.floor(segundos / 60) : 0;
  return t.foco.historico.horas(Math.floor(min / 60), min % 60);
}
