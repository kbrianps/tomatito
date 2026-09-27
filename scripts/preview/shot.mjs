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
//   --motion reduce       prefers-reduced-motion emulado (padrão: sem preferência)
//   --scrollbars classic  barras de rolagem clássicas, que ocupam espaço, como
//                         no WebView2 do Windows (padrão: hidden, sem barras)
//   --path /#/foco        caminho aberto (padrão /)
// Passos (repetíveis, executados em ordem):
//   --eval "expr"         avalia na página e imprime o resultado em JSON
//   --click "seletor"     clique real do mouse no centro do elemento
//   --hover "seletor"     move o mouse para o centro do elemento (:hover)
//   --press "seletor"     aperta o botão do mouse no centro, sem soltar (:active)
//   --key "Control+1"     aperta e solta uma tecla, com modificadores (Control,
//                         Shift, Alt, Meta) separados por "+": Tab, Enter,
//                         Escape, Space, ArrowUp/Down/Left/Right, Home, End, 0-9,
//                         a-z e "Comma" (a vírgula)
//   --ax "seletor"        papel, nome e estados que o Chrome expõe na árvore de
//                         acessibilidade para cada elemento do seletor
//   --fonts "seletor"     fontes da plataforma usadas no texto do elemento
//                         (CSS.getPlatformFontsForNode), com o nº de glifos
//   --resize 480x500@1.5  muda a viewport no meio da prévia (M10); o "@1.5",
//                         opcional, simula o zoom do app (Ctrl +): a página
//                         passa a ter 480/1,5 × 500/1,5 px CSS, desenhados com
//                         densidade 1,5, que é o que o zoom do WebView faz com
//                         o layout
//   --wait 300            espera, em ms
//   --shot arquivo.png    captura a viewport
//
// Sem nenhum --shot, salva uma captura em $TMPDIR/tomatito-preview.png.
// O Chrome vem de $CHROME ou, por padrão, google-chrome.
//
// Encerramento: além da porta, o Chrome recebe --remote-debugging-pipe. O pipe
// serve de cordão: se o Node morrer de qualquer jeito (até SIGKILL), o Chrome
// vê o fim do pipe e fecha sozinho. No fim normal, ou num Ctrl+C ou SIGTERM, o
// Node pede Browser.close pelo pipe, espera o Chrome sair e espera também
// todos os processos que citam o perfil (inclusive o chrome_crashpad_handler,
// que sai do grupo de processos); os que sobrarem recebem SIGTERM e SIGKILL.
// Só então o perfil temporário é apagado, com novas tentativas. Uma falha na
// limpeza vira aviso e não muda o código de saída. Se o Node morrer com
// SIGKILL, o Chrome fecha pelo pipe, mas a pasta fica; a próxima execução
// apaga os perfis tomatito-chrome-* parados há mais de 2 min e sem processo.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { startPreviewServer } from './servidor.mjs';

const STEP_KINDS = ['eval', 'click', 'hover', 'press', 'key', 'ax', 'fonts', 'resize', 'wait', 'shot'];

/** "480x500" ou "480x500@1.5" → { width, height, zoom }. */
function lerTamanho(texto) {
  const m = /^(\d+)x(\d+)(?:@(\d+(?:\.\d+)?))?$/.exec(texto);
  if (!m || !Number(m[1]) || !Number(m[2])) throw new Error(`tamanho inválido: ${texto} (use 480x500 ou 480x500@1.5)`);
  const zoom = m[3] ? Number(m[3]) : 1;
  if (!(zoom > 0)) throw new Error(`zoom inválido: ${texto}`);
  return { width: Number(m[1]), height: Number(m[2]), zoom };
}

function parseArgs(argv) {
  const opts = { size: '1000x700', scheme: 'dark', motion: '', path: '/', scrollbars: 'hidden' };
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
  if (!['hidden', 'classic'].includes(opts.scrollbars)) throw new Error(`--scrollbars inválido: ${opts.scrollbars}`);
  return { ...opts, width, height, steps };
}

function launchChrome(profileDir, scrollbars) {
  const bin = process.env.CHROME ?? 'google-chrome';
  const proc = spawn(
    bin,
    [
      '--headless=new',
      '--remote-debugging-port=0',
      '--remote-debugging-pipe',
      `--user-data-dir=${profileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      ...(scrollbars === 'hidden' ? ['--hide-scrollbars'] : []),
      'about:blank',
    ],
    // fd 3: comandos para o Chrome; fd 4: respostas (--remote-debugging-pipe).
    { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] },
  );
  const exited = new Promise((res) => proc.once('exit', res));
  const [, , , toChrome, fromChrome] = proc.stdio;
  toChrome.on('error', () => {}); // o Chrome pode sair antes de ler
  fromChrome.resume(); // as respostas do pipe não interessam; só não podem encher o buffer
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
  return { proc, wsUrl, exited, toChrome };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Teclas do --key: o que o Input.dispatchKeyEvent do DevTools precisa (key,
// code e o código virtual do Windows, que o Chrome usa para Tab e setas).
const TECLAS = {
  Tab: ['Tab', 'Tab', 9],
  Enter: ['Enter', 'Enter', 13, '\r'],
  Escape: ['Escape', 'Escape', 27],
  Space: [' ', 'Space', 32, ' '],
  ArrowUp: ['ArrowUp', 'ArrowUp', 38],
  ArrowDown: ['ArrowDown', 'ArrowDown', 40],
  ArrowLeft: ['ArrowLeft', 'ArrowLeft', 37],
  ArrowRight: ['ArrowRight', 'ArrowRight', 39],
  Home: ['Home', 'Home', 36],
  End: ['End', 'End', 35],
  Comma: [',', 'Comma', 188, ','],
};
const MODIFICADORES = {
  Alt: [1, 'Alt', 'AltLeft', 18],
  Control: [2, 'Control', 'ControlLeft', 17],
  Meta: [4, 'Meta', 'MetaLeft', 91],
  Shift: [8, 'Shift', 'ShiftLeft', 16],
};
function tecla(nome) {
  if (TECLAS[nome]) return TECLAS[nome];
  if (/^[0-9]$/.test(nome)) return [nome, `Digit${nome}`, nome.charCodeAt(0), nome];
  if (/^[a-z]$/.test(nome)) return [nome, `Key${nome.toUpperCase()}`, nome.toUpperCase().charCodeAt(0), nome];
  throw new Error(`tecla desconhecida no --key: ${nome}`);
}

const alive = (chrome) => chrome.proc.exitCode === null && chrome.proc.signalCode === null;

// PIDs cuja linha de comando cita o perfil (Chrome, filhos e crashpad handler).
function pidsUsing(dir) {
  if (!existsSync('/proc')) return [];
  const pids = [];
  for (const name of readdirSync('/proc')) {
    if (!/^\d+$/.test(name) || Number(name) === process.pid) continue;
    try {
      if (readFileSync(`/proc/${name}/cmdline`, 'utf8').includes(dir)) pids.push(Number(name));
    } catch {
      // o processo saiu entre o readdir e a leitura
    }
  }
  return pids;
}

async function waitUntil(done, ms) {
  const limit = Date.now() + ms;
  while (!done()) {
    if (Date.now() > limit) return false;
    await sleep(50);
  }
  return true;
}

function signalAll(pids, signal) {
  for (const pid of pids) {
    try {
      process.kill(pid, signal);
    } catch {
      // já saiu
    }
  }
}

async function stopChrome(chrome, profileDir) {
  if (alive(chrome)) {
    // Pedido educado pelo pipe; fechar o pipe logo depois também encerra o Chrome.
    chrome.toChrome.write(JSON.stringify({ id: 1, method: 'Browser.close' }) + '\0');
    chrome.toChrome.end();
    await Promise.race([chrome.exited, sleep(5000)]);
  }
  if (alive(chrome)) chrome.proc.kill('SIGTERM');
  // Filhos e o chrome_crashpad_handler ainda podem estar gravando no perfil.
  const gone = () => !alive(chrome) && pidsUsing(profileDir).length === 0;
  for (const [signal, ms] of [[null, 5000], ['SIGTERM', 3000], ['SIGKILL', 3000]]) {
    if (signal) {
      if (alive(chrome)) chrome.proc.kill(signal);
      signalAll(pidsUsing(profileDir), signal);
    }
    if (await waitUntil(gone, ms)) return;
  }
  throw new Error(`processos do Chrome ainda usam ${profileDir}: ${pidsUsing(profileDir).join(', ')}`);
}

function sweepStaleProfiles() {
  const base = tmpdir();
  const limit = Date.now() - 2 * 60_000;
  for (const name of readdirSync(base)) {
    if (!name.startsWith('tomatito-chrome-')) continue;
    const dir = join(base, name);
    try {
      if (statSync(dir).mtimeMs > limit || pidsUsing(dir).length > 0) continue;
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      console.error(`perfil antigo apagado: ${dir}`);
    } catch {
      // outra execução pode estar apagando a mesma pasta
    }
  }
}

async function removeProfile(dir) {
  let last;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      if (!existsSync(dir)) return;
    } catch (err) {
      last = err;
    }
    await sleep(250 * attempt);
  }
  console.error(`aviso: o perfil temporário do Chrome ficou em ${dir} (${last?.code ?? 'motivo desconhecido'})`);
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
  sweepStaleProfiles();
  const profileDir = mkdtempSync(join(tmpdir(), 'tomatito-chrome-'));
  let server;
  let chrome;
  let page;
  // Limpeza única, chamada no fim normal, em erro ou num sinal (Ctrl+C, timeout,
  // kill). Um sinal mandado só ao Node não chega ao Chrome; sem isto, o Chrome
  // só fecharia pelo pipe e o perfil ficaria. A limpeza nunca derruba a
  // captura: cada etapa só avisa.
  let cleaning;
  const cleanup = () =>
    (cleaning ??= (async () => {
      page?.close();
      if (chrome) await stopChrome(chrome, profileDir).catch((err) => console.error(`aviso: ${err.message}`));
      await server?.close().catch((err) => console.error(`aviso: ${err.message}`));
      await removeProfile(profileDir);
    })());
  // Com o terminal ou o pipe fechado, escrever no stdout/stderr dá EPIPE; isso
  // não pode interromper a limpeza.
  for (const stream of [process.stdout, process.stderr]) stream.on('error', () => {});
  // `on`, e não `once`: o `timeout` manda o sinal ao filho e de novo ao grupo, e um
  // segundo SIGTERM sem ouvinte mataria o Node no meio da limpeza. A limpeza tem
  // prazo (uns 15 s no pior caso), então os sinais repetidos só esperam por ela.
  let signaled = false;
  for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129]]) {
    process.on(signal, () => {
      if (signaled) return;
      signaled = true;
      console.error(`${signal} recebido; fechando o Chrome e o Vite`);
      cleanup().finally(() => process.exit(code));
    });
  }
  try {
    let origin;
    ({ server, origin } = await startPreviewServer());

    chrome = launchChrome(profileDir, opts.scrollbars);
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
      features: [
        { name: 'prefers-color-scheme', value: opts.scheme },
        { name: 'prefers-reduced-motion', value: opts.motion },
      ],
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
      } else if (kind === 'click' || kind === 'hover' || kind === 'press') {
        const sel = JSON.stringify(value);
        const pt = await evaluate(`(() => {
          const el = document.querySelector(${sel});
          if (!el) throw new Error('elemento não encontrado: ' + ${sel});
          el.scrollIntoView({ block: 'center' });
          const r = el.getBoundingClientRect();
          return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        })()`);
        const types = { click: ['mouseMoved', 'mousePressed', 'mouseReleased'], hover: ['mouseMoved'], press: ['mouseMoved', 'mousePressed'] }[kind];
        for (const type of types) {
          await page.send('Input.dispatchMouseEvent', {
            type,
            x: pt.x,
            y: pt.y,
            button: type === 'mouseMoved' ? 'none' : 'left',
            buttons: type === 'mousePressed' ? 1 : 0,
            clickCount: type === 'mouseMoved' ? 0 : 1,
          });
        }
        await settle();
        const verbo = { click: 'clique em', hover: 'mouse sobre', press: 'botão apertado em' }[kind];
        console.log(`${verbo} ${value} (${Math.round(pt.x)}, ${Math.round(pt.y)})`);
      } else if (kind === 'key') {
        const partes = value.split('+');
        const [key, code, vk, text] = tecla(partes.pop());
        const mods = partes.map((m) => {
          if (!MODIFICADORES[m]) throw new Error(`modificador desconhecido no --key: ${m}`);
          return MODIFICADORES[m];
        });
        let modifiers = 0;
        for (const [bit, mKey, mCode, mVk] of mods) {
          modifiers |= bit;
          await page.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: mKey, code: mCode, windowsVirtualKeyCode: mVk, modifiers });
        }
        // Com Ctrl, Alt ou Meta, a tecla não gera texto (é um atalho).
        const comTexto = text !== undefined && !(modifiers & 7);
        const base = { key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers };
        await page.send('Input.dispatchKeyEvent', { type: comTexto ? 'keyDown' : 'rawKeyDown', ...base, ...(comTexto ? { text, unmodifiedText: text } : {}) });
        await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
        for (const [bit, mKey, mCode, mVk] of mods.reverse()) {
          modifiers &= ~bit;
          await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: mKey, code: mCode, windowsVirtualKeyCode: mVk, modifiers });
        }
        await settle();
        console.log(`tecla ${value}`);
      } else if (kind === 'ax') {
        await page.send('DOM.enable');
        await page.send('Accessibility.enable');
        const { root } = await page.send('DOM.getDocument', { depth: 0 });
        const { nodeIds } = await page.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: value });
        if (!nodeIds.length) throw new Error(`elemento não encontrado: ${value}`);
        for (const nodeId of nodeIds) {
          const { nodes } = await page.send('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false });
          const n = nodes[0] ?? {};
          const props = (n.properties ?? [])
            .filter((p) => p.value?.value !== undefined && p.value.value !== false)
            .map((p) => `${p.name}=${JSON.stringify(p.value.value)}`)
            .join(' ');
          console.log(`ax ${value}: ${n.role?.value ?? '?'} "${n.name?.value ?? ''}"${props ? ` ${props}` : ''}`);
        }
      } else if (kind === 'fonts') {
        await page.send('DOM.enable');
        await page.send('CSS.enable');
        const { root } = await page.send('DOM.getDocument', { depth: 0 });
        const { nodeId } = await page.send('DOM.querySelector', { nodeId: root.nodeId, selector: value });
        if (!nodeId) throw new Error(`elemento não encontrado: ${value}`);
        const { fonts } = await page.send('CSS.getPlatformFontsForNode', { nodeId });
        const desc = fonts
          .map((f) => `${f.familyName}${f.isCustomFont ? ' (web font)' : ' (do sistema)'}: ${f.glyphCount} glifos`)
          .join('; ');
        console.log(`fontes em ${value}: ${desc || 'nenhuma (o elemento não tem texto próprio)'}`);
      } else if (kind === 'resize') {
        const { width, height, zoom } = lerTamanho(value);
        await page.send('Emulation.setDeviceMetricsOverride', {
          width: Math.round(width / zoom),
          height: Math.round(height / zoom),
          deviceScaleFactor: zoom,
          mobile: false,
        });
        await settle();
        console.log(`viewport ${value}`);
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
    await cleanup();
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
