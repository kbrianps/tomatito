// Testes do InfoBar do pedido de avisos (W14), sem DOM: quando aparece e o
// que mostra em cada modo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EVENTO_INICIADO, deveMostrar, marcacao } from './pedido-de-avisos.js';

const avisos = (oferece) => ({ deveOferecer: () => oferece });

test('deveMostrar: só com notificações na casca e a oferta de pé', () => {
  assert.equal(deveMostrar({ recursos: { notificacoes: true }, avisos: avisos(true) }), true);
  assert.equal(deveMostrar({ recursos: { notificacoes: true }, avisos: avisos(false) }), false);
  assert.equal(deveMostrar({ recursos: { notificacoes: false }, avisos: avisos(true) }), false);
  // O desktop: SEM_RECURSOS_DA_CASCA e avisosDaCasca null.
  assert.equal(deveMostrar({ recursos: { notificacoes: false, instalavel: false }, avisos: null }), false);
});

test('marcacao: a pergunta com os dois botões, e o bloqueio com o Fechar', () => {
  const pergunta = marcacao('pergunta');
  assert.match(pergunta, /Aviso no fim de cada período\?/);
  assert.match(pergunta, /O navegador pode mostrar uma notificação quando o foco ou o intervalo terminar\./);
  assert.match(pergunta, /<button type="button" class="tt-accent" data-pedido="permitir">Permitir avisos<\/button><button type="button" data-pedido="agora-nao">Agora não<\/button>/);
  const bloqueado = marcacao('bloqueado');
  assert.match(bloqueado, /Avisos bloqueados neste navegador\. Dá para mudar nas permissões do site\./);
  assert.match(bloqueado, /<button type="button" data-pedido="fechar">Fechar<\/button>/);
  assert.doesNotMatch(bloqueado, /permitir/);
  assert.equal(EVENTO_INICIADO, 'tt-foco-iniciado');
});
