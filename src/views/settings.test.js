// Testes da tela Configurações que não precisam de janela (M24: a seção
// Aparência; M38: a seção "Sessões de foco"). O desenho das prévias, o clique
// e as setas são conferidos no Chrome pelo scripts/preview/aparencia.mjs e no
// WebKitGTK pelo roteiro scripts/gnome-aninhado/roteiros/aparencia.js; os
// cartões expansíveis, as listas, os switches e o volume, pelo
// scripts/preview/configuracoes.mjs e pelo roteiro configuracoes.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FOCOS, INTERVALOS, PADROES, escolhaDe, marcacao, marcacaoDasSessoes, patchDe, previa, textoDoEstado, valoresDaLista } from './settings.js';
import t from '../lib/i18n/pt-BR.js';

const opcoes = (html) => [...html.matchAll(/<label class="tt-tema" data-tema="(\w+)"/g)].map((m) => m[1]);

test('Aparência: cinco opções na ordem da 4.1, com o nome do catálogo, e o Full escondido até o M51', () => {
  const html = marcacao();
  assert.deepEqual(opcoes(html), ['lite', 'suave', 'light', 'dark', 'system']);
  assert.doesNotMatch(html, /full/);
  for (const [tema, nome] of [
    ['lite', 'Tomatito Lite'],
    ['suave', 'Tomatito Suave'],
    ['light', 'Claro'],
    ['dark', 'Escuro'],
    ['system', 'Usar configuração do sistema'],
  ]) {
    assert.equal(t.configuracoes.temas[tema], nome);
    assert.match(html, new RegExp(`<fluent-radio value="${tema}"></fluent-radio>${nome}</span></label>`));
  }
});

test('cada prévia é um elemento data-theme do próprio tema, decorativa; o Sistema mostra o Claro e o Escuro', () => {
  for (const tema of ['lite', 'suave', 'light', 'dark']) {
    const p = previa(tema);
    assert.match(p, /^<span class="tt-previa-moldura" aria-hidden="true">/);
    assert.deepEqual([...p.matchAll(/data-theme="(\w+)"/g)].map((m) => m[1]), [tema]);
  }
  const s = previa('system');
  assert.match(s, /tt-previa-dupla" aria-hidden="true"/);
  assert.deepEqual([...s.matchAll(/data-theme="(\w+)"/g)].map((m) => m[1]), ['light', 'dark']);
  // Só formas: nenhum texto dentro das prévias, para o nome da opção ser só o do rótulo
  assert.equal(s.replace(/<[^>]+>/g, ''), '');
});

test('o grupo de rádios tem nome e descrição do cartão e marca a preferência atual (nenhuma no Full)', () => {
  const html = marcacao({ pref: 'dark', icone: (n, g) => `<svg data-icone="${n}" data-grade="${g}"></svg>` });
  assert.match(html, /<fluent-radio-group class="tt-temas" name="tema" orientation="horizontal" aria-labelledby="config-tema" aria-describedby="config-tema-desc" value="dark">/);
  assert.match(html, /<span id="config-tema" class="tt-config-titulo">Tema do aplicativo<\/span>/);
  assert.match(html, /<span id="config-tema-desc" class="tt-config-descricao tt-t-caption">Escolha as cores do Tomatito\.<\/span>/);
  assert.match(html, /<svg data-icone="paint_brush" data-grade="20"><\/svg>/);
  assert.deepEqual([...html.matchAll(/data-tema="(\w+)" data-marcado/g)].map((m) => m[1]), ['dark']);
  // M38: o título em Title Large e a seção "Sessões de foco" antes da Aparência.
  assert.match(html, /^<div class="tt-pagina"><h1 class="tt-t-title-large" tabindex="-1">Configurações<\/h1><section class="tt-config-secao" aria-labelledby="config-sessoes">/);
  assert.match(html, /<\/section><section class="tt-config-secao" aria-labelledby="config-aparencia"><h2 id="config-aparencia" class="tt-t-body-strong">Aparência<\/h2>/);

  const full = marcacao({ pref: 'full' });
  assert.doesNotMatch(full, /data-marcado/);
  assert.doesNotMatch(full, /<fluent-radio-group[^>]* value="/);
  assert.equal(escolhaDe('full'), null);
  assert.equal(escolhaDe('system'), 'system');
});

// M38: a seção "Sessões de foco".
const icone = (n, g) => `<svg data-icone="${n}" data-grade="${g}"></svg>`;
const cartoes = (html) => [...html.matchAll(/<div class="tt-config-cartao[^"]*" data-cartao="([\w-]+)"/g)].map((m) => m[1]);
const opcoesDe = (html, chave) => {
  const lista = new RegExp(`<fluent-dropdown data-config="${chave}"[^>]*>(.*?)</fluent-dropdown>`).exec(html)[1];
  return [...lista.matchAll(/<fluent-option value="(\d+)"( selected)?>([^<]+)<\/fluent-option>/g)].map((m) => [Number(m[1]), Boolean(m[2]), m[3]]);
};

test('Sessões de foco: quatro cartões na ordem do Relógio, com os ícones de 20 e os textos do catálogo', () => {
  const html = marcacaoDasSessoes(PADROES, { icone });
  assert.match(html, /^<section class="tt-config-secao" aria-labelledby="config-sessoes"><h2 id="config-sessoes" class="tt-t-body-strong">Sessões de foco<\/h2>/);
  assert.deepEqual(cartoes(html), ['periodos', 'som-foco', 'som-intervalo', 'volume']);
  assert.deepEqual([...html.matchAll(/data-icone="(\w+)" data-grade="20"/g)].map((m) => m[1]), ['target', 'clock_alarm', 'clock_alarm', 'speaker_2']);
  assert.equal([...html.matchAll(/data-icone="chevron_down"/g)].length, 3, 'um chevron por expansível; o Volume não abre');
  for (const [id, titulo, descricao] of [
    ['periodos', 'Períodos de foco', 'Ajuste a duração dos períodos de foco e dos intervalos. Vale a partir da próxima sessão.'],
    ['som-foco', 'Som de fim de foco', 'Tocar um aviso quando o período de foco termina.'],
    ['som-intervalo', 'Som de fim de intervalo', 'Tocar um aviso quando o intervalo termina.'],
    ['volume', 'Volume', 'Volume dos avisos sonoros.'],
  ]) {
    assert.match(html, new RegExp(`<span id="config-${id}" class="tt-config-titulo">${titulo}</span><span id="config-${id}-desc" class="tt-config-descricao tt-t-caption">${descricao.replace('.', '\\.')}`));
  }
});

test('os expansíveis: botão com aria-expanded e aria-controls, fechados por padrão, abertos quando lembrados', () => {
  const fechado = marcacaoDasSessoes(PADROES, { icone });
  for (const id of ['periodos', 'som-foco', 'som-intervalo']) {
    assert.match(fechado, new RegExp(`<button type="button" class="tt-expansor-botao" data-expansor aria-expanded="false" aria-controls="config-${id}-conteudo" aria-labelledby="config-${id}" aria-describedby="config-${id}-desc">`));
    assert.match(fechado, new RegExp(`<div id="config-${id}-conteudo" class="tt-expansor-conteudo" role="group" aria-labelledby="config-${id}" hidden>`));
  }
  const aberto = marcacaoDasSessoes(PADROES, { icone, abertosAgora: new Set(['som-foco']) });
  assert.match(aberto, /data-cartao="som-foco" data-aberto>/);
  assert.match(aberto, /aria-expanded="true" aria-controls="config-som-foco-conteudo"/);
  assert.match(aberto, /<div id="config-som-foco-conteudo" class="tt-expansor-conteudo" role="group" aria-labelledby="config-som-foco">/);
  assert.match(aberto, /aria-expanded="false" aria-controls="config-periodos-conteudo"/);
});

test('períodos: as listas do F e do B, com a escolha marcada e os minutos por extenso', () => {
  const html = marcacaoDasSessoes(PADROES, { icone });
  const focos = opcoesDe(html, 'focusMinutes');
  assert.deepEqual(focos.map(([v]) => v), [...FOCOS]);
  assert.deepEqual(focos.filter(([, sel]) => sel).map(([v]) => v), [25]);
  assert.equal(focos.find(([v]) => v === 25)[2], '25 minutos');
  const intervalos = opcoesDe(html, 'breakMinutes');
  assert.deepEqual(intervalos, [[5, true, '5 minutos'], [10, false, '10 minutos'], [15, false, '15 minutos']]);
  assert.deepEqual([...INTERVALOS], [5, 10, 15]);
  assert.match(html, /<span id="config-foco-rotulo" class="tt-config-item-rotulo">Período de foco<\/span><fluent-dropdown data-config="focusMinutes" data-rotulo="config-foco-rotulo">/);
  assert.match(html, /<span id="config-intervalo-rotulo" class="tt-config-item-rotulo">Intervalo<\/span><fluent-dropdown data-config="breakMinutes" data-rotulo="config-intervalo-rotulo">/);
  // Um valor gravado fora da lista (à mão) aparece, na ordem.
  const fora = marcacaoDasSessoes({ ...PADROES, focusMinutes: 90, breakMinutes: 1 }, { icone });
  assert.deepEqual(opcoesDe(fora, 'focusMinutes').at(-1), [90, true, '90 minutos']);
  assert.deepEqual(opcoesDe(fora, 'breakMinutes')[0], [1, true, '1 minuto']);
  assert.deepEqual(valoresDaLista([5, 10, 15], 12), [5, 10, 12, 15]);
  assert.deepEqual(valoresDaLista([5, 10, 15], 10), [5, 10, 15]);
  assert.deepEqual(valoresDaLista([5, 10, 15], undefined), [5, 10, 15]);
});

test('sons: o switch no cabeçalho, fora do botão, com o nome do cartão; o "Testar" dentro, com o nome do som', () => {
  const html = marcacaoDasSessoes({ ...PADROES, sounds: { focusEnd: false, breakEnd: true } }, { icone });
  assert.match(html, /<\/button><label class="tt-expansor-acao"><span class="tt-config-estado" data-estado aria-hidden="true">Desativado<\/span><fluent-switch data-som="focusEnd" aria-labelledby="config-som-foco" aria-describedby="config-som-foco-desc"><\/fluent-switch><\/label>/);
  assert.match(html, /<span class="tt-config-estado" data-estado aria-hidden="true">Ativado<\/span><fluent-switch data-som="breakEnd" aria-labelledby="config-som-intervalo" aria-describedby="config-som-intervalo-desc" checked><\/fluent-switch>/);
  assert.match(html, /<span id="config-som-foco-som" class="tt-config-item-rotulo">Som do aviso<\/span><span class="tt-config-item-acoes"><span class="tt-config-valor">Duas notas<\/span><button type="button" data-testar="focusEnd" aria-label="Testar o som de fim de foco"><svg data-icone="play" data-grade="16"><\/svg>Testar<\/button>/);
  assert.match(html, /<span class="tt-config-valor">Uma nota<\/span><button type="button" data-testar="breakEnd" aria-label="Testar o som de fim de intervalo">/);
  // O nome acessível do "Testar" começa pelo texto visível (WCAG 2.5.3).
  for (const [, nome] of html.matchAll(/data-testar="\w+" aria-label="([^"]+)"/g)) assert.ok(nome.startsWith('Testar'), nome);
  assert.equal(textoDoEstado(true), 'Ativado');
  assert.equal(textoDoEstado(false), 'Desativado');
});

test('volume: deslizante de 0 a 100 com o nome do cartão, o valor em texto e em aria-valuetext', () => {
  const html = marcacaoDasSessoes({ ...PADROES, volume: 37 }, { icone });
  assert.match(html, /<input type="range" class="tt-deslizante" min="0" max="100" step="1" value="37" data-config="volume" aria-labelledby="config-volume" aria-describedby="config-volume-desc" aria-valuetext="37%"><span class="tt-config-valor tt-num" data-volume-valor aria-hidden="true">37<\/span>/);
  assert.match(marcacaoDasSessoes({ ...PADROES, volume: 300 }), /value="80"/, 'fora da faixa, o padrão');
  assert.doesNotMatch(html, /style=/, 'CSP: nada de style na marcação (3.8)');
});

test('patchDe: só a chave do controle, no formato do settings_set, e nada para valor inválido', () => {
  assert.deepEqual(patchDe('focusMinutes', '50'), { focusMinutes: 50 });
  assert.deepEqual(patchDe('breakMinutes', '10'), { breakMinutes: 10 });
  assert.deepEqual(patchDe('volume', '0'), { volume: 0 });
  assert.deepEqual(patchDe('volume', '100'), { volume: 100 });
  assert.deepEqual(patchDe('focusEnd', false), { sounds: { focusEnd: false } });
  assert.deepEqual(patchDe('breakEnd', true), { sounds: { breakEnd: true } });
  // Sem comparar com o store: ligar e desligar antes da resposta gravam os dois.
  assert.deepEqual(patchDe('focusMinutes', '25'), { focusMinutes: 25 });
  for (const [chave, valor] of [
    ['focusMinutes', ''], ['focusMinutes', '2.5'], ['breakMinutes', '0'],
    ['volume', '101'], ['volume', '-1'], ['volume', ''], ['trayTime', true],
  ]) {
    assert.equal(patchDe(chave, valor), null, `${chave} = ${JSON.stringify(valor)}`);
  }
});
