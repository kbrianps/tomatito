// Testes do permissao.js (W14), no Node, com o navegador de mentira.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ESTADOS, TAG_DO_TESTE, criarPermissao, estadoDe } from './permissao.js';

function navegador({ permissao = 'default', resposta = 'granted', semApi = false, armazenamentoQuebrado = false } = {}) {
  const dados = new Map();
  const chamadas = { pedidos: 0, avisos: [] };
  const N = {
    permission: permissao,
    requestPermission: async () => {
      chamadas.pedidos++;
      N.permission = resposta;
      return resposta;
    },
  };
  let aoMudar = null;
  const armazenamento = {
    getItem: (k) => {
      if (armazenamentoQuebrado) throw new Error('SecurityError');
      return dados.has(k) ? dados.get(k) : null;
    },
    setItem: (k, v) => {
      if (armazenamentoQuebrado) throw new Error('SecurityError');
      dados.set(k, String(v));
    },
  };
  const perm = criarPermissao({
    notificacao: () => (semApi ? undefined : N),
    armazenamento: () => armazenamento,
    permissoes: () => ({
      query: async ({ name }) => {
        assert.equal(name, 'notifications');
        return { addEventListener: (tipo, f) => tipo === 'change' && (aoMudar = f) };
      },
    }),
    registro: async () => ({ showNotification: async (titulo, opcoes) => chamadas.avisos.push({ titulo, opcoes }) }),
  });
  return { perm, N, dados, chamadas, mudar: (p) => ((N.permission = p), aoMudar?.()) };
}

test('estadoDe: os três da permissão e o resto como sem suporte', () => {
  assert.deepEqual(ESTADOS, ['default', 'granted', 'denied', 'sem-suporte']);
  for (const e of ['default', 'granted', 'denied']) assert.equal(estadoDe(e), e);
  assert.equal(estadoDe(undefined), 'sem-suporte');
  assert.equal(estadoDe('prompt'), 'sem-suporte');
});

test('estado: sem a API, sem-suporte; com ela, a permissão', () => {
  assert.equal(navegador({ semApi: true }).perm.estado(), 'sem-suporte');
  assert.equal(navegador({ permissao: 'denied' }).perm.estado(), 'denied');
});

test('criar e consultar não pedem nada; pedir chama o requestPermission uma vez', async () => {
  const n = navegador();
  n.perm.estado();
  n.perm.deveOferecer();
  n.perm.assinar(() => {});
  assert.equal(n.chamadas.pedidos, 0);
  assert.equal(await n.perm.pedir(), 'granted');
  assert.equal(n.chamadas.pedidos, 1);
});

test('pedir: recusado dá denied; sem a API, sem-suporte sem lançar', async () => {
  assert.equal(await navegador({ resposta: 'denied' }).perm.pedir(), 'denied');
  assert.equal(await navegador({ semApi: true }).perm.pedir(), 'sem-suporte');
});

test('"Agora não" fica em tomatito:web.avisoDispensado e tira a oferta', () => {
  const n = navegador();
  assert.equal(n.perm.dispensado(), false);
  assert.equal(n.perm.deveOferecer(), true);
  n.perm.dispensar();
  assert.equal(n.dados.get('tomatito:web.avisoDispensado'), '1');
  assert.equal(n.perm.dispensado(), true);
  assert.equal(n.perm.deveOferecer(), false);
});

test('deveOferecer só com a permissão em default', () => {
  assert.equal(navegador({ permissao: 'granted' }).perm.deveOferecer(), false);
  assert.equal(navegador({ permissao: 'denied' }).perm.deveOferecer(), false);
  assert.equal(navegador({ semApi: true }).perm.deveOferecer(), false);
});

test('armazenamento bloqueado: nada lança', () => {
  const n = navegador({ armazenamentoQuebrado: true });
  assert.equal(n.perm.dispensado(), false);
  n.perm.dispensar();
});

test('assinar: avisa depois do pedido e quando o navegador muda a permissão', async () => {
  const n = navegador();
  const vistos = [];
  const cancelar = n.perm.assinar((e) => vistos.push(e));
  await new Promise((r) => setTimeout(r, 0));
  await n.perm.pedir();
  n.mudar('denied');
  assert.deepEqual(vistos, ['granted', 'denied']);
  cancelar();
  n.mudar('granted');
  assert.deepEqual(vistos, ['granted', 'denied']);
});

test('testar: só com granted, pelo service worker, na tag do teste', async () => {
  const n = navegador({ permissao: 'granted' });
  assert.equal(await n.perm.testar('Tomatito', 'corpo'), true);
  assert.deepEqual(n.chamadas.avisos, [{ titulo: 'Tomatito', opcoes: { body: 'corpo', tag: TAG_DO_TESTE, lang: 'pt-BR' } }]);
  const d = navegador({ permissao: 'default' });
  assert.equal(await d.perm.testar('Tomatito', 'corpo'), false);
  assert.equal(d.chamadas.avisos.length, 0);
});
