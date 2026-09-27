#!/usr/bin/env node
// Resume uma rodada do teste aninhado: as checagens do roteiro
// (resultado.json), se o app saiu sozinho (app-estado.txt, do dentro.sh) e o
// que o app pediu ao compositor (WAYLAND_DEBUG=client no app.log). Sai com
// código 1 se alguma conferência falhar.
//
//   node scripts/gnome-aninhado/resumo.mjs <pasta da rodada>
import { existsSync, readFileSync } from 'node:fs';

const pasta = process.argv[2];
const ler = (nome, cod = 'utf8') => (existsSync(`${pasta}/${nome}`) ? readFileSync(`${pasta}/${nome}`, cod) : '');
const r = JSON.parse(ler('resultado.json') || '{}');
const log = ler('app.log', 'latin1'); // o WAYLAND_DEBUG pode ter bytes soltos
const appEstado = ler('app-estado.txt').trim();

// Pedidos do app ao compositor, na ordem em que aparecem.
const conta = (re) => (log.match(re) ?? []).length;
const wayland = {
  toplevels: conta(/get_toplevel\(new id xdg_toplevel#\d+\)/g),
  titulo: [...new Set([...log.matchAll(/xdg_toplevel#\d+\.set_title\("([^"]*)"\)/g)].map((m) => m[1]))],
  app_id: [...new Set([...log.matchAll(/xdg_toplevel#\d+\.set_app_id\("([^"]*)"\)/g)].map((m) => m[1]))],
  min_size: [...new Set([...log.matchAll(/xdg_toplevel#\d+\.set_min_size\(([^)]*)\)/g)].map((m) => m[1]))],
  move: conta(/xdg_toplevel#\d+\.move\(/g),
  resize: [...log.matchAll(/xdg_toplevel#\d+\.resize\(wl_seat#\d+, \d+, (\d+)\)/g)].map((m) => Number(m[1])),
  set_maximized: conta(/xdg_toplevel#\d+\.set_maximized\(\)/g),
  unset_maximized: conta(/xdg_toplevel#\d+\.unset_maximized\(\)/g),
  set_minimized: conta(/xdg_toplevel#\d+\.set_minimized\(\)/g),
  decoracao_do_servidor: conta(/zxdg_toplevel_decoration_v1#\d+\.set_mode\(2\)/g),
  erros: (log.match(/wl_display[^\n]*\.error\([^\n]*/g) ?? []).slice(0, 3),
};

const checagens = Object.fromEntries(Object.entries(r.checagens ?? {}).map(([k, v]) => [k, v.ok]));
checagens['uma janela só (nenhuma do tauri.conf.json)'] = wayland.toplevels === 1;
checagens['título "Tomatito" e app_id "tomatito"'] = wayland.titulo.includes('Tomatito') && wayland.app_id.includes('tomatito');
checagens['mínimo 480 x 500 enviado ao compositor'] = wayland.min_size.includes('480, 500');
checagens['arraste pelo protocolo (xdg_toplevel.move)'] = wayland.move >= 3;
checagens['redimensionar pelo protocolo (xdg_toplevel.resize nas bordas e no canto)'] = [1, 2, 4, 8, 10].every((e) => wayland.resize.includes(e));
checagens['maximizar e restaurar pelo protocolo'] = wayland.set_maximized >= 2 && wayland.unset_maximized >= 2;
checagens['minimizar pelo protocolo'] = wayland.set_minimized >= 1;
checagens['sem erro de protocolo'] = wayland.erros.length === 0;
checagens['o app sai sozinho depois de Fechar'] = /^saiu 0$/.test(appEstado);

console.log(`rodada: ${pasta}`);
if (r.erro) console.log(`ERRO no roteiro: ${r.erro}`);
console.log(`janela inicial: ${JSON.stringify(r.inicial?.frame)} (buffer ${JSON.stringify(r.inicial?.buffer)}, decorada: ${r.inicial?.decorada})`);
for (const [nome, v] of Object.entries(r.checagens ?? {})) console.log(`  ${nome}: ${JSON.stringify(v.detalhe)}`);
console.log(`wayland: ${JSON.stringify(wayland)}`);
console.log(`app: ${appEstado || '?'}`);
let falhou = false;
for (const [nome, ok] of Object.entries(checagens)) {
  console.log(`${ok ? 'ok   ' : 'FALHA'} ${nome}`);
  if (!ok) falhou = true;
}
process.exit(falhou || r.erro || !Object.keys(r.checagens ?? {}).length ? 1 : 0);
