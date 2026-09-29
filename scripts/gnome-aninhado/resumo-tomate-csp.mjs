#!/usr/bin/env node
// Resume uma rodada do roteiro tomate-csp (M50): o console da janela tomato
// no build com a CSP, lido pelo inspetor remoto (console-tomate.mjs). Sai com
// código 1 se algo falhar.
//
//   node scripts/gnome-aninhado/resumo-tomate-csp.mjs <pasta da rodada>
import { existsSync, readFileSync } from 'node:fs';

const pasta = process.argv[2];
const ler = (nome, cod = 'utf8') => (existsSync(`${pasta}/${nome}`) ? readFileSync(`${pasta}/${nome}`, cod) : '');
const r = JSON.parse(ler('resultado.json') || '{}');
console.log(`rodada: ${pasta}`);
console.log(`binário: ${r.binario ?? '?'}`);
if (r.erro) console.log(`ERRO no roteiro: ${r.erro}`);
const c = r.console ?? {};
console.log(`  url: ${c.estado?.url ?? '?'}; csp: ${c.estado?.csp ?? '?'}`);
console.log(`  mensagens: partida ${c.mensagens?.length ?? '?'}, exercício ${c.mensagensDoExercicio?.length ?? '?'}, controle ${c.mensagensDoControle?.length ?? '?'}`);
for (const m of c.mensagensDoControle ?? []) console.log(`  controle: ${m.texto}`);
const checagens = Object.fromEntries(Object.entries(r.checagens ?? {}).map(([k, v]) => [k, v.ok]));
checagens['o app não entrou em pânico'] = !/panicked at/.test(ler('app.log', 'latin1'));
let falhou = false;
for (const [nome, ok] of Object.entries(checagens)) {
  console.log(`${ok ? 'ok   ' : 'FALHA'} ${nome}`);
  if (!ok) falhou = true;
}
process.exit(falhou || r.erro || !Object.keys(r.checagens ?? {}).length ? 1 : 0);
