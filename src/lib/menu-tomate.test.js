// Testes do menu do botão direito do tomate (M56; PLANO.md, 5.10), sem Tauri.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TAMANHOS, criarItens, itensDoMenu, ladoDoItem } from './menu-tomate.js';
import { vista } from './tomate.js';
import t from './i18n/pt-BR.js';

const ocioso = vista(null, 0);

const ids = (itens) => itens.map((i) => i.id ?? '—');

test('o menu completo: ações do foco, tamanho, sempre na frente, configurações, voltar, minimizar e fechar', () => {
  const itens = itensDoMenu({ vista: ocioso, tamanho: 280, sempreNaFrente: true, naFrente: true });
  assert.deepEqual(ids(itens), [
    'principal', 'pular', 'encerrar', '—', 'tamanho', 'sempre-na-frente',
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
  assert.deepEqual(menu.map((i) => i.tipo), ['item', 'item', 'item', 'separador', 'submenu', 'marcar', 'separador', 'item', 'item', 'separador', 'item', 'item']);
  assert.equal(menu[1].enabled, ocioso.pular.ativo);
  const submenu = menu[4];
  assert.equal(submenu.text, 'Tamanho');
  assert.deepEqual(submenu.items.map((i) => [i.tipo, i.text, i.checked]), [['marcar', 'Pequeno', false], ['marcar', 'Médio', true], ['marcar', 'Grande', false]]);
  assert.ok(!('enabled' in submenu.items[1]));
  assert.equal(menu[5].checked, false);
  for (const i of [menu[0], ...submenu.items, menu[5], menu.at(-1)]) i.action();
  assert.deepEqual(chamados, ['principal', 'tamanho-240', 'tamanho-280', 'tamanho-320', 'sempre-na-frente', 'fechar']);
  // Todos os itens, os do submenu também, ficam para o close().
  assert.equal(recursos.length, criados.length);
  assert.equal(recursos.length, 15);
  assert.ok(criados.every((c) => !('id' in c)));
});
