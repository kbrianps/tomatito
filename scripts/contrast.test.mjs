// Testes do scripts/contrast.mjs (M06b): o leitor de CSS, a cascata, as cores
// e a tabela 4.4 com os tokens de verdade. Rodam no `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  arredondarPar,
  computar,
  conferir,
  contraste,
  especificidade,
  hex,
  lerArquivos,
  lerCor,
  lerRegras,
  lerSeletor,
  sobre,
} from './contrast.mjs';

const script = fileURLToPath(new URL('./contrast.mjs', import.meta.url));
const perto = (a, b, casas = 2) => Math.abs(a - b) < 10 ** -casas / 2;

test('cores: hex curto, longo e com alfa; rgb() com barra, vírgula e porcentagem', () => {
  assert.deepEqual(lerCor('#FFF'), [255, 255, 255, 1]);
  assert.deepEqual(lerCor('#A5342B'), [165, 52, 43, 1]);
  assert.deepEqual(lerCor('#00000037'), [0, 0, 0, 0x37 / 255]);
  assert.deepEqual(lerCor('rgb(255 255 255/.30)'), [255, 255, 255, 0.3]);
  assert.deepEqual(lerCor('rgb(165 46 30 / 5%)'), [165, 46, 30, 0.05]);
  assert.deepEqual(lerCor('rgba(0, 0, 0, 0.5)'), [0, 0, 0, 0.5]);
  assert.deepEqual(lerCor('transparent'), [0, 0, 0, 0]);
  assert.throws(() => lerCor('Highlight'), /não suportada/);
  assert.throws(() => lerCor('#12345'), /não suportada/);
});

test('contraste da WCAG 2.2: extremos e valores conhecidos', () => {
  assert.equal(contraste(lerCor('#FFFFFF'), lerCor('#000000')), 21);
  assert.equal(contraste(lerCor('#777777'), lerCor('#777777')), 1);
  assert.ok(perto(contraste(lerCor('#767676'), lerCor('#FFFFFF')), 4.54)); // o cinza mínimo do AA sobre branco
  assert.equal(contraste(lerCor('#FFF'), lerCor('#000')), contraste(lerCor('#000'), lerCor('#FFF')), 'simétrico');
});

test('composição em 8 bits, com empate para o par, como o pal/lib.py', () => {
  assert.equal(arredondarPar(74.5), 74);
  assert.equal(arredondarPar(75.5), 76);
  assert.equal(arredondarPar(74.49), 74);
  assert.equal(arredondarPar(74.51), 75);
  // hover do Suave sobre o cartão: o vermelho dá 250,5 exatos e fica 250 (o Math.round daria 251)
  assert.equal(hex(sobre(lerCor('rgb(165 46 30/.05)'), lerCor('#FFFAF9'))), '#FAF0EE');
  // branco a 5% sobre o cartão do Lite: em [0, 1] o verde dá 74,4999… e fica 74 (em 0–255 seria 74,5 e 75)
  assert.equal(hex(sobre(lerCor('rgb(255 255 255/.05)'), lerCor('#AF4135'))), '#B34A3F');
  assert.throws(() => sobre(lerCor('#FFF'), lerCor('rgb(0 0 0/.5)')), /não opaco/);
});

test('seletores do tokens.css e a especificidade de cada um', () => {
  const espec = (s) => especificidade(lerSeletor(s));
  assert.deepEqual(espec(':root'), [0, 1, 0]);
  assert.deepEqual(espec('[data-theme]'), [0, 1, 0]);
  assert.deepEqual(espec(':is([data-theme="lite"],[data-theme="full"])'), [0, 1, 0]);
  assert.deepEqual(espec('[data-theme="full"] .stage[data-state="break"]'), [0, 3, 0]);
  assert.deepEqual(espec('[data-theme="full"][data-platform="windows"] .art .shadowed'), [0, 4, 0]);
  assert.throws(() => lerSeletor('html > body'), /não suportado/);
  assert.throws(() => lerSeletor(':not(.x)'), /não suportado/);
});

test('cascata: ordem no empate, especificidade, herança, var() com alternativa e ciclo', () => {
  const regras = lerRegras(`
    :root{ --base:#111111; }
    [data-t]{ --a:var(--b); --x:#000000; }
    [data-t="1"]{ --b:#222222; --x:#010101; }
    [data-t]{ --x:#020202; }                                   /* mesma especificidade, depois: vence */
    [data-t] .filho[data-s="z"]{ --b:#333333; --x:#030303; }
    [data-t]{ --com-alt:var(--nada, var(--base)); --sem-alt:var(--nada); }
    @media (prefers-contrast:more){ [data-t]{ --x:#FFFFFF; } }  /* fora da tabela: ignorado */
  `);
  const html = { tag: 'html', atributos: { 'data-t': '1' } };
  const raiz = computar(regras, [html]);
  assert.equal(raiz.get('--x'), '#020202');
  assert.equal(raiz.get('--a'), '#222222', 'o var() resolve no elemento em que foi declarado');
  assert.equal(raiz.get('--com-alt'), '#111111');
  assert.equal(raiz.has('--sem-alt'), false, 'var() sem valor nem alternativa invalida a propriedade');
  const filho = computar(regras, [html, { tag: 'div', classes: ['filho'], atributos: { 'data-s': 'z' } }]);
  assert.equal(filho.get('--x'), '#030303', '(0,3,0) vence (0,1,0) mesmo vindo antes');
  assert.equal(filho.get('--b'), '#333333');
  assert.equal(filho.get('--a'), '#222222', 'herdado já resolvido, como no CSS');
  assert.equal(filho.get('--base'), '#111111', ':root só casa na raiz, e o filho herda');
  assert.throws(() => computar(lerRegras('[data-t]{ --p:var(--q); --q:var(--p); }'), [html]), /ciclo/);
});

test('prévia aninhada: <div data-theme="suave"> dentro do Lite recalcula os derivados', () => {
  const regras = lerArquivos().flatMap(({ origem, texto }) => lerRegras(texto, origem));
  const html = { tag: 'html', atributos: { 'data-theme': 'lite' } };
  const lite = computar(regras, [html]);
  const suave = computar(regras, [html, { tag: 'div', atributos: { 'data-theme': 'suave' } }]);
  assert.equal(lite.get('--tt-fg-2-on-ctl'), '#FFF8F6', 'no Lite, texto 2 sobre controle usa o fg-1');
  assert.equal(suave.get('--tt-fg-2-on-ctl'), '#6A514C', 'no Suave aninhado, volta ao fg-2 do Suave');
  assert.equal(suave.get('--tt-subtle-press'), 'rgb(165 46 30/.05)');
  assert.equal(suave.get('--tt-ring-progress'), '#A52E1E', 'a ponte também recalcula');
  assert.equal(suave.get('--tt-tomato-80'), '#B8402D', 'os primitivos do :root chegam por herança');
});

test('a tabela 4.4 sai dos tokens de verdade, no mínimo e igual à do plano', () => {
  const r = conferir(lerArquivos());
  assert.deepEqual(r.falhas, []);
  assert.deepEqual(r.divergencias, []);
  const linha = (par) => r.linhas.find((l) => l.par === par).celulas;
  assert.deepEqual(linha('Texto 1 / fundo'), ['6,40', '15,67', '15,68', '16,29']);
  assert.equal(linha('Texto 2 / cartão + hover')[0], '4,25: usa fg-1 (4,94)');
  assert.equal(linha('Texto 1 / controle (repouso · hover · pressionado)')[0], '4,77 · 4,57 · 5,04');
  assert.deepEqual(r.tomate[0].celulas, ['5,42 (4,82)', '4,67', '5,02', '6,91']);
});

test('mutações: token abaixo do mínimo falha; token mudado sem atualizar a tabela diverge', () => {
  const original = lerArquivos();
  const trocar = (de, para) =>
    original.map((f) => (f.texto.includes(de) ? { ...f, texto: f.texto.replace(de, para) } : f));

  // o Lite deixa de usar o fg-1 sobre controles: o fg-2 fica em 3,94–4,25
  const semAjuste = conferir(trocar('--tt-fg-2-on-ctl:var(--tt-fg-1);', '--tt-fg-2-on-ctl:var(--tt-fg-2);'));
  assert.equal(semAjuste.falhas.length, 3);
  assert.match(semAjuste.falhas.join('\n'), /Lite, Texto 2 \/ cartão \+ selecionado: 3,94 < 4,5/);

  // um passo a mais no cinza do texto 2 do Claro: continua acima do mínimo, mas a tabela muda
  const outroCinza = conferir(trocar('--tt-fg-2:#5C5C5C;', '--tt-fg-2:#5D5D5D;'));
  assert.deepEqual(outroCinza.falhas, []);
  assert.ok(outroCinza.divergencias.length > 0);
  assert.deepEqual(conferir(trocar('--tt-fg-2:#5C5C5C;', '--tt-fg-2:#5D5D5D;'), { referencia: false }).divergencias, []);

  // o hover do X da barra e os tokens de fonte não entram na tabela: mudar não afeta nada
  const fora = conferir(trocar('--tt-caption-close:#C42B1C;', '--tt-caption-close:#000000;'));
  assert.deepEqual([fora.falhas, fora.divergencias], [[], []]);
});

test('M10: texto sobre a camada de conteúdo, fora da tabela 4.4, conferido contra o mínimo', () => {
  const original = lerArquivos();
  const r = conferir(original);
  const linha = (par) => r.camada.find((l) => l.par === par).celulas;
  assert.deepEqual(linha('Texto 1 / camada'), ['6,00', '16,59', '16,53', '14,74']);
  assert.deepEqual(linha('Texto 2 / camada'), ['5,17', '6,62', '6,35', '9,18']);
  // uma camada clara demais no Lite derruba o texto creme, mesmo sem linha na tabela
  const clara = original.map((f) =>
    f.texto.includes('--tt-bg-surface:#AA392F;') ? { ...f, texto: f.texto.replace('--tt-bg-surface:#AA392F;', '--tt-bg-surface:#D98A80;') } : f,
  );
  const falhas = conferir(clara).falhas.join('\n');
  assert.match(falhas, /Lite, Texto 1 \/ camada: \d,\d\d < 4,5/);
});

test('node scripts/contrast.mjs termina com 0 e imprime a tabela 4.4', () => {
  const r = spawnSync(process.execPath, [script], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, '');
  assert.match(r.stdout, /^\| Par \| Lite \| Suave \| Claro \| Escuro \| Mínimo \|$/m);
  assert.match(r.stdout, /^\| Erro \(`--tt-critical`\) \/ cartão \| 5,51 \| 5,47 \| 5,47 \| 6,97 \| 4,5 \|$/m);
  assert.match(r.stdout, /^\| Pausado \| 6,05 \(5,36\) \| 5,24 \| 4,51 \| 7,75 \|$/m);
  assert.match(r.stdout, /^\| Texto 1 \/ camada \| 6,00 \| 16,59 \| 16,53 \| 14,74 \| 4,5 \|$/m);
  assert.match(r.stdout, /iguais à tabela 4\.4 do plano\.$/m);
  assert.equal(spawnSync(process.execPath, [script, '--xpto'], { encoding: 'utf8' }).status, 2);
});

test('M13: desabilitados, só de registro (sem mínimo), com o Lite e o Suave na faixa do Claro e do Escuro', () => {
  const r = conferir(lerArquivos());
  const linha = (par) => r.desabilitados.find((l) => l.par === par);
  assert.deepEqual(linha('Texto desabilitado / controle').celulas, ['2,51', '2,57', '2,50', '3,01']);
  assert.deepEqual(linha('Destaque desabilitado / cartão').celulas, ['1,53', '1,54', '1,67', '1,65']);
  for (const l of r.desabilitados) assert.match(l.minimo, /^isento/);
  // Sem mínimo: um texto desabilitado invisível não reprova a tabela 4.4...
  const css = lerArquivos().map((f) =>
    f.origem.endsWith('tokens.css') ? { ...f, texto: f.texto.replace('--tt-fg-disabled:rgb(255 248 246/.55)', '--tt-fg-disabled:#AF4135') } : f,
  );
  const mudado = conferir(css);
  assert.deepEqual(mudado.falhas, []);
  // ...mas a tabela mostra o 1,00.
  assert.equal(mudado.desabilitados.find((l) => l.par === 'Texto desabilitado / cartão').celulas[0], '1,00');
});
