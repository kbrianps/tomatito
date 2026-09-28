#!/usr/bin/env node
// Resume uma rodada do roteiro temporizador (M32): as checagens do roteiro e,
// pelo app.log, as duas linhas "[tomatito] notificação: Temporizador
// encerrado", sem falha de entrega nem de som e sem pânico. Sai com código 1
// se algo falhar.
//
//   node scripts/gnome-aninhado/resumo-temporizador.mjs <pasta da rodada>
import { existsSync, readFileSync } from 'node:fs';

const pasta = process.argv[2];
const ler = (nome) => (existsSync(`${pasta}/${nome}`) ? readFileSync(`${pasta}/${nome}`, 'latin1') : '');
const r = JSON.parse((existsSync(`${pasta}/resultado.json`) ? readFileSync(`${pasta}/resultado.json`, 'utf8') : '') || '{}');
// O WAYLAND_DEBUG pode ter bytes soltos, mas as linhas do app são UTF-8.
const log = existsSync(`${pasta}/app.log`) ? readFileSync(`${pasta}/app.log`, 'utf8') : '';
const appEstado = ler('app-estado.txt').trim();

console.log(`rodada: ${pasta}`);
if (r.erro) console.log(`ERRO no roteiro: ${r.erro}`);
for (const n of r.medidas?.notificacoes ?? []) console.log(`  ${n.t} ms  notificação  ${n.titulo} | ${n.corpo} (balão ${n.balao})`);
for (const s of r.medidas?.sons ?? []) console.log(`  ${s.t} ms  som          fluxo ${s.id}`);
const linhas = log.split('\n').filter((l) => l.includes('[tomatito] notificação'));
for (const l of linhas) console.log(`  log: ${l}`);

const checagens = Object.fromEntries(Object.entries(r.checagens ?? {}).map(([k, v]) => [k, v.ok]));
checagens['duas notificações de temporizador no log, nenhuma falha de entrega'] =
  linhas.filter((l) => l.includes('notificação: Temporizador encerrado')).length === 2 && !linhas.some((l) => l.includes('não saiu'));
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
