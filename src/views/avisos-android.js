// A13 (PLANO-ANDROID 4.3 e 5.4): os avisos do sistema no Android. Três
// peças, todas em volta do `permissoes` do plugin tomatito-android:
//
//   - o cartão "Avisos" nas Configurações: o estado da permissão de
//     notificação, "Permitir avisos", "Abrir configurações de avisos do
//     sistema" e, sem alarme exato (Android 12/12L com a permissão negada),
//     a frase de que os avisos podem atrasar (o `agendar` da Kotlin cai no
//     `setAndAllowWhileIdle`, 5.2);
//   - a faixa discreta da tela Foco quando os avisos estão bloqueados;
//   - o pedido do sistema no primeiro "Iniciar" (de uma sessão ou de um
//     temporizador), nunca ao abrir o app.
//
// O estado é relido a cada volta do app para a frente (`visibilitychange`):
// a permissão muda nas configurações do sistema, fora do app.
//
// Módulo à parte, ligado por uma linha no main.js (pelo `aoMudar` do
// roteador, depois de cada tela montada), sem mexer nas telas
// compartilhadas com o desktop e a web. Só liga no Android
// (`data-platform`, gravado pelo index.html a partir do `__TT_PLATFORM__`).
// Ponto de integração (docs/decisoes.md, A13): quando a casca do Android
// (A05, depois do W26) existir, a condição passa a ser uma chave da casca.
import t from '../lib/i18n/pt-BR.js';
import { CORRENDO } from '../lib/store.js';

const n = t.configuracoes.notificacoes;
const f = n.faixa;
const semIcone = () => '';

/** Se o app roda no Android (o `data-platform` do <html>). */
export const noAndroid = (doc = globalThis.document) => doc?.documentElement?.dataset?.platform === 'android';

/** O estado normalizado do `permissoes` (ou null, se a resposta não serve). */
export function normalizar(e) {
  if (!e || typeof e !== 'object' || !['granted', 'denied', 'prompt'].includes(e.notificacoes)) return null;
  return Object.freeze({
    notificacoes: e.notificacoes,
    jaPediu: e.jaPediu === true,
    alarmeExato: e.alarmeExato !== false,
    sdk: Number.isFinite(e.sdk) ? e.sdk : null,
  });
}

/**
 * A faixa da tela Foco aparece quando nenhum aviso vai sair: recusados de vez
 * (`denied`, ou o interruptor do app desligado no sistema), ou ainda sem
 * permissão depois de o pedido já ter saído uma vez. Antes do primeiro
 * pedido (`prompt` sem `jaPediu`), não: o pedido vem no primeiro "Iniciar".
 */
export const faixaVisivel = (e) => !!e && e.notificacoes !== 'granted' && (e.notificacoes === 'denied' || e.jaPediu);

/** O pedido automático do primeiro "Iniciar": só se ele nunca saiu. */
export const devePedir = (e) => !!e && e.notificacoes === 'prompt' && !e.jaPediu;

/** "Permitir avisos" aparece enquanto os avisos não estão permitidos. */
export const mostraPermitir = (e) => !!e && e.notificacoes !== 'granted';

/**
 * A frase do estado no cartão. No `prompt`, a promessa de que "o pedido
 * aparece no primeiro início" só vale enquanto ele nunca saiu; depois de uma
 * recusa (ou de uma revogação), o caminho é o botão "Permitir avisos".
 */
export const descricaoDoEstado = (e) => {
  const estado = e?.notificacoes ?? 'prompt';
  return estado === 'prompt' && e?.jaPediu ? n.estados.recusado : n.estados[estado];
};

/** A frase do atraso aparece sem alarme exato. */
export const mostraAtraso = (e) => !!e && e.alarmeExato === false;

/**
 * O estado compartilhado: lê o `permissoes`, guarda a última resposta e
 * avisa quem assina. `api` é o `ipc.android` (os testes passam um falso).
 * Relê quando o documento volta a ficar visível.
 */
export function criarAvisos({ api, doc = globalThis.document } = {}) {
  let estado = null;
  const ouvintes = new Set();
  const aplicar = (bruto) => {
    const novo = normalizar(bruto);
    if (!novo) return estado;
    estado = novo;
    for (const cb of ouvintes) cb(estado);
    return estado;
  };
  const avisos = {
    get estado() {
      return estado;
    },
    atualizar: () => Promise.resolve(api.permissoes()).then(aplicar),
    /** O pedido do sistema (só aparece no `prompt`); resolve com o estado depois. */
    pedir: () => Promise.resolve(api.pedirNotificacoes()).then(aplicar),
    abrirConfig: () => Promise.resolve(api.abrirConfigAvisos()),
    /**
     * "Permitir avisos": o pedido do sistema enquanto ele ainda aparece;
     * recusado de vez, só as configurações do sistema resolvem.
     */
    permitir: () => (estado?.notificacoes === 'prompt' ? avisos.pedir() : avisos.abrirConfig()),
    /** `cb(estado)` a cada leitura (e já, se houver uma). Devolve o desligar. */
    assinar(cb) {
      ouvintes.add(cb);
      if (estado) cb(estado);
      return () => ouvintes.delete(cb);
    },
  };
  doc?.addEventListener?.('visibilitychange', () => {
    if (doc.visibilityState === 'visible') avisos.atualizar().catch((erro) => console.warn('[avisos]', erro));
  });
  return avisos;
}

/** Se algo corre: uma fase da sessão de foco (foco ou intervalo) ou um temporizador. */
export const algoCorre = (foco, temporizadores) =>
  CORRENDO.includes(foco?.status) || (temporizadores?.timers ?? []).some((x) => x.status === 'running');

/**
 * O pedido no primeiro "Iniciar" (5.4): quando algo passa a correr depois de
 * o app abrir (uma sessão ou um temporizador) e o pedido nunca saiu, mostra
 * o do sistema. O primeiro retrato de cada um só serve de base: uma sessão
 * que já corria ao abrir (a retomada) não pede nada. Uma vez por execução.
 */
export function ligarPedidoNoPrimeiroIniciar(store, avisos) {
  // Os retratos que o store já tinha ao ligar contam como o primeiro.
  let foco = store.foco ?? undefined;
  let temporizadores = store.temporizadores ?? undefined;
  let conhecidos = (foco ? 1 : 0) | (temporizadores ? 2 : 0); // 1: foco, 2: temporizadores
  let antes = conhecidos === 3 ? algoCorre(foco, temporizadores) : null;
  let pediu = false;
  const ver = () => {
    const agora = algoCorre(foco, temporizadores);
    const base = antes;
    antes = agora;
    if (conhecidos !== 3 || base === null || base || !agora || pediu) return;
    if (!devePedir(avisos.estado)) return;
    pediu = true;
    avisos.pedir().catch((erro) => console.warn('[avisos]', erro));
  };
  const semFoco = store.assinar((dto) => {
    foco = dto;
    if (!(conhecidos & 1)) {
      conhecidos |= 1;
      if (conhecidos === 3) antes = algoCorre(foco, temporizadores);
      return;
    }
    ver();
  });
  const semTemporizadores = store.assinarTemporizadores((dto) => {
    temporizadores = dto;
    if (!(conhecidos & 2)) {
      conhecidos |= 2;
      if (conhecidos === 3) antes = algoCorre(foco, temporizadores);
      return;
    }
    ver();
  });
  return () => {
    semFoco();
    semTemporizadores();
  };
}

/** HTML da faixa da tela Foco (escondida até o estado dizer o contrário). */
export function marcacaoFaixa({ icone = semIcone, visivel = false } = {}) {
  return (
    `<div class="tt-faixa-avisos" role="status" data-faixa-avisos${visivel ? '' : ' hidden'}>` +
    `<span class="tt-faixa-avisos-icone" aria-hidden="true">${icone('alert_off', 16)}</span>` +
    `<span class="tt-faixa-avisos-texto tt-t-caption">${f.texto}</span>` +
    `<button type="button" data-permitir-avisos>${f.permitir}</button></div>`
  );
}

/** HTML da seção "Avisos" das Configurações para o estado `e`. */
export function marcacaoCartao(e, { icone = semIcone } = {}) {
  const estado = e?.notificacoes ?? 'prompt';
  return (
    '<section class="tt-config-secao" aria-labelledby="config-notificacoes-secao" data-secao="notificacoes">' +
    `<h2 id="config-notificacoes-secao" class="tt-t-body-strong">${n.secao}</h2>` +
    '<div class="tt-config-cartao" data-cartao="notificacoes">' +
    `<div class="tt-config-cabecalho"><span class="tt-config-icone">${icone('alert', 20)}</span>` +
    `<span class="tt-config-textos"><span id="config-notificacoes" class="tt-config-titulo">${n.titulo}</span>` +
    `<span id="config-notificacoes-desc" class="tt-config-descricao tt-t-caption" data-estado-avisos="${estado}">${descricaoDoEstado(e)}</span></span></div>` +
    '<div class="tt-config-rodape tt-avisos-acoes">' +
    `<button type="button" data-permitir-avisos aria-describedby="config-notificacoes-desc"${mostraPermitir(e) ? '' : ' hidden'}>${n.permitir}</button>` +
    `<button type="button" data-abrir-avisos>${n.abrir}</button></div>` +
    `<div class="tt-config-rodape" role="status" data-atraso-avisos${mostraAtraso(e) ? '' : ' hidden'}>` +
    `<span class="tt-t-caption">${n.atrasar}</span></div>` +
    '</div></section>'
  );
}

const erroDoClique = (erro) => console.warn('[avisos]', erro);

/**
 * Põe a faixa na tela Foco (`pagina` = `.tt-pagina`), logo depois do título,
 * e a mantém de acordo com o estado. Devolve a limpeza.
 */
export function ligarFaixa(pagina, { avisos, icone = semIcone } = {}) {
  const h1 = pagina?.querySelector?.('h1');
  if (!h1) return () => {};
  h1.insertAdjacentHTML('afterend', marcacaoFaixa({ icone, visivel: faixaVisivel(avisos.estado) }));
  const faixa = h1.nextElementSibling;
  const botao = faixa.querySelector('[data-permitir-avisos]');
  const aoClicar = () => {
    botao.disabled = true;
    avisos
      .permitir()
      .catch(erroDoClique)
      .finally(() => (botao.disabled = false));
  };
  botao.addEventListener('click', aoClicar);
  const desligar = avisos.assinar((e) => (faixa.hidden = !faixaVisivel(e)));
  return () => {
    desligar();
    botao.removeEventListener('click', aoClicar);
    faixa.remove();
  };
}

/**
 * Põe a seção "Avisos" nas Configurações (`pagina` = `.tt-pagina`), antes da
 * seção "Sistema" (ou do "Sobre", ou no fim), e a mantém de acordo com o
 * estado. Devolve a limpeza.
 */
export function ligarCartao(pagina, { avisos, icone = semIcone } = {}) {
  if (!pagina?.querySelector) return () => {};
  const html = marcacaoCartao(avisos.estado, { icone });
  const antesDe =
    pagina.querySelector('[aria-labelledby="config-sistema"]') ?? pagina.querySelector('[aria-labelledby="config-sobre-secao"]');
  let secao;
  if (antesDe) {
    antesDe.insertAdjacentHTML('beforebegin', html);
    secao = antesDe.previousElementSibling;
  } else {
    pagina.insertAdjacentHTML('beforeend', html);
    secao = pagina.lastElementChild;
  }
  const desc = secao.querySelector('[data-estado-avisos]');
  const permitir = secao.querySelector('[data-permitir-avisos]');
  const atraso = secao.querySelector('[data-atraso-avisos]');
  const aoClicar = (ev) => {
    const b = ev.target.closest?.('[data-permitir-avisos], [data-abrir-avisos]');
    if (!b) return;
    b.disabled = true;
    const acao = b.hasAttribute('data-permitir-avisos') ? avisos.permitir() : avisos.abrirConfig();
    acao.catch(erroDoClique).finally(() => (b.disabled = false));
  };
  secao.addEventListener('click', aoClicar);
  const desligar = avisos.assinar((e) => {
    desc.dataset.estadoAvisos = e.notificacoes;
    desc.textContent = descricaoDoEstado(e);
    permitir.hidden = !mostraPermitir(e);
    atraso.hidden = !mostraAtraso(e);
  });
  return () => {
    desligar();
    secao.removeEventListener('click', aoClicar);
    secao.remove();
  };
}

/**
 * Liga tudo no Android (fora dele, nada, e devolve null): o estado, o pedido
 * no primeiro "Iniciar" e, a cada tela montada, a faixa (Foco) ou o cartão
 * (Configurações). O objeto devolvido tem `aoMudar(rota, raiz)`, que o
 * `aoMudar` do roteador chama, e `avisos` (o estado, para o CDP e os testes).
 */
export function ligarAvisosDoAndroid({ api, store, icone = semIcone, doc = globalThis.document } = {}) {
  if (!noAndroid(doc) || !api) return null;
  const avisos = criarAvisos({ api, doc });
  ligarPedidoNoPrimeiroIniciar(store, avisos);
  avisos.atualizar().catch((erro) => console.warn('[avisos]', erro));
  let limpar = null;
  return {
    avisos,
    aoMudar(rota, raiz) {
      limpar?.();
      limpar = null;
      const pagina = raiz?.querySelector?.('.tt-pagina');
      if (rota === 'foco') limpar = ligarFaixa(pagina, { avisos, icone });
      else if (rota === 'configuracoes') limpar = ligarCartao(pagina, { avisos, icone });
    },
  };
}
