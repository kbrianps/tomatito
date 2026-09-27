#!/usr/bin/env node
// Resume uma rodada do roteiro temas-fluent (M11) e confere o que o roteiro
// gravou contra os tokens gerados (a mesma conferência do
// scripts/preview/temas-fluent.mjs): em cada tema, os tokens do Fluent e as
// cores dos componentes na página, e as cores lidas na captura da tela. Com
// TT_ANTES, também as cinco telas do Lite iguais, pixel a pixel, às da rodada
// anterior. Sai com código 1 se alguma conferência falhar.
//
//   node scripts/gnome-aninhado/resumo-temas-fluent.mjs <pasta da rodada>
import { existsSync, readFileSync } from 'node:fs';
import { assinatura, coresEsperadas, conferirTema } from '../preview/temas-fluent.mjs';

const pasta = process.argv[2];
const ler = (nome) => (existsSync(`${pasta}/${nome}`) ? readFileSync(`${pasta}/${nome}`, 'utf8') : '');
const r = JSON.parse(ler('resultado.json') || '{}');
const appEstado = ler('app-estado.txt').trim();
const log = ler('app.log');

const checagens = Object.fromEntries(Object.entries(r.checagens ?? {}).map(([k, v]) => [k, v.ok]));
const hexDe = (cor) => {
  const m = /^rgb\((\d+), (\d+), (\d+)\)$/.exec(cor ?? '');
  return m ? '#' + m.slice(1).map((v) => Number(v).toString(16).padStart(2, '0')).join('').toUpperCase() : cor;
};
const perto = (a, b, tol = 2) =>
  [1, 3, 5].every((i) => Math.abs(parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16)) <= tol);

console.log(`rodada: ${pasta}`);
if (r.erro) console.log(`ERRO no roteiro: ${r.erro}`);

// 1. As cinco telas do Lite contra a rodada anterior.
if (r.antes) {
  console.log(`telas do Lite comparadas com ${r.antes}:`);
  for (const [rota, d] of Object.entries(r.lite ?? {})) console.log(`  ${rota}: ${JSON.stringify(d)}`);
  checagens['Lite: as cinco telas iguais, pixel a pixel, às da rodada anterior'] =
    Object.keys(r.lite ?? {}).length === 5 && Object.values(r.lite).every((d) => d?.pixels === 0);
}

// 2. Os temas no #/dev.
for (const tema of ['lite', 'suave', 'light', 'dark']) {
  const m = r.fluent?.[tema];
  const p = r.pixels?.[tema];
  if (!m || !p) {
    checagens[`${tema}: medido`] = false;
    continue;
  }
  const falhas = m.tema === tema ? conferirTema(m, tema) : [`data-theme ${m.tema}`];
  if (falhas.length) console.log(`  ${tema}:\n    ${falhas.join('\n    ')}`);
  checagens[`${tema}: os ${Object.keys(m.tokens).length} tokens do Fluent são os do bloco gerado (e da ponte), e os componentes pintam as cores do tema`] = !falhas.length;
  const cores = coresEsperadas(tema, m.tt);
  const quer = {
    trilhoLigado: hexDe(cores['fluent-switch marcado'].fundo),
    bolinhaLigado: hexDe(cores['fluent-switch marcado'].indicador),
    bolinhaDesligado: hexDe(cores['fluent-switch desmarcado'].indicador),
    pontoRadio: hexDe(cores['fluent-radio marcado'].indicador),
    cartao: m.tt['tt-bg-card'].toUpperCase(),
  };
  const errados = Object.keys(quer).filter((k) => !p[k] || !perto(p[k], quer[k]));
  console.log(`  ${tema} na tela: ${JSON.stringify(p)}${errados.length ? ` (esperado ${JSON.stringify(quer)})` : ''}`);
  checagens[`${tema} na tela: trilho e bolinha do switch ligado ${quer.trilhoLigado} e ${quer.bolinhaLigado}, bolinha do desligado ${quer.bolinhaDesligado}, ponto do radio ${quer.pontoRadio}, cartão ${quer.cartao}`] =
    !errados.length;
}
const normais = ['lite', 'suave', 'light', 'dark'].filter((t) => r.fluent?.[t]).map((t) => assinatura(r.fluent[t]));
checagens['os quatro temas pintam os componentes de quatro jeitos diferentes'] = normais.length === 4 && new Set(normais).size === 4;
const telas = ['lite', 'suave', 'light', 'dark'].filter((t) => r.pixels?.[t]).map((t) => JSON.stringify(r.pixels[t]));
checagens['e a tela também muda nos quatro'] = telas.length === 4 && new Set(telas).size === 4;

// 3. Prévia aninhada.
if (r.aninhado) {
  const f = r.aninhado.temaDoHtml === 'lite' ? conferirTema(r.aninhado, 'suave', { todosOsComponentes: false }) : [`<html> em ${r.aninhado.temaDoHtml}`];
  if (!r.aninhado.componentes?.length) f.push('sem o switch');
  if (f.length) console.log(`  aninhado:\n    ${f.join('\n    ')}`);
  checagens['<div data-theme="suave"> dentro do <html> do Lite: tokens e switch do Suave'] = !f.length;
} else checagens['prévia aninhada medida'] = false;

for (const [nome, v] of Object.entries(r.checagens ?? {})) if (!v.ok) console.log(`  ${nome}: ${JSON.stringify(v.detalhe)}`);
checagens['o app sai sozinho depois de fechar a janela'] = /^saiu 0$/.test(appEstado);
checagens['sem erro de protocolo do Wayland'] = !/wl_display[^\n]*\.error\(/.test(log);
console.log(`app: ${appEstado || '?'}`);
let falhou = false;
for (const [nome, ok] of Object.entries(checagens)) {
  console.log(`${ok ? 'ok   ' : 'FALHA'} ${nome}`);
  if (!ok) falhou = true;
}
process.exit(falhou || r.erro || !Object.keys(r.checagens ?? {}).length ? 1 : 0);
