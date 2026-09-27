import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mmss } from './format.js';

test('mm:ss arredonda o segundo para cima', () => {
  assert.equal(mmss(25 * 60_000), '25:00');
  assert.equal(mmss(25 * 60_000 - 1), '25:00');
  assert.equal(mmss(25 * 60_000 - 1000), '24:59');
  assert.equal(mmss(1650_000), '27:30');
  assert.equal(mmss(1), '00:01');
  assert.equal(mmss(999), '00:01');
  assert.equal(mmss(1000), '00:01');
  assert.equal(mmss(1001), '00:02');
});

test('mm:ss no fim e com valores fora da faixa', () => {
  assert.equal(mmss(0), '00:00');
  assert.equal(mmss(-5000), '00:00');
  assert.equal(mmss(NaN), '00:00');
  assert.equal(mmss(undefined), '00:00');
  assert.equal(mmss(null), '00:00');
});

test('mm:ss não para em 59 minutos', () => {
  assert.equal(mmss(60 * 60_000), '60:00');
  assert.equal(mmss(240 * 60_000), '240:00');
});
