// Caso avisos (PLANO-WEB, W13; PLANO-WEB-V1, W13): o avisos.js e o sw.js
// no Chrome, com a permissão dada pelo DevTools (`Browser.setPermission`) e
// o relógio de teste posto às 14:02:40 de 21/09/2026 em São Paulo (o T0 dos
// testes do i18n.rs é 14:30:00), para os textos saírem iguais aos do teste.
//
//   node scripts/web/verificar.mjs avisos
//   node scripts/web/verificar.mjs avisos --celular m
//
// (a) o sw.js está ativo, na raiz (`/sw.js`, escopo `/`), e a página vê a
//     permissão `granted`;
// (b) o fim do primeiro foco de uma sessão de 60 min (iniciada pelo clique
//     real em "Iniciar", que desperta o som) faz o
//     `getNotifications({ tag: 'tomatito:fase' })` devolver 1, com o título e
//     o corpo do teste do i18n.rs ("Período de foco concluído", "Intervalo de
//     5 min. Próximo foco às 14:35.");
// (c) com o som ligado (e tocado), o aviso sai com `silent === true`;
// (d) um único `__ttAvancar` de 30 s além do prazo do intervalo, com a aba
//     visível, põe "às HH:MM" (a hora do prazo) no título: "Intervalo
//     concluído às 14:35", com o corpo de sempre;
// (e) o fim de um temporizador de 1 min: "Temporizador encerrado", "1 min",
//     na tag 'tomatito:temporizador';
// (f) com `denied`, o fim de outro temporizador não mostra nada, não lança
//     nem escreve erro no console, e fica anotado no `historico` do
//     avisos.js.
//
// Como ler os avisos sem apagá-los (correção da verificação do W13): o
// `getNotifications` do Chrome, a cada chamada, confere os avisos gravados
// com os que a central de notificações mostra, e apaga do registro os que
// ela ainda não mostra (a sincronização do Chromium; inferida do que se viu
// abaixo). Entre o `showNotification` resolver (o aviso já
// gravado) e a central o mostrar há uma janela curta, que cresce com a
// máquina ocupada; um `getNotifications` nessa janela apaga o aviso recém-
// -mostrado, e ele não volta mais na lista, embora siga na tela (visto no
// registro do DevTools: "Notification displayed" sem nenhum "closed"). O app
// nunca chama o `getNotifications`, então isto só atinge o teste. Por isso o
// caso não sonda o `getNotifications` enquanto espera: liga o registro das
// notificações do DevTools (`BackgroundService`, service 'notifications'),
// espera o "Notification displayed" da tag, dá `ASSENTAR_MS` para a central
// o mostrar e só então lê o `getNotifications`, uma vez.
//
// Roda no servidor de desenvolvimento (o plugin-web.mjs serve o sw.js do
// arquivo): a página importa o /src/lib/ipc.js para parar a sessão e mexer
// nos temporizadores, e o /src/platform/web/avisos.js para o histórico.
export const servidor = 'dev';
export const caminho = '/#/foco';
export const ambienteDoChrome = { TZ: 'America/Sao_Paulo' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 14:30:00 de 21/09/2026 em São Paulo: o T0 dos testes do i18n.rs. */
const T0 = 1_790_011_800_000;
/** O primeiro foco de 60 min dura 1650 s; começando aqui, ele acaba perto das 14:30:10. */
const INICIO = T0 - 1_650_000 + 10_000;

/** Depois do "Notification displayed", quanto esperar antes do `getNotifications`. */
const ASSENTAR_MS = 1000;
/** Quanto esperar pelo "Notification displayed". */
const ESPERA_DO_AVISO_MS = 15_000;

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
const NUMERO = `document.querySelector('[data-preparo] [data-numero]')?.textContent.trim()`;
const EM_ANDAMENTO = `(() => { const a = document.querySelector('[data-andamento]'); return !!a && !a.hidden; })()`;
const visivel = (sel) => `(() => { const b = document.querySelector(${JSON.stringify(sel)}); return !!b && b.getBoundingClientRect().height > 0; })()`;

/** Os avisos que o navegador guarda, por tag (ou todos). */
const avisos = (tag) => `(async () => {
  const reg = await navigator.serviceWorker.ready;
  const lista = await reg.getNotifications(${tag ? `{ tag: ${JSON.stringify(tag)} }` : ''});
  return lista.map((n) => ({ title: n.title, body: n.body, silent: n.silent, tag: n.tag, timestamp: n.timestamp }));
})()`;
const fecharTodos = `(async () => {
  const reg = await navigator.serviceWorker.ready;
  for (const n of await reg.getNotifications()) n.close();
  return (await reg.getNotifications()).length;
})()`;

/** Quantos "Notification displayed" o DevTools registrou para a tag. */
const exibidos = (p, tag) =>
  p.segundoPlano.filter(
    (e) => e.service === 'notifications' && e.eventName === 'Notification displayed' && e.instanceId === tag,
  ).length;

/**
 * Espera o DevTools registrar mais um aviso na tag (além dos `antes`), dá
 * `ASSENTAR_MS` e só então lê o `getNotifications` da tag, uma única vez
 * (veja o cabeçalho). Devolve `{ exibido, lista }`.
 */
async function lerAvisoNovo(p, tag, antes) {
  const fim = Date.now() + ESPERA_DO_AVISO_MS;
  let exibido = true;
  while (exibidos(p, tag) <= antes) {
    if (Date.now() > fim) {
      exibido = false;
      break;
    }
    await sleep(50);
  }
  if (exibido) await sleep(ASSENTAR_MS);
  return { exibido, lista: await p.avaliar(avisos(tag)) };
}

const hhmm = (p, instante) =>
  p.avaliar(`new Date(${instante}).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false })`);

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

/** Quanto falta, no relógio da página, até o prazo da fase atual. */
const faltaParaOPrazo = (p) =>
  ipc(p, `const s = (await ipc.obterEstado()).focus.session; return { endsAt: s.endsAt, falta: s.endsAt - Date.now() };`);

/** Inicia o temporizador de 1 min, avança 61 s e devolve o id. */
async function temporizadorDeUmMinuto(t) {
  const p = t.pagina;
  const id = await ipc(
    p,
    `const { timers } = (await ipc.obterEstado()).timers;
     const um = timers.find((x) => x.durationMs === 60000);
     await ipc.temporizadores.iniciar(um.id);
     return um.id;`,
  );
  await sleep(200);
  await t.relogio.avancar(61_000);
  return id;
}

const HISTORICO = `import('/src/platform/web/avisos.js').then((m) => m.historico)`;

export default async function casoAvisos(t) {
  const p = t.pagina;
  await p.cmd('Emulation.setTimezoneOverride', { timezoneId: 'America/Sao_Paulo' });
  await t.navegador('Browser.setPermission', {
    permission: { name: 'notifications' },
    setting: 'granted',
    origin: t.origem,
  });
  // O registro do DevTools das notificações (veja o cabeçalho).
  await p.cmd('BackgroundService.startObserving', { service: 'notifications' });
  await p.cmd('BackgroundService.setRecording', { shouldRecord: true, service: 'notifications' });
  await t.relogio.posicionar(INICIO);
  await p.recarregar();
  if (!(await esperar(p, visivel(INICIAR)))) throw new Error('a tela Foco não apareceu');

  // (a)
  const sw = await p.avaliar(`(async () => {
    const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(() => r(null), 5000))]);
    return { escopo: reg?.scope ?? null, script: reg?.active?.scriptURL ?? null, permissao: Notification.permission };
  })()`);
  t.conferir(
    '(a) o sw.js ativo na raiz (escopo /) e a permissão granted',
    sw.escopo === `${t.origem}/` && sw.script === `${t.origem}/sw.js` && sw.permissao === 'granted',
    sw,
  );

  // (b) e (c)
  if (!(await escolherMinutos(p, 60))) throw new Error('não chegou a 60 min');
  await clicar(t, INICIAR);
  if (!(await esperar(p, EM_ANDAMENTO, 4000))) throw new Error('a sessão não começou');
  await esperar(p, `import('/src/platform/web/som.js').then((m) => m.historico.length === 0)`, 1000);
  const foco = await faltaParaOPrazo(p);
  const antesDoFoco = exibidos(p, 'tomatito:fase');
  await t.relogio.avancar(foco.falta + 200);
  const { exibido: chegou, lista: b } = await lerAvisoNovo(p, 'tomatito:fase', antesDoFoco);
  t.conferir(
    '(b) o fim do foco: 1 aviso na tag tomatito:fase, com o título e o corpo do teste do i18n.rs',
    chegou && b.length === 1 &&
      b[0].title === 'Período de foco concluído' &&
      b[0].body === 'Intervalo de 5 min. Próximo foco às 14:35.' &&
      b[0].timestamp === foco.endsAt,
    { avisos: b, prazo: foco.endsAt, exibido: chegou, historico: await p.avaliar(`${HISTORICO}.then((h) => h.map(({ dados, ...r }) => r))`) },
  );
  const sons = await p.avaliar(`import('/src/platform/web/som.js').then((m) => m.historico)`);
  t.conferir(
    '(c) com o som ligado (e tocado), silent === true',
    b[0]?.silent === true && sons.some((s) => s.som === 'focusEnd' && s.tocou),
    { silent: b[0]?.silent, sons },
  );

  // (d)
  const intervalo = await faltaParaOPrazo(p);
  const antesDoIntervalo = exibidos(p, 'tomatito:fase');
  await t.relogio.avancar(intervalo.falta + 30_000);
  const hora = await hhmm(p, intervalo.endsAt);
  const titulo = `Intervalo concluído às ${hora}`;
  const { exibido: trocou, lista: d } = await lerAvisoNovo(p, 'tomatito:fase', antesDoIntervalo);
  t.conferir(
    `(d) 30 s além do prazo, com a aba visível: "${titulo}"`,
    trocou && d.length === 1 && d[0].title === titulo && hora === '14:35' && d[0].body === 'Período de foco 2 de 2, 27 min.' &&
      (await p.avaliar('document.visibilityState')) === 'visible',
    { avisos: d, prazo: intervalo.endsAt },
  );
  await ipc(p, `return await ipc.foco.parar();`);

  // (e)
  const antesDoTemporizador = exibidos(p, 'tomatito:temporizador');
  const id = await temporizadorDeUmMinuto(t);
  const { exibido: deu, lista: e } = await lerAvisoNovo(p, 'tomatito:temporizador', antesDoTemporizador);
  await ipc(p, `return await ipc.temporizadores.redefinir(${id});`);
  t.conferir(
    '(e) o fim do temporizador de 1 min: "Temporizador encerrado", "1 min"',
    deu && e.length === 1 && e[0].title === 'Temporizador encerrado' && e[0].body === '1 min',
    { avisos: e, exibido: deu },
  );

  // (f)
  await t.navegador('Browser.setPermission', {
    permission: { name: 'notifications' },
    setting: 'denied',
    origin: t.origem,
  });
  const restantes = await p.avaliar(fecharTodos);
  const errosAntes = p.consoles.filter((c) => c.tipo === 'error').length;
  const antes = (await p.avaliar(HISTORICO)).length;
  const exibidosAntes = p.segundoPlano.filter((ev) => ev.eventName === 'Notification displayed').length;
  const id2 = await temporizadorDeUmMinuto(t);
  const anotou = await esperar(
    p,
    `${HISTORICO}.then((h) => h.length > ${antes} && h.at(-1).tipo === 'timerNotice' && 'motivo' in h.at(-1))`,
    6000,
  );
  await sleep(500);
  const ultimo = (await p.avaliar(HISTORICO)).at(-1);
  const depois = await p.avaliar(avisos());
  const exibidosDepois = p.segundoPlano.filter((ev) => ev.eventName === 'Notification displayed').length;
  const errosDepois = p.consoles.filter((c) => c.tipo === 'error');
  await ipc(p, `return await ipc.temporizadores.redefinir(${id2});`);
  t.conferir(
    '(f) com denied: nenhum aviso, nenhum erro no console, e o motivo no histórico',
    restantes === 0 && anotou && depois.length === 0 && exibidosDepois === exibidosAntes &&
      ultimo.mostrado === false && ultimo.motivo === 'permissão: denied' &&
      (await p.avaliar('Notification.permission')) === 'denied' &&
      errosDepois.length === errosAntes,
    { ultimo, avisos: depois, exibidos: exibidosDepois - exibidosAntes, erros: errosDepois.slice(errosAntes) },
  );
}
