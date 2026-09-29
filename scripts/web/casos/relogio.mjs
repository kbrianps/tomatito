// O relógio de teste do verificar.mjs (PLANO-WEB, seção 6), conferido por si:
// sobrevive a recarregar e a reabrir, anda com a aba fechada, vale para o
// `new Date()` e trava com a aba oculta.
//
//   node scripts/web/verificar.mjs relogio --servidor fumaca
export const servidor = 'fumaca';
export const caminho = '/';

const HORA = 3_600_000;

// Quanto o relógio da página está à frente do relógio real do Node.
const adiante = (p) => p.avaliar(`Date.now() - ${Date.now()}`);
const perto = (v, alvo) => v >= alvo - 1000 && v <= alvo + 5000;

export default async function relogio(t) {
  const p = t.pagina;

  await t.relogio.avancar(HORA);
  const antes = await adiante(p);
  await p.recarregar();
  const depois = await adiante(p);
  t.conferir('avançar 1 h e recarregar: o deslocamento continua', perto(antes, HORA) && perto(depois, HORA), {
    antes,
    depois,
  });

  const datas = await p.avaliar(`(() => {
    const agora = Date.now();
    const d = new Date();
    return {
      semArgumentos: d.getTime() - agora,
      instancia: d instanceof Date,
      comArgumento: new Date(0).getTime(),
      utc: Date.UTC(2026, 8, 29),
      texto: typeof Date(),
    };
  })()`);
  t.conferir(
    'new Date() sem argumentos segue o deslocamento; com argumento, Date.UTC e Date() continuam normais',
    datas.semArgumentos >= 0 && datas.semArgumentos < 1000 && datas.instancia && datas.comArgumento === 0 &&
      datas.utc === 1790640000000 && datas.texto === 'string',
    datas,
  );

  await p.fechar();
  await t.relogio.avancarComAbaFechada(HORA / 2);
  const nova = await t.novaAba({ caminho });
  const reaberta = await adiante(nova);
  t.conferir('fechar a aba, avançar 30 min e reabrir: 1 h 30 à frente', perto(reaberta, HORA * 1.5), {
    reaberta,
    deslocamento: t.relogio.deslocamento,
  });

  // Uma segunda aba ativada deixa a primeira oculta.
  const outra = await t.novaAba({ caminho });
  await outra.cmd('Page.bringToFront');
  await new Promise((r) => setTimeout(r, 300));
  const oculta = await nova.avaliar(`(() => {
    try {
      __ttAvancar(1000);
      return { visibilidade: document.visibilityState, lancou: false };
    } catch (e) {
      return { visibilidade: document.visibilityState, lancou: true, mensagem: e.message };
    }
  })()`);
  let pelaFerramenta;
  try {
    await t.relogio.avancar(1000, nova);
    pelaFerramenta = 'não lançou';
  } catch (e) {
    pelaFerramenta = e.message;
  }
  t.conferir(
    '__ttAvancar com a aba oculta lança erro (na página e no relogio.avancar), e o deslocamento não muda',
    oculta.visibilidade === 'hidden' && oculta.lancou && /oculta/.test(pelaFerramenta) &&
      t.relogio.deslocamento === HORA * 1.5,
    { ...oculta, pelaFerramenta },
  );

  // Avançar na aba visível leva as outras junto.
  await t.relogio.avancar(HORA, outra);
  const naOculta = await adiante(nova);
  t.conferir('avançar na aba visível alinha a aba oculta (2 h 30)', perto(naOculta, HORA * 2.5), { naOculta });
}
