#!/usr/bin/env node
// Resume uma rodada do roteiro voltas (M35): as checagens do roteiro (as
// voltas no state.json e na tela, o "Copiar" na área de transferência do
// compositor) e o "Pronto quando": o texto copiado, aberto no LibreOffice
// Calc sem tela (perfil próprio, dentro da pasta da rodada), com o filtro de
// texto em tabulação e o idioma pt-BR, que é o que o Calc usa ao colar texto
// puro. Cada valor tem de cair na sua célula (3 colunas por linha), com o
// mesmo texto da tela, e os tempos reconhecidos como tempo (com os
// centésimos). Sai com código 1 se algo falhar.
//
//   node scripts/gnome-aninhado/resumo-voltas.mjs <pasta da rodada>
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync } from 'node:fs';

const pasta = process.argv[2];
const r = JSON.parse((existsSync(`${pasta}/resultado.json`) ? readFileSync(`${pasta}/resultado.json`, 'utf8') : '') || '{}');
const log = existsSync(`${pasta}/app.log`) ? readFileSync(`${pasta}/app.log`, 'utf8') : '';
const appEstado = existsSync(`${pasta}/app-estado.txt`) ? readFileSync(`${pasta}/app-estado.txt`, 'latin1').trim() : '';

console.log(`rodada: ${pasta}`);
if (r.erro) console.log(`ERRO no roteiro: ${r.erro}`);
const checagens = Object.fromEntries(Object.entries(r.checagens ?? {}).map(([k, v]) => [k, v.ok]));

/** As células de um .fods, linha a linha, com o tipo e o valor (repetições abertas). */
function celulas(fods) {
  const linhas = [];
  for (const [, corpo] of fods.matchAll(/<table:table-row[^>]*>([\s\S]*?)<\/table:table-row>/g)) {
    const linha = [];
    for (const m of corpo.matchAll(/<table:table-cell([^>]*?)(?:\/>|>([\s\S]*?)<\/table:table-cell>)/g)) {
      const attrs = m[1];
      const texto = [...(m[2] ?? '').matchAll(/<text:p>([^<]*)<\/text:p>/g)].map((p) => p[1]).join('');
      const vezes = Number(/table:number-columns-repeated="(\d+)"/.exec(attrs)?.[1] ?? 1);
      const tipo = /office:value-type="(\w+)"/.exec(attrs)?.[1] ?? null;
      if (!tipo && !texto) continue;
      for (let i = 0; i < Math.min(vezes, 50); i++) linha.push({ texto, tipo });
    }
    if (linha.length) linhas.push(linha);
  }
  return linhas;
}

const copiado = existsSync(`${pasta}/voltas-copiadas.txt`) ? readFileSync(`${pasta}/voltas-copiadas.txt`, 'utf8') : '';
if (copiado) {
  console.log('texto copiado:');
  for (const l of copiado.split('\n')) console.log(`  ${JSON.stringify(l)}`);
  // O Calc escolhe o filtro de planilha pela extensão .csv; o filtro diz que o
  // separador é a tabulação (9), UTF-8 (76) e o idioma pt-BR (1046).
  copyFileSync(`${pasta}/voltas-copiadas.txt`, `${pasta}/voltas-copiadas.csv`);
  const lo = spawnSync('soffice', [
    `-env:UserInstallation=file://${pasta}/lo-perfil`, '--headless',
    '--infilter=Text - txt - csv (StarCalc):9,34,76,1,,1046',
    '--convert-to', 'fods', '--outdir', `${pasta}/lo`, `${pasta}/voltas-copiadas.csv`,
  ], { encoding: 'utf8', timeout: 120_000 });
  const fods = existsSync(`${pasta}/lo/voltas-copiadas.fods`) ? readFileSync(`${pasta}/lo/voltas-copiadas.fods`, 'utf8') : '';
  if (!fods) console.log(`LibreOffice: ${lo.status} ${lo.stderr ?? ''} ${lo.error ?? ''}`);
  const planilha = celulas(fods);
  console.log('no LibreOffice Calc:');
  for (const l of planilha) console.log(`  ${l.map((c) => `${c.texto} [${c.tipo}]`).join(' | ')}`);
  const tela = copiado.split('\n').map((l) => l.split('\t'));
  checagens['LibreOffice: cada valor na sua célula, 3 colunas por linha, igual à tela'] =
    planilha.length === tela.length && planilha.every((l, i) => l.length === 3 && l.every((c, j) => c.texto === tela[i][j]));
  checagens['LibreOffice: números como número e tempos como tempo'] =
    planilha.length > 1 && planilha.slice(1).every((l) => l[0].tipo === 'float' && l[1].tipo === 'time' && l[2].tipo === 'time');
} else {
  checagens['o roteiro gravou o texto copiado'] = false;
}

checagens['o app não entrou em pânico'] = !/panicked at/.test(log);
checagens['nenhuma falha de gravação do state.json no log'] = !/state\.json não gravado/.test(log);
checagens['o app sai sozinho depois de fechar a janela'] = /^saiu 0$/.test(appEstado);
console.log(`app: ${appEstado || '?'}`);
let falhou = false;
for (const [nome, ok] of Object.entries(checagens)) {
  console.log(`${ok ? 'ok   ' : 'FALHA'} ${nome}`);
  if (!ok) falhou = true;
}
process.exit(falhou || r.erro || !Object.keys(r.checagens ?? {}).length ? 1 : 0);
