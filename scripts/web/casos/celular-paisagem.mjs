// W37: o celular deitado (PLANO-WEB-V1, 5.5).
//
//   node scripts/web/verificar.mjs celular-paisagem
const ROTAS = ['foco', 'temporizador', 'cronometro', 'configuracoes'];
const assentar = (rota) => `new Promise((ok) => {
  location.hash = '#/${rota}';
  const olhar = () =>
    location.hash === '#/${rota}' && document.querySelector('.tt-pagina') && !document.querySelector('.tt-rolagem[data-entrando]')
      ? setTimeout(ok, 250)
      : setTimeout(olhar, 30);
  olhar();
})`;

export default async function celularPaisagem(t) {
  const p = await t.novaAba({ celular: 'paisagem', caminho: '/' });
  for (const rota of ROTAS) {
    await p.avaliar(assentar(rota));
    const m = await p.avaliar(`(() => {
      const h = document.documentElement, r = document.querySelector('.tt-rolagem');
      const barra = document.querySelector('.tt-barra-inferior').getBoundingClientRect();
      r.scrollTop = r.scrollHeight;
      const visiveis = [...document.querySelectorAll('.tt-pagina *')].filter((e) => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden');
      const ultimo = visiveis.reduce((a, e) => Math.max(a, e.getBoundingClientRect().bottom), 0);
      return {
        forma: h.dataset.forma,
        semRolagem: h.scrollWidth === h.clientWidth && r.scrollWidth === r.clientWidth,
        barra: { top: barra.top, bottom: barra.bottom, altura: barra.height }, innerHeight,
        paddingLeft: getComputedStyle(document.querySelector('.tt-janela')).paddingLeft,
        ultimo,
      };
    })()`);
    t.conferir(
      `paisagem, ${rota}: layout de celular, sem rolagem horizontal, barra no fim (64 + 21), recuo esquerdo de 47 px`,
      m.forma === 'celular' && m.semRolagem && m.barra.bottom === m.innerHeight && m.barra.altura === 85 && m.paddingLeft === '47px',
      m,
    );
    t.conferir(`paisagem, ${rota}: o último elemento, rolado até o fim, fica acima da barra`, m.ultimo <= m.innerHeight - m.barra.altura + 0.5, { ultimo: m.ultimo, limite: m.innerHeight - m.barra.altura });
  }
  await p.fechar();
}
