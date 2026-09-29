// Sobreposição de debug da região do tomate (M53): desenha por cima do
// desenho as faixas que o src/lib/regiao.js calculou, com a contagem e o
// tempo do cálculo. Só existe no dev: o src/tomato.js importa este módulo
// dentro de `import.meta.env.DEV`, e o build de produção não o põe no tomate
// (o #/dev da main usa só a CHAVE).
//
// Liga de três jeitos:
//   - `?regiao` na URL (a prévia no navegador);
//   - `localStorage['tt.debug.regiao'] = '1'`, que o cartão "Tomate (Full)"
//     do #/dev grava: vale na partida do tomate e, pelo evento `storage`, com
//     o tomate aberto (as duas janelas têm a mesma origem);
//   - `__ttRegiao.mostrar(true)` no console do tomate.
// Nada aqui recebe clique (pointer-events: none, no tomato.css).

export const CHAVE = 'tt.debug.regiao';

const NS = 'http://www.w3.org/2000/svg';

/** Um `d` de SVG com um retângulo por faixa `[x, y, largura, altura]`. */
export function caminhoDasFaixas(faixas) {
  return faixas.map(([x, y, w, h]) => `M${x} ${y}h${w}v${h}h${-w}Z`).join('');
}

/** O texto do canto: "167 retângulos · 0,7 ms · 320 px". */
export function resumoDaRegiao({ faixas, ms, lado, escala }) {
  const n = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
  const px = escala === 1 ? `${lado} px` : `${lado} px × ${n.format(escala)}`;
  return `${faixas.length} retângulos · ${n.format(ms)} ms · ${px}`;
}

function lerChave() {
  try {
    return localStorage.getItem(CHAVE) === '1';
  } catch {
    return false;
  }
}

/**
 * Liga a sobreposição. `obterRegiao()` devolve a região atual
 * (`{ lado, escala, faixas, ms }`); `desenhar(regiao)` redesenha depois de
 * um novo cálculo.
 */
export function ligarSobreposicao(obterRegiao, { doc = document, win = window } = {}) {
  let svg = null;
  let caminhos = [];
  let info = null;

  function desenhar(regiao = obterRegiao()) {
    if (!svg || !regiao) return;
    const n = Math.round(regiao.lado * regiao.escala);
    svg.setAttribute('viewBox', `0 0 ${n} ${n}`);
    // Retângulos alternados em dois tons, para se ver onde um termina.
    caminhos.forEach((c, i) => c.setAttribute('d', caminhoDasFaixas(regiao.faixas.filter((_, k) => k % 2 === i))));
    info.textContent = resumoDaRegiao(regiao);
  }

  function mostrar(ligar) {
    if (Boolean(svg) === Boolean(ligar)) return;
    if (!ligar) {
      svg.remove();
      info.remove();
      svg = info = null;
      caminhos = [];
      return;
    }
    svg = doc.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'tt-regiao-debug');
    svg.setAttribute('aria-hidden', 'true');
    caminhos = [0, 1].map(() => doc.createElementNS(NS, 'path'));
    svg.append(...caminhos);
    info = doc.createElement('p');
    info.className = 'tt-regiao-info';
    info.setAttribute('aria-hidden', 'true');
    doc.body.append(svg, info);
    desenhar();
  }

  const naUrl = new URLSearchParams(win.location.search).has('regiao');
  mostrar(naUrl || lerChave());
  win.addEventListener('storage', (e) => {
    if (e.key === CHAVE || e.key === null) mostrar(naUrl || lerChave());
  });
  win.__ttRegiao = Object.freeze({ mostrar, regiao: () => obterRegiao() });
  return { desenhar, mostrar };
}
