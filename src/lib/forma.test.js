import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { CONSULTA_CELULAR, ligarFormaCelular } from './forma.js';

test('A05: a consulta do layout de celular é a mesma do boot-web.js', () => {
  const boot = readFileSync(new URL('../platform/web/boot-web.js', import.meta.url), 'utf8');
  assert.ok(boot.includes(`'${CONSULTA_CELULAR}'`));
});

test('A05: ligarFormaCelular liga e desliga data-forma com a consulta', () => {
  let ouvinte = null;
  const mq = { matches: true, addEventListener: (_e, f) => (ouvinte = f), removeEventListener: () => {} };
  const doc = { documentElement: { dataset: {} } };
  ligarFormaCelular({ win: { matchMedia: (q) => (assert.equal(q, CONSULTA_CELULAR), mq) }, doc });
  assert.equal(doc.documentElement.dataset.forma, 'celular');
  mq.matches = false;
  ouvinte();
  assert.equal(doc.documentElement.dataset.forma, undefined);
});
