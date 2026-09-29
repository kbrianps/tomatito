#!/usr/bin/env node
// Resumo do roteiro `instalado` (M21b): as checagens do roteiro, o app_id que
// o app pediu ao compositor (WAYLAND_DEBUG=client no app.log) e se o app saiu
// com código 0 depois do Ctrl+Q (M45; antes do M36, ao fechar a janela). Sai com código 1 se algo falhar.
import { existsSync, readFileSync } from 'node:fs';

const pasta = process.argv[2];
const ler = (nome, cod = 'utf8') => (existsSync(`${pasta}/${nome}`) ? readFileSync(`${pasta}/${nome}`, cod) : '');
const r = JSON.parse(ler('resultado.json') || '{}');
const log = ler('app.log', 'latin1');
const appEstado = ler('app-estado.txt').trim();
const appIds = [...new Set([...log.matchAll(/xdg_toplevel#\d+\.set_app_id\("([^"]*)"\)/g)].map((m) => m[1]))];

const checagens = Object.fromEntries(Object.entries(r.checagens ?? {}).map(([k, v]) => [k, v.ok]));
checagens['app_id "tomatito" (casa com o StartupWMClass do .desktop)'] = appIds.length === 1 && appIds[0] === 'tomatito';
checagens["o app sai com código 0 depois do Ctrl+Q"] = /^saiu 0$/.test(appEstado);

console.log(`rodada: ${pasta}`);
if (r.erro) console.log(`ERRO no roteiro: ${r.erro}`);
for (const [nome, v] of Object.entries(r.checagens ?? {})) console.log(`  ${nome}: ${JSON.stringify(v.detalhe)}`);
console.log(`app_id: ${JSON.stringify(appIds)}; app no shell: ${JSON.stringify(r.app ?? null)}; app: ${appEstado || '?'}`);
let falhou = false;
for (const [nome, ok] of Object.entries(checagens)) {
  console.log(`${ok ? 'ok   ' : 'FALHA'} ${nome}`);
  if (!ok) falhou = true;
}
process.exit(falhou || r.erro || !Object.keys(r.checagens ?? {}).length ? 1 : 0);
