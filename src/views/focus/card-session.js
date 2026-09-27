// Cartão "Pronto para focar" da tela Foco (M17), como o do Relógio
// (clock-focus-sessions-page.png): o título, o texto da seção 2.1, o seletor
// de minutos, a frase dos intervalos, "Pular intervalos" e o botão de
// destaque "Iniciar sessão de foco". Tudo centrado, com as posições da
// captura (controls.css, .tt-sessao).
//
// Sem sessão (ocioso ou concluída), o cartão mostra o preparo. Com uma sessão
// em andamento, mostra o mostrador do M18 (andamento.js), e o título do cartão
// vira o cabeçalho da fase ("Período de foco (1 de 2)"), à esquerda, em cima,
// como no Relógio (o atributo data-modo do cartão troca o desenho, shell.css).
//
// M19: no pausado, o título ganha " · Pausado"; quando a sessão conclui, o
// cartão volta ao preparo sem animação (só troca o `hidden` dos blocos); e o
// Espaço inicia ou pausa (acaoDoEspaco).
//
// A frase segue a regra do plan.rs com o F e o B do preparo que o Rust manda
// no get_state (format.js, `intervalos`). O valor do seletor fica guardado
// enquanto o app está aberto: voltar à tela, ou terminar uma sessão, mostra a
// última duração escolhida.
import t from '../../lib/i18n/pt-BR.js';
import { fraseDosIntervalos, intervalos } from '../../lib/format.js';
import * as seletor from '../../components/minutes-picker.js';
import * as andamento from './andamento.js';
import { espacoLivre } from '../../lib/keys.js';

/** A duração que o seletor mostra ao abrir o app. */
export const MINUTOS_INICIAIS = 30;

const p = t.foco.preparo;
let lembrado = MINUTOS_INICIAIS;

/** O que o cartão mostra: o preparo (sem sessão) ou a sessão em andamento. */
export function modo(foco) {
  return foco?.session && foco.status !== 'completed' ? 'andamento' : 'preparo';
}

/** A faixa do seletor a partir do preparo do Rust (store.preparo). */
export const faixa = (preparo) => ({ min: preparo.minMinutes, max: preparo.maxMinutes, passo: preparo.stepMinutes });

/** A frase para uma duração, com o "Pular intervalos" marcado ou não. */
export const frase = (minutos, preparo, pular) => fraseDosIntervalos(intervalos(minutos, preparo, pular));

/** HTML do conteúdo do cartão (depois do título). */
export function marcacao(preparo, icone = () => '') {
  const f = faixa(preparo);
  const valor = seletor.limitar(lembrado, f);
  return (
    `<div class="tt-preparo" data-preparo>` +
    `<p class="tt-preparo-texto">${p.texto}</p>` +
    seletor.marcacao({ valor, ...f, descricao: 'foco-frase' }, icone) +
    `<p class="tt-preparo-frase" id="foco-frase" data-frase>${frase(valor, preparo, false)}</p>` +
    `<label class="tt-opcao tt-preparo-pular"><fluent-checkbox size="large" data-pular></fluent-checkbox>${p.pular}</label>` +
    `<button type="button" class="tt-accent tt-preparo-iniciar" data-iniciar>${icone('play')}${p.iniciar}</button>` +
    `</div>` +
    `<div data-andamento hidden>${andamento.marcacao(icone)}</div>`
  );
}

/**
 * O título do cartão: "Pronto para focar" no preparo; na sessão, a fase em
 * Subtitle e a contagem em peso normal ("Período de foco (1 de 2)"), mais o
 * estado ("Pausado", M19).
 */
export function titulo(foco) {
  const c = modo(foco) === 'andamento' ? andamento.cabecalho(foco) : null;
  if (!c) return { fase: t.foco.sessao, contagem: '', estado: '' };
  return c;
}

/** O resto do título, em peso normal: " (1 de 2)", " · Pausado" ou os dois. */
export function complemento({ contagem = '', estado = '' }) {
  return (contagem ? ` ${contagem}` : '') + (estado ? ` · ${estado}` : '');
}

/**
 * O que o Espaço faz na tela Foco (M19; PLANO.md, 3.8): no preparo, inicia a
 * sessão (como o botão "Iniciar sessão de foco"); com uma fase correndo,
 * pausa; pausado, retoma.
 */
export function acaoDoEspaco(foco) {
  if (modo(foco) === 'preparo') return 'iniciar';
  return andamento.acaoPrincipal(foco.status);
}

/**
 * Liga o cartão já desenhado ao store. `icone` é o do components/icon.js (o
 * glifo do botão de pausar muda com o estado). Devolve a função de limpeza.
 */
export function ligar(cartao, store, { icone = () => '' } = {}) {
  const preparo = cartao.querySelector('[data-preparo]');
  const blocoAndamento = cartao.querySelector('[data-andamento]');
  const fraseEl = cartao.querySelector('[data-frase]');
  const pular = cartao.querySelector('[data-pular]');
  const iniciar = cartao.querySelector('[data-iniciar]');
  const marcado = () => Boolean(pular.checked);
  const atualizarFrase = () => {
    fraseEl.textContent = frase(sel.valor, store.preparo, marcado());
  };
  const sel = seletor.ligarSeletor(preparo, {
    valor: lembrado,
    ...faixa(store.preparo),
    aoMudar: (v) => {
      lembrado = v;
      atualizarFrase();
    },
  });
  const aoMarcar = () => atualizarFrase();
  const aoIniciar = async () => {
    if (iniciar.disabled) return;
    iniciar.disabled = true;
    try {
      await store.comando('iniciar', sel.valor, { pularIntervalos: marcado() });
    } catch (erro) {
      console.warn('[foco]', erro);
    } finally {
      iniciar.disabled = false;
    }
  };
  pular.addEventListener('change', aoMarcar);
  iniciar.addEventListener('click', aoIniciar);
  const tituloEl = cartao.querySelector('h2');
  const desligarAndamento = andamento.ligar(blocoAndamento, store, { icone });
  let tituloAtual = null;
  const escreverTitulo = (foco) => {
    const tt = titulo(foco);
    const resto = complemento(tt);
    const chave = `${tt.fase}|${resto}`;
    if (chave === tituloAtual) return;
    tituloAtual = chave;
    tituloEl.textContent = tt.fase;
    if (resto) {
      const span = cartao.ownerDocument.createElement('span');
      span.className = 'tt-sessao-contagem';
      span.textContent = resto;
      tituloEl.append(span);
    }
  };

  const aoMudar = (foco) => {
    sel.configurar(faixa(store.preparo));
    atualizarFrase();
    const m = modo(foco);
    // O foco do teclado não pode ficar num bloco que vai sumir.
    const some = m === 'andamento' ? preparo : blocoAndamento;
    const focoIa = some.contains(cartao.ownerDocument?.activeElement ?? null);
    preparo.hidden = m !== 'preparo';
    blocoAndamento.hidden = m !== 'andamento';
    cartao.dataset.modo = m;
    escreverTitulo(foco);
    if (focoIa) cartao.closest('.tt-pagina')?.querySelector('h1[tabindex="-1"]')?.focus();
  };
  const desassinar = store.assinar(aoMudar);
  aoMudar(store.foco);

  // M19: Espaço inicia ou pausa, com o foco fora de botões e campos (onde o
  // Espaço já é do controle). Só enquanto a tela Foco está montada.
  const doc = cartao.ownerDocument;
  const aoTeclar = (e) => {
    if (!espacoLivre(e)) return;
    e.preventDefault();
    const acao = acaoDoEspaco(store.foco);
    if (acao === 'iniciar') void aoIniciar();
    else store.comando(acao).catch((erro) => console.warn('[foco]', erro));
  };
  doc.addEventListener('keydown', aoTeclar);
  return () => {
    doc.removeEventListener('keydown', aoTeclar);
    desassinar();
    desligarAndamento();
    sel.desligar();
    pular.removeEventListener('change', aoMarcar);
    iniciar.removeEventListener('click', aoIniciar);
  };
}
