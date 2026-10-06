import assert from 'node:assert/strict';
import test from 'node:test';
import { ligar, marcacao } from './compacto.js';

const esperar = () => new Promise((r) => setTimeout(r, 0));
function cartaoFalso() {
  const cliques = [];
  const botao = { disabled: false, removido: false, addEventListener: (_, f) => cliques.push(f), remove() { this.removido = true; } };
  return {
    botao,
    cliques,
    html: '',
    insertAdjacentHTML(onde, html) {
      assert.equal(onde, 'beforeend');
      this.html += html;
      this.lastElementChild = botao;
    },
  };
}

test('marcação: um botão só de ícone, com o nome "Modo compacto"', () => {
  const html = marcacao((n, g) => `<svg data-icone="${n}" data-grade="${g}"></svg>`);
  assert.equal(html, '<button type="button" class="tt-sutil tt-sessao-compacto" aria-label="Modo compacto" data-dica data-compacto><svg data-icone="picture_in_picture" data-grade="16"></svg></button>');
});

test('só no desktop com Full: na web e no Android, nada', async () => {
  for (const casca of [{ full: true, web: true }, { full: false, web: false, android: true }]) {
    const c = cartaoFalso();
    ligar(c, { plataforma: async () => ({ casca }) });
    await esperar();
    assert.equal(c.html, '');
  }
});

test('o clique pede o Full no modo compacto, uma vez por vez, e a limpeza tira o botão', async () => {
  const c = cartaoFalso();
  const pedidos = [];
  let soltar;
  const ipc = async () => ({ full: { trocarModo: (entrar, opcoes) => (pedidos.push([entrar, opcoes]), new Promise((ok) => (soltar = ok))) } });
  const limpar = ligar(c, { plataforma: async () => ({ casca: { full: true, web: false } }), ipc });
  await esperar();
  assert.match(c.html, /data-compacto/);
  c.cliques[0]();
  await esperar();
  c.cliques[0]();
  assert.deepEqual(pedidos, [[true, { compacto: true }]]);
  assert.equal(c.botao.disabled, true);
  soltar();
  await esperar();
  assert.equal(c.botao.disabled, false);
  limpar();
  assert.equal(c.botao.removido, true);
});
