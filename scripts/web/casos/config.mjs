// Caso config (PLANO-WEB, W07a; PLANO-WEB-V1, W07a): as configurações pelo
// motor em wasm, o boot sem clarão, o theme-color, o data-forma e a CSP.
//
//   npm run build:web && node scripts/web/verificar.mjs config
//
// Roda no servidor de desenvolvimento (`--servidor dev`), com a CSP do build
// ligada pelo verificar.mjs, para chamar o /src/lib/ipc.js do app nos itens
// que não passam pela tela ((d) e (e)). O dist-web (item (h)) é lido do disco.
//
// (a) o theme-color fica #A5342B, #F6ECE9, #F3F3F3 e #202020 ao escolher
//     Lite, Suave, Claro e Escuro nas Configurações;
// (b) depois de escolher Escuro e recarregar, um script injetado lê
//     data-theme="dark" (e o theme-color do Escuro) já no DOMContentLoaded,
//     e o tomatito:config guardou o tema;
// (c) com o sistema indo a escuro e voltando a claro (Emulation), o console
//     não tem "reaplicado" (a janela nasce com o tema do boot);
// (d) um patch fora do limite, tirado do teste do settings.rs do desktop
//     ({ dailyGoalMinutes: 60, resetHour: 24 }), é recusado com o mesmo code
//     (invalidValue) e nada muda;
// (e) um patch válido volta normalizado, sai no tt://settings e fica depois de
//     recarregar;
// (f) o console não tem "[provisório] settings_";
// (g) com --celular m (perfil m), data-forma="celular" já no DOMContentLoaded;
//     a 1000×700, sem o atributo; e a consulta desliga e liga ao mudar a
//     largura;
// (h) o dist-web/index.html tem a <meta http-equiv="Content-Security-Policy">
//     e a viewport com viewport-fit=cover e interactive-widget=resizes-content;
//     e a página do teste rodou com a CSP.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const servidor = 'dev';
export const caminho = '/#/configuracoes';

const DIST = fileURLToPath(new URL('../../../dist-web/index.html', import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Espera `expr` (avaliada na página) ficar verdadeira, até `ms`. */
async function esperar(p, expr, ms = 8000) {
  const fim = Date.now() + ms;
  for (;;) {
    if (await p.avaliar(expr)) return true;
    if (Date.now() > fim) return false;
    await sleep(50);
  }
}

// Guarda, no DOMContentLoaded de cada documento, o que o boot deixou no <html>.
const NO_DCL = `document.addEventListener('DOMContentLoaded', () => {
  const h = document.documentElement;
  window.__ttNoDCL = {
    tema: h.dataset.theme ?? null,
    pref: h.dataset.themePref ?? null,
    forma: h.dataset.forma ?? null,
    casca: h.dataset.casca ?? null,
    cor: document.querySelector('meta[name="theme-color"]')?.content ?? null,
  };
});`;

const ipc = (p, corpo) =>
  p.avaliar(`(async () => {
  const ipc = await import('/src/lib/ipc.js');
  ${corpo}
})()`);

const COR = { lite: '#A5342B', suave: '#F6ECE9', light: '#F3F3F3', dark: '#202020' };

async function escolherTema(p, tema) {
  await p.avaliar(`document.querySelector('.tt-tema[data-tema="${tema}"] .tt-previa-moldura').click()`);
  return esperar(
    p,
    `document.documentElement.dataset.theme === '${tema}' && document.querySelector('meta[name="theme-color"]')?.content === '${COR[tema]}'`,
    4000,
  );
}

export default async function config(t) {
  const p = t.pagina;
  await p.cmd('Page.addScriptToEvaluateOnNewDocument', { source: NO_DCL });
  const pronto = await esperar(p, `!!document.querySelector('.tt-tema[data-tema="dark"] fluent-radio')`);
  if (!pronto) throw new Error('a tela Configurações não apareceu');

  // (a)
  const cores = {};
  for (const tema of ['lite', 'suave', 'light', 'dark']) {
    await escolherTema(p, tema);
    await sleep(200);
    cores[tema] = await p.avaliar(`document.querySelector('meta[name="theme-color"]')?.content ?? null`);
  }
  t.conferir(
    '(a) theme-color #A5342B, #F6ECE9, #F3F3F3 e #202020 nos 4 temas',
    Object.entries(COR).every(([tema, cor]) => cores[tema] === cor),
    cores,
  );

  // (b) O sistema fica claro (o contrário do escolhido) para o clarão aparecer
  // se o boot errasse.
  await p.cmd('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
  await sleep(300);
  const antesDeRecarregar = p.consoles.length;
  await p.recarregar();
  await esperar(p, `!!window.__ttNoDCL && !!document.querySelector('.tt-tema')`);
  const dcl = await p.avaliar('window.__ttNoDCL');
  const salvo = await p.avaliar(`JSON.parse(localStorage.getItem('tomatito:config'))?.theme ?? null`);
  t.conferir(
    '(b) depois de Escuro e recarregar, data-theme="dark" já no DOMContentLoaded',
    dcl?.tema === 'dark' && dcl?.pref === 'dark' && dcl?.cor === COR.dark && dcl?.casca === 'web' && salvo === 'dark',
    { noDCL: dcl, salvo },
  );

  // (c) A conferência do boot roda depois do primeiro quadro, e cada mudança
  // do sistema agenda outra (150 ms depois).
  await sleep(1500);
  await p.cmd('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
  await sleep(800);
  await p.cmd('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
  await sleep(800);
  const reaplicados = p.consoles.slice(antesDeRecarregar).filter((c) => /reaplicado/.test(c.texto)).map((c) => c.texto);
  const temaDepois = await p.avaliar('document.documentElement.dataset.theme');
  t.conferir('(c) sem "reaplicado" no console, com o sistema mudando', reaplicados.length === 0 && temaDepois === 'dark', {
    reaplicados,
    temaDepois,
  });

  // (d)
  const d = await ipc(
    p,
    `const antes = await ipc.configuracoes.obter();
  let erro = null;
  try { await ipc.configuracoes.gravar({ dailyGoalMinutes: 60, resetHour: 24 }); } catch (e) { erro = e; }
  const depois = await ipc.configuracoes.obter();
  return { erro, antes: [antes.dailyGoalMinutes, antes.resetHour], depois: [depois.dailyGoalMinutes, depois.resetHour],
    salvo: JSON.parse(localStorage.getItem('tomatito:config')).dailyGoalMinutes };`,
  );
  t.conferir(
    '(d) { dailyGoalMinutes: 60, resetHour: 24 } recusado com code invalidValue, e nada muda',
    d.erro?.code === 'invalidValue' && typeof d.erro?.message === 'string' && d.antes.join() === d.depois.join() && d.salvo === d.antes[0],
    d,
  );

  // (e)
  const e = await ipc(
    p,
    `const eventos = [];
  const desligar = await ipc.ouvir(ipc.EVENTOS.configuracoes, (s) => eventos.push(s.breakMinutes));
  const s = await ipc.configuracoes.gravar({ breakMinutes: 10, sounds: { breakEnd: false } });
  await new Promise((r) => setTimeout(r, 100));
  desligar();
  const estado = await ipc.obterEstado();
  return { devolvido: [s.breakMinutes, s.sounds.breakEnd, s.theme, s.schemaVersion], eventos, doEstado: estado.settings.breakMinutes };`,
  );
  await p.recarregar();
  await esperar(p, `!!document.querySelector('.tt-tema')`);
  const eDepois = await ipc(p, `const s = await ipc.configuracoes.obter(); return [s.breakMinutes, s.sounds.breakEnd];`);
  t.conferir(
    '(e) patch válido normalizado, no tt://settings e depois de recarregar',
    e.devolvido.join() === '10,false,dark,1' && e.eventos.join() === '10' && e.doEstado === 10 && eDepois.join() === '10,false',
    { ...e, depoisDeRecarregar: eDepois },
  );
  // Volta aos padrões de intervalo para não deixar nada no caminho de outros casos.
  await ipc(p, `await ipc.configuracoes.gravar({ breakMinutes: 5, sounds: { breakEnd: true } }); return true;`);

  // (f)
  const provisorios = p.consoles.filter((c) => c.texto.startsWith('[provisório] settings_')).map((c) => c.texto);
  t.conferir('(f) o console não tem "[provisório] settings_"', provisorios.length === 0, { provisorios: [...new Set(provisorios)] });

  // (g) Abas novas: o perfil (e o script do DCL) antes de navegar.
  const celular = await t.novaAba({ celular: 'm' });
  await celular.cmd('Page.addScriptToEvaluateOnNewDocument', { source: NO_DCL });
  await celular.abrir('/#/foco');
  await esperar(celular, '!!window.__ttNoDCL');
  const noCelular = await celular.avaliar('window.__ttNoDCL');
  const mesa = await t.novaAba();
  await mesa.cmd('Emulation.setDeviceMetricsOverride', { width: 1000, height: 700, deviceScaleFactor: 1, mobile: false });
  await mesa.cmd('Page.addScriptToEvaluateOnNewDocument', { source: NO_DCL });
  await mesa.abrir('/#/foco');
  await esperar(mesa, '!!window.__ttNoDCL');
  const naMesa = await mesa.avaliar('window.__ttNoDCL');
  // A consulta muda com a largura: 390 liga, 1000 desliga de novo.
  await mesa.cmd('Emulation.setDeviceMetricsOverride', { width: 390, height: 700, deviceScaleFactor: 1, mobile: false });
  const ligou = await esperar(mesa, `document.documentElement.dataset.forma === 'celular'`, 3000);
  await mesa.cmd('Emulation.setDeviceMetricsOverride', { width: 1000, height: 700, deviceScaleFactor: 1, mobile: false });
  const desligou = await esperar(mesa, `document.documentElement.dataset.forma === undefined`, 3000);
  t.conferir(
    '(g) perfil m: data-forma="celular" no DOMContentLoaded; 1000×700: sem o atributo; e acompanha a largura',
    noCelular?.forma === 'celular' && naMesa && naMesa.forma === null && ligou && desligou,
    { perfilM: noCelular?.forma, mesa1000x700: naMesa?.forma, ligouA390: ligou, desligouA1000: desligou },
  );
  await celular.fechar();
  await mesa.fechar();

  // (h)
  let dist = null;
  if (existsSync(DIST)) {
    const html = readFileSync(DIST, 'utf8');
    dist = {
      csp: /<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'wasm-unsafe-eval' 'sha256-[A-Za-z0-9+/=]+'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'" \/>/.test(html),
      viewport: /<meta name="viewport" content="[^"]*viewport-fit=cover[^"]*interactive-widget=resizes-content[^"]*" \/>/.test(html),
    };
  }
  // v0.3: a primeira aba cedeu a vez às outras (uma aba só); volta ao app.
  await p.abrir('/#/foco');
  const cspNaPagina = await p.avaliar(`document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content ?? null`);
  t.conferir(
    '(h) dist-web/index.html com a CSP e a viewport da 5.1; a página rodou com a CSP',
    dist?.csp && dist?.viewport && /wasm-unsafe-eval/.test(cspNaPagina ?? ''),
    { dist: dist ?? 'dist-web/index.html não existe (rode npm run build:web)', cspNaPagina },
  );
}
