// Testes da dica do Alt+Espaço no Wayland (M56; PLANO.md, 5.7), com um
// documento falso: o que importa é quando ela aparece e que aparece uma vez.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHAVE, deveMostrar, ligarDicaSempreNaFrente } from './dica-sempre-na-frente.js';
import t from '../lib/i18n/pt-BR.js';

const EVENTO = 'tt-tema';

function falso({ plataforma = 'linux', pref = 'full', visivel = true, armazenamento = new Map() } = {}) {
  const h = new EventTarget();
  h.dataset = { platform: plataforma, themePref: pref };
  const doc = new EventTarget();
  doc.documentElement = h;
  doc.visibilityState = visivel ? 'visible' : 'hidden';
  doc.defaultView = {
    localStorage: {
      getItem: (k) => armazenamento.get(k) ?? null,
      setItem: (k, v) => armazenamento.set(k, String(v)),
    },
  };
  doc.createElement = () => ({ className: '', dataset: {}, textContent: '', remove() { this.removido = true; } });
  const secao = { filhos: [], append(el) { this.filhos.push(el); } };
  const visivelAgora = (v) => {
    doc.visibilityState = v ? 'visible' : 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
  };
  const tema = (p) => {
    h.dataset.themePref = p;
    h.dispatchEvent(new Event(EVENTO));
  };
  return { doc, secao, armazenamento, visivelAgora, tema };
}

const esperar = () => new Promise((r) => setTimeout(r, 0));

test('deveMostrar: no Full, na tela, não vista e sem sempre na frente por código', () => {
  const base = { pref: 'full', visivel: true, vista: false, porCodigo: false };
  assert.equal(deveMostrar(base), true);
  for (const [k, v] of [['pref', 'lite'], ['visivel', false], ['vista', true], ['porCodigo', true], ['porCodigo', null]]) {
    assert.equal(deveMostrar({ ...base, [k]: v }), false, `${k}=${v}`);
  }
});

test('no Wayland com o Full, aparece uma vez com o texto do catálogo', async () => {
  const f = falso();
  const desligar = ligarDicaSempreNaFrente(f.secao, { doc: f.doc, porCodigo: async () => false, evento: EVENTO });
  await esperar();
  assert.equal(f.secao.filhos.length, 1);
  const [dica] = f.secao.filhos;
  assert.equal(dica.textContent, t.tomate.dicaSempreNaFrente);
  assert.equal(
    t.tomate.dicaSempreNaFrente,
    'No GNOME, use Alt+Espaço → Sempre na frente das outras janelas para manter o tomate por cima',
  );
  assert.ok(!('dica' in dica.dataset), 'o data-dica é das dicas dos botões');
  assert.equal(f.armazenamento.get(CHAVE), '1');
  // Some ao sair do Full.
  f.tema('lite');
  assert.equal(dica.removido, true);
  desligar();
  // Vista, não volta.
  const g = falso({ armazenamento: f.armazenamento });
  ligarDicaSempreNaFrente(g.secao, { doc: g.doc, porCodigo: async () => false, evento: EVENTO });
  await esperar();
  assert.equal(g.secao.filhos.length, 0);
});

test('escolher o Full com a tela aberta não mostra (a janela some logo); ao voltar à tela, mostra', async () => {
  const f = falso({ pref: 'lite' });
  let perguntas = 0;
  ligarDicaSempreNaFrente(f.secao, { doc: f.doc, porCodigo: async () => (perguntas++, false), evento: EVENTO });
  await esperar();
  f.tema('full');
  await esperar();
  assert.equal(f.secao.filhos.length, 0);
  f.visivelAgora(false);
  await esperar();
  assert.equal(f.secao.filhos.length, 0);
  assert.equal(f.armazenamento.has(CHAVE), false);
  f.visivelAgora(true);
  await esperar();
  assert.equal(f.secao.filhos.length, 1);
  assert.equal(perguntas, 1);
});

test('nada no X11 (sempre na frente por código), no Windows e fora do Full', async () => {
  // No Windows, o Rust responde true, como no X11 (a tela não pergunta pelo sistema, 3.8).
  for (const [opcoes, porCodigo] of [[{}, true], [{ plataforma: 'windows' }, true], [{ pref: 'dark' }, false]]) {
    const f = falso(opcoes);
    let perguntou = false;
    ligarDicaSempreNaFrente(f.secao, { doc: f.doc, porCodigo: async () => ((perguntou = true), porCodigo), evento: EVENTO });
    await esperar();
    assert.equal(f.secao.filhos.length, 0, JSON.stringify(opcoes));
    if (opcoes.pref) assert.equal(perguntou, false, 'nem pergunta ao Rust');
  }
});
