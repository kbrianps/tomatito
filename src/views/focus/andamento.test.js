// Testes da sessão em andamento (M18) sem DOM: os textos (cabeçalho, rodapé e
// rótulo do mostrador), o botão de destaque, o "Pular intervalo" e o relógio
// de quadros. O desenho na tela é conferido na prévia
// (scripts/preview/mostrador.mjs) e no app (roteiro aninhado mostrador).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  acaoPrincipal,
  cabecalho,
  criarRelogio,
  leitura,
  marcacao,
  podePularIntervalo,
  rodape,
  rotuloDoMostrador,
} from './andamento.js';

function quadros() {
  const fila = new Map();
  let id = 0;
  return {
    quadro: (f) => (fila.set(++id, f), id),
    cancelar: (i) => fila.delete(i),
    get pendentes() {
      return fila.size;
    },
    rodar() {
      const agora = [...fila.values()];
      fila.clear();
      agora.forEach((f) => f());
    },
  };
}

const sessao = (kind, n, { next = null, durationS = 25 * 60 } = {}) => ({
  id: 7,
  phaseIndex: kind === 'focus' ? (n - 1) * 2 : n * 2 - 1,
  blocks: 2,
  intervals: 1,
  phase: { kind, n, durationS },
  next,
});
const foco = (status, s) => ({ status, session: s });

test('cabeçalho: "Período de foco" e "(1 de 2)"; no intervalo, só "Intervalo"', () => {
  assert.equal(cabecalho(null), null);
  assert.equal(cabecalho({ status: 'idle', session: null }), null);
  assert.deepEqual(cabecalho(foco('focus', sessao('focus', 1))), { fase: 'Período de foco', contagem: '(1 de 2)' });
  assert.deepEqual(cabecalho(foco('paused', sessao('focus', 2))), { fase: 'Período de foco', contagem: '(2 de 2)' });
  assert.deepEqual(cabecalho(foco('break', sessao('break', 1))), { fase: 'Intervalo', contagem: '' });
});

test('rodapé: "A seguir:" e a próxima fase; nada na última', () => {
  const intervalo = { kind: 'break', n: 1, durationS: 300 };
  const focoSeguinte = { kind: 'focus', n: 2, durationS: 25 * 60 };
  assert.deepEqual(rodape(foco('focus', sessao('focus', 1, { next: intervalo }))), { rotulo: 'A seguir:', valor: 'intervalo de 5 min' });
  assert.deepEqual(rodape(foco('break', sessao('break', 1, { next: focoSeguinte }))), { rotulo: 'A seguir:', valor: 'foco de 25 min' });
  // 60 min: blocos de 1650 s, "27 min" como no plan.rs (para baixo).
  const meio = { kind: 'focus', n: 2, durationS: 1650 };
  assert.deepEqual(rodape(foco('break', sessao('break', 1, { next: meio }))).valor, 'foco de 27 min');
  assert.deepEqual(rodape(foco('break', sessao('break', 1, { next: { kind: 'focus', n: 2, durationS: 30 } }))).valor, 'foco de 1 min');
  assert.equal(rodape(foco('focus', sessao('focus', 2))), null);
  assert.equal(rodape(null), null);
});

test('rótulo do mostrador: minutos por extenso e a fase', () => {
  assert.equal(rotuloDoMostrador(foco('focus', sessao('focus', 1)), 27), '27 minutos restantes, período de foco 1 de 2');
  assert.equal(rotuloDoMostrador(foco('focus', sessao('focus', 2)), 1), '1 minuto restante, período de foco 2 de 2');
  assert.equal(rotuloDoMostrador(foco('focus', sessao('focus', 2)), 0), '0 minutos restantes, período de foco 2 de 2');
  assert.equal(rotuloDoMostrador(foco('break', sessao('break', 1)), 5), '5 minutos restantes, intervalo 1 de 1');
  assert.equal(rotuloDoMostrador(null, 5), '');
});

test('botão de destaque: pausar com a fase correndo, retomar pausado', () => {
  assert.equal(acaoPrincipal('focus'), 'pausar');
  assert.equal(acaoPrincipal('break'), 'pausar');
  assert.equal(acaoPrincipal('paused'), 'retomar');
});

test('"Pular intervalo" só vale num intervalo', () => {
  assert.equal(podePularIntervalo(foco('focus', sessao('focus', 1))), false);
  assert.equal(podePularIntervalo(foco('break', sessao('break', 1))), true);
  assert.equal(podePularIntervalo(foco('paused', sessao('break', 1))), true);
  assert.equal(podePularIntervalo(foco('paused', sessao('focus', 1))), false);
  assert.equal(podePularIntervalo(null), false);
});

test('leitura: minutos arredondados para cima e o traço do progresso', () => {
  const store = { foco: foco('focus', sessao('focus', 1)), restanteMs: () => 25 * 60_000 };
  assert.deepEqual(leitura(store), { minutos: 25, aceso: 0 });
  store.restanteMs = () => 18 * 60_000 + 45_000; // 6 min 15 s decorridos: 1/4
  assert.deepEqual(leitura(store), { minutos: 19, aceso: 6 });
  assert.deepEqual(leitura(store, 'minuto'), { minutos: 19, aceso: 6 }, '15 s no minuto: 3 h');
  assert.deepEqual(leitura({ foco: null, restanteMs: () => null }), { minutos: 0, aceso: 0 });
});

test('o DOM só é tocado quando o número ou o traço aceso mudam', () => {
  const q = quadros();
  const d = 25 * 60_000;
  const store = { correndo: true, ms: d, foco: foco('focus', sessao('focus', 1)), restanteMs() { return this.ms; } };
  const escritas = [];
  const r = criarRelogio({ store, escrever: (e) => escritas.push(e), ...q, modo: () => 'periodo' });
  r.atualizar();
  assert.deepEqual(escritas, [{ minutos: 25, aceso: 0 }]);
  // 60 quadros por segundo durante 2 min 10 s.
  for (let i = 0; i < 130 * 60; i++) {
    store.ms -= 1000 / 60;
    q.rodar();
  }
  // O número passa a 24 aos 60 s e a 23 aos 120 s (arredondado para cima);
  // o traço 1 acende aos 62,5 s e o 2 aos 125 s. Cinco escritas em 7800
  // quadros.
  assert.deepEqual(
    escritas.map((e) => `${e.minutos}/${e.aceso}`),
    ['25/0', '24/0', '24/1', '23/1', '23/2'],
  );
  assert.equal(q.pendentes, 1);
});

test('modo minuto: o traço anda a cada 2,5 s', () => {
  const q = quadros();
  const d = 25 * 60_000;
  const store = { correndo: true, ms: d, foco: foco('focus', sessao('focus', 1)), restanteMs() { return this.ms; } };
  const escritas = [];
  const r = criarRelogio({ store, escrever: (e) => escritas.push(e), ...q, modo: () => 'minuto' });
  r.atualizar();
  for (let i = 0; i < 10 * 60; i++) {
    store.ms -= 1000 / 60;
    q.rodar();
  }
  assert.deepEqual(escritas.map((e) => e.aceso), [0, 1, 2, 3, 4]);
});

test('parado, nenhum quadro é pedido; retomar volta a pedir', () => {
  const q = quadros();
  const store = { correndo: true, foco: foco('focus', sessao('focus', 1)), restanteMs: () => 10_000 };
  const r = criarRelogio({ store, escrever: () => {}, ...q, modo: () => undefined });
  r.atualizar();
  assert.equal(q.pendentes, 1);
  store.correndo = false;
  r.atualizar();
  assert.equal(q.pendentes, 0, 'pausado: o quadro pendente é cancelado');
  store.correndo = true;
  r.atualizar();
  r.atualizar();
  assert.equal(q.pendentes, 1, 'um quadro por vez');
  store.correndo = false;
  q.rodar();
  assert.equal(q.pendentes, 0, 'o passo não pede outro quadro quando parou');
  r.desligar();
});

test('marcação: mostrador, pausar de destaque, "..." com o menu e o rodapé', () => {
  const icone = (nome) => `<svg data-icone="${nome}"></svg>`;
  const html = marcacao(icone);
  assert.match(html, /<div class="tt-mostrador" role="img"/);
  assert.match(html, /<button type="button" class="tt-circular tt-accent" data-acao="pausar" aria-label="Pausar" data-dica><svg data-icone="pause"><\/svg><\/button>/);
  assert.match(html, /<fluent-menu class="tt-andamento-menu" data-menu-sessao><button type="button" slot="trigger" class="tt-circular" data-mais aria-label="Mais opções" data-dica><svg data-icone="more_horizontal"><\/svg><\/button>/);
  assert.deepEqual(
    [...html.matchAll(/<fluent-menu-item data-item="(\w+)">([^<]+)</g)].map((m) => [m[1], m[2]]),
    [['parar', 'Encerrar sessão'], ['pular', 'Pular intervalo']],
  );
  assert.match(html, /<p class="tt-andamento-rodape" data-rodape><span data-rodape-rotulo><\/span> <strong data-rodape-valor><\/strong><\/p>/);
  assert.doesNotMatch(html, /aria-live|style=/);
});
