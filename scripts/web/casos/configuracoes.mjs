// Caso configuracoes (PLANO-WEB, W18; PLANO-WEB-V1, W18): as Configurações
// da web e o Sobre, sobre o build (dist-web).
//
//   npm run build:web && node scripts/web/verificar.mjs configuracoes
//   node scripts/web/verificar.mjs configuracoes --celular m
//
// (a) o texto da tela (o visível e o de todo o conteúdo, inclusive o que está
//     dentro do Sobre fechado) não contém "bandeja", "Sair do Tomatito",
//     "X11" nem "Sempre na frente", e contém "Tempo na aba";
// (b) a Aparência tem 6 opções: os 4 temas, o Full (v0.3) e o Sistema;
// (c) "Ver avisos" abre o diálogo com o começo do THIRD_PARTY_NOTICES.md;
// (d) a versão no Sobre é a do Cargo.toml, e o Sobre diz "Tomatito para a
//     web", com as duas linhas da seção 7 do PLANO-WEB-V1;
// (e) o switch "Tempo na aba" grava `tomatito:web.tempoNaAba` e o título da
//     aba acompanha (com uma sessão em andamento): desligado, "Tomatito";
//     religado, "<n> min · Tomatito" de novo; e o estado sobrevive a recarregar;
// (f) sem o `beforeinstallprompt` (o de verdade é barrado por um script
//     injetado, para o caso não depender do Chrome), não há o cartão
//     "Instalar o Tomatito"; com um convite de mentira, o cartão aparece, e
//     o clique chama o `prompt()` uma vez e o cartão some;
// (g) as seções na ordem: Sessões de foco, Aparência, Avisos, Navegador e
//     Sobre; e a captura docs/capturas/web-configuracoes.png (no --celular m,
//     web-cel-configuracoes.png).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const servidor = 'preview';
export const caminho = '/#/configuracoes';

const CARGO = fileURLToPath(new URL('../../../src-tauri/Cargo.toml', import.meta.url));
const AVISOS = fileURLToPath(new URL('../../../THIRD_PARTY_NOTICES.md', import.meta.url));
const CAPTURAS = fileURLToPath(new URL('../../../docs/capturas/', import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function esperar(p, expr, ms = 8000) {
  const fim = Date.now() + ms;
  for (;;) {
    try {
      if (await p.avaliar(expr)) return true;
    } catch {
      // a página está trocando de documento
    }
    if (Date.now() > fim) return false;
    await sleep(50);
  }
}

// Barra o `beforeinstallprompt` de verdade (o do Chrome), antes do listener
// do app (este script roda antes de qualquer módulo). O convite de mentira
// do item (f) não é `isTrusted` e passa.
const BARRAR_CONVITE = `window.addEventListener('beforeinstallprompt', (e) => {
  if (e.isTrusted) { e.stopImmediatePropagation(); e.preventDefault(); }
}, true);`;

const PRONTA = `!!document.querySelector('[data-secao="navegador"] [data-tempo-aba]') && !!document.querySelector('[data-secao="avisos"]') && /\\d/.test(document.querySelector('#config-sobre-valor')?.textContent ?? '')`;
// v0.3: o Full passou a existir na web (o palco); o que é da janela do desktop continua fora.
const PROIBIDOS = ['bandeja', 'Sair do Tomatito', 'X11', 'Sempre na frente'];

async function irAsConfiguracoes(p) {
  await p.avaliar(`location.hash = '#/foco'`);
  await sleep(100);
  await p.avaliar(`location.hash = '#/configuracoes'`);
  if (!(await esperar(p, PRONTA))) throw new Error('as Configurações da web não ficaram prontas');
}

export default async function configuracoes(t) {
  const p = t.pagina;
  await p.cmd('Page.addScriptToEvaluateOnNewDocument', { source: BARRAR_CONVITE });
  await p.avaliar(`localStorage.removeItem('tomatito:web.tempoNaAba')`);
  await p.recarregar();
  if (!(await esperar(p, PRONTA))) throw new Error('as Configurações da web não ficaram prontas');

  // (a)
  const textos = await p.avaliar(`({
    visivel: document.body.innerText,
    tudo: document.querySelector('.tt-rolagem').textContent,
  })`);
  const achados = PROIBIDOS.filter((w) => textos.visivel.includes(w) || textos.tudo.includes(w));
  t.conferir(
    '(a) sem "bandeja", "Sair do Tomatito", "X11" nem "Sempre na frente"; com "Tempo na aba"',
    achados.length === 0 && textos.visivel.includes('Tempo na aba'),
    { achados, temTempoNaAba: textos.visivel.includes('Tempo na aba') },
  );

  // (b)
  const temas = await p.avaliar(`[...document.querySelectorAll('.tt-temas .tt-tema')].map((o) => [o.dataset.tema, o.textContent.trim()])`);
  t.conferir(
    '(b) a Aparência tem 6 opções (4 temas, o Full e o Sistema)',
    temas.map(([e]) => e).join() === 'lite,suave,light,dark,full,system',
    temas.map(([, n]) => n),
  );

  // (d) antes do (c), com o Sobre aberto pelo clique no cabeçalho.
  const cargo = /^version = "([^"]+)"/m.exec(readFileSync(CARGO, 'utf8'))[1];
  await p.avaliar(`document.querySelector('[data-cartao="sobre"] [data-expansor]').click()`);
  await esperar(p, `!document.querySelector('#config-sobre-conteudo').hidden`, 2000);
  const sobre = await p.avaliar(`({
    nome: document.querySelector('#config-sobre')?.textContent,
    versao: document.querySelector('#config-sobre-valor')?.textContent,
    linhas: [...document.querySelectorAll('[data-sobre-web] p')].map((x) => x.textContent),
  })`);
  t.conferir(
    '(d) a versão no Sobre é a do Cargo.toml; "Tomatito para a web" e as duas linhas da seção 7',
    sobre.versao === `Versão ${cargo}` &&
      sobre.nome === 'Tomatito para a web' &&
      sobre.linhas.join('|') ===
        'Use o Tomatito numa aba só.|Os dados ficam só neste navegador, neste aparelho. Limpar os dados do site apaga as estatísticas e as tarefas.',
    { cargo, ...sobre },
  );

  // (c)
  const comeco = readFileSync(AVISOS, 'utf8').slice(0, 300);
  await p.avaliar(`document.querySelector('[data-avisos="avisos"]').click()`);
  const abriu = await esperar(
    p,
    `(() => { const b = document.querySelector('.tt-dialogo-avisos-texto'); return !!b && b.getAttribute('aria-busy') !== 'true' && b.getBoundingClientRect().height > 0; })()`,
    8000,
  );
  const dialogo = await p.avaliar(`(() => {
    const b = document.querySelector('.tt-dialogo-avisos-texto');
    return { texto: b?.textContent.slice(0, 300) ?? null, erro: !document.querySelector('[data-erro]')?.hidden };
  })()`);
  t.conferir('(c) "Ver avisos" abre o diálogo com o começo do THIRD_PARTY_NOTICES.md', abriu && dialogo.texto === comeco && !dialogo.erro, {
    abriu,
    primeiraLinha: dialogo.texto?.split('\n')[0],
    erro: dialogo.erro,
  });
  await p.cmd('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await p.cmd('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await esperar(p, `!(document.querySelector('.tt-dialogo-avisos-texto')?.getBoundingClientRect().height > 0)`, 3000);

  // (e) Com uma sessão em andamento (a duração do preparo), iniciada pela tela Foco (o
  // build não expõe o ipc à página).
  await p.avaliar(`location.hash = '#/foco'`);
  await esperar(p, `!!document.querySelector('[data-preparo] [data-iniciar]')`);
  await p.avaliar(`document.querySelector('[data-preparo] [data-iniciar]').click()`);
  await esperar(p, `/^\\d+ min · Tomatito$/.test(document.title)`, 5000);
  await irAsConfiguracoes(p);
  const clicarSwitch = () => p.avaliar(`document.querySelector('[data-tempo-aba]').click()`);
  const lerTempo = () =>
    p.avaliar(`({
      marcado: !!document.querySelector('[data-tempo-aba]').checked,
      estado: document.querySelector('[data-cartao="tempo-aba"] [data-estado]').textContent,
      chave: localStorage.getItem('tomatito:web.tempoNaAba'),
      titulo: document.title,
    })`);
  const antes = await lerTempo();
  await clicarSwitch();
  await esperar(p, `document.title === 'Tomatito'`, 3000);
  const desligado = await lerTempo();
  await p.recarregar();
  await esperar(p, PRONTA);
  await sleep(500);
  const depoisDeRecarregar = await lerTempo();
  await clicarSwitch();
  await esperar(p, `document.title === ${JSON.stringify(antes.titulo)}`, 3000);
  const religado = await lerTempo();
  t.conferir(
    '(e) "Tempo na aba" grava a chave e o título acompanha, também depois de recarregar',
    antes.marcado && antes.estado === 'Ativado' && /^\d+ min · Tomatito$/.test(antes.titulo) &&
      !desligado.marcado && desligado.estado === 'Desativado' && desligado.chave === '0' && desligado.titulo === 'Tomatito' &&
      !depoisDeRecarregar.marcado && depoisDeRecarregar.titulo === 'Tomatito' &&
      religado.marcado && religado.chave === '1' && religado.titulo === antes.titulo,
    { antes, desligado, depoisDeRecarregar, religado },
  );
  // (f)
  const semConvite = await p.avaliar(`!document.querySelector('[data-cartao="instalar"]')`);
  const pedidos = await p.avaliar(`(async () => {
    window.__ttPedidos = 0;
    const e = new Event('beforeinstallprompt', { cancelable: true });
    e.prompt = async () => { window.__ttPedidos++; };
    e.userChoice = Promise.resolve({ outcome: 'dismissed', platform: 'web' });
    window.dispatchEvent(e);
    await new Promise((r) => setTimeout(r, 50));
    const cartao = document.querySelector('[data-cartao="instalar"]');
    return {
      apareceu: !!cartao && cartao.getBoundingClientRect().height > 0,
      titulo: cartao?.querySelector('#config-instalar')?.textContent ?? null,
      descricao: cartao?.querySelector('#config-instalar-desc')?.textContent ?? null,
      prevenido: e.defaultPrevented,
    };
  })()`);
  await p.avaliar(`document.querySelector('[data-instalar]').click()`);
  const sumiu = await esperar(p, `!document.querySelector('[data-cartao="instalar"]')`, 3000);
  const nPedidos = await p.avaliar('window.__ttPedidos');
  t.conferir(
    '(f) sem convite, sem "Instalar o Tomatito"; com o convite, o cartão aparece, e o clique chama o prompt() uma vez e o cartão some',
    semConvite && pedidos.apareceu && pedidos.titulo === 'Instalar o Tomatito' && pedidos.prevenido && nPedidos === 1 && sumiu,
    { semConvite, ...pedidos, pedidos: nPedidos, sumiu },
  );

  // (g)
  const ordem = await p.avaliar(`[...document.querySelectorAll('.tt-pagina > .tt-config-secao > h2')].map((h) => h.textContent)`);
  // Captura: o topo da Navegador em diante (a parte que é da web).
  await p.avaliar(`(async () => {
    const ab = document.querySelector('[data-cartao="sobre"][data-aberto] [data-expansor]');
    if (ab) ab.click();
    document.querySelector('[data-secao="avisos"]').scrollIntoView({ block: 'start' });
    document.activeElement?.blur?.();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  })()`);
  await sleep(300);
  const { data } = await p.cmd('Page.captureScreenshot', { format: 'png' });
  mkdirSync(CAPTURAS, { recursive: true });
  const arquivo = `${t.celular ? 'web-cel-configuracoes' : 'web-configuracoes'}.png`;
  writeFileSync(`${CAPTURAS}${arquivo}`, Buffer.from(data, 'base64'));
  t.conferir(
    `(g) seções na ordem Sessões de foco, Aparência, Avisos, Navegador, Dados e Sobre; captura ${arquivo}`,
    ordem.join('|') === 'Sessões de foco|Aparência|Avisos|Navegador|Dados|Sobre',
    ordem,
  );
}
