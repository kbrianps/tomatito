// Tela Configurações (#/configuracoes). M24: a seção Aparência, com o cartão
// "Tema do aplicativo" no formato do SettingsCard do Relógio (ícone, título e
// descrição em cima) e as escolhas embaixo, num grupo de rádios. Cada opção tem
// uma prévia: uma janela em miniatura dentro de um <div data-theme="…">, que
// os tokens do próprio tema pintam (os seletores [data-theme] do tokens.css
// servem para isso, 4.2). "Usar configuração do sistema" mostra o Claro e o
// Escuro lado a lado, porque resolve para um dos dois (4.1). O Full fica fora
// da lista até o M51. O resto das Configurações chega no M38 e no M39.
//
// A escolha vai para o `aplicarTema` (lib/theme.js), que grava pelo
// `settings_set`; a tela acompanha o <html> pelo evento `tt-tema`, então uma
// troca que venha do `tt://settings` também marca o rádio certo.
import t from '../lib/i18n/pt-BR.js';
import { ESCOLHAS, EVENTO } from '../lib/theme.js';

const c = t.configuracoes;
const semIcone = () => '';

// A janela em miniatura: o painel (três itens), a camada de conteúdo e um
// cartão com duas linhas de texto e a ação principal. Só formas, sem texto.
const miniatura = (tema, extra = '') =>
  `<span class="tt-previa${extra}" data-theme="${tema}">` +
  '<span class="tt-previa-nav"><i></i><i></i><i></i></span>' +
  '<span class="tt-previa-camada"><span class="tt-previa-cartao">' +
  '<i class="tt-previa-texto"></i><i class="tt-previa-texto tt-previa-curto"></i><i class="tt-previa-acao"></i>' +
  '</span></span></span>';

/** A prévia de uma escolha: o próprio tema, ou o Claro e o Escuro lado a lado no Sistema. */
export function previa(escolha) {
  if (escolha === 'system') {
    return (
      '<span class="tt-previa-moldura tt-previa-dupla" aria-hidden="true">' +
      `<span class="tt-previa-metade">${miniatura('light')}</span>` +
      `<span class="tt-previa-metade">${miniatura('dark')}</span></span>`
    );
  }
  return `<span class="tt-previa-moldura" aria-hidden="true">${miniatura(escolha)}</span>`;
}

/** A escolha marcada para uma preferência salva: nenhuma no Full (que ainda não aparece). */
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
 * Devolve a limpeza (o roteador a chama ao sair da tela).
 */
export function montar(raiz, { icone = semIcone, tema = null, doc = globalThis.document } = {}) {
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
  return () => {
    grupo.removeEventListener('change', aoMudar);
    h.removeEventListener(EVENTO, aoTrocar);
  };
}
