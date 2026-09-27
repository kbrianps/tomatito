#!/usr/bin/env node
// Resume uma rodada do roteiro mostrador (M18): as checagens do roteiro, a
// série do traço aceso e se o app saiu sozinho depois de a janela fechar. Sai
// com código 1 se alguma conferência falhar.
//
//   node scripts/gnome-aninhado/resumo-mostrador.mjs <pasta da rodada>
import { existsSync, readFileSync } from 'node:fs';

const pasta = process.argv[2];
const ler = (nome, cod = 'utf8') => (existsSync(`${pasta}/${nome}`) ? readFileSync(`${pasta}/${nome}`, cod) : '');
const r = JSON.parse(ler('resultado.json') || '{}');
const appEstado = ler('app-estado.txt').trim();
const log = ler('app.log', 'latin1'); // o WAYLAND_DEBUG pode ter bytes soltos

console.log(`rodada: ${pasta}`);
if (r.erro) console.log(`ERRO no roteiro: ${r.erro}`);
const serie = r.medidas?.serie ?? [];
console.log(`série (min/traço): ${serie.map((s) => `${s.minutos}/${s.aceso}`).join(' ')}`);
for (const [nome, v] of Object.entries(r.checagens ?? {})) console.log(`  ${nome}: ${JSON.stringify(v.detalhe)}`);

const checagens = Object.fromEntries(Object.entries(r.checagens ?? {}).map(([k, v]) => [k, v.ok]));
checagens['o app sai sozinho depois de fechar a janela'] = /^saiu 0$/.test(appEstado);
checagens['sem erro de protocolo do Wayland'] = !/wl_display[^\n]*\.error\(/.test(log);
console.log(`app: ${appEstado || '?'}`);
let falhou = false;
for (const [nome, ok] of Object.entries(checagens)) {
  console.log(`${ok ? 'ok   ' : 'FALHA'} ${nome}`);
  if (!ok) falhou = true;
}
process.exit(falhou || r.erro || !Object.keys(r.checagens ?? {}).length ? 1 : 0);
