import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MIN_INTERROMPIDO_S, conta, erroDoBanco, naoExiste, somarFoco, tarefa, visiveis } from './contagem.js';

// 2026-09-28 00:00 em -03:00 (uma segunda), como nos testes do stats.rs.
const SEG_0H = 1_790_564_400_000;
const MIN = 60_000;
const H = 60 * MIN;
const DIA = 24 * H;

const periodo = (kind, fim, actualS, completed) => ({ kind, endedAt: SEG_0H + fim, actualS, completed });

test('o mínimo do interrompido é o do stats.rs', () => {
  const rs = readFileSync(fileURLToPath(new URL('../../../src-tauri/src/stats.rs', import.meta.url)), 'utf8');
  assert.match(rs, new RegExp(`pub const MIN_INTERRUPTED_S: u64 = ${MIN_INTERROMPIDO_S};`));
});

test('só foco conta: concluído, ou interrompido com pelo menos 1 min', () => {
  assert.equal(conta(periodo('focus', 0, 1500, true)), true);
  assert.equal(conta(periodo('focus', 0, 30, true)), true);
  assert.equal(conta(periodo('focus', 0, 60, false)), true);
  assert.equal(conta(periodo('focus', 0, 59, false)), false);
  assert.equal(conta(periodo('break', 0, 300, true)), false);
});

test('a soma usa [start, end) pelo endedAt', () => {
  const hoje = { start: SEG_0H, end: SEG_0H + DIA };
  const ps = [
    periodo('focus', -1, 1500, true), // domingo 23:59:59.999
    periodo('focus', 0, 1500, true), // segunda 00:00, conta
    periodo('focus', 10 * H, 1200, false), // interrompido de 20 min, conta
    periodo('focus', 11 * H, 45, false), // 45 s, não conta
    periodo('break', 12 * H, 300, true), // intervalo, não conta
    periodo('focus', DIA, 1500, true), // terça 00:00, fora
  ];
  assert.equal(somarFoco(ps, hoje), 2700);
  assert.equal(somarFoco(ps, null), 0);
  assert.equal(somarFoco([], hoje), 0);
});

test('a lista: pendentes sempre, concluídas desde a virada, na ordem do id', () => {
  const desde = SEG_0H;
  const lista = [
    { id: 3, title: 'C', createdAt: 0, doneAt: SEG_0H - 1 },
    { id: 1, title: 'A', createdAt: 0, doneAt: null },
    { id: 2, title: 'B', createdAt: 0, doneAt: SEG_0H },
  ];
  assert.deepEqual(visiveis(lista, desde).map((t) => t.title), ['A', 'B']);
});

test('a tarefa sai com as chaves do TaskDto, na ordem do desktop', () => {
  assert.deepEqual(Object.keys(tarefa({ title: 'A', createdAt: 10, doneAt: undefined, id: 3 })), ['id', 'title', 'createdAt', 'doneAt']);
  assert.deepEqual(tarefa({ title: 'A', createdAt: 10, id: 3 }), { id: 3, title: 'A', createdAt: 10, doneAt: null });
});

test('os erros têm o formato do desktop', () => {
  assert.deepEqual(naoExiste(3), { code: 'notFound', message: 'não existe a tarefa 3' });
  assert.equal(erroDoBanco(new Error('cheio')).code, 'storage');
});
