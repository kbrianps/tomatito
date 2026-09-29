// Testes do diálogo dos avisos (M46) sem DOM: a marcação e, com elementos
// falsos, abrir cada documento, o texto guardado, a leitura recusada, a
// resposta atrasada de uma abertura anterior, o clique no fundo, o foco e a
// limpeza. O desenho e o teclado de verdade são conferidos na prévia
// (scripts/preview/avisos.mjs) e no app (roteiro aninhado avisos).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DOCUMENTOS, criar, marcacao } from './notices-dialog.js';

test('marcação: título do documento, o bloco rolável com nome, carregando, o erro escondido e "Fechar"', () => {
  assert.deepEqual([...DOCUMENTOS], ['avisos', 'ofl']);
  const html = marcacao('avisos');
  assert.match(html, /^<fluent-dialog-body><h2 slot="title" id="tt-avisos-titulo">Avisos de terceiros<\/h2>/);
  assert.match(html, /<pre class="tt-dialogo-avisos-texto" data-texto tabindex="0" role="region" aria-label="Avisos de terceiros" aria-busy="true">Carregando…<\/pre>/);
  assert.match(html, /<p class="tt-dialogo-meta-erro" role="alert" data-erro hidden><span data-erro-texto>Não foi possível abrir o arquivo, que deveria vir junto com o aplicativo\.<\/span><\/p>/);
  assert.match(html, /<button type="button" slot="action" data-fechar>Fechar<\/button><\/fluent-dialog-body>$/);
  assert.match(marcacao('ofl'), /id="tt-avisos-titulo">Licença da fonte Inter<\/h2>/);
  const icone = (nome) => `<svg data-icone="${nome}"></svg>`;
  assert.match(marcacao('ofl', icone), /data-erro hidden><svg data-icone="error_circle"><\/svg>/);
});

function ambiente(ler, { abrirDepois = false } = {}) {
  const chamadas = [];
  const quadros = [];
  const body = { filhos: [], append: (el) => body.filhos.push(el) };
  const doc = {
    body,
    defaultView: { requestAnimationFrame: (f) => quadros.push(f) },
    createElement: (tag) => {
      const attrs = {};
      const ouvintes = [];
      const el = {
        tag,
        className: '',
        attrs,
        partes: null,
        dialog: { open: false, close: () => ((el.dialog.open = false), chamadas.push('close')) },
        addEventListener: (tipo, f, captura = false) => ouvintes.push({ tipo, f, captura: Boolean(captura) }),
        removeEventListener: (tipo, f, captura = false) => {
          const i = ouvintes.findIndex((o) => o.tipo === tipo && o.f === f && o.captura === Boolean(captura));
          if (i >= 0) ouvintes.splice(i, 1);
        },
        disparar: (tipo, ev) => ouvintes.filter((o) => o.tipo === tipo).forEach((o) => o.f(ev)),
        ouvintes,
        setAttribute: (n, v) => (attrs[n] = String(v)),
        remove: () => body.filhos.splice(body.filhos.indexOf(el), 1),
        // O fluent-dialog de verdade abre na fila de atualização do FAST.
        show: () => (abrirDepois ? queueMicrotask(() => setTimeout(() => (el.dialog.open = true))) : (el.dialog.open = true), chamadas.push('show')),
        hide: () => {
          el.dialog.open = false;
          chamadas.push('hide');
          el.disparar('toggle', { target: el, detail: { newState: 'closed' } });
        },
        querySelector: (s) => el.partes?.[s] ?? null,
      };
      Object.defineProperty(el, 'innerHTML', {
        get: () => el.html,
        set: (html) => {
          el.html = html;
          const texto = {
            textContent: 'Carregando…',
            hidden: false,
            scrollTop: 40,
            attrs: { 'aria-busy': 'true' },
            removeAttribute: (n) => delete texto.attrs[n],
            focus: () => chamadas.push('foco:texto'),
          };
          el.partes = { '[data-texto]': texto, '[data-erro]': { hidden: true } };
        },
      });
      return el;
    },
  };
  const ipc = {
    avisos: {
      ler: (qual) => {
        chamadas.push(`ler:${qual}`);
        return ler(qual);
      },
    },
  };
  return { doc, ipc, chamadas, quadros };
}
const esperar = () => new Promise((r) => setTimeout(r, 0));

test('abrir: um fluent-dialog no <body>; o texto do arquivo entra como texto, e o foco vai para o bloco', async () => {
  const a = ambiente((qual) => Promise.resolve(qual === 'avisos' ? '# Avisos de terceiros\n<b>não é HTML</b>' : 'SIL OPEN FONT LICENSE'));
  const d = criar(a);
  const el = d.elemento;
  assert.equal(el.tag, 'fluent-dialog');
  assert.equal(el.className, 'tt-dialogo-avisos');
  assert.deepEqual(a.doc.body.filhos, [el]);
  const gatilho = { focus: () => a.chamadas.push('foco:botão') };
  d.abrir('avisos', gatilho);
  assert.equal(el.attrs['aria-label'], 'Avisos de terceiros');
  assert.ok(d.aberto());
  a.quadros.shift()();
  await esperar();
  const texto = el.partes['[data-texto]'];
  assert.equal(texto.textContent, '# Avisos de terceiros\n<b>não é HTML</b>');
  assert.equal(texto.scrollTop, 0);
  assert.equal(texto.attrs['aria-busy'], undefined);
  assert.equal(el.partes['[data-erro]'].hidden, true);
  // Aberto, abrir de novo não faz nada; "Fechar" fecha e devolve o foco.
  d.abrir('ofl', gatilho);
  el.disparar('click', { target: { closest: (s) => (s === '[data-fechar]' ? {} : null) } });
  assert.deepEqual(a.chamadas, ['show', 'ler:avisos', 'foco:texto', 'hide', 'foco:botão']);
  // A segunda vez do mesmo documento usa o texto guardado; a OFL tem título próprio.
  d.abrir('avisos', gatilho);
  await esperar();
  assert.equal(el.partes['[data-texto]'].textContent, '# Avisos de terceiros\n<b>não é HTML</b>');
  el.hide();
  d.abrir('ofl', gatilho);
  assert.equal(el.attrs['aria-label'], 'Licença da fonte Inter');
  await esperar();
  assert.equal(el.partes['[data-texto]'].textContent, 'SIL OPEN FONT LICENSE');
  assert.deepEqual(a.chamadas.filter((c) => c.startsWith('ler:')), ['ler:avisos', 'ler:ofl']);
  // Documento desconhecido: nada.
  el.hide();
  d.abrir('LICENSE');
  assert.equal(d.aberto(), false);
});

test('leitura recusada: o bloco some e o aviso de erro aparece, com o motivo no console; tenta de novo na próxima abertura', async (t) => {
  const erros = [];
  t.mock.method(console, 'error', (...args) => erros.push(args));
  let falhar = true;
  const a = ambiente(() => (falhar ? Promise.reject({ code: 'notFound', message: 'x' }) : Promise.resolve('ok')));
  const d = criar(a);
  d.abrir('avisos');
  await esperar();
  const el = d.elemento;
  assert.equal(el.partes['[data-texto]'].hidden, true);
  assert.equal(el.partes['[data-erro]'].hidden, false);
  assert.deepEqual(erros, [['[avisos]', { code: 'notFound', message: 'x' }]]);
  el.hide();
  falhar = false;
  d.abrir('avisos');
  await esperar();
  assert.equal(el.partes['[data-texto]'].textContent, 'ok');
});

test('a resposta de uma abertura anterior não escreve na seguinte', async () => {
  const pendentes = {};
  const a = ambiente((qual) => new Promise((r) => (pendentes[qual] = r)));
  const d = criar(a);
  const el = d.elemento;
  d.abrir('avisos');
  el.hide();
  d.abrir('ofl');
  pendentes.avisos('AVISOS');
  await esperar();
  assert.equal(el.partes['[data-texto]'].textContent, 'Carregando…');
  pendentes.ofl('OFL');
  await esperar();
  assert.equal(el.partes['[data-texto]'].textContent, 'OFL');
});

test('o clique no fundo não fecha; desligar fecha, tira os ouvintes e remove o elemento', () => {
  const a = ambiente(() => new Promise(() => {}));
  const d = criar(a);
  const el = d.elemento;
  d.abrir('ofl');
  let parado = false;
  for (const o of el.ouvintes.filter((o) => o.tipo === 'click' && o.captura)) {
    o.f({ composedPath: () => [el.dialog], stopPropagation: () => (parado = true) });
  }
  assert.ok(parado);
  d.desligar();
  assert.equal(el.ouvintes.length, 0);
  assert.deepEqual(a.doc.body.filhos, []);
  assert.ok(a.chamadas.includes('close'));
  d.abrir('avisos');
  assert.equal(a.chamadas.filter((c) => c === 'show').length, 1);
});

test('o texto guardado e o erro aparecem mesmo com o <dialog> abrindo depois do show()', async () => {
  let falhar = false;
  const a = ambiente(() => (falhar ? Promise.reject(new Error('x')) : Promise.resolve('AVISOS')), { abrirDepois: true });
  const d = criar(a);
  const el = d.elemento;
  d.abrir('avisos');
  await esperar();
  await esperar();
  el.hide();
  d.abrir('avisos');
  assert.equal(el.partes['[data-texto]'].textContent, 'AVISOS', 'o guardado entra na hora');
  el.hide();
  falhar = true;
  const erro = console.error;
  console.error = () => {};
  try {
    d.abrir('ofl');
    await esperar();
  } finally {
    console.error = erro;
  }
  assert.equal(el.partes['[data-erro]'].hidden, false);
});
