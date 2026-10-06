// O Tomatito Full na versão web (v0.3; o antigo bloco WF0–WF4 do PLANO-WEB).
// No desktop, o Full é uma janela em forma de tomate (tomato.html e
// src/tomato.js). No navegador não há janela sem moldura: o tomate ocupa um
// "palco" por cima do app, na mesma página, com o mesmo desenho, os mesmos
// textos (lib/tomate.js) e os mesmos comandos focus_*.
//
// - Entra e sai como no desktop: escolher o Full nas Configurações grava
//   `theme: 'full'` (o `switch_window_mode` da plataforma web), e o palco
//   acompanha o `data-theme-pref` do <html>; "Voltar ao modo normal" e o Esc
//   voltam ao tema anterior. Uma página aberta com o Full gravado já abre no
//   palco.
// - "Tela cheia" usa a Fullscreen API, onde existe.
// - "Mini tomate" abre o tomate numa janelinha sempre na frente (Document
//   Picture-in-Picture), onde existe (Chrome e Edge no computador).
// - Com uma fase correndo e o palco à vista, a tela não apaga (Wake Lock).
//
// Este módulo não importa CSS nem HTML: quem os carrega é a plataforma
// (platform/web/palco-carga.js), e os testes passam versões de mentira.
import t from '../lib/i18n/pt-BR.js';
import { MINUTOS_AO_INICIAR, chaveDaFase, restanteDaFase, rotuloDoTempo, vista } from '../lib/tomate.js';
import { EVENTO } from '../lib/theme.js';

const p = t.palco;

/**
 * Liga um desenho do tomate (`stage`, o `.stage` do tomato.html) ao store do
 * foco: escreve o estado e chama `acoes[nome]()` nos botões. `janela` é a
 * janela do desenho (a da página ou a do mini tomate). Devolve
 * `{ principal(), desligar() }`.
 */
export function ligarTomate(stage, { store, acoes, janela = globalThis }) {
  const q = (seletor) => stage.querySelector(seletor);
  const el = {
    rotulo: q('[data-rotulo]'),
    tempo: q('[data-tempo]'),
    contagem: q('[data-contagem]'),
    anel: q('[data-anel]'),
    anelDoCartao: q('[data-anel-cartao]'),
    principal: q('[data-acao="principal"]'),
    encerrar: q('[data-acao="encerrar"]'),
    pular: q('[data-acao="pular"]'),
  };
  const nomear = (botao, rotulo) => {
    if (!botao || botao.getAttribute('aria-label') === rotulo) return;
    botao.setAttribute('aria-label', rotulo);
    botao.title = rotulo;
  };
  nomear(q('[data-acao="voltar"]'), acoes.rotuloDoVoltar ?? t.tomate.voltar);
  nomear(q('[data-acao="configuracoes"]'), t.tomate.configuracoes);

  let ultima = null;
  let chave = null;
  let pedido = null;
  let desligado = false;
  const restante = () => restanteDaFase(store.foco, { agora: Date.now(), velocidade: store.velocidade, estimado: store.restanteMs() });

  const escrever = (v) => {
    const antes = ultima ?? {};
    if (v.estado !== antes.estado) stage.dataset.state = v.estado;
    if (v.rotulo !== antes.rotulo) el.rotulo.textContent = v.rotulo;
    if (v.tempo !== antes.tempo) el.tempo.textContent = v.tempo;
    if (v.contagem !== antes.contagem) el.contagem.textContent = v.contagem;
    if (v.anel !== antes.anel) {
      el.anel.style.setProperty('--tt-anel', String(v.anel));
      el.anelDoCartao?.style.setProperty('--tt-anel', String(v.anel));
    }
    const rotulo = rotuloDoTempo(v);
    if (el.tempo.getAttribute('aria-label') !== rotulo) el.tempo.setAttribute('aria-label', rotulo);
    nomear(el.principal, v.principal.rotulo);
    el.principal.dataset.icone = v.principal.icone;
    for (const nome of ['encerrar', 'pular']) {
      const b = el[nome];
      nomear(b, v[nome].rotulo);
      if (!v[nome].ativo && stage.ownerDocument.activeElement === b) el.principal.focus();
      b.disabled = !v[nome].ativo;
    }
    ultima = v;
  };
  const desenhar = () => {
    const v = vista(store.foco, restante());
    const k = chaveDaFase(store.foco);
    if (k !== chave) {
      // Outra fase ou outra sessão: o anel vai direto para o lugar.
      chave = k;
      stage.classList.add('sem-transicao');
      escrever(v);
      janela.requestAnimationFrame(() => stage.classList.remove('sem-transicao'));
      return;
    }
    escrever(v);
  };
  const passo = () => {
    pedido = null;
    if (desligado) return;
    const v = vista(store.foco, restante());
    if (!ultima || v.segundos !== ultima.segundos) desenhar();
    if (store.correndo) pedido = janela.requestAnimationFrame(passo);
  };
  const atualizar = () => {
    if (desligado) return;
    desenhar();
    if (store.correndo && pedido === null) pedido = janela.requestAnimationFrame(passo);
    if (!store.correndo && pedido !== null) {
      janela.cancelAnimationFrame(pedido);
      pedido = null;
    }
  };
  const principal = () => {
    const acao = ultima?.principal.acao;
    if (acao === 'iniciar') return store.comando('iniciar', MINUTOS_AO_INICIAR, { pularIntervalos: false });
    return acao ? store.comando(acao) : undefined;
  };
  const porBotao = { ...acoes, principal, encerrar: () => store.comando('parar'), pular: () => store.comando('pular') };
  const aoClicar = (e) => {
    const b = e.target.closest?.('button[data-acao]');
    if (!b || b.disabled || !stage.contains(b)) return;
    Promise.resolve()
      .then(() => porBotao[b.dataset.acao]?.())
      .catch((erro) => console.warn('[tomate]', erro));
  };
  stage.addEventListener('click', aoClicar);
  const desassinar = store.assinar(atualizar);
  atualizar();
  return {
    principal,
    focar: () => el.principal.focus?.(),
    desligar() {
      desligado = true;
      desassinar?.();
      stage.removeEventListener('click', aoClicar);
      if (pedido !== null) janela.cancelAnimationFrame(pedido);
      pedido = null;
    },
  };
}

/** O que este navegador oferece ao palco. */
export function recursosDoPalco(janela = globalThis) {
  const doc = janela.document;
  return {
    telaCheia: Boolean(doc?.fullscreenEnabled && doc.documentElement?.requestFullscreen),
    mini: 'documentPictureInPicture' in janela,
    telaAcesa: Boolean(janela.navigator?.wakeLock?.request),
  };
}

/** HTML do palco: o desenho (`desenho`, o `.stage`) e a barra de baixo. */
export function marcacao(desenho, { telaCheia = false, mini = false } = {}) {
  return (
    `<div class="tt-palco-tomate">${desenho}</div>` +
    '<div class="tt-palco-barra">' +
    (telaCheia ? `<button type="button" data-palco="tela-cheia" aria-pressed="false">${p.telaCheia}</button>` : '') +
    (mini ? `<button type="button" data-palco="mini">${p.mini}</button>` : '') +
    `<button type="button" data-palco="voltar">${t.tomate.voltar}</button>` +
    '</div>'
  );
}

/** O lado do mini tomate, em px. */
export const LADO_DO_MINI = 300;

/**
 * Cria o palco. `desenho` é o HTML do `.stage`; `sair()` volta ao tema
 * normal (o `switch_window_mode(false)`), e `configuracoes()` sai e abre as
 * Configurações; `estilos(doc, janela)` aplica a folha do tomate num
 * documento (o da página e o do mini tomate). Devolve `{ desligar() }`.
 */
export function criarPalco({ doc = document, janela = globalThis, store, desenho, sair, configuracoes, estilos = () => {}, recursos = recursosDoPalco(janela) }) {
  const h = doc.documentElement;
  const palco = doc.createElement('div');
  palco.className = 'tt-palco';
  palco.dataset.theme = 'full';
  palco.setAttribute('role', 'dialog');
  palco.setAttribute('aria-modal', 'true');
  palco.setAttribute('aria-label', p.nome);
  palco.hidden = true;
  palco.innerHTML = marcacao(desenho, recursos);
  doc.body.append(palco);
  estilos(doc, janela);

  let tomate = null;
  let mini = null;
  let trava = null;
  let saindo = null;
  const aberto = () => !palco.hidden;
  const pedirSaida = () => {
    saindo ??= Promise.resolve()
      .then(sair)
      .catch((erro) => console.warn('[palco]', erro))
      .finally(() => (saindo = null));
    return saindo;
  };
  const acoes = { voltar: pedirSaida, configuracoes: () => configuracoes() };

  // A tela acesa só com o palco à vista e uma fase correndo.
  const revisarTela = async () => {
    const quer = recursos.telaAcesa && aberto() && store.correndo && doc.visibilityState === 'visible';
    if (quer && !trava) {
      try {
        trava = await janela.navigator.wakeLock.request('screen');
        trava.addEventListener?.('release', () => (trava = null));
        if (!aberto()) revisarTela();
      } catch (erro) {
        console.debug('[palco] a tela pode apagar', erro);
      }
    } else if (!quer && trava) {
      const solta = trava;
      trava = null;
      solta.release?.().catch(() => {});
    }
  };
  const desassinarTela = store.assinar(() => void revisarTela());
  const aoMudarVisibilidade = () => void revisarTela();
  doc.addEventListener('visibilitychange', aoMudarVisibilidade);

  const botaoDaTelaCheia = palco.querySelector('[data-palco="tela-cheia"]');
  const aoMudarTelaCheia = () => {
    const cheia = doc.fullscreenElement === palco;
    if (!botaoDaTelaCheia) return;
    botaoDaTelaCheia.textContent = cheia ? p.sairDaTelaCheia : p.telaCheia;
    botaoDaTelaCheia.setAttribute('aria-pressed', String(cheia));
  };
  doc.addEventListener('fullscreenchange', aoMudarTelaCheia);

  const fecharMini = () => {
    const m = mini;
    mini = null;
    m?.tomate.desligar();
    try {
      m?.janela.close();
    } catch {
      // já fechada
    }
  };
  const abrirMini = async () => {
    if (mini) return mini.janela.focus?.();
    const w = await janela.documentPictureInPicture.requestWindow({ width: LADO_DO_MINI, height: LADO_DO_MINI });
    const d = w.document;
    d.documentElement.lang = h.lang;
    d.title = p.tituloDoMini;
    d.documentElement.dataset.theme = 'full';
    d.documentElement.dataset.fullMode = 'opaque';
    d.documentElement.classList.add('tt-mini-tomate');
    // As folhas da página (tokens e fontes) e a do tomate.
    for (const folha of doc.querySelectorAll('link[rel="stylesheet"]')) {
      const copia = d.createElement('link');
      copia.rel = 'stylesheet';
      copia.href = folha.href;
      d.head.append(copia);
    }
    estilos(d, w);
    d.body.innerHTML = desenho;
    const stage = d.body.querySelector('.stage');
    const noMini = ligarTomate(stage, {
      store,
      janela: w,
      acoes: {
        // No mini, o primeiro botão fecha a janelinha e volta à aba.
        rotuloDoVoltar: p.fecharMini,
        voltar: fecharMini,
        configuracoes: () => {
          fecharMini();
          return configuracoes();
        },
      },
    });
    mini = { janela: w, tomate: noMini };
    w.addEventListener('pagehide', () => {
      if (mini?.janela === w) {
        mini = null;
        noMini.desligar();
      }
    });
    return undefined;
  };

  const aoClicarNaBarra = (e) => {
    const b = e.target.closest?.('[data-palco]');
    if (!b) return;
    const acao = {
      'tela-cheia': () => (doc.fullscreenElement === palco ? doc.exitFullscreen() : palco.requestFullscreen()),
      mini: abrirMini,
      voltar: pedirSaida,
    }[b.dataset.palco];
    Promise.resolve()
      .then(acao)
      .catch((erro) => console.warn('[palco]', erro));
  };
  palco.addEventListener('click', aoClicarNaBarra);

  const aoTeclar = (e) => {
    if (!aberto() || e.repeat || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
    if (e.key === 'Escape') {
      // Em tela cheia, o Esc é do navegador (sai dela); fora, sai do Full.
      if (doc.fullscreenElement) return;
      e.preventDefault();
      void pedirSaida();
    } else if (e.key === ' ' && !e.target.closest?.('button, a, input, select, textarea')) {
      e.preventDefault();
      Promise.resolve()
        .then(() => tomate?.principal())
        .catch((erro) => console.warn('[tomate]', erro));
    }
  };
  doc.addEventListener('keydown', aoTeclar);

  const casca = () => doc.querySelector('.tt-janela');
  const abrir = () => {
    if (aberto()) return;
    palco.hidden = false;
    h.dataset.palco = '';
    casca()?.toggleAttribute('inert', true);
    tomate = ligarTomate(palco.querySelector('.stage'), { store, acoes, janela });
    tomate.focar();
    void revisarTela();
  };
  const fechar = () => {
    if (!aberto()) return;
    fecharMini();
    if (doc.fullscreenElement === palco) doc.exitFullscreen?.().catch?.(() => {});
    tomate?.desligar();
    tomate = null;
    palco.hidden = true;
    delete h.dataset.palco;
    casca()?.toggleAttribute('inert', false);
    void revisarTela();
  };
  const refletir = () => (h.dataset.themePref === 'full' ? abrir() : fechar());
  h.addEventListener(EVENTO, refletir);
  refletir();

  return {
    elemento: palco,
    aberto,
    desligar() {
      h.removeEventListener(EVENTO, refletir);
      doc.removeEventListener('keydown', aoTeclar);
      doc.removeEventListener('fullscreenchange', aoMudarTelaCheia);
      doc.removeEventListener('visibilitychange', aoMudarVisibilidade);
      desassinarTela?.();
      fechar();
      palco.remove();
    },
  };
}
