#!/usr/bin/env node
// Resume uma rodada do roteiro x11 (M57, Compatibilidade X11): as checagens
// do roteiro e, pelo app.log (o mesmo para os três processos, porque o
// reinício herda a saída), as linhas do plano B2 na ordem, sem pânico e sem
// erro do X nem do Wayland. Sai com código 1 se algo falhar.
//
//   node scripts/gnome-aninhado/resumo-x11.mjs <pasta da rodada>
import { existsSync, readFileSync } from 'node:fs';

const pasta = process.argv[2];
const ler = (nome) => (existsSync(`${pasta}/${nome}`) ? readFileSync(`${pasta}/${nome}`, 'utf8') : '');
const r = JSON.parse(ler('resultado.json') || '{}');
const log = ler('app.log');
const linhas = [...log.matchAll(/\[tomatito\] (reiniciando|linuxX11)[^\n]*/g)].map((m) => m[0].replace('[tomatito] ', ''));

console.log(`rodada: ${pasta}`);
if (r.erro) console.log(`ERRO no roteiro: ${r.erro}`);
for (const [nome, v] of Object.entries(r.checagens ?? {})) console.log(`  ${nome}: ${JSON.stringify(v.detalhe)}`);
console.log(`  registro do B2: ${linhas.join(' | ')}`);

const checagens = Object.fromEntries(Object.entries(r.checagens ?? {}).map(([k, v]) => [k, v.ok]));
checagens['o roteiro chegou ao fim'] = !r.erro && (r.passos ?? []).some((p) => p.endsWith(' fim'));
checagens['registro: reinício → x11 → reinício → desligada, nessa ordem'] =
  linhas.join(' | ') === 'reiniciando (Compatibilidade X11) | linuxX11 ligada: GDK_BACKEND=x11 | reiniciando (Compatibilidade X11) | linuxX11 desligada: GDK_BACKEND volta ao padrão';
// A forma de entrada do tomate no X (x11-forma.py): recortada, sem o canto e com o corpo.
let formas = [];
try {
  formas = JSON.parse(r.medidas?.formaX11 ?? '[]');
} catch {
  // sem a medida
}
const tomate = formas.find((f) => f.geo?.[2] === 280 && f.geo?.[3] === 280);
console.log(`  forma de entrada do tomate no X: ${tomate ? `${tomate.n} retângulos, caixa ${JSON.stringify(tomate.caixa)}` : 'não medida'}`);
checagens['no X, a forma de entrada do tomate é a região (muitos retângulos, sem o canto, com o corpo)'] = Boolean(tomate) && tomate.n > 100 && !tomate.canto_4_4 && tomate.corpo_61_175;
checagens['o app não entrou em pânico'] = !/panicked at/.test(log);
checagens['sem erro de protocolo do Wayland nem do X'] = !/wl_display[^\n]*\.error\(|Gdk-Message[^\n]*X Window System error|BadWindow|BadMatch/.test(log);
let falhou = false;
for (const [nome, ok] of Object.entries(checagens)) {
  console.log(`${ok ? 'ok   ' : 'FALHA'} ${nome}`);
  if (!ok) falhou = true;
}
process.exit(falhou ? 1 : 0);
