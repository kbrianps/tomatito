// Testes do cartão "Progresso diário" (M27) sem DOM: os números que ele
// mostra a partir do `stats_get`, a marcação e, com elementos falsos, quando
// ele pede os números de novo (retrato do foco, tt://settings e a releitura
// por minuto) e como aplica a resposta. O desenho na tela é conferido na
// prévia (scripts/preview/progresso.mjs) e no app (roteiro aninhado progresso).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RELEITURA_MS, esquecer, ligar, marcacao, numeros } from './card-progress.js';

const stats = (todayS, { goal = 120, y = 5400, w = 9000 } = {}) => ({ yesterdayS: y, todayS, weekS: w, dailyGoalMinutes: goal, resetHour: 0 });

test('números: Ontem, Esta semana e a meta pela regra das durações; o anel pela fração da meta', () => {
  const n = numeros(stats(2700));
  assert.deepEqual(n.ontem, { numero: '1,5', unidade: 'hora', texto: '1,5 hora' });
  assert.deepEqual(n.semana, { numero: '2,5', unidade: 'horas', texto: '2,5 horas' });
  assert.deepEqual(n.meta, { numero: '2', unidade: 'horas', texto: '2 horas' });
  assert.equal(n.fracao, 0.375);
  assert.equal(n.concluido, 'Concluído: 45 minutos');
  assert.equal(n.rotulo, 'Meta diária de 2 horas. Concluído hoje: 45 minutos, 37% da meta.');
});

test('números: o rodapé sempre em minutos; acima da meta, o anel cheio e o rótulo com a fração de verdade', () => {
  const n = numeros(stats(150 * 60));
  assert.equal(n.concluido, 'Concluído: 150 minutos');
  assert.equal(n.fracao, 1);
  assert.match(n.rotulo, /Concluído hoje: 150 minutos, 125% da meta\.$/);
  assert.equal(numeros(stats(0)).concluido, 'Concluído: 0 minutos');
  assert.equal(numeros(stats(30, { goal: 30 })).meta.texto, '30 minutos');
});

test('números: meta desativada (0) ou inválida some com o anel e o rótulo', () => {
  for (const goal of [0, -5, 1.5, null]) {
    const n = numeros(stats(2700, { goal }));
    assert.equal(n.meta, null, String(goal));
    assert.equal(n.fracao, 0);
    assert.equal(n.rotulo, '');
    assert.equal(n.concluido, 'Concluído: 45 minutos');
  }
  const vazio = numeros(null);
  assert.equal(vazio.ontem.texto, '0 minutos');
  assert.equal(vazio.meta, null);
});

test('marcação: três colunas (Ontem, o anel com a meta dentro, Esta semana) e o rodapé', () => {
  esquecer();
  const html = marcacao(stats(2700));
  const ordem = [...html.matchAll(/data-coluna="(\w+)"|class="tt-anel /g)].map((m) => m[1] ?? 'anel');
  assert.deepEqual(ordem, ['ontem', 'anel', 'semana']);
  assert.match(html, /<dt>Ontem<\/dt><dd><span class="tt-progresso-numero tt-num" data-numero>1,5<\/span><span class="tt-progresso-unidade" data-unidade>hora<\/span><\/dd>/);
  assert.match(html, /<dt>Esta semana<\/dt>/);
  assert.match(html, /role="img" aria-label="Meta diária de 2 horas\. Concluído hoje: 45 minutos, 37% da meta\."/);
  assert.match(html, /<div class="tt-anel-centro" aria-hidden="true"><span class="tt-progresso-rotulo">Meta diária<\/span><span [^>]*>2<\/span><span [^>]*>horas<\/span><\/div>/);
  assert.match(html, /<p class="tt-progresso-rodape" data-concluido>Concluído: 45 minutos<\/p><p class="tt-progresso-acoes"><button type="button" data-historico>Ver histórico<\/button><\/p>$/);
  assert.doesNotMatch(html, /data-sem-meta|data-carregando/);
  assert.match(marcacao(stats(2700, { goal: 0 })), /data-sem-meta/);
});

test('marcação: antes da primeira resposta, o tamanho final com os números escondidos (sem esconder o anel)', () => {
  esquecer();
  const html = marcacao();
  assert.match(html, /<div class="tt-progresso-corpo" data-carregando data-progresso>/);
});

// Elementos falsos, só com o que o cartão e o ring.js usam.
function elemento(attrs = {}) {
  const a = { ...attrs };
  const el = {
    a,
    textContent: '',
    estilo: new Map(),
    getAttribute: (n) => (n in a ? a[n] : null),
    setAttribute: (n, v) => (a[n] = String(v)),
    removeAttribute: (n) => delete a[n],
    hasAttribute: (n) => n in a,
    toggleAttribute: (n, f) => (f ? (a[n] = '') : delete a[n], f),
    style: { setProperty: (n, v) => el.estilo.set(n, v) },
    getBoundingClientRect: () => ({}),
    filhos: {},
    querySelector: (s) => el.filhos[s] ?? null,
  };
  return el;
}
function cartaoFalso() {
  const cartao = elemento();
  const corpo = elemento({ 'data-carregando': '' });
  const rodape = elemento();
  const anel = elemento({ 'aria-label': '' });
  const svg = elemento({ viewBox: '0 0 206 206' });
  const arco = elemento({ 'stroke-width': '18', 'stroke-dashoffset': '590.619', 'data-vazio': '' });
  anel.filhos = { svg, '.tt-anel-arco': arco };
  const campos = {};
  for (const sel of ['[data-coluna="ontem"]', '[data-coluna="semana"]', '.tt-anel-centro']) {
    for (const parte of ['[data-numero]', '[data-unidade]']) campos[`${sel} ${parte}`] = elemento();
  }
  corpo.filhos = { '[data-anel]': anel, ...campos };
  cartao.filhos = { '[data-progresso]': corpo, '[data-concluido]': rodape };
  return { cartao, corpo, rodape, anel, arco, campos };
}
function ambiente(respostas) {
  const pedidos = [];
  const ouvintes = new Map();
  const assinantes = new Set();
  const intervalos = new Map();
  let proximo = 0;
  return {
    pedidos,
    ouvintes,
    intervalos,
    assinantes,
    store: { assinar: (f) => (assinantes.add(f), () => assinantes.delete(f)) },
    ipc: {
      EVENTOS: { configuracoes: 'tt://settings' },
      estatisticas: {
        obter: () => {
          const r = respostas.shift();
          pedidos.push(r);
          return r instanceof Promise ? r : Promise.resolve(r);
        },
      },
      ouvir: async (ev, cb) => (ouvintes.set(ev, cb), () => ouvintes.delete(ev)),
    },
    doc: { visibilityState: 'visible' },
    relogio: {
      setInterval: (f, ms) => (intervalos.set(++proximo, { f, ms }), proximo),
      clearInterval: (i) => intervalos.delete(i),
    },
  };
}
const esperar = () => new Promise((r) => setTimeout(r, 0));

test('ligar: a primeira resposta vai direto ao valor; as seguintes andam (fim de fase)', async () => {
  esquecer();
  const f = cartaoFalso();
  const amb = ambiente([stats(2700), stats(4500)]);
  const limpar = ligar(f.cartao, amb.store, amb);
  await esperar();
  assert.equal(f.corpo.hasAttribute('data-carregando'), false);
  assert.equal(f.campos['[data-coluna="ontem"] [data-numero]'].textContent, '1,5');
  assert.equal(f.campos['.tt-anel-centro [data-unidade]'].textContent, 'horas');
  assert.equal(f.rodape.textContent, 'Concluído: 45 minutos');
  assert.equal(f.arco.estilo.get('stroke-dashoffset'), '369.137px');
  assert.equal(f.arco.hasAttribute('data-vazio'), false);
  assert.match(f.anel.getAttribute('aria-label'), /37% da meta/);
  // Um retrato novo do foco (um fim de fase) pede os números de novo.
  let semTransicao = false;
  const set = f.arco.setAttribute;
  f.arco.setAttribute = (n, v) => (n === 'data-sem-transicao' && (semTransicao = true), set(n, v));
  for (const cb of amb.assinantes) cb({ status: 'idle' });
  await esperar();
  assert.equal(amb.pedidos.length, 2);
  assert.equal(f.arco.estilo.get('stroke-dashoffset'), '221.482px');
  assert.equal(semTransicao, false, 'a segunda leitura anima');
  assert.equal(f.rodape.textContent, 'Concluído: 75 minutos');
  limpar();
});

test('ligar: tt://settings e a releitura por minuto (só com a janela visível) pedem de novo; a limpeza desliga tudo', async () => {
  esquecer();
  const f = cartaoFalso();
  const amb = ambiente([stats(0), stats(0, { goal: 0 }), stats(60, { goal: 0 }), stats(0)]);
  const limpar = ligar(f.cartao, amb.store, amb);
  await esperar();
  assert.equal(f.arco.hasAttribute('data-vazio'), true, 'hoje zerado: o arco escondido');
  amb.ouvintes.get('tt://settings')({});
  await esperar();
  assert.equal(f.corpo.hasAttribute('data-sem-meta'), true, 'meta desativada');
  assert.equal(f.anel.getAttribute('aria-label'), '');
  const [periodico] = [...amb.intervalos.values()];
  assert.equal(periodico.ms, RELEITURA_MS);
  amb.doc.visibilityState = 'hidden';
  periodico.f();
  await esperar();
  assert.equal(amb.pedidos.length, 2, 'escondida, não relê');
  amb.doc.visibilityState = 'visible';
  periodico.f();
  await esperar();
  assert.equal(amb.pedidos.length, 3);
  assert.equal(f.rodape.textContent, 'Concluído: 1 minuto');
  limpar();
  assert.equal(amb.intervalos.size, 0);
  assert.equal(amb.ouvintes.size, 0);
  assert.equal(amb.assinantes.size, 0);
});

test('ligar: uma resposta velha que chega depois de uma nova é descartada', async () => {
  esquecer();
  const f = cartaoFalso();
  let soltarVelha;
  const velha = new Promise((r) => (soltarVelha = () => r(stats(600))));
  const amb = ambiente([velha, stats(1200)]);
  const limpar = ligar(f.cartao, amb.store, amb);
  for (const cb of amb.assinantes) cb({});
  await esperar();
  assert.equal(f.rodape.textContent, 'Concluído: 20 minutos');
  soltarVelha();
  await esperar();
  assert.equal(f.rodape.textContent, 'Concluído: 20 minutos');
  limpar();
});

test('ligar: ao voltar à tela, a marcação já vem com os últimos números', async () => {
  esquecer();
  const f = cartaoFalso();
  const amb = ambiente([stats(2700)]);
  const limpar = ligar(f.cartao, amb.store, amb);
  await esperar();
  limpar();
  assert.match(marcacao(), /Concluído: 45 minutos/);
  assert.doesNotMatch(marcacao(), /data-carregando/);
});

// M28: o lápis e o diálogo "Editar meta diária".
test('marcação: o lápis (botão sutil só de ícone, com nome e dica) vem antes dos números', () => {
  esquecer();
  const icone = (nome) => `<svg data-icone="${nome}"></svg>`;
  const html = marcacao(stats(2700), { icone });
  assert.match(html, /^<button type="button" class="tt-sutil tt-progresso-editar" aria-label="Editar meta diária" data-dica data-editar-meta><svg data-icone="edit"><\/svg><\/button><div class="tt-progresso-corpo"/);
  assert.match(marcacao(), /^<button [^>]*data-editar-meta><\/button>/, 'sem contexto, sem ícone');
});

function comLapis() {
  const f = cartaoFalso();
  const ouvintes = new Map();
  const lapis = {
    addEventListener: (tipo, cb) => ouvintes.set(tipo, cb),
    removeEventListener: (tipo, cb) => ouvintes.get(tipo) === cb && ouvintes.delete(tipo),
  };
  f.cartao.filhos['[data-editar-meta]'] = lapis;
  const chamadas = [];
  const dialogo = {
    criar: (opcoes) => {
      chamadas.push(['criar', opcoes]);
      return { abrir: (v) => chamadas.push(['abrir', v]), desligar: () => chamadas.push(['desligar']) };
    },
  };
  return { ...f, lapis, ouvintes, chamadas, dialogo };
}

test('ligar: o lápis cria o diálogo uma vez, abre com a meta e a hora da última leitura, e salvar relê na hora', async () => {
  esquecer();
  const f = comLapis();
  const amb = ambiente([stats(2700), stats(2700, { goal: 60 })]);
  const icone = () => '';
  const limpar = ligar(f.cartao, amb.store, { ...amb, icone, dialogo: f.dialogo });
  await esperar();
  f.ouvintes.get('click')();
  await esperar();
  const [criado, aberto] = f.chamadas;
  assert.equal(criado[0], 'criar');
  assert.equal(criado[1].gatilho, f.lapis, 'o foco volta ao lápis');
  assert.equal(criado[1].icone, icone);
  assert.equal(criado[1].ipc, amb.ipc);
  assert.deepEqual(aberto, ['abrir', stats(2700)]);
  // Salvar: o cartão relê sem esperar o tt://settings.
  criado[1].aoSalvar({ dailyGoalMinutes: 60 });
  await esperar();
  assert.equal(amb.pedidos.length, 2);
  assert.equal(f.campos['.tt-anel-centro [data-numero]'].textContent, '1');
  assert.equal(f.campos['.tt-anel-centro [data-unidade]'].textContent, 'hora');
  // Abrir de novo usa o mesmo diálogo, com os números novos.
  f.ouvintes.get('click')();
  await esperar();
  assert.deepEqual(f.chamadas.map((c) => c[0]), ['criar', 'abrir', 'abrir']);
  assert.equal(f.chamadas[2][1].dailyGoalMinutes, 60);
  limpar();
  assert.deepEqual(f.chamadas.at(-1), ['desligar']);
  assert.equal(f.ouvintes.size, 0);
});

test('ligar: antes da primeira leitura, o lápis abre com as configurações; sem clique, nenhum diálogo', async () => {
  esquecer();
  const f = comLapis();
  const amb = ambiente([new Promise(() => {})]);
  amb.ipc.configuracoes = { obter: async () => ({ dailyGoalMinutes: 30, resetHour: 3, theme: 'lite' }) };
  const limpar = ligar(f.cartao, amb.store, { ...amb, dialogo: f.dialogo });
  f.ouvintes.get('click')();
  await esperar();
  assert.deepEqual(f.chamadas[1], ['abrir', { dailyGoalMinutes: 30, resetHour: 3, theme: 'lite' }]);
  limpar();
  const g = comLapis();
  const limpar2 = ligar(g.cartao, amb.store, { ...ambiente([stats(0)]), dialogo: g.dialogo });
  limpar2();
  assert.deepEqual(g.chamadas, [], 'o diálogo só nasce no primeiro clique');
});

test('v0.3: "Ver histórico" cria a janela no primeiro clique, reabre a mesma e desliga junto com o cartão', async () => {
  esquecer();
  const f = cartaoFalso();
  const ouvintes = new Map();
  const botao = {
    addEventListener: (tipo, cb) => ouvintes.set(tipo, cb),
    removeEventListener: (tipo, cb) => ouvintes.get(tipo) === cb && ouvintes.delete(tipo),
  };
  f.cartao.filhos['[data-historico]'] = botao;
  const chamadas = [];
  const historico = {
    criar: (opcoes) => {
      chamadas.push(['criar', opcoes.gatilho]);
      return { abrir: async () => { chamadas.push(['abrir']); }, desligar: () => chamadas.push(['desligar']) };
    },
  };
  const amb = ambiente([stats(0)]);
  const limpar = ligar(f.cartao, amb.store, { ...amb, historico });
  await esperar();
  assert.deepEqual(chamadas, []);
  ouvintes.get('click')();
  ouvintes.get('click')();
  assert.deepEqual(chamadas, [['criar', botao], ['abrir'], ['abrir']]);
  limpar();
  assert.deepEqual(chamadas.at(-1), ['desligar']);
  assert.equal(ouvintes.size, 0);
});
