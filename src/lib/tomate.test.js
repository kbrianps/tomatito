// Testes do que o tomate mostra (M50; PLANO.md, 5.10), sem DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FAIXA_DO_ANEL,
  MINUTOS_AO_INICIAR,
  acaoPrincipal,
  chaveDaFase,
  estadoDoTomate,
  restanteDaFase,
  rotuloDoTempo,
  vista,
} from './tomate.js';
import { MINUTOS_INICIAIS } from '../views/focus/card-session.js';

const T0 = 1_790_000_000_000;

// Uma sessão de 60 min (2 blocos de 1650 s e 1 intervalo de 300 s).
function sessao({ fase = 0, restante = 1_650_000, correndo = true, completa = false } = {}) {
  const fases = [
    { kind: 'focus', n: 1, durationS: 1650 },
    { kind: 'break', n: 1, durationS: 300 },
    { kind: 'focus', n: 2, durationS: 1650 },
  ];
  return {
    id: T0, minutes: 60, skipBreaks: false, taskId: null, focusMinutes: 25, breakMinutes: 5,
    startedAt: T0, blocks: 2, intervals: 1, phaseIndex: fase,
    phase: fases[fase], phaseStartedAt: T0,
    endsAt: correndo && !completa ? T0 + restante : null, remainingMs: completa ? 0 : restante,
    next: fases[fase + 1] ?? null, focusS: 0, completedAt: completa ? T0 : null,
  };
}
const foco = (status, s = null) => ({ seq: 1, status, at: T0, session: s });

test('o botão principal inicia a mesma duração do seletor da tela Foco e da bandeja', () => {
  assert.equal(MINUTOS_AO_INICIAR, MINUTOS_INICIAIS);
  assert.equal(MINUTOS_AO_INICIAR, 30);
});

test('estado do desenho: ocioso, foco, intervalo, pausado e concluída', () => {
  assert.equal(estadoDoTomate(null), 'idle');
  assert.equal(estadoDoTomate(foco('idle')), 'idle');
  assert.equal(estadoDoTomate(foco('focus', sessao())), 'focus');
  assert.equal(estadoDoTomate(foco('break', sessao({ fase: 1, restante: 300_000 }))), 'break');
  assert.equal(estadoDoTomate(foco('paused', sessao({ fase: 1, correndo: false }))), 'paused');
  assert.equal(estadoDoTomate(foco('completed', sessao({ fase: 2, completa: true }))), 'completed');
  assert.deepEqual(['idle', 'focus', 'break', 'paused', 'completed'].map(acaoPrincipal), [
    'iniciar',
    'pausar',
    'pausar',
    'retomar',
    'iniciar',
  ]);
});

test('o restante vem do endsAt (ends_at_ms) no relógio real, e da estimativa no acelerado', () => {
  const f = foco('focus', sessao({ restante: 600_000 }));
  assert.equal(restanteDaFase(f, { agora: T0 + 1_000, velocidade: 1, estimado: 123 }), 599_000);
  assert.equal(restanteDaFase(f, { agora: T0 + 700_000, velocidade: 1 }), 0, 'nunca negativo');
  assert.equal(restanteDaFase(f, { agora: T0, velocidade: 60, estimado: 42_000 }), 42_000);
  const pausado = foco('paused', sessao({ restante: 90_000, correndo: false }));
  assert.equal(restanteDaFase(pausado, { agora: T0 + 5_000_000, velocidade: 1 }), 90_000, 'pausada: o remainingMs');
  assert.equal(restanteDaFase(foco('idle'), { agora: T0 }), null);
});

test('ocioso: sem anel, "Pronto", 30:00 e "Sessão de 30 min"; Encerrar e Pular desabilitados', () => {
  const v = vista(foco('idle'), null);
  assert.equal(v.estado, 'idle');
  assert.equal(v.rotulo, 'Pronto');
  assert.equal(v.tempo, '30:00');
  assert.equal(v.contagem, 'Sessão de 30 min');
  assert.equal(v.anel, 0);
  assert.deepEqual(v.principal, { acao: 'iniciar', rotulo: 'Iniciar sessão de foco', icone: 'play' });
  assert.equal(v.encerrar.ativo, false);
  assert.deepEqual(v.pular, { rotulo: 'Pular', ativo: false });
  assert.equal(rotuloDoTempo(v), '30 minutos');
});

test('foco correndo: a contagem da tela Foco, o tempo em mm:ss e o anel pela fração decorrida', () => {
  const s = sessao({ restante: 1_122_000 });
  const v = vista(foco('focus', s), 1_121_500);
  assert.equal(v.rotulo, 'Foco');
  assert.equal(v.tempo, '18:42', 'arredonda o segundo para cima');
  assert.equal(v.contagem, 'Período de foco (1 de 2)');
  assert.equal(v.segundos, 1122);
  assert.equal(v.anel, Math.round(FAIXA_DO_ANEL * (1 - 1122 / 1650) * 100) / 100);
  assert.deepEqual(v.principal, { acao: 'pausar', rotulo: 'Pausar', icone: 'pause' });
  assert.deepEqual(v.encerrar, { rotulo: 'Encerrar sessão', ativo: true });
  assert.deepEqual(v.pular, { rotulo: 'Pular para o intervalo', ativo: true });
  assert.equal(rotuloDoTempo(v), '19 minutos restantes');
  // Começo e fim da fase.
  assert.equal(vista(foco('focus', s), 1_650_000).anel, 0);
  assert.equal(vista(foco('focus', s), 0).anel, FAIXA_DO_ANEL);
  assert.equal(vista(foco('focus', s), 0).tempo, '00:00');
  assert.equal(rotuloDoTempo(vista(foco('focus', s), 0)), '0 minutos restantes');
  assert.equal(rotuloDoTempo(vista(foco('focus', s), 30_000)), '1 minuto restante');
});

test('intervalo: "A seguir: foco de 27 min" e Pular para o foco', () => {
  const v = vista(foco('break', sessao({ fase: 1, restante: 190_000 })), 190_000);
  assert.equal(v.rotulo, 'Intervalo');
  assert.equal(v.tempo, '03:10');
  assert.equal(v.contagem, 'A seguir: foco de 27 min');
  assert.deepEqual(v.pular, { rotulo: 'Pular para o foco', ativo: true });
});

test('pausado: rótulo Pausado, a contagem da fase e Retomar', () => {
  const v = vista(foco('paused', sessao({ restante: 1_122_000, correndo: false })), 1_122_000);
  assert.equal(v.estado, 'paused');
  assert.equal(v.rotulo, 'Pausado');
  assert.equal(v.contagem, 'Período de foco (1 de 2)');
  assert.deepEqual(v.principal, { acao: 'retomar', rotulo: 'Retomar', icone: 'play' });
  assert.equal(rotuloDoTempo(v), '19 minutos restantes, pausado');
  const noIntervalo = vista(foco('paused', sessao({ fase: 1, restante: 60_000, correndo: false })), 60_000);
  assert.equal(noIntervalo.contagem, 'Intervalo');
});

test('última fase: Pular desabilitado (Encerrar continua)', () => {
  const v = vista(foco('focus', sessao({ fase: 2 })), 1_000_000);
  assert.equal(v.contagem, 'Período de foco (2 de 2)');
  assert.deepEqual(v.pular, { rotulo: 'Pular', ativo: false });
  assert.equal(v.encerrar.ativo, true);
});

test('concluída: anel cheio, "Concluída", 00:00 e a duração da sessão; o principal inicia outra', () => {
  const v = vista(foco('completed', sessao({ fase: 2, completa: true })), 0);
  assert.equal(v.rotulo, 'Concluída');
  assert.equal(v.tempo, '00:00');
  assert.equal(v.contagem, 'Sessão de 60 min');
  assert.equal(v.anel, FAIXA_DO_ANEL);
  assert.equal(v.principal.acao, 'iniciar');
  assert.equal(v.encerrar.ativo, false);
  assert.equal(v.pular.ativo, false);
  assert.equal(rotuloDoTempo(v), 'Concluída');
});

test('a chave da fase muda com a fase e o fim, e não com a pausa', () => {
  const correndo = chaveDaFase(foco('focus', sessao()));
  assert.equal(chaveDaFase(foco('paused', sessao({ correndo: false }))), correndo);
  assert.notEqual(chaveDaFase(foco('break', sessao({ fase: 1 }))), correndo);
  assert.notEqual(chaveDaFase(foco('completed', sessao({ fase: 2, completa: true }))), chaveDaFase(foco('focus', sessao({ fase: 2 }))));
  assert.notEqual(chaveDaFase(foco('idle')), correndo);
});

test('os rótulos de estado cabem entre os botões dos ombros (até 9 caracteres, como "Intervalo")', () => {
  for (const e of ['idle', 'focus', 'break', 'paused', 'completed']) {
    assert.ok(vista(e === 'idle' ? foco('idle') : foco(e, sessao({ fase: e === 'break' ? 1 : 2, completa: e === 'completed' })), 0).rotulo.length <= 9, e);
  }
});
