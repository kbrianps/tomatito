#!/usr/bin/env node
// Resume uma rodada do roteiro contagem (M16): as checagens do roteiro, as
// medidas de CPU e se o app saiu sozinho depois de a janela fechar. Sai com
// código 1 se alguma conferência falhar.
//
//   node scripts/gnome-aninhado/resumo-contagem.mjs <pasta da rodada>
import { existsSync, readFileSync } from 'node:fs';

const pasta = process.argv[2];
const ler = (nome, cod = 'utf8') => (existsSync(`${pasta}/${nome}`) ? readFileSync(`${pasta}/${nome}`, cod) : '');
const r = JSON.parse(ler('resultado.json') || '{}');
const appEstado = ler('app-estado.txt').trim();
const log = ler('app.log', 'latin1'); // o WAYLAND_DEBUG pode ter bytes soltos

console.log(`rodada: ${pasta}`);
if (r.erro) console.log(`ERRO no roteiro: ${r.erro}`);
console.log(`processos: ${JSON.stringify(r.medidas?.processos)}`);
for (const k of ['cpuOcioso', 'cpuCorrendo', 'cpuParado']) console.log(`${k} (% de um núcleo): ${JSON.stringify(r.medidas?.[k])}`);
console.log(`minimizada, 1 s depois: ${JSON.stringify(r.medidas?.minimizada)}`);
for (const [nome, v] of Object.entries(r.checagens ?? {})) console.log(`  ${nome}: ${JSON.stringify(v.detalhe)}`);
const avisos = [...ler('app.log').matchAll(/\[tomatito\][^\n]*/g)].map((m) => m[0]);
console.log(`stderr do motor (${avisos.length} linhas): ${JSON.stringify(avisos.slice(0, 8))}`);

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
