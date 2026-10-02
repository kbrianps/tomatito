// A05: a geometria de referência da web no perfil g (412 × 915), para o
// scripts/android/casca.mjs comparar com o Android. Grava
// /opt/cargo-target/geometria-web-g.json.
//
//   npm run build:web && node scripts/web/verificar.mjs geometria-g
import { writeFileSync } from 'node:fs';

export const MEDIR_GEOMETRIA = `(() => {
  const base = document.querySelector('.tt-rolagem').getBoundingClientRect();
  const g = (s) => { const r = document.querySelector(s)?.getBoundingClientRect(); return r ? { x: r.left, y: r.top - base.top, w: r.width, h: r.height } : null; };
  return { innerWidth, navegacao: g('.tt-barra-inferior'), sessao: g('.tt-card.tt-sessao'), iniciar: g('.tt-preparo-iniciar') };
})()`;

export default async function geometriaG(t) {
  const p = await t.novaAba({ celular: 'g', caminho: '/#/foco' });
  await p.avaliar('new Promise((ok) => setTimeout(ok, 1200))');
  const g = await p.avaliar(MEDIR_GEOMETRIA);
  writeFileSync('/opt/cargo-target/geometria-web-g.json', JSON.stringify(g, null, 2));
  t.conferir('geometria da web a 412 × 915 gravada', g.innerWidth === 412 && g.navegacao && g.sessao && g.iniciar, g);
  await p.fechar();
}
