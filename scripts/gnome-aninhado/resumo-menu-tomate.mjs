#!/usr/bin/env node
// Resume uma rodada do roteiro menu-tomate (M56): as checagens do roteiro e,
// pelo app.log (WAYLAND_DEBUG=client e as linhas "[tomatito] região do
// tomate" do build de debug), o menu como xdg_popup, a minimização pelo
// protocolo e a região mandada de novo a cada troca de tamanho, entregue ao
// compositor. Sai com código 1 se algo falhar.
//
//   node scripts/gnome-aninhado/resumo-menu-tomate.mjs <pasta da rodada>
import { existsSync, readFileSync } from 'node:fs';
import { lerLog } from './resumo-regiao.mjs';

const pasta = process.argv[2];
const ler = (nome) => (existsSync(`${pasta}/${nome}`) ? readFileSync(`${pasta}/${nome}`, 'utf8') : '');
const r = JSON.parse(ler('resultado.json') || '{}');
const log = ler('app.log');
const { calculadas, envios } = lerLog(log);
// Cada região da página, entregue ao compositor com a mesma área depois dela.
const entregas = calculadas.map((c) => ({ lado: c.lado, n: c.n, entregue: envios.some((e) => e.linha > c.linha && e.area === c.area) }));
const popups = (log.match(/get_popup\(new id xdg_popup#\d+/g) ?? []).length;
const minimizar = (log.match(/xdg_toplevel#\d+\.set_minimized\(\)/g) ?? []).length;

console.log(`rodada: ${pasta}`);
if (r.erro) console.log(`ERRO no roteiro: ${r.erro}`);
for (const [nome, v] of Object.entries(r.checagens ?? {})) console.log(`  ${nome}: ${JSON.stringify(v.detalhe)}`);
console.log(`  regiões da página: ${entregas.map((e) => `${e.lado} (${e.n}${e.entregue ? '' : ', NÃO entregue'})`).join(' → ')}`);
console.log(`  xdg_popup: ${popups}; set_minimized: ${minimizar}`);

const checagens = Object.fromEntries(Object.entries(r.checagens ?? {}).map(([k, v]) => [k, v.ok]));
const lados = entregas.map((e) => e.lado).join(' → ');
checagens['a região vai de novo a cada troca pelo menu, e a do tomate recriado (280 → 320 → 240 → 240)'] = lados === '280 → 320 → 240 → 240';
checagens['toda região da página chegou ao compositor (set_input_region com a mesma área)'] = entregas.length > 0 && entregas.every((e) => e.entregue);
checagens['o menu é um xdg_popup do GTK (um por abertura, 5 aberturas)'] = popups >= 5;
checagens['Minimizar pelo protocolo (xdg_toplevel.set_minimized)'] = minimizar >= 1;
checagens['sem erro de protocolo'] = !/wl_display[^\n]*\.error\(/.test(log);
checagens['o app não entrou em pânico'] = !/panicked at/.test(log);
let falhou = false;
for (const [nome, ok] of Object.entries(checagens)) {
  console.log(`${ok ? 'ok   ' : 'FALHA'} ${nome}`);
  if (!ok) falhou = true;
}
process.exit(falhou || r.erro || !Object.keys(r.checagens ?? {}).length ? 1 : 0);
