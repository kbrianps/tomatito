// Testes do movimento (M41) que não precisam de janela: a entrada de página
// com elementos falsos e as regras do CSS. O que se vê nos dois motores está
// no scripts/preview/movimento.mjs, e o app de verdade com o "Animações" do
// GNOME desligado, no roteiro aninhado movimento.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SUBIDA_PX, entradaDePagina, entrarPagina, movimentoReduzido, msDoToken } from './movimento.js';

const ler = (caminho) => readFileSync(new URL(`../../${caminho}`, import.meta.url), 'utf8');

test('msDoToken lê ms e s, e 0 no que não é tempo', () => {
  assert.equal(msDoToken('300ms'), 300);
  assert.equal(msDoToken(' 83ms '), 83);
  assert.equal(msDoToken('0.25s'), 250);
  assert.equal(msDoToken(''), 0);
  assert.equal(msDoToken(undefined), 0);
});

test('movimentoReduzido pergunta pela mídia prefers-reduced-motion: reduce', () => {
  const pedidas = [];
  const mm = (q) => (pedidas.push(q), { matches: true });
  assert.equal(movimentoReduzido(mm), true);
  assert.deepEqual(pedidas, ['(prefers-reduced-motion: reduce)']);
  assert.equal(movimentoReduzido(() => ({ matches: false })), false);
  assert.equal(movimentoReduzido(undefined), false);
});

test('entrada de página: fade com subida de 24 px na curva do token; reduzida, só o fade, linear', () => {
  const n = entradaDePagina({ reduzido: false, duracao: 300, curva: 'cubic-bezier(0,0,0,1)' });
  assert.equal(SUBIDA_PX, 24);
  assert.deepEqual(n.quadros, [
    { opacity: 0, transform: 'translateY(24px)' },
    { opacity: 1, transform: 'none' },
  ]);
  assert.deepEqual(n.opcoes, { duration: 300, easing: 'cubic-bezier(0,0,0,1)' });
  const r = entradaDePagina({ reduzido: true, duracao: 83, curva: 'cubic-bezier(0,0,0,1)' });
  assert.deepEqual(r.quadros, [{ opacity: 0 }, { opacity: 1 }]);
  assert.deepEqual(r.opcoes, { duration: 83, easing: 'linear' });
});

// Raiz falsa: filhos com animate() que registra a chamada e devolve uma
// animação cujo fim o teste controla.
function cenario({ scrollHeight = 500, clientHeight = 600, filhos = 1 } = {}) {
  const animacoes = [];
  const criarFilho = () => ({
    animate(quadros, opcoes) {
      let fim;
      const a = {
        quadros,
        opcoes,
        cancelada: false,
        finished: new Promise((res, rej) => (fim = { res, rej })),
        cancel() {
          this.cancelada = true;
          fim.rej(new Error('cancelada'));
        },
        acabar: () => fim.res(),
      };
      animacoes.push(a);
      return a;
    },
  });
  const raiz = { children: Array.from({ length: filhos }, criarFilho), dataset: {}, scrollHeight, clientHeight };
  const estilo = (tokens) => ({ getPropertyValue: (n) => tokens[n] ?? '' });
  return { raiz, animacoes, estilo, trocar: (n = 1) => (raiz.children = Array.from({ length: n }, criarFilho)) };
}
const TOKENS = { '--tt-dur-page': '300ms', '--tt-ease-decel': 'cubic-bezier(0,0,0,1)' };
const quadro = () => new Promise((r) => setTimeout(r, 0));

test('entrarPagina anima cada filho da raiz, com os tokens, e segura a rolagem só enquanto a tela sobe', async () => {
  const { raiz, animacoes, estilo } = cenario({ filhos: 2 });
  const r = entrarPagina(raiz, { reduzido: false, estilo: estilo(TOKENS) });
  assert.equal(r.length, 2);
  assert.deepEqual(animacoes[0].opcoes, { duration: 300, easing: 'cubic-bezier(0,0,0,1)' });
  assert.equal(animacoes[0].quadros[0].transform, 'translateY(24px)');
  assert.equal(raiz.dataset.entrando, '', 'a tela cabia: sem barra de rolagem enquanto sobe');
  animacoes[0].acabar();
  await quadro();
  assert.equal(raiz.dataset.entrando, '', 'ainda falta uma animação');
  animacoes[1].acabar();
  await quadro();
  assert.equal('entrando' in raiz.dataset, false);
});

test('entrarPagina: numa tela que já rola, ou com movimento reduzido, a rolagem fica como está', () => {
  const alta = cenario({ scrollHeight: 900, clientHeight: 600 });
  entrarPagina(alta.raiz, { reduzido: false, estilo: alta.estilo(TOKENS) });
  assert.equal('entrando' in alta.raiz.dataset, false);
  const red = cenario();
  entrarPagina(red.raiz, { reduzido: true, estilo: red.estilo({ ...TOKENS, '--tt-dur-page': '83ms' }) });
  assert.equal('entrando' in red.raiz.dataset, false);
  assert.deepEqual(red.animacoes[0].opcoes, { duration: 83, easing: 'linear' });
  assert.deepEqual(red.animacoes[0].quadros, [{ opacity: 0 }, { opacity: 1 }]);
});

test('entrarPagina: uma troca no meio da outra cancela a anterior, e o fim dela não mexe na nova', async () => {
  const { raiz, animacoes, estilo, trocar } = cenario();
  entrarPagina(raiz, { reduzido: false, estilo: estilo(TOKENS) });
  trocar();
  entrarPagina(raiz, { reduzido: false, estilo: estilo(TOKENS) });
  assert.equal(animacoes[0].cancelada, true);
  await quadro();
  assert.equal(raiz.dataset.entrando, '', 'a segunda tela continua subindo');
  animacoes[1].acabar();
  await quadro();
  assert.equal('entrando' in raiz.dataset, false);
});

test('entrarPagina sem duração (token ausente) não anima', () => {
  const { raiz, animacoes, estilo } = cenario();
  assert.deepEqual(entrarPagina(raiz, { reduzido: false, estilo: estilo({}) }), []);
  assert.equal(animacoes.length, 0);
  assert.equal('entrando' in raiz.dataset, false);
});

test('main.js: a tela entra animada só nas trocas, e não na primeira (a janela abre já pintada)', () => {
  const main = ler('src/main.js');
  assert.match(main, /import \{ entrarPagina \} from '\.\/lib\/movimento\.js';/);
  assert.match(main, /if \(anterior !== null\) entrarPagina\(document\.querySelector\('\.tt-rolagem'\)\);/);
});

test('CSS: toda transição usa os tokens --tt-dur-* (que a mídia de movimento reduzido baixa), salvo o anel de 1 s, que tem a sua regra', () => {
  const css = ['src/styles/controls.css', 'src/styles/shell.css', 'src/styles/base.css'].map(ler).join('\n');
  const decls = [...css.matchAll(/transition(?:-duration)?:([^;}]+)[;}]/g)].map((m) => m[1].trim());
  assert.ok(decls.length >= 10, `transições achadas: ${decls.length}`);
  const soltas = decls.filter((d) => !/^none( !important)?$/.test(d) && !/var\(--tt-dur-(fast|out|in|page)\)/.test(d) && d !== 'stroke-dashoffset 1s linear');
  assert.deepEqual(soltas, []);
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)\{ \.tt-anel-arco\{ transition-duration:var\(--tt-dur-fast\); \} \}/);
  assert.match(ler('src/styles/tokens.css'), /@media \(prefers-reduced-motion:reduce\)\{ :root\{ --tt-dur-out:83ms; --tt-dur-in:83ms; --tt-dur-page:83ms; \} \}/);
});

test('CSS: hover e pressionado em 83 ms, linear, nos controles feitos à mão e nos itens do Fluent', () => {
  const controles = ler('src/styles/controls.css');
  const shell = ler('src/styles/shell.css');
  const t83 = 'var(--tt-dur-fast) linear';
  assert.ok(controles.includes(`transition:background-color ${t83};\n}\nbutton[hidden]`), 'botões');
  assert.ok(controles.includes(`transition:background-color ${t83};   /* M41 */`), 'caixa de texto');
  assert.ok(controles.includes(`fluent-menu-item,fluent-option{ transition:background-color ${t83}; }`), 'itens de menu e opções');
  assert.ok(shell.includes(`transition:--tt-camada ${t83}; }`), 'linhas de tarefa');
  assert.ok(shell.includes(`@property --tt-camada{ syntax:"<color>"; inherits:false; initial-value:transparent; }`));
});

test('CSS: o diálogo escala de 1,05 (250 ms na entrada, 167 na saída) e, com movimento reduzido, fica sem escala', () => {
  const c = ler('src/styles/controls.css');
  assert.match(c, /fluent-dialog::part\(dialog\)\{[^}]*opacity:0; scale:1\.05;[^}]*scale var\(--tt-dur-out\) var\(--tt-ease-decel\)/);
  assert.match(c, /fluent-dialog::part\(dialog\):modal\{[^}]*opacity:1; scale:1;[^}]*scale var\(--tt-dur-in\) var\(--tt-ease-decel\)/);
  assert.match(c, /@starting-style\{\n  fluent-dialog::part\(dialog\):modal\{ opacity:0; scale:1\.05; \}/);
  assert.match(c, /@media \(prefers-reduced-motion:reduce\)\{\n  fluent-dialog::part\(dialog\), fluent-dialog::part\(dialog\):modal\{ scale:none; \}\n  @starting-style\{ fluent-dialog::part\(dialog\):modal\{ scale:none; \} \}/);
});

test('CSS: com movimento reduzido, o chevron vira de uma vez e o Fluent não move nada', () => {
  assert.match(ler('src/styles/shell.css'), /@media \(prefers-reduced-motion:reduce\)\{ \.tt-expansor-chevron \.tt-icone\{ transition:none; \} \}/);
  const ponte = ler('src/styles/bridge.css');
  const bloco = ponte.slice(ponte.indexOf('@media (prefers-reduced-motion:reduce)'));
  for (const d of ['UltraFast', 'Faster', 'Fast', 'Normal', 'Gentle', 'Slow', 'Slower', 'UltraSlow']) {
    assert.match(bloco, new RegExp(`--duration${d}:0ms;`), `--duration${d}`);
  }
});
