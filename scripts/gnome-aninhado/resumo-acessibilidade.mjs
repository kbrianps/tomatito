#!/usr/bin/env node
// Resume uma rodada do roteiro acessibilidade (M43): as checagens do roteiro
// (resultado.json) e os logs das partidas. Sai com código 1 se alguma
// conferência falhar.
//
//   node scripts/gnome-aninhado/resumo-acessibilidade.mjs <pasta da rodada>
import { existsSync, readFileSync, readdirSync } from 'node:fs';

const pasta = process.argv[2];
const r = JSON.parse((existsSync(`${pasta}/resultado.json`) ? readFileSync(`${pasta}/resultado.json`, 'utf8') : '') || '{}');
const logs = readdirSync(pasta).filter((a) => /^app-[\w-]+\.log$/.test(a)).map((a) => readFileSync(`${pasta}/${a}`, 'utf8')).join('\n');
const sonda = existsSync(`${pasta}/sonda.jsonl`)
  ? readFileSync(`${pasta}/sonda.jsonl`, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
  : [];

console.log(`rodada: ${pasta}`);
if (r.erro) console.log(`ERRO no roteiro: ${r.erro}`);
for (const [nome, v] of Object.entries(r.checagens ?? {})) if (!v.ok) console.log(`  ${nome}: ${JSON.stringify(v.detalhe)}`);

const checagens = Object.fromEntries(Object.entries(r.checagens ?? {}).map(([k, v]) => [k, v.ok]));
checagens['sem erro de protocolo do Wayland'] = !/wl_display[^\n]*\.error\(/.test(logs);
checagens['sem pânico do Rust'] = !/panicked at/.test(logs);
checagens['nenhum erro na página'] = !sonda.some((e) => e.tipo === 'erro');
let falhou = false;
for (const [nome, ok] of Object.entries(checagens)) {
  console.log(`${ok ? 'ok   ' : 'FALHA'} ${nome}`);
  if (!ok) falhou = true;
}
process.exit(falhou || r.erro || Object.keys(r.checagens ?? {}).length < Number(process.env.TT_MINIMO ?? 50) ? 1 : 0);
