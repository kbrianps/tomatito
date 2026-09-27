#!/usr/bin/env node
// Resume uma rodada do roteiro sons (M20): as checagens do roteiro, os fluxos
// de áudio vistos no PipeWire e, pelo app.log, os erros de som. Com
// TT_PIPEWIRE, nenhum som pode falhar; com TT_SEM_AUDIO=1, os cinco pedidos
// (os dois cliques, os dois do sound_test e o fim da sessão) falham só no
// log. Nos dois casos, o app sai sozinho depois de a janela fechar. Sai com
// código 1 se alguma conferência falhar.
//
//   node scripts/gnome-aninhado/resumo-sons.mjs <pasta da rodada>
import { existsSync, readFileSync } from 'node:fs';

const pasta = process.argv[2];
const ler = (nome, cod = 'utf8') => (existsSync(`${pasta}/${nome}`) ? readFileSync(`${pasta}/${nome}`, cod) : '');
const r = JSON.parse(ler('resultado.json') || '{}');
const appEstado = ler('app-estado.txt').trim();
// Em UTF-8: as linhas do Tomatito têm acentos; os bytes soltos do
// WAYLAND_DEBUG, se houver, viram U+FFFD e não atrapalham.
const log = ler('app.log');

console.log(`rodada: ${pasta}`);
if (r.erro) console.log(`ERRO no roteiro: ${r.erro}`);
console.log(`PipeWire: ${r.medidas?.pipewire ?? '(sem)'}; sem áudio: ${r.medidas?.semAudio ? 'sim' : 'não'}; saída padrão: ${r.medidas?.saidaPadrao ?? '-'}`);
for (const k of ['catalogo', 'ambos', 'fimDaSessao']) console.log(`  ${k}: ${JSON.stringify(r.medidas?.[k])}`);
const falhasDeSom = log.split('\n').filter((l) => l.includes('[tomatito] som:'));
for (const l of falhasDeSom) console.log(`  log: ${l}`);

const checagens = Object.fromEntries(Object.entries(r.checagens ?? {}).map(([k, v]) => [k, v.ok]));
if (r.medidas?.pipewire) {
  checagens['nenhuma falha de som no log'] = falhasDeSom.length === 0;
} else if (r.medidas?.semAudio) {
  checagens['sem saída de áudio: cinco falhas de som, só no log'] = falhasDeSom.filter((l) => l.includes('não tocou')).length === 5;
}
checagens['o volume veio do TOMATITO_VOLUME'] = /\[tomatito\] volume do som: 1%/.test(log);
checagens['o app não entrou em pânico'] = !/panicked at/.test(log);
checagens['o app sai sozinho depois de fechar a janela'] = /^saiu 0$/.test(appEstado);
console.log(`app: ${appEstado || '?'}`);
let falhou = false;
for (const [nome, ok] of Object.entries(checagens)) {
  console.log(`${ok ? 'ok   ' : 'FALHA'} ${nome}`);
  if (!ok) falhou = true;
}
process.exit(falhou || r.erro || !Object.keys(r.checagens ?? {}).length ? 1 : 0);
