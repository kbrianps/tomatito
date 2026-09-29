#!/usr/bin/env node
// Resume uma rodada do roteiro validacao (M52): as checagens do roteiro, o
// tempo da reversão pelo prazo, a chave gravada no Manter e as cores do
// tomate opaco. Sai com código 1 se algo falhar.
//
//   node scripts/gnome-aninhado/resumo-validacao.mjs <pasta da rodada>
import { existsSync, readFileSync } from 'node:fs';

const pasta = process.argv[2];
const ler = (nome) => (existsSync(`${pasta}/${nome}`) ? readFileSync(`${pasta}/${nome}`, 'utf8') : '');
const r = JSON.parse(ler('resultado.json') || '{}');

console.log(`rodada: ${pasta}`);
if (r.erro) console.log(`ERRO no roteiro: ${r.erro}`);
const m = r.medidas ?? {};
if (m.prazo) console.log(`  sem resposta: o tomate fechou ${m.prazo.reverteuEmMs} ms depois de a pergunta aparecer (aos 3 s: "${m.prazo.contagemAos3s}")`);
if (m.chave) console.log(`  chave gravada no Manter: ${m.chave}`);
if (m.opacoPelaVariavel?.tomate) {
  const t = m.opacoPelaVariavel.tomate;
  console.log(`  opaco pela variável: cantos alfa ${t.cantos.alfaMin}–${t.cantos.alfaMax}, cor ${t.cantos.cor.join(',')}; fundo da página ${m.opacoPelaVariavel.pagina?.fundo}`);
}

let falhou = Boolean(r.erro) || !Object.keys(r.checagens ?? {}).length;
for (const [nome, { ok, detalhe }] of Object.entries(r.checagens ?? {})) {
  console.log(`${ok ? 'ok   ' : 'FALHA'} ${nome}`);
  if (!ok) {
    falhou = true;
    console.log(`        ${JSON.stringify(detalhe).slice(0, 900)}`);
  }
}
process.exit(falhou ? 1 : 0);
