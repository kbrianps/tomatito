#!/usr/bin/env node
// Resume uma rodada do roteiro sistema (M25): as checagens do roteiro
// (resultado.json) e os logs de cada partida. Sai com código 1 se alguma
// conferência falhar.
//
//   node scripts/gnome-aninhado/resumo-sistema.mjs <pasta da rodada>
import { existsSync, readFileSync } from 'node:fs';

const pasta = process.argv[2];
const ler = (nome) => (existsSync(`${pasta}/${nome}`) ? readFileSync(`${pasta}/${nome}`, 'utf8') : '');
const r = JSON.parse(ler('resultado.json') || '{}');

console.log(`rodada: ${pasta}`);
if (r.erro) console.log(`ERRO no roteiro: ${r.erro}`);
for (const [nome, v] of Object.entries(r.checagens ?? {})) console.log(`  ${nome}: ${JSON.stringify(v.detalhe)}`);

const checagens = Object.fromEntries(Object.entries(r.checagens ?? {}).map(([k, v]) => [k, v.ok]));
const logs = [1, 2].map((i) => ler(`app-${i}.log`)).join('\n');
checagens['sem erro de protocolo do Wayland'] = !/wl_display[^\n]*\.error\(/.test(logs);
checagens['sem pânico do Rust'] = !/panicked at/.test(logs);
let falhou = false;
for (const [nome, ok] of Object.entries(checagens)) {
  console.log(`${ok ? 'ok   ' : 'FALHA'} ${nome}`);
  if (!ok) falhou = true;
}
process.exit(falhou || r.erro || Object.keys(r.checagens ?? {}).length < 12 ? 1 : 0);
