// Tela Configurações (#/configuracoes). M24: a seção Aparência, com o cartão
// "Tema do aplicativo" no formato do SettingsCard do Relógio (ícone, título e
// descrição em cima) e as escolhas embaixo, num grupo de rádios. Cada opção tem
// uma prévia: uma janela em miniatura dentro de um <div data-theme="…">, que
// os tokens do próprio tema pintam (os seletores [data-theme] do tokens.css
// servem para isso, 4.2). "Usar configuração do sistema" mostra o Claro e o
// Escuro lado a lado, porque resolve para um dos dois (4.1). M51: o Tomatito
// Full entra na lista, com o tomate sobre uma área de trabalho em miniatura;
// escolhê-lo abre a janela-tomate e esconde esta (5.7). O resto das
// Configurações chega no M38 e no M39.
//
// A escolha vai para o `aplicarTema` (lib/theme.js), que grava pelo
// `settings_set`; a tela acompanha o <html> pelo evento `tt-tema`, então uma
// troca que venha do `tt://settings` também marca o rádio certo.
import t from '../lib/i18n/pt-BR.js';
import { ESCOLHAS, EVENTO } from '../lib/theme.js';
import { ligarDicaSempreNaFrente } from './dica-sempre-na-frente.js';
import { ligarOpcaoX11 } from './opcao-x11.js';

const c = t.configuracoes;
// M56: o `tomato_on_top_available`, carregado só quando a dica precisa (os
// testes em Node montam a tela sem o Tauri).
const sempreNaFrente = () => import('../lib/ipc.js').then((ipc) => ipc.full.sempreNaFrente());
const semIcone = () => '';

// A janela em miniatura: o painel (três itens), a camada de conteúdo e um
// cartão com duas linhas de texto e a ação principal. Só formas, sem texto.
const miniatura = (tema, extra = '') =>
  `<span class="tt-previa${extra}" data-theme="${tema}">` +
  '<span class="tt-previa-nav"><i></i><i></i><i></i></span>' +
  '<span class="tt-previa-camada"><span class="tt-previa-cartao">' +
  '<i class="tt-previa-texto"></i><i class="tt-previa-texto tt-previa-curto"></i><i class="tt-previa-acao"></i>' +
  '</span></span></span>';

// O tomate em miniatura (as formas do tomato.html, 5.10): o corpo, o anel
// em parte, o cabinho e o cálice, sobre uma área de trabalho neutra.
const TOMATE =
  '<svg class="tt-previa-tomate" viewBox="0 0 320 320" focusable="false">' +
  '<path class="tt-previa-corpo" d="M160 80 C190 64 236 62 268 86 C296 108 306 150 300 190 C293 252 236 298 160 298 C84 298 27 252 20 190 C14 150 24 108 52 86 C84 62 130 64 160 80 Z"/>' +
  '<path class="tt-previa-anel" pathLength="100" d="M160 88.4 C187.6 73.7 229.9 71.8 259.4 93.9 C285.1 114.2 294.3 152.8 288.8 189.6 C282.4 246.6 229.9 289 160 289 C90.1 289 37.6 246.6 31.2 189.6 C25.7 152.8 34.9 114.2 60.6 93.9 C90.1 71.8 132.4 73.7 160 88.4 Z"/>' +
  '<path class="tt-previa-cabinho" d="M155.5 88 C155 74 157 60 160.5 47.5 Q163.5 43 169 45.5 C166 58 164.8 72 165.5 88 Z"/>' +
  '<path class="tt-previa-calice" d="M166 83 Q190 66 216 77 Q192 92 164 91 Z M154 83 Q130 66 104 77 Q128 92 156 91 Z M155 90 Q148 100 147 113 Q158 105 165 91 Z M165 82 Q176 64 192 60 Q186 76 168 87 Z M155 82 Q140 64 126 62 Q134 76 152 87 Z"/>' +
  '</svg>';

/**
 * A prévia de uma escolha: o próprio tema, o Claro e o Escuro lado a lado no
 * Sistema, ou o tomate sobre a área de trabalho no Full.
 */
export function previa(escolha) {
  if (escolha === 'full') {
    return `<span class="tt-previa-moldura" aria-hidden="true"><span class="tt-previa tt-previa-full" data-theme="full">${TOMATE}</span></span>`;
  }
  if (escolha === 'system') {
    return (
      '<span class="tt-previa-moldura tt-previa-dupla" aria-hidden="true">' +
      `<span class="tt-previa-metade">${miniatura('light')}</span>` +
      `<span class="tt-previa-metade">${miniatura('dark')}</span></span>`
    );
  }
  return `<span class="tt-previa-moldura" aria-hidden="true">${miniatura(escolha)}</span>`;
}

/** A escolha marcada para uma preferência salva (o Full também, desde o M51). */
export const escolhaDe = (pref) => (ESCOLHAS.includes(pref) ? pref : null);

/**
 * HTML da tela. `pref` é o `data-theme-pref` atual; `icone(nome, grade)`, o
 * do components/icon.js (os testes passam um falso).
 */
export function marcacao({ pref = 'lite', icone = semIcone } = {}) {
  const marcada = escolhaDe(pref);
  const opcoes = ESCOLHAS.map(
    (e) =>
      `<label class="tt-tema" data-tema="${e}"${e === marcada ? ' data-marcado' : ''}>${previa(e)}` +
      `<span class="tt-opcao"><fluent-radio value="${e}"></fluent-radio>${c.temas[e]}</span></label>`,
  ).join('');
  return (
    `<div class="tt-pagina"><h1 class="tt-t-title" tabindex="-1">${t.navegacao.configuracoes}</h1>` +
    '<section class="tt-config-secao" aria-labelledby="config-aparencia">' +
    `<h2 id="config-aparencia" class="tt-t-body-strong">${c.aparencia}</h2>` +
    '<div class="tt-config-cartao" data-cartao="tema">' +
    `<div class="tt-config-cabecalho"><span class="tt-config-icone">${icone('paint_brush', 20)}</span>` +
    `<span class="tt-config-textos"><span id="config-tema" class="tt-config-titulo">${c.tema}</span>` +
    `<span id="config-tema-desc" class="tt-config-descricao tt-t-caption">${c.temaDescricao}</span></span></div>` +
    '<fluent-radio-group class="tt-temas" name="tema" orientation="horizontal" ' +
    `aria-labelledby="config-tema" aria-describedby="config-tema-desc"${marcada ? ` value="${marcada}"` : ''}>` +
    `${opcoes}</fluent-radio-group></div></section></div>`
  );
}

/** Marca a opção `pref` no grupo e no `data-marcado` das molduras. */
export function marcar(grupo, pref) {
  const marcada = escolhaDe(pref);
  for (const op of grupo.querySelectorAll('.tt-tema')) op.toggleAttribute('data-marcado', op.dataset.tema === marcada);
  if (marcada && grupo.value !== marcada) grupo.value = marcada;
  if (!marcada) for (const r of grupo.querySelectorAll('fluent-radio')) r.checked = false;
}

/**
 * `tema.aplicar(pref)` é o `aplicarTema` com as dependências da janela (o
 * main.js o passa pelo contexto do roteador); sem ele, a tela só desenha.
 * `porCodigo()` resolve com o `tomato_on_top_available` (M56, a dica).
 * Devolve a limpeza (o roteador a chama ao sair da tela).
 */
export function montar(raiz, { icone = semIcone, tema = null, doc = globalThis.document, porCodigo = sempreNaFrente, compatX11 } = {}) {
  const h = doc.documentElement;
  raiz.innerHTML = marcacao({ pref: h.dataset.themePref, icone });
  const grupo = raiz.querySelector('.tt-temas');
  const aoMudar = async () => {
    const pref = grupo.value;
    if (!tema || !ESCOLHAS.includes(pref) || pref === h.dataset.themePref) return;
    marcar(grupo, pref);
    try {
      await tema.aplicar(pref);
    } catch (erro) {
      console.error('[tema]', erro);
      marcar(grupo, h.dataset.themePref); // o aplicarTema já devolveu o <html> ao tema anterior
    }
  };
  const aoTrocar = (e) => marcar(grupo, e.detail.pref);
  grupo.addEventListener('change', aoMudar);
  h.addEventListener(EVENTO, aoTrocar);
  // M56: a dica do Alt+Espaço no Wayland (dica-sempre-na-frente.js).
  const semDica = ligarDicaSempreNaFrente(raiz.querySelector('.tt-config-secao'), { doc, porCodigo, evento: EVENTO });
  // M57: a Compatibilidade X11 (opcao-x11.js), no fim da página.
  const semX11 = ligarOpcaoX11(raiz.querySelector('.tt-pagina'), { doc, icone, ipc: compatX11 });
  return () => {
    grupo.removeEventListener('change', aoMudar);
    h.removeEventListener(EVENTO, aoTrocar);
    semDica();
    semX11();
  };
}
