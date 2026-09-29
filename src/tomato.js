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
// cada troca de tamanho. M54: e as manda ao Rust (`set_tomato_region`) antes
// do primeiro aviso, então no Linux a região chega antes do show() (5.6); de
// novo a cada `resize` e a cada pedido do Rust (`tt://tomato-region`). O
// Windows (M55) usa o mesmo caminho. M56: o menu nativo do botão direito
// (lib/menu-tomate.js), no lugar do menu do WebView, que seria uma janela
// própria, fora do desenho (5.3); e os atalhos Espaço (iniciar, pausar ou
// retomar) e Ctrl+, (Configurações), além do Esc. O tamanho e o "Sempre na
// frente" escolhidos no menu vão pelo settings_set, e o Rust os aplica.
import { CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu } from '@tauri-apps/api/menu';
import { LogicalPosition } from '@tauri-apps/api/dpi';
import { getCurrentWindow } from '@tauri-apps/api/window';
import * as ipc from './lib/ipc.js';
import { criarStore } from './lib/store.js';
import { ligarAnuncioDeFases } from './lib/a11y.js';
import t from './lib/i18n/pt-BR.js';
import { MINUTOS_AO_INICIAR, chaveDaFase, restanteDaFase, rotuloDoTempo, vista } from './lib/tomate.js';
import { regionStrips } from './lib/regiao.js';
import { espacoLivre, ligarAtalhosDaJanela, rotaDoAtalho } from './lib/keys.js';
import { ligarBloqueiosDeProducao, ligarRecargaDoDev } from './lib/producao.js';
import { criarItens, itensDoMenu, ladoDoItem } from './lib/menu-tomate.js';

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
const rodar = (acao) =>
  Promise.resolve()
    .then(acao)
    .catch((erro) => console.warn('[tomate]', erro));
// Junção com o M37: as regras da `main` (3.8) valem também aqui. Em
// produção, o F5 e o Ctrl+R não recarregam (o menu do WebView já fica
// desligado sempre, pelo menu nativo abaixo); no `dev:app`, recarregam, e a
// página manda a região de novo na partida. Ctrl+W fecha o tomate (o mesmo
// CloseRequested do "Fechar" do menu e do Alt+F4) e Ctrl+Q sai do app.
if (import.meta.env.PROD) ligarBloqueiosDeProducao();
else ligarRecargaDoDev();
ligarAtalhosDaJanela({ fechar: () => getCurrentWindow().close(), sair: ipc.sair });
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || e.repeat || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
  e.preventDefault();
  rodar(sair);
});
// M56: o Espaço (a regra da tela Foco: sozinho e fora de botões, onde ele já
// aperta o botão) e o Ctrl+, (a regra da main, lib/keys.js).
document.addEventListener('keydown', (e) => {
  if (espacoLivre(e)) {
    e.preventDefault();
    rodar(acoes.principal);
  } else if (rotaDoAtalho(e) === 'configuracoes') {
    e.preventDefault();
    rodar(acoes.configuracoes);
  }
});

// A região de entrada (5.4; M53): as faixas do corpo, do cabinho e do cálice,
// em px lógicos no Linux (escala 1) e em px físicos no Windows (o
// devicePixelRatio, para o SetWindowRgn). Recalculada só quando o lado ou a
// escala mudam. No modo opaco (B3), a janela é quadrada e fica sem região
// (docs/decisoes.md, M52, item 8): nada vai ao Rust (e o Rust também ignora).
// Uma falha aqui vai para o console e não segura o aviso tt://tomato-ready:
// sem região, o tomate continua usável.
const escalaDaRegiao = () => (h.dataset.platform === 'windows' ? window.devicePixelRatio || 1 : 1);
// M54: escondida, a página do WebKitGTK tem `innerWidth` 0; o Rust passa o
// lado da janela (`__TT_TOMATO_SIZE__`), e a região vai antes do show (5.6).
const ladoDaJanela = () => window.innerWidth || Number(window.__TT_TOMATO_SIZE__) || 0;
let regiao = null;
let sobreposicao = null;
// M55: no Windows, o pedido do Rust traz o tamanho da janela em px físicos,
// e ele manda: numa troca de DPI, o pedido pode chegar antes de o WebView2
// trocar o devicePixelRatio (e sem `resize`, porque os px CSS não mudam). As
// faixas só dependem do lado físico (regionStrips: n = lado × escala).
function calcularRegiao(fisico) {
  const lado = ladoDaJanela();
  const escala = fisico > 0 && lado > 0 && h.dataset.platform === 'windows' ? fisico / lado : escalaDaRegiao();
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
// M54: manda a região ao Rust quando ela é outra que a última mandada. Um
// envio de cada vez; o que chegar no meio espera e manda a mais nova. Com o
// lado 0 (a janela ainda sem tamanho), nada vai, e o `resize` manda depois.
let enviada = null;
let enviando = null;
function enviarRegiao(fisico) {
  enviando = (enviando ?? Promise.resolve()).then(async () => {
    const r = calcularRegiao(fisico);
    if (h.dataset.fullMode === 'opaque' || !r || r === enviada || !r.faixas.length) return;
    enviada = r;
    try {
      await ipc.full.definirRegiao(r.faixas);
    } catch (erro) {
      enviada = null;
      console.error('[região]', erro);
    }
  });
  return enviando;
}
window.addEventListener('resize', () => enviarRegiao());
// O Rust pede de novo quando o tamanho da janela muda (o Resized): cobre
// também, no Windows, a troca de DPI sem troca de px CSS (5.4).
ipc
  .ouvir(ipc.full.EVENTO_REGIAO, (tamanho) => enviarRegiao(Array.isArray(tamanho) ? tamanho[0] : 0))
  .catch((erro) => console.error('[região]', erro));
// Só no dev: a sobreposição que desenha as faixas (lib/regiao-debug.js).
if (import.meta.env.DEV) {
  import('./lib/regiao-debug.js')
    .then(({ ligarSobreposicao }) => (sobreposicao = ligarSobreposicao(calcularRegiao)))
    .catch((erro) => console.warn('[região]', erro));
}

// O menu do botão direito (5.10; M56): nativo, refeito a cada vez com o
// estado do foco e as configurações do momento. O do WebView seria uma
// janela própria, fora do desenho (5.3), e fica sempre desligado. A posição
// vai explícita: sem ela, no Wayland, o GTK não sabe onde está o ponteiro.
// Pelo teclado (a tecla de menu ou Shift+F10), abre no elemento com o foco.
let sempreNaFrente = null;
let recursos = [];
let abrindo = false;
const fabricas = {
  item: (o) => MenuItem.new(o),
  marcar: (o) => CheckMenuItem.new(o),
  submenu: (o) => Submenu.new(o),
  separador: () => PredefinedMenuItem.new({ item: 'Separator' }),
};
async function abrirMenu(x, y) {
  if (abrindo) return;
  abrindo = true;
  try {
    sempreNaFrente ??= await ipc.full.sempreNaFrente().catch(() => false);
    const s = await ipc.configuracoes.obter();
    const v = ultima ?? vista(store.foco, restante());
    const itens = itensDoMenu({ vista: v, tamanho: s.tomatoSize, sempreNaFrente, naFrente: s.tomatoOnTop });
    // Só no dev: os roteiros do GNOME aninhado conferem o menu que abriu.
    if (import.meta.env.DEV) window.__TT_MENU__ = itens;
    // O anterior já foi fechado pelo usuário; os recursos dele saem agora.
    for (const r of recursos.splice(0)) r.close().catch(() => {});
    const itensDoTauri = await criarItens(itens, (id) => rodar(() => doMenu(id, s)), fabricas, recursos);
    const menu = await Menu.new({ items: itensDoTauri });
    recursos.push(menu);
    await menu.popup(new LogicalPosition(x, y));
  } finally {
    abrindo = false;
  }
}
function doMenu(id, s) {
  const lado = ladoDoItem(id);
  if (lado) return ipc.configuracoes.gravar({ tomatoSize: lado });
  if (id === 'sempre-na-frente') return ipc.configuracoes.gravar({ tomatoOnTop: !s.tomatoOnTop });
  // Minimizar, e nunca esconder (5.3). Fechar passa pelo CloseRequested: o
  // Rust decide entre ficar na bandeja e sair (window/tomato.rs).
  if (id === 'minimizar') return getCurrentWindow().minimize();
  if (id === 'fechar') return getCurrentWindow().close();
  return acoes[id]?.();
}
document.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  let { clientX: x, clientY: y } = e;
  if (x === 0 && y === 0) {
    const r = (document.activeElement ?? stage).getBoundingClientRect();
    x = r.left + r.width / 2;
    y = r.top + r.height / 2;
  }
  rodar(() => abrirMenu(x, y));
});

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
  // A região antes do aviso: no Linux, ela precisa estar no widget antes do
  // show() (5.6), e o show() só vem depois do tt://tomato-ready.
  await enviarRegiao();
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
