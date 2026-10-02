#!/usr/bin/env node
// Invariante da bateria do desktop (PLANO-WEB-V1, 3.3, item 3): a prévia do
// DESKTOP (a mesma do shot.mjs, com o mock do Tauri) aberta como um celular
// (390 × 844, toque emulado, UA do Chrome Android) nunca liga o layout de
// celular. Confere:
//   a) a emulação pegou: `(pointer: coarse)` e `innerWidth === 390`;
//   b) `document.documentElement.dataset.forma === undefined`;
//   c) a `.tt-nav` está visível;
//   d) nenhuma `.tt-barra-inferior` visível.
//
//   node scripts/web/desktop-sem-celular.mjs [--raiz <checkout>]
//
// Com --raiz, a prévia sobe a partir do outro checkout (o W26 roda a bateria
// contra a `main`). A porta vem de TT_PREVIEW_PORT, como no shot.mjs. O Chrome
// fala só pelo --remote-debugging-pipe (sem porta de depuração aberta); o
// pipe serve de cordão: se o Node morrer, o Chrome fecha sozinho. No fim, o
// Chrome recebe Browser.close, os processos que citam o perfil são esperados
// (e mortos, se sobrarem) e o perfil temporário é apagado.
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const iRaiz = args.indexOf('--raiz');
const raiz = resolve(iRaiz >= 0 ? args[iRaiz + 1] : fileURLToPath(new URL('../..', import.meta.url)));
const { startPreviewServer } = await import(pathToFileURL(join(raiz, 'scripts/preview/servidor.mjs')).href);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA =
  'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Mobile Safari/537.36';

function pidsDoPerfil(perfil) {
  try {
    return execFileSync('pgrep', ['-f', perfil], { encoding: 'utf8' }).split('\n').filter(Boolean).map(Number)
      .filter((p) => p !== process.pid);
  } catch {
    return [];
  }
}

function abrirChrome(perfil) {
  const proc = spawn(
    process.env.CHROME ?? 'google-chrome',
    ['--headless=new', '--remote-debugging-pipe', `--user-data-dir=${perfil}`, '--no-first-run',
      '--no-default-browser-check', '--hide-scrollbars', 'about:blank'],
    { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] },
  );
  const saiu = new Promise((r) => proc.once('exit', r));
  const [, , , paraChrome, doChrome] = proc.stdio;
  paraChrome.on('error', () => {});
  let id = 0;
  let buf = '';
  const pendentes = new Map();
  doChrome.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\0')) >= 0) {
      const m = JSON.parse(buf.slice(0, i));
      buf = buf.slice(i + 1);
      if (m.id && pendentes.has(m.id)) {
        pendentes.get(m.id)(m);
        pendentes.delete(m.id);
      }
    }
  });
  const cmd = (method, params = {}, sessionId) =>
    new Promise((res, rej) => {
      const n = ++id;
      const t = setTimeout(() => rej(new Error(`sem resposta do Chrome: ${method}`)), 20000);
      pendentes.set(n, (m) => {
        clearTimeout(t);
        if (m.error) rej(new Error(`${method}: ${m.error.message}`));
        else res(m.result);
      });
      paraChrome.write(JSON.stringify({ id: n, method, params, sessionId }) + '\0');
    });
  return { proc, saiu, cmd };
}

const perfil = mkdtempSync(join(tmpdir(), 'tomatito-chrome-dsc-'));
let server;
let chrome;
let codigo = 1;
try {
  let origin;
  ({ server, origin } = await startPreviewServer());
  chrome = abrirChrome(perfil);
  const { cmd } = chrome;
  const { targetId } = await cmd('Target.createTarget', { url: 'about:blank' });
  const { sessionId: s } = await cmd('Target.attachToTarget', { targetId, flatten: true });
  const avaliar = async (expression) => {
    const r = await cmd('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, s);
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  await cmd('Emulation.setDeviceMetricsOverride', {
    width: 390, height: 844, deviceScaleFactor: 3, mobile: true,
    screenOrientation: { type: 'portraitPrimary', angle: 0 },
  }, s);
  await cmd('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }, s);
  await cmd('Emulation.setUserAgentOverride', {
    userAgent: UA,
    userAgentMetadata: { platform: 'Android', platformVersion: '15', architecture: '', model: 'Pixel 8', mobile: true },
  }, s);
  await cmd('Page.enable', {}, s);
  await cmd('Page.navigate', { url: `${origin}/#/foco` }, s);
  let pronto = false;
  for (let i = 0; i < 150 && !pronto; i++) {
    await sleep(200);
    pronto = await avaliar("document.readyState === 'complete' && !!document.querySelector('.tt-nav a')").catch(() => false);
  }
  if (!pronto) throw new Error('a prévia não montou a navegação em 30 s');
  await avaliar('document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))');
  const r = await avaliar(`(() => {
    const visivel = (el) => {
      const b = el.getBoundingClientRect();
      const c = getComputedStyle(el);
      return b.width > 0 && b.height > 0 && c.visibility !== 'hidden' && c.display !== 'none';
    };
    const nav = document.querySelector('.tt-nav');
    return {
      coarse: matchMedia('(pointer: coarse)').matches,
      largura: innerWidth,
      forma: document.documentElement.dataset.forma,
      navVisivel: !!nav && visivel(nav),
      barras: [...document.querySelectorAll('.tt-barra-inferior')].filter(visivel).length,
    };
  })()`);
  const conferencias = [
    ['emulação de celular (pointer: coarse)', r.coarse === true],
    ['innerWidth === 390', r.largura === 390],
    ['sem data-forma no <html>', r.forma === undefined],
    ['.tt-nav visível', r.navVisivel === true],
    ['nenhuma .tt-barra-inferior visível', r.barras === 0],
  ];
  for (const [nome, ok] of conferencias) console.log(`${ok ? 'ok   ' : 'FALHA'} ${nome}`);
  const passaram = conferencias.filter(([, ok]) => ok).length;
  console.log(`${passaram === conferencias.length ? 'ok' : 'FALHA'} desktop-sem-celular: ${passaram}/${conferencias.length} ${JSON.stringify(r)}`);
  codigo = passaram === conferencias.length ? 0 : 1;
} catch (err) {
  console.error(`erro: ${err.message}`);
  codigo = 1;
} finally {
  if (chrome) {
    await Promise.race([chrome.cmd('Browser.close').catch(() => {}), sleep(3000)]);
    await Promise.race([chrome.saiu, sleep(5000)]);
    if (chrome.proc.exitCode === null && chrome.proc.signalCode === null) chrome.proc.kill('SIGKILL');
  }
  for (let i = 0; i < 25 && pidsDoPerfil(perfil).length; i++) await sleep(200);
  for (const sinal of ['SIGTERM', 'SIGKILL']) {
    for (const p of pidsDoPerfil(perfil)) try { process.kill(p, sinal); } catch {}
    if (pidsDoPerfil(perfil).length) await sleep(500);
  }
  try {
    rmSync(perfil, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch (err) {
    console.error(`aviso: perfil não apagado: ${perfil} (${err.message})`);
  }
  if (server) await server.close().catch(() => {});
}
process.exit(codigo);
