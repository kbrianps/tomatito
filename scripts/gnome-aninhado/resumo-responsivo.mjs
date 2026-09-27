#!/usr/bin/env node
// Resume uma rodada do roteiro responsivo (M10): as checagens do roteiro
// (resultado.json), a tabela das paradas ao estreitar a janela e se o app saiu
// sozinho depois de a janela fechar. Sai com código 1 se alguma conferência
// falhar.
//
//   node scripts/gnome-aninhado/resumo-responsivo.mjs <pasta da rodada>
import { existsSync, readFileSync } from 'node:fs';

const pasta = process.argv[2];
const ler = (nome) => (existsSync(`${pasta}/${nome}`) ? readFileSync(`${pasta}/${nome}`, 'utf8') : '');
const r = JSON.parse(ler('resultado.json') || '{}');
const appEstado = ler('app-estado.txt').trim();
const log = ler('app.log');

console.log(`rodada: ${pasta}`);
if (r.erro) console.log(`ERRO no roteiro: ${r.erro}`);
if (r.estreitar?.length) {
  console.log('estreitando pela borda direita (alvo → janela, px CSS, painel, área útil, colunas, rolagem horizontal):');
  for (const x of r.estreitar) {
    const rol = Object.values(x.rolagem).some(Boolean) ? JSON.stringify(x.rolagem) : '0';
    console.log(`  ${String(x.alvo).padStart(4)} → ${String(x.janela).padStart(4)}  ${x.css.join('x').padEnd(9)} ${String(x.painel).padStart(3)}  ${String(x.util).padStart(3)}  ${x.colunas}  ${rol}${x.problemas.length ? `  ${x.problemas.join('; ')}` : ''}`);
  }
}
for (const [nome, v] of Object.entries(r.checagens ?? {})) console.log(`  ${nome}: ${JSON.stringify(v.detalhe)}`);

const checagens = Object.fromEntries(Object.entries(r.checagens ?? {}).map(([k, v]) => [k, v.ok]));
checagens['o app sai sozinho depois de fechar a janela'] = /^saiu 0$/.test(appEstado);
checagens['sem erro de protocolo do Wayland'] = !/wl_display[^\n]*\.error\(/.test(log);
console.log(`app: ${appEstado || '?'}`);
let falhou = false;
for (const [nome, ok] of Object.entries(checagens)) {
  console.log(`${ok ? 'ok   ' : 'FALHA'} ${nome}`);
  if (!ok) falhou = true;
}
process.exit(falhou || r.erro || !Object.keys(r.checagens ?? {}).length ? 1 : 0);
