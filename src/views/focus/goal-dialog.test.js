// Testes do diálogo "Editar meta diária" (M28) sem DOM: a marcação, o patch
// do `settings_set` e, com elementos falsos, abrir, salvar, cancelar, a
// gravação recusada, o clique no fundo, o Esc durante a gravação, o foco de
// volta ao lápis e a limpeza. O desenho e o teclado de verdade são
// conferidos na prévia (scripts/preview/meta.mjs) e no app (roteiro aninhado
// meta).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HORAS, METAS, criar, marcacao, patch, textoDaHora } from './goal-dialog.js';

test('marcação: título, as 9 metas por extenso e as 24 horas, com os valores atuais escolhidos', () => {
  const html = marcacao({ dailyGoalMinutes: 90, resetHour: 4 });
  assert.match(html, /^<fluent-dialog-body><h2 slot="title" id="tt-meta-titulo">Editar meta diária<\/h2>/);
  const metas = [...html.matchAll(/<fluent-option value="(\d+)"( selected)?>([^<]+)<\/fluent-option>/g)];
  assert.equal(metas.length, 9 + 24);
  assert.deepEqual(metas.slice(0, 9).map((m) => m[3]), [
    'Desativada', '30 minutos', '1 hora', '1 hora e 30 minutos', '2 horas', '3 horas', '4 horas', '6 horas', '8 horas',
  ]);
  assert.deepEqual(metas.slice(0, 9).map((m) => Number(m[1])), [...METAS]);
  assert.deepEqual(metas.slice(9).map((m) => m[3]), HORAS.map(textoDaHora));
  assert.equal(textoDaHora(0), '00:00');
  assert.equal(textoDaHora(23), '23:00');
  assert.deepEqual(metas.filter((m) => m[2]).map((m) => m[3]), ['1 hora e 30 minutos', '04:00']);
  assert.match(html, /<span id="tt-meta-meta-rotulo" class="tt-campo-rotulo">Meta diária<\/span><fluent-dropdown data-campo="meta" data-rotulo="tt-meta-meta-rotulo">/);
  assert.match(html, /<span id="tt-meta-hora-rotulo" class="tt-campo-rotulo">Zerar progresso às<\/span><fluent-dropdown data-campo="hora" data-rotulo="tt-meta-hora-rotulo">/);
  assert.match(html, /<p class="tt-dialogo-meta-erro" role="alert" data-erro hidden>/);
  // Salvar (destaque) antes de Cancelar, com os ícones do Relógio.
  const icone = (nome) => `<svg data-icone="${nome}"></svg>`;
  assert.match(
    marcacao({}, icone),
    /<button type="button" slot="action" class="tt-accent" data-salvar><svg data-icone="save"><\/svg>Salvar<\/button><button type="button" slot="action" data-cancelar><svg data-icone="dismiss"><\/svg>Cancelar<\/button><\/fluent-dialog-body>$/,
  );
  // Sem valores, Desativada e 00:00 (os padrões da struct vêm sempre do Rust).
  assert.deepEqual([...marcacao().matchAll(/selected>([^<]+)</g)].map((m) => m[1]), ['Desativada', '00:00']);
});

test('patch: as duas chaves, só com valores das listas', () => {
  assert.deepEqual(patch('60', '5'), { dailyGoalMinutes: 60, resetHour: 5 });
  assert.deepEqual(patch('0', '23'), { dailyGoalMinutes: 0, resetHour: 23 });
  for (const [m, h] of [['45', '0'], ['60', '24'], ['', '0'], ['60', ''], ['x', '1'], ['60', '1.5']]) {
    assert.equal(patch(m, h), null, `${m}/${h}`);
  }
});

// Elementos falsos, só com o que o goal-dialog.js usa.
function eventos() {
  const ouvintes = [];
  return {
    ouvintes,
    addEventListener: (tipo, f, captura = false) => ouvintes.push({ tipo, f, captura: Boolean(captura) }),
    removeEventListener: (tipo, f, captura = false) => {
      const i = ouvintes.findIndex((o) => o.tipo === tipo && o.f === f && o.captura === Boolean(captura));
      if (i >= 0) ouvintes.splice(i, 1);
    },
    disparar(tipo, ev, { captura } = {}) {
      for (const o of [...ouvintes]) if (o.tipo === tipo && (captura === undefined || o.captura === captura)) o.f(ev);
    },
  };
}
function ambiente({ gravar } = {}) {
  const chamadas = [];
  const quadros = [];
  const body = { filhos: [], append: (el) => body.filhos.push(el) };
  const doc = {
    body,
    defaultView: { requestAnimationFrame: (f) => quadros.push(f) },
    createElement: (tag) => {
      const attrs = {};
      const ev = eventos();
      const el = {
        ...ev,
        tag,
        className: '',
        attrs,
        dialog: { open: false, close: () => ((el.dialog.open = false), chamadas.push('close')) },
        partes: null,
        setAttribute: (n, v) => (attrs[n] = String(v)),
        remove: () => body.filhos.splice(body.filhos.indexOf(el), 1),
        show: () => ((el.dialog.open = true), chamadas.push('show')),
        hide: () => {
          el.dialog.open = false;
          chamadas.push('hide');
          ev.disparar('toggle', { target: el, detail: { newState: 'closed' } });
        },
        querySelector: (s) => el.partes?.[s] ?? null,
        querySelectorAll: (s) => {
          if (!el.partes) return [];
          if (s === 'fluent-dropdown[data-campo]') return [el.partes['[data-campo="meta"]'], el.partes['[data-campo="hora"]']];
          if (s === '[data-salvar], [data-cancelar]') return [el.partes.salvar, el.partes.cancelar];
          return [];
        },
      };
      // innerHTML: guarda o HTML e cria as partes, com o valor escolhido de
      // cada lista tirado do `selected` da marcação.
      Object.defineProperty(el, 'innerHTML', {
        get: () => el.html,
        set: (html) => {
          el.html = html;
          const escolhidos = [...html.matchAll(/<fluent-option value="(\d+)" selected>/g)].map((m) => m[1]);
          const lista = (valor, rotulo) => {
            const control = { attrs: {}, setAttribute: (n, v) => (control.attrs[n] = v), focus: () => chamadas.push(`foco:${rotulo}`) };
            return { value: valor, control, dataset: { rotulo } };
          };
          const texto = { textContent: '' };
          const erro = { hidden: true, querySelector: () => texto, texto };
          const botao = (id) => ({ id, disabled: false, hasAttribute: (n) => n === `data-${id}`, closest: () => el.partes[id] });
          el.partes = {
            '[data-campo="meta"]': lista(escolhidos[0] ?? '', 'tt-meta-meta-rotulo'),
            '[data-campo="hora"]': lista(escolhidos[1] ?? '', 'tt-meta-hora-rotulo'),
            '[data-erro]': erro,
            salvar: botao('salvar'),
            cancelar: botao('cancelar'),
          };
        },
      });
      return el;
    },
  };
  const ipc = {
    configuracoes: {
      gravar: (p) => {
        chamadas.push(`gravar:${JSON.stringify(p)}`);
        return gravar ? gravar(p) : Promise.resolve({ ...p, theme: 'lite' });
      },
    },
  };
  const gatilho = { focus: () => chamadas.push('foco:lápis') };
  const salvos = [];
  return { doc, ipc, gatilho, chamadas, quadros, salvos, aoSalvar: (c) => salvos.push(c) };
}
const esperar = () => new Promise((r) => setTimeout(r, 0));
const clicar = (el, id) => el.disparar('click', { target: el.partes[id] }, { captura: false });

test('criar: um fluent-dialog no <body>, com nome; abrir mostra os valores e põe o foco na primeira lista, com os nomes', () => {
  const a = ambiente();
  const d = criar(a);
  const el = d.elemento;
  assert.equal(el.tag, 'fluent-dialog');
  assert.deepEqual(a.doc.body.filhos, [el]);
  assert.equal(el.className, 'tt-dialogo-meta');
  assert.equal(el.attrs['aria-label'], 'Editar meta diária');
  d.abrir({ dailyGoalMinutes: 240, resetHour: 6 });
  assert.equal(d.aberto(), true);
  assert.deepEqual(a.chamadas, ['show']);
  assert.equal(el.partes['[data-campo="meta"]'].value, '240');
  assert.equal(el.partes['[data-campo="hora"]'].value, '6');
  // No quadro seguinte: o nome de cada lista e o foco na primeira.
  a.quadros.shift()();
  assert.equal(el.partes['[data-campo="meta"]'].control.attrs['aria-labelledby'], 'tt-meta-meta-rotulo');
  assert.equal(el.partes['[data-campo="hora"]'].control.attrs['aria-labelledby'], 'tt-meta-hora-rotulo');
  assert.deepEqual(a.chamadas, ['show', 'foco:tt-meta-meta-rotulo']);
  // Aberto, abrir de novo não faz nada.
  d.abrir({ dailyGoalMinutes: 30, resetHour: 0 });
  assert.equal(el.partes['[data-campo="meta"]'].value, '240');
  d.desligar();
});

test('salvar: grava as duas chaves de uma vez, fecha, devolve o foco ao lápis e avisa o cartão', async () => {
  const a = ambiente();
  const d = criar(a);
  const el = d.elemento;
  d.abrir({ dailyGoalMinutes: 120, resetHour: 0 });
  el.partes['[data-campo="meta"]'].value = '60';
  el.partes['[data-campo="hora"]'].value = '5';
  clicar(el, 'salvar');
  assert.equal(el.partes.salvar.disabled, true, 'os botões esperam a resposta');
  assert.equal(el.partes.cancelar.disabled, true);
  // Esc durante a gravação não fecha.
  const esc = { key: 'Escape', impedido: false, preventDefault: () => (esc.impedido = true) };
  el.disparar('keydown', esc, { captura: true });
  assert.equal(esc.impedido, true);
  // Dois cliques seguidos gravam uma vez só.
  clicar(el, 'salvar');
  await esperar();
  assert.deepEqual(a.chamadas, ['show', 'gravar:{"dailyGoalMinutes":60,"resetHour":5}', 'hide', 'foco:lápis']);
  assert.deepEqual(a.salvos, [{ dailyGoalMinutes: 60, resetHour: 5, theme: 'lite' }]);
  assert.equal(d.aberto(), false);
  // Fechado e sem gravar, o Esc volta a ser do <dialog>.
  const esc2 = { key: 'Escape', impedido: false, preventDefault: () => (esc2.impedido = true) };
  el.disparar('keydown', esc2, { captura: true });
  assert.equal(esc2.impedido, false);
  d.desligar();
});

test('salvar: com a gravação recusada, o diálogo fica aberto com o aviso; a segunda tentativa grava', async () => {
  let recusar = true;
  const avisos = [];
  const warn = console.warn;
  console.warn = (...x) => avisos.push(x);
  try {
    const a = ambiente({ gravar: (p) => (recusar ? Promise.reject({ code: 'writeFailed', message: 'disco cheio' }) : Promise.resolve(p)) });
    const d = criar(a);
    const el = d.elemento;
    d.abrir({ dailyGoalMinutes: 120, resetHour: 0 });
    clicar(el, 'salvar');
    await esperar();
    assert.equal(d.aberto(), true);
    assert.equal(el.partes['[data-erro]'].hidden, false);
    assert.equal(el.partes['[data-erro]'].texto.textContent, 'Não foi possível salvar. Tente de novo.');
    assert.equal(el.partes.salvar.disabled, false);
    assert.deepEqual(a.salvos, []);
    assert.equal(avisos.length, 1);
    recusar = false;
    clicar(el, 'salvar');
    await esperar();
    assert.equal(el.partes['[data-erro]'].hidden, true, 'o aviso some ao tentar de novo');
    assert.equal(d.aberto(), false);
    assert.deepEqual(a.salvos, [{ dailyGoalMinutes: 120, resetHour: 0 }]);
    // Reaberto, o aviso não volta (o conteúdo é redesenhado).
    d.abrir({ dailyGoalMinutes: 120, resetHour: 0 });
    assert.equal(el.partes['[data-erro]'].hidden, true);
    d.desligar();
  } finally {
    console.warn = warn;
  }
});

test('cancelar fecha sem gravar; o clique no fundo não fecha; outros cliques passam', () => {
  const a = ambiente();
  const d = criar(a);
  const el = d.elemento;
  d.abrir({ dailyGoalMinutes: 120, resetHour: 0 });
  // O fundo: o próprio <dialog> é o primeiro do caminho.
  let parado = 0;
  el.disparar('click', { composedPath: () => [el.dialog, el], stopPropagation: () => parado++ }, { captura: true });
  assert.equal(parado, 1);
  el.disparar('click', { composedPath: () => [el.partes.salvar, el], stopPropagation: () => parado++ }, { captura: true });
  assert.equal(parado, 1);
  el.partes['[data-campo="meta"]'].value = '480';
  clicar(el, 'cancelar');
  assert.deepEqual(a.chamadas, ['show', 'hide', 'foco:lápis']);
  assert.equal(d.aberto(), false);
  // Reaberto, os valores de antes.
  d.abrir({ dailyGoalMinutes: 120, resetHour: 0 });
  assert.equal(el.partes['[data-campo="meta"]'].value, '120');
  d.desligar();
});

test('desligar: fecha se estiver aberto, tira os ouvintes e o elemento do <body>', () => {
  const a = ambiente();
  const d = criar(a);
  const el = d.elemento;
  d.abrir({ dailyGoalMinutes: 120, resetHour: 0 });
  d.desligar();
  assert.equal(el.ouvintes.length, 0);
  assert.deepEqual(a.doc.body.filhos, []);
  assert.equal(el.dialog.open, false);
  assert.ok(a.chamadas.includes('close'));
  // O quadro pendente não mexe em nada depois de desligado.
  a.quadros.shift()();
  assert.equal(el.partes['[data-campo="meta"]'].control.attrs['aria-labelledby'], undefined);
  d.abrir({ dailyGoalMinutes: 30, resetHour: 0 });
  assert.equal(a.chamadas.filter((c) => c === 'show').length, 1);
});
