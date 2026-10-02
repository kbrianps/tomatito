// Caso som (PLANO-WEB, W12; PLANO-WEB-V1, W12): o som.js com o Web Audio de
// verdade, espionado.
//
//   node scripts/web/verificar.mjs som
//   node scripts/web/verificar.mjs som --celular m
//
// Espiões injetados antes do documento (sem gancho no app) em
// `AudioBufferSourceNode.prototype.start`, `AudioContext.prototype.resume` e
// `.suspend`, no construtor do `AudioContext` (para ler o `state`) e no
// `AudioNode.prototype.connect` de uma fonte a um `GainNode` (o `gain.value`
// com que cada som sai). O Chrome roda com `--mute-audio` (chrome.mjs).
//
// (a) antes de qualquer clique, nenhum contexto `running`;
// (b) depois do clique real (CDP; com `--celular m`, o toque
//     `Input.dispatchTouchEvent`) em "Iniciar", o contexto está `running`
//     (criado dentro do gesto, ele já nasce `running`, sem `resume`);
// (c) o fim do foco chama `start` uma vez;
// (d) com o som de fim de foco desligado, `start` não é chamado;
// (e) pausar e esperar 31 s reais chama `suspend` 1 vez; clicar "Retomar"
//     chama `resume` e deixa `running`; avançar até o fim do foco chama
//     `start` 1 vez;
// (f) um temporizador de 1 min iniciado fora de sessão chama `start` 1 vez
//     no fim;
// (g) "Testar" (Configurações > Sons) toca uma vez;
// (h) com volume 0, 35 e 100, o `gain.value` é 0, 0,35 e 1.
//
// Roda no servidor de desenvolvimento: a página importa o /src/lib/ipc.js,
// o mesmo módulo que o app usa, para as configurações e o temporizador.
export const servidor = 'dev';
export const caminho = '/#/foco';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MIN = 60_000;

const ESPIOES = `(() => {
  const s = (window.__ttSom = { starts: 0, resumes: 0, suspends: 0, ganhos: [], contextos: [] });
  const AC = window.AudioContext;
  window.AudioContext = class extends AC {
    constructor(...a) {
      super(...a);
      s.contextos.push(this);
    }
  };
  const start = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (...a) {
    s.starts++;
    return start.apply(this, a);
  };
  const resume = AC.prototype.resume;
  AC.prototype.resume = function (...a) {
    s.resumes++;
    return resume.apply(this, a);
  };
  const suspend = AC.prototype.suspend;
  AC.prototype.suspend = function (...a) {
    s.suspends++;
    return suspend.apply(this, a);
  };
  const connect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (destino, ...a) {
    if (this instanceof AudioBufferSourceNode && destino instanceof GainNode) s.ganhos.push(destino.gain.value);
    return connect.call(this, destino, ...a);
  };
})();`;

const SOM = `(() => { const s = window.__ttSom; return { starts: s.starts, resumes: s.resumes, suspends: s.suspends, ganhos: s.ganhos, contextos: s.contextos.length, estado: s.contextos[0]?.state ?? null }; })()`;

async function esperar(p, expr, ms = 8000) {
  const fim = Date.now() + ms;
  for (;;) {
    if (await p.avaliar(expr)) return true;
    if (Date.now() > fim) return false;
    await sleep(50);
  }
}

const ipc = (p, corpo) =>
  p.avaliar(`(async () => {
  const ipc = await import('/src/lib/ipc.js');
  ${corpo}
})()`);

const INICIAR = '[data-preparo] [data-iniciar]';
const PRINCIPAL = '.tt-andamento button[data-acao]';
const NUMERO = `document.querySelector('[data-preparo] [data-numero]')?.textContent.trim()`;
const EM_ANDAMENTO = `(() => { const a = document.querySelector('[data-andamento]'); return !!a && !a.hidden; })()`;
const visivel = (sel) => `(() => { const b = document.querySelector(${JSON.stringify(sel)}); return !!b && b.getBoundingClientRect().height > 0; })()`;

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

async function escolherMinutos(p, alvo) {
  for (let i = 0; i < 60; i++) {
    const atual = Number(await p.avaliar(NUMERO));
    if (atual === alvo) return true;
    const rotulo = atual < alvo ? 'Aumentar' : 'Diminuir';
    // Clique sintético (sem ativação): o gesto do teste é só o "Iniciar".
    await p.avaliar(`document.querySelector('[data-preparo] button[data-passo][aria-label="${rotulo}"]').click()`);
    await sleep(60);
  }
  return false;
}

/** Inicia 25 min pelo botão (clique real) e espera o andamento. */
async function iniciar(t) {
  const p = t.pagina;
  if (!(await esperar(p, visivel(INICIAR)))) throw new Error('o "Iniciar" não apareceu');
  await clicar(t, INICIAR);
  if (!(await esperar(p, EM_ANDAMENTO, 4000))) throw new Error('a sessão não começou');
}

/** Avança até o fim do foco e espera a volta ao preparo. */
async function terminar(t, ms = 25 * MIN) {
  await t.relogio.avancar(ms);
  if (!(await esperar(t.pagina, `!${EM_ANDAMENTO}`, 5000))) throw new Error('a sessão não terminou');
}

export default async function som(t) {
  const p = t.pagina;
  await p.cmd('Page.addScriptToEvaluateOnNewDocument', { source: ESPIOES });
  await p.recarregar();
  if (!(await esperar(p, visivel(INICIAR)))) throw new Error('a tela Foco não apareceu');
  // Os WAVs carregam na carga (antes de qualquer gesto).
  await esperar(
    p,
    `performance.getEntriesByType('resource').filter((e) => /\\/(focus|break)-end.*\\.wav/.test(e.name)).length >= 2`,
    5000,
  );

  // (a)
  const a = await p.avaliar(SOM);
  t.conferir('(a) antes de qualquer clique, nenhum AudioContext running', a.estado !== 'running' && a.starts === 0, a);

  // (b)
  if (!(await escolherMinutos(p, 25))) throw new Error('não chegou a 25 min');
  await iniciar(t);
  const running = await esperar(p, `window.__ttSom.contextos[0]?.state === 'running'`, 3000);
  const b = await p.avaliar(SOM);
  t.conferir(
    `(b) depois do ${t.celular ? 'toque' : 'clique'} real em "Iniciar", o contexto está running`,
    running && b.contextos === 1 && b.estado === 'running',
    b,
  );

  // (c)
  await terminar(t);
  await esperar(p, `window.__ttSom.starts >= 1`, 3000);
  await sleep(300);
  const c = await p.avaliar(SOM);
  t.conferir('(c) o fim do foco chama start uma vez', c.starts === 1, c);

  // (d)
  await ipc(p, `return await ipc.configuracoes.gravar({ sounds: { focusEnd: false } });`);
  await iniciar(t);
  await terminar(t);
  await sleep(800);
  const d = await p.avaliar(SOM);
  t.conferir('(d) com o som de fim de foco desligado, start não é chamado', d.starts === c.starts, d);
  await ipc(p, `return await ipc.configuracoes.gravar({ sounds: { focusEnd: true } });`);

  // (e)
  await iniciar(t);
  await clicar(t, PRINCIPAL);
  const pausou = await esperar(p, `document.querySelector(${JSON.stringify(PRINCIPAL)})?.getAttribute('aria-label') === 'Retomar'`, 3000);
  const e0 = await p.avaliar(SOM);
  await sleep(31_000);
  const e1 = await p.avaliar(SOM);
  await clicar(t, PRINCIPAL);
  const voltou = await esperar(p, `window.__ttSom.contextos[0]?.state === 'running'`, 3000);
  const e2 = await p.avaliar(SOM);
  await terminar(t);
  await esperar(p, `window.__ttSom.starts > ${e2.starts}`, 3000);
  await sleep(300);
  const e3 = await p.avaliar(SOM);
  t.conferir(
    '(e) pausar e esperar 31 s: suspend 1 vez; Retomar: resume e running; o fim do foco: start 1 vez',
    pausou && e0.suspends === 0 && e1.suspends === 1 && e1.estado === 'suspended' &&
      voltou && e2.resumes > e1.resumes && e3.starts === e2.starts + 1,
    { e0, e1, e2, e3 },
  );

  // (f)
  const f0 = await p.avaliar(SOM);
  const id = await ipc(
    p,
    `const { timers } = (await ipc.obterEstado()).timers;
     const um = timers.find((x) => x.durationMs === 60000);
     await ipc.temporizadores.iniciar(um.id);
     return um.id;`,
  );
  await sleep(300);
  await t.relogio.avancar(61_000);
  await esperar(p, `window.__ttSom.starts > ${f0.starts}`, 4000);
  await sleep(500);
  const f1 = await p.avaliar(SOM);
  await ipc(p, `return await ipc.temporizadores.redefinir(${id});`);
  t.conferir('(f) um temporizador de 1 min fora de sessão chama start 1 vez no fim', f1.starts === f0.starts + 1, { f0, f1 });

  // (g)
  await p.avaliar(`location.hash = '#/configuracoes'`);
  const temBotao = await esperar(p, `!!document.querySelector('[data-testar="focusEnd"]')`, 5000);
  const g0 = await p.avaliar(SOM);
  await p.avaliar(`document.querySelector('[data-testar="focusEnd"]').click()`);
  await esperar(p, `window.__ttSom.starts > ${g0.starts}`, 3000);
  await sleep(500);
  const g1 = await p.avaliar(SOM);
  t.conferir('(g) "Testar" toca uma vez', temBotao && g1.starts === g0.starts + 1, { g0, g1 });

  // (h)
  const ganhos = [];
  for (const v of [0, 35, 100]) {
    await ipc(p, `return await ipc.configuracoes.gravar({ volume: ${v} });`);
    const antes = (await p.avaliar(SOM)).ganhos.length;
    await ipc(p, `return await ipc.sons.testar('focusEnd');`);
    await esperar(p, `window.__ttSom.ganhos.length > ${antes}`, 3000);
    ganhos.push((await p.avaliar(SOM)).ganhos.at(-1));
  }
  const perto = (x, y) => typeof x === 'number' && Math.abs(x - y) < 1e-6;
  t.conferir(
    '(h) com volume 0, 35 e 100, o gain.value é 0, 0,35 e 1',
    perto(ganhos[0], 0) && perto(ganhos[1], 0.35) && perto(ganhos[2], 1),
    ganhos,
  );
}
