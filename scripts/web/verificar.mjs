#!/usr/bin/env node
// Verificação da web no Chrome headless (PLANO-WEB, seção 6, "Ferramentas de
// verificação"; PLANO-WEB-V1, seção 6; marco W01b). DevTools Protocol sem
// puppeteer, sobre o scripts/web/chrome.mjs.
//
//   node scripts/web/verificar.mjs <caso> [--servidor fumaca|preview|dev] [--celular <perfil>]
//   node scripts/web/verificar.mjs --todos [--servidor …] [--celular …]
//
// - <caso> é scripts/web/casos/<caso>.mjs. Ele exporta a função padrão
//   `async (t) => {}` e, opcionais, `servidor` (o padrão dele), `caminho`
//   (o que a aba principal abre; padrão '/') e `ambienteDoChrome` (variáveis
//   de ambiente do Chrome, como o TZ). Cada `t.conferir(...)` é um item; o
//   script imprime `ok <caso>: n/n` e sai com 0 só se todos passarem.
// - O servidor de teste é sempre próprio, na porta 4273 com strictPort (a
//   4173 fica para o uso diário, e a 5173/5174 para o desktop):
//   - `fumaca`: build da scripts/web/fumaca/ numa pasta temporária (fora do
//     repositório, apagada no fim) e `vite preview` dela;
//   - `preview`: `vite preview --config vite.web.config.js` sobre o dist-web
//     (o `npm run build:web` vem antes; o vite.web.config.js chega no W03a);
//   - `dev` (W06b): o servidor de desenvolvimento do vite.web.config.js, com
//     os módulos do src/ servidos um a um. O caso pode então fazer
//     `await import('/src/lib/ipc.js')` na página e receber o mesmo módulo
//     que o app usa, sem nenhum gancho de teste dentro do app (o caso foco
//     chama o ipc assim). W07a: com a mesma CSP do build (TOMATITO_WEB_CSP_DEV
//     no plugin-web.mjs), para os casos do dev também passarem por ela.
// - W16: `t.servidor.parar()` derruba o servidor de teste (a aba fica
//   offline) e `t.servidor.subir({ outDir })` o sobe de novo na mesma porta e
//   origem, servindo outro build (só no `preview`; o caso pwa).
// - `--celular p|m|g|paisagem|minimo|tablet` liga um perfil de celular na aba
//   principal (scripts/web/celular.mjs; PLANO-WEB-V1, seção 6).
// - Reprova qualquer caso cujo console tenha "Refused to"
//   (`Runtime.consoleAPICalled` e `Log.entryAdded`) ou uma exceção sem
//   tratamento (`Runtime.exceptionThrown`). O Chrome 153 já não escreve
//   "Refused to" nas violações de CSP ("Loading the image … violates the
//   following Content Security Policy directive … The action has been
//   blocked.", conferido no W01b), então a regra também pega "violates the
//   following Content Security Policy" e todo evento `securitypolicyviolation`
//   do documento (ouvido por um script injetado, e avisado por binding).
//
// Relógio de teste (sem nenhum código de teste dentro do app): um script
// injetado antes de cada documento (`Page.addScriptToEvaluateOnNewDocument`)
// troca o `Date.now` por `real + deslocamento` e o `new Date()` sem argumentos
// por `new Date(Date.now())`, e expõe `__ttAvancar(ms)`. O deslocamento
// acumulado volta ao Node por um binding e é reinjetado em cada documento
// novo, então sobrevive a recarregar e a reabrir; "avançar com a aba fechada"
// é `t.relogio.avancarComAbaFechada(ms)`, que soma ao deslocamento antes de
// reabrir, e `t.relogio.posicionar(instante)` leva todas as abas a um
// instante fixo (W08), seguido de uma recarga. Regra: `__ttAvancar` nunca roda com a aba oculta (a página lança
// erro, e o `t.relogio.avancar` confere antes). O `performance.now()` e os
// Workers ficam com o relógio real.
//
// No fim (normal, erro ou Ctrl+C/SIGTERM): fecha as abas, o Chrome (e apaga o
// perfil tomatito-chrome-web-*), o servidor da 4273 e a pasta temporária.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { abrirChrome } from './chrome.mjs';
import * as celular from './celular.mjs';

const RAIZ = fileURLToPath(new URL('../../', import.meta.url));
const CASOS = fileURLToPath(new URL('./casos/', import.meta.url));
const PORTA = 4273;
const BINDING = '__ttRelogioBinding';
const BINDING_CSP = '__ttCspBinding';
const RECUSA = /Refused to|violates the following Content Security Policy/;

// Ouve as violações de CSP desde o começo de cada documento (inclusive as que
// não vão para o console, como o eval e o WebAssembly sem 'wasm-unsafe-eval').
const FONTE_DO_VIGIA_DE_CSP = `document.addEventListener('securitypolicyviolation', (e) => {
  const avisar = globalThis.${BINDING_CSP};
  if (typeof avisar === 'function') {
    avisar(JSON.stringify({ diretiva: e.effectiveDirective, bloqueado: e.blockedURI, origem: e.sourceFile, linha: e.lineNumber }));
  }
}, true);`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Argumentos
// ---------------------------------------------------------------------------

function lerArgs(argv) {
  const opts = { casos: [], servidor: undefined, celular: undefined, todos: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--todos') opts.todos = true;
    else if (a === '--servidor' || a === '--celular') {
      const v = argv[++i];
      if (!v) throw new Error(`falta o valor de ${a}`);
      opts[a.slice(2)] = v;
    } else if (a.startsWith('--')) throw new Error(`opção desconhecida: ${a}`);
    else opts.casos.push(a);
  }
  if (opts.servidor && !['fumaca', 'preview', 'dev'].includes(opts.servidor)) {
    throw new Error(`--servidor inválido: ${opts.servidor} (use fumaca, preview ou dev)`);
  }
  if (opts.celular && !celular.PERFIS[opts.celular]) {
    throw new Error(`--celular inválido: ${opts.celular} (use ${Object.keys(celular.PERFIS).join(', ')})`);
  }
  if (opts.todos) {
    opts.casos = readdirSync(CASOS).filter((a) => a.endsWith('.mjs')).map((a) => basename(a, '.mjs')).sort();
  }
  if (!opts.casos.length) {
    throw new Error('uso: node scripts/web/verificar.mjs <caso>|--todos [--servidor fumaca|preview|dev] [--celular <perfil>]');
  }
  return opts;
}

// ---------------------------------------------------------------------------
// Servidor de teste na 4273
// ---------------------------------------------------------------------------

// O Vite registra um process.once('SIGTERM') (e um 'end' no stdin) que fecha o
// servidor e chama process.exit(); isso cortaria a limpeza do Chrome. Os
// ouvintes que ele acrescenta são removidos, como no scripts/preview/servidor.mjs.
async function semOuvintesDoVite(fn) {
  const antes = {
    sigterm: new Set(process.listeners('SIGTERM')),
    stdinEnd: new Set(process.stdin.listeners('end')),
  };
  try {
    return await fn();
  } finally {
    for (const l of process.listeners('SIGTERM')) if (!antes.sigterm.has(l)) process.off('SIGTERM', l);
    for (const l of process.stdin.listeners('end')) if (!antes.stdinEnd.has(l)) process.stdin.off('end', l);
  }
}

function garantirPkg() {
  const pkg = join(RAIZ, 'src/platform/web/pkg/tomatito_wasm.js');
  if (existsSync(pkg)) return;
  console.error('src/platform/web/pkg/ não existe; rodando o npm run wasm');
  const r = spawnSync(process.execPath, [join(RAIZ, 'scripts/web/wasm.mjs')], { cwd: RAIZ, stdio: 'inherit' });
  if (r.status !== 0) throw new Error('o npm run wasm falhou');
}

/**
 * Sobe o servidor de teste na 4273 e devolve a origem. O fechamento vai para
 * `limpar` e também para `servidorAtual.fechar` (W16: o caso pwa derruba o
 * servidor no meio e sobe outro build na mesma origem, com `outDir`).
 */
async function subirServidor(tipo, limpar, { outDir } = {}) {
  const vite = await import('vite');
  let config;
  if (tipo === 'dev') {
    garantirPkg();
    process.env.TOMATITO_WEB_CSP_DEV = '1';
    const servidor = await semOuvintesDoVite(async () => {
      const s = await vite.createServer({
        root: RAIZ,
        configFile: join(RAIZ, 'vite.web.config.js'),
        logLevel: 'warn',
        server: { host: 'localhost', port: PORTA, strictPort: true, open: false },
      });
      await s.listen();
      return s;
    });
    limpar.push(() => servidor.close());
    return servidor.resolvedUrls.local[0].replace(/\/$/, '');
  }
  if (tipo === 'fumaca') {
    garantirPkg();
    const base = (await import(pathToFileURL(join(RAIZ, 'scripts/web/fumaca/vite.config.js')).href)).default;
    const saida = mkdtempSync(join(tmpdir(), 'tomatito-fumaca-'));
    limpar.push(() => rmSync(saida, { recursive: true, force: true }));
    config = { ...base, build: { ...base.build, outDir: saida } };
    await semOuvintesDoVite(() => vite.build(config));
  } else {
    const arquivo = join(RAIZ, 'vite.web.config.js');
    if (!existsSync(arquivo)) throw new Error('vite.web.config.js não existe (chega no W03a)');
    if (!existsSync(join(RAIZ, 'dist-web/index.html'))) throw new Error('dist-web/ não existe; rode npm run build:web');
    const pasta = outDir ?? join(RAIZ, 'dist-web');
    if (outDir && !existsSync(join(outDir, 'index.html'))) throw new Error(`${outDir} não tem index.html`);
    config = { root: RAIZ, configFile: arquivo, logLevel: 'warn', ...(outDir ? { build: { outDir: pasta } } : {}) };
  }
  const servidor = await semOuvintesDoVite(() =>
    vite.preview({
      ...config,
      preview: { ...config.preview, host: 'localhost', port: PORTA, strictPort: true, open: false },
    }),
  );
  let fechado = false;
  const fechar = async () => {
    if (fechado) return;
    fechado = true;
    await servidor.close();
  };
  limpar.push(fechar);
  servidorAtual.fechar = fechar;
  const origem = servidor.resolvedUrls.local[0].replace(/\/$/, '');
  return origem;
}

/** O fechamento do último servidor de preview que subiu (W16). */
const servidorAtual = { fechar: async () => {} };

// ---------------------------------------------------------------------------
// Relógio de teste
// ---------------------------------------------------------------------------

function fonteDoRelogio(deslocamento) {
  return `(() => {
  if (globalThis.__ttRelogio) return;
  const DataReal = Date;
  const agoraReal = DataReal.now.bind(DataReal);
  let d = ${Number(deslocamento)};
  const agora = () => agoraReal() + d;
  const Data = new Proxy(DataReal, {
    construct(alvo, args, novo) {
      return Reflect.construct(alvo, args.length ? args : [agora()], novo === Data ? alvo : novo);
    },
    apply() {
      return new DataReal(agora()).toString();
    },
    get(alvo, prop) {
      return prop === 'now' ? agora : Reflect.get(alvo, prop, alvo);
    },
  });
  Object.defineProperty(globalThis, 'Date', { value: Data, writable: true, configurable: true });
  const oculto = (valor) => ({ value: valor, writable: false, configurable: false, enumerable: false });
  Object.defineProperty(globalThis, '__ttRelogio', oculto({
    // Usado só pelo verificar.mjs para alinhar as outras abas.
    definir(valor) { d = valor; },
    deslocamento: () => d,
  }));
  Object.defineProperty(globalThis, '__ttAvancar', oculto((ms) => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      throw new Error('__ttAvancar com a aba oculta: proibido (o relógio de teste só anda com a aba visível)');
    }
    if (!Number.isFinite(ms) || ms < 0) throw new Error('__ttAvancar: ms inválido: ' + ms);
    d += ms;
    const avisar = globalThis.${BINDING};
    if (typeof avisar === 'function') avisar(String(d));
    return d;
  }));
})();`;
}

function criarRelogio() {
  const paginas = new Set();
  let fila = Promise.resolve();
  const relogio = {
    deslocamento: 0,
    paginas,
    async registrar(pagina) {
      paginas.add(pagina);
      await pagina.cmd('Runtime.addBinding', { name: BINDING });
      const { identifier } = await pagina.cmd('Page.addScriptToEvaluateOnNewDocument', {
        source: fonteDoRelogio(relogio.deslocamento),
      });
      pagina.scriptDoRelogio = identifier;
    },
    esquecer(pagina) {
      paginas.delete(pagina);
    },
    async reinjetar(origem) {
      for (const p of paginas) {
        if (p.fechada) continue;
        await p.cmd('Page.removeScriptToEvaluateOnNewDocument', { identifier: p.scriptDoRelogio }).catch(() => {});
        const { identifier } = await p.cmd('Page.addScriptToEvaluateOnNewDocument', {
          source: fonteDoRelogio(relogio.deslocamento),
        });
        p.scriptDoRelogio = identifier;
        if (p !== origem) {
          await p
            .cmd('Runtime.evaluate', { expression: `globalThis.__ttRelogio?.definir(${relogio.deslocamento})` })
            .catch(() => {});
        }
      }
    },
    /** Chamado quando uma página roda `__ttAvancar` (pelo binding). */
    aoAvancar(pagina, valor) {
      fila = fila.then(async () => {
        relogio.deslocamento = valor;
        await relogio.reinjetar(pagina);
      });
      return fila;
    },
    /** Avança `ms` na aba (visível) `pagina`; todas as abas passam a ver o novo deslocamento. */
    async avancar(ms, pagina) {
      const visibilidade = await pagina.avaliar('document.visibilityState');
      if (visibilidade === 'hidden') throw new Error('relogio.avancar com a aba oculta: proibido');
      const esperado = relogio.deslocamento + ms;
      await pagina.avaliar(`__ttAvancar(${Number(ms)})`);
      for (let i = 0; i < 100 && relogio.deslocamento !== esperado; i++) await sleep(20);
      await fila;
      if (relogio.deslocamento !== esperado) {
        throw new Error(`relógio: esperava deslocamento ${esperado}, ficou ${relogio.deslocamento}`);
      }
      return relogio.deslocamento;
    },
    /**
     * Põe o relógio de teste em `instante` (ms de época), para trás ou para
     * a frente, em todas as abas (W08: um dia fixo, longe da virada, ou uma
     * data com horário de verão). Só com o motor sem nada correndo, e a aba
     * recarrega depois (o motor em memória nasce de novo no instante novo).
     */
    async posicionar(instante) {
      fila = fila.then(async () => {
        relogio.deslocamento = Math.round(Number(instante) - Date.now());
        await relogio.reinjetar(null);
      });
      await fila;
      return relogio.deslocamento;
    },
    /** Soma `ms` ao deslocamento sem nenhuma aba correndo (antes de reabrir). */
    async avancarComAbaFechada(ms) {
      fila = fila.then(async () => {
        relogio.deslocamento += ms;
        await relogio.reinjetar(null);
      });
      await fila;
      return relogio.deslocamento;
    },
  };
  return relogio;
}

// ---------------------------------------------------------------------------
// Abas
// ---------------------------------------------------------------------------

function formatarArg(arg) {
  if ('value' in arg) return typeof arg.value === 'string' ? arg.value : JSON.stringify(arg.value);
  return arg.description ?? arg.type;
}

function criarContexto(chrome, origem) {
  const paginas = new Map(); // sessionId → página
  const problemas = { recusas: [], excecoes: [] };
  const relogio = criarRelogio();
  const ouvintes = new Set();

  chrome.on((m) => {
    const pagina = m.sessionId && paginas.get(m.sessionId);
    if (!pagina) return;
    for (const o of ouvintes) o(pagina, m);
    const { method, params } = m;
    let texto;
    if (method === 'Runtime.consoleAPICalled') {
      texto = params.args.map(formatarArg).join(' ');
      pagina.consoles.push({ tipo: params.type, texto });
      console.error(`[console.${params.type}] ${texto}`);
    } else if (method === 'Log.entryAdded') {
      texto = params.entry.text;
      console.error(`[log.${params.entry.level}/${params.entry.source}] ${texto}${params.entry.url ? ` (${params.entry.url})` : ''}`);
    } else if (method === 'Runtime.exceptionThrown') {
      const d = params.exceptionDetails;
      const desc = d.exception?.description ?? d.text;
      console.error(`[exceção] ${desc}`);
      problemas.excecoes.push(desc);
    } else if (method === 'Runtime.bindingCalled' && params.name === BINDING) {
      relogio.aoAvancar(pagina, Number(params.payload));
    } else if (method === 'Runtime.bindingCalled' && params.name === BINDING_CSP) {
      console.error(`[securitypolicyviolation] ${params.payload}`);
      problemas.recusas.push(`securitypolicyviolation ${params.payload}`);
    } else if (method === 'BackgroundService.backgroundServiceEventReceived') {
      // W13: o registro do DevTools dos serviços em segundo plano (o caso
      // avisos liga o das notificações: "Notification displayed"/"closed").
      pagina.segundoPlano.push(params.backgroundServiceEvent);
    } else if (method === 'Network.responseReceived') {
      const r = params.response;
      pagina.respostas.push({ url: r.url, status: r.status, mimeType: r.mimeType, headers: r.headers, tipo: params.type });
    }
    if (texto && RECUSA.test(texto)) problemas.recusas.push(texto);
  });

  const esperarEvento = (pagina, metodo, ms = 30_000) =>
    new Promise((res, rej) => {
      const timer = setTimeout(() => {
        ouvintes.delete(ouvir);
        rej(new Error(`sem ${metodo} em ${ms / 1000} s`));
      }, ms);
      const ouvir = (p, m) => {
        if (p === pagina && m.method === metodo) {
          clearTimeout(timer);
          ouvintes.delete(ouvir);
          res(m.params);
        }
      };
      ouvintes.add(ouvir);
    });

  async function novaAba({ celular: nomeDoPerfil, caminho, duasAbas = false } = {}) {
    const { targetId } = await chrome.cmd('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await chrome.cmd('Target.attachToTarget', { targetId, flatten: true });
    const pagina = {
      targetId,
      sessionId,
      respostas: [],
      // Tudo o que a página escreveu no console (inclusive o console.debug),
      // como { tipo, texto }, para o caso conferir.
      consoles: [],
      // Os eventos do `BackgroundService` (W13), na ordem em que chegaram.
      segundoPlano: [],
      perfil: undefined,
      fechada: false,
      noApp: false,
      duasAbas,
      cmd: (method, params = {}) => chrome.cmd(method, params, sessionId),
      async avaliar(expression) {
        const r = await chrome.cmd('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId);
        if (r.exceptionDetails) {
          const d = r.exceptionDetails;
          throw new Error(d.exception?.description ?? d.text);
        }
        return r.result.value;
      },
      /** Navega para `caminho` (relativo à origem) e espera o load. */
      async abrir(destino = '/') {
        const url = /^[a-z]+:/.test(destino) ? destino : origem + destino;
        // v0.3: o app roda numa aba só (platform/web/aba-unica.js). Antes de
        // abri-lo aqui, as outras abas que o têm aberto vão para about:blank
        // (soltando a trava); o caso `aba-unica` pede `duasAbas` para vê-lo
        // bloquear.
        if (url.startsWith(origem) && !pagina.duasAbas) {
          for (const outra of paginas.values()) {
            if (outra !== pagina && !outra.fechada && outra.noApp) await outra.abrir('about:blank');
          }
        }
        pagina.noApp = url.startsWith(origem);
        const carregou = esperarEvento(pagina, 'Page.loadEventFired');
        const r = await pagina.cmd('Page.navigate', { url });
        if (r.errorText) throw new Error(`não abriu ${url}: ${r.errorText}`);
        await carregou;
      },
      async recarregar() {
        const carregou = esperarEvento(pagina, 'Page.loadEventFired');
        await pagina.cmd('Page.reload');
        await carregou;
      },
      async fechar() {
        if (pagina.fechada) return;
        pagina.fechada = true;
        relogio.esquecer(pagina);
        paginas.delete(sessionId);
        await chrome.cmd('Target.closeTarget', { targetId }).catch(() => {});
      },
      tocar: (seletor) => celular.tocar(pagina, seletor),
      arrastar: (seletor, dx) => celular.arrastar(pagina, seletor, dx),
      teclado: (altura) => celular.teclado(pagina, altura),
      alvos: (opcoes) => celular.alvos(pagina, opcoes),
    };
    paginas.set(sessionId, pagina);
    await pagina.cmd('Page.enable');
    await pagina.cmd('Runtime.enable');
    await pagina.cmd('Log.enable');
    await pagina.cmd('Network.enable');
    await pagina.cmd('Runtime.addBinding', { name: BINDING_CSP });
    await pagina.cmd('Page.addScriptToEvaluateOnNewDocument', { source: FONTE_DO_VIGIA_DE_CSP });
    await relogio.registrar(pagina);
    if (nomeDoPerfil) await celular.aplicarPerfil(pagina, nomeDoPerfil);
    if (caminho !== undefined) await pagina.abrir(caminho);
    return pagina;
  }

  return { novaAba, relogio, problemas, paginas };
}

// ---------------------------------------------------------------------------
// Um caso
// ---------------------------------------------------------------------------

async function rodarCaso(nome, opts, limpar) {
  const arquivo = join(CASOS, `${nome}.mjs`);
  if (!existsSync(arquivo)) throw new Error(`caso desconhecido: ${nome} (${arquivo} não existe)`);
  const mod = await import(pathToFileURL(arquivo).href);
  const tipo = opts.servidor ?? mod.servidor ?? 'preview';
  const itens = [];
  let chrome;
  try {
    const origem = await subirServidor(tipo, limpar);
    chrome = abrirChrome({ env: mod.ambienteDoChrome ?? {} });
    limpar.push(() => chrome.fechar());
    const ctx = criarContexto(chrome, origem);
    const pagina = await ctx.novaAba({ celular: opts.celular, caminho: mod.caminho ?? '/' });
    const t = {
      nome,
      origem,
      servidor: tipo,
      celular: opts.celular,
      pagina,
      relogio: {
        avancar: (ms, p = pagina) => ctx.relogio.avancar(ms, p),
        avancarComAbaFechada: (ms) => ctx.relogio.avancarComAbaFechada(ms),
        posicionar: (instante) => ctx.relogio.posicionar(instante),
        get deslocamento() {
          return ctx.relogio.deslocamento;
        },
      },
      novaAba: (o) => ctx.novaAba(o),
      /**
       * Traz `p` para a frente com `Target.activateTarget` (no nível do
       * navegador): as outras abas ficam ocultas, com o `visibilitychange`
       * real (W11).
       */
      ativarAba: (p) => chrome.cmd('Target.activateTarget', { targetId: p.targetId }),
      /**
       * Um comando do DevTools no nível do navegador, fora de qualquer aba
       * (W13: `Browser.setPermission` das notificações).
       */
      navegador: (method, params) => chrome.cmd(method, params),
      /**
       * W16 (caso pwa): derrubar o servidor de teste (a página fica
       * "offline") e subir de novo, na mesma porta e origem, servindo
       * `outDir` (outro build) ou o dist-web. Só no servidor `preview`.
       */
      servidor: {
        parar: () => servidorAtual.fechar(),
        async subir({ outDir } = {}) {
          if (tipo !== 'preview') throw new Error('t.servidor.subir só no servidor preview');
          const nova = await subirServidor(tipo, limpar, { outDir });
          if (nova !== origem) throw new Error(`o servidor voltou em outra origem: ${nova} (era ${origem})`);
        },
      },
      perfis: celular.PERFIS,
      conferir(rotulo, ok, detalhe) {
        itens.push({ rotulo, ok: !!ok, detalhe });
        const extra = detalhe === undefined ? '' : ` ${typeof detalhe === 'string' ? detalhe : JSON.stringify(detalhe)}`;
        console.log(`${ok ? 'ok   ' : 'FALHA'} ${rotulo}${extra}`);
        return !!ok;
      },
    };
    await mod.default(t);
    // Dá tempo às mensagens de console que ainda estão a caminho.
    await sleep(200);
    const passaram = itens.filter((i) => i.ok).length;
    const { recusas, excecoes } = ctx.problemas;
    const limpo = recusas.length === 0 && excecoes.length === 0;
    const ok = itens.length > 0 && passaram === itens.length && limpo;
    let motivo = '';
    if (recusas.length) motivo += ` (recusas da CSP, "Refused to" e afins: ${recusas.length})`;
    if (excecoes.length) motivo += ` (exceções sem tratamento: ${excecoes.length})`;
    console.log(`${ok ? 'ok' : 'FALHA'} ${nome}: ${passaram}/${itens.length}${motivo}`);
    return ok;
  } catch (err) {
    console.error(`erro no caso ${nome}: ${err.stack ?? err.message}`);
    console.log(`FALHA ${nome}: ${itens.filter((i) => i.ok).length}/${itens.length} (interrompido)`);
    return false;
  } finally {
    await limparTudo(limpar);
  }
}

async function limparTudo(limpar) {
  while (limpar.length) {
    const passo = limpar.pop();
    try {
      await passo();
    } catch (err) {
      console.error(`aviso na limpeza: ${err.message}`);
    }
  }
}

// ---------------------------------------------------------------------------

async function main() {
  const opts = lerArgs(process.argv.slice(2));
  const limpar = [];
  for (const stream of [process.stdout, process.stderr]) stream.on('error', () => {});
  let sinalizado = false;
  for (const [sinal, codigo] of [['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129]]) {
    process.on(sinal, () => {
      if (sinalizado) return;
      sinalizado = true;
      console.error(`${sinal} recebido; fechando o Chrome e o servidor da ${PORTA}`);
      limparTudo(limpar).finally(() => process.exit(codigo));
    });
  }
  let todosOk = true;
  for (const caso of opts.casos) {
    if (!(await rodarCaso(caso, opts, limpar))) todosOk = false;
  }
  if (opts.casos.length > 1) console.log(`${todosOk ? 'ok' : 'FALHA'} todos: ${opts.casos.join(', ')}`);
  process.exit(todosOk ? 0 : 1);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
