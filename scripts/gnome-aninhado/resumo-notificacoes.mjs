#!/usr/bin/env node
// Resume uma rodada do roteiro notificacoes (M21): as checagens do roteiro,
// as notificações e os balões vistos no shell e, pelo app.log, as linhas
// "[tomatito] notificação:" (uma por aviso, cinco na rodada) e nenhuma
// falha de entrega nem de som. Sai com código 1 se algo falhar.
//
//   node scripts/gnome-aninhado/resumo-notificacoes.mjs <pasta da rodada>
import { existsSync, readFileSync } from 'node:fs';

const pasta = process.argv[2];
const ler = (nome) => (existsSync(`${pasta}/${nome}`) ? readFileSync(`${pasta}/${nome}`, 'utf8') : '');
const r = JSON.parse(ler('resultado.json') || '{}');
const appEstado = ler('app-estado.txt').trim();
const log = ler('app.log');

console.log(`rodada: ${pasta}`);
if (r.erro) console.log(`ERRO no roteiro: ${r.erro}`);
for (const k of ['sessao60', 'naoPerturbe', 'atrasado']) {
  const m = r.medidas?.[k];
  if (!m) continue;
  console.log(`${k}:`);
  for (const n of m.notificacoes) console.log(`  ${n.t} ms  notificação  ${n.titulo} | ${n.corpo}  (fonte ${n.fonte}; minimizada ${n.minimizada})`);
  for (const b of m.baloes ?? []) console.log(`  ${b.t} ms  balão        ${b.titulo}`);
  for (const s of m.sons) console.log(`  ${s.t} ms  som          fluxo ${s.id}`);
}
const linhas = log.split('\n').filter((l) => l.includes('[tomatito] notificação'));
for (const l of linhas) console.log(`  log: ${l}`);

const checagens = Object.fromEntries(Object.entries(r.checagens ?? {}).map(([k, v]) => [k, v.ok]));
checagens['cinco notificações no log do app, nenhuma falha de entrega'] =
  linhas.filter((l) => l.includes('[tomatito] notificação: ')).length === 5 && !linhas.some((l) => l.includes('não saiu'));
checagens['nenhuma falha de som no log'] = !/\[tomatito\] som:.*não tocou/.test(log);
checagens['o app não entrou em pânico'] = !/panicked at/.test(log);
checagens['o app sai sozinho depois de fechar a janela'] = /^saiu 0$/.test(appEstado);
console.log(`app: ${appEstado || '?'}`);
let falhou = false;
for (const [nome, ok] of Object.entries(checagens)) {
  console.log(`${ok ? 'ok   ' : 'FALHA'} ${nome}`);
  if (!ok) falhou = true;
}
process.exit(falhou || r.erro || !Object.keys(r.checagens ?? {}).length ? 1 : 0);
