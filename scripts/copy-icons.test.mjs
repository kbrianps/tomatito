// Testes do scripts/copy-icons.mjs (M13). Rodam no `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { arquivos, comparar, copiar, ICONES } from './copy-icons.mjs';

const SCRIPT = fileURLToPath(new URL('./copy-icons.mjs', import.meta.url));

test('a lista é a do M13 (os 18 ícones do plano, com play, pause e stop preenchidos) mais o pincel do M24, o aviso de erro do M28, o check preenchido do M30 , a lixeira e o check do M33, o copiar do M35 e os cartões do M38', () => {
  assert.deepEqual(
    ICONES.map((i) => i.nome),
    [
      'target', 'hourglass_half', 'timer', 'settings',
      'play', 'pause', 'stop',
      'flag', 'arrow_reset', 'more_horizontal', 'edit', 'add', 'chevron_up', 'chevron_down',
      'circle', 'checkmark_circle', 'checkmark_circle', 'dismiss', 'save',
      'paint_brush',
      'clock_alarm', 'speaker_2',
      'error_circle',
      'delete', 'checkmark',
      'copy',
    ],
  );
  for (const [i, { nome, estilo }] of ICONES.entries()) {
    // M30: o segundo checkmark_circle é o preenchido da tarefa concluída.
    const preenchido = ['play', 'pause', 'stop', 'error_circle'].includes(nome) || (nome === 'checkmark_circle' && ICONES.findIndex((x) => x.nome === nome) !== i);
    assert.equal(estilo, preenchido ? 'filled' : 'regular', nome);
  }
  // M30: os desenhos das tarefas, na grade de 20.
  for (const a of ['circle_20_regular.svg', 'checkmark_circle_20_regular.svg', 'checkmark_circle_20_filled.svg']) assert.ok(arquivos().includes(a), a);
  // M24: o ícone do cartão do tema, na grade de 20 do SettingsCard.
  assert.ok(arquivos().includes('paint_brush_20_regular.svg'));
  // M38: os dos cartões das Sessões de foco, também na grade de 20 (o alvo
  // do painel ganha a de 20, e continua com a de 16).
  for (const a of ['target_20_regular.svg', 'clock_alarm_20_regular.svg', 'speaker_2_20_regular.svg']) assert.ok(arquivos().includes(a), a);
  // Os do painel continuam os do M09 (a mesma grade de 16).
  for (const nome of ['target', 'hourglass_half', 'timer', 'settings']) assert.ok(arquivos().includes(`${nome}_16_regular.svg`));
});

test('src/assets/icons/ está em dia com a lista e com o pacote (node scripts/copy-icons.mjs --conferir)', () => {
  const r = spawnSync(process.execPath, [SCRIPT, '--conferir'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /em dia \(34 ícones\)/);
});

test('copiar() numa pasta vazia, de novo sem mudar nada, e a conferência acusando cada diferença', () => {
  const pasta = mkdtempSync(join(tmpdir(), 'tomatito-icones-'));
  const destino = pathToFileURL(pasta + sep);
  try {
    const primeira = copiar({ destino });
    assert.equal(primeira.escritos.length, arquivos().length + 1, 'os ícones e o README.md');
    assert.deepEqual(readdirSync(pasta).sort(), [...arquivos(), 'README.md'].sort());
    assert.deepEqual(copiar({ destino }).escritos, [], 'a segunda vez não escreve nada');
    const ok = comparar({ destino });
    assert.deepEqual([ok.faltando, ok.diferentes, ok.sobrando], [[], [], []]);

    // Um ícone mexido, um apagado e um que não está na lista.
    writeFileSync(join(pasta, 'play_16_filled.svg'), '<svg/>');
    rmSync(join(pasta, 'save_16_regular.svg'));
    writeFileSync(join(pasta, 'alarm_16_regular.svg'), '<svg/>');
    const r = comparar({ destino });
    assert.deepEqual(r.diferentes, ['play_16_filled.svg']);
    assert.deepEqual(r.faltando, ['save_16_regular.svg']);
    assert.deepEqual(r.sobrando, ['alarm_16_regular.svg']);
    const conserto = copiar({ destino });
    assert.deepEqual(conserto.escritos.sort(), ['play_16_filled.svg', 'save_16_regular.svg']);
    assert.deepEqual(conserto.apagados, ['alarm_16_regular.svg']);
    // Cópia fiel: o mesmo texto do pacote.
    const pacote = new URL('../node_modules/@fluentui/svg-icons/icons/play_16_filled.svg', import.meta.url);
    assert.equal(readFileSync(join(pasta, 'play_16_filled.svg'), 'utf8'), readFileSync(pacote, 'utf8'));
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});

test('ícone fora do pacote é erro (nome ou grade que não existe)', () => {
  const pasta = mkdtempSync(join(tmpdir(), 'tomatito-icones-'));
  try {
    assert.throws(
      () => comparar({ destino: pathToFileURL(pasta + sep), icones: [{ nome: 'arrow_reset', estilo: 'regular', tamanhos: [16] }] }),
      /não tem arrow_reset_16_regular\.svg/,
    );
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});
