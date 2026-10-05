import assert from 'node:assert/strict';
import test from 'node:test';
import { dataPorExtenso, marcacao, modelo, nomeDaSemana, SEMANAS_DO_GRAFICO } from './history-dialog.js';

const HIST = {
  totalS: 4500,
  periods: 4,
  days: 3,
  since: '2026-09-14',
  weeks: [
    { monday: '2026-09-14', focusS: 3600 },
    { monday: '2026-09-21', focusS: 0 },
    { monday: '2026-09-28', focusS: 900 },
    { monday: '2026-10-05', focusS: 0 },
  ],
};

test('histórico: datas e nomes das semanas', () => {
  assert.equal(dataPorExtenso('2026-09-14'), '14/09/2026');
  assert.equal(nomeDaSemana('2026-09-28', 2026), '28/09 a 04/10');
  // Semana que cruza o ano, e semana de outro ano: com o ano nas duas pontas.
  assert.equal(nomeDaSemana('2025-12-29', 2026), '29/12/2025 a 04/01/2026');
  assert.equal(nomeDaSemana('2025-06-02', 2026), '02/06/2025 a 08/06/2025');
});

test('histórico: o modelo traz os totais, as barras em ordem e a tabela da mais nova à mais antiga', () => {
  const m = modelo(HIST);
  assert.equal(m.vazio, false);
  assert.deepEqual(m.totais.map((x) => x.valor), ['1 h 15 min', '4', '3']);
  assert.equal(m.desde, 'Desde 14/09/2026.');
  assert.deepEqual(m.barras.map((b) => b.fracao), [1, 0, 0.25, 0]);
  assert.deepEqual(m.linhas.map((l) => l.nome), ['Esta semana', '28/09 a 04/10', '21/09 a 27/09', '14/09 a 20/09']);
  assert.deepEqual(m.linhas.map((l) => l.foco), ['0 min', '15 min', '0 min', '1 h']);
  assert.match(m.rotuloDoGrafico, /^Foco nas últimas 4 semanas\. A maior teve 1 h\.$/);
});

test('histórico: o gráfico mostra só as 12 semanas mais novas; a tabela, todas', () => {
  const weeks = Array.from({ length: 20 }, (_, i) => ({ monday: `2026-0${1 + Math.floor(i / 4)}-0${1 + (i % 4)}`, focusS: (i + 1) * 60 }));
  const m = modelo({ ...HIST, weeks });
  assert.equal(m.barras.length, SEMANAS_DO_GRAFICO);
  assert.equal(m.linhas.length, 20);
  assert.equal(m.barras.at(-1).fracao, 1);
});

test('histórico: sem registros, a nota do vazio; lendo e erro têm a própria marcação', () => {
  assert.deepEqual(modelo({ totalS: 0, periods: 0, days: 0, since: null, weeks: [] }), { vazio: true });
  assert.deepEqual(modelo(null), { vazio: true });
  assert.match(marcacao({ vazio: true }), /Ainda não há sessões de foco registradas\./);
  assert.match(marcacao('lendo'), /aria-busy="true"/);
  assert.match(marcacao('erro'), /role="alert">Não foi possível ler o histórico\./);
});

test('histórico: a marcação tem o gráfico com rótulo, a tabela com cabeçalhos e nenhuma palavra de gamificação', () => {
  const html = marcacao(modelo(HIST));
  assert.match(html, /<h2 slot="title" id="tt-historico-titulo">Histórico<\/h2>/);
  assert.match(html, /role="img" aria-label="Foco nas últimas 4 semanas\. A maior teve 1 h\."/);
  assert.equal(html.match(/class="tt-historico-barra"/g).length, 4);
  assert.match(html, /<th scope="col">Semana<\/th><th scope="col">Foco<\/th>/);
  assert.match(html, /<th scope="row">Esta semana<\/th><td class="tt-num">0 min<\/td>/);
  assert.doesNotMatch(html, /style=/);
  assert.doesNotMatch(html, /sequência|recorde|streak|parabéns/i);
});
