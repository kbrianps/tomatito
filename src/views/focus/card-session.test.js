// Testes do cartão de sessão sem DOM (M19): o título com " · Pausado" e o
// que o Espaço faz em cada estado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acaoDoEspaco, complemento, modo, titulo } from './card-session.js';

const sessao = (kind, n) => ({ id: 1, phaseIndex: 0, blocks: 2, intervals: 1, phase: { kind, n, durationS: 60 }, next: null });

test('título: preparo, foco, intervalo e pausado', () => {
  const f = (status, s) => ({ status, session: s });
  const texto = (foco) => {
    const tt = titulo(foco);
    return tt.fase + complemento(tt);
  };
  assert.equal(texto(null), 'Pronto para focar');
  assert.equal(texto(f('focus', sessao('focus', 1))), 'Período de foco (1 de 2)');
  assert.equal(texto(f('paused', sessao('focus', 1))), 'Período de foco (1 de 2) · Pausado');
  assert.equal(texto(f('break', sessao('break', 1))), 'Intervalo');
  assert.equal(texto(f('paused', sessao('break', 1))), 'Intervalo · Pausado');
  // Concluído: volta ao preparo.
  assert.equal(modo(f('completed', sessao('focus', 2))), 'preparo');
  assert.equal(texto(f('completed', sessao('focus', 2))), 'Pronto para focar');
});

test('Espaço: inicia no preparo (ocioso ou concluído), pausa correndo, retoma pausado', () => {
  assert.equal(acaoDoEspaco(null), 'iniciar');
  assert.equal(acaoDoEspaco({ status: 'idle', session: null }), 'iniciar');
  assert.equal(acaoDoEspaco({ status: 'completed', session: sessao('focus', 2) }), 'iniciar');
  assert.equal(acaoDoEspaco({ status: 'focus', session: sessao('focus', 1) }), 'pausar');
  assert.equal(acaoDoEspaco({ status: 'break', session: sessao('break', 1) }), 'pausar');
  assert.equal(acaoDoEspaco({ status: 'paused', session: sessao('break', 1) }), 'retomar');
});
