// Testes da tela Temporizador (M32) sem DOM: o título, a aparência de cada
// estado (tempo, "Encerrado há", fração do anel e botões), o rótulo do anel e
// o HTML do card. O desenho na tela é conferido na prévia
// (scripts/preview/temporizador.mjs) e no app (roteiro aninhado temporizador).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acaoPrincipal, aparencia, barra, cartao, marcacao, rotuloDoAnel, titulo, vencido } from './timers.js';

const tm = (status, restante, { duracao = 60_000, ended = restante < 0, name = '' } = {}) => ({
  id: 1, name, durationMs: duracao, status, endsAt: null, remainingMs: restante, ended, overdue: restante < 0,
});

test('título: o nome, ou a duração curta sem nome', () => {
  assert.equal(titulo(tm('idle', 60_000)), '1 min');
  assert.equal(titulo(tm('idle', 90_000, { duracao: 90_000 })), '1 min 30 s');
  assert.equal(titulo(tm('idle', 240_000, { duracao: 240_000, name: 'Chá' })), 'Chá');
});

test('ação principal por estado', () => {
  assert.equal(acaoPrincipal('idle'), 'iniciar');
  assert.equal(acaoPrincipal('running'), 'pausar');
  assert.equal(acaoPrincipal('paused'), 'retomar');
});

test('parado: tempo cheio, anel só com o trilho, "Redefinir" desabilitado', () => {
  assert.deepEqual(aparencia(tm('idle', 60_000)), {
    tempo: '00:01:00', vencido: false, estado: 'idle', fracao: 0, acao: 'iniciar', podeRedefinir: false,
  });
});

test('correndo: o arco é o que falta pelo segundo mostrado', () => {
  const a = aparencia(tm('running', 60_000), 29_500);
  assert.equal(a.tempo, '00:00:30');
  assert.equal(a.fracao, 0.5);
  assert.equal(a.podeRedefinir, true);
  assert.equal(a.acao, 'pausar');
});

test('vencido: -00:00:12, sem arco; no zero exato, só com o fim disparado', () => {
  const a = aparencia(tm('running', 60_000, { ended: true }), -12_400);
  assert.deepEqual([a.tempo, a.vencido, a.fracao], ['-00:00:12', true, 0]);
  assert.equal(vencido(tm('running', 0, { ended: false }), 0), false);
  assert.equal(vencido(tm('running', 0, { ended: true }), 0), true);
  assert.equal(aparencia(tm('running', 0, { ended: true }), 0).tempo, '-00:00:00');
  // Pausado no negativo continua vencido.
  assert.equal(aparencia(tm('paused', -5_000)).vencido, true);
});

test('rótulo do anel, uma vez por minuto', () => {
  assert.equal(rotuloDoAnel(tm('idle', 60_000)), 'Parado');
  assert.equal(rotuloDoAnel(tm('running', 180_000, { duracao: 180_000 }), 150_000), '3 minutos restantes');
  assert.equal(rotuloDoAnel(tm('running', 60_000), 30_000), '1 minuto restante');
  assert.equal(rotuloDoAnel(tm('paused', 30_000)), 'Pausado, 1 minuto restante');
  assert.equal(rotuloDoAnel(tm('running', -12_000)), 'Encerrado há 0 minutos');
  assert.equal(rotuloDoAnel(tm('running', -61_000)), 'Encerrado há 1 minuto');
  assert.equal(rotuloDoAnel(tm('running', -125_000)), 'Encerrado há 2 minutos');
});

test('HTML do card: nome escapado, rótulo "Encerrado há" e botões', () => {
  const icone = (n) => `<svg data-icone="${n}"></svg>`;
  const html = cartao(tm('running', -12_000, { name: '<Chá>' }), { icone });
  assert.match(html, /<h2 id="temporizador-1" class="tt-temporizador-titulo" data-titulo>&lt;Chá&gt;<\/h2>/);
  assert.match(html, /data-estado="running" data-vencido/);
  assert.match(html, /<span class="tt-temporizador-encerrado" data-encerrado>Encerrado há<\/span>/);
  assert.match(html, /data-tempo>-00:00:12</);
  assert.match(html, /class="tt-circular tt-accent" data-acao="pausar" aria-label="Pausar" data-dica><svg data-icone="pause">/);
  assert.match(html, /data-acao="redefinir" aria-label="Redefinir" data-dica><svg data-icone="arrow_reset">/);
  assert.doesNotMatch(html, /redefinir"[^>]*disabled/);
  const parado = cartao(tm('idle', 60_000), { icone });
  assert.match(parado, /data-encerrado hidden>/);
  assert.match(parado, /data-acao="redefinir" aria-label="Redefinir" data-dica disabled>/);
  assert.match(parado, /viewBox="0 0 210 210"/);
  assert.match(parado, /stroke-width="12"/);
});

test('tela: o título e a grade, vazia sem retrato', () => {
  assert.match(marcacao(), /<h1 class="tt-t-title tt-so-leitor" tabindex="-1">Temporizador<\/h1><div class="tt-temporizadores" data-temporizadores><\/div>/);
  // Sem retrato ainda, a lista vazia não aparece (só depois do get_state).
  assert.match(marcacao(), /data-vazio hidden>/);
  const html = marcacao({ seq: 1, at: 0, timers: [tm('idle', 60_000), { ...tm('idle', 180_000, { duracao: 180_000 }), id: 2 }] });
  assert.equal(html.match(/data-temporizador="/g).length, 2);
});

test('M33: cada card traz Editar e Excluir (o CSS só os mostra no modo de edição), com o card na descrição', () => {
  const icone = (n) => `<svg data-icone="${n}"></svg>`;
  const html = cartao({ ...tm('idle', 240_000, { duracao: 240_000, name: 'Chá' }), id: 5 }, { icone });
  assert.match(
    html,
    /<div class="tt-temporizador-edicao"><button type="button" class="tt-sutil" data-acao="editar" aria-label="Editar" aria-describedby="temporizador-5" data-dica><svg data-icone="edit"><\/svg><\/button><button type="button" class="tt-sutil" data-acao="excluir" aria-label="Excluir" aria-describedby="temporizador-5" data-dica><svg data-icone="delete"><\/svg><\/button><\/div>/,
  );
});

test('M33: a barra do canto inferior direito, com o lápis (ou Concluído) e o "+"', () => {
  const icone = (n) => `<svg data-icone="${n}"></svg>`;
  assert.equal(
    barra({ icone }),
    '<div class="tt-temporizadores-barra" role="toolbar" aria-label="Ações dos temporizadores" data-barra>' +
      '<button type="button" class="tt-sutil" data-editar-lista aria-label="Editar temporizadores" data-dica><svg data-icone="edit"></svg></button>' +
      '<button type="button" class="tt-sutil" data-adicionar aria-label="Adicionar temporizador" data-dica><svg data-icone="add"></svg></button></div>',
  );
  assert.match(barra({ editando: true, icone }), /aria-label="Concluído" data-dica><svg data-icone="checkmark">/);
  // Sem nenhum temporizador, não há o que editar.
  assert.match(barra({ vazia: true }), /data-editar-lista aria-label="Editar temporizadores" data-dica disabled>/);
  const vazia = marcacao({ seq: 1, at: 0, timers: [] });
  assert.match(vazia, /<p class="tt-temporizadores-vazio" data-vazio>Nenhum temporizador\./);
  assert.match(vazia, /data-editar-lista[^>]*disabled/);
  assert.match(marcacao(), /<div class="tt-pagina tt-pagina-temporizador">/);
});
