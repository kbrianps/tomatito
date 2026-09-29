// Testes das larguras em px CSS (M43) com DOM falso, e as regras do CSS que
// contornam o zoom do WebKitGTK. O efeito nos dois motores, com zoom de 120% a
// 200%, é conferido pelo scripts/preview/responsivo.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { larguraDaEntrada, ligarLarguras, px } from './larguras.js';

const ler = (caminho) => readFileSync(new URL(`../../${caminho}`, import.meta.url), 'utf8');

function elemento(largura, largurasDentro = []) {
  const props = new Map();
  const el = {
    nodeType: 1,
    isConnected: true,
    clientWidth: largura,
    dataset: {},
    filhos: largurasDentro,
    style: { setProperty: (k, v) => props.set(k, v) },
    props,
    matches: (sel) => sel === '[data-largura]' && 'largura' in el.dataset,
    querySelectorAll: () => el.filhos.filter((f) => 'largura' in f.dataset),
  };
  return el;
}

function ambiente() {
  const h = elemento(0);
  const body = elemento(0);
  const ros = [];
  const mos = [];
  class RO {
    constructor(cb) { this.cb = cb; this.alvos = new Set(); ros.push(this); }
    observe(el) { this.alvos.add(el); }
    unobserve(el) { this.alvos.delete(el); }
    disconnect() { this.alvos.clear(); }
  }
  class MO {
    constructor(cb) { this.cb = cb; mos.push(this); }
    observe(alvo, opcoes) { this.alvo = alvo; this.opcoes = opcoes; }
    disconnect() { this.alvo = null; }
  }
  const win = { innerWidth: 480 };
  return { doc: { documentElement: h, body }, win, RO, MO, h, body, ros, mos };
}

test('px arredonda para 3 casas e larguraDaEntrada lê a caixa de conteúdo', () => {
  assert.equal(px(251.37695), '251.377px');
  assert.equal(px(4.8), '4.8px');
  assert.equal(larguraDaEntrada({ contentBoxSize: [{ inlineSize: 251.5 }], contentRect: { width: 1 } }), 251.5);
  assert.equal(larguraDaEntrada({ contentBoxSize: { inlineSize: 12 } }), 12);
  assert.equal(larguraDaEntrada({ contentRect: { width: 9 } }), 9);
});

test('ligarLarguras: --tt-vw no <html> e a largura de cada [data-largura], na hora e a cada mudança', () => {
  const a = ambiente();
  const rolagem = elemento(431);
  rolagem.dataset.largura = '--tt-larg-rolagem';
  const semNome = elemento(10);
  semNome.dataset.largura = 'cor';                    // não é variável: ignorado
  a.body.filhos = [rolagem, semNome];
  ligarLarguras(a);
  assert.equal(a.h.props.get('--tt-vw'), '4.8px');
  assert.equal(rolagem.props.get('--tt-larg-rolagem'), '431px');
  assert.equal(semNome.props.size, 0);
  const [ro] = a.ros;
  assert.ok(ro.alvos.has(a.h) && ro.alvos.has(rolagem));
  assert.deepEqual(a.mos[0].opcoes, { childList: true, subtree: true });

  // Zoom de 160%: a janela e a área encolhem em px CSS.
  a.win.innerWidth = 300;
  ro.cb([{ target: a.h }, { target: rolagem, contentBoxSize: [{ inlineSize: 251.377 }] }]);
  assert.equal(a.h.props.get('--tt-vw'), '3px');
  assert.equal(rolagem.props.get('--tt-larg-rolagem'), '251.377px');
});

test('ligarLarguras: elementos novos das telas entram, e os que saíram deixam de ser observados', () => {
  const a = ambiente();
  ligarLarguras(a);
  const [ro] = a.ros;
  const mostrador = elemento(228.125);
  mostrador.dataset.largura = '--tt-larg-mostrador';
  const tela = elemento(400, [mostrador]);
  a.mos[0].cb([{ addedNodes: [tela, { nodeType: 3 }] }]);
  assert.equal(mostrador.props.get('--tt-larg-mostrador'), '228.125px');
  assert.ok(ro.alvos.has(mostrador));
  mostrador.isConnected = false;
  ro.cb([{ target: mostrador, contentBoxSize: [{ inlineSize: 0 }] }]);
  assert.ok(!ro.alvos.has(mostrador));
  assert.equal(mostrador.props.get('--tt-larg-mostrador'), '228.125px', 'a saída não grava 0');
});

test('CSS: nenhum font-size com vw ou cqi soltos, e os limites de @container em em (o zoom do WebKitGTK)', () => {
  const css = ler('src/styles/shell.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const conteinerEmPx = css.match(/@container[^{]*\d+px/g) ?? [];
  assert.deepEqual(conteinerEmPx, [], 'os limites de @container vão em em (px ÷ 14)');
  // Cada font-size com vw ou cq* precisa ser sobrescrito, mais abaixo no
  // mesmo arquivo, por uma regra do mesmo seletor com a largura medida.
  const regras = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => [m[1].trim(), m[2]]);
  regras.forEach(([sel, corpo], i) => {
    const fs = corpo.match(/font-size:([^;]+)/)?.[1] ?? '';
    const semVar = fs.replace(/var\([^,()]+,\s*[^()]+\)/g, '');
    if (!/\d(vw|vh|cqi|cqw)\b/.test(semVar)) return;
    const depois = regras.slice(i + 1).find(([s, c]) => s === sel && /font-size:[^;]*var\(--tt-(vw|larg-)/.test(c));
    assert.ok(depois, `${sel}: o font-size com ${fs.trim()} não tem a versão com a largura medida`);
  });
  assert.match(css, /\.tt-mostrador-centro\{ font-size:calc\(var\(--tt-larg-mostrador, 100cqi\) \* 46 \/ 280\); \}/);
  assert.match(css, /var\(--tt-vw, 1vw\) \* 8/);
  assert.match(css, /var\(--tt-larg-rolagem, 100cqi\)/);
  assert.match(ler('src/components/dial.js'), /data-largura="--tt-larg-mostrador"/);
  assert.match(ler('src/main.js'), /\.tt-rolagem'\)\.dataset\.largura = '--tt-larg-rolagem'/);
});
