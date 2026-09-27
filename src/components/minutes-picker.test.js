// Testes do seletor de minutos (M17): a regra do teclado e dos chevrons, o
// ARIA e a ligação com um DOM falso. O desenho é conferido na prévia
// (scripts/preview/cartao-sessao.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { andar, aria, ligarSeletor, limitar, marcacao, PAGINA, valorDaTecla } from './minutes-picker.js';

const PRODUCAO = { min: 5, max: 240, passo: 5 };
const DEBUG = { min: 1, max: 240, passo: 1 };
const tecla = (key, mods = {}) => ({ key, ...mods });

test('↑/↓ andam um passo, PageUp/PageDown 15 min e Home/End vão aos limites (3.8)', () => {
  assert.equal(PAGINA, 15);
  assert.equal(valorDaTecla(25, tecla('ArrowUp'), PRODUCAO), 30);
  assert.equal(valorDaTecla(25, tecla('ArrowDown'), PRODUCAO), 20);
  assert.equal(valorDaTecla(25, tecla('PageUp'), PRODUCAO), 40);
  assert.equal(valorDaTecla(25, tecla('PageDown'), PRODUCAO), 10);
  assert.equal(valorDaTecla(25, tecla('Home'), PRODUCAO), 5);
  assert.equal(valorDaTecla(25, tecla('End'), PRODUCAO), 240);
  // No debug, de 1 em 1.
  assert.equal(valorDaTecla(25, tecla('ArrowUp'), DEBUG), 26);
  assert.equal(valorDaTecla(25, tecla('ArrowDown'), DEBUG), 24);
  assert.equal(valorDaTecla(25, tecla('PageUp'), DEBUG), 40);
  assert.equal(valorDaTecla(25, tecla('Home'), DEBUG), 1);
});

test('os limites seguram o valor: 5 e 240', () => {
  assert.equal(valorDaTecla(5, tecla('ArrowDown'), PRODUCAO), 5);
  assert.equal(valorDaTecla(10, tecla('PageDown'), PRODUCAO), 5);
  assert.equal(valorDaTecla(240, tecla('ArrowUp'), PRODUCAO), 240);
  assert.equal(valorDaTecla(235, tecla('PageUp'), PRODUCAO), 240);
  assert.equal(limitar(0, PRODUCAO), 5);
  assert.equal(limitar(999, PRODUCAO), 240);
});

test('fora da grade, o passo para no primeiro ponto da grade antes do alvo', () => {
  // Um valor de 1 em 1 (vindo do debug) num seletor de 5 em 5.
  assert.equal(andar(23, 5, PRODUCAO), 25);
  assert.equal(andar(23, -5, PRODUCAO), 20);
  assert.equal(andar(23, 15, PRODUCAO), 35);
  assert.equal(andar(23, -15, PRODUCAO), 10);
  // Da faixa inteira, de passo em passo, nunca sai da grade.
  for (let v = 5; v <= 240; v += 5) {
    for (const d of [5, -5, 15, -15]) {
      const n = andar(v, d, PRODUCAO);
      assert.equal(n % 5, 0);
      assert.ok(n >= 5 && n <= 240);
    }
  }
});

test('outras teclas e atalhos com Ctrl, Alt ou Meta não são do seletor', () => {
  for (const key of ['ArrowLeft', 'ArrowRight', 'Enter', ' ', 'Tab', 'a', '5']) {
    assert.equal(valorDaTecla(25, tecla(key), PRODUCAO), null, key);
  }
  assert.equal(valorDaTecla(25, tecla('ArrowUp', { ctrlKey: true }), PRODUCAO), null);
  assert.equal(valorDaTecla(25, tecla('Home', { altKey: true }), PRODUCAO), null);
  assert.equal(valorDaTecla(25, tecla('End', { metaKey: true }), PRODUCAO), null);
});

test('ARIA: spinbutton com mínimo, máximo, valor e o valor por extenso', () => {
  assert.deepEqual(aria(25, PRODUCAO), {
    'aria-valuemin': '5',
    'aria-valuemax': '240',
    'aria-valuenow': '25',
    'aria-valuetext': '25 minutos',
  });
  assert.equal(aria(1, DEBUG)['aria-valuetext'], '1 minuto');
  const html = marcacao({ valor: 25, ...PRODUCAO, descricao: 'frase' }, (n) => `<svg data-i="${n}"></svg>`);
  assert.match(
    html,
    /<div class="tt-seletor-campo" role="spinbutton" tabindex="0" aria-label="Duração da sessão" aria-valuemin="5" aria-valuemax="240" aria-valuenow="25" aria-valuetext="25 minutos" aria-describedby="frase">/,
  );
  assert.match(html, /<span class="tt-seletor-unidade" aria-hidden="true">min<\/span>/);
  // Os chevrons ficam fora do Tab, com nome e dica (botões só de ícone, 3.8).
  const chevrons = [...html.matchAll(/<button type="button" class="tt-seletor-chevron" data-passo="([+-]1)" tabindex="-1" aria-label="(\w+)" data-dica><svg data-i="(\w+)"><\/svg><\/button>/g)];
  assert.deepEqual(chevrons.map((m) => m.slice(1)), [['+1', 'Aumentar', 'chevron_up'], ['-1', 'Diminuir', 'chevron_down']]);
});

// Um DOM mínimo para o ligarSeletor.
function elemento(extra = {}) {
  const ouvintes = {};
  return Object.assign(
    {
      attrs: {},
      dataset: {},
      disabled: false,
      textContent: '',
      setAttribute(k, v) { this.attrs[k] = v; },
      addEventListener: (tipo, f) => ((ouvintes[tipo] ??= new Set()).add(f)),
      removeEventListener: (tipo, f) => ouvintes[tipo]?.delete(f),
      disparar: (tipo, e) => ouvintes[tipo]?.forEach((f) => f(e)),
      ouvintes,
    },
    extra,
  );
}
function montarDom() {
  const campo = elemento();
  const numero = elemento();
  const mais = elemento({ dataset: { passo: '+1' } });
  const menos = elemento({ dataset: { passo: '-1' } });
  for (const b of [mais, menos]) b.closest = (sel) => (['[data-passo]', '.tt-seletor-chevrons'].includes(sel) ? b : null);
  const raiz = elemento({
    querySelector: (sel) => ({ '[role="spinbutton"]': campo, '[data-numero]': numero })[sel],
    querySelectorAll: (sel) => (sel === '[data-passo]' ? [mais, menos] : []),
  });
  const teclar = (key, mods) => {
    const e = { key, ...mods, cancelado: false, preventDefault() { this.cancelado = true; } };
    campo.disparar('keydown', e);
    return e;
  };
  const clicar = (b) => raiz.disparar('click', { target: b });
  return { raiz, campo, numero, mais, menos, teclar, clicar };
}

test('ligado: teclas e chevrons mudam o valor, o ARIA e o número', () => {
  const d = montarDom();
  const mudancas = [];
  const s = ligarSeletor(d.raiz, { valor: 25, ...PRODUCAO, aoMudar: (v) => mudancas.push(v) });
  assert.equal(d.numero.textContent, '25');
  assert.equal(d.campo.attrs['aria-valuenow'], '25');

  assert.equal(d.teclar('ArrowUp').cancelado, true, 'a tecla não rola a tela');
  assert.equal(s.valor, 30);
  assert.equal(d.numero.textContent, '30');
  assert.equal(d.campo.attrs['aria-valuetext'], '30 minutos');
  d.teclar('PageDown');
  d.teclar('ArrowDown');
  assert.equal(s.valor, 10);
  d.clicar(d.mais);
  assert.equal(s.valor, 15);
  d.clicar(d.menos);
  d.clicar(d.menos);
  assert.equal(s.valor, 5);
  assert.deepEqual(mudancas, [30, 15, 10, 15, 10, 5]);

  assert.equal(d.teclar('Tab').cancelado, false, 'outras teclas passam');
  assert.equal(d.teclar('ArrowUp', { ctrlKey: true }).cancelado, false);
});

test('ligado: no limite, o chevron desabilita, e o clique no desabilitado não faz nada', () => {
  const d = montarDom();
  const mudancas = [];
  const s = ligarSeletor(d.raiz, { valor: 5, ...PRODUCAO, aoMudar: (v) => mudancas.push(v) });
  assert.equal(d.menos.disabled, true);
  assert.equal(d.mais.disabled, false);
  d.clicar(d.menos);
  d.teclar('ArrowDown');
  assert.deepEqual(mudancas, [], 'no mínimo, descer não muda nada');
  d.teclar('End');
  assert.equal(s.valor, 240);
  assert.equal(d.mais.disabled, true);
  assert.equal(d.menos.disabled, false);
});

test('ligado: o mousedown nos chevrons não tira o foco; configurar troca a faixa; desligar solta tudo', () => {
  const d = montarDom();
  const mudancas = [];
  const s = ligarSeletor(d.raiz, { valor: 23, ...DEBUG, aoMudar: (v) => mudancas.push(v) });
  const e = { target: d.mais, preventDefault() { this.cancelado = true; } };
  d.raiz.disparar('mousedown', e);
  assert.equal(e.cancelado, true);
  s.configurar({ min: 5, max: 20, passo: 5 });
  assert.equal(s.valor, 20, 'traz o valor para dentro da faixa nova');
  assert.deepEqual(mudancas, [20]);
  assert.equal(d.campo.attrs['aria-valuemax'], '20');
  s.configurar({ min: 5, max: 240, passo: 5 });
  assert.deepEqual(mudancas, [20], 'sem mudança de valor, sem aviso');
  s.desligar();
  assert.equal(d.campo.ouvintes.keydown.size, 0);
  assert.equal(d.raiz.ouvintes.click.size, 0);
  assert.equal(d.raiz.ouvintes.mousedown.size, 0);
});
