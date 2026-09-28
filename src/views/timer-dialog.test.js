// Testes do diálogo de adicionar e editar temporizador (M33) sem DOM: as
// contas de horas, minutos e segundos, as teclas dos campos, a marcação e,
// com elementos falsos, salvar um novo, salvar uma edição, a duração zero, o
// erro do Rust e o foco de volta a quem abriu. O desenho é conferido na
// prévia (scripts/preview/temporizador-edicao.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAMPOS, DURACAO_NOVA_MS, criar, duracaoMs, lerCampo, marcacao, partes, textoDoErro, valorDaTecla } from './timer-dialog.js';

test('partes e duração: ida e volta, com as horas até 99', () => {
  assert.deepEqual(partes(4 * 60_000), { h: 0, m: 4, s: 0 });
  assert.deepEqual(partes(3_723_000), { h: 1, m: 2, s: 3 });
  assert.deepEqual(partes(359_999_000), { h: 99, m: 59, s: 59 });
  assert.deepEqual(partes(-5), { h: 0, m: 0, s: 0 });
  assert.equal(duracaoMs({ h: 1, m: 2, s: 3 }), 3_723_000);
  assert.equal(duracaoMs(partes(DURACAO_NOVA_MS)), 300_000);
  assert.deepEqual(CAMPOS.map((c) => [c.id, c.max]), [['h', 99], ['m', 59], ['s', 59]]);
});

test('ler o campo: só algarismos, as duas últimas casas, no limite', () => {
  assert.equal(lerCampo('07', 59), 7);
  assert.equal(lerCampo('', 59), 0);
  assert.equal(lerCampo('a4b', 59), 4);
  assert.equal(lerCampo('75', 59), 59);
  assert.equal(lerCampo('123', 99), 23);
});

test('teclas: ↑/↓ dão a volta, PageUp/PageDown andam 10, Home/End vão aos limites', () => {
  assert.equal(valorDaTecla(59, { key: 'ArrowUp' }, 59), 0);
  assert.equal(valorDaTecla(0, { key: 'ArrowDown' }, 59), 59);
  assert.equal(valorDaTecla(0, { key: 'ArrowDown' }, 99), 99);
  assert.equal(valorDaTecla(55, { key: 'PageUp' }, 59), 59);
  assert.equal(valorDaTecla(5, { key: 'PageDown' }, 59), 0);
  assert.equal(valorDaTecla(30, { key: 'Home' }, 59), 0);
  assert.equal(valorDaTecla(30, { key: 'End' }, 99), 99);
  assert.equal(valorDaTecla(30, { key: 'a' }, 59), null);
  assert.equal(valorDaTecla(30, { key: 'ArrowUp', ctrlKey: true }, 59), null);
});

test('marcação: título, os três campos com role=spinbutton, o nome escapado e os botões', () => {
  const novo = marcacao();
  assert.match(novo, /<h2 slot="title">Adicionar temporizador<\/h2>/);
  const campos = [...novo.matchAll(/data-campo="(\w)" role="spinbutton"[^>]*aria-label="(\w+)" aria-valuemin="0" aria-valuemax="(\d+)" aria-valuenow="(\d+)" value="(\d\d)"/g)];
  assert.deepEqual(campos.map((m) => m.slice(1)), [
    ['h', 'Horas', '99', '0', '00'],
    ['m', 'Minutos', '59', '5', '05'],
    ['s', 'Segundos', '59', '0', '00'],
  ]);
  assert.match(novo, /data-mais="h" aria-label="Aumentar horas"/);
  assert.match(novo, /data-menos="s" aria-label="Diminuir segundos"/);
  assert.equal((novo.match(/tabindex="-1"/g) ?? []).length, 6, 'os chevrons ficam fora do Tab');
  assert.match(novo, /aria-label="Nome do temporizador" placeholder="Nome do temporizador" value="">/);
  const icone = (n) => `<svg data-icone="${n}"></svg>`;
  assert.match(marcacao(null, icone), /class="tt-accent" data-salvar><svg data-icone="save"><\/svg>Salvar<\/button><button type="button" slot="action" data-cancelar><svg data-icone="dismiss"><\/svg>Cancelar/);
  const editar = marcacao({ id: 3, name: '"Chá" <verde>', durationMs: 4 * 60_000 + 30_000 });
  assert.match(editar, /<h2 slot="title">Editar temporizador<\/h2>/);
  assert.match(editar, /value="&quot;Chá&quot; &lt;verde&gt;">/);
  assert.match(editar, /data-campo="m"[^>]*value="04"/);
  assert.match(editar, /data-campo="s"[^>]*value="30"/);
});

test('texto do erro pelo código do Rust', () => {
  assert.equal(textoDoErro({ code: 'nameTooLong' }), 'O nome pode ter até 255 caracteres.');
  assert.equal(textoDoErro({ code: 'invalidDuration' }), 'Escolha uma duração de pelo menos 1 segundo.');
  assert.equal(textoDoErro({ code: 'notFound' }), 'Não foi possível salvar o temporizador. Tente de novo.');
  assert.equal(textoDoErro(new Error('x')), 'Não foi possível salvar o temporizador. Tente de novo.');
});

// Elementos falsos, só com o que o timer-dialog.js usa.
function ambiente(aoSalvar) {
  const chamadas = [];
  const quadros = [];
  const salvos = [];
  const body = { filhos: [], append: (el) => body.filhos.push(el) };
  const doc = {
    body,
    defaultView: { requestAnimationFrame: (f) => quadros.push(f) },
    createElement: (tag) => {
      const ouvintes = [];
      const attrs = {};
      const el = {
        tag,
        attrs,
        partes: {},
        dialog: { open: false, close: () => (el.dialog.open = false) },
        setAttribute: (n, v) => (attrs[n] = String(v)),
        addEventListener: (tipo, f, captura = false) => ouvintes.push({ tipo, f, captura: Boolean(captura) }),
        removeEventListener: (tipo, f, captura = false) => {
          const i = ouvintes.findIndex((o) => o.tipo === tipo && o.f === f && o.captura === Boolean(captura));
          if (i >= 0) ouvintes.splice(i, 1);
        },
        disparar: (tipo, ev) => ouvintes.filter((o) => o.tipo === tipo).forEach((o) => o.f(ev)),
        ouvintes,
        remove: () => body.filhos.splice(body.filhos.indexOf(el), 1),
        show: () => ((el.dialog.open = true), chamadas.push('show')),
        hide: () => {
          el.dialog.open = false;
          chamadas.push('hide');
          el.disparar('toggle', { target: el, detail: { newState: 'closed' } });
        },
        querySelector: (s) => el.partes[s] ?? null,
        querySelectorAll: (s) => (s === '[data-salvar], [data-cancelar]' ? [el.partes.salvar, el.partes.cancelar] : []),
      };
      Object.defineProperty(el, 'innerHTML', {
        get: () => el.html,
        set: (html) => {
          el.html = html;
          const campo = (id) => {
            const c = {
              value: new RegExp(`data-campo="${id}"[^>]*value="(\\d+)"`).exec(html)[1],
              attrs: {},
              getAttribute: (n) => (n === 'data-campo' ? id : null),
              setAttribute: (n, v) => (c.attrs[n] = v),
              focus: () => chamadas.push(`foco:${id}`),
              select: () => {},
              closest: () => null,
            };
            return c;
          };
          const texto = { textContent: '' };
          const botao = (id, extra = {}) => ({
            disabled: false,
            hasAttribute: (n) => n === `data-${id}`,
            getAttribute: (n) => extra[n] ?? null,
            closest: () => el.partes[id],
          });
          el.partes = {
            '[data-campo="h"]': campo('h'),
            '[data-campo="m"]': campo('m'),
            '[data-campo="s"]': campo('s'),
            '[data-nome]': { value: /data-nome[^>]*value="([^"]*)"/.exec(html)[1] },
            '[data-erro]': { hidden: true, querySelector: () => texto, texto },
            salvar: botao('salvar'),
            cancelar: botao('cancelar'),
            maisM: botao('maisM', { 'data-mais': 'm' }),
          };
          el.partes.maisM.hasAttribute = (n) => n === 'data-mais';
        },
      });
      return el;
    },
  };
  const d = criar({
    doc,
    aoSalvar: (v) => {
      salvos.push(v);
      return aoSalvar ? aoSalvar(v) : Promise.resolve();
    },
  });
  return { d, el: d.elemento, doc, chamadas, quadros, salvos };
}
const esperar = () => new Promise((r) => setTimeout(r, 0));
const clicar = (el, id) => el.disparar('click', { target: el.partes[id] });

test('novo: abre com 00:05:00, põe o foco nas horas, salva sem id e devolve o foco ao "+"', async () => {
  const a = ambiente();
  const mais = { focus: () => a.chamadas.push('foco:+') };
  assert.equal(a.el.tag, 'fluent-dialog');
  assert.deepEqual(a.doc.body.filhos, [a.el]);
  a.d.abrir(null, mais);
  assert.equal(a.el.attrs['aria-label'], 'Adicionar temporizador');
  a.quadros.shift()();
  assert.deepEqual(a.chamadas, ['show', 'foco:h']);
  // "Chá · 4 min": os minutos em 04, e o nome.
  a.el.partes['[data-campo="m"]'].value = '04';
  a.el.partes['[data-nome]'].value = 'Chá';
  clicar(a.el, 'salvar');
  assert.equal(a.el.partes.salvar.disabled, true);
  await esperar();
  assert.deepEqual(a.salvos, [{ id: null, nome: 'Chá', duracaoMs: 240_000 }]);
  assert.deepEqual(a.chamadas, ['show', 'foco:h', 'hide', 'foco:+']);
  a.d.desligar();
  assert.deepEqual(a.doc.body.filhos, []);
  assert.equal(a.el.ouvintes.length, 0, 'desligar tira todos os ouvintes');
});

test('editar: abre com os valores do temporizador e salva com o id', async () => {
  const a = ambiente();
  a.d.abrir({ id: 7, name: 'Chá', durationMs: 240_000 }, null);
  assert.equal(a.el.attrs['aria-label'], 'Editar temporizador');
  assert.equal(a.el.partes['[data-campo="m"]'].value, '04');
  assert.equal(a.el.partes['[data-nome]'].value, 'Chá');
  // O chevron de cima dos minutos: 04 → 05.
  clicar(a.el, 'maisM');
  assert.equal(a.el.partes['[data-campo="m"]'].value, '05');
  assert.equal(a.el.partes['[data-campo="m"]'].attrs['aria-valuenow'], '5');
  a.el.partes['[data-nome]'].value = 'Chá verde';
  clicar(a.el, 'salvar');
  await esperar();
  assert.deepEqual(a.salvos, [{ id: 7, nome: 'Chá verde', duracaoMs: 300_000 }]);
  a.d.desligar();
});

test('duração zero não chega ao Rust; um erro do Rust deixa o diálogo aberto com o aviso', async () => {
  const warn = console.warn;
  console.warn = () => {};
  try {
    let recusar = true;
    const a = ambiente(() => (recusar ? Promise.reject({ code: 'nameTooLong' }) : Promise.resolve()));
    a.d.abrir(null, null);
    for (const id of ['h', 'm', 's']) a.el.partes[`[data-campo="${id}"]`].value = '00';
    clicar(a.el, 'salvar');
    await esperar();
    assert.deepEqual(a.salvos, []);
    assert.equal(a.el.partes['[data-erro]'].hidden, false);
    assert.equal(a.el.partes['[data-erro]'].texto.textContent, 'Escolha uma duração de pelo menos 1 segundo.');
    a.el.partes['[data-campo="s"]'].value = '30';
    clicar(a.el, 'salvar');
    await esperar();
    assert.equal(a.salvos.length, 1);
    assert.equal(a.d.aberto(), true);
    assert.equal(a.el.partes['[data-erro]'].texto.textContent, 'O nome pode ter até 255 caracteres.');
    assert.equal(a.el.partes.salvar.disabled, false);
    recusar = false;
    clicar(a.el, 'salvar');
    await esperar();
    assert.equal(a.d.aberto(), false);
    // Cancelar fecha sem salvar.
    a.d.abrir(null, null);
    clicar(a.el, 'cancelar');
    assert.equal(a.d.aberto(), false);
    assert.equal(a.salvos.length, 2);
    a.d.desligar();
  } finally {
    console.warn = warn;
  }
});

test('teclado nos campos: ↑ troca o número, Enter salva, Esc durante a gravação espera', async () => {
  let soltar;
  const a = ambiente(() => new Promise((r) => (soltar = r)));
  a.d.abrir(null, null);
  const h = a.el.partes['[data-campo="h"]'];
  const tecla = (key, target = h) => {
    const ev = { key, target, impedido: false, preventDefault: () => (ev.impedido = true) };
    a.el.disparar('keydown', ev);
    return ev;
  };
  assert.equal(tecla('ArrowUp').impedido, true);
  assert.equal(h.value, '01');
  assert.equal(tecla('Tab').impedido, false);
  tecla('Enter');
  assert.equal(a.el.partes.salvar.disabled, true);
  assert.equal(tecla('Escape', a.el).impedido, true);
  soltar();
  await esperar();
  assert.deepEqual(a.salvos, [{ id: null, nome: '', duracaoMs: 3_900_000 }]);
  assert.equal(tecla('Escape', a.el).impedido, false);
  a.d.desligar();
});
