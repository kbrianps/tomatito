// Testes do diálogo da validação do Full (M52) sem DOM: a marcação das duas
// perguntas, a contagem, a ordem dos retratos (o seq), as respostas pelos
// botões e pelo Esc, o fechamento por outro caminho e a limpeza. O desenho e
// o teclado de verdade são conferidos na prévia (scripts/preview) e no app
// (roteiro aninhado validacao).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ligar, marcacao, nomeDo, respostaDoEsc, segundosAte } from './validacao-full.js';

test('segundosAte: para cima, nunca negativo', () => {
  assert.equal(segundosAte(10_000, 0), 10);
  assert.equal(segundosAte(10_000, 1), 10);
  assert.equal(segundosAte(10_000, 9_001), 1);
  assert.equal(segundosAte(10_000, 10_000), 0);
  assert.equal(segundosAte(10_000, 12_000), 0);
});

test('marcação: a pergunta da 5.9, Manter em destaque e com o foco, e a contagem', () => {
  const html = marcacao({ seq: 1, state: 'asking', deadlineMs: 10_000 }, { agora: 0 });
  assert.match(html, /^<fluent-dialog-body><h2 slot="title">O tomate aparece com o fundo transparente\?<\/h2>/);
  assert.match(html, /Se ele aparece dentro de um quadrado preto, branco ou vazio, escolha Reverter\./);
  assert.match(html, /<p class="tt-dialogo-validacao-prazo" data-prazo>Voltando ao tema anterior em 10 segundos\.<\/p>/);
  assert.match(
    html,
    /<button type="button" slot="action" class="tt-accent" autofocus data-resposta="keep">Manter<\/button><button type="button" slot="action" data-resposta="revert">Reverter<\/button><\/fluent-dialog-body>$/,
  );
  assert.match(marcacao({ seq: 1, state: 'asking', deadlineMs: 1_000 }, { agora: 500 }), /em 1 segundo\./);
  assert.doesNotMatch(html, /aria-live/, 'a contagem não é anunciada a cada segundo');
  assert.equal(nomeDo({ state: 'asking' }), 'O tomate aparece com o fundo transparente?');
});

test('marcação: a oferta do modo opaco, com o motivo', () => {
  const tempo = marcacao({ seq: 2, state: 'reverted', reason: 'timeout' });
  assert.match(tempo, /<h2 slot="title">Usar o modo opaco\?<\/h2>/);
  assert.match(tempo, /<p data-motivo>Sem resposta, o Tomatito voltou ao tema anterior\.<\/p>/);
  assert.match(tempo, /No modo opaco, o tomate aparece dentro de um quadrado escuro/);
  assert.match(
    tempo,
    /class="tt-accent" autofocus data-resposta="opaque">Usar o modo opaco<\/button><button type="button" slot="action" data-resposta="dismiss">Agora não<\/button>/,
  );
  assert.match(marcacao({ seq: 2, state: 'reverted', reason: 'revert' }), /<p data-motivo>O Tomatito voltou ao tema anterior\.<\/p>/);
  assert.equal(marcacao({ seq: 3, state: 'none' }), '');
  assert.equal(nomeDo({ state: 'reverted' }), 'Usar o modo opaco?');
  assert.equal(respostaDoEsc({ state: 'asking' }), 'revert');
  assert.equal(respostaDoEsc({ state: 'reverted' }), 'dismiss');
  assert.equal(respostaDoEsc({ state: 'none' }), null);
});

// Elementos falsos, só com o que o validacao-full.js usa.
function ambiente({ responder } = {}) {
  const chamadas = [];
  const ouvintes = [];
  const body = { filhos: [], append: (el) => body.filhos.push(el) };
  let relogioAgora = 0;
  const intervalos = new Map();
  let nIntervalo = 0;
  const doc = {
    body,
    // O rádio "Tomatito Full" do clique, com o foco antes de o diálogo abrir.
    activeElement: { blur: () => chamadas.push('blur') },
    createElement: (tag) => {
      const attrs = {};
      const el = {
        tag,
        attrs,
        className: '',
        partes: {},
        html: '',
        dialog: { open: false, close: () => ((el.dialog.open = false), chamadas.push('close')) },
        setAttribute: (n, v) => (attrs[n] = String(v)),
        addEventListener: (tipo, f, captura = false) => ouvintes.push({ tipo, f, captura: Boolean(captura) }),
        removeEventListener: (tipo, f, captura = false) => {
          const i = ouvintes.findIndex((o) => o.tipo === tipo && o.f === f && o.captura === Boolean(captura));
          if (i >= 0) ouvintes.splice(i, 1);
        },
        remove: () => body.filhos.splice(body.filhos.indexOf(el), 1),
        show: () => ((el.dialog.open = true), chamadas.push('show')),
        hide: () => {
          el.dialog.open = false;
          chamadas.push('hide');
          disparar('toggle', { target: el, detail: { newState: 'closed' } });
        },
        querySelector: (s) => el.partes[s] ?? null,
        querySelectorAll: (s) => (s === '[data-resposta]' ? Object.values(el.partes).filter((p) => p.resposta) : []),
      };
      Object.defineProperty(el, 'innerHTML', {
        get: () => el.html,
        set: (html) => {
          el.html = html;
          el.partes = {};
          const prazo = /data-prazo>([^<]*)</.exec(html);
          if (prazo) el.partes['[data-prazo]'] = { textContent: prazo[1] };
          for (const m of html.matchAll(/<button[^>]*?( autofocus)? data-resposta="(\w+)"/g)) {
            const b = {
              resposta: m[2],
              disabled: false,
              dataset: { resposta: m[2] },
              focus: () => chamadas.push(`foco:${m[2]}`),
            };
            b.closest = () => b;
            el.partes[m[2]] = b;
            if (m[1]) el.partes['[autofocus]'] = b;
          }
        },
      });
      return el;
    },
  };
  function disparar(tipo, ev, { captura } = {}) {
    for (const o of [...ouvintes]) if (o.tipo === tipo && (captura === undefined || o.captura === captura)) o.f(ev);
  }
  let aoEvento = null;
  let desligouEvento = false;
  let retratoInicial = { seq: 0, state: 'none' };
  const ipc = {
    full: {
      EVENTO_VALIDACAO: 'tt://full-validation',
      validacao: () => Promise.resolve(retratoInicial),
      responderValidacao: (r) => {
        chamadas.push(`responder:${r}`);
        return responder ? responder(r) : Promise.resolve({ seq: 0, state: 'none' });
      },
    },
    ouvir: (evento, cb) => {
      chamadas.push(`ouvir:${evento}`);
      aoEvento = cb;
      return Promise.resolve(() => (desligouEvento = true));
    },
  };
  return {
    doc,
    ipc,
    chamadas,
    disparar,
    agora: () => relogioAgora,
    avancar: (ms) => {
      relogioAgora += ms;
      for (const f of intervalos.values()) f();
    },
    relogio: {
      setInterval: (f) => (intervalos.set(++nIntervalo, f), nIntervalo),
      clearInterval: (id) => intervalos.delete(id),
    },
    intervalos,
    evento: (r) => aoEvento(r),
    inicial: (r) => (retratoInicial = r),
    desligouEvento: () => desligouEvento,
    log: { warn: (...x) => chamadas.push(`aviso:${x[0]}`) },
  };
}
const esperar = () => new Promise((r) => setTimeout(r, 0));
const tecla = (a, key) => {
  const ev = { key, impedido: false, preventDefault: () => (ev.impedido = true), stopPropagation: () => {} };
  a.disparar('keydown', ev, { captura: true });
  return ev;
};

test('ligar: ouve o evento antes de pedir o retrato, e abre a pergunta pendente (a main recriada)', async () => {
  const a = ambiente();
  a.inicial({ seq: 4, state: 'asking', deadlineMs: 10_000 });
  const d = ligar(a);
  const el = d.elemento;
  assert.equal(el.tag, 'fluent-dialog');
  assert.deepEqual(a.doc.body.filhos, [el]);
  assert.equal(el.className, 'tt-dialogo-validacao');
  assert.equal(el.attrs.type, 'alert', 'sem fechar pelo clique no fundo');
  await d.pronto;
  // Sem foco antes de abrir: ao fechar, o <dialog> não o devolve ao rádio "Tomatito Full".
  assert.deepEqual(a.chamadas, ['ouvir:tt://full-validation', 'blur', 'show']);
  assert.equal(el.attrs['aria-label'], 'O tomate aparece com o fundo transparente?');
  assert.equal(el.partes['[data-prazo]'].textContent, 'Voltando ao tema anterior em 10 segundos.');
  d.desligar();
  assert.equal(a.desligouEvento(), true);
  assert.deepEqual(a.doc.body.filhos, []);
});

test('contagem: troca o texto a cada segundo e para quando a pergunta sai', async () => {
  const a = ambiente();
  const d = ligar(a);
  await d.pronto;
  assert.deepEqual(a.chamadas, ['ouvir:tt://full-validation'], 'sem pergunta, nada abre');
  a.evento({ seq: 1, state: 'asking', deadlineMs: 10_000 });
  const el = d.elemento;
  a.avancar(400);
  assert.equal(el.partes['[data-prazo]'].textContent, 'Voltando ao tema anterior em 10 segundos.');
  a.avancar(700);
  assert.equal(el.partes['[data-prazo]'].textContent, 'Voltando ao tema anterior em 9 segundos.');
  a.avancar(8000);
  assert.equal(el.partes['[data-prazo]'].textContent, 'Voltando ao tema anterior em 1 segundo.');
  a.avancar(2000);
  assert.equal(el.partes['[data-prazo]'].textContent, 'Voltando ao tema anterior em 0 segundos.');
  assert.equal(a.intervalos.size, 1);
  // O Rust reverteu: a oferta do modo opaco, no mesmo diálogo, com o foco no destaque.
  a.evento({ seq: 2, state: 'reverted', reason: 'timeout' });
  assert.equal(a.intervalos.size, 0, 'a contagem parou');
  assert.match(el.html, /Sem resposta, o Tomatito voltou ao tema anterior\./);
  assert.equal(el.attrs['aria-label'], 'Usar o modo opaco?');
  assert.deepEqual(a.chamadas.slice(1), ['blur', 'show', 'foco:opaque']);
  d.desligar();
});

test('seq: um retrato velho (o get que chega depois do evento) não desfaz o novo', async () => {
  const a = ambiente();
  a.inicial({ seq: 1, state: 'none' });
  const d = ligar(a);
  // O evento da pergunta chega antes da resposta do get.
  a.evento({ seq: 2, state: 'asking', deadlineMs: 10_000 });
  await d.pronto;
  assert.equal(d.elemento.dialog.open, true);
  assert.equal(d.aplicar({ seq: 2, state: 'none' }), false, 'o mesmo seq de novo');
  assert.equal(d.aplicar({ seq: 1, state: 'none' }), false);
  assert.equal(d.aplicar(null), false);
  assert.equal(d.elemento.dialog.open, true);
  assert.equal(d.aplicar({ seq: 3, state: 'none' }), true);
  assert.equal(d.elemento.dialog.open, false);
  assert.equal(a.intervalos.size, 0);
  d.desligar();
});

test('Manter: responde keep uma vez só, com os botões esperando, e fecha pelo retrato', async () => {
  let soltar;
  const a = ambiente({ responder: () => new Promise((r) => (soltar = r)) });
  const d = ligar(a);
  await d.pronto;
  a.evento({ seq: 1, state: 'asking', deadlineMs: 10_000 });
  const el = d.elemento;
  a.disparar('click', { target: el.partes.keep });
  assert.equal(el.partes.keep.disabled, true);
  assert.equal(el.partes.revert.disabled, true);
  a.disparar('click', { target: el.partes.keep });
  assert.equal(tecla(a, 'Escape').impedido, true, 'o Esc não fecha o <dialog> no meio');
  soltar({ seq: 2, state: 'none' });
  await esperar();
  assert.deepEqual(a.chamadas.filter((c) => c.startsWith('responder')), ['responder:keep']);
  assert.equal(el.dialog.open, false);
  assert.equal(a.chamadas.filter((c) => c.startsWith('responder')).length, 1, 'o hide daqui não vira resposta');
  d.desligar();
});

test('Esc: Reverter na pergunta e "Agora não" na oferta; outras teclas passam', async () => {
  let n = 1;
  const a = ambiente({
    responder: (r) =>
      Promise.resolve(r === 'revert' ? { seq: ++n, state: 'reverted', reason: 'revert' } : { seq: ++n, state: 'none' }),
  });
  const d = ligar(a);
  await d.pronto;
  a.evento({ seq: 1, state: 'asking', deadlineMs: 10_000 });
  assert.equal(tecla(a, 'Enter').impedido, false);
  assert.equal(tecla(a, 'Escape').impedido, true);
  await esperar();
  assert.match(d.elemento.html, /O Tomatito voltou ao tema anterior\./);
  assert.equal(d.elemento.dialog.open, true);
  tecla(a, 'Escape');
  await esperar();
  assert.deepEqual(a.chamadas.filter((c) => c.startsWith('responder')), ['responder:revert', 'responder:dismiss']);
  assert.equal(d.elemento.dialog.open, false);
  d.desligar();
});

test('fechado por outro caminho, vale o Esc; a oferta aceita o modo opaco', async () => {
  const a = ambiente({ responder: (r) => Promise.resolve(r === 'revert' ? { seq: 2, state: 'reverted', reason: 'revert' } : { seq: 3, state: 'none' }) });
  const d = ligar(a);
  await d.pronto;
  a.evento({ seq: 1, state: 'asking', deadlineMs: 10_000 });
  // O <dialog> fecha sozinho (um segundo Esc que o navegador não deixa impedir).
  d.elemento.dialog.open = false;
  a.disparar('toggle', { target: d.elemento, detail: { newState: 'closed' } });
  await esperar();
  assert.equal(d.elemento.dialog.open, true, 'reaberto com a oferta');
  a.disparar('click', { target: d.elemento.partes.opaque });
  await esperar();
  assert.deepEqual(a.chamadas.filter((c) => c.startsWith('responder')), ['responder:revert', 'responder:opaque']);
  assert.equal(d.elemento.dialog.open, false);
  d.desligar();
});

test('uma resposta recusada fica no console e devolve os botões', async () => {
  const a = ambiente({ responder: () => Promise.reject('validação indisponível') });
  const d = ligar(a);
  await d.pronto;
  a.evento({ seq: 1, state: 'asking', deadlineMs: 10_000 });
  a.disparar('click', { target: d.elemento.partes.revert });
  await esperar();
  assert.ok(a.chamadas.includes('aviso:[validação do Full]'));
  assert.equal(d.elemento.partes.revert.disabled, false);
  assert.equal(d.elemento.dialog.open, true);
  d.desligar();
});
