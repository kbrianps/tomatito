#!/usr/bin/env node
// Captura da tela do emulador (PLANO-ANDROID, A02 e 6).
//
//   node scripts/android/captura.mjs <nome>
//
// Grava docs/android/capturas/<nome>.png com o `adb exec-out screencap -p` do
// emulador desta faixa (serial e porta do adb vêm do ambiente.sh) e imprime,
// em JSON, o caminho, a largura e a altura lidas do cabeçalho do PNG.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { carregarAmbiente, criarAdb } from './lib/ambiente.mjs';

const PASTA = fileURLToPath(new URL('../../docs/android/capturas/', import.meta.url));
const ASSINATURA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// Largura e altura do IHDR (sempre o primeiro bloco, logo depois da assinatura).
export function medidasPng(png) {
  if (png.length < 24 || !png.subarray(0, 8).equals(ASSINATURA_PNG) || png.toString('latin1', 12, 16) !== 'IHDR') {
    throw new Error('a saída do screencap não é um PNG');
  }
  return { largura: png.readUInt32BE(16), altura: png.readUInt32BE(20) };
}

const nome = process.argv[2];
try {
  if (!nome || !/^[\w.-]+$/.test(nome)) {
    console.error('uso: captura.mjs <nome>  (letras, números, ".", "_" e "-")');
    process.exitCode = 2;
  } else {
    const env = carregarAmbiente();
    const adb = criarAdb(env);
    const png = adb.bruto(['exec-out', 'screencap', '-p']);
    const { largura, altura } = medidasPng(png);
    mkdirSync(PASTA, { recursive: true });
    const destino = `${PASTA}${nome}.png`;
    writeFileSync(destino, png);
    console.log(JSON.stringify({ arquivo: destino, largura, altura, bytes: png.length }));
  }
} catch (e) {
  console.error(`captura.mjs: ${e.message}`);
  process.exitCode = 1;
}
