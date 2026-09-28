// Tela Cronômetro (#/cronometro), M34. Como a do Relógio
// (stopwatch-in-clock-app.png): o número centrado, `hh:mm:ss,cc`, com os
// centésimos a 70% do tamanho depois da vírgula e as unidades (h, min, s)
// embaixo de cada par; embaixo, três botões circulares de 64 px: iniciar ou
// pausar (destaque), marcar volta (desabilitado fora da contagem) e
// redefinir (desabilitado zerado). "Expandir" e "Manter no topo" do Relógio
// não entram (sem botões mortos, 2.1).
//
// Quem conta é o Rust (engine.rs e o stopwatch.rs do núcleo), com `started_at`
// mais o acumulado. A tela lê o retrato do store e desenha o decorrido a cada
// quadro (requestAnimationFrame, só enquanto corre, 3.1): o store calcula o
// decorrido pelo `startedAt` e pelo relógio de parede, então esconder e
// mostrar a janela (ou trocar de tela) não perde tempo.
//
// Teclado (3.8): Espaço inicia ou pausa e L marca volta, com o foco fora de
// botões e campos (a mesma regra do Espaço da tela Foco, keys.js).
//
// O número muda a cada quadro e fica fora da árvore de acessibilidade; quem
// fala é o rótulo do role="img", que muda ao trocar de estado e, correndo,
// uma vez por minuto (3.8).
//
// M35: as voltas. Quem guarda é o Rust (o decorrido total em cada volta, no
// retrato `laps`); a tela deriva o tempo de cada volta (total menos o total
// da anterior) e mostra a lista embaixo dos botões, como o Relógio: a mais
// nova em cima, com as colunas Volta, Tempo e Total, em números tabulares e
// selecionáveis (.tt-selectable). "Copiar" põe na área de transferência o
// mesmo que a tela mostra, na mesma ordem, com o cabeçalho, uma linha por
// volta e as colunas separadas por tabulação: colado numa planilha, cada
// valor cai na sua célula.
import t from '../lib/i18n/pt-BR.js';
import { copiarTexto } from '../lib/copiar.js';
import { categoria, tempoDoCronometro } from '../lib/format.js';
import { espacoLivre, teclaLivre } from '../lib/keys.js';
import { store as storeDoApp } from '../lib/store.js';

const C = t.cronometro;
const semIcone = () => '';

/** A ação do botão de destaque: iniciar (zerado), pausar (correndo) ou retomar (pausado). */
export const acaoPrincipal = (status) => (status === 'running' ? 'pausar' : status === 'paused' ? 'retomar' : 'iniciar');

/** O comando do store para cada ação dos botões. */
const COMANDO = Object.freeze({ iniciar: 'iniciar', retomar: 'iniciar', pausar: 'pausar', volta: 'volta', redefinir: 'redefinir' });

/**
 * O rótulo do número (role="img"): "Cronômetro zerado", "Cronômetro
 * correndo, 3 minutos" (minutos inteiros, para mudar só uma vez por minuto)
 * ou "Cronômetro pausado em 00:01:05,43".
 */
export function rotulo(status, decorrido) {
  if (status === 'running') {
    const n = Math.floor(Math.max(decorrido, 0) / 60_000);
    return (C.rotulo.correndo[categoria(n)] ?? C.rotulo.correndo.other)(n);
  }
  if (status === 'paused') return C.rotulo.pausado(tempoDoCronometro(decorrido).texto);
  return C.rotulo.zerado;
}

/** O que a tela mostra de um retrato com `decorrido` ms (calculado agora). */
export function aparencia(c, decorrido = c?.elapsedMs ?? 0) {
  const status = c?.status ?? 'idle';
  return {
    status,
    tempo: tempoDoCronometro(decorrido),
    acao: acaoPrincipal(status),
    // Volta só contando; redefinir só com algo a zerar.
    podeVolta: status === 'running',
    podeRedefinir: status !== 'idle',
    rotulo: rotulo(status, decorrido),
  };
}

/**
 * As linhas da lista de voltas, na ordem da tela (a mais nova primeiro):
 * `{ numero, tempo, total }`, com os tempos em `hh:mm:ss,cc`. `laps` é o do
 * retrato: o decorrido total em cada volta, em ordem.
 */
export function linhasDasVoltas(laps = []) {
  const linhas = [];
  let anterior = 0;
  laps.forEach((total, i) => {
    linhas.push({ numero: String(i + 1), tempo: tempoDoCronometro(total - anterior).texto, total: tempoDoCronometro(total).texto });
    anterior = total;
  });
  return linhas.reverse();
}

/**
 * O texto do "Copiar": o cabeçalho e as linhas da tela, colunas separadas por
 * tabulação e linhas por quebra de linha (sem quebra depois da última). Sem
 * voltas, vazio.
 */
export function textoDasVoltas(laps = []) {
  const linhas = linhasDasVoltas(laps);
  if (!linhas.length) return '';
  const V = C.voltas;
  return [[V.volta, V.tempo, V.total], ...linhas.map((l) => [l.numero, l.tempo, l.total])].map((c) => c.join('\t')).join('\n');
}

const linhaDaVolta = (l) =>
  `<tr><td>${l.numero}</td><td>${l.tempo}</td><td>${l.total}</td></tr>`;

/** O corpo da tabela de voltas. */
export const corpoDasVoltas = (laps) => linhasDasVoltas(laps).map(linhaDaVolta).join('');

/** A seção das voltas: escondida sem voltas. */
export function marcacaoDasVoltas(laps = [], icone = semIcone) {
  const V = C.voltas;
  return (
    `<section class="tt-voltas" data-voltas aria-labelledby="tt-voltas-titulo"${laps.length ? '' : ' hidden'}>` +
    `<div class="tt-voltas-topo"><h2 class="tt-t-body-strong" id="tt-voltas-titulo">${V.titulo}</h2>` +
    `<span class="tt-voltas-aviso tt-t-caption" role="status" data-aviso></span>` +
    `<button type="button" data-copiar>${icone('copy')}<span>${V.copiar}</span></button></div>` +
    `<table class="tt-voltas-tabela tt-num tt-selectable">` +
    `<thead><tr><th scope="col">${V.volta}</th><th scope="col">${V.tempo}</th><th scope="col">${V.total}</th></tr></thead>` +
    `<tbody data-linhas>${corpoDasVoltas(laps)}</tbody></table></section>`
  );
}

const par = (campo, valor, unidade) =>
  `<span class="tt-cronometro-par"><span class="tt-cronometro-digitos" data-${campo}>${valor}</span>` +
  `<span class="tt-cronometro-unidade">${unidade}</span></span>`;

const botao = (classe, acao, rotuloDoBotao, conteudo, desabilitado = false) =>
  `<button type="button" class="tt-circular tt-grande${classe}" data-acao="${acao}" aria-label="${rotuloDoBotao}" data-dica${desabilitado ? ' disabled' : ''}>${conteudo}</button>`;

/** HTML da tela. `icone(nome, grade)` é o do components/icon.js. */
export function marcacao(c = null, { icone = semIcone, decorrido } = {}) {
  const ap = aparencia(c, decorrido);
  const { horas, minutos, segundos, centesimos } = ap.tempo;
  return (
    `<div class="tt-pagina tt-pagina-cronometro"><h1 class="tt-t-title" tabindex="-1">${t.navegacao.cronometro}</h1>` +
    `<div class="tt-cronometro" data-cronometro data-estado="${ap.status}">` +
    `<div class="tt-cronometro-tempo tt-num" role="img" aria-label="${ap.rotulo}" data-tempo>` +
    // Tudo dentro do role="img" é só visual: o leitor de tela lê o rótulo.
    par('horas', horas, C.unidades.h) +
    `<span class="tt-cronometro-sep">:</span>` +
    par('minutos', minutos, C.unidades.min) +
    `<span class="tt-cronometro-sep">:</span>` +
    par('segundos', segundos, C.unidades.s) +
    `<span class="tt-cronometro-centesimos">,<span data-centesimos>${centesimos}</span></span>` +
    `</div>` +
    `<div class="tt-cronometro-botoes">` +
    botao(' tt-accent', ap.acao, C[ap.acao], icone(ap.acao === 'pausar' ? 'pause' : 'play', 24)) +
    botao('', 'volta', C.volta, icone('flag', 24), !ap.podeVolta) +
    botao('', 'redefinir', C.redefinir, icone('arrow_reset', 24), !ap.podeRedefinir) +
    `</div>` +
    marcacaoDasVoltas(c?.laps ?? [], icone) +
    `</div></div>`
  );
}

const escrever = (el, texto) => {
  if (el && el.textContent !== texto) el.textContent = texto;
};

/**
 * `store` é o de lib/store.js (`cronometro`, `decorridoDoCronometro`,
 * `assinarCronometro` e `comandoDoCronometro`); os testes passam outro, ou
 * null para só desenhar. `quadro` e `cancelar` são o requestAnimationFrame e
 * o cancelAnimationFrame. `copiar(texto)` é o da lib/copiar.js, e
 * `esperar(f, ms)`/`desesperar(id)`, o setTimeout e o clearTimeout do aviso
 * do "Copiar". Devolve a limpeza.
 */
export function montar(raiz, {
  store = storeDoApp,
  icone = semIcone,
  quadro = (f) => requestAnimationFrame(f),
  cancelar = (id) => cancelAnimationFrame(id),
  doc = raiz.ownerDocument,
  copiar = copiarTexto,
  esperar = (f, ms) => setTimeout(f, ms),
  desesperar = (id) => clearTimeout(id),
} = {}) {
  const decorridoAgora = () => store?.decorridoDoCronometro?.() ?? store?.cronometro?.elapsedMs ?? 0;
  raiz.innerHTML = marcacao(store?.cronometro ?? null, { icone, decorrido: store ? decorridoAgora() : 0 });
  if (!store) return null;
  const caixa = raiz.querySelector('[data-cronometro]');
  const tempo = raiz.querySelector('[data-tempo]');
  const campos = {
    horas: raiz.querySelector('[data-horas]'),
    minutos: raiz.querySelector('[data-minutos]'),
    segundos: raiz.querySelector('[data-segundos]'),
    centesimos: raiz.querySelector('[data-centesimos]'),
  };
  const principal = raiz.querySelector('.tt-cronometro-botoes button:first-child');
  const volta = raiz.querySelector('button[data-acao="volta"]');
  const redefinir = raiz.querySelector('button[data-acao="redefinir"]');
  const voltas = raiz.querySelector('[data-voltas]');
  const linhas = raiz.querySelector('[data-linhas]');
  const aviso = raiz.querySelector('[data-aviso]');
  const copiarBotao = raiz.querySelector('[data-copiar]');
  let c = store.cronometro;
  let pedido = null;
  let voltasDesenhadas = JSON.stringify(c?.laps ?? []);
  let prazoDoAviso = null;

  const avisar = (texto) => {
    aviso.textContent = texto;
    if (prazoDoAviso !== null) desesperar(prazoDoAviso);
    prazoDoAviso = esperar(() => {
      prazoDoAviso = null;
      aviso.textContent = '';
    }, 3000);
  };

  const desenharVoltas = () => {
    const laps = c?.laps ?? [];
    const chave = JSON.stringify(laps);
    if (chave === voltasDesenhadas) return;
    voltasDesenhadas = chave;
    linhas.innerHTML = corpoDasVoltas(laps);
    if (!laps.length && voltas.contains(doc?.activeElement)) principal.focus();
    voltas.hidden = !laps.length;
    if (!laps.length) aviso.textContent = '';
  };

  const pintar = () => {
    const ap = aparencia(c, decorridoAgora());
    for (const [campo, el] of Object.entries(campos)) escrever(el, ap.tempo[campo]);
    if (tempo.getAttribute('aria-label') !== ap.rotulo) tempo.setAttribute('aria-label', ap.rotulo);
  };

  const passo = () => {
    pedido = null;
    if (c?.status !== 'running') return;
    pintar();
    pedido = quadro(passo);
  };

  // O foco não pode cair no <body> quando o botão com foco se desabilita.
  const habilitar = (botaoEl, sim) => {
    if (botaoEl.disabled === !sim) return;
    const tinhaFoco = doc?.activeElement === botaoEl;
    botaoEl.disabled = !sim;
    if (tinhaFoco && !sim) principal.focus();
  };

  const aplicar = (novo) => {
    if (!novo) return;
    c = novo;
    const ap = aparencia(c, decorridoAgora());
    caixa.dataset.estado = ap.status;
    if (principal.dataset.acao !== ap.acao) {
      principal.dataset.acao = ap.acao;
      principal.setAttribute('aria-label', C[ap.acao]);
      principal.innerHTML = icone(ap.acao === 'pausar' ? 'pause' : 'play', 24);
    }
    habilitar(volta, ap.podeVolta);
    habilitar(redefinir, ap.podeRedefinir);
    desenharVoltas();
    pintar();
    if (c.status === 'running' && pedido === null) pedido = quadro(passo);
  };

  const executar = (acao) => {
    const comando = COMANDO[acao];
    if (comando) store.comandoDoCronometro(comando).catch((erro) => console.warn('[cronômetro]', erro));
  };

  const aoClicar = (ev) => {
    const b = ev.target.closest?.('button[data-acao]');
    if (!b || b.disabled) return;
    executar(b.dataset.acao);
  };
  raiz.querySelector('.tt-cronometro-botoes').addEventListener('click', aoClicar);

  // "Copiar": dentro do próprio clique (a área de transferência pede o gesto
  // do usuário), com as voltas do último retrato.
  const aoCopiar = () => {
    const texto = textoDasVoltas(c?.laps ?? []);
    if (!texto) return;
    copiar(texto).then((ok) => avisar(ok ? C.voltas.copiado : C.voltas.falhou));
  };
  copiarBotao.addEventListener('click', aoCopiar);

  // Espaço inicia ou pausa, e L marca volta (só contando), com o foco fora
  // de botões e campos. Só enquanto a tela está montada.
  const aoTeclar = (e) => {
    if (espacoLivre(e)) {
      e.preventDefault();
      executar(principal.dataset.acao);
    } else if (teclaLivre(e, 'l')) {
      e.preventDefault();
      if (!volta.disabled) executar('volta');
    }
  };
  doc?.addEventListener('keydown', aoTeclar);

  const desassinar = store.assinarCronometro(aplicar);
  aplicar(store.cronometro);
  if (!store.cronometro) void store.sincronizar?.();

  return () => {
    desassinar();
    doc?.removeEventListener('keydown', aoTeclar);
    raiz.querySelector('.tt-cronometro-botoes')?.removeEventListener('click', aoClicar);
    copiarBotao.removeEventListener('click', aoCopiar);
    if (prazoDoAviso !== null) desesperar(prazoDoAviso);
    prazoDoAviso = null;
    if (pedido !== null) cancelar(pedido);
    pedido = null;
  };
}
