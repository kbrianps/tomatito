// Testes do lib/theme.js (M24 e M25): o applyTheme da 4.6 com uma janela, um <html>
// e um settings_set falsos. A troca de verdade (WebKitGTK, Rust e o
// settings.json) é conferida pelo roteiro scripts/gnome-aninhado/roteiros/aparencia.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aplicarTema,
  ESCOLHAS,
  EVENTO,
  ligarSistema,
  ligarTema,
  NATIVO,
  refletirConfiguracoes,
  sairDoFull,
  temaDeBase,
  trocarAtributos,
} from './theme.js';

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

test('as escolhas da interface são os cinco temas da 1.1 e o Sistema por último, e o nativo segue o color-scheme', () => {
  assert.deepEqual(ESCOLHAS, ['lite', 'suave', 'light', 'dark', 'full', 'system']);
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

test('nomes desconhecidos são recusados antes de mexer em qualquer coisa', async () => {
  const h = htmlFalso();
  const win = janelaFalsa();
  const gravar = gravadorFalso();
  const trocas = [];
  await assert.rejects(aplicarTema('roxo', { win, h, gravar, trocarModo: async (f) => trocas.push(f), quadro: quadros() }), /desconhecido/);
  assert.deepEqual(gravar.patches, []);
  assert.deepEqual(win.chamadas, []);
  assert.deepEqual(trocas, []);
});

// Um switch_window_mode falso: anota a chamada e, como o Rust, emite o
// tt://settings da troca, que chega ao <html> um pouco depois (`atraso` ms).
function trocaFalsa(h, ordem, { atraso = 20, ultimo = 'lite' } = {}) {
  return async (full) => {
    ordem.push(`trocar:${full}`);
    const pref = full ? 'full' : ultimo;
    setTimeout(() => {
      ordem.push(`tt://settings:${pref}`);
      trocarAtributos(h, pref, ultimo, { quadro: () => {} });
    }, atraso);
  };
}

test('M51: na main, escolher o Full só chama o switch_window_mode(true); o Rust grava e troca as janelas', async () => {
  const h = htmlFalso({ pref: 'suave', tema: 'suave' });
  const win = janelaFalsa();
  const ordem = [];
  const gravar = gravadorFalso(ordem);
  assert.equal(await aplicarTema('full', { win, h, gravar, trocarModo: trocaFalsa(h, ordem, { ultimo: 'suave' }), quadro: quadros() }), null);
  assert.deepEqual(ordem, ['trocar:true']);
  assert.deepEqual(gravar.patches, []);
  assert.deepEqual(win.chamadas, [], 'o tema nativo da main não muda: ela continua no Suave');
});

test('M51: com o Full ativo, escolher Claro na main sai do Full, espera o tt://settings da saída e só então aplica o Claro', async () => {
  const h = htmlFalso({ pref: 'full', tema: 'lite' });
  const win = janelaFalsa();
  const ordem = [];
  const gravar = gravadorFalso(ordem);
  await aplicarTema('light', { win, h, gravar, trocarModo: trocaFalsa(h, ordem, { atraso: 30 }), quadro: quadros() });
  assert.deepEqual(ordem, ['trocar:false', 'tt://settings:lite', 'gravar:light/light']);
  assert.equal(h.dataset.themePref, 'light');
  assert.equal(h.dataset.theme, 'light');
  assert.deepEqual(win.chamadas, ['setTheme:light']);
  // O último tt-tema é o Claro: o evento da saída não chega depois da escolha.
  assert.deepEqual(h.eventos.at(-1), { pref: 'light', tema: 'light' });
});

test('M51: sairDoFull não fica preso se o tt://settings da saída não chegar', async () => {
  const h = htmlFalso({ pref: 'full', tema: 'lite' });
  const timers = [];
  const relogio = { setTimeout: (f, ms) => (timers.push({ f, ms }), timers.length), clearTimeout: () => {} };
  const trocas = [];
  const fim = sairDoFull({ h, trocarModo: async (f) => trocas.push(f), espera: 1000, relogio });
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(trocas, [false]);
  assert.equal(timers[0].ms, 1000);
  timers[0].f();
  await fim;
  // Um tt-tema que ainda é o Full (outra gravação no meio) não conta como a saída.
  const h2 = htmlFalso({ pref: 'full', tema: 'lite' });
  let saiu = false;
  const fim2 = sairDoFull({ h: h2, trocarModo: async () => {}, relogio: { setTimeout: () => 0, clearTimeout: () => {} } }).then(() => (saiu = true));
  trocarAtributos(h2, 'full', 'dark', { quadro: () => {} });
  await new Promise((r) => setImmediate(r));
  assert.equal(saiu, false);
  trocarAtributos(h2, 'dark', 'dark', { quadro: () => {} });
  await fim2;
  assert.equal(saiu, true);
});

test('M51: no tomate, só o Full vale; outra escolha sai do Full pelo switch_window_mode(false)', async () => {
  const h = htmlFalso({ pref: 'full', tema: 'full' });
  const win = janelaFalsa({ label: 'tomato' });
  const ordem = [];
  const gravar = gravadorFalso(ordem);
  const trocarModo = async (f) => ordem.push(`trocar:${f}`);
  assert.equal(await aplicarTema('full', { win, h, gravar, trocarModo, quadro: quadros() }), null);
  assert.deepEqual(ordem, []);
  assert.equal(await aplicarTema('dark', { win, h, gravar, trocarModo, quadro: quadros() }), null);
  assert.deepEqual(ordem, ['trocar:false']);
  assert.deepEqual(gravar.patches, []);
  assert.equal(h.dataset.theme, 'full');
  assert.deepEqual(win.chamadas, []);
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

// --- M25: seguir o sistema (ligarSistema) ---------------------------------

// O prefers-color-scheme da página: `mudar(t)` dispara o `change`, como o
// WebKitGTK quando o prefer-dark do GTK muda.
function midiaFalsa(t = 'light') {
  const m = new EventTarget();
  m.matches = t === 'dark';
  m.mudar = (novo) => {
    if (m.matches === (novo === 'dark')) return;
    m.matches = novo === 'dark';
    const e = new Event('change');
    e.matches = m.matches;
    m.dispatchEvent(e);
  };
  return m;
}

// Janela com onThemeChanged. `linux`: como o tao 0.37 no Linux, o setTheme
// muda o prefer-dark do GTK (a mídia) e o ThemeChanged não chega à janela.
// Sem `linux`: como no Windows, o ThemeChanged chega com o tema novo.
function janelaDoSistema({ midia, linux = true, fixado = null, sistema = 'light' } = {}) {
  const w = { label: 'main', chamadas: [], fixado, sistema, ouvintes: [] };
  w.onThemeChanged = async (cb) => {
    w.ouvintes.push(cb);
    return () => (w.ouvintes = w.ouvintes.filter((x) => x !== cb));
  };
  w.emitir = (t) => w.ouvintes.forEach((cb) => cb({ payload: t }));
  w.setTheme = async (t) => {
    w.chamadas.push(`setTheme:${t}`);
    w.fixado = t;
    const efetivo = t ?? (linux ? 'light' : w.sistema); // o set_theme(None) do tao grava prefer-dark = false
    if (linux) midia?.mudar(efetivo);
    else queueMicrotask(() => w.emitir(efetivo));
  };
  w.theme = async () => w.fixado ?? w.sistema;
  return w;
}

const logFalso = () => {
  const linhas = [];
  return { linhas, log: (...a) => linhas.push(a.join(' ')), error: (...a) => linhas.push(`ERRO ${a.join(' ')}`) };
};
const pausa = (ms = 30) => new Promise((r) => setTimeout(r, ms));

function montarSistema({ pref = 'system', tema = 'light', plataforma = 'linux', midiaInicial, janela = {} } = {}) {
  const h = htmlFalso({ pref, tema, plataforma });
  const midia = midiaFalsa(midiaInicial ?? (tema === 'dark' || NATIVO[tema] === 'dark' ? 'dark' : 'light'));
  const win = janelaDoSistema({ midia, linux: plataforma === 'linux', ...janela });
  const gravar = gravadorFalso();
  const log = logFalso();
  const s = ligarSistema({ win, h, gravar, midia, log, atraso: 5, quadro: () => {} });
  return { h, midia, win, gravar, log, s };
}

test('temaDeBase: a escolha salva ou, no Full, o lastNormalTheme', () => {
  const h = htmlFalso({ pref: 'suave' });
  assert.equal(temaDeBase(h, {}), 'suave');
  h.dataset.themePref = 'full';
  assert.equal(temaDeBase(h, { __TT_LAST__: 'system' }), 'system');
  assert.equal(temaDeBase(h, {}), 'lite');
});

test('Linux, Sistema: o GNOME escurece; guarda (a): data-theme, resolvedTheme gravado e o theme() do tao acompanha', async () => {
  const { h, midia, win, gravar, log, s } = montarSistema({ janela: { fixado: 'light' } });
  await s.ouvindo;
  midia.mudar('dark'); // o tao aplicou o SetTheme(Some(Dark)) do portal
  await pausa();
  assert.equal(h.dataset.theme, 'dark');
  assert.equal(h.dataset.themePref, 'system');
  assert.deepEqual(gravar.patches, [{ resolvedTheme: 'dark' }]);
  assert.deepEqual(win.chamadas, ['setTheme:dark'], 'sem isso, o theme() responderia o claro antigo');
  assert.deepEqual(h.eventos, [{ pref: 'system', tema: 'dark' }]);
  assert.equal(log.linhas.filter((l) => l.includes('ThemeChanged')).length, 1, 'um ThemeChanged por troca, sem repetição');
  // De volta ao claro
  midia.mudar('light');
  await pausa();
  assert.equal(h.dataset.theme, 'light');
  assert.deepEqual(gravar.patches, [{ resolvedTheme: 'dark' }, { resolvedTheme: 'light' }]);
  s.desligar();
});

test('Linux, tema explícito: guarda (b) reaplica o nativo uma vez, sem mexer no data-theme nem gravar', async () => {
  for (const [tema, esperado, sistema] of [['lite', 'dark', 'light'], ['suave', 'light', 'dark'], ['dark', 'dark', 'light'], ['light', 'light', 'dark']]) {
    const { h, midia, win, gravar, log, s } = montarSistema({ pref: tema, tema, janela: { fixado: esperado } });
    await s.ouvindo;
    midia.mudar(sistema); // o portal aplicou o tema do sistema ao app inteiro
    await pausa();
    assert.equal(h.dataset.theme, tema);
    assert.equal(h.dataset.themePref, tema);
    assert.deepEqual(gravar.patches, []);
    assert.deepEqual(win.chamadas, [`setTheme:${esperado}`], tema);
    assert.equal(midia.matches, esperado === 'dark', 'o prefer-dark voltou ao do tema');
    await pausa();
    assert.equal(win.chamadas.length, 1, 'a volta da mídia não reaplica de novo');
    assert.equal(log.linhas.filter((l) => l.includes('ThemeChanged')).length, 2, 'a ida e a volta, uma vez cada');
    // Mudança que não contraria o tema: nada a fazer
    midia.mudar(esperado);
    await pausa();
    assert.equal(win.chamadas.length, 1);
    s.desligar();
  }
});

test('guarda (b) sem laço mesmo contra uma janela que nunca obedece', async () => {
  // Windows-like: o ThemeChanged chega; esta janela responde sempre claro.
  const { h, win, s, log } = montarSistema({ pref: 'lite', tema: 'lite', plataforma: 'windows', janela: { sistema: 'light' } });
  win.theme = async () => 'light';
  await s.ouvindo;
  win.emitir('light');
  await pausa(80);
  assert.equal(win.chamadas.filter((c) => c === 'setTheme:dark').length, 1, 'uma reaplicação só');
  assert.ok(log.linhas.some((l) => l.includes('sem nova tentativa')));
  assert.equal(h.dataset.theme, 'lite');
  s.desligar();
});

test('Windows, Sistema: o onThemeChanged da janela é o sinal, e o tema vem do theme()', async () => {
  const { h, win, gravar, s } = montarSistema({ plataforma: 'windows', janela: { sistema: 'light' } });
  await s.ouvindo;
  win.sistema = 'dark';
  win.emitir('dark');
  await pausa();
  assert.equal(h.dataset.theme, 'dark');
  assert.deepEqual(gravar.patches, [{ resolvedTheme: 'dark' }]);
  assert.deepEqual(win.chamadas, [], 'fora do Linux, o tema da janela já segue o sistema');
  s.desligar();
});

test('Full com o lastNormalTheme = system: a main segue o sistema', async () => {
  const { h, midia, gravar, s } = montarSistema({ pref: 'full', tema: 'light' });
  globalThis.__TT_LAST__ = 'system';
  try {
    await s.ouvindo;
    midia.mudar('dark');
    await pausa();
    assert.equal(h.dataset.theme, 'dark');
    assert.equal(h.dataset.themePref, 'full');
    assert.deepEqual(gravar.patches, [{ resolvedTheme: 'dark' }]);
  } finally {
    delete globalThis.__TT_LAST__;
    s.desligar();
  }
});

test('durante uma troca pela interface, os sinais esperam; o claro intermediário da guarda (c) não chega à página', async () => {
  // Do Lite para o Sistema com o GNOME escuro: setTheme(null) → prefer-dark
  // falso (a mídia vai a claro) → theme() = dark → setTheme(dark).
  const h = htmlFalso({ pref: 'lite', tema: 'lite', plataforma: 'linux' });
  const midia = midiaFalsa('dark');
  const win = janelaDoSistema({ midia: null, fixado: 'dark', sistema: 'dark' });
  // O prefer-dark chega à página com atraso (IPC do WebKit): o claro do
  // setTheme(null) depois de 10 ms, o escuro do setTheme(dark) depois de 60,
  // bem depois de a troca acabar.
  let atrasoDaMidia = 10;
  const fixarTema = win.setTheme;
  win.setTheme = async (t) => {
    await fixarTema(t);
    const efetivo = t ?? 'light';
    setTimeout(() => midia.mudar(efetivo), atrasoDaMidia);
    atrasoDaMidia = 60;
  };
  win.theme = async () => win.fixado ?? 'dark'; // o portal diz escuro
  const gravar = gravadorFalso();
  const log = logFalso();
  const s = ligarSistema({ win, h, gravar, midia, log, atraso: 5, quadro: () => {} });
  await s.ouvindo;
  const mudancas = [];
  h.addEventListener(EVENTO, (e) => mudancas.push(e.detail.tema));
  await s.durante(
    (async () => {
      const r = await aplicarTema('system', { win, h, gravar, quadro: () => {} });
      await pausa(20); // o claro chega enquanto a troca não acabou
      return r;
    })(),
  );
  await pausa(80);
  assert.deepEqual(mudancas, ['dark']);
  assert.equal(h.dataset.theme, 'dark');
  assert.deepEqual(gravar.patches, [{ theme: 'system', resolvedTheme: 'dark' }]);
  assert.deepEqual(win.chamadas, ['setTheme:null', 'setTheme:dark']);
  s.desligar();
});

test('desligar tira os dois ouvintes', async () => {
  const { h, midia, win, gravar, s } = montarSistema();
  await s.ouvindo;
  s.desligar();
  midia.mudar('dark');
  win.emitir('dark');
  await pausa();
  assert.equal(h.dataset.theme, 'light');
  assert.deepEqual(gravar.patches, []);
});
