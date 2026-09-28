#!/usr/bin/env node
// Resume uma rodada do roteiro tomate (M50): as checagens do roteiro e, pelo
// app.log (WAYLAND_DEBUG=client), o que o app pediu ao compositor para a
// janela do tomate: um toplevel a mais, com 280 × 280 de mínimo (a janela
// sem moldura, sem a barra padrão do GTK; docs/decisoes.md, M04, achado 1) e
// sem erro de protocolo. Sai com código 1 se algo falhar.
//
//   node scripts/gnome-aninhado/resumo-tomate.mjs <pasta da rodada>
import { existsSync, readFileSync } from 'node:fs';

const pasta = process.argv[2];
const ler = (nome, cod = 'utf8') => (existsSync(`${pasta}/${nome}`) ? readFileSync(`${pasta}/${nome}`, cod) : '');
const r = JSON.parse(ler('resultado.json') || '{}');
const log = ler('app.log', 'latin1');

console.log(`rodada: ${pasta}`);
if (r.erro) console.log(`ERRO no roteiro: ${r.erro}`);
const m = r.medidas ?? {};
if (m.transparencia) console.log(`  cantos (diferença máxima): ${JSON.stringify(m.transparencia.cantos)}; meio: ${JSON.stringify(m.transparencia.meio)}`);
for (const [k, v] of Object.entries(m).filter(([k]) => k.startsWith('arraste-'))) console.log(`  ${k}: pedido ${v.pedido}, andou ${v.delta}`);
for (const a of m.mesmoTempo ?? []) console.log(`  tomate ${a.tomate} (esperado ${a.esperadoTomate} s) · main ${a.main} min (esperado ${a.esperadoMain})`);

const toplevels = (log.match(/get_toplevel\(new id xdg_toplevel#\d+\)/g) ?? []).length;
const minimos = [...new Set([...log.matchAll(/xdg_toplevel#\d+\.set_min_size\(([^)]*)\)/g)].map((x) => x[1]))];
const erros = (log.match(/wl_display[^\n]*\.error\([^\n]*/g) ?? []).slice(0, 3);
console.log(`  toplevels: ${toplevels}; mínimos: ${minimos.join(' | ')}`);

const checagens = Object.fromEntries(Object.entries(r.checagens ?? {}).map(([k, v]) => [k, v.ok]));
checagens['o tomate nasce como toplevel próprio (main + 3 aberturas do tomate)'] = toplevels >= 4;
checagens['mínimo 280 × 280 enviado ao compositor (sem a barra padrão do GTK)'] = minimos.includes('280, 280');
checagens['sem erro de protocolo'] = erros.length === 0;
checagens['o app não entrou em pânico'] = !/panicked at/.test(log);
let falhou = false;
for (const [nome, ok] of Object.entries(checagens)) {
  console.log(`${ok ? 'ok   ' : 'FALHA'} ${nome}`);
  if (!ok) falhou = true;
}
process.exit(falhou || r.erro || !Object.keys(r.checagens ?? {}).length ? 1 : 0);
