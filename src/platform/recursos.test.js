// Testes do objeto de recursos (M39). O que o Rust decide está nos testes do
// src-tauri/src/recursos.rs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as modulo from './recursos.js';

const { SEM_RECURSOS, assinarRecursos, definirRecursos, montarRecursos } = modulo;

test('montarRecursos: os três campos, só true liga, e o objeto é congelado', () => {
  assert.deepEqual(montarRecursos({ bandeja: true, sempreNaFrente: false, regiaoDeEntrada: true }), {
    bandeja: true,
    sempreNaFrente: false,
    regiaoDeEntrada: true,
  });
  assert.deepEqual(montarRecursos({ bandeja: 1, sempreNaFrente: 'sim', extra: true }), SEM_RECURSOS);
  assert.deepEqual(montarRecursos(undefined), SEM_RECURSOS);
  assert.ok(Object.isFrozen(montarRecursos({})));
  assert.ok(Object.isFrozen(SEM_RECURSOS));
});

test('definirRecursos: o export vivo muda, quem assina é avisado só na mudança, e lixo é ignorado', () => {
  assert.deepEqual(modulo.recursos, SEM_RECURSOS, 'antes do primeiro get_state, nada');
  const vistos = [];
  const desligar = assinarRecursos((r) => vistos.push(r));
  assert.equal(definirRecursos({ bandeja: true, sempreNaFrente: false, regiaoDeEntrada: true }), true);
  assert.deepEqual(modulo.recursos, { bandeja: true, sempreNaFrente: false, regiaoDeEntrada: true });
  assert.equal(vistos.length, 1);
  // O mesmo de novo (outro get_state): sem aviso.
  definirRecursos({ bandeja: true, sempreNaFrente: false, regiaoDeEntrada: true });
  assert.equal(vistos.length, 1);
  // Um get_state sem `recursos` não apaga o que já se sabe.
  for (const lixo of [undefined, null, 'x', [true]]) assert.equal(definirRecursos(lixo), false);
  assert.equal(modulo.recursos.bandeja, true);
  definirRecursos({ bandeja: false, sempreNaFrente: true, regiaoDeEntrada: true });
  assert.equal(vistos.length, 2);
  assert.equal(modulo.recursos.sempreNaFrente, true);
  desligar();
  definirRecursos({});
  assert.equal(vistos.length, 2, 'desligado, não avisa');
  assert.deepEqual(modulo.recursos, SEM_RECURSOS);
});
