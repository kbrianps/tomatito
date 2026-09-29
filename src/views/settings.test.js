// Testes da tela Configurações que não precisam de janela (M24: a seção
// Aparência; M38: a seção "Sessões de foco"). O desenho das prévias, o clique
// e as setas são conferidos no Chrome pelo scripts/preview/aparencia.mjs e no
// WebKitGTK pelo roteiro scripts/gnome-aninhado/roteiros/aparencia.js; os
// cartões expansíveis, as listas, os switches e o volume, pelo
// scripts/preview/configuracoes.mjs e pelo roteiro configuracoes.js. M39: as
// seções "Sistema" e "Sobre", no Chrome pelo scripts/preview/sistema.mjs e no
// app de verdade pelo roteiro config-sistema.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FOCOS,
  INTERVALOS,
  OPCOES_DO_SISTEMA,
  PADROES,
  escolhaDe,
  ligarSistemaESobre,
  marcacao,
  marcacaoDasSessoes,
  marcacaoDoSistema,
  marcacaoDoSobre,
  patchDe,
  previa,
  seAplica,
  textoDoEstado,
  valoresDaLista,
} from './settings.js';
import t from '../lib/i18n/pt-BR.js';

const opcoes = (html) => [...html.matchAll(/<label class="tt-tema" data-tema="(\w+)"/g)].map((m) => m[1]);

test('Aparência: seis opções (os cinco temas da 1.1 e o Sistema por último), com o nome do catálogo', () => {
  const html = marcacao();
  assert.deepEqual(opcoes(html), ['lite', 'suave', 'light', 'dark', 'full', 'system']);
  for (const [tema, nome] of [
    ['lite', 'Tomatito Lite'],
    ['suave', 'Tomatito Suave'],
    ['light', 'Claro'],
    ['dark', 'Escuro'],
    ['full', 'Tomatito Full'],
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
  // M51: o Full é o tomate (as formas do tomato.html), com as cores do data-theme="full".
  const f = previa('full');
  assert.match(f, /^<span class="tt-previa-moldura" aria-hidden="true"><span class="tt-previa tt-previa-full" data-theme="full"><svg /);
  assert.deepEqual([...f.matchAll(/data-theme="(\w+)"/g)].map((m) => m[1]), ['full']);
  assert.match(f, /class="tt-previa-corpo" d="M160 80 C190 64 236 62 268 86 /);
  assert.equal(f.replace(/<[^>]+>/g, ''), '');
  const s = previa('system');
  assert.match(s, /tt-previa-dupla" aria-hidden="true"/);
  assert.deepEqual([...s.matchAll(/data-theme="(\w+)"/g)].map((m) => m[1]), ['light', 'dark']);
  // Só formas: nenhum texto dentro das prévias, para o nome da opção ser só o do rótulo
  assert.equal(s.replace(/<[^>]+>/g, ''), '');
});

test('o grupo de rádios tem nome e descrição do cartão e marca a preferência atual (o Full também, M51)', () => {
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
  assert.deepEqual([...full.matchAll(/data-tema="(\w+)" data-marcado/g)].map((m) => m[1]), ['full']);
  assert.match(full, /<fluent-radio-group[^>]* value="full">/);
  assert.equal(escolhaDe('full'), 'full');
  assert.equal(escolhaDe('roxo'), null);
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
    ['volume', '101'], ['volume', '-1'], ['volume', ''], ['theme', 'dark'], ['linuxX11', true],
  ]) {
    assert.equal(patchDe(chave, valor), null, `${chave} = ${JSON.stringify(valor)}`);
  }
});

// M39: as seções "Sistema" e "Sobre".
const RECURSOS = Object.freeze({ bandeja: true, sempreNaFrente: false, regiaoDeEntrada: true });

test('Sistema: fechar para a bandeja e tempo na bandeja com switch, e "Sair do Tomatito" com botão, nos textos do catálogo', () => {
  const html = marcacaoDoSistema(PADROES, { icone, recursos: RECURSOS });
  assert.match(html, /^<section class="tt-config-secao" aria-labelledby="config-sistema"><h2 id="config-sistema" class="tt-t-body-strong">Sistema<\/h2>/);
  assert.deepEqual(cartoes(html), ['fechar-bandeja', 'tempo-bandeja', 'sair']);
  assert.deepEqual([...html.matchAll(/data-icone="(\w+)" data-grade="20"/g)].map((m) => m[1]), ['arrow_minimize', 'clock', 'power']);
  for (const [id, titulo, descricao] of [
    ['fechar-bandeja', 'Fechar para a bandeja', 'Fechar a janela só a esconde: a sessão de foco e os temporizadores continuam.'],
    ['tempo-bandeja', 'Tempo na bandeja', 'Mostrar no ícone da bandeja quantos minutos faltam da sessão de foco.'],
    ['sair', 'Sair do Tomatito', 'Encerrar a sessão de foco e fechar o aplicativo.'],
  ]) {
    assert.ok(html.includes(`<span id="config-${id}" class="tt-config-titulo">${titulo}</span><span id="config-${id}-desc" class="tt-config-descricao tt-t-caption">${descricao}</span>`), id);
  }
  // Os padrões da 3.3: fechar para a bandeja ligado, tempo na bandeja desligado (pendência 37).
  assert.match(html, /<label class="tt-config-controle"><span class="tt-config-estado" data-estado aria-hidden="true">Ativado<\/span><fluent-switch data-config="closeToTray" aria-labelledby="config-fechar-bandeja" aria-describedby="config-fechar-bandeja-desc" checked><\/fluent-switch><\/label>/);
  assert.match(html, /<span class="tt-config-estado" data-estado aria-hidden="true">Desativado<\/span><fluent-switch data-config="trayTime" aria-labelledby="config-tempo-bandeja" aria-describedby="config-tempo-bandeja-desc"><\/fluent-switch>/);
  // O nome do botão é o título do cartão, que começa pelo texto visível.
  assert.match(html, /<button type="button" data-sair aria-labelledby="config-sair" aria-describedby="config-sair-desc">Sair<\/button>/);
  assert.ok('Sair do Tomatito'.startsWith(t.configuracoes.sair.botao));
  // Os valores gravados.
  const outro = marcacaoDoSistema({ ...PADROES, closeToTray: false, trayTime: true }, { icone, recursos: RECURSOS });
  assert.match(outro, /Desativado<\/span><fluent-switch data-config="closeToTray"[^>]*"><\/fluent-switch>/);
  assert.match(outro, /Ativado<\/span><fluent-switch data-config="trayTime"[^>]* checked>/);
  assert.doesNotMatch(html + outro, /style=/);
});

test('Sistema: a opção que não se aplica some (o tempo na bandeja sem o ícone); fechar para a bandeja e Sair ficam sempre', () => {
  const sem = marcacaoDoSistema(PADROES, { icone, recursos: { ...RECURSOS, bandeja: false } });
  assert.match(sem, /<div class="tt-config-cartao" data-cartao="tempo-bandeja" hidden>/);
  assert.match(sem, /<div class="tt-config-cartao" data-cartao="fechar-bandeja">/);
  assert.match(sem, /<div class="tt-config-cartao" data-cartao="sair">/);
  // Antes do primeiro get_state (SEM_RECURSOS), nada é prometido.
  assert.match(marcacaoDoSistema(PADROES), /data-cartao="tempo-bandeja" hidden>/);
  assert.doesNotMatch(marcacaoDoSistema(PADROES, { recursos: RECURSOS }), / hidden>/);
  const [fechar, tempo] = OPCOES_DO_SISTEMA;
  assert.equal(seAplica(fechar, { bandeja: false }), true);
  assert.equal(seAplica(tempo, { bandeja: false }), false);
  assert.equal(seAplica(tempo, { bandeja: true }), true);
  assert.equal(seAplica(tempo, undefined), false);
});

test('Sobre: expansível com o nome, a licença e a versão no cabeçalho; aberto, os avisos, a licença da fonte (M46) e o aviso de marcas', () => {
  const html = marcacaoDoSobre({ icone, versao: '0.1.0' });
  assert.match(html, /^<section class="tt-config-secao" aria-labelledby="config-sobre-secao"><h2 id="config-sobre-secao" class="tt-t-body-strong">Sobre<\/h2>/);
  assert.deepEqual(cartoes(html), ['sobre']);
  // M44: a marca do app no lugar do `info`, com a máscara do arco própria.
  assert.match(html, /<span class="tt-config-icone"><svg class="tt-marca" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><mask id="(tt-marca-\d+)">.*?<circle cx="8" cy="8" r="7.75" mask="url\(#\1\)"\/><\/svg><\/span>/);
  assert.doesNotMatch(html, /data-icone="info"/);
  assert.notEqual(marcacaoDoSobre({ icone }).match(/mask id="([^"]+)"/)[1], html.match(/mask id="([^"]+)"/)[1]);
  // A versão fica dentro do botão e entra na descrição acessível.
  assert.match(html, /<button type="button" class="tt-expansor-botao" data-expansor aria-expanded="false" aria-controls="config-sobre-conteudo" aria-labelledby="config-sobre" aria-describedby="config-sobre-desc config-sobre-valor">/);
  assert.match(html, /<span id="config-sobre" class="tt-config-titulo">Tomatito<\/span><span id="config-sobre-desc" class="tt-config-descricao tt-t-caption">© 2026 kbrianps · Licença MIT<\/span>/);
  assert.match(html, /<span id="config-sobre-valor" class="tt-expansor-valor">Versão 0\.1\.0<\/span><span class="tt-expansor-chevron">/);
  assert.match(html, /<div id="config-sobre-conteudo" class="tt-expansor-conteudo" role="group" aria-labelledby="config-sobre" hidden>/);
  // M46: os dois botões funcionam, cada um com o seu documento.
  assert.match(html, /<span id="config-avisos" class="tt-config-item-rotulo">Avisos de terceiros<\/span><button type="button" data-avisos="avisos" aria-describedby="config-avisos">Ver avisos<\/button>/);
  assert.match(html, /<span id="config-fonte" class="tt-config-item-rotulo">Licença da fonte Inter<\/span><button type="button" data-avisos="ofl" aria-describedby="config-fonte">Ver licença<\/button>/);
  assert.doesNotMatch(html, /disabled/);
  assert.ok(html.includes('Interface inspirada no Fluent Design. Windows e Segoe são marcas da Microsoft. O Tomatito não é afiliado à Microsoft.'));
  // Antes do getVersion() responder, o lugar da versão fica vazio; aberto quando lembrado.
  assert.match(marcacaoDoSobre({ abertosAgora: new Set(['sobre']) }), /<span id="config-sobre-valor" class="tt-expansor-valor"><\/span>/);
  assert.match(marcacaoDoSobre({ abertosAgora: new Set(['sobre']) }), /data-cartao="sobre" data-aberto>/);
  // Os expansíveis do M38 continuam sem valor no cabeçalho.
  assert.doesNotMatch(marcacaoDasSessoes(PADROES), /tt-expansor-valor/);
});

test('a tela: Sessões de foco, Aparência, Sistema e Sobre, nessa ordem', () => {
  const html = marcacao({ recursos: RECURSOS, versao: '0.1.0' });
  assert.deepEqual([...html.matchAll(/<h2 id="([\w-]+)"/g)].map((m) => m[1]), ['config-sessoes', 'config-aparencia', 'config-sistema', 'config-sobre-secao']);
  assert.match(html, /<\/section><\/div>$/);
  assert.equal(new Set([...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1])).size, [...html.matchAll(/ id="([^"]+)"/g)].length, 'ids únicos');
});

test('patchDe: as opções do sistema gravam só a própria chave, em booleano', () => {
  assert.deepEqual(patchDe('closeToTray', false), { closeToTray: false });
  assert.deepEqual(patchDe('trayTime', true), { trayTime: true });
  assert.deepEqual(PADROES.closeToTray, true);
  assert.deepEqual(PADROES.trayTime, false);
});

test('M46: "Ver avisos" e "Ver licença" abrem o diálogo com o documento certo, criado no primeiro clique e desfeito na limpeza', () => {
  const ouvintes = {};
  const sobre = { addEventListener: (tipo, f) => (ouvintes[tipo] = f), removeEventListener: (tipo) => delete ouvintes[tipo], querySelector: () => null };
  const sistema = { querySelectorAll: () => [], querySelector: () => null, addEventListener() {}, removeEventListener() {} };
  const raiz = {
    ownerDocument: { marca: 'doc' },
    querySelector: (s) => (s.includes('config-sobre-secao') ? sobre : sistema),
  };
  const chamadas = [];
  const criados = [];
  const criarDialogo = (opcoes) => {
    criados.push(opcoes);
    return { abrir: (doc, gatilho) => chamadas.push(`abrir:${doc}:${gatilho.nome}`), desligar: () => chamadas.push('desligar') };
  };
  const store = { configuracoes: PADROES, assinarConfiguracoes: () => () => {} };
  const ipc = { versao: () => Promise.resolve('0.1.0') };
  const recursos = { atuais: () => ({}), assinar: () => () => {} };
  const limpar = ligarSistemaESobre(raiz, { store, ipc, recursos, criarDialogo });
  const botao = (doc, nome) => ({ nome, dataset: { avisos: doc } });
  const clicar = (alvo) => ouvintes.click({ target: { closest: (s) => (s === '[data-avisos]' ? alvo : null) } });
  assert.equal(criados.length, 0, 'nada criado antes do clique');
  clicar(botao('avisos', 'ver-avisos'));
  clicar(botao('ofl', 'ver-licenca'));
  clicar(null);
  assert.equal(criados.length, 1, 'um diálogo só');
  assert.equal(criados[0].doc, raiz.ownerDocument);
  assert.equal(criados[0].ipc, ipc);
  limpar();
  assert.deepEqual(chamadas, ['abrir:avisos:ver-avisos', 'abrir:ofl:ver-licenca', 'desligar']);
  assert.equal(ouvintes.click, undefined);
});
