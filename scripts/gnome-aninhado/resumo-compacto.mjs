#!/usr/bin/env node
// Resume uma rodada do roteiro compacto (v0.4): as checagens do roteiro
// (resultado.json) e os logs de cada partida. Sai com código 1 se alguma
// conferência falhar.
//
//   node scripts/gnome-aninhado/resumo-compacto.mjs <pasta da rodada>
import { existsSync, readFileSync } from 'node:fs';

const pasta = process.argv[2];
const ler = (nome) => (existsSync(`${pasta}/${nome}`) ? readFileSync(`${pasta}/${nome}`, 'utf8') : '');
const r = JSON.parse(ler('resultado.json') || '{}');

console.log(`rodada: ${pasta}`);
if (r.erro) console.log(`ERRO no roteiro: ${r.erro}`);
for (const [nome, v] of Object.entries(r.checagens ?? {})) console.log(`  ${nome}: ${JSON.stringify(v.detalhe)}`);

const checagens = Object.fromEntries(Object.entries(r.checagens ?? {}).map(([k, v]) => [k, v.ok]));
const logs = ler('app.log');
checagens['sem erro de protocolo do Wayland'] = !/wl_display[^\n]*\.error\(/.test(logs);
checagens['sem pânico do Rust'] = !/panicked at/.test(logs);
// v0.4: com a sessão iniciada no passo 2, o app avisa a dock do progresso.
const dock = ler('dock.log');
checagens['o progresso no ícone vai à dock (Unity LauncherEntry, Tomatito.desktop)'] =
  /member=Update/.test(dock) && /application:\/\/Tomatito\.desktop/.test(dock) && /progress-visible[\s\S]{0,80}boolean true/.test(dock);
let falhou = false;
for (const [nome, ok] of Object.entries(checagens)) {
  console.log(`${ok ? 'ok   ' : 'FALHA'} ${nome}`);
  if (!ok) falhou = true;
}
process.exit(falhou || r.erro || Object.keys(r.checagens ?? {}).length < 9 ? 1 : 0);
