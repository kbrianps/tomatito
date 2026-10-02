// W32: alvos de toque de 48 × 48 (PLANO-WEB-V1, 5.3).
//
//   node scripts/web/verificar.mjs celular-alvos
//
// Mede, com o alvos() do celular.mjs, as quatro telas no perfil m e no tablet
// (toque sem o layout de celular), e confere que um toque não deixa dica.
export const EXCECOES = [];

const assentar = (rota) => `new Promise((ok) => {
  location.hash = '#/${rota}';
  const olhar = () =>
    location.hash === '#/${rota}' && document.querySelector('.tt-pagina') && !document.querySelector('.tt-rolagem[data-entrando]')
      ? setTimeout(ok, 150)
      : setTimeout(olhar, 30);
  olhar();
})`;
const ipc = (cmd, args = {}) => `import('/src/lib/ipc.js').then((m) => m.default?.invoke ? m.default.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args)}) : m.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args)}))`;

// Toque de verdade: para cada alvo menor que 48 no desenho, um ponto a 20 px
// do centro (fora do desenho de 32) ainda cai no próprio alvo, em pelo menos
// uma direção livre de vizinhos. Pega um ::after cortado por overflow.
const TOQUE_REAL = `(() => {
  const sel = 'button, a.tt-nav-item, fluent-checkbox, fluent-switch, fluent-radio';
  const falhas = [];
  let conferidos = 0;
  for (const el of document.querySelectorAll(sel)) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || el.closest('[inert],[hidden]') || getComputedStyle(el).visibility === 'hidden') continue;
    if (r.width >= 48 && r.height >= 48) continue;
    if (r.bottom < 0 || r.top > innerHeight - 130 || r.top < 80) continue; // fora da vista ou perto das bordas
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const pontos = [];
    if (r.width < 48) pontos.push([cx - 21, cy], [cx + 21, cy]);
    if (r.height < 48) pontos.push([cx, cy - 21], [cx, cy + 21]);
    conferidos += 1;
    const acertos = pontos.filter(([x, y]) => {
      const alvo = document.elementFromPoint(x, y);
      return alvo && (alvo === el || el.contains(alvo));
    }).length;
    if (!acertos) falhas.push((el.getAttribute('aria-label') || el.textContent.trim().slice(0, 30) || el.localName) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
  }
  return { conferidos, falhas };
})()`;

const tocarPorNome = (p, nome) =>
  p.avaliar(`(() => {
    const b = [...document.querySelectorAll('.tt-pagina button')].find((x) => (x.getAttribute('aria-label') || x.textContent).trim() === ${JSON.stringify(nome)} && x.getBoundingClientRect().width);
    if (!b) return false;
    b.dataset.alvoDoTeste = '1';
    return true;
  })()`).then(async (achou) => {
    if (!achou) throw new Error('sem o botão ' + nome);
    await p.tocar('[data-alvo-do-teste]');
    await p.avaliar(`(document.querySelector('[data-alvo-do-teste]')?.removeAttribute('data-alvo-do-teste'), new Promise((ok) => setTimeout(ok, 300)))`);
  });

async function medir(t, p, nome) {
  const telas = {};
  await p.avaliar(assentar('foco'));
  telas['foco (preparo)'] = await p.alvos({ excecoes: EXCECOES });
  // No tablet, a sessão e o cronômetro já vêm rodando da primeira aba (o
  // estado é do navegador).
  if (!(await p.avaliar(`!!document.querySelector('.tt-mostrador')`))) await tocarPorNome(p, 'Iniciar sessão de foco');
  telas['foco (sessão)'] = await p.alvos({ excecoes: EXCECOES });
  const emSessao = await p.avaliar(`!!document.querySelector('.tt-mostrador')`);
  t.conferir(`${nome}: o toque em "Iniciar sessão de foco" começa a sessão`, emSessao);
  await p.avaliar(assentar('temporizador'));
  telas.temporizador = await p.alvos({ excecoes: EXCECOES });
  await p.avaliar(assentar('cronometro'));
  const rodando = await p.avaliar(`[...document.querySelectorAll('.tt-pagina button')].some((b) => (b.getAttribute('aria-label') || b.textContent).trim() === 'Marcar volta' && !b.disabled)`);
  if (!rodando) await tocarPorNome(p, 'Iniciar');
  for (let i = 0; i < 3; i++) await tocarPorNome(p, 'Marcar volta');
  const voltas = await p.avaliar(`document.querySelectorAll('.tt-voltas-tabela tbody tr').length`);
  t.conferir(`${nome}: cronômetro com 3 voltas por toque`, voltas >= 3, voltas);
  telas.cronometro = await p.alvos({ excecoes: EXCECOES });
  const dicas = await p.avaliar(`new Promise((ok) => setTimeout(() => ok([...document.querySelectorAll('.tt-dica')].filter((d) => getComputedStyle(d).visibility !== 'hidden' && getComputedStyle(d).display !== 'none' && d.getBoundingClientRect().width > 0).length), 500))`);
  t.conferir(`${nome}: nenhum toque deixou uma .tt-dica visível 500 ms depois`, dicas === 0, dicas);
  await p.avaliar(assentar('configuracoes'));
  await p.avaliar(`(document.querySelectorAll('.tt-expansor-cabeca[aria-expanded="false"]').forEach((b) => b.click()), new Promise((ok) => setTimeout(ok, 400)))`);
  telas.configuracoes = await p.alvos({ excecoes: EXCECOES });
  const toques = {};
  for (const rota of ['foco', 'temporizador', 'cronometro', 'configuracoes']) {
    await p.avaliar(assentar(rota));
    toques[rota] = await p.avaliar(TOQUE_REAL);
  }
  t.conferir(
    `${nome}: um toque a 21 px do centro ainda cai no alvo (área real, não cortada)`,
    Object.values(toques).every((x) => x.falhas.length === 0) && Object.values(toques).some((x) => x.conferidos > 0),
    toques,
  );
  for (const [tela, m] of Object.entries(telas)) {
    t.conferir(`${nome}, ${tela}: nenhum alvo abaixo de 48 × 48 (${m.medidos} medidos)`, m.pequenos.length === 0, m.pequenos);
  }
}

export default async function celularAlvos(t) {
  const p = await t.novaAba({ celular: 'm', caminho: '/' });
  await medir(t, p, 'm');
  await p.fechar();
  const tb = await t.novaAba({ celular: 'tablet', caminho: '/' });
  await medir(t, tb, 'tablet');
  await tb.fechar();
  t.conferir(`no máximo 3 exceções, cada uma com motivo (${EXCECOES.length})`, EXCECOES.length <= 3 && EXCECOES.every((e) => e.motivo));
}
