// A sonda de celular de 29/09/2026 (PLANO-WEB-V1, seção 6;
// ~/dev/tomatito-ref/web/sonda-celular/), refeita com as funções do
// scripts/web/celular.mjs, para que as ferramentas dos marcos de celular
// (W30–W37) tenham elas mesmas um teste.
//
//   node scripts/web/verificar.mjs sonda-celular --servidor fumaca
export const servidor = 'fumaca';
export const caminho = '/sonda-celular.html';

const altura = (sel) => `document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect().height`;

export default async function sondaCelular(t) {
  const p = await t.novaAba({ celular: 'm', caminho });

  const m = await p.avaliar(`({
    coarse: matchMedia('(pointer: coarse)').matches,
    hoverNone: matchMedia('(hover: none)').matches,
    anyFine: matchMedia('(any-pointer: fine)').matches,
    innerWidth,
    dvh: ${altura('#altura')},
    orientacao: screen.orientation.type,
    maxTouchPoints: navigator.maxTouchPoints,
    mobile: navigator.userAgentData?.mobile,
  })`);
  t.conferir(
    'perfil m: pointer coarse, hover none, sem any-pointer fine, 390 × 844, retrato, 5 toques, userAgentData.mobile',
    m.coarse && m.hoverNone && !m.anyFine && m.innerWidth === 390 && m.dvh === 844 &&
      m.orientacao === 'portrait-primary' && m.maxTouchPoints === 5 && m.mobile === true,
    m,
  );

  const barra = await p.avaliar(altura('#barra'));
  t.conferir('safe area de baixo (34) entra no env(): barra de 56 + 34 = 90', barra === 90, { barra });

  await p.tocar('#grande');
  const toques = await p.avaliar('window.toques');
  t.conferir(
    'tocar(): pointerdown de toque, touchstart e click com pointerType touch',
    ['pointerdown:touch', 'touchstart', 'click:touch'].every((x) => toques.includes(x)),
    toques,
  );

  const { x, ate } = await p.arrastar('#deslizante', 100);
  const arraste = await p.avaliar('window.arraste');
  t.conferir(
    'arrastar(): touchmove crescente até o destino',
    arraste.length >= 4 && arraste.every((v, i) => i === 0 || v >= arraste[i - 1]) &&
      Math.abs(arraste.at(-1) - ate) <= 1,
    { de: Math.round(x), ate: Math.round(ate), arraste },
  );

  await p.teclado(300);
  const aberto = await p.avaliar(`({
    innerHeight,
    dvh: ${altura('#altura')},
    insetTeclado: getComputedStyle(document.querySelector('#teclado')).bottom,
  })`);
  await p.teclado(0);
  const fechado = await p.avaliar(`({ innerHeight, dvh: ${altura('#altura')} })`);
  t.conferir(
    'teclado(300): env(keyboard-inset-height) 300px e viewport 544; teclado(0) volta a 844',
    aberto.insetTeclado === '300px' && aberto.innerHeight === 544 && aberto.dvh === 544 &&
      fechado.innerHeight === 844 && fechado.dvh === 844,
    { aberto, fechado },
  );

  const medida = await p.alvos({ excecoes: [{ seletor: '#campo', motivo: 'campo da sonda, fora da medida' }] });
  t.conferir(
    'alvos(): só o botão de 32 sem ::after fica abaixo de 48 × 48; o ::after de 48 conta; exceção respeitada',
    medida.pequenos.length === 1 && medida.pequenos[0].alvo.startsWith('button#pequeno') &&
      medida.medidos === 4 && medida.excecoes.length === 1 && medida.excecoes[0].motivo.startsWith('campo'),
    medida,
  );
  await p.fechar();

  const d = await t.novaAba({ celular: 'paisagem', caminho });
  const pa = await d.avaliar(`({
    innerWidth,
    innerHeight,
    orientacao: screen.orientation.type,
    esquerda: getComputedStyle(document.querySelector('#lado')).paddingLeft,
    coarse: matchMedia('(pointer: coarse)').matches,
  })`);
  await d.fechar();
  t.conferir(
    'perfil paisagem: 844 × 390, landscape-primary, safe area de 47 à esquerda',
    pa.innerWidth === 844 && pa.innerHeight === 390 && pa.orientacao === 'landscape-primary' &&
      pa.esquerda === '47px' && pa.coarse,
    pa,
  );
}
