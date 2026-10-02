// A casca do Android e o layout de celular (PLANO-ANDROID 4.3; A05), no tt37
// com o build de depuração instalado e o app aberto:
//
//   node scripts/web/verificar.mjs geometria-g   # a referência da web
//   node scripts/android/casca.mjs
//
// Por CDP: data-casca="android" e data-forma="celular"; sem barra de título
// visível, sem "Sair do Tomatito", sem "Tempo na bandeja" e sem volume; a
// geometria da navegação, do cartão de sessão e do botão Iniciar igual à da
// web a 412 px (±2 px; a altura medida a partir do topo da área que rola, para
// ignorar as barras do sistema); todo alvo tocável ≥ 48 × 48; nenhuma rolagem
// horizontal nas 4 telas. Imprime um JSON e sai 1 se algo falhou.
import { readFileSync } from 'node:fs';
import { conectar } from './cdp.mjs';
import { alvos } from '../web/celular.mjs';
import { MEDIR_GEOMETRIA } from '../web/casos/geometria-g.mjs';

const resultados = [];
const conferir = (nome, ok, detalhe) => resultados.push({ nome, ok: Boolean(ok), detalhe });
const perto = (a, b, chaves = ['x', 'y', 'w', 'h']) => a && b && chaves.every((k) => Math.abs(a[k] - b[k]) <= 2);

const cdp = await conectar();
const ir = (rota) =>
  cdp.avaliar(`new Promise((ok) => { const t0 = Date.now(); location.hash = '#/${rota}'; const olhar = () => Date.now() - t0 > 250 && location.hash === '#/${rota}' && document.querySelector('.tt-pagina') && !document.querySelector('.tt-rolagem[data-entrando]') ? setTimeout(ok, 300) : setTimeout(olhar, 50); olhar(); })`);
try {
  await ir('foco');
  const raiz = await cdp.avaliar(`({ casca: document.documentElement.dataset.casca, forma: document.documentElement.dataset.forma, innerWidth })`);
  conferir('data-casca="android" e data-forma="celular"', raiz.casca === 'android' && raiz.forma === 'celular', raiz);

  const web = JSON.parse(readFileSync('/opt/cargo-target/geometria-web-g.json', 'utf8'));
  const android = await cdp.avaliar(MEDIR_GEOMETRIA);
  // Sem as faixas das barras do sistema (o A06 as passa para o padding da
  // WebView): a navegação sem o padding de baixo, e o Iniciar medido a partir
  // do topo do cartão. A tela do tt37 tem 411,43 px CSS (1080 / 2,625).
  const seguro = await cdp.avaliar(`parseFloat(getComputedStyle(document.querySelector('.tt-barra-inferior')).paddingBottom) || 0`);
  const rel = (g) => ({ ...g.iniciar, y: g.iniciar.y - g.sessao.y });
  const navSemFaixa = { ...android.navegacao, h: android.navegacao.h - seguro };
  conferir(
    `geometria igual à da web (±2 px, sem as faixas das barras do sistema): navegação, cartão de sessão e Iniciar`,
    Math.abs(android.innerWidth - web.innerWidth) <= 2 &&
      perto(navSemFaixa, web.navegacao, ['x', 'w', 'h']) &&
      perto(android.sessao, web.sessao, ['x', 'w', 'h']) &&
      perto(rel(android), rel(web)),
    { android, web, seguro },
  );

  const rolagens = {};
  const pequenos = {};
  for (const rota of ['foco', 'temporizador', 'cronometro', 'configuracoes']) {
    await ir(rota);
    if (rota === 'configuracoes') await cdp.avaliar(`(document.querySelectorAll('.tt-expansor-botao[aria-expanded="false"]').forEach((b) => b.click()), new Promise((ok) => setTimeout(ok, 500)))`);
    rolagens[rota] = await cdp.avaliar(`(() => { const h = document.documentElement, r = document.querySelector('.tt-rolagem'); return h.scrollWidth <= h.clientWidth && r.scrollWidth <= r.clientWidth; })()`);
    pequenos[rota] = (await alvos({ avaliar: cdp.avaliar })).pequenos;
  }
  conferir('nenhuma rolagem horizontal nas 4 telas', Object.values(rolagens).every(Boolean), rolagens);
  conferir('todo alvo tocável ≥ 48 × 48 nas 4 telas', Object.values(pequenos).every((p) => p.length === 0), pequenos);

  // Sair das Configurações (com os expansores abertos) volta à Foco.
  await ir('foco');
  const saiu = await cdp.avaliar(`({ h1: document.querySelector('.tt-rolagem h1')?.textContent, sessao: !!document.querySelector('.tt-card.tt-sessao') })`);
  conferir('das Configurações (expansores abertos) de volta à Foco', saiu.sessao, saiu);
  await ir('configuracoes');

  const texto = await cdp.avaliar(`(() => {
    const t = document.querySelector('.tt-titlebar');
    return { barra: !!t && t.getBoundingClientRect().height > 0 && getComputedStyle(t).display !== 'none', texto: document.body.innerText, volume: !!document.querySelector('input[data-config="volume"]') };
  })()`);
  conferir('sem barra de título visível', !texto.barra, texto.barra);
  conferir('sem "Sair do Tomatito", "Tempo na bandeja" nem "Sempre na frente"', !/Sair do Tomatito|Tempo na bandeja|Sempre na frente/.test(texto.texto));
  conferir('sem o volume', !texto.volume);
} finally {
  await cdp.fechar();
}
const falhas = resultados.filter((r) => !r.ok);
console.log(JSON.stringify({ ok: falhas.length === 0, total: resultados.length, falhas: falhas.length, resultados }, null, 2));
process.exit(falhas.length ? 1 : 0);
