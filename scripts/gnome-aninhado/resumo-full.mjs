#!/usr/bin/env node
// Resume uma rodada do roteiro full (M51): as checagens do roteiro, os tempos
// de cada ida e volta, os quadros conferidos e a memória antes e depois. Sai
// com código 1 se algo falhar.
//
//   node scripts/gnome-aninhado/resumo-full.mjs <pasta da rodada>
import { existsSync, readFileSync } from 'node:fs';

const pasta = process.argv[2];
const ler = (nome) => (existsSync(`${pasta}/${nome}`) ? readFileSync(`${pasta}/${nome}`, 'utf8') : '');
const r = JSON.parse(ler('resultado.json') || '{}');

console.log(`rodada: ${pasta}`);
if (r.erro) console.log(`ERRO no roteiro: ${r.erro}`);
const m = r.medidas ?? {};
const ciclos = m.ciclos ?? [];
const idas = ciclos.filter((c) => c.sentido === 'ida');
const voltas = ciclos.filter((c) => c.sentido === 'volta');
const faixa = (xs) => (xs.length ? `${Math.min(...xs)}–${Math.max(...xs)}` : '-');
if (idas.length) {
  console.log(`  idas: ${idas.length}, ${faixa(idas.map((c) => c.ms))} ms até só o tomate; ${idas.reduce((s, c) => s + (c.tomate?.quadros ?? 0), 0)} quadros do tomate, maior alfa nos cantos ${Math.max(...idas.map((c) => c.tomate?.cantosMax ?? 255))}`);
  console.log(`  voltas: ${voltas.length}, ${faixa(voltas.map((c) => c.ms))} ms até só a main; ${voltas.reduce((s, c) => s + (c.main?.quadros ?? 0), 0)} quadros da main, branco ${Math.max(...voltas.map((c) => c.main?.brancoMax ?? 1)).toFixed(3)}, preto ${Math.max(...voltas.map((c) => c.main?.pretoMax ?? 1)).toFixed(3)}`);
}
if (m.memoria) console.log(`  memória: ${m.memoria.antes} KB antes, ${m.memoria.depois} KB depois (${m.memoria.crescimento}%)`);
if (m.memoriaAntes) console.log(`    antes: ${m.memoriaAntes.processos.join(', ')}\n    depois: ${m.memoriaDepois?.processos.join(', ')}`);
if (idas.length) {
  const vazios = idas.map((c) => c.tomate?.vazioMs).filter(Number.isFinite);
  const diferencas = idas.filter((c) => Number.isFinite(c.tomate?.pintouEm) && Number.isFinite(c.tomate?.mainSumiuEm)).map((c) => c.tomate.pintouEm - c.tomate.mainSumiuEm);
  const pinturas = idas.map((c) => c.tomate?.pinturas).filter(Number.isFinite);
  console.log(`  vazio (tela sem nenhuma das duas): ${faixa(vazios)} ms em ${vazios.length} de ${idas.length} idas; o tomate pintado menos a main sumida: ${faixa(diferencas)} ms, ${faixa(pinturas)} pinturas do palco`);
}
if (m.pronto) {
  const p = m.pronto;
  console.log(`  tt://tomato-ready nas idas: ${p.aTempo} mostradas a tempo, ${p.peloLimite} pelo limite de 2 s, ${p.pintadas} com o aviso de pintado, ${p.semRegistro} sem registro (linhas do limite no log da partida 1: ${p.linhasDoLimite}); janela criada em ${p.janelaMs?.join('–')} ms, mostrada em ${p.mostradaMs?.join('–')} ms, pintada em ${p.pintadaMs?.join('–')} ms`);
  console.log(`  chave: ${p.exemplo}`);
}
if (m.partida2) console.log(`  partida 2: ${m.partida2.quadros} quadros do tomate, pintado ${m.partida2.pintado}, limite de 2 s ${m.partida2.limite ? 'atingido' : 'não atingido'}`);

let falhou = Boolean(r.erro) || !Object.keys(r.checagens ?? {}).length;
for (const [nome, { ok, detalhe }] of Object.entries(r.checagens ?? {})) {
  console.log(`${ok ? 'ok   ' : 'FALHA'} ${nome}`);
  if (!ok) {
    falhou = true;
    console.log(`        ${JSON.stringify(detalhe).slice(0, 600)}`);
  }
}
process.exit(falhou ? 1 : 0);
