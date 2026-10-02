// Testes dos avisos do Android (A13; PLANO-ANDROID 4.3 e 5.4): quando a
// faixa aparece, quando o pedido sai sozinho, o HTML do cartão e da faixa e o
// estado relido na volta para a frente. A parte de DOM é conferida no
// emulador, por CDP (scripts/android/avisos.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import t from '../lib/i18n/pt-BR.js';
import {
  algoCorre,
  criarAvisos,
  descricaoDoEstado,
  devePedir,
  faixaVisivel,
  ligarAvisosDoAndroid,
  ligarPedidoNoPrimeiroIniciar,
  marcacaoCartao,
  marcacaoFaixa,
  mostraAtraso,
  mostraPermitir,
  normalizar,
} from './avisos-android.js';

const n = t.configuracoes.notificacoes;
const esperar = () => new Promise((r) => setTimeout(r, 0));
const e = (notificacoes, extra = {}) => normalizar({ notificacoes, jaPediu: false, alarmeExato: true, sdk: 37, ...extra });

test('normalizar: só os três estados; jaPediu e alarmeExato com padrão seguro', () => {
  assert.equal(normalizar(null), null);
  assert.equal(normalizar({ notificacoes: 'talvez' }), null);
  assert.deepEqual({ ...normalizar({ notificacoes: 'granted' }) }, { notificacoes: 'granted', jaPediu: false, alarmeExato: true, sdk: null });
  assert.equal(normalizar({ notificacoes: 'denied', alarmeExato: false, sdk: 31 }).alarmeExato, false);
});

test('faixa: bloqueados de vez, ou sem permissão depois do primeiro pedido; nunca antes dele', () => {
  assert.equal(faixaVisivel(null), false);
  assert.equal(faixaVisivel(e('granted')), false);
  assert.equal(faixaVisivel(e('granted', { jaPediu: true })), false);
  assert.equal(faixaVisivel(e('prompt')), false, 'antes do primeiro pedido, o pedido vem no Iniciar');
  assert.equal(faixaVisivel(e('prompt', { jaPediu: true })), true, 'recusado uma vez');
  assert.equal(faixaVisivel(e('denied')), true, 'interruptor desligado ou Android 12');
  assert.equal(faixaVisivel(e('denied', { jaPediu: true })), true);
});

test('pedido automático só se nunca saiu; Permitir e atraso conforme o estado', () => {
  assert.equal(devePedir(e('prompt')), true);
  assert.equal(devePedir(e('prompt', { jaPediu: true })), false);
  assert.equal(devePedir(e('denied')), false);
  assert.equal(devePedir(e('granted')), false);
  assert.equal(devePedir(null), false);
  assert.equal(mostraPermitir(e('granted')), false);
  assert.equal(mostraPermitir(e('prompt')), true);
  assert.equal(mostraPermitir(e('denied')), true);
  assert.equal(mostraAtraso(e('granted')), false);
  assert.equal(mostraAtraso(e('granted', { alarmeExato: false, sdk: 31 })), true);
});

test('marcacaoCartao: seção Avisos, estado, botões e a frase do atraso', () => {
  const icone = (nome, g) => `<svg data-icone="${nome}" data-grade="${g}"></svg>`;
  const ok = marcacaoCartao(e('granted'), { icone });
  assert.match(ok, /<h2 id="config-notificacoes-secao" class="tt-t-body-strong">Avisos<\/h2>/);
  assert.match(ok, /<svg data-icone="alert" data-grade="20"><\/svg>/);
  assert.ok(ok.includes(`data-estado-avisos="granted">${n.estados.granted}</span>`));
  assert.match(ok, /<button type="button" data-permitir-avisos [^>]* hidden>Permitir avisos<\/button>/);
  assert.match(ok, /<button type="button" data-abrir-avisos>Abrir configurações de avisos do sistema<\/button>/);
  assert.match(ok, /data-atraso-avisos hidden>/);
  const sem = marcacaoCartao(e('granted', { alarmeExato: false, sdk: 31 }));
  assert.match(sem, /data-atraso-avisos>/);
  assert.ok(sem.includes('Os avisos podem atrasar alguns minutos'));
  const bloqueado = marcacaoCartao(e('denied'));
  assert.ok(bloqueado.includes(n.estados.denied));
  assert.match(bloqueado, /<button type="button" data-permitir-avisos aria-describedby="config-notificacoes-desc">/);
  // Depois de o pedido já ter saído, o `prompt` não promete outro pedido.
  assert.equal(descricaoDoEstado(e('prompt')), n.estados.prompt);
  assert.equal(descricaoDoEstado(e('prompt', { jaPediu: true })), n.estados.recusado);
  assert.equal(descricaoDoEstado(e('denied', { jaPediu: true })), n.estados.denied);
  assert.ok(marcacaoCartao(e('prompt', { jaPediu: true })).includes(`data-estado-avisos="prompt">${n.estados.recusado}</span>`));
  // Sem estado (antes do primeiro `permissoes`): o texto do prompt, sem atraso.
  assert.ok(marcacaoCartao(null).includes(n.estados.prompt));
  // Ids que não cruzam com os do Sobre ("Avisos de terceiros", config-avisos).
  assert.doesNotMatch(ok, /id="config-avisos"|data-avisos=/);
});

test('marcacaoFaixa: status, ícone, texto e o botão; escondida por padrão', () => {
  const html = marcacaoFaixa({ icone: (nome, g) => `<i data-icone="${nome}" data-grade="${g}"></i>` });
  assert.match(html, /^<div class="tt-faixa-avisos" role="status" data-faixa-avisos hidden>/);
  assert.match(html, /<i data-icone="alert_off" data-grade="16"><\/i>/);
  assert.ok(html.includes(n.faixa.texto));
  assert.match(html, /<button type="button" data-permitir-avisos>Permitir avisos<\/button>/);
  assert.doesNotMatch(marcacaoFaixa({ visivel: true }), / hidden>/);
});

function docFalso(visivel = 'visible') {
  const ouvintes = {};
  return {
    visibilityState: visivel,
    documentElement: { dataset: { platform: 'android' } },
    addEventListener: (ev, cb) => (ouvintes[ev] = cb),
    disparar: (ev) => ouvintes[ev]?.(),
  };
}

function apiFalsa(respostas) {
  const chamadas = [];
  let atual = respostas.permissoes;
  return {
    chamadas,
    trocar: (r) => (atual = r),
    permissoes: async () => (chamadas.push('permissoes'), atual),
    pedirNotificacoes: async () => (chamadas.push('pedir'), (atual = respostas.depoisDoPedido ?? atual)),
    abrirConfigAvisos: async () => (chamadas.push('abrir'), { tela: 'AVISOS_DO_APP' }),
  };
}

test('criarAvisos: lê, avisa quem assina e relê na volta para a frente', async () => {
  const doc = docFalso();
  const api = apiFalsa({ permissoes: { notificacoes: 'denied', jaPediu: true, alarmeExato: true, sdk: 37 } });
  const avisos = criarAvisos({ api, doc });
  const vistos = [];
  avisos.assinar((x) => vistos.push(x.notificacoes));
  await avisos.atualizar();
  assert.deepEqual(vistos, ['denied']);
  api.trocar({ notificacoes: 'granted', jaPediu: true, alarmeExato: true, sdk: 37 });
  doc.visibilityState = 'hidden';
  doc.disparar('visibilitychange');
  await esperar();
  assert.deepEqual(vistos, ['denied'], 'escondido: não relê');
  doc.visibilityState = 'visible';
  doc.disparar('visibilitychange');
  await esperar();
  assert.deepEqual(vistos, ['denied', 'granted']);
  // Quem assina depois recebe o último na hora.
  const tarde = [];
  avisos.assinar((x) => tarde.push(x.notificacoes));
  assert.deepEqual(tarde, ['granted']);
});

test('permitir: o pedido do sistema no prompt; as configurações quando recusado de vez', async () => {
  const api = apiFalsa({ permissoes: { notificacoes: 'prompt', jaPediu: true }, depoisDoPedido: { notificacoes: 'denied', jaPediu: true } });
  const avisos = criarAvisos({ api, doc: docFalso() });
  await avisos.atualizar();
  await avisos.permitir();
  assert.equal(avisos.estado.notificacoes, 'denied');
  await avisos.permitir();
  assert.deepEqual(api.chamadas, ['permissoes', 'pedir', 'abrir']);
});

function storeFalso({ foco = null, temporizadores = null } = {}) {
  const deFoco = new Set();
  const deTemporizadores = new Set();
  return {
    foco,
    temporizadores,
    assinar: (cb) => (deFoco.add(cb), () => deFoco.delete(cb)),
    assinarTemporizadores: (cb) => (deTemporizadores.add(cb), () => deTemporizadores.delete(cb)),
    focoNovo(dto) {
      this.foco = dto;
      for (const cb of deFoco) cb(dto);
    },
    temporizadoresNovos(dto) {
      this.temporizadores = dto;
      for (const cb of deTemporizadores) cb(dto);
    },
  };
}

const parado = { status: 'idle' };
const correndo = { status: 'focus' };
const semTemporizadores = { timers: [] };

test('algoCorre: a sessão ou um temporizador', () => {
  assert.equal(algoCorre(parado, semTemporizadores), false);
  assert.equal(algoCorre(correndo, semTemporizadores), true);
  assert.equal(algoCorre({ status: 'break' }, semTemporizadores), true);
  assert.equal(algoCorre({ status: 'paused' }, semTemporizadores), false);
  assert.equal(algoCorre({ status: 'completed' }, semTemporizadores), false);
  assert.equal(algoCorre(parado, { timers: [{ status: 'paused' }, { status: 'running' }] }), true);
  assert.equal(algoCorre(null, null), false);
});

test('pedido no primeiro Iniciar: só na passagem para correndo, depois de abrir, uma vez', async () => {
  const api = apiFalsa({ permissoes: { notificacoes: 'prompt', jaPediu: false }, depoisDoPedido: { notificacoes: 'prompt', jaPediu: true } });
  const avisos = criarAvisos({ api, doc: docFalso() });
  await avisos.atualizar();
  const store = storeFalso();
  ligarPedidoNoPrimeiroIniciar(store, avisos);
  // Ao abrir, a retomada traz uma sessão que já corria: não pede.
  store.focoNovo(correndo);
  store.temporizadoresNovos(semTemporizadores);
  await esperar();
  assert.deepEqual(api.chamadas, ['permissoes']);
  store.focoNovo(parado);
  await esperar();
  assert.deepEqual(api.chamadas, ['permissoes'], 'parar não pede');
  store.focoNovo(correndo); // o Iniciar
  await esperar();
  assert.deepEqual(api.chamadas, ['permissoes', 'pedir']);
  store.focoNovo(parado);
  store.focoNovo(correndo);
  await esperar();
  assert.deepEqual(api.chamadas, ['permissoes', 'pedir'], 'uma vez só');
});

test('pedido no primeiro Iniciar: um temporizador também conta; com o pedido já feito, nada', async () => {
  const api = apiFalsa({ permissoes: { notificacoes: 'prompt', jaPediu: false } });
  const avisos = criarAvisos({ api, doc: docFalso() });
  await avisos.atualizar();
  const store = storeFalso({ foco: parado, temporizadores: semTemporizadores });
  ligarPedidoNoPrimeiroIniciar(store, avisos);
  store.temporizadoresNovos({ timers: [{ status: 'running' }] });
  await esperar();
  assert.deepEqual(api.chamadas, ['permissoes', 'pedir']);

  const api2 = apiFalsa({ permissoes: { notificacoes: 'prompt', jaPediu: true } });
  const avisos2 = criarAvisos({ api: api2, doc: docFalso() });
  await avisos2.atualizar();
  const store2 = storeFalso({ foco: parado, temporizadores: semTemporizadores });
  ligarPedidoNoPrimeiroIniciar(store2, avisos2);
  store2.focoNovo(correndo);
  await esperar();
  assert.deepEqual(api2.chamadas, ['permissoes']);
});

test('ligarAvisosDoAndroid: fora do Android, nada', () => {
  const doc = { documentElement: { dataset: { platform: 'linux' } }, addEventListener() {} };
  assert.equal(ligarAvisosDoAndroid({ api: apiFalsa({}), store: storeFalso(), doc }), null);
});
