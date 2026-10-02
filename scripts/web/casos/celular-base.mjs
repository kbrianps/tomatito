// W30: a base do layout de celular (PLANO-WEB-V1, 5.1 e 5.2).
//
//   node scripts/web/verificar.mjs celular-base
//
// O data-forma liga nos cinco perfis de celular (em pé e deitado) e fica
// desligado no tablet e no navegador do desktop; nenhuma rota rola de lado; as
// áreas seguras de cima e dos lados entram no recuo da .tt-janela.
import { PERFIS } from '../celular.mjs';

const ROTAS = ['foco', 'temporizador', 'cronometro', 'configuracoes'];

const MEDIR = `(() => {
  const h = document.documentElement;
  const r = document.querySelector('.tt-rolagem');
  const j = getComputedStyle(document.querySelector('.tt-janela'));
  return {
    forma: h.dataset.forma,
    semRolagem: h.scrollWidth === h.clientWidth && r.scrollWidth === r.clientWidth,
    larguras: [h.scrollWidth, h.clientWidth, r.scrollWidth, r.clientWidth],
    paddingTop: j.paddingTop, paddingLeft: j.paddingLeft, paddingRight: j.paddingRight,
    touchAction: getComputedStyle(h).touchAction,
  };
})()`;

async function medirRotas(p) {
  const medidas = {};
  for (const rota of ROTAS) {
    await p.avaliar(`new Promise((ok) => {
      location.hash = '#/${rota}';
      const olhar = () =>
        location.hash === '#/${rota}' && document.querySelector('.tt-pagina') && !document.querySelector('.tt-rolagem[data-entrando]')
          ? requestAnimationFrame(() => requestAnimationFrame(ok))
          : setTimeout(olhar, 30);
      olhar();
    })`);
    medidas[rota] = await p.avaliar(MEDIR);
  }
  return medidas;
}

export default async function celularBase(t) {
  for (const nome of ['p', 'm', 'g', 'minimo', 'paisagem']) {
    const perfil = PERFIS[nome];
    const p = await t.novaAba({ celular: nome, caminho: '/' });
    const m = await medirRotas(p);
    const todas = Object.values(m);
    t.conferir(`${nome}: data-forma="celular" nas 4 rotas`, todas.every((x) => x.forma === 'celular'), m);
    t.conferir(`${nome}: sem rolagem horizontal nas 4 rotas`, todas.every((x) => x.semRolagem), m);
    t.conferir(
      `${nome}: áreas seguras no recuo da .tt-janela (${perfil.seguro.top}/${perfil.seguro.left}/${perfil.seguro.right})`,
      m.foco.paddingTop === `${perfil.seguro.top}px` && m.foco.paddingLeft === `${perfil.seguro.left}px` &&
        m.foco.paddingRight === `${perfil.seguro.right}px`,
      m.foco,
    );
    t.conferir(`${nome}: touch-action manipulation no <html>`, m.foco.touchAction === 'manipulation', m.foco);
    await p.fechar();
  }

  const tablet = await t.novaAba({ celular: 'tablet', caminho: '/' });
  const mt = await medirRotas(tablet);
  t.conferir('tablet (800 × 1280, toque): sem data-forma', Object.values(mt).every((x) => x.forma === undefined), mt);
  await tablet.fechar();

  const desktop = await t.novaAba({ caminho: '/' });
  const md = await medirRotas(desktop);
  t.conferir('1000 × 700 sem toque: sem data-forma', Object.values(md).every((x) => x.forma === undefined), md);
  await desktop.fechar();
}
