#!/usr/bin/env node
// Prévia do frontend no Chrome headless, sem Tauri e sem abrir janelas.
//
// Sobe o Vite com scripts/preview/vite.config.js (que injeta o mock do Tauri),
// abre o Chrome headless num perfil temporário, executa os passos na ordem em
// que aparecem e fecha tudo no fim.
//
//   node scripts/preview/shot.mjs [opções] [passos]
//
// Opções:
//   --size 1000x700       viewport (padrão 1000x700, o tamanho da main)
//   --scheme dark|light   prefers-color-scheme emulado (padrão dark)
//   --path /#/foco        caminho aberto (padrão /)
// Passos (repetíveis, executados em ordem):
//   --eval "expr"         avalia na página e imprime o resultado em JSON
//   --click "seletor"     clique real do mouse no centro do elemento
//   --wait 300            espera, em ms
//   --shot arquivo.png    captura a viewport
//
// Sem nenhum --shot, salva uma captura em $TMPDIR/tomatito-preview.png.
// O Chrome vem de $CHROME ou, por padrão, google-chrome.
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createServer } from 'vite';
import previewConfig from './vite.config.js';

const STEP_KINDS = ['eval', 'click', 'wait', 'shot'];

function parseArgs(argv) {
  const opts = { size: '1000x700', scheme: 'dark', path: '/' };
  const steps = [];
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, '');
    const value = argv[i + 1];
    if (value === undefined) throw new Error(`falta o valor de --${key}`);
    if (key in opts) opts[key] = value;
    else if (STEP_KINDS.includes(key)) steps.push([key, value]);
    else throw new Error(`opção desconhecida: --${key}`);
  }
  if (!steps.some(([k]) => k === 'shot')) {
    steps.push(['shot', join(tmpdir(), 'tomatito-preview.png')]);
  }
  const [width, height] = opts.size.split('x').map(Number);
  if (!width || !height) throw new Error(`--size inválido: ${opts.size}`);
  return { ...opts, width, height, steps };
}

function launchChrome(profileDir) {
  const bin = process.env.CHROME ?? 'google-chrome';
  const proc = spawn(
    bin,
    [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${profileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--hide-scrollbars',
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
  const wsUrl = new Promise((res, rej) => {
    let buf = '';
    const timer = setTimeout(() => rej(new Error('o Chrome não abriu em 20 s')), 20000);
    proc.stderr.on('data', (d) => {
      buf += d;
      const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) {
        clearTimeout(timer);
        res(m[1]);
      }
    });
    proc.on('exit', (code) => {
      clearTimeout(timer);
      rej(new Error(`o Chrome saiu com código ${code}\n${buf}`));
    });
  });
  return { proc, wsUrl };
}

function connect(url) {
  const ws = new WebSocket(url);
  const pending = new Map();
  const listeners = new Set();
  let nextId = 0;
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id !== undefined) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) p.rej(new Error(`${p.method}: ${msg.error.message}`));
      else p.res(msg.result);
    } else {
      for (const l of listeners) l(msg);
    }
  };
  const opened = new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = () => rej(new Error('falha ao conectar no DevTools'));
  });
  return {
    opened,
    send(method, params = {}) {
      return new Promise((res, rej) => {
        const id = ++nextId;
        pending.set(id, { res, rej, method });
        ws.send(JSON.stringify({ id, method, params }));
      });
    },
    on(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    once(method) {
      return new Promise((res) => {
        const off = this.on((m) => {
          if (m.method === method) {
            off();
            res(m.params);
          }
        });
      });
    },
    close: () => ws.close(),
  };
}

function formatRemote(arg) {
  if ('value' in arg) return typeof arg.value === 'string' ? arg.value : JSON.stringify(arg.value);
  return arg.description ?? arg.type;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const profileDir = mkdtempSync(join(tmpdir(), 'tomatito-chrome-'));
  let server;
  let chrome;
  let page;
  try {
    server = await createServer({ ...previewConfig, logLevel: 'warn' });
    await server.listen();
    const origin = server.resolvedUrls.local[0].replace(/\/$/, '');

    chrome = launchChrome(profileDir);
    const port = new URL(await chrome.wsUrl).port;
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const target = targets.find((t) => t.type === 'page');
    if (!target) throw new Error('o Chrome não abriu nenhuma aba');
    page = connect(target.webSocketDebuggerUrl);
    await page.opened;

    let failed = false;
    page.on((m) => {
      if (m.method === 'Runtime.consoleAPICalled') {
        const text = m.params.args.map(formatRemote).join(' ');
        console.error(`[console.${m.params.type}] ${text}`);
      } else if (m.method === 'Runtime.exceptionThrown') {
        failed = true;
        const d = m.params.exceptionDetails;
        console.error(`[exceção] ${d.exception?.description ?? d.text}`);
      }
    });

    const evaluate = async (expression) => {
      const r = await page.send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
      });
      if (r.exceptionDetails) {
        const d = r.exceptionDetails;
        throw new Error(d.exception?.description ?? d.text);
      }
      return r.result.value;
    };
    const settle = () =>
      evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))');

    await page.send('Page.enable');
    await page.send('Runtime.enable');
    await page.send('Emulation.setDeviceMetricsOverride', {
      width: opts.width,
      height: opts.height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await page.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-color-scheme', value: opts.scheme }],
    });
    const loaded = page.once('Page.loadEventFired');
    await page.send('Page.navigate', { url: origin + opts.path });
    await loaded;
    await evaluate('document.fonts.ready');
    await settle();

    for (const [kind, value] of opts.steps) {
      if (kind === 'wait') {
        await new Promise((r) => setTimeout(r, Number(value)));
      } else if (kind === 'eval') {
        console.log(`${value} => ${JSON.stringify(await evaluate(value))}`);
      } else if (kind === 'click') {
        const sel = JSON.stringify(value);
        const pt = await evaluate(`(() => {
          const el = document.querySelector(${sel});
          if (!el) throw new Error('elemento não encontrado: ' + ${sel});
          el.scrollIntoView({ block: 'center' });
          const r = el.getBoundingClientRect();
          return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        })()`);
        for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
          await page.send('Input.dispatchMouseEvent', {
            type,
            x: pt.x,
            y: pt.y,
            button: 'left',
            clickCount: 1,
          });
        }
        await settle();
        console.log(`clique em ${value} (${Math.round(pt.x)}, ${Math.round(pt.y)})`);
      } else if (kind === 'shot') {
        const { data } = await page.send('Page.captureScreenshot', { format: 'png' });
        const file = resolve(value);
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, Buffer.from(data, 'base64'));
        console.log(`captura: ${file}`);
      }
    }
    if (failed) process.exitCode = 1;
  } finally {
    page?.close();
    if (chrome) {
      const exited = new Promise((r) => chrome.proc.once('exit', r));
      chrome.proc.kill('SIGTERM');
      await Promise.race([exited, new Promise((r) => setTimeout(r, 3000))]);
      if (chrome.proc.exitCode === null) chrome.proc.kill('SIGKILL');
    }
    await server?.close();
    rmSync(profileDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
