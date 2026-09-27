#!/usr/bin/env node
// Resume uma rodada do roteiro controles (M12) e confere o que o roteiro
// gravou com as mesmas regras da prévia (scripts/preview/controles.mjs): onde
// cada menu, lista suspensa e dica abriu na janela de verdade, pela página e
// pelos pixels; as caixas de seleção na tela; o teclado, a roda do mouse, a
// escolha de uma opção e o diálogo. Sai com código 1 se algo falhar.
//
//   node scripts/gnome-aninhado/resumo-controles.mjs <pasta da rodada>
import { existsSync, readFileSync } from 'node:fs';
import { conferirPopover } from '../preview/controles.mjs';

const pasta = process.argv[2];
const ler = (nome) => (existsSync(`${pasta}/${nome}`) ? readFileSync(`${pasta}/${nome}`, 'utf8') : '');
const r = JSON.parse(ler('resultado.json') || '{}');
const appEstado = ler('app-estado.txt').trim();

const checagens = Object.fromEntries(Object.entries(r.checagens ?? {}).map(([k, v]) => [k, v.ok]));
const detalhes = [];
const checar = (nome, ok, falhas = []) => {
  checagens[nome] = Boolean(ok);
  if (!ok && falhas.length) detalhes.push(`${nome}:\n    ${falhas.join('\n    ')}`);
};
const perto = (v, alvo, folga = 1) => typeof v === 'number' && Math.abs(v - alvo) <= folga;
const pertoHex = (a, b, tol = 3) =>
  typeof a === 'string' && typeof b === 'string' &&
  [1, 3, 5].every((i) => Math.abs(parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16)) <= tol);

// A diferença entre as capturas de antes e de depois precisa conter a caixa
// do que abriu (medida pela página) e ficar em volta dela e do gatilho (a
// sombra do Fluent vai uns 16 px para fora; o gatilho muda de estado).
function conferirPixels(dif, popup, ancora, folga = 32) {
  const f = [];
  if (!dif?.caixa) return ['nada mudou na tela'];
  const [x0, y0, x1, y1] = dif.caixa;
  const [px, py, pw, ph] = popup;
  if (!(x0 <= px + 2 && y0 <= py + 2 && x1 >= px + pw - 3 && y1 >= py + ph - 3)) {
    f.push(`a mudança na tela (${dif.caixa}) não cobre o que abriu (${popup})`);
  }
  const ux0 = Math.min(px, ancora[0]) - folga;
  const uy0 = Math.min(py, ancora[1]) - folga;
  const ux1 = Math.max(px + pw, ancora[0] + ancora[2]) + folga;
  const uy1 = Math.max(py + ph, ancora[1] + ancora[3]) + folga;
  if (x0 < ux0 || y0 < uy0 || x1 > ux1 || y1 > uy1) f.push(`a mudança na tela (${dif.caixa}) passa de ${folga} px em volta do que abriu e do gatilho`);
  return f;
}

console.log(`rodada: ${pasta}`);
if (r.erro) console.log(`ERRO no roteiro: ${r.erro}`);

// 1. Caixas de seleção.
{
  const c = r.caixas ?? {};
  const f = [];
  if (!(c.inicio?.marcada?.fracao >= 0.5)) f.push(`marcada com ${c.inicio?.marcada?.fracao} dos pixels no creme`);
  if (c.inicio?.marcada?.azuis !== 0) f.push(`${c.inicio?.marcada?.azuis} pixels azuis na marcada`);
  if (!(c.inicio?.desmarcada?.fracao <= 0.05)) f.push(`desmarcada com ${c.inicio?.desmarcada?.fracao} no creme`);
  console.log(`caixas: ${JSON.stringify(c)}`);
  checar('caixa marcada creme (#FFF4EE) na tela, sem azul; a desmarcada não', !f.length, f);
  checar(
    'clicar marca a desmarcada (creme na tela) e clicar de novo desmarca',
    JSON.stringify(c.clicada?.estado) === '[true,true]' && c.clicada?.pixels?.fracao >= 0.5 && c.clicada?.pixels?.azuis === 0 && JSON.stringify(c.desfeita) === '[true,false]',
  );
  checar(
    'marcada com o mouse em cima fica no creme do hover (#FDE8E0), e apertada no do pressionado (#F8D7CC)',
    c.hover?.fracao >= 0.5 && c.clique?.fracao >= 0.5 && c.hover?.azuis === 0 && c.clique?.azuis === 0,
    [`hover ${JSON.stringify(c.hover)}`, `clique ${JSON.stringify(c.clique)}`],
  );
  checar('soltar o botão sobre a marcada a desmarca, e o clique seguinte a marca', JSON.stringify(c.soltou) === '[false,false]' && JSON.stringify(c.fim) === '[true,false]');
}

// 2. Menus e listas com o ponteiro.
const QUER = {
  'menu-sessao meio': { lado: 'abaixo', foco: 'Encerrar sessão', volta: 'button "Sessão"' },
  'menu-temporizador meio': { lado: 'abaixo', foco: 'Editar', volta: 'button "Temporizador"' },
  'menu-temporizador baixo': { lado: 'acima', foco: 'Editar', volta: 'button "Temporizador"' },
  'meta meio': { lado: 'abaixo', volta: 'button "1 hora"' },
  'zerar baixo': { lado: 'acima', volta: 'button "00:00"' },
};
for (const [chave, quer] of Object.entries(QUER)) {
  const c = r.casos?.[chave];
  const m = c?.medida;
  const f = conferirPopover(m, quer);
  if (m?.aberto) f.push(...conferirPixels(c.diferenca, m.popup, m.ancora));
  if (c?.esc?.aberto !== false) f.push('Esc não fechou');
  if (c?.esc?.foco !== quer.volta) f.push(`depois do Esc, o foco em ${c?.esc?.foco}, esperado ${quer.volta}`);
  console.log(`${chave}: ${m?.lado}, vão ${m?.vao}, esquerda ${m?.esquerda}, ${JSON.stringify(m?.popup)} (gatilho ${JSON.stringify(m?.ancora)}); na tela, mudou ${JSON.stringify(c?.diferenca)}`);
  checar(`${chave}: abre ${quer.lado === 'abaixo' ? 'embaixo' : 'em cima'} do gatilho, alinhado à esquerda, na página e na tela; Esc fecha e devolve o foco`, !f.length, f);
}

// 3. Roda do mouse.
{
  const { antes, depois } = r.roda ?? {};
  const da = depois?.ancora && antes?.ancora ? depois.ancora[1] - antes.ancora[1] : null;
  const dp = depois?.popup && antes?.popup ? depois.popup[1] - antes.popup[1] : null;
  console.log(`roda: o botão andou ${da} px e o menu ${dp} px`);
  checar('a roda do mouse com o menu aberto rola a tela, e o menu acompanha o botão', depois?.aberto && da !== null && da < 0 && perto(dp, da, 0.5) && conferirPopover(depois, { lado: 'abaixo' }).length === 0);
}

// 4. Teclado no menu.
{
  const seq = r.teclado?.menu ?? [];
  console.log(`teclado no menu: ${JSON.stringify(seq)}`);
  const [en, baixo, cima, esc] = seq;
  checar(
    'teclado no menu: Enter abre embaixo com o foco no 1º item, ↓ e ↑ andam, Esc fecha e volta ao botão',
    en?.aberto && en.foco === 'fluent-menu-item "Editar"' && en.lado === 'abaixo' && perto(en.esquerda, 0) &&
      baixo?.foco === 'fluent-menu-item "Reiniciar"' && cima?.foco === 'fluent-menu-item "Editar"' &&
      esc?.aberto === false && esc.foco === 'button "Temporizador"',
  );
}

// 5. Opção escolhida com o clique.
console.log(`opção: ${JSON.stringify(r.opcao)}`);
checar('clicar em "2 horas" troca o valor da lista (120) e o texto da caixa, e fecha a lista', r.opcao?.valor === '120' && r.opcao?.texto === '2 horas' && r.opcao?.aberto === false);

// 6. Dicas.
for (const [nome, lado] of [['dica-reiniciar', 'acima'], ['dica-volta', 'abaixo']]) {
  const d = r.dicas?.[nome];
  const f = conferirPopover(d?.mouse, { lado, vao: 4, alinhar: 'centro' });
  // A sombra da dica (drop-shadow 0 4px 8px) vai até uns 20 px para baixo.
  if (d?.mouse?.aberto) f.push(...conferirPixels(d.diferenca, d.mouse.popup, d.mouse.ancora, 24));
  if (d?.esc?.aberto !== false) f.push('Esc não fechou');
  if (d?.deNovo !== true || d?.saiu !== false) f.push(`com o mouse de volta, aberta ${d?.deNovo}; tirando o mouse para dentro da janela, aberta ${d?.saiu}`);
  if (d?.saiuDaJanela !== false) f.push(`tirando o mouse para fora da janela, a dica continua aberta (${d?.saiuDaJanela}; ${JSON.stringify(d?.hoverFora)})`);
  console.log(`${nome}, o ponteiro saltando do botão para fora da janela (só registro): ${JSON.stringify(d?.salto)}`);
  if (conferirPopover(d?.teclado, { lado, vao: 4, alinhar: 'centro' }).length) f.push(`com o foco do teclado: ${JSON.stringify(d?.teclado)}`);
  console.log(`${nome}: ${d?.mouse?.lado}, vão ${d?.mouse?.vao}, centro ${d?.mouse?.centro}, ${JSON.stringify(d?.mouse?.popup)}; na tela, mudou ${JSON.stringify(d?.diferenca)}`);
  checar(`${nome}: com o mouse parado, aparece ${lado === 'acima' ? 'em cima' : 'embaixo'} do botão, centrada, a 4 px (na página e na tela); Esc fecha; some ao tirar o mouse; o foco do teclado também mostra`, !f.length, f);
}

// 7. Diálogo.
{
  const d = r.dialogo ?? {};
  const a = d.aberto;
  const f = [];
  if (!a?.aberto || !a.modal) f.push(`aberto ${a?.aberto}, modal ${a?.modal}`);
  if (!(perto(a?.centro?.[0], 0) && perto(a?.centro?.[1], 0))) f.push(`fora do centro: ${JSON.stringify(a?.centro)}`);
  if (a?.cortina !== 'rgba(0, 0, 0, 0.3)') f.push(`fundo atrás ${a?.cortina}`);
  if (!pertoHex(d.pixels?.painel, d.esperado?.painel)) f.push(`painel atrás do diálogo ${d.pixels?.painel}, esperado ${d.esperado?.painel} (o Lite escurecido a 30%)`);
  if (!pertoHex(d.pixels?.dentro, d.esperado?.dentro)) f.push(`dentro do diálogo ${d.pixels?.dentro}, esperado ${d.esperado?.dentro}`);
  console.log(`diálogo: ${JSON.stringify({ popup: a?.popup, centro: a?.centro, cortina: a?.cortina, pixels: d.pixels })}`);
  checar('diálogo: modal, centrado, com o fundo escurecido pelo --tt-smoke (na página e na tela)', !f.length, f);
  checar('a lista de dentro do diálogo abre embaixo da caixa', conferirPopover(d.lista, { lado: 'abaixo' }).length === 0, conferirPopover(d.lista, { lado: 'abaixo' }));
  checar(
    'Esc fecha primeiro a lista e depois o diálogo, e o foco volta ao botão que o abriu; Cancelar fecha',
    d.esc1?.lista?.aberto === false && d.esc1?.dialogo?.aberto === true && d.esc2?.aberto === false &&
      d.esc2?.foco === 'button "Editar meta diária"' && d.depoisDoCancelar?.aberto === false,
    [`esc1 ${JSON.stringify({ lista: d.esc1?.lista?.aberto, dialogo: d.esc1?.dialogo?.aberto })}`, `esc2 ${JSON.stringify({ aberto: d.esc2?.aberto, foco: d.esc2?.foco })}`, `cancelar ${d.depoisDoCancelar?.aberto}`],
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
