#!/usr/bin/env node
// Resume uma rodada do roteiro cronometro (M34): as checagens do roteiro (o
// tempo contra o relógio monotônico depois de minimizar e de esconder, o
// state.json a cada transição) e, pelo app.log, nenhuma falha de gravação do
// state.json e nenhum pânico. Sai com código 1 se algo falhar.
//
//   node scripts/gnome-aninhado/resumo-cronometro.mjs <pasta da rodada>
import { existsSync, readFileSync, readdirSync } from 'node:fs';

const pasta = process.argv[2];
const r = JSON.parse((existsSync(`${pasta}/resultado.json`) ? readFileSync(`${pasta}/resultado.json`, 'utf8') : '') || '{}');
const log = existsSync(`${pasta}/app.log`) ? readFileSync(`${pasta}/app.log`, 'utf8') : '';
const appEstado = existsSync(`${pasta}/app-estado.txt`) ? readFileSync(`${pasta}/app-estado.txt`, 'latin1').trim() : '';

console.log(`rodada: ${pasta}`);
if (r.erro) console.log(`ERRO no roteiro: ${r.erro}`);
const copias = readdirSync(pasta).filter((a) => /^m34-state-\d+\.json$/.test(a)).sort((a, b) => Number(a.match(/\d+/)) - Number(b.match(/\d+/)));
for (const a of copias) {
  const c = JSON.parse(readFileSync(`${pasta}/${a}`, 'utf8')).stopwatch;
  console.log(`  ${a}: ${c ? `${c.status} acumulado ${c.accumulatedMs} ms${c.startedAt ? `, desde ${c.startedAt}` : ''}, ${c.laps.length} volta(s)` : '(sem cronômetro)'}`);
}
const m = r.medidas ?? {};
if (m.amostra) console.log(`  amostra de 1 s: ${m.amostra.quadros} quadros, ${m.amostra.valores} valores diferentes`);
if (m.minimizar) console.log(`  minimizada: ${m.minimizar.a.texto} → ${m.minimizar.b.texto}, diferença ${m.minimizar.diferencaMs} ms`);
if (m.esconder) console.log(`  escondida: → ${m.esconder.c.texto}, diferença ${m.esconder.diferencaMs} ms`);
if (m.total) console.log(`  em ${m.total.segundos} s, diferença acumulada ${m.total.diferencaMs} ms`);

const checagens = Object.fromEntries(Object.entries(r.checagens ?? {}).map(([k, v]) => [k, v.ok]));
checagens['nenhuma falha de gravação do state.json no log'] = !/state\.json não gravado/.test(log);
checagens['o app não entrou em pânico'] = !/panicked at/.test(log);
checagens['o app sai sozinho depois de fechar a janela'] = /^saiu 0$/.test(appEstado);
console.log(`app: ${appEstado || '?'}`);
let falhou = false;
for (const [nome, ok] of Object.entries(checagens)) {
  console.log(`${ok ? 'ok   ' : 'FALHA'} ${nome}`);
  if (!ok) falhou = true;
}
process.exit(falhou || r.erro || !Object.keys(r.checagens ?? {}).length ? 1 : 0);
