#!/usr/bin/env node
// Resume uma rodada do roteiro instancia (M37): as checagens do roteiro (a
// segunda instância, Ctrl+W, Ctrl+Q, o state.json na saída, o parcial nas
// estatísticas, o window-state e, no build com os arquivos embutidos, o menu
// do WebView e a recarga bloqueados) e, pelos logs das partidas, nenhum pânico.
// Sai com código 1 se algo falhar ou se a parte do build ficou de fora.
//
//   node scripts/gnome-aninhado/resumo-instancia.mjs <pasta da rodada>
import { existsSync, readFileSync, readdirSync } from 'node:fs';

const pasta = process.argv[2];
const r = JSON.parse((existsSync(`${pasta}/resultado.json`) ? readFileSync(`${pasta}/resultado.json`, 'utf8') : '') || '{}');
const logs = readdirSync(pasta).filter((a) => /^app-.+\.log$/.test(a)).map((a) => readFileSync(`${pasta}/${a}`, 'utf8')).join('\n');

console.log(`rodada: ${pasta}`);
if (r.erro) console.log(`ERRO no roteiro: ${r.erro}`);
for (const [k, v] of Object.entries(r.medidas ?? {})) console.log(`  ${k}: ${JSON.stringify(v)}`);

const checagens = Object.fromEntries(Object.entries(r.checagens ?? {}).map(([k, v]) => [k, v.ok]));
checagens['o app não entrou em pânico'] = !/panicked at/.test(logs);
checagens['a parte do build (TT_BIN_BUILD) rodou'] = Boolean(r.medidas?.build);
let falhou = false;
for (const [nome, ok] of Object.entries(checagens)) {
  console.log(`${ok ? 'ok   ' : 'FALHA'} ${nome}`);
  if (!ok) falhou = true;
}
process.exit(falhou || r.erro || !Object.keys(r.checagens ?? {}).length ? 1 : 0);
