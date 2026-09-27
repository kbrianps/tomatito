#!/usr/bin/env node
// Resume uma rodada do roteiro fases (M19): as checagens do roteiro, a
// sequência de estados do cartão, os textos da região aria-live e se o app
// saiu sozinho depois de a janela fechar. Sai com código 1 se alguma
// conferência falhar.
//
//   node scripts/gnome-aninhado/resumo-fases.mjs <pasta da rodada>
import { existsSync, readFileSync } from 'node:fs';

const pasta = process.argv[2];
const ler = (nome, cod = 'utf8') => (existsSync(`${pasta}/${nome}`) ? readFileSync(`${pasta}/${nome}`, cod) : '');
const r = JSON.parse(ler('resultado.json') || '{}');
const appEstado = ler('app-estado.txt').trim();
const log = ler('app.log', 'latin1'); // o WAYLAND_DEBUG pode ter bytes soltos

console.log(`rodada: ${pasta}`);
if (r.erro) console.log(`ERRO no roteiro: ${r.erro}`);
for (const s of r.medidas?.sequencia ?? []) console.log(`  ${(s.t / 1000).toFixed(1)} s: ${s.status} "${s.titulo}" ${s.rodape ?? '-'} (${s.aceso})`);
for (const a of r.medidas?.anuncios ?? []) console.log(`  aria-live ${(a.t / 1000).toFixed(1)} s: "${a.texto}"`);
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
