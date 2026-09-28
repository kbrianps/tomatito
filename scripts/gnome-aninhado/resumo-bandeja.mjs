#!/usr/bin/env node
// Resume uma rodada do roteiro bandeja (M36): as checagens do roteiro (o menu
// e o rótulo da bandeja pelo D-Bus, fechar escondendo, o fim com a janela
// escondida, "Mostrar Tomatito", "Sair" e o closeToTray desligado) e, pelos
// logs das duas partidas, nenhum pânico e nenhuma falha da bandeja. Sai com
// código 1 se algo falhar.
//
//   node scripts/gnome-aninhado/resumo-bandeja.mjs <pasta da rodada>
import { existsSync, readFileSync, readdirSync } from 'node:fs';

const pasta = process.argv[2];
const r = JSON.parse((existsSync(`${pasta}/resultado.json`) ? readFileSync(`${pasta}/resultado.json`, 'utf8') : '') || '{}');
const logs = readdirSync(pasta).filter((a) => /^app-\d+\.log$/.test(a)).map((a) => readFileSync(`${pasta}/${a}`, 'utf8')).join('\n');

console.log(`rodada: ${pasta}`);
if (r.erro) console.log(`ERRO no roteiro: ${r.erro}`);
const m = r.medidas ?? {};
if (m.item) console.log(`  item da bandeja: ${m.item}`);
if (m.rotulos?.length) console.log(`  rótulos vistos: ${m.rotulos.join(' | ')}`);
if (!m.pipewire) console.log('  (sem TT_PIPEWIRE: o som não foi conferido)');

const checagens = Object.fromEntries(Object.entries(r.checagens ?? {}).map(([k, v]) => [k, v.ok]));
checagens['o app não entrou em pânico'] = !/panicked at/.test(logs);
checagens['nenhuma falha da bandeja no log'] = !/\[tomatito\] bandeja/.test(logs);
checagens['nenhuma falha de som no log'] = !/\[tomatito\] som:/.test(logs);
let falhou = false;
for (const [nome, ok] of Object.entries(checagens)) {
  console.log(`${ok ? 'ok   ' : 'FALHA'} ${nome}`);
  if (!ok) falhou = true;
}
process.exit(falhou || r.erro || !Object.keys(r.checagens ?? {}).length ? 1 : 0);
