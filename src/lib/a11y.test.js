// Testes do anúncio das fases (M19): o texto de cada tt://phase, a região
// aria-live esvaziada antes de cada texto e um anúncio por seq.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarAnunciador, ligarAnuncioDeFases, textoDaFase } from './a11y.js';

const fase = (kind, n, durationS = 60) => ({ kind, n, durationS });
const evento = (cause, status, phase = null, of = null, seq = 1) => ({ seq, cause, late: false, status, ended: null, phase, of });

test('texto de cada troca de fase de uma sessão de 60 min', () => {
  assert.equal(textoDaFase(evento('started', 'focus', fase('focus', 1), 2)), 'Começou o período de foco 1 de 2.');
  assert.equal(textoDaFase(evento('ended', 'break', fase('break', 1), 1)), 'Começou o intervalo 1 de 1.');
  assert.equal(textoDaFase(evento('ended', 'focus', fase('focus', 2), 2)), 'Começou o período de foco 2 de 2.');
  assert.equal(textoDaFase(evento('ended', 'completed')), 'Sessão de foco concluída.');
});

test('pular, encerrar e casos sem texto', () => {
  assert.equal(textoDaFase(evento('skipped', 'focus', fase('focus', 2), 2)), 'Começou o período de foco 2 de 2.');
  assert.equal(textoDaFase(evento('skipped', 'completed')), 'Sessão de foco concluída.');
  assert.equal(textoDaFase(evento('stopped', 'idle')), 'Sessão de foco encerrada.');
  // Pular com a fase pausada leva à fase seguinte, pausada ou não: o texto é o da fase.
  assert.equal(textoDaFase(evento('skipped', 'paused', fase('focus', 2), 2)), 'Começou o período de foco 2 de 2.');
  assert.equal(textoDaFase(evento('ended', 'idle')), null);
  assert.equal(textoDaFase(evento('ended', 'focus')), null, 'sem a fase, nada');
  assert.equal(textoDaFase(null), null);
  // Sem o total (um evento sem o retrato), o número da fase.
  assert.equal(textoDaFase(evento('started', 'focus', fase('focus', 1))), 'Começou o período de foco 1 de 1.');
});

function relogio() {
  const fila = new Map();
  let id = 0;
  return {
    agendar: (cb) => (fila.set(++id, cb), id),
    cancelar: (i) => fila.delete(i),
    rodar() {
      const cbs = [...fila.values()];
      fila.clear();
      cbs.forEach((cb) => cb());
    },
  };
}

test('a região esvazia e recebe o texto um instante depois; texto repetido é lido de novo', () => {
  const regiao = { textContent: 'velho' };
  const r = relogio();
  const a = criarAnunciador(regiao, r);
  a.anunciar('Sessão de foco concluída.');
  assert.equal(regiao.textContent, '');
  r.rodar();
  assert.equal(regiao.textContent, 'Sessão de foco concluída.');
  a.anunciar('Sessão de foco concluída.');
  assert.equal(regiao.textContent, '', 'o mesmo texto: esvazia antes, para o leitor ler de novo');
  r.rodar();
  assert.equal(regiao.textContent, 'Sessão de foco concluída.');
  // Dois anúncios seguidos: só o último fica.
  a.anunciar('um');
  a.anunciar('dois');
  r.rodar();
  assert.equal(regiao.textContent, 'dois');
  a.anunciar(null);
  r.rodar();
  assert.equal(regiao.textContent, 'dois', 'sem texto, a região fica como está');
});

test('um anúncio por seq: o mesmo evento duas vezes fala uma vez', () => {
  const regiao = { textContent: '' };
  const r = relogio();
  const escritas = [];
  const a = criarAnunciador(
    {
      set textContent(v) {
        regiao.textContent = v;
        if (v) escritas.push(v);
      },
      get textContent() {
        return regiao.textContent;
      },
    },
    r,
  );
  const e1 = evento('started', 'focus', fase('focus', 1), 2, 5);
  a.fase(e1);
  r.rodar();
  a.fase(e1);
  r.rodar();
  a.fase(evento('ended', 'break', fase('break', 1), 1, 6));
  r.rodar();
  assert.deepEqual(escritas, ['Começou o período de foco 1 de 2.', 'Começou o intervalo 1 de 1.']);
});

test('ligarAnuncioDeFases ouve o tt://phase e escreve na região [data-anuncio]', async () => {
  const regiao = { textContent: '' };
  const ouvidos = {};
  const ipc = { EVENTOS: { fase: 'tt://phase' }, ouvir: async (nome, cb) => ((ouvidos[nome] = cb), () => {}) };
  const doc = { querySelector: (s) => (s === '[data-anuncio]' ? regiao : null) };
  await ligarAnuncioDeFases({ ipc, doc });
  ouvidos['tt://phase'](evento('stopped', 'idle', null, null, 9));
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(regiao.textContent, 'Sessão de foco encerrada.');
});

test('index.html: uma única região aria-live, polite e atômica, fora da vista', async () => {
  const { readFileSync } = await import('node:fs');
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  assert.equal([...html.matchAll(/aria-live=/g)].length, 1);
  assert.match(html, /<div class="tt-anuncio" aria-live="polite" aria-atomic="true" data-anuncio><\/div>/);
  const css = readFileSync(new URL('../styles/base.css', import.meta.url), 'utf8');
  const regra = /\.tt-anuncio\{([^}]*)\}/.exec(css)?.[1] ?? '';
  assert.match(regra, /clip-path:inset\(50%\)/);
  assert.doesNotMatch(regra, /display:none|visibility:hidden/);
});
