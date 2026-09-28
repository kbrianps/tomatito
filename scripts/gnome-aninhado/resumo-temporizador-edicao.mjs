#!/usr/bin/env node
// Resume uma rodada do roteiro temporizador-edicao (M33): as checagens do
// roteiro (cada uma com o state.json lido logo depois da operação) e, pelo
// app.log, nenhuma falha de gravação do state.json e nenhum pânico. Sai com
// código 1 se algo falhar.
//
//   node scripts/gnome-aninhado/resumo-temporizador-edicao.mjs <pasta da rodada>
import { existsSync, readFileSync, readdirSync } from 'node:fs';

const pasta = process.argv[2];
const r = JSON.parse((existsSync(`${pasta}/resultado.json`) ? readFileSync(`${pasta}/resultado.json`, 'utf8') : '') || '{}');
const log = existsSync(`${pasta}/app.log`) ? readFileSync(`${pasta}/app.log`, 'utf8') : '';
const appEstado = existsSync(`${pasta}/app-estado.txt`) ? readFileSync(`${pasta}/app-estado.txt`, 'latin1').trim() : '';

console.log(`rodada: ${pasta}`);
if (r.erro) console.log(`ERRO no roteiro: ${r.erro}`);
const copias = readdirSync(pasta).filter((a) => /^m33-state-\d+\.json$/.test(a)).sort((a, b) => Number(a.match(/\d+/)) - Number(b.match(/\d+/)));
for (const a of copias) {
  const e = JSON.parse(readFileSync(`${pasta}/${a}`, 'utf8'));
  console.log(`  ${a}: ${(e.timers ?? []).map((t) => `${t.name || '-'} ${t.durationMs / 1000} s ${t.status}`).join(' | ')}`);
}

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
