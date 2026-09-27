#!/usr/bin/env node
// Resume uma rodada do roteiro botoes (M13) e confere o que o roteiro gravou
// com as mesmas regras da prévia (scripts/preview/botoes.mjs): os botões e os
// desabilitados do Fluent com as cores dos tokens, os ícones, o anel duplo pelo
// Tab (na página e nos pixels), o clique sem anel, hover e clique nos pixels, e
// a dica com o ponteiro e com o teclado. As cores esperadas nos pixels saem do
// tokens.css (as funções do scripts/contrast.mjs), compostas sobre o cartão do
// Lite. Sai com código 1 se algo falhar.
//
//   node scripts/gnome-aninhado/resumo-botoes.mjs <pasta da rodada>
import { existsSync, readFileSync } from 'node:fs';
import { computar, empilhar, hex, lerArquivos, lerCor, lerRegras } from '../contrast.mjs';
import { conferirAnel, conferirBotoes, conferirDesabilitados, conferirDica } from '../preview/botoes.mjs';

const pasta = process.argv[2];
const ler = (nome) => (existsSync(`${pasta}/${nome}`) ? readFileSync(`${pasta}/${nome}`, 'utf8') : '');
const r = JSON.parse(ler('resultado.json') || '{}');
const appEstado = ler('app-estado.txt').trim();

// Cores do Lite compostas sobre o cartão, como a tela as mostra.
const regras = lerArquivos().flatMap(({ origem, texto }) => lerRegras(texto, origem));
const lite = computar(regras, [{ tag: 'html', atributos: { 'data-theme': 'lite', 'data-platform': 'linux' } }]);
const sobreCartao = (...tokens) => hex(empilhar(['--tt-bg-card', ...tokens].map((t) => lerCor(lite.get(t)))));
const COR = {
  cartao: sobreCartao(),
  creme: sobreCartao('--tt-fg-1'),
  repouso: sobreCartao('--tt-ctl'),
  hover: sobreCartao('--tt-ctl-hover'),
  clique: sobreCartao('--tt-ctl-press'),
  bordaDeCima: sobreCartao('--tt-ctl-stroke-top'),
  bordaDeBaixo: sobreCartao('--tt-ctl-stroke-bottom'),
  sutilHover: sobreCartao('--tt-subtle-hover'),
};

const checagens = Object.fromEntries(Object.entries(r.checagens ?? {}).map(([k, v]) => [k, v.ok]));
const detalhes = [];
const checar = (nome, ok, falhas = []) => {
  checagens[nome] = Boolean(ok);
  if (!ok && falhas.length) detalhes.push(`${nome}:\n    ${falhas.join('\n    ')}`);
};
const pertoHex = (a, b, tol = 3) =>
  typeof a === 'string' && typeof b === 'string' &&
  [1, 3, 5].every((i) => Math.abs(parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16)) <= tol);

/** O anel nos pixels: 1 px do cartão colado ao botão, 2 px de creme e o cartão de novo. */
function anelNosPixels(p, lados = ['esquerda', 'direita', 'cima']) {
  const f = [];
  for (const lado of lados) {
    if (!pertoHex(p?.[1]?.[lado], COR.cartao)) f.push(`${lado}, 1 px fora: ${p?.[1]?.[lado]}, esperado o cartão ${COR.cartao}`);
    for (const d of [2, 3]) if (!pertoHex(p?.[d]?.[lado], COR.creme)) f.push(`${lado}, ${d} px fora: ${p?.[d]?.[lado]}, esperado o creme ${COR.creme}`);
    if (!pertoHex(p?.[4]?.[lado], COR.cartao)) f.push(`${lado}, 4 px fora: ${p?.[4]?.[lado]}, esperado o cartão ${COR.cartao}`);
  }
  return f;
}
const semAnel = (p) => ['esquerda', 'direita', 'cima'].every((lado) => [1, 2, 3, 4].every((d) => pertoHex(p?.[d]?.[lado], COR.cartao)));

console.log(`rodada: ${pasta}`);
if (r.erro) console.log(`ERRO no roteiro: ${r.erro}`);
console.log(`cores esperadas nos pixels (Lite, sobre o cartão): ${JSON.stringify(COR)}`);

// 1. Medidas da página.
{
  const m = r.medidas ?? {};
  const fb = m.botoes && m.cores ? conferirBotoes(m.botoes, m.cores) : ['sem medidas'];
  checar('botões no Lite: medidas e cores dos tokens (padrão, destaque, sutil, circulares e desabilitados)', !fb.length, fb);
  const fd = m.desabilitados ? conferirDesabilitados(m.desabilitados) : ['sem medidas'];
  checar('desabilitados do Fluent no Lite com as cores da ponte, sem os cinzas do bloco escuro', !fd.length, fd);
  const ic = m.icones;
  const fi = [];
  if (ic?.celulas?.length !== 18 || ic?.svgs !== 23) fi.push(`${ic?.celulas?.length} ícones e ${ic?.svgs} desenhos`);
  for (const c of ic?.celulas ?? []) for (const g of c.grades) if (Math.abs(g.tamanho[0] - g.grade) > 0.6 || g.desenho < 1) fi.push(`${c.nome} ${g.grade}: ${JSON.stringify(g.tamanho)}`);
  if (ic?.noPacote?.length) fi.push(`pedidos ao pacote: ${ic.noPacote}`);
  console.log(`ícones: ${ic?.celulas?.length} nomes, ${ic?.svgs} desenhos, ${ic?.noPacote?.length} pedido(s) ao pacote`);
  checar('ícones do catálogo: os 18 da lista, 23 desenhos no tamanho da grade, nada pedido ao @fluentui/svg-icons', !fi.length, fi);
}

// 2. Anel pelo Tab.
{
  const a = r.anel ?? {};
  const f = [...conferirAnel(a.foco ?? {}), ...anelNosPixels(a.pixels)];
  if (!/Iniciar sessão de foco/.test(a.foco?.elemento)) f.push(`foco em ${a.foco?.elemento}`);
  if (!semAnel(a.antes)) f.push(`antes do Tab já havia algo em volta do botão: ${JSON.stringify(a.antes)}`);
  console.log(`anel: ${a.foco?.elemento}, ${JSON.stringify(a.foco?.contorno)} + ${a.foco?.sombra}; pixels ${JSON.stringify(a.pixels)}`);
  checar('Tab: anel duplo no primeiro botão, na página e nos pixels (2 px de creme por fora, 1 px do cartão colado)', !f.length, f);
}

// 3. Tab até o sutil.
{
  const t = r.tab ?? {};
  // Em cima do botão fica a dica, e a sombra dela escurece o anel ali: nos
  // pixels, só os lados.
  const f = [...conferirAnel(t.sutil?.foco ?? {}), ...conferirDica(t.sutil?.dica, { texto: 'Mais opções' }), ...anelNosPixels(t.pixels, ['esquerda', 'direita'])];
  if (!/Cancelar/.test(t.segundo)) f.push(`2º Tab em ${t.segundo}`);
  if (!/Mais opções/.test(t.sutil?.foco?.elemento)) f.push(`3º Tab em ${t.sutil?.foco?.elemento} (os desabilitados deviam ficar fora)`);
  console.log(`tab: ${t.segundo} → ${t.sutil?.foco?.elemento}; dica ${t.sutil?.dica?.lado}, vão ${t.sutil?.dica?.vao}`);
  checar('Tab passa pelos desabilitados sem parar e chega ao sutil "Mais opções", com o anel e a dica em cima', !f.length, f);
  const fe = [];
  if (t.esc?.dica?.aberta !== false) fe.push('a dica continua aberta');
  if (!/Mais opções/.test(t.esc?.foco?.elemento) || !t.esc?.foco?.visivel) fe.push(`foco ${t.esc?.foco?.elemento}, visível ${t.esc?.foco?.visivel}`);
  checar('Esc fecha a dica e o foco fica no botão, com o anel', !fe.length, fe);
}

// 4. Hover, clique e o clique sem anel.
{
  const e = r.estados ?? {};
  console.log(`estados nos pixels: ${JSON.stringify(e, (k, v) => (k === 'focoDoClique' || k === 'anelDoClique' ? undefined : v))}`);
  const f = [];
  if (!pertoHex(e.repouso, COR.repouso)) f.push(`repouso ${e.repouso}, esperado ${COR.repouso}`);
  if (!pertoHex(e.hover, COR.hover)) f.push(`hover ${e.hover}, esperado ${COR.hover}`);
  if (!pertoHex(e.clique, COR.clique)) f.push(`clique ${e.clique}, esperado ${COR.clique}`);
  // A linha de 1 px da borda sai do WebKitGTK com uma cobertura um pouco
  // menor que 1 (#DFB3AF no lugar de #E1B7B2): folga de 6 por canal.
  if (!pertoHex(e.repousoBaixo, COR.bordaDeBaixo, 6)) f.push(`borda de baixo em repouso ${e.repousoBaixo}, esperado ${COR.bordaDeBaixo}`);
  if (!pertoHex(e.cliqueBaixo, COR.bordaDeCima, 6)) f.push(`borda de baixo no clique ${e.cliqueBaixo}, esperado a lisa ${COR.bordaDeCima}`);
  checar('botão padrão nos pixels: repouso, hover e clique (--tt-ctl, -hover, -press), com a borda de baixo lisa no clique', !f.length, f);
  const fs = [];
  if (!pertoHex(e.sutilRepouso, COR.cartao)) fs.push(`repouso ${e.sutilRepouso}, esperado o cartão ${COR.cartao}`);
  if (!pertoHex(e.sutilHover, COR.sutilHover)) fs.push(`hover ${e.sutilHover}, esperado ${COR.sutilHover}`);
  checar('botão sutil nos pixels: sem fundo em repouso, --tt-subtle-hover com o mouse', !fs.length, fs);
  const fc = conferirAnel(e.focoDoClique ?? {}, { visivel: false });
  if (!semAnel(e.anelDoClique)) fc.push(`pixels em volta do botão clicado: ${JSON.stringify(e.anelDoClique)}`);
  checar('o clique do ponteiro não mostra o anel (na página e nos pixels)', !fc.length, fc);
}

// 5. A dica com o ponteiro.
{
  const d = r.dica ?? {};
  const f = conferirDica(d.mouse, { texto: 'Marcar volta' });
  if (d.cedo?.aberta !== false) f.push('aberta 120 ms depois de o ponteiro chegar (o atraso é de 250 ms)');
  if (!pertoHex(d.pixelDentro, COR.cartao)) f.push(`dentro da dica, na tela: ${d.pixelDentro}, esperado o cartão ${COR.cartao}`);
  const m = d.mouse;
  if (m?.dica && d.diferenca?.caixa) {
    const [x0, y0, x1, y1] = d.diferenca.caixa;
    const [px, py, pw, ph] = m.dica;
    if (!(x0 <= px + 2 && y0 <= py + 2 && x1 >= px + pw - 3 && y1 >= py + ph - 3)) f.push(`a mudança na tela (${d.diferenca.caixa}) não cobre a dica (${m.dica})`);
    // Em volta da dica e do botão (o hover do botão e a sombra da dica).
    const [ax, ay, aw, ah] = m.ancora;
    if (x0 < Math.min(px, ax) - 24 || y0 < py - 24 || x1 > Math.max(px + pw, ax + aw) + 24 || y1 > ay + ah + 24) f.push(`a mudança na tela (${d.diferenca.caixa}) passa de 24 px em volta da dica e do botão`);
  } else f.push('nada mudou na tela');
  console.log(`dica: ${m?.lado}, vão ${m?.vao}, centro ${m?.centro}, ${JSON.stringify(m?.dica)}; na tela, mudou ${JSON.stringify(d.diferenca)}; dentro ${d.pixelDentro}`);
  checar('com o ponteiro parado no "Marcar volta", a dica aparece depois do atraso, em cima e centrada a 4 px (na página e na tela)', !f.length, f);
  const fv = conferirDica(d.vizinho, { texto: 'Pausar' });
  checar('com a dica aberta, passar ao botão vizinho mostra a dele sem o atraso (em 80 ms)', !fv.length, fv);
  const fs = [];
  if (d.esc?.aberta !== false) fs.push('Esc não fechou');
  if (d.deNovo?.aberta !== true) fs.push('não voltou com o ponteiro de volta');
  if (d.saiu?.aberta !== false) fs.push('não sumiu com o ponteiro fora do botão');
  if (!(d.foraDaJanela?.antes === true && d.foraDaJanela?.depois === false)) fs.push(`para fora da janela: ${JSON.stringify(d.foraDaJanela)}`);
  if (!(d.clique?.antes === true && d.clique?.depois === false)) fs.push(`apertar o botão: ${JSON.stringify(d.clique)}`);
  if (d.desabilitado?.aberta !== false) fs.push('abriu no botão desabilitado');
  checar('a dica some com Esc, ao sair (também para fora da janela) e ao apertar o botão; volta com o ponteiro; nada no desabilitado', !fs.length, fs);
  const cm = d.comMenu ?? {};
  checar(
    'com o menu "Sessão" aberto, a dica aparece e o menu continua aberto',
    cm.menuAntes === true && cm.dica?.aberta === true && cm.menuDepois === true,
    [`menu antes ${cm.menuAntes}, dica ${cm.dica?.aberta}, menu depois ${cm.menuDepois}`],
  );
}

checagens['o app sai sozinho depois de fechar a janela'] = /^saiu 0$/.test(appEstado);
console.log(`app: ${appEstado || '?'}`);
let falhou = false;
for (const [nome, ok] of Object.entries(checagens)) {
  console.log(`${ok ? 'ok   ' : 'FALHA'} ${nome}`);
  if (!ok) falhou = true;
}
for (const d of detalhes) console.log(`  ${d}`);
process.exit(falhou || r.erro || !Object.keys(r.checagens ?? {}).length ? 1 : 0);
