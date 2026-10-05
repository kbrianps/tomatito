#!/usr/bin/env node
// Cores das barras do sistema por tema (PLANO-ANDROID, A07a; o A14 repete a
// parte do modo Sistema).
//
//   node scripts/android/barras.mjs [--capturas <prefixo>]
//
// Com o app de depuração aberto no emulador desta faixa: escolhe, pela tela
// Configurações (CDP), cada um dos 4 temas e depois o Sistema com
// `cmd uimode night yes` e `no`. Em cada caso confere:
//   - o pixel do meio (na altura) da faixa da barra de status e da barra de
//     navegação tem a cor do `--tt-bg-app` do tema (±2 por canal). Na
//     horizontal, a 1/4 e a 3/4 da largura: no meio ficam o recorte da câmera
//     (status) e a alça de gestos (navegação);
//   - o `mLastAppearance` do `dumpsys window` tem LIGHT_STATUS_BARS e
//     LIGHT_NAVIGATION_BARS só nos temas claros;
//   - o pid do app não mudou (a troca do modo noturno não recria a Activity).
// Imprime um JSON por caso e sai 1 se algum falhar. Com `--capturas p`, grava
// docs/android/capturas/<p>-<caso>.png. Volta o modo noturno a `no` e o tema
// ao que estava.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { conectar } from './cdp.mjs';
import { carregarAmbiente, criarAdb, esperar } from './lib/ambiente.mjs';

const PASTA = fileURLToPath(new URL('../../docs/android/capturas/', import.meta.url));
const TOLERANCIA = 2;

// A moldura `[l,t][r,b]` de um tipo de inset no `dumpsys window`.
export function moldura(dumpsys, tipo) {
  const m = new RegExp(`type=${tipo} frame=\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\] visible=true`).exec(dumpsys);
  return m ? { l: +m[1], t: +m[2], r: +m[3], b: +m[4] } : null;
}

// As flags do `mLastAppearance` (a aparência que o sistema aplicou por último).
export function aparencia(dumpsys) {
  const m = /mLastAppearance=([^\n]*)/.exec(dumpsys);
  return m ? m[1].trim().split(/\s+/).filter(Boolean) : [];
}

// O `screencap` sem -p: largura, altura, formato (e, nas versões novas, o
// espaço de cor) e os pixels RGBA. O cabeçalho é o que sobra.
export function pixel(bruto, x, y) {
  const w = bruto.readUInt32LE(0);
  const h = bruto.readUInt32LE(4);
  const cabecalho = bruto.length - w * h * 4;
  const i = cabecalho + (y * w + x) * 4;
  return [bruto[i], bruto[i + 1], bruto[i + 2]];
}

export const hex = (rgb) => `#${rgb.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
export const rgbDe = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
export const perto = (a, b) => a.every((c, i) => Math.abs(c - b[i]) <= TOLERANCIA);

async function principal() {
  const i = process.argv.indexOf('--capturas');
  const prefixo = i > 0 ? process.argv[i + 1] : null;
  const env = carregarAmbiente();
  const adb = criarAdb(env);
  const cdp = await conectar();
  const pid0 = cdp.pid;
  const pagina = async () =>
    cdp.avaliar(`(() => { const h = document.documentElement;
      return { pref: h.dataset.themePref, tema: h.dataset.theme,
        fundo: getComputedStyle(h).getPropertyValue('--tt-bg-app').trim().toLowerCase() }; })()`);
  const inicial = await pagina();
  await cdp.avaliar(`location.hash = '#/configuracoes'`);
  await esperar(800);
  const escolher = (tema) =>
    cdp.avaliar(`(async () => { const el = document.querySelector('.tt-tema[data-tema="${tema}"]');
      if (!el) throw new Error('sem o tema ${tema}'); el.click();
      await new Promise((r) => setTimeout(r, 1200)); return true; })()`);

  let falhou = false;
  async function medir(caso, claroEsperado) {
    await esperar(600);
    const p = await pagina();
    const dump = adb.shell('dumpsys window');
    const status = moldura(dump, 'statusBars');
    const nav = moldura(dump, 'navigationBars');
    const bruto = adb.bruto(['exec-out', 'screencap']);
    const w = bruto.readUInt32LE(0);
    const esperado = rgbDe(p.fundo);
    const pontos = {};
    for (const [nome, m] of [['status', status], ['navegacao', nav]]) {
      const y = Math.floor((m.t + m.b) / 2);
      for (const fx of [0.25, 0.75]) pontos[`${nome}@${fx}`] = hex(pixel(bruto, Math.floor(w * fx), y));
    }
    const flags = aparencia(dump);
    const claroStatus = flags.includes('LIGHT_STATUS_BARS');
    const claroNav = flags.includes('LIGHT_NAVIGATION_BARS');
    const pid = Number(adb.shell(`pidof ${process.env.TT_PACOTE || 'io.github.kbrianps.tomatito.debug'}`));
    const ok =
      Object.values(pontos).every((c) => perto(rgbDe(c), esperado)) &&
      claroStatus === claroEsperado &&
      claroNav === claroEsperado &&
      pid === pid0;
    if (!ok) falhou = true;
    if (prefixo) {
      mkdirSync(PASTA, { recursive: true });
      writeFileSync(`${PASTA}${prefixo}-${caso}.png`, adb.bruto(['exec-out', 'screencap', '-p']));
    }
    console.log(JSON.stringify({ caso, ok, tema: p.tema, fundo: p.fundo, pontos, aparencia: flags, pid, status, nav }));
  }

  try {
    for (const [tema, claro] of [['lite', false], ['suave', true], ['light', true], ['dark', false]]) {
      await escolher(tema);
      await medir(tema, claro);
    }
    await escolher('system');
    adb.shell('cmd uimode night yes');
    await esperar(2500);
    await medir('sistema-escuro', false);
    adb.shell('cmd uimode night no');
    await esperar(2500);
    await medir('sistema-claro', true);
  } finally {
    adb.solto(['-s', env.ANDROID_SERIAL, 'shell', 'cmd', 'uimode', 'night', 'no']);
    if (inicial.pref) await escolher(inicial.pref).catch(() => {});
    await cdp.avaliar(`location.hash = '#/foco'`).catch(() => {});
    await cdp.fechar();
  }
  process.exitCode = falhou ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  principal().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
}
