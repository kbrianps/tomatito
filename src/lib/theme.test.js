// Testes do lib/theme.js (M24): o applyTheme da 4.6 com uma janela, um <html>
// e um settings_set falsos. A troca de verdade (WebKitGTK, Rust e o
// settings.json) é conferida pelo roteiro scripts/gnome-aninhado/roteiros/aparencia.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aplicarTema, ESCOLHAS, EVENTO, ligarTema, NATIVO, refletirConfiguracoes, trocarAtributos } from './theme.js';

function htmlFalso({ pref = 'lite', tema = 'lite', plataforma = 'linux' } = {}) {
  const h = new EventTarget();
  h.dataset = { themePref: pref, theme: tema, platform: plataforma };
  const classes = new Set();
  h.classList = { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) };
  h.eventos = [];
  h.addEventListener(EVENTO, (e) => h.eventos.push(e.detail));
  return h;
}

function janelaFalsa({ label = 'main', sistema = 'dark' } = {}) {
  const w = { label, chamadas: [], fixado: null };
  w.setTheme = async (t) => {
    w.chamadas.push(`setTheme:${t}`);
    w.fixado = t;
  };
  // Como o tao no Linux: o fixado, ou o do sistema.
  w.theme = async () => (w.chamadas.push('theme'), w.fixado ?? sistema);
  return w;
}

// Quadros guardados, para conferir a classe tt-no-transition antes e depois.
function quadros() {
  const fila = [];
  const quadro = (cb) => fila.push(cb);
  quadro.rodar = () => {
    while (fila.length) fila.shift()();
  };
  return quadro;
}

function gravadorFalso(ordem) {
  const patches = [];
  const gravar = async (patch) => {
    ordem?.push(`gravar:${patch.theme}/${patch.resolvedTheme}`);
    patches.push(patch);
    return { theme: patch.theme, resolvedTheme: patch.resolvedTheme };
  };
  gravar.patches = patches;
  return gravar;
}

test('as escolhas da interface são as cinco da 4.1 sem o Full, e o nativo segue o color-scheme', () => {
  assert.deepEqual(ESCOLHAS, ['lite', 'suave', 'light', 'dark', 'system']);
  assert.deepEqual(NATIVO, { lite: 'dark', suave: 'light', light: 'light', dark: 'dark' });
});

test('tema fixo: grava os atributos sem transição, grava pelo settings_set e depois fixa o tema nativo', async () => {
  const h = htmlFalso();
  const win = janelaFalsa();
  const quadro = quadros();
  const gravar = gravadorFalso(win.chamadas);
  const salvas = await aplicarTema('suave', { win, h, gravar, quadro });
  assert.deepEqual(gravar.patches, [{ theme: 'suave', resolvedTheme: 'suave' }]);
  assert.deepEqual(salvas, { theme: 'suave', resolvedTheme: 'suave' });
  assert.equal(h.dataset.themePref, 'suave');
  assert.equal(h.dataset.theme, 'suave');
  // A ordem da 4.6: settings_set, depois setTheme (Suave → claro)
  assert.deepEqual(win.chamadas, ['gravar:suave/suave', 'setTheme:light']);
  assert.equal(await win.theme(), 'light');
  // Sem transição até dois quadros depois
  assert.ok(h.classList.contains('tt-no-transition'));
  quadro.rodar();
  assert.ok(!h.classList.contains('tt-no-transition'));
  assert.deepEqual(h.eventos, [{ pref: 'suave', tema: 'suave' }]);

  const win2 = janelaFalsa({ sistema: 'light' });
  await aplicarTema('lite', { win: win2, h, gravar: gravadorFalso(), quadro });
  assert.equal(await win2.theme(), 'dark', 'o Lite é escuro, mesmo com o sistema claro');
});

test('Sistema: a guarda (c) — tema nativo limpo, lido e, no Linux, fixado de novo — antes de gravar', async () => {
  const h = htmlFalso({ pref: 'lite', tema: 'lite', plataforma: 'linux' });
  const win = janelaFalsa({ sistema: 'light' });
  const gravar = gravadorFalso(win.chamadas);
  await aplicarTema('system', { win, h, gravar, quadro: quadros() });
  assert.deepEqual(win.chamadas, ['setTheme:null', 'theme', 'setTheme:light', 'gravar:system/light']);
  assert.equal(h.dataset.themePref, 'system');
  assert.equal(h.dataset.theme, 'light');

  // Fora do Linux, sem o setTheme(t) do fim
  const hw = htmlFalso({ plataforma: 'windows' });
  const ww = janelaFalsa({ sistema: 'dark' });
  await aplicarTema('system', { win: ww, h: hw, gravar: gravadorFalso(ww.chamadas), quadro: quadros() });
  assert.deepEqual(ww.chamadas, ['setTheme:null', 'theme', 'gravar:system/dark']);

  // A janela sem tema: vale o prefers-color-scheme
  const hn = htmlFalso();
  const wn = janelaFalsa();
  wn.theme = async () => null;
  await aplicarTema('system', { win: wn, h: hn, gravar: gravadorFalso(), quadro: quadros(), escuroPelaMidia: () => true });
  assert.equal(hn.dataset.theme, 'dark');
});

test('falha no settings_set: o <html> volta ao tema anterior, o tema nativo não muda e o erro sobe', async () => {
  const h = htmlFalso({ pref: 'dark', tema: 'dark' });
  const win = janelaFalsa();
  const erro = { code: 'writeFailed', message: 'disco cheio' };
  await assert.rejects(
    aplicarTema('light', { win, h, gravar: async () => Promise.reject(erro), quadro: quadros() }),
    (e) => e === erro,
  );
  assert.equal(h.dataset.themePref, 'dark');
  assert.equal(h.dataset.theme, 'dark');
  assert.deepEqual(win.chamadas, []);
  assert.deepEqual(h.eventos.at(-1), { pref: 'dark', tema: 'dark' });
});

test('o Full e nomes desconhecidos são recusados antes de mexer em qualquer coisa; o tomate não troca', async () => {
  const h = htmlFalso();
  const win = janelaFalsa();
  const gravar = gravadorFalso();
  await assert.rejects(aplicarTema('full', { win, h, gravar, quadro: quadros() }), /indisponível/);
  await assert.rejects(aplicarTema('roxo', { win, h, gravar, quadro: quadros() }), /desconhecido/);
  assert.deepEqual(gravar.patches, []);
  assert.deepEqual(win.chamadas, []);
  assert.equal(await aplicarTema('dark', { win: janelaFalsa({ label: 'tomato' }), h, gravar, quadro: quadros() }), null);
  assert.equal(h.dataset.theme, 'lite');
});

test('tt://settings: a main regrava data-theme-pref e data-theme (o resolvedTheme) e guarda o lastNormalTheme', async () => {
  const h = htmlFalso();
  const global = {};
  const quadro = quadros();
  assert.equal(refletirConfiguracoes({ theme: 'full', lastNormalTheme: 'dark', resolvedTheme: 'dark' }, { h, quadro, global }), true);
  assert.deepEqual(h.dataset, { themePref: 'full', theme: 'dark', platform: 'linux' });
  assert.equal(global.__TT_LAST__, 'dark');
  quadro.rodar();
  // O mesmo tema de novo: nada muda, mas as telas ainda ouvem o evento
  assert.equal(refletirConfiguracoes({ theme: 'full', lastNormalTheme: 'dark', resolvedTheme: 'dark' }, { h, quadro, global }), false);
  assert.ok(!h.classList.contains('tt-no-transition'));
  assert.equal(h.eventos.length, 2);
  // Sem as chaves de tema, nada
  assert.equal(refletirConfiguracoes({ volume: 3 }, { h, quadro, global }), false);

  // ligarTema ouve o evento certo
  const ouvidos = [];
  const ipc = {
    EVENTOS: { configuracoes: 'tt://settings' },
    ouvir: async (evento, cb) => (ouvidos.push(evento), cb({ theme: 'light', lastNormalTheme: 'light', resolvedTheme: 'light' }), () => {}),
  };
  await ligarTema({ ipc, h, quadro });
  assert.deepEqual(ouvidos, ['tt://settings']);
  assert.equal(h.dataset.theme, 'light');
});

test('trocarAtributos avisa as telas com o evento tt-tema', () => {
  const h = htmlFalso();
  trocarAtributos(h, 'system', 'dark', { quadro: quadros() });
  assert.deepEqual(h.eventos, [{ pref: 'system', tema: 'dark' }]);
});
