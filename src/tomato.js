// Página da janela `tomato` (Tomatito Full; PLANO.md, 5.10; M50). O tomate
// mostra o mesmo foco da tela Foco: o estado vem do Rust (`get_state`,
// `tt://state` e `tt://tick`, pelo store), e os botões chamam os mesmos
// comandos focus_*. O que aparece (rótulo, tempo, contagem, anel e botões)
// sai do src/lib/tomate.js, sem DOM; aqui só se escreve na página.
//
// O relógio da página é um requestAnimationFrame que só roda com uma fase
// correndo e só mexe no DOM quando o segundo mostrado muda (3.1). O anel anda
// com uma transição linear de 1 s a cada segundo (tomato.css), e o prazo é o
// `endsAt` do retrato (lib/tomate.js, restanteDaFase).
//
// M51: a janela nasce escondida pelo `switch_window_mode` (5.7) e só aparece
// quando esta página avisa `tt://tomato-ready`, com o retrato escrito e as
// fontes carregadas (o Rust mostra assim mesmo depois de 2 s). Já na tela, a
// página avisa de novo, `pintado`, depois de dois quadros, e só então o Rust
// esconde a main (docs/decisoes.md, M51, item 13). "Voltar ao modo
// normal" e o Esc saem do Full pelo mesmo comando. M53: a página calcula as
// faixas da região de entrada (lib/regiao.js) antes do primeiro aviso e a
// cada troca de tamanho; mandá-las ao Rust é do M54 (Linux) e do M55
// (Windows). O menu nativo do botão direito e os outros atalhos
// (Espaço e Ctrl+,) são do M56; até lá, o menu de contexto do WebView fica
// desligado, porque seria uma janela própria, fora do desenho (5.3).
import * as ipc from './lib/ipc.js';
import { criarStore } from './lib/store.js';
import { ligarAnuncioDeFases } from './lib/a11y.js';
import t from './lib/i18n/pt-BR.js';
import { MINUTOS_AO_INICIAR, chaveDaFase, restanteDaFase, rotuloDoTempo, vista } from './lib/tomate.js';
import { regionStrips } from './lib/regiao.js';

const h = document.documentElement;
// Sem transições até o primeiro retrato estar na página: a cor do corpo e o
// anel não animam a partir do desenho vazio (a classe é a do base.css).
h.classList.add('tt-no-transition');

const stage = document.querySelector('.stage');
const q = (seletor) => stage.querySelector(seletor);
const el = {
  rotulo: q('[data-rotulo]'),
  tempo: q('[data-tempo]'),
  contagem: q('[data-contagem]'),
  anel: q('[data-anel]'),
  principal: q('[data-acao="principal"]'),
  encerrar: q('[data-acao="encerrar"]'),
  pular: q('[data-acao="pular"]'),
};

// Botões só de ícone: nome acessível e dica (3.8), do catálogo.
function nomear(botao, rotulo) {
  if (botao.getAttribute('aria-label') === rotulo) return;
  botao.setAttribute('aria-label', rotulo);
  botao.title = rotulo;
}
nomear(q('[data-acao="voltar"]'), t.tomate.voltar);
nomear(q('[data-acao="configuracoes"]'), t.tomate.configuracoes);

// Só o foco: os temporizadores e o cronômetro não aparecem no tomate.
const store = criarStore({ ipc, eventos: { estado: ipc.EVENTOS.estado, tick: ipc.EVENTOS.tick } });

let ultima = null;
let chave = null;

const restante = () =>
  restanteDaFase(store.foco, { agora: Date.now(), velocidade: store.velocidade, estimado: store.restanteMs() });

function escrever(v) {
  const antes = ultima ?? {};
  if (v.estado !== antes.estado) stage.dataset.state = v.estado;
  if (v.rotulo !== antes.rotulo) el.rotulo.textContent = v.rotulo;
  if (v.tempo !== antes.tempo) el.tempo.textContent = v.tempo;
  if (v.contagem !== antes.contagem) el.contagem.textContent = v.contagem;
  if (v.anel !== antes.anel) el.anel.style.setProperty('--tt-anel', String(v.anel));
  // O rótulo do tempo muda no máximo uma vez por minuto (3.8).
  const rotulo = rotuloDoTempo(v);
  if (el.tempo.getAttribute('aria-label') !== rotulo) el.tempo.setAttribute('aria-label', rotulo);
  nomear(el.principal, v.principal.rotulo);
  el.principal.dataset.icone = v.principal.icone;
  for (const nome of ['encerrar', 'pular']) {
    const b = el[nome];
    nomear(b, v[nome].rotulo);
    // Um botão que se desabilita com o foco do teclado passa o foco ao
    // principal, em vez de deixá-lo cair no <body>.
    if (!v[nome].ativo && document.activeElement === b) el.principal.focus();
    b.disabled = !v[nome].ativo;
  }
  ultima = v;
}

function desenhar() {
  const v = vista(store.foco, restante());
  const k = chaveDaFase(store.foco);
  if (k !== chave) {
    // Outra fase, outra sessão ou o fim: o anel vai direto para o lugar.
    chave = k;
    stage.classList.add('sem-transicao');
    escrever(v);
    void getComputedStyle(el.anel).strokeDasharray;
    requestAnimationFrame(() => stage.classList.remove('sem-transicao'));
    return;
  }
  // O escrever só toca no que mudou.
  escrever(v);
}

let pedido = null;
function passo() {
  pedido = null;
  const v = vista(store.foco, restante());
  if (!ultima || v.segundos !== ultima.segundos) desenhar();
  if (store.correndo) pedido = requestAnimationFrame(passo);
}
function atualizar() {
  desenhar();
  if (store.correndo && pedido === null) pedido = requestAnimationFrame(passo);
  if (!store.correndo && pedido !== null) {
    cancelAnimationFrame(pedido);
    pedido = null;
  }
}
store.assinar(atualizar);

// Os botões. Um comando recusado (o estado mudou por outro caminho) já pede um
// get_state no store; aqui só vai para o console.
const acoes = {
  voltar: () => sair(),
  configuracoes: () => ipc.full.mostrarMain('#/configuracoes'),
  encerrar: () => store.comando('parar'),
  pular: () => store.comando('pular'),
  principal: () => {
    const acao = ultima?.principal.acao;
    if (acao === 'iniciar') return store.comando('iniciar', MINUTOS_AO_INICIAR, { pularIntervalos: false });
    return acao ? store.comando(acao) : undefined;
  },
};
stage.addEventListener('click', (e) => {
  const b = e.target.closest?.('button[data-acao]');
  if (!b || b.disabled || !stage.contains(b)) return;
  Promise.resolve()
    .then(() => acoes[b.dataset.acao]?.())
    .catch((erro) => console.warn('[tomate]', erro));
});

// "Voltar ao modo normal" e o Esc (M51): o Rust volta ao lastNormalTheme,
// mostra a main e fecha esta janela (5.7). Um pedido de cada vez.
let saindo = null;
function sair() {
  saindo ??= ipc.full.trocarModo(false).finally(() => (saindo = null));
  return saindo;
}
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || e.repeat || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
  e.preventDefault();
  sair().catch((erro) => console.warn('[tomate]', erro));
});

// A região de entrada (5.4; M53): as faixas do corpo, do cabinho e do cálice,
// em px lógicos no Linux (escala 1) e em px físicos no Windows (o
// devicePixelRatio, para o SetWindowRgn). Recalculada só quando o lado ou a
// escala mudam. No modo opaco (B3), o M54 não deve aplicá-la
// (docs/decisoes.md, M52, item 8). Uma falha aqui vai para o console e não
// segura o aviso tt://tomato-ready: sem região, o tomate continua usável.
const escalaDaRegiao = () => (h.dataset.platform === 'windows' ? window.devicePixelRatio || 1 : 1);
let regiao = null;
let sobreposicao = null;
function calcularRegiao() {
  const lado = window.innerWidth;
  const escala = escalaDaRegiao();
  if (regiao && regiao.lado === lado && regiao.escala === escala) return regiao;
  try {
    const inicio = performance.now();
    const faixas = regionStrips(lado, escala);
    regiao = { lado, escala, faixas, ms: performance.now() - inicio };
  } catch (erro) {
    console.error('[região]', erro);
    regiao = null;
    return null;
  }
  sobreposicao?.desenhar(regiao);
  return regiao;
}
window.addEventListener('resize', () => calcularRegiao());
// Só no dev: a sobreposição que desenha as faixas (lib/regiao-debug.js).
if (import.meta.env.DEV) {
  import('./lib/regiao-debug.js')
    .then(({ ligarSobreposicao }) => (sobreposicao = ligarSobreposicao(calcularRegiao)))
    .catch((erro) => console.warn('[região]', erro));
}

// O menu de contexto do WebView seria uma janela própria, fora do desenho
// (5.3); o menu nativo com as ações é do M56.
document.addEventListener('contextmenu', (e) => e.preventDefault());

// O renderizador WebGL, para a validação do M52 (5.9). No WebKitGTK vem
// mascarado ("Apple GPU"); o Rust junta a versão do WebView e a GPU
// (window/tomato.rs, chave_de_validacao). O contexto é descartado na hora.
function renderizador() {
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    if (!gl) return '';
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const r = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return r;
  } catch {
    return '';
  }
}

// Dois quadros na tela: o segundo rAF roda depois de o primeiro quadro ter
// sido pintado. Sem limite aqui: quem espera é o Rust (ESPERA_DA_PINTURA).
const quadroPintado = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
const naTela = () =>
  new Promise((r) => {
    const ver = () => {
      if (document.visibilityState !== 'visible') return;
      document.removeEventListener('visibilitychange', ver);
      r();
    };
    document.addEventListener('visibilitychange', ver);
    ver();
  });

// Anúncio das fases na região aria-live (a11y.js, a mesma regra da main).
ligarAnuncioDeFases({ ipc }).catch((erro) => console.error('[anúncio]', erro));

try {
  await store.ligar();
} catch (erro) {
  console.error('[store]', erro);
} finally {
  atualizar();
  calcularRegiao();
  // A janela ainda está escondida, e o requestAnimationFrame não dispara numa
  // janela escondida (docs/decisoes.md, M08): o aviso não espera um quadro, e
  // a classe só sai dois quadros depois de a janela aparecer.
  requestAnimationFrame(() => requestAnimationFrame(() => h.classList.remove('tt-no-transition')));
  await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]);
  const dados = { userAgent: navigator.userAgent, renderer: renderizador() };
  const avisar = (pintado) =>
    ipc.full.avisarPronto({ ...dados, pintado }).catch((erro) => console.error('[tomate] tt://tomato-ready', erro));
  // Escondida: o primeiro aviso libera o show(). Já na tela (o Rust a mostrou
  // pelo limite de 2 s), só o segundo.
  if (document.visibilityState !== 'visible') avisar(false);
  await naTela();
  await quadroPintado();
  avisar(true);
}
