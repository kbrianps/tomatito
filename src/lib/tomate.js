// O que o tomate do Tomatito Full mostra (PLANO.md, 5.10; M50), sem DOM: o
// estado do desenho, o rótulo, o tempo, a contagem, o anel e os botões, a
// partir do retrato do foco (o mesmo `tt://state` da tela Foco). O
// src/tomato.js escreve isso na página e liga os botões aos comandos focus_*.
//
// Decisões do M50 (docs/decisoes.md, M50), para o que o protótipo não tinha:
//   - ocioso: o desenho do Foco, sem anel, "Pronto", o tempo da
//     sessão que o botão principal inicia (30 min, como o seletor da tela
//     Foco e o "Iniciar foco" da bandeja) e "Sessão de 30 min";
//   - concluída: o desenho do Foco, o anel cheio, "Concluída", 00:00 e a
//     duração da sessão; o botão principal inicia outra;
//   - a contagem usa o vocabulário da tela Foco: "Período de foco (1 de 2)"
//     no foco e "A seguir: foco de 25 min" no intervalo;
//   - "Reiniciar sessão" virou "Encerrar sessão" (focus_stop), como no menu
//     da tela Foco: o motor não tem reinício, e parar e iniciar de novo
//     gravaria um período interrompido sem o usuário pedir.
import t from './i18n/pt-BR.js';
import { minutosPorExtenso, minutosRestantes, mmss, plurais } from './format.js';
import { cabecalho, rodape } from '../views/focus/andamento.js';

const tt = t.tomate;
const a = t.foco.andamento;

/**
 * A duração, em minutos, da sessão que o botão principal inicia sem sessão.
 * É a mesma com que o seletor da tela Foco abre (`MINUTOS_INICIAIS`, 30, no
 * card-session.js) e a do "Iniciar foco" da bandeja (`MINUTOS_AO_INICIAR`,
 * tray.rs), sem pular intervalos e sem tarefa.
 */
export const MINUTOS_AO_INICIAR = 30;

/** A faixa visível do anel: pathLength 100, menos 5,5 sob o cálice em cada ponta. */
export const FAIXA_DO_ANEL = 89;

/**
 * O estado do desenho (`data-state` do .stage): `idle`, `focus`, `break`,
 * `paused` ou `completed`. As cores de Foco, Intervalo e Pausado estão no
 * tokens.css (4.2); o ocioso e a concluída usam as do Foco.
 */
export function estadoDoTomate(foco) {
  if (!foco?.session || foco.status === 'idle') return 'idle';
  if (foco.status === 'completed' || foco.status === 'paused') return foco.status;
  return foco.session.phase.kind;
}

/** Se há uma fase em andamento (correndo ou pausada). */
const emAndamento = (estado) => estado === 'focus' || estado === 'break' || estado === 'paused';

/**
 * O restante da fase em ms, agora. O prazo vem do `endsAt` do retrato (o
 * `ends_at_ms` do Rust, no relógio de parede): com o relógio real
 * (`velocidade` 1), é `endsAt − agora`, igual em todas as janelas e sem o
 * atraso do IPC. Com o relógio acelerado do debug (`TOMATITO_SPEED`), o
 * relógio do Rust não é o do JS, e vale a estimativa do store (`estimado`).
 * Pausada, a fase não tem prazo, e vale o `remainingMs` do retrato.
 */
export function restanteDaFase(foco, { agora, velocidade = 1, estimado = null } = {}) {
  const s = foco?.session;
  if (!s) return null;
  if (s.endsAt == null) return s.remainingMs;
  if (velocidade === 1 && Number.isFinite(agora)) return Math.max(0, s.endsAt - agora);
  return estimado ?? s.remainingMs;
}

/** O que o botão principal faz: iniciar (sem sessão), pausar ou retomar. */
export function acaoPrincipal(estado) {
  if (estado === 'paused') return 'retomar';
  return emAndamento(estado) ? 'pausar' : 'iniciar';
}

/** A contagem, embaixo do tempo. */
function contagem(foco, estado) {
  if (estado === 'idle') return tt.sessaoDe(MINUTOS_AO_INICIAR);
  if (estado === 'completed') return tt.sessaoDe(foco.session.minutes);
  if (estado === 'break') {
    const r = rodape(foco);
    if (r) return `${r.rotulo} ${r.valor}`;
  }
  const c = cabecalho(foco);
  return c.contagem ? `${c.fase} ${c.contagem}` : c.fase;
}

/**
 * Tudo o que a página mostra agora, a partir do retrato e do restante da
 * fase (`restanteDaFase`):
 *   - `estado`, `rotulo`, `tempo` (mm:ss, arredondado para cima, como a tela
 *     Foco arredonda os minutos) e `contagem`;
 *   - `anel`: o comprimento do traço aceso, de 0 a 89 (`stroke-dasharray:
 *     anel 200`), pela fração decorrida da fase no segundo mostrado;
 *   - `segundos`: o segundo mostrado (o relógio da página só mexe no DOM
 *     quando ele muda) e `minutos`: os minutos do rótulo do tempo;
 *   - os botões: `principal` ({ acao, rotulo, icone }), `encerrar` e `pular`
 *     ({ rotulo, ativo }).
 */
export function vista(foco, restanteMs) {
  const estado = estadoDoTomate(foco);
  const s = foco?.session;
  const andamento = emAndamento(estado);
  let segundos = 0;
  if (estado === 'idle') segundos = MINUTOS_AO_INICIAR * 60;
  else if (andamento) segundos = Number.isFinite(restanteMs) && restanteMs > 0 ? Math.ceil(restanteMs / 1000) : 0;
  const duracaoS = andamento ? s.phase.durationS : 0;
  let fracao = 0;
  if (estado === 'completed') fracao = 1;
  else if (andamento && duracaoS > 0) fracao = Math.min(1, Math.max(0, 1 - segundos / duracaoS));
  const acao = acaoPrincipal(estado);
  const proxima = andamento ? s.next : null;
  return {
    estado,
    rotulo: tt.estados[estado],
    tempo: mmss(segundos * 1000),
    segundos,
    minutos: andamento ? minutosRestantes(segundos * 1000) : null,
    contagem: contagem(foco, estado),
    anel: Math.round(FAIXA_DO_ANEL * fracao * 100) / 100,
    principal: {
      acao,
      rotulo: acao === 'iniciar' ? t.foco.preparo.iniciar : a[acao],
      icone: acao === 'pausar' ? 'pause' : 'play',
    },
    encerrar: { rotulo: a.encerrar, ativo: andamento },
    pular: proxima
      ? { rotulo: tt.pular[proxima.kind] ?? tt.pular.nenhum, ativo: true }
      : { rotulo: tt.pular.nenhum, ativo: false },
  };
}

/**
 * O rótulo do tempo (`role="timer"`), que muda no máximo uma vez por minuto
 * (3.8): "18 minutos restantes" (", pausado" na pausa), "30 minutos" no
 * ocioso e "Concluída" no fim.
 */
export function rotuloDoTempo(v) {
  if (v.estado === 'idle') return minutosPorExtenso(MINUTOS_AO_INICIAR);
  if (v.estado === 'completed') return tt.estados.completed;
  // Em pt-BR, o 0 cai em "one" no PluralRules; "0 minutos restantes".
  const restantes = v.minutos === 0 ? a.restantes.other(0) : plurais(v.minutos, a.restantes);
  return v.estado === 'paused' ? tt.pausadoNoRotulo(restantes) : restantes;
}

/**
 * A chave da fase: muda quando o anel volta ao começo ou pula para o fim
 * (outra fase, outra sessão, a sessão concluída ou encerrada). Nessas horas
 * o anel não anda com a transição de 1 s: ele vai direto para o lugar.
 * Pausar e retomar não mudam a chave (a cor do corpo muda em 0,4 s).
 */
export function chaveDaFase(foco) {
  const s = foco?.session;
  const estado = estadoDoTomate(foco);
  const fim = estado === 'idle' || estado === 'completed' ? estado : 'andamento';
  return `${fim}:${s?.id ?? '-'}:${s?.phaseIndex ?? '-'}`;
}
