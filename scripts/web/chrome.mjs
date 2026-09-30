// Chrome headless para os testes da web (PLANO-WEB, 1.1 e seção 6; marco
// W01b). Cópia das funções de subir e fechar o Chrome do
// scripts/preview/shot.mjs, que fica como está, com uma diferença: aqui o
// DevTools Protocol vai só pelo --remote-debugging-pipe (sessões "flatten"),
// sem nenhuma porta de depuração aberta.
//
// O pipe serve de cordão: se o Node morrer de qualquer jeito (até SIGKILL), o
// Chrome vê o fim do pipe e fecha sozinho. No fim normal, `fechar()` pede
// Browser.close pelo pipe, espera o Chrome sair e espera também todos os
// processos que citam o perfil (inclusive o chrome_crashpad_handler, que sai
// do grupo de processos); os que sobrarem recebem SIGTERM e SIGKILL. Só então
// o perfil temporário é apagado, com novas tentativas.
//
// Os perfis se chamam tomatito-chrome-web-*, dentro da família
// tomatito-chrome-* que o shot.mjs varre: a próxima execução de qualquer um
// dos dois apaga os perfis parados há mais de 2 min e sem processo.
//
// O Chrome vem de $TOMATITO_CHROME, depois $CHROME, e por fim google-chrome.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const PREFIXO_DO_PERFIL = 'tomatito-chrome-web-';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// PIDs cuja linha de comando cita o perfil (Chrome, filhos e crashpad handler).
export function pidsUsing(dir) {
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

/** Apaga os perfis tomatito-chrome-* parados há mais de 2 min e sem processo. */
export function sweepStaleProfiles() {
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

/**
 * Sobe o Chrome headless num perfil temporário e devolve:
 * - `cmd(method, params, sessionId)`: um comando do DevTools, que resolve com
 *   o `result` ou rejeita com o erro (prazo de 30 s);
 * - `on(fn)`: ouve os eventos (`{ method, params, sessionId }`); devolve a
 *   função que para de ouvir;
 * - `fechar()`: encerra tudo e apaga o perfil (nunca rejeita; falhas viram aviso);
 * - `perfil`: a pasta do perfil.
 *
 * `env` acrescenta variáveis ao ambiente do Chrome (o caso fumaça passa o TZ).
 */
export function abrirChrome({ env = {}, args = [] } = {}) {
  sweepStaleProfiles();
  const perfil = mkdtempSync(join(tmpdir(), PREFIXO_DO_PERFIL));
  // O Chrome cria pastas próprias no TMPDIR (o socket de instância única e as
  // baixas do atualizador, /tmp/com.google.Chrome.*) e no headless não as apaga.
  // Com o TMPDIR dentro do perfil, elas somem junto com ele.
  const tmpDoChrome = join(perfil, 'tmp');
  mkdirSync(tmpDoChrome);
  const bin = process.env.TOMATITO_CHROME ?? process.env.CHROME ?? 'google-chrome';
  const proc = spawn(
    bin,
    [
      '--headless=new',
      '--remote-debugging-pipe',
      `--user-data-dir=${perfil}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--hide-scrollbars',
      // W12: os casos tocam sons de verdade (Web Audio); nada sai na saída
      // de áudio da sessão de quem roda.
      '--mute-audio',
      ...args,
      'about:blank',
    ],
    // fd 3: comandos para o Chrome; fd 4: respostas e eventos (--remote-debugging-pipe).
    { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'], env: { ...process.env, TMPDIR: tmpDoChrome, ...env } },
  );
  const saiu = new Promise((res) => proc.once('exit', res));
  const vivo = () => proc.exitCode === null && proc.signalCode === null;
  const [, , stderr, paraChrome, doChrome] = proc.stdio;
  paraChrome.on('error', () => {}); // o Chrome pode sair antes de ler
  let ultimoStderr = '';
  stderr.on('data', (d) => {
    ultimoStderr = (ultimoStderr + d).slice(-4000);
  });

  let proximo = 0;
  let buf = '';
  const pendentes = new Map();
  const ouvintes = new Set();
  doChrome.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\0')) >= 0) {
      const msg = JSON.parse(buf.slice(0, i));
      buf = buf.slice(i + 1);
      if (msg.id !== undefined) {
        const p = pendentes.get(msg.id);
        if (!p) continue;
        pendentes.delete(msg.id);
        clearTimeout(p.timer);
        if (msg.error) p.rej(new Error(`${p.method}: ${msg.error.message}`));
        else p.res(msg.result);
      } else {
        for (const l of ouvintes) l(msg);
      }
    }
  });
  proc.once('exit', (code, sinal) => {
    for (const [, p] of pendentes) {
      clearTimeout(p.timer);
      p.rej(new Error(`o Chrome saiu (${sinal ?? code}) antes de responder a ${p.method}\n${ultimoStderr}`));
    }
    pendentes.clear();
  });

  const cmd = (method, params = {}, sessionId) =>
    new Promise((res, rej) => {
      if (!vivo()) {
        rej(new Error(`o Chrome já saiu; ${method} não foi enviado\n${ultimoStderr}`));
        return;
      }
      const id = ++proximo;
      const timer = setTimeout(() => {
        pendentes.delete(id);
        rej(new Error(`sem resposta do Chrome em 30 s: ${method}`));
      }, 30_000);
      pendentes.set(id, { res, rej, method, timer });
      paraChrome.write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + '\0');
    });

  const on = (fn) => {
    ouvintes.add(fn);
    return () => ouvintes.delete(fn);
  };

  let fechando;
  const fechar = () =>
    (fechando ??= (async () => {
      if (vivo()) {
        // Pedido educado pelo pipe; fechar o pipe logo depois também encerra o Chrome.
        paraChrome.write(JSON.stringify({ id: ++proximo, method: 'Browser.close' }) + '\0');
        paraChrome.end();
        await Promise.race([saiu, sleep(5000)]);
      }
      if (vivo()) proc.kill('SIGTERM');
      // Filhos e o chrome_crashpad_handler ainda podem estar gravando no perfil.
      const acabou = () => !vivo() && pidsUsing(perfil).length === 0;
      let limpo = false;
      for (const [signal, ms] of [[null, 5000], ['SIGTERM', 3000], ['SIGKILL', 3000]]) {
        if (signal) {
          if (vivo()) proc.kill(signal);
          signalAll(pidsUsing(perfil), signal);
        }
        if (await waitUntil(acabou, ms)) {
          limpo = true;
          break;
        }
      }
      if (!limpo) console.error(`aviso: processos do Chrome ainda usam ${perfil}: ${pidsUsing(perfil).join(', ')}`);
      await removeProfile(perfil);
    })());

  return { cmd, on, fechar, perfil, proc };
}
