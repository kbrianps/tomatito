import assert from 'node:assert/strict';
import test from 'node:test';
import { CEDIDA, TRAVA, esperarVez, marcacao } from './aba-unica.js';

/** Um gerente de travas de mentira, com uma fila por nome. */
function travas() {
  let ocupada = false;
  const fila = [];
  const conceder = (cb) => {
    ocupada = true;
    Promise.resolve(cb({ name: TRAVA })).then(() => {
      ocupada = false;
      fila.shift()?.();
    });
  };
  return {
    soltar() {
      ocupada = false;
      fila.shift()?.();
    },
    request(nome, opcoes, cb) {
      assert.equal(nome, TRAVA);
      if (typeof opcoes === 'function') {
        if (ocupada) fila.push(() => conceder(opcoes));
        else conceder(opcoes);
        return Promise.resolve();
      }
      if (ocupada) cb(null);
      else conceder(cb);
      return Promise.resolve();
    },
  };
}
function canais() {
  const todos = new Set();
  return () => {
    const ouvintes = [];
    const canal = {
      addEventListener: (_, f) => ouvintes.push(f),
      postMessage: (data) => {
        for (const outro of todos) if (outro !== canal) outro.receber(data);
      },
      receber: (data) => ouvintes.forEach((f) => f({ data })),
    };
    todos.add(canal);
    return canal;
  };
}
function aba({ marcada = false } = {}) {
  const guardado = new Map(marcada ? [[CEDIDA, '1']] : []);
  const cliques = [];
  const botao = { disabled: false, textContent: '', addEventListener: (_, f) => cliques.push(f), focus() {} };
  const avisos = [];
  const doc = {
    documentElement: { dataset: {} },
    body: { append: (el) => avisos.push(el) },
    createElement: () => ({
      className: '',
      innerHTML: '',
      querySelector: () => botao,
      remove() {
        avisos.splice(avisos.indexOf(this), 1);
      },
    }),
  };
  const recargas = [];
  return {
    doc,
    avisos,
    botao,
    cliques,
    recargas,
    guardado,
    sessao: { getItem: (k) => guardado.get(k) ?? null, setItem: (k, v) => guardado.set(k, v), removeItem: (k) => guardado.delete(k) },
    recarregar: () => recargas.push(1),
  };
}
const esperar = () => new Promise((r) => setTimeout(r, 0));

test('marcação: um alertdialog com o título, o texto e "Usar nesta aba"', () => {
  const html = marcacao();
  assert.match(html, /role="alertdialog" aria-labelledby="tt-aba-unica-titulo" aria-describedby="tt-aba-unica-texto"/);
  assert.match(html, /<h1 [^>]*>O Tomatito já está aberto em outra aba<\/h1>/);
  assert.match(html, /<button type="button" class="tt-accent" data-usar-aqui>Usar nesta aba<\/button>/);
});

test('sem Web Locks (ou sem documento), segue sem bloqueio', async () => {
  assert.equal(await esperarVez({ locks: undefined, doc: aba().doc }), 'sem-trava');
  assert.equal(await esperarVez({ locks: travas(), doc: undefined }), 'sem-trava');
});

test('a primeira aba entra direto; a segunda mostra o aviso e assume quando a primeira fecha', async () => {
  const locks = travas();
  const novoCanal = canais();
  const a1 = aba();
  const a2 = aba();
  assert.equal(await esperarVez({ locks, novoCanal, ...a1 }), 'primeira');
  assert.equal(a1.avisos.length, 0);

  let segunda = null;
  void esperarVez({ locks, novoCanal, ...a2 }).then((r) => (segunda = r));
  await esperar();
  assert.equal(segunda, null);
  assert.equal(a2.avisos.length, 1);
  assert.equal(a2.doc.documentElement.dataset.abaBloqueada, '');

  locks.soltar();
  await esperar();
  assert.equal(segunda, 'depois');
  assert.equal(a2.avisos.length, 0);
  assert.equal('abaBloqueada' in a2.doc.documentElement.dataset, false);
});

test('"Usar nesta aba": a dona marca que cedeu e recarrega; ao voltar, entra na fila sem disputar', async () => {
  const locks = travas();
  const novoCanal = canais();
  const a1 = aba();
  const a2 = aba();
  await esperarVez({ locks, novoCanal, ...a1 });
  let segunda = null;
  void esperarVez({ locks, novoCanal, ...a2 }).then((r) => (segunda = r));
  await esperar();

  a2.cliques[0]();
  assert.equal(a2.botao.disabled, true);
  assert.equal(a2.botao.textContent, 'Passando para esta aba…');
  assert.deepEqual(a1.recargas, [1]);
  assert.equal(a1.guardado.get(CEDIDA), '1');

  // A recarga da primeira solta a trava, e a segunda assume.
  locks.soltar();
  await esperar();
  assert.equal(segunda, 'depois');

  // A primeira volta com a marca: aviso direto, e a marca some.
  const a1b = aba({ marcada: true });
  let voltou = null;
  void esperarVez({ locks, novoCanal, ...a1b }).then((r) => (voltou = r));
  await esperar();
  assert.equal(voltou, null);
  assert.equal(a1b.avisos.length, 1);
  assert.equal(a1b.guardado.has(CEDIDA), false);
});
