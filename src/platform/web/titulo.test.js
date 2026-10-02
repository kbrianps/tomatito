import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CHAVE, MARCA, SEM_SESSAO, contagemDoFoco, contagemDoTick, gravarLigado, ligado, minutos, titulo } from './titulo.js';

const MIN = 60_000;

// O `i18n::tray_time` do motor, que no app chega pelo `tempoNaAba` do wasm.
const TEXTOS = { focus: (m) => `${m} min`, break: (m) => `Intervalo · ${m} min`, paused: (m) => `Pausado · ${m} min` };
const tempoNaAba = (fase, m) => TEXTOS[fase]?.(m) ?? null;

const foco = (status, remainingMs) => ({ seq: 1, status, at: 0, session: status === 'idle' ? null : { remainingMs } });

test('o texto de teste é o do i18n::tray_time', () => {
  const rs = readFileSync(fileURLToPath(new URL('../../../src-tauri/tomatito-motor/src/i18n.rs', import.meta.url)), 'utf8');
  assert.match(rs, /TrayPhase::Focus => format!\("\{minutes\} min"\)/);
  assert.match(rs, /TrayPhase::Break => format!\("Intervalo · \{minutes\} min"\)/);
  assert.match(rs, /TrayPhase::Paused => format!\("Pausado · \{minutes\} min"\)/);
});

test('o wasm exporta o tempoNaAba sobre o tray_time', () => {
  const rs = readFileSync(fileURLToPath(new URL('../../../src-tauri/tomatito-wasm/src/lib.rs', import.meta.url)), 'utf8');
  assert.match(rs, /#\[wasm_bindgen\(js_name = tempoNaAba\)\]/);
  assert.match(rs, /i18n::tray_time\(fase, minutos as u64\)/);
});

test('25 min, depois de 61 s 24 min, em pausa "Pausado · 24 min"', () => {
  assert.equal(titulo(contagemDoFoco(foco('focus', 25 * MIN)), true, tempoNaAba), '25 min · Tomatito');
  assert.equal(titulo(contagemDoFoco(foco('focus', 25 * MIN - 61_000)), true, tempoNaAba), '24 min · Tomatito');
  assert.equal(titulo(contagemDoFoco(foco('paused', 25 * MIN - 61_000)), true, tempoNaAba), 'Pausado · 24 min · Tomatito');
  assert.equal(titulo(contagemDoFoco(foco('break', 4 * MIN + 1)), true, tempoNaAba), 'Intervalo · 5 min · Tomatito');
});

test('os minutos arredondam para cima, como o div_ceil da bandeja', () => {
  assert.equal(minutos(24 * MIN + 13_000), 25);
  assert.equal(minutos(24 * MIN), 24);
  assert.equal(minutos(24 * MIN + 1), 25);
  assert.equal(minutos(1), 1);
  assert.equal(minutos(0), 0);
  assert.equal(minutos(-5), 0);
});

test('sem sessão em andamento, só a marca', () => {
  assert.equal(titulo(contagemDoFoco(foco('idle')), true, tempoNaAba), MARCA);
  assert.equal(titulo(contagemDoFoco(foco('completed', 0)), true, tempoNaAba), MARCA);
  assert.equal(titulo(contagemDoFoco(undefined), true, tempoNaAba), MARCA);
  assert.equal(titulo(undefined, true, tempoNaAba), MARCA);
  assert.deepEqual(contagemDoFoco({ status: 'idle' }), SEM_SESSAO);
});

test('com a chave desligada, ou sem o wasm, só a marca', () => {
  assert.equal(titulo(contagemDoFoco(foco('focus', 25 * MIN)), false, tempoNaAba), 'Tomatito');
  assert.equal(titulo(contagemDoFoco(foco('focus', 25 * MIN)), true, null), 'Tomatito');
  assert.equal(titulo({ fase: 'outra', restanteMs: MIN }, true, tempoNaAba), 'Tomatito');
});

test('o tick leva a fase e o restante', () => {
  assert.deepEqual(contagemDoTick({ phase: { kind: 'focus' }, remainingMs: 1000 }), { fase: 'focus', restanteMs: 1000 });
  assert.deepEqual(contagemDoTick({ phase: { kind: 'break' }, remainingMs: 5 }), { fase: 'break', restanteMs: 5 });
  assert.equal(titulo(contagemDoTick({ phase: { kind: 'focus' }, remainingMs: 23 * MIN + 59_000 }), true, tempoNaAba), '24 min · Tomatito');
});

test('a chave tomatito:web.tempoNaAba: ausente é ligado, "0" desliga', () => {
  const dados = new Map();
  const arm = { getItem: (k) => dados.get(k) ?? null, setItem: (k, v) => dados.set(k, String(v)) };
  assert.equal(CHAVE, 'tomatito:web.tempoNaAba');
  assert.equal(ligado(arm), true);
  gravarLigado(arm, false);
  assert.equal(dados.get(CHAVE), '0');
  assert.equal(ligado(arm), false);
  gravarLigado(arm, true);
  assert.equal(ligado(arm), true);
  assert.equal(ligado(null), true);
  const quebrado = { getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('bloqueado'); } };
  assert.equal(ligado(quebrado), true);
  assert.doesNotThrow(() => gravarLigado(quebrado, false));
});
