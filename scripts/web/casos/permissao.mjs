// Caso permissao (PLANO-WEB, W14; PLANO-WEB-V1, W14): o InfoBar do pedido de
// avisos na tela Foco e a seção Avisos das Configurações, no Chrome.
//
//   node scripts/web/verificar.mjs permissao
//   node scripts/web/verificar.mjs permissao --celular m
//
// Um espião em `Notification.requestPermission` (script injetado antes de
// cada documento, que conta e chama o original) conta os pedidos.
//
// (a) ao carregar a Foco com a permissão em `default`: 0 pedidos;
// (b) o clique real em "Iniciar sessão de foco": a sessão começa na hora, o
//     InfoBar aparece logo abaixo de "A seguir:" com o título e os dois
//     botões, e continua 0 pedidos;
// (c) o clique real em "Permitir avisos": 1 pedido; o InfoBar some (ou vira
//     "Avisos bloqueados…" se o navegador recusar);
// (d) de novo em `default`: "Agora não" some com o InfoBar, grava
//     `tomatito:web.avisoDispensado` e não pede nada;
// (e) recarregar e iniciar de novo: nenhum InfoBar e 0 pedidos;
// (f) sem `Notification` (apagado por script injetado): nenhum InfoBar;
// (g) a seção Avisos das Configurações nos 4 estados (default, granted,
//     denied, sem-suporte), com o texto do plano, o botão certo e a captura
//     de cada um em docs/capturas/web-avisos-<estado>.png (no --celular m,
//     web-cel-avisos-<estado>.png);
// (h) o cartão acompanha a permissão mudada pelo navegador (sem recarregar);
// (i) "Permitir avisos" nas Configurações faz 1 pedido; "Testar aviso", com
//     `granted`, mostra 1 aviso na tag tomatito:teste;
// (j) nenhuma exceção e nenhum erro no console.
//
// Roda no servidor de desenvolvimento (a página importa o /src/lib/ipc.js
// para encerrar a sessão entre os passos).
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const servidor = 'dev';
export const caminho = '/#/foco';

const CAPTURAS = fileURLToPath(new URL('../../../docs/capturas/', import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function esperar(p, expr, ms = 8000) {
  const fim = Date.now() + ms;
  for (;;) {
    if (await p.avaliar(expr)) return true;
    if (Date.now() > fim) return false;
    await sleep(50);
  }
}

const ESPIAO = `(() => {
  window.__ttPedidos = 0;
  const N = window.Notification;
  if (!N || typeof N.requestPermission !== 'function') return;
  const original = N.requestPermission.bind(N);
  N.requestPermission = function (...args) {
    window.__ttPedidos++;
    return original(...args);
  };
})();`;
const SEM_NOTIFICACAO = 'delete window.Notification;';

const INICIAR = '[data-preparo] [data-iniciar]';
const INFOBAR = '[data-cartao="sessao"] .tt-infobar';
const EM_ANDAMENTO = `(() => { const a = document.querySelector('[data-andamento]'); return !!a && !a.hidden; })()`;
const visivel = (sel) => `(() => { const b = document.querySelector(${JSON.stringify(sel)}); return !!b && b.getBoundingClientRect().height > 0; })()`;
const PEDIDOS = 'window.__ttPedidos';
const CARTAO = '[data-cartao="notificacoes"]';

/** Clique de verdade (CDP): mouse, ou toque no perfil de celular. */
async function clicar(t, seletor, p = t.pagina) {
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

const permissao = (t, setting) =>
  t.navegador('Browser.setPermission', { permission: { name: 'notifications' }, setting, origin: t.origem });

async function pararSessao(p) {
  await p.avaliar(`(async () => {
    const ipc = await import('/src/lib/ipc.js');
    const e = await ipc.obterEstado();
    if (e.focus?.session && e.focus.status !== 'completed') await ipc.foco.parar();
  })()`);
}

/** Vai à rota `hash` e recarrega (o `abrir` só com o hash não dispara o load). */
async function ir(p, hash) {
  await p.avaliar(`location.hash = ${JSON.stringify(hash)}`);
  await p.recarregar();
}

/** Abre a Foco de novo (recarrega) e espera o "Iniciar". */
async function focoDeNovo(p) {
  await ir(p, '#/foco');
  if (!(await esperar(p, visivel(INICIAR)))) throw new Error('a tela Foco não apareceu');
}

/** O InfoBar: onde está e o que diz. */
const INFO = `(() => {
  const b = document.querySelector(${JSON.stringify(INFOBAR)});
  if (!b) return null;
  const rodape = document.querySelector('[data-cartao="sessao"] [data-andamento] [data-rodape]');
  return {
    modo: b.dataset.pedidoDeAvisos,
    depoisDoRodape: rodape?.nextElementSibling === b,
    texto: b.textContent,
    botoes: [...b.querySelectorAll('button')].map((x) => x.textContent),
    visivel: b.getBoundingClientRect().height > 0,
  };
})()`;

async function capturar(t, p, nome) {
  await p.avaliar(`(async () => {
    document.querySelector('[data-secao="avisos"]').scrollIntoView({ block: 'start' });
    document.activeElement?.blur?.();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  })()`);
  const { data } = await p.cmd('Page.captureScreenshot', { format: 'png' });
  mkdirSync(CAPTURAS, { recursive: true });
  const arquivo = `${t.celular ? 'web-cel-avisos' : 'web-avisos'}-${nome}.png`;
  writeFileSync(`${CAPTURAS}${arquivo}`, Buffer.from(data, 'base64'));
  return arquivo;
}

const SECAO = `(() => {
  const c = document.querySelector(${JSON.stringify(CARTAO)});
  if (!c) return null;
  return {
    estado: c.dataset.estadoAvisos,
    descricao: c.querySelector('#config-notificacoes-desc')?.textContent,
    botoes: [...c.querySelectorAll('button')].map((x) => x.textContent),
    rodape: [...c.querySelectorAll('.tt-avisos-rodape p')].map((x) => x.textContent),
    depoisDaAparencia: document.querySelector('[aria-labelledby="config-aparencia"]')?.nextElementSibling?.dataset.secao === 'avisos',
  };
})()`;

const TEXTOS = {
  default: 'Mostrar um aviso quando o foco ou o intervalo terminar.',
  granted: 'Ativadas neste navegador.',
  denied: 'Bloqueadas neste navegador. Para ativar, abra as permissões do site (o ícone à esquerda do endereço).',
  'sem-suporte': 'Neste navegador não há notificações.',
};
const BOTOES = { default: ['Permitir avisos'], granted: ['Testar aviso'], denied: [], 'sem-suporte': [] };
const ABA = 'No navegador, o aviso depende de a aba continuar aberta.';
const CELULAR =
  'No celular, com a tela apagada ou outro app aberto, o navegador pode segurar o aviso até você voltar ao Tomatito. A contagem não atrasa.';
const IPHONE = 'No iPhone e no iPad, os avisos só funcionam com o Tomatito na Tela de Início.';

function secaoCerta(s, estado) {
  const rodape = estado === 'sem-suporte' ? [IPHONE] : [ABA, CELULAR];
  return (
    !!s &&
    s.estado === estado &&
    s.descricao === TEXTOS[estado] &&
    JSON.stringify(s.botoes) === JSON.stringify(BOTOES[estado]) &&
    JSON.stringify(s.rodape) === JSON.stringify(rodape) &&
    s.depoisDaAparencia
  );
}

export default async function casoPermissao(t) {
  const p = t.pagina;
  if (!t.celular) await p.cmd('Emulation.setDeviceMetricsOverride', { width: 1000, height: 700, deviceScaleFactor: 1, mobile: false });
  await p.cmd('Page.addScriptToEvaluateOnNewDocument', { source: ESPIAO });
  await permissao(t, 'prompt');
  await p.avaliar('localStorage.removeItem("tomatito:web.avisoDispensado")');
  await p.recarregar();
  if (!(await esperar(p, visivel(INICIAR)))) throw new Error('a tela Foco não apareceu');

  // (a)
  const aoCarregar = await p.avaliar(`({ permissao: Notification.permission, pedidos: ${PEDIDOS} })`);
  t.conferir('(a) ao carregar, com a permissão em default: 0 pedidos', aoCarregar.permissao === 'default' && aoCarregar.pedidos === 0, aoCarregar);

  // (b)
  await clicar(t, INICIAR);
  const comecou = await esperar(p, EM_ANDAMENTO, 4000);
  const apareceu = await esperar(p, visivel(INFOBAR), 4000);
  const info = await p.avaliar(INFO);
  t.conferir(
    '(b) iniciar: a sessão começa, o InfoBar aparece logo abaixo de "A seguir:" e 0 pedidos',
    comecou && apareceu && info?.modo === 'pergunta' && info.depoisDoRodape &&
      info.texto.includes('Aviso no fim de cada período?') &&
      info.texto.includes('O navegador pode mostrar uma notificação quando o foco ou o intervalo terminar.') &&
      JSON.stringify(info.botoes) === '["Permitir avisos","Agora não"]' &&
      (await p.avaliar(PEDIDOS)) === 0,
    { comecou, info, pedidos: await p.avaliar(PEDIDOS) },
  );
  // Uma captura do InfoBar (para quem revisa; não é das 4 do plano).
  await p.avaliar(`document.querySelector(${JSON.stringify(INFOBAR)}).scrollIntoView({ block: 'center' })`);
  const { data } = await p.cmd('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${CAPTURAS}${t.celular ? 'web-cel-avisos-infobar' : 'web-avisos-infobar'}.png`, Buffer.from(data, 'base64'));

  // (c)
  await clicar(t, `${INFOBAR} [data-pedido="permitir"]`);
  await esperar(p, `${PEDIDOS} >= 1`, 4000);
  // O headless responde ao pedido sem janela; o que ele responder decide
  // se o InfoBar some ou vira o aviso de bloqueio.
  await esperar(p, `Notification.permission !== 'default' || !document.querySelector(${JSON.stringify(INFOBAR)})`, 4000);
  await sleep(300);
  const depois = await p.avaliar(`({ pedidos: ${PEDIDOS}, permissao: Notification.permission, info: ${INFO} })`);
  const cOk =
    depois.pedidos === 1 &&
    (depois.permissao === 'denied'
      ? depois.info?.modo === 'bloqueado' && depois.info.texto.includes('Avisos bloqueados neste navegador. Dá para mudar nas permissões do site.') &&
        JSON.stringify(depois.info.botoes) === '["Fechar"]'
      : depois.info === null);
  t.conferir('(c) "Permitir avisos": 1 pedido, e o InfoBar some (ou mostra o bloqueio)', cOk, depois);
  if (depois.info?.modo === 'bloqueado') {
    await clicar(t, `${INFOBAR} [data-pedido="fechar"]`);
    await esperar(p, `!document.querySelector(${JSON.stringify(INFOBAR)})`, 2000);
  }

  // (d)
  await pararSessao(p);
  await permissao(t, 'prompt');
  await focoDeNovo(p);
  await clicar(t, INICIAR);
  await esperar(p, visivel(INFOBAR), 4000);
  const antesDoAgoraNao = await p.avaliar(INFO);
  await clicar(t, `${INFOBAR} [data-pedido="agora-nao"]`);
  const sumiu = await esperar(p, `!document.querySelector(${JSON.stringify(INFOBAR)})`, 2000);
  const d = await p.avaliar(`({ pedidos: ${PEDIDOS}, chave: localStorage.getItem('tomatito:web.avisoDispensado'), andamento: ${EM_ANDAMENTO} })`);
  t.conferir(
    '(d) "Agora não": o InfoBar some, a chave fica gravada e 0 pedidos',
    antesDoAgoraNao?.modo === 'pergunta' && sumiu && d.pedidos === 0 && d.chave === '1' && d.andamento,
    { antesDoAgoraNao, ...d },
  );

  // (e)
  await pararSessao(p);
  await focoDeNovo(p);
  await clicar(t, INICIAR);
  await esperar(p, EM_ANDAMENTO, 4000);
  await sleep(1500);
  const e = await p.avaliar(`({ pedidos: ${PEDIDOS}, info: ${INFO}, andamento: ${EM_ANDAMENTO}, permissao: Notification.permission })`);
  t.conferir('(e) recarregar e iniciar de novo: nenhum InfoBar e 0 pedidos', e.andamento && e.info === null && e.pedidos === 0 && e.permissao === 'default', e);
  await pararSessao(p);

  // (g) e (h): as Configurações, com a mesma aba (default, granted, denied).
  const capturas = [];
  await ir(p, '#/configuracoes');
  await esperar(p, visivel(CARTAO));
  const sDefault = await p.avaliar(SECAO);
  const okDefault = secaoCerta(sDefault, 'default');
  capturas.push(await capturar(t, p, 'default'));
  // (h) muda pelo navegador, sem recarregar.
  await permissao(t, 'granted');
  const acompanhou = await esperar(p, `document.querySelector(${JSON.stringify(CARTAO)})?.dataset.estadoAvisos === 'granted'`, 4000);
  t.conferir('(h) o cartão acompanha a permissão mudada pelo navegador, sem recarregar', acompanhou, await p.avaliar(SECAO));
  await p.recarregar();
  await esperar(p, visivel(CARTAO));
  const sGranted = await p.avaliar(SECAO);
  const okGranted = secaoCerta(sGranted, 'granted');
  capturas.push(await capturar(t, p, 'granted'));

  // (i) "Testar aviso".
  await p.cmd('BackgroundService.startObserving', { service: 'notifications' });
  await p.cmd('BackgroundService.setRecording', { shouldRecord: true, service: 'notifications' });
  const exibidos = () =>
    p.segundoPlano.filter((ev) => ev.service === 'notifications' && ev.eventName === 'Notification displayed' && ev.instanceId === 'tomatito:teste').length;
  const antesDoTeste = exibidos();
  await clicar(t, `${CARTAO} [data-testar-aviso]`);
  const fim = Date.now() + 15_000;
  while (exibidos() <= antesDoTeste && Date.now() < fim) await sleep(50);
  const testou = exibidos() > antesDoTeste;
  if (testou) await sleep(1000);
  const lista = await p.avaliar(`(async () => {
    const reg = await navigator.serviceWorker.ready;
    return (await reg.getNotifications({ tag: 'tomatito:teste' })).map((n) => ({ title: n.title, body: n.body }));
  })()`);

  await permissao(t, 'denied');
  await p.recarregar();
  await esperar(p, visivel(CARTAO));
  const sDenied = await p.avaliar(SECAO);
  const okDenied = secaoCerta(sDenied, 'denied');
  capturas.push(await capturar(t, p, 'denied'));

  // Sem Notification: outra aba, com o script antes do documento.
  const q = await t.novaAba({ celular: t.celular });
  if (!t.celular) await q.cmd('Emulation.setDeviceMetricsOverride', { width: 1000, height: 700, deviceScaleFactor: 1, mobile: false });
  await q.cmd('Page.addScriptToEvaluateOnNewDocument', { source: SEM_NOTIFICACAO });
  await q.abrir('/#/configuracoes');
  await esperar(q, visivel(CARTAO));
  const sSem = await q.avaliar(SECAO);
  const okSem = secaoCerta(sSem, 'sem-suporte') && (await q.avaliar(`typeof window.Notification`)) === 'undefined';
  capturas.push(await capturar(t, q, 'sem-suporte'));
  t.conferir('(g) a seção Avisos nos 4 estados, com os textos e os botões do plano, depois da Aparência', okDefault && okGranted && okDenied && okSem, {
    default: sDefault,
    granted: sGranted,
    denied: sDenied,
    'sem-suporte': sSem,
    capturas,
  });

  // (f) a Foco sem Notification.
  await ir(q, '#/foco');
  await esperar(q, visivel(INICIAR));
  await q.avaliar('localStorage.removeItem("tomatito:web.avisoDispensado")');
  await clicar(t, INICIAR, q);
  await esperar(q, EM_ANDAMENTO, 4000);
  await sleep(1500);
  const f = await q.avaliar(`({ info: ${INFO}, andamento: ${EM_ANDAMENTO} })`);
  t.conferir('(f) sem Notification: a sessão começa e nenhum InfoBar', f.andamento && f.info === null, f);
  await pararSessao(q);
  await q.fechar();

  t.conferir('(i) "Testar aviso" com granted: 1 aviso na tag tomatito:teste', testou && lista.length === 1 && lista[0].title === 'Tomatito' &&
    lista[0].body === 'Os avisos estão ativados neste navegador.', { testou, lista });

  // (i) "Permitir avisos" nas Configurações: 1 pedido.
  await permissao(t, 'prompt');
  await p.recarregar();
  await esperar(p, visivel(`${CARTAO} [data-permitir]`));
  const antes = await p.avaliar(PEDIDOS);
  await clicar(t, `${CARTAO} [data-permitir]`);
  await esperar(p, `${PEDIDOS} >= 1`, 4000);
  await sleep(500);
  const cfg = await p.avaliar(`({ pedidos: ${PEDIDOS}, permissao: Notification.permission, secao: ${SECAO} })`);
  t.conferir(
    '(i) "Permitir avisos" nas Configurações: 1 pedido e o cartão no estado novo',
    antes === 0 && cfg.pedidos === 1 && cfg.secao?.estado === cfg.permissao,
    cfg,
  );

  // (j)
  const erros = p.consoles.filter((c) => c.tipo === 'error');
  t.conferir('(j) nenhum erro no console', erros.length === 0, erros);
}
