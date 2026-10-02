// Caso pwa (PLANO-WEB, W16; PLANO-WEB-V1, W16 e 4.2): instalável e offline,
// e a atualização sem recarregar com uma fase correndo.
//
//   npm run build:web && node scripts/web/verificar.mjs pwa
//
// Sobre o dist-web pelo vite preview da 4273:
// (a) `Page.getAppManifest` sem erros (o manifest.webmanifest da raiz, com o
//     nome, a base e os 3 ícones) e `Page.getInstallabilityErrors` vazio;
// (b) o dist-web/sw.js não cita `index.html` (a página entra como `./`) e o
//     SW fica ativo com 1 cache `tomatito-<versão>-<hash8>`, com a lista
//     inteira do precache guardada;
// (c) com o servidor derrubado, recarregar mostra o Foco (a página vem do
//     SW), e o motor responde: "Iniciar" começa a sessão, e o relógio de
//     teste a faz andar;
// (d) com a fase correndo, um segundo build (`TOMATITO_WEB_BUILD=teste2 npm
//     run build:web`, numa pasta temporária, para não mexer no dist-web) sobe
//     na mesma origem; o `update()` deixa um SW em `waiting`, e a página não
//     recarrega (a marca em window continua, e a sessão também);
// (e) nas Configurações, o cartão "Atualizar" aparece com o botão
//     desabilitado enquanto a fase corre; depois de encerrar a sessão, nada
//     recarrega sozinho e o botão fica habilitado;
// (f) o clique em "Atualizar" põe o SW novo ativo (o sw.js do teste2), a
//     página recarrega uma vez, e `caches.keys()` devolve 1 cache, com nome
//     diferente do anterior (o do sw.js do segundo build).
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const servidor = 'preview';
export const caminho = '/#/foco';

const RAIZ = fileURLToPath(new URL('../../../', import.meta.url));
const SW_DO_DIST = fileURLToPath(new URL('../../../dist-web/sw.js', import.meta.url));
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Espera `expr` (avaliada na página) ficar verdadeira, até `ms`; tolera a página recarregando. */
async function esperar(p, expr, ms = 8000) {
  const fim = Date.now() + ms;
  for (;;) {
    try {
      if (await p.avaliar(expr)) return true;
    } catch {
      // a página está trocando de documento
    }
    if (Date.now() > fim) return false;
    await sleep(100);
  }
}

/** A lista e o nome do cache de um sw.js do build. */
function lerSw(arquivo) {
  const texto = readFileSync(arquivo, 'utf8');
  const precache = JSON.parse(/^const PRECACHE = (\[.*\]);$/m.exec(texto)?.[1] ?? 'null');
  const cache = JSON.parse(/^const CACHE = (".*");$/m.exec(texto)?.[1] ?? 'null');
  return { texto, precache, cache };
}

const INICIAR = '[data-preparo] [data-iniciar]';
const EM_ANDAMENTO = `(() => { const a = document.querySelector('[data-andamento]'); return !!a && !a.hidden; })()`;
const visivel = (sel) => `(() => { const b = document.querySelector(${JSON.stringify(sel)}); return !!b && b.getBoundingClientRect().height > 0; })()`;
const BOTAO = '[data-cartao="atualizar"] [data-atualizar]';

/** Clique de verdade (CDP): mouse, ou toque no perfil de celular. */
async function clicar(t, seletor) {
  const p = t.pagina;
  if (t.celular) return p.tocar(seletor);
  const r = await p.avaliar(`(() => {
    const e = document.querySelector(${JSON.stringify(seletor)});
    e.scrollIntoView({ block: 'center' });
    const b = e.getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  })()`);
  const base = { x: r.x, y: r.y, button: 'left', clickCount: 1 };
  await p.cmd('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y });
  await p.cmd('Input.dispatchMouseEvent', { type: 'mousePressed', ...base });
  await p.cmd('Input.dispatchMouseEvent', { type: 'mouseReleased', ...base });
  return r;
}

const estadoDoSw = `(async () => {
  const reg = await navigator.serviceWorker.getRegistration();
  const nomes = await caches.keys();
  const guardados = nomes.length === 1 ? (await (await caches.open(nomes[0])).keys()).length : -1;
  return {
    ativo: reg?.active?.state ?? null,
    esperando: reg?.waiting?.state ?? null,
    escopo: reg?.scope ?? null,
    controlador: navigator.serviceWorker.controller?.scriptURL ?? null,
    nomes,
    guardados,
  };
})()`;

export default async function pwa(t) {
  const p = t.pagina;
  const primeiro = lerSw(SW_DO_DIST);
  if (!Array.isArray(primeiro.precache) || !primeiro.cache) throw new Error('dist-web/sw.js sem a lista ou o nome do cache (rode npm run build:web)');
  if (!(await esperar(p, visivel(INICIAR)))) throw new Error('a tela Foco não apareceu');

  // (a) manifest e instalação.
  const man = await p.cmd('Page.getAppManifest');
  let dados = null;
  try {
    dados = JSON.parse(man.data ?? 'null');
  } catch {
    // fica null
  }
  t.conferir(
    '(a) Page.getAppManifest sem erros, com o manifest da raiz',
    man.errors?.length === 0 &&
      man.url === `${t.origem}/manifest.webmanifest` &&
      dados?.name === 'Tomatito' &&
      dados?.start_url === '/' &&
      dados?.scope === '/' &&
      dados?.display === 'standalone' &&
      dados?.icons?.length === 3,
    { url: man.url, erros: man.errors, icones: dados?.icons?.map((i) => `${i.sizes} ${i.purpose}`) },
  );
  // (b) o SW ativo, com o precache inteiro (antes de medir a instalação,
  // para o resultado não depender da ordem).
  const ativo = await esperar(
    p,
    `${estadoDoSw}.then((e) => e.ativo === 'activated' && e.nomes.length === 1 && e.guardados === ${primeiro.precache.length})`,
    20_000,
  );
  const antes = await p.avaliar(estadoDoSw);
  const instalacao = await p.cmd('Page.getInstallabilityErrors');
  t.conferir('(a) Page.getInstallabilityErrors vazio', instalacao.installabilityErrors?.length === 0, instalacao.installabilityErrors);
  t.conferir(
    "(b) dist-web/sw.js sem 'index.html', com './' na lista; SW ativo com 1 cache e o precache inteiro",
    ativo &&
      !primeiro.texto.includes('index.html') &&
      primeiro.precache.includes('./') &&
      antes.escopo === `${t.origem}/` &&
      antes.nomes[0] === primeiro.cache &&
      /^tomatito-\d+\.\d+\.\d+-[0-9a-f]{8}$/.test(primeiro.cache),
    { ...antes, esperado: primeiro.cache, lista: primeiro.precache.length },
  );

  // (c) offline.
  await t.servidor.parar();
  const foraDoAr = await fetch(`${t.origem}/`).then(
    () => false,
    () => true,
  );
  await p.recarregar();
  const focoOffline = await esperar(p, visivel(INICIAR), 15_000);
  const controlada = await p.avaliar('navigator.serviceWorker.controller?.scriptURL ?? null');
  t.conferir('(c) servidor fora do ar: recarregar mostra o Foco, servido pelo SW', foraDoAr && focoOffline && controlada === `${t.origem}/sw.js`, {
    foraDoAr,
    focoOffline,
    controlada,
  });
  await clicar(t, INICIAR);
  const comecou = await esperar(p, EM_ANDAMENTO, 5000);
  const numero = `document.querySelector('[data-andamento] [data-minutos]')?.textContent.trim()`;
  const n0 = await p.avaliar(numero);
  await t.relogio.avancar(3 * 60_000);
  await sleep(1500);
  const n1 = await p.avaliar(numero);
  t.conferir('(c) offline, o motor responde: Iniciar começa a sessão e ela anda', comecou && n0 && n1 && n0 !== n1, { comecou, n0, n1 });

  // (d) segundo build, com a fase correndo.
  const pasta = mkdtempSync(join(tmpdir(), 'tomatito-pwa-'));
  try {
    const r = spawnSync(NPM, ['run', 'build:web', '--', '--outDir', pasta, '--emptyOutDir'], {
      cwd: RAIZ,
      env: { ...process.env, TOMATITO_WEB_BUILD: 'teste2' },
      encoding: 'utf8',
    });
    if (r.status !== 0) throw new Error(`o segundo build falhou:\n${r.stdout}\n${r.stderr}`);
    const segundo = lerSw(join(pasta, 'sw.js'));
    await t.servidor.subir({ outDir: pasta });
    await p.avaliar('window.__ttMarcaPwa = 1');
    await p.avaliar('navigator.serviceWorker.getRegistration().then((r) => r.update()).then(() => true)');
    const esperando = await esperar(p, `${estadoDoSw}.then((e) => e.esperando === 'installed')`, 20_000);
    await sleep(1500);
    const semRecarga = await p.avaliar('window.__ttMarcaPwa === 1');
    const aindaCorre = await p.avaliar(EM_ANDAMENTO);
    const durante = await p.avaliar(estadoDoSw);
    t.conferir(
      '(d) segundo build: SW novo em waiting, sem recarregar e com a sessão correndo',
      esperando && semRecarga && aindaCorre && durante.nomes.includes(primeiro.cache) && segundo.cache !== primeiro.cache,
      { esperando, semRecarga, aindaCorre, nomes: durante.nomes, novo: segundo.cache },
    );

    // (e) o cartão, desabilitado com a fase correndo; habilitado depois de encerrar.
    await p.avaliar(`location.hash = '#/configuracoes'`);
    const cartao = await esperar(p, visivel(BOTAO), 8000);
    const desabilitado = await p.avaliar(`document.querySelector(${JSON.stringify(BOTAO)}).disabled`);
    const texto = await p.avaliar(`document.querySelector('[data-cartao="atualizar"]').textContent`);
    t.conferir(
      '(e) Configurações: cartão Atualizar com o botão desabilitado durante a fase',
      cartao && desabilitado && /Nova versão disponível/.test(texto) && /encerre a sessão/.test(texto),
      { cartao, desabilitado, texto },
    );
    await p.avaliar(`location.hash = '#/foco'`);
    await esperar(p, EM_ANDAMENTO, 5000);
    await p.avaliar(`document.querySelector('fluent-menu-item[data-item="parar"]').dispatchEvent(new Event('change', { bubbles: true }))`);
    const parou = await esperar(p, `!${EM_ANDAMENTO}`, 5000);
    await p.avaliar(`location.hash = '#/configuracoes'`);
    const habilitado = await esperar(p, `(() => { const b = document.querySelector(${JSON.stringify(BOTAO)}); return !!b && !b.disabled; })()`, 5000);
    await sleep(1500);
    const aindaSemRecarga = await p.avaliar('window.__ttMarcaPwa === 1');
    const aindaEsperando = (await p.avaliar(estadoDoSw)).esperando === 'installed';
    t.conferir('(e) sessão encerrada: nada recarrega sozinho, e o botão fica habilitado', parou && habilitado && aindaSemRecarga && aindaEsperando, {
      parou,
      habilitado,
      aindaSemRecarga,
      aindaEsperando,
    });

    // (f) Atualizar.
    await clicar(t, BOTAO);
    const recarregou = await esperar(p, `document.readyState === 'complete' && window.__ttMarcaPwa === undefined`, 15_000);
    const novo = await esperar(
      p,
      `${estadoDoSw}.then((e) => e.ativo === 'activated' && !e.esperando && e.nomes.length === 1 && e.nomes[0] === ${JSON.stringify(segundo.cache)})`,
      15_000,
    );
    const depois = await p.avaliar(estadoDoSw);
    const swAtivo = await p.avaliar(`fetch('/sw.js', { cache: 'no-store' }).then((r) => r.text())`);
    const semCartao = await esperar(p, `!document.querySelector('[data-cartao="atualizar"]')`, 5000);
    t.conferir(
      '(f) Atualizar: SW novo ativo, uma recarga, 1 cache com nome diferente do anterior e sem o cartão',
      recarregou && novo && depois.nomes[0] !== primeiro.cache && swAtivo.includes('const BUILD = "teste2";') && semCartao,
      { recarregou, novo, antes: primeiro.cache, depois: depois.nomes, semCartao },
    );
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
}
