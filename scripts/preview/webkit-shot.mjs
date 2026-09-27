#!/usr/bin/env node
// Prévia no WebKitGTK real (o motor do app no Linux), sem abrir janela.
//
// Sobe o Vite com scripts/preview/vite.config.js (o mesmo mock do Tauri do
// shot.mjs) e chama o webkit-shot.py, que carrega a página numa
// Gtk.OffscreenWindow e tira a captura com webkit_web_view_get_snapshot.
// Precisa do python3-gi e do gir1.2-webkit2-4.1 (a mesma WebKitGTK do app).
//
//   node scripts/preview/webkit-shot.mjs [opções] [passos]
//
// Opções:
//   --size 1000x700       viewport (padrão 1000x700, o tamanho da main)
//   --scheme dark|light   gtk-application-prefer-dark-theme (padrão dark)
//   --motion reduce       gtk-enable-animations desligado, que o WebKitGTK
//                         repassa como prefers-reduced-motion: reduce
//   --path /#/foco        caminho aberto (padrão /)
// Passos (repetíveis, executados em ordem):
//   --eval "expr"         avalia na página (promessas são esperadas) e imprime o JSON
//   --wait 300            espera, em ms
//   --shot arquivo.png    captura a viewport
//
// Sem nenhum --shot, salva uma captura em $TMPDIR/tomatito-webkit.png.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startPreviewServer } from './servidor.mjs';

const STEP_KINDS = ['eval', 'wait', 'shot'];
const HELPER = fileURLToPath(new URL('./webkit-shot.py', import.meta.url));

function parseArgs(argv) {
  const opts = { size: '1000x700', scheme: 'dark', motion: '', path: '/' };
  const steps = [];
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, '');
    const value = argv[i + 1];
    if (value === undefined) throw new Error(`falta o valor de --${key}`);
    if (key in opts) opts[key] = value;
    else if (STEP_KINDS.includes(key)) steps.push([key, key === 'shot' ? resolve(value) : value]);
    else throw new Error(`opção desconhecida: --${key}`);
  }
  if (!steps.some(([k]) => k === 'shot')) steps.push(['shot', join(tmpdir(), 'tomatito-webkit.png')]);
  for (const [k, v] of steps) if (k === 'shot') mkdirSync(dirname(v), { recursive: true });
  const [width, height] = opts.size.split('x').map(Number);
  if (!width || !height) throw new Error(`--size inválido: ${opts.size}`);
  return { ...opts, width, height, steps };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const { server, origin } = await startPreviewServer();
  let child;
  let stopping;
  const stop = () =>
    (stopping ??= (async () => {
      if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
      await server.close().catch((err) => console.error(`aviso: ${err.message}`));
    })());
  // `on`, e não `once`: um segundo sinal (o `timeout` manda ao filho e ao grupo)
  // não pode matar o Node antes de ele encerrar o python e o Vite.
  let signaled = false;
  for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129]]) {
    process.on(signal, () => {
      if (signaled) return;
      signaled = true;
      stop().finally(() => process.exit(code));
    });
  }
  try {
    const cfg = {
      url: origin + opts.path,
      width: opts.width,
      height: opts.height,
      scheme: opts.scheme,
      motion: opts.motion,
      steps: opts.steps,
    };
    child = spawn('python3', [HELPER, JSON.stringify(cfg)], { stdio: 'inherit' });
    const code = await new Promise((res) => child.once('exit', (c, s) => res(c ?? (s ? 1 : 0))));
    process.exitCode = code;
  } finally {
    await stop();
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
