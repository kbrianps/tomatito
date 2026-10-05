import assert from 'node:assert/strict';
import test from 'node:test';
import { FORMATO, criarDados, interpretar, nomeDoArquivo, periodoValido, tarefaValida } from './dados.js';

const periodo = (id, endedAt = 1_800_000_000_000) => ({ id, kind: 'focus', endedAt, actualS: 1500, plannedS: 1500, completed: true });
const tarefa = (id, title = 'Ler') => ({ id, title, createdAt: 1_800_000_000_000, doneAt: null });
const arquivo = (extra = {}) => JSON.stringify({ formato: FORMATO, versao: 1, exportadoEm: '2026-10-05T12:00:00.000Z', local: {}, periods: [], tasks: [], ...extra });
const recusa = (texto) => {
  try {
    interpretar(texto);
    return null;
  } catch (e) {
    return e.code;
  }
};

function armazemFalso(inicial = {}) {
  const m = new Map(Object.entries(inicial));
  return {
    m,
    get length() {
      return m.size;
    },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}
function bancoFalso(inicial = { periods: [], tasks: [] }) {
  const dados = { periods: [...inicial.periods], tasks: [...inicial.tasks] };
  const store = (nome, rascunho) => ({
    getAll: () => rascunho[nome],
    clear: () => (rascunho[nome] = []),
    put: (x) => rascunho[nome].push(x),
  });
  return {
    dados,
    esperar: async (x) => x,
    transacao: async (nomes, _modo, f) => {
      const rascunho = { periods: [...dados.periods], tasks: [...dados.tasks] };
      const r = await f(Object.fromEntries(nomes.map((n) => [n, store(n, rascunho)])));
      Object.assign(dados, rascunho);
      return r;
    },
  };
}

test('validação dos itens', () => {
  assert.ok(periodoValido(periodo(1)));
  assert.equal(periodoValido({ ...periodo(1), endedAt: '1' }), null);
  assert.equal(periodoValido({ ...periodo(1), actualS: -1 }), null);
  assert.equal(periodoValido({ ...periodo(1), id: 0 }), null);
  assert.equal(periodoValido(null), null);
  assert.ok(tarefaValida(tarefa(1)));
  assert.ok(tarefaValida({ ...tarefa(1), doneAt: 1_800_000_000_500 }));
  assert.equal(tarefaValida(tarefa(1, '')), null);
  assert.equal(tarefaValida(tarefa(1, 'á'.repeat(256))), null);
  assert.equal(tarefaValida({ ...tarefa(1), createdAt: 1.5 }), null);
});

test('interpretar: recusa o que não é do Tomatito, o formato mais novo e os itens inválidos', () => {
  assert.equal(recusa('{'), 'formato');
  assert.equal(recusa('[]'), 'formato');
  assert.equal(recusa(JSON.stringify({ formato: 'outro', versao: 1 })), 'formato');
  assert.equal(recusa(arquivo({ versao: 2 })), 'versao');
  assert.equal(recusa(arquivo({ periods: 'x' })), 'conteudo');
  assert.equal(recusa(arquivo({ periods: [{ kind: 'focus' }] })), 'conteudo');
  assert.equal(recusa(arquivo({ tasks: [{ title: '' }] })), 'conteudo');
  assert.equal(recusa(42), 'formato');
});

test('interpretar: só as chaves tomatito: em texto entram, sem o estado corrompido', () => {
  const r = interpretar(
    arquivo({
      local: { 'tomatito:config': '{"theme":"dark"}', 'tomatito:estado.corrompido': 'x', 'outra:chave': 'y', 'tomatito:web.tempoNaAba': 0 },
      periods: [periodo(1)],
      tasks: [tarefa(1)],
    }),
  );
  assert.deepEqual(r.local, { 'tomatito:config': '{"theme":"dark"}' });
  assert.equal(r.periods.length, 1);
  assert.equal(r.exportadoEm, '2026-10-05T12:00:00.000Z');
});

test('nomeDoArquivo: tomatito-AAAA-MM-DD.json pela data local', () => {
  assert.equal(nomeDoArquivo(new Date(2026, 9, 5, 23, 59)), 'tomatito-2026-10-05.json');
});

test('exportar e importar: ida e volta, substituindo o que havia', async () => {
  const origem = criarDados({
    armazem: armazemFalso({ 'tomatito:config': '{"theme":"dark"}', 'tomatito:estado': '{}', 'tomatito:estado.corrompido': 'x', alheia: '1' }),
    banco: bancoFalso({ periods: [periodo(1), periodo(2)], tasks: [tarefa(1)] }),
    versaoDoApp: '0.3.0',
    agora: () => new Date(2026, 9, 5, 9, 0),
  });
  const saida = await origem.exportar();
  assert.equal(saida.nome, 'tomatito-2026-10-05.json');
  assert.equal(saida.periods, 2);
  assert.equal(saida.tasks, 1);
  const lido = JSON.parse(saida.texto);
  assert.equal(lido.formato, FORMATO);
  assert.equal(lido.app, '0.3.0');
  assert.deepEqual(Object.keys(lido.local).sort(), ['tomatito:config', 'tomatito:estado']);

  const armazem = armazemFalso({ 'tomatito:config': '{"theme":"lite"}', 'tomatito:web.tempoNaAba': '0', alheia: '2' });
  const banco = bancoFalso({ periods: [periodo(9)], tasks: [tarefa(7), tarefa(8)] });
  const recargas = [];
  const destino = criarDados({ armazem, banco, recarregar: () => recargas.push(Object.fromEntries(armazem.m)) });
  await destino.importar(destino.interpretar(saida.texto));
  assert.deepEqual(banco.dados.periods.map((p) => p.id), [1, 2]);
  assert.deepEqual(banco.dados.tasks.map((x) => x.id), [1]);
  // A recarga já encontra o localStorage trocado; a chave alheia fica.
  assert.deepEqual(recargas, [{ 'tomatito:config': '{"theme":"dark"}', 'tomatito:estado': '{}', alheia: '2' }]);
});

test('importar: uma falha na gravação não toca no localStorage nem recarrega', async () => {
  const armazem = armazemFalso({ 'tomatito:config': 'antes' });
  const banco = bancoFalso();
  banco.transacao = async () => {
    throw new Error('cota');
  };
  const recargas = [];
  const d = criarDados({ armazem, banco, recarregar: () => recargas.push(1) });
  await assert.rejects(d.importar({ local: { 'tomatito:config': 'depois' }, periods: [], tasks: [] }), /cota/);
  assert.equal(armazem.getItem('tomatito:config'), 'antes');
  assert.deepEqual(recargas, []);
});
