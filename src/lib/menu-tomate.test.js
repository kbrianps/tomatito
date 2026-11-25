// Testes do menu do botão direito do tomate (M56; PLANO.md, 5.10), sem Tauri.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TAMANHOS, criarItens, itensDaDuracao, itensDoMenu, ladoArrastado, ladoDoItem, minutosDoItem, opacidadeDoItem } from './menu-tomate.js';
import { vista } from './tomate.js';
import t from './i18n/pt-BR.js';

const ocioso = vista(null, 0);

const ids = (itens) => itens.map((i) => i.id ?? '—');

test('o menu completo: ações do foco, tamanho, sempre na frente, configurações, voltar, minimizar e fechar', () => {
  const itens = itensDoMenu({ vista: ocioso, tamanho: 280, sempreNaFrente: true, naFrente: true });
  assert.deepEqual(ids(itens), [
    'principal', 'pular', 'encerrar', '—', 'tamanho', 'opacidade', 'sempre-na-frente',
    '—', 'configuracoes', 'voltar', '—', 'minimizar', 'fechar',
  ]);
  const [principal, pular, encerrar] = itens;
  // Os textos e o "ativo" são os dos botões (a mesma vista).
  assert.equal(principal.texto, ocioso.principal.rotulo);
  assert.equal(pular.texto, ocioso.pular.rotulo);
  assert.equal(pular.ativo, ocioso.pular.ativo);
  assert.equal(encerrar.ativo, ocioso.encerrar.ativo);
  assert.equal(itens.find((i) => i.id === 'voltar').texto, t.tomate.voltar);
  assert.equal(itens.find((i) => i.id === 'configuracoes').texto, t.tomate.configuracoes);
  const tamanho = itens.find((i) => i.id === 'tamanho');
  assert.deepEqual(
    tamanho.itens.map((i) => [i.id, i.texto, i.marcado]),
    [['tamanho-240', 'Pequeno', false], ['tamanho-280', 'Médio', true], ['tamanho-320', 'Grande', false]],
  );
  assert.equal(itens.find((i) => i.id === 'sempre-na-frente').marcado, true);
});

test('sem "Sempre na frente" onde o código não consegue (Wayland)', () => {
  const itens = itensDoMenu({ vista: ocioso, tamanho: 240, sempreNaFrente: false, naFrente: true });
  assert.ok(!ids(itens).includes('sempre-na-frente'));
  assert.equal(itens.find((i) => i.id === 'tamanho').itens[0].marcado, true);
  const desligado = itensDoMenu({ vista: ocioso, tamanho: 240, sempreNaFrente: true, naFrente: false });
  assert.equal(desligado.find((i) => i.id === 'sempre-na-frente').marcado, false);
});

test('sem texto vazio no menu', () => {
  const todos = (itens) => itens.flatMap((i) => (i.itens ? [i, ...todos(i.itens)] : [i]));
  for (const i of todos(itensDoMenu({ vista: ocioso, tamanho: 320, sempreNaFrente: true, naFrente: true }))) {
    if (i.tipo === 'separador') continue;
    assert.ok(i.texto.trim(), i.id);
  }
});

test('lado do item de tamanho', () => {
  assert.deepEqual(TAMANHOS, [240, 280, 320]);
  assert.equal(ladoDoItem('tamanho-240'), 240);
  assert.equal(ladoDoItem('tamanho-320'), 320);
  for (const ruim of ['tamanho-300', 'tamanho-', 'fechar', null, undefined]) assert.equal(ladoDoItem(ruim), null);
});

test('cria cada item à parte (o canal da ação não se perde), em ordem, e guarda todos para fechar', async () => {
  const chamados = [];
  const criados = [];
  const fabrica = (tipo) => async (o) => {
    const r = { tipo, ...o };
    criados.push(r);
    return r;
  };
  const fabricas = {
    item: fabrica('item'),
    marcar: fabrica('marcar'),
    submenu: fabrica('submenu'),
    separador: fabrica('separador'),
  };
  const recursos = [];
  const menu = await criarItens(
    itensDoMenu({ vista: ocioso, tamanho: 280, sempreNaFrente: true, naFrente: false }),
    (id) => chamados.push(id),
    fabricas,
    recursos,
  );
  assert.deepEqual(menu.map((i) => i.tipo), ['item', 'item', 'item', 'separador', 'submenu', 'submenu', 'marcar', 'separador', 'item', 'item', 'separador', 'item', 'item']);
  assert.equal(menu[1].enabled, ocioso.pular.ativo);
  const submenu = menu[4];
  assert.equal(submenu.text, 'Tamanho');
  assert.deepEqual(submenu.items.map((i) => [i.tipo, i.text, i.checked]), [['marcar', 'Pequeno', false], ['marcar', 'Médio', true], ['marcar', 'Grande', false]]);
  assert.ok(!('enabled' in submenu.items[1]));
  assert.deepEqual(menu[5].items.map((i) => [i.text, i.checked]), [['100%', true], ['85%', false], ['70%', false], ['55%', false], ['40%', false]]);
  assert.equal(menu[6].checked, false);
  for (const i of [menu[0], ...submenu.items, menu[6], menu.at(-1)]) i.action();
  assert.deepEqual(chamados, ['principal', 'tamanho-240', 'tamanho-280', 'tamanho-320', 'sempre-na-frente', 'fechar']);
  // Todos os itens, os do submenu também, ficam para o close().
  assert.equal(recursos.length, criados.length);
  assert.equal(recursos.length, 21);
  assert.ok(criados.every((c) => !('id' in c)));
});

test('duração: a lista do clique no tempo, com a atual marcada, e os ids', () => {
  assert.deepEqual(
    itensDaDuracao(30).map((i) => [i.id, i.texto, i.marcado]),
    [['duracao-15', '15 min', false], ['duracao-20', '20 min', false], ['duracao-25', '25 min', false], ['duracao-30', '30 min', true], ['duracao-45', '45 min', false], ['duracao-60', '60 min', false], ['duracao-90', '90 min', false]],
  );
  assert.deepEqual(itensDaDuracao(50).filter((i) => i.marcado).map((i) => i.id), ['duracao-50']);
  assert.equal(minutosDoItem('duracao-45'), 45);
  for (const ruim of ['duracao-3', 'duracao-32', 'duracao-245', 'opacidade-40', null]) assert.equal(minutosDoItem(ruim), null);
});

test('opacidade e arraste da alça', () => {
  assert.equal(opacidadeDoItem('opacidade-55'), 55);
  assert.equal(opacidadeDoItem('opacidade-50'), null);
  assert.equal(ladoArrastado(280, 0, 0), 280);
  assert.equal(ladoArrastado(280, 34, 12), 310);
  assert.equal(ladoArrastado(280, -400, -400), 160);
  assert.equal(ladoArrastado(280, 900, 0), 480);
});
