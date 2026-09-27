// Cartão "Pronto para focar" da tela Foco (M17), como o do Relógio
// (clock-focus-sessions-page.png): o título, o texto da seção 2.1, o seletor
// de minutos, a frase dos intervalos, "Pular intervalos" e o botão de
// destaque "Iniciar sessão de foco". Tudo centrado, com as posições da
// captura (controls.css, .tt-sessao).
//
// Sem sessão (ocioso ou concluída), o cartão mostra o preparo. Com uma sessão
// em andamento, mostra a contagem provisória do M16 (contagem.js), até o
// mostrador do M18.
//
// A frase segue a regra do plan.rs com o F e o B do preparo que o Rust manda
// no get_state (format.js, `intervalos`). O valor do seletor fica guardado
// enquanto o app está aberto: voltar à tela, ou terminar uma sessão, mostra a
// última duração escolhida.
import t from '../../lib/i18n/pt-BR.js';
import { fraseDosIntervalos, intervalos } from '../../lib/format.js';
import * as seletor from '../../components/minutes-picker.js';
import * as contagem from './contagem.js';

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
    `<div data-andamento hidden>${contagem.marcacao()}</div>`
  );
}

/** Liga o cartão já desenhado ao store. Devolve a função de limpeza. */
export function ligar(cartao, store) {
  const preparo = cartao.querySelector('[data-preparo]');
  const andamento = cartao.querySelector('[data-andamento]');
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
  const desligarContagem = contagem.ligar(andamento, store);

  const aoMudar = (foco) => {
    sel.configurar(faixa(store.preparo));
    atualizarFrase();
    const m = modo(foco);
    // O foco do teclado não pode ficar num bloco que vai sumir.
    const some = m === 'andamento' ? preparo : andamento;
    const focoIa = some.contains(cartao.ownerDocument?.activeElement ?? null);
    preparo.hidden = m !== 'preparo';
    andamento.hidden = m !== 'andamento';
    if (focoIa) cartao.closest('.tt-pagina')?.querySelector('h1[tabindex="-1"]')?.focus();
  };
  const desassinar = store.assinar(aoMudar);
  aoMudar(store.foco);
  return () => {
    desassinar();
    desligarContagem();
    sel.desligar();
    pular.removeEventListener('change', aoMarcar);
    iniciar.removeEventListener('click', aoIniciar);
  };
}
