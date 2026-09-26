#!/usr/bin/env node
// Resume uma rodada do teste aninhado: o resultado.json do auto.js mais o que
// o app pediu ao compositor (WAYLAND_DEBUG=client no app.log), inclusive a
// região de entrada da tomato (spike B, M05). Sai com código 1 se alguma
// conferência falhar.
//
//   node scripts/aninhado/resumo.mjs <pasta da rodada>
import { existsSync, readFileSync } from 'node:fs';
import { descrever, regiaoDaTomato, toplevels } from './regiao.mjs';

const pasta = process.argv[2];
const r = JSON.parse(readFileSync(`${pasta}/resultado.json`, 'utf8'));
const log = existsSync(`${pasta}/app.log`) ? readFileSync(`${pasta}/app.log`, 'latin1') : '';

const wayland = {};
const tomato = toplevels(log)[1];
if (tomato) {
  const { xdgSurface: xs, wlSurface: ws, xdgToplevel: xt } = tomato;
  const todos = (re) => [...new Set([...log.matchAll(re)].map((m) => m[1]))];
  wayland.min_size = todos(new RegExp(`xdg_toplevel#${xt}\\.set_min_size\\(([^)]*)\\)`, 'g'));
  wayland.geometria = todos(new RegExp(`xdg_surface#${xs}\\.set_window_geometry\\(([^)]*)\\)`, 'g'));
  wayland.opaque_region = todos(new RegExp(`wl_surface#${ws}\\.set_opaque_region\\(([^)]*)\\)`, 'g'));
  // Buffers do tamanho do tomate: formato 0 no wl_shm e 875713089 ('AR24') no dmabuf são ARGB8888.
  wayland.buffers = [
    ...todos(/create_buffer\(new id wl_buffer#\d+, \d+, (280, 280, \d+, \d+)\)/g).map((f) => `shm ${f}`),
    ...todos(/create_immed\(new id wl_buffer#\d+, (280, 280, \d+, \d+)\)/g).map((f) => `dmabuf ${f}`),
  ];
}
wayland.erros = (log.match(/wl_display[^\n]*\.error\([^\n]*/g) ?? []).slice(0, 3);

const regiao = regiaoDaTomato(log);

const checagens = {
  'página desenhou (sonda)': Boolean(r.pagina),
  'tomato com 280x280': Boolean(r.tamanho_ok),
  'sem erro de protocolo': wayland.erros.length === 0,
};
if (!process.env.TT_SO_TAMANHO) {
  checagens['4 cantos iguais ao fundo'] = Boolean(r.transparencia?.ok);
  for (const [nome, a] of Object.entries(r.arraste ?? {})) checagens[`arraste pelo ${nome} (${a.alvo})`] = a.moveu;
  checagens['5 botões no console'] = Boolean(r.botoes?.todos);
  checagens['clicar nos botões não move a janela'] = Boolean(r.botoes?.janela_parada);
  for (const [nome, a] of Object.entries(r.atravessa ?? {})) checagens[`clique em ${nome} (${a.px}) vai para a ${a.esperado}`] = a.ok;
}
checagens['região enviada (set_input_region na tomato)'] = regiao.envios.length > 0;
checagens['região enviada depois do show (get_toplevel)'] = regiao.depois_do_show;
checagens['região já no commit do primeiro quadro'] = regiao.no_primeiro_quadro;
checagens['toda região enviada é a calculada no Rust'] = regiao.todas_iguais_a_calculada;

console.log(`rodada: ${pasta}`);
if (r.erro) console.log(`ERRO no roteiro: ${r.erro}`);
console.log(`tomato: ${JSON.stringify(r.tomato)}`);
if (r.pagina) console.log(`página: ${r.pagina.inner?.join('x')} dpr ${r.pagina.dpr}, fundo ${r.pagina.bgHtml} / ${r.pagina.bgBody}`);
if (r.transparencia) console.log(`transparência: ${r.transparencia.iguais_ao_fundo_pct}% da caixa igual ao fundo; cantos ${JSON.stringify(r.transparencia.cantos)}`);
for (const [nome, a] of Object.entries(r.atravessa ?? {})) console.log(`clique em ${nome}: ${JSON.stringify(a)}`);
console.log(descrever(regiao));
console.log(`wayland: ${JSON.stringify(wayland)}`);
let falhou = false;
for (const [nome, ok] of Object.entries(checagens)) {
  console.log(`${ok ? 'ok  ' : 'FALHA'} ${nome}`);
  if (!ok) falhou = true;
}
process.exit(falhou || r.erro ? 1 : 0);
