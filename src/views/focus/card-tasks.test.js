// Testes do cartão "Tarefas" (M30) sem DOM: o que ele mostra a partir da
// lista e do retrato do foco (subtítulo, a escolhida e a tarefa da sessão) e
// a marcação das linhas. Os cliques, o campo e o foco do teclado são
// conferidos na prévia (scripts/preview/tarefas.mjs) e no app (roteiro
// aninhado cartao-tarefas).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_TITULO, emSessao, escapar, escolhida, esquecer, linha, linhas, marcacao, mensagemDeErro, situacao } from './card-tasks.js';

const tarefa = (id, title, doneAt = null) => ({ id, title, createdAt: 1000 + id, doneAt });
const LISTA = [tarefa(1, 'Ler o capítulo 3'), tarefa(2, 'Lista 2', 5000), tarefa(3, 'Revisar')];
const foco = (status, taskId = null) => ({ seq: 1, status, at: 0, session: status === 'idle' ? null : { id: 9, taskId } });

test('situação sem sessão: "Escolha uma tarefa para a sessão" e a escolhida só se estiver pendente', () => {
  const s = situacao(LISTA, foco('idle'), 3);
  assert.deepEqual(s, { sessao: false, focada: null, escolhida: 3, subtitulo: 'Escolha uma tarefa para a sessão', vazio: false });
  assert.equal(situacao(LISTA, null, 2).escolhida, null, 'concluída não é escolhida');
  assert.equal(situacao(LISTA, null, 99).escolhida, null, 'apagada não é escolhida');
  assert.equal(situacao([], null, null).vazio, true);
  assert.equal(situacao(null, null, 1).vazio, true);
});

test('situação na sessão: "Você está focando em", a tarefa da sessão vem do retrato (e não da escolhida)', () => {
  for (const status of ['focus', 'break', 'paused']) {
    const s = situacao(LISTA, foco(status, 1), 3);
    assert.equal(s.sessao, true, status);
    assert.equal(s.subtitulo, 'Você está focando em');
    assert.equal(s.focada, 1);
    assert.equal(s.escolhida, null, 'na sessão, nada a escolher');
  }
  // Sem tarefa, ou com uma que já sumiu da lista.
  assert.equal(situacao(LISTA, foco('focus', null)).subtitulo, 'Sessão sem tarefa escolhida');
  const sumiu = situacao(LISTA, foco('focus', 42));
  assert.equal(sumiu.subtitulo, 'Você está focando em');
  assert.equal(sumiu.focada, null);
  // Concluída: o cartão volta ao preparo.
  assert.equal(emSessao({ status: 'completed', session: { taskId: 1 } }), false);
  assert.equal(situacao(LISTA, { status: 'completed', session: { taskId: 1 } }).subtitulo, 'Escolha uma tarefa para a sessão');
});

test('linha pendente: o círculo (checkbox desmarcado, com o título como nome), o título, "Escolher para a sessão" e o apagar', () => {
  const icone = (nome, grade = 16, estilo = 'regular') => `<svg data-icone="${nome}-${grade}-${estilo}"></svg>`;
  const html = linha(LISTA[0], situacao(LISTA, null, null), icone);
  assert.equal(
    html,
    '<li class="tt-tarefa" data-tarefa="1">' +
      '<button type="button" role="checkbox" aria-checked="false" aria-labelledby="tarefa-1-titulo" class="tt-tarefa-check" data-acao="concluir"><svg data-icone="circle-20-regular"></svg></button>' +
      '<span class="tt-tarefa-titulo" id="tarefa-1-titulo" title="Ler o capítulo 3">Ler o capítulo 3</span>' +
      '<button type="button" class="tt-tarefa-escolher" aria-pressed="false" aria-label="Escolher para a sessão" aria-describedby="tarefa-1-titulo" data-acao="escolher">' +
        '<span class="tt-escolher-longo" aria-hidden="true">Escolher para a sessão</span><span class="tt-escolher-curto" aria-hidden="true">Escolher</span></button>' +
      '<button type="button" class="tt-sutil tt-tarefa-apagar" aria-label="Apagar tarefa" aria-describedby="tarefa-1-titulo" data-dica data-acao="apagar"><svg data-icone="dismiss-16-regular"></svg></button>' +
      '</li>',
  );
});

test('linha concluída: o check preenchido, marcada, sem "Escolher"', () => {
  const icone = (nome, grade = 16, estilo = 'regular') => `<svg data-icone="${nome}-${grade}-${estilo}"></svg>`;
  const html = linha(LISTA[1], situacao(LISTA, null), icone);
  assert.match(html, /^<li class="tt-tarefa" data-tarefa="2" data-feita>/);
  assert.match(html, /role="checkbox" aria-checked="true"[^>]*><svg data-icone="checkmark_circle-20-filled">/);
  assert.doesNotMatch(html, /data-acao="escolher"/);
  assert.match(html, /data-acao="apagar"/);
});

test('linha escolhida: aria-pressed e "Escolhida"', () => {
  const html = linha(LISTA[2], situacao(LISTA, null, 3));
  assert.match(html, /data-tarefa="3" data-escolhida>/);
  assert.match(html, /aria-pressed="true"[^>]*>Escolhida<\/button>/);
});

test('linhas na sessão: a da sessão sem apagar nem escolher; as outras esmaecidas (--tt-fg-2)', () => {
  const s = situacao(LISTA, foco('focus', 1));
  const html = linhas(LISTA, s);
  const lis = html.split('</li>').filter(Boolean);
  assert.match(lis[0], /data-tarefa="1" data-focada aria-current="true">/);
  assert.doesNotMatch(lis[0], /data-acao="(apagar|escolher)"/);
  assert.match(lis[1], /data-tarefa="2" data-feita data-esmaecida>/);
  assert.match(lis[2], /data-tarefa="3" data-esmaecida>/);
  for (const li of lis) assert.doesNotMatch(li, /data-acao="escolher"/);
  assert.match(lis[2], /data-acao="apagar"/);
});

test('o título do usuário vai escapado para o HTML', () => {
  assert.equal(escapar(`<b>"a" & 'b'</b>`), '&lt;b&gt;&quot;a&quot; &amp; &#39;b&#39;&lt;/b&gt;');
  const html = linha(tarefa(7, '<img src=x onerror=alert(1)>'), situacao([], null));
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('marcação: "+" e "…" com nome e dica, o campo com o limite do Rust, e o estado vazio "Mantenha o rumo"', () => {
  esquecer();
  assert.equal(escolhida(), null);
  const html = marcacao();
  assert.match(html, /<button type="button" class="tt-sutil" aria-label="Adicionar tarefa" data-dica data-adicionar>/);
  assert.match(html, /<button type="button" slot="trigger" class="tt-sutil" aria-label="Mais opções das tarefas" data-dica data-mais-tarefas>/);
  assert.match(html, /<fluent-menu-item data-item="adicionar">Adicionar tarefa<\/fluent-menu-item><fluent-menu-item data-item="apagar-concluidas" disabled>Apagar concluídas<\/fluent-menu-item>/);
  assert.match(html, /<div class="tt-tarefas-corpo" data-carregando data-tarefas>/, 'até a primeira lista, nada à vista');
  assert.match(html, new RegExp(`<input type="text" class="tt-texto" aria-label="Nova tarefa" placeholder="Adicionar uma tarefa" maxlength="${MAX_TITULO}"`));
  assert.equal(MAX_TITULO, 255);
  assert.match(html, /<div class="tt-tarefas-vazio" data-vazio hidden><p class="tt-tarefas-vazio-titulo">Mantenha o rumo<\/p>.*<button type="button" data-adicionar-vazio>Adicionar tarefa<\/button><\/div>/);
  assert.match(html, /role="alert" data-erro hidden/);
});

test('erros: o título longo tem aviso próprio; o resto, o genérico', () => {
  assert.equal(mensagemDeErro({ code: 'titleTooLong' }), 'O título pode ter até 255 caracteres.');
  assert.equal(mensagemDeErro({ code: 'storage' }), 'Não foi possível salvar a tarefa. Tente de novo.');
  assert.equal(mensagemDeErro(new Error('x')), 'Não foi possível salvar a tarefa. Tente de novo.');
});
