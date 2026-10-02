// Caso fumaça (PLANO-WEB, W01b; PLANO-WEB-V1, W01b): o wasm responde no
// navegador, servido como a web vai servir.
//
//   node scripts/web/verificar.mjs fumaca --servidor fumaca
//
// (a) o `.wasm` sai em /assets/ com hash no nome e `content-type: application/wasm`;
// (b) iniciar 25 min e avançar o relógio de teste 60 s faz o restante do
//     motor cair 60 s (o `RelogioJs` lê o `Date.now` trocado; W06a), e o
//     `new Date()` anda junto;
// (c) pausar sem fase correndo lança `{ code: 'notRunning', message: "não há
//     fase correndo para pausar" }`, o erro do desktop;
// (d) com o Chrome em TZ=America/Sao_Paulo, o fuso vem com o nome IANA, e não UTC;
// (e) com o perfil `--celular m`, `(pointer: coarse)` e `innerWidth === 390`.
export const servidor = 'fumaca';
export const caminho = '/';
export const ambienteDoChrome = { TZ: 'America/Sao_Paulo' };

export default async function fumaca(t) {
  const p = t.pagina;
  await p.avaliar('window.fumaca.pronto');

  // (a)
  const wasm = p.respostas.filter((r) => new URL(r.url).pathname.endsWith('.wasm'));
  const tipo = wasm.map((r) => {
    const cabecalho = Object.entries(r.headers).find(([k]) => k.toLowerCase() === 'content-type');
    return { caminho: new URL(r.url).pathname, status: r.status, contentType: cabecalho?.[1] };
  });
  t.conferir(
    '(a) .wasm em /assets/ com hash e content-type: application/wasm',
    tipo.length === 1 &&
      tipo[0].status === 200 &&
      tipo[0].contentType === 'application/wasm' &&
      /^\/assets\/tomatito_wasm_bg-[\w-]{6,}\.wasm$/.test(tipo[0].caminho),
    tipo,
  );

  // (b) Desde o W06a, o motor lê o relógio sozinho (`Date.now`, pelo
  // RelogioJs): o relógio de teste avança 60 s entre o início e a leitura.
  const b1 = await p.avaliar(`(() => {
    window.motorB = new window.fumaca.Motor();
    const r = window.motorB.comando('focus_start', { minutes: 25 });
    window.t0 = r.resultado.at;
    return {
      t0: r.resultado.at,
      status: r.resultado.status,
      restanteMs: r.resultado.session.remainingMs,
      proximoPrazo: r.proximoPrazo,
      efeitos: r.efeitos.map((e) => e.tipo),
    };
  })()`);
  await t.relogio.avancar(60_000);
  const b2 = await p.avaliar(`(() => {
    const e = window.motorB.estado().resultado.focus;
    return {
      restanteMs: e.session.remainingMs,
      decorrido: e.at - window.t0,
      novoDate: new Date().getTime() - window.t0,
    };
  })()`);
  t.conferir(
    '(b) iniciar 25 min e avançar o relógio de teste 60 s leva o restante de 1500000 para cerca de 1440000',
    b1.status === 'focus' &&
      b1.restanteMs === 1_500_000 &&
      b1.proximoPrazo === b1.t0 + 1_500_000 &&
      b1.efeitos.join() === 'state,phase' &&
      b2.decorrido >= 60_000 &&
      b2.decorrido < 65_000 &&
      b2.restanteMs === 1_500_000 - b2.decorrido &&
      b2.novoDate >= 60_000 &&
      b2.novoDate < 65_000,
    { ...b1, ...b2 },
  );

  // (c)
  const c = await p.avaliar(`(() => {
    try {
      new window.fumaca.Motor().comando('focus_pause');
      return { lancou: false };
    } catch (e) {
      return { lancou: true, erroDoJs: e instanceof Error, code: e && e.code, mensagem: String(e && e.message) };
    }
  })()`);
  t.conferir(
    "(c) pausar sem fase correndo lança { code: 'notRunning', message: 'não há fase correndo para pausar' }",
    c.lancou && !c.erroDoJs && c.code === 'notRunning' && c.mensagem === 'não há fase correndo para pausar',
    c,
  );

  // (d)
  const d = await p.avaliar(`({
    jiff: window.fumaca.fusoDoSistema(),
    intl: Intl.DateTimeFormat().resolvedOptions().timeZone,
  })`);
  t.conferir('(d) fuso com nome IANA America/Sao_Paulo (não UTC)', d.jiff === 'America/Sao_Paulo', d);

  // (e) Uma aba com o perfil `m`, pelo mesmo caminho do `--celular m`.
  const aba = await t.novaAba({ celular: 'm', caminho: '/' });
  const e = await aba.avaliar(`({
    coarse: matchMedia('(pointer: coarse)').matches,
    innerWidth,
    maxTouchPoints: navigator.maxTouchPoints,
    mobile: navigator.userAgentData?.mobile,
  })`);
  await aba.fechar();
  t.conferir(
    "(e) --celular m: matchMedia('(pointer: coarse)').matches e innerWidth === 390",
    e.coarse === true && e.innerWidth === 390,
    e,
  );
}
