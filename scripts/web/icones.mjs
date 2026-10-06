#!/usr/bin/env node
// Ícones do manifest da web (PLANO-WEB, 3.8; PLANO-WEB-V1, W16), rasterizados
// a partir do SVG mestre do M44 (src-tauri/icons/icon.svg) com o Chrome
// headless (não há rsvg-convert nesta máquina). Gera, em
// src/platform/web/icones/:
//
//   - icone-192.png e icone-512.png: o próprio icon.svg (o tomate com o
//     anel), fundo transparente (purpose "any");
//   - icone-maskable-512.png: um fundo creme de ponta a ponta e o tomate no
//     centro, dentro da zona segura (o círculo de raio 40% do lado), para o
//     Android recortar na forma que quiser (purpose "maskable").
//
//   node scripts/web/icones.mjs            # regrava os três PNG
//   node scripts/web/icones.mjs --conferir # só confere se os PNG batem com o SVG
//
// Os PNG ficam no repositório: o build não precisa do Chrome. O plugin-web.mjs
// os publica com hash no nome e os cita no manifest.webmanifest.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { abrirChrome } from './chrome.mjs';

const MESTRE = fileURLToPath(new URL('../../src-tauri/icons/icon.svg', import.meta.url));
const PASTA = fileURLToPath(new URL('../../src/platform/web/icones/', import.meta.url));

/** Lado da zona segura do maskable: o anel cabe no círculo de raio 40%. */
export const RAIO_SEGURO = 0.4;

/** O fundo do maskable e do ícone adaptativo do Android: creme liso. */
export const FUNDO_DO_MASKABLE = '#FFF1EA';

/**
 * O SVG do maskable a partir do mestre (v0.4.1): o fundo creme de ponta a
 * ponta e o tomate (tudo o que vem depois do `<defs>`) reduzido a `escala`
 * em torno do centro, dentro da zona segura.
 */
export function svgMaskable(mestre, escala = 0.72) {
  const defs = /<defs>[\s\S]*?<\/defs>/.exec(mestre);
  const fim = mestre.lastIndexOf('</svg>');
  if (!defs || fim < 0) throw new Error('icones.mjs: o icon.svg mudou de forma (sem <defs>)');
  const desenho = mestre.slice(defs.index + defs[0].length, fim).trim();
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">' +
    defs[0] +
    `<rect width="1024" height="1024" fill="${FUNDO_DO_MASKABLE}"/>` +
    `<g transform="translate(512 512) scale(${escala}) translate(-512 -512)">${desenho}</g>` +
    '</svg>'
  );
}

/** Os três ícones: nome, lado e SVG. */
export function icones(mestre = readFileSync(MESTRE, 'utf8')) {
  return [
    { nome: 'icone-192.png', lado: 192, svg: mestre, proposito: 'any' },
    { nome: 'icone-512.png', lado: 512, svg: mestre, proposito: 'any' },
    { nome: 'icone-maskable-512.png', lado: 512, svg: svgMaskable(mestre), proposito: 'maskable' },
  ];
}

async function rasterizar(chrome, { lado, svg }) {
  const { targetId } = await chrome.cmd('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await chrome.cmd('Target.attachToTarget', { targetId, flatten: true });
  const cmd = (m, p = {}) => chrome.cmd(m, p, sessionId);
  try {
    await cmd('Page.enable');
    await cmd('Emulation.setDeviceMetricsOverride', { width: lado, height: lado, deviceScaleFactor: 1, mobile: false });
    await cmd('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
    const html =
      '<!doctype html><html><head><style>html,body{margin:0;background:transparent}' +
      `img{display:block;width:${lado}px;height:${lado}px}</style></head>` +
      `<body><img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}"></body></html>`;
    const frameId = (await cmd('Page.getFrameTree')).frameTree.frame.id;
    await cmd('Page.setDocumentContent', { frameId, html });
    await cmd('Runtime.evaluate', {
      expression: 'new Promise((r) => { const i = document.querySelector("img"); i.complete ? r() : i.onload = r; })',
      awaitPromise: true,
    });
    const { data } = await cmd('Page.captureScreenshot', {
      format: 'png',
      clip: { x: 0, y: 0, width: lado, height: lado, scale: 1 },
      captureBeyondViewport: false,
    });
    return Buffer.from(data, 'base64');
  } finally {
    await chrome.cmd('Target.closeTarget', { targetId }).catch(() => {});
  }
}

/** Largura e altura de um PNG (o cabeçalho IHDR). */
export function tamanhoDoPng(bytes) {
  if (bytes.subarray(1, 4).toString('latin1') !== 'PNG') throw new Error('não é PNG');
  return { largura: bytes.readUInt32BE(16), altura: bytes.readUInt32BE(20) };
}

async function main() {
  const conferir = process.argv.includes('--conferir');
  const chrome = abrirChrome();
  let diferentes = 0;
  try {
    mkdirSync(PASTA, { recursive: true });
    for (const icone of icones()) {
      const png = await rasterizar(chrome, icone);
      const destino = `${PASTA}${icone.nome}`;
      if (conferir) {
        let atual = null;
        try {
          atual = readFileSync(destino);
        } catch {
          // falta o arquivo
        }
        const igual = atual?.equals(png) ?? false;
        if (!igual) diferentes++;
        console.log(`${igual ? 'ok   ' : 'DIFERENTE'} ${icone.nome}`);
      } else {
        writeFileSync(destino, png);
        console.log(`${icone.nome}: ${icone.lado}×${icone.lado}, ${png.length} bytes`);
      }
    }
  } finally {
    await chrome.fechar();
  }
  process.exit(diferentes ? 1 : 0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((erro) => {
    console.error(erro);
    process.exit(1);
  });
}
