// Tela Configurações (#/configuracoes). M24: a seção Aparência, com o cartão
// "Tema do aplicativo" no formato do SettingsCard do Relógio (ícone, título e
// descrição em cima) e as escolhas embaixo, num grupo de rádios. Cada opção tem
// uma prévia: uma janela em miniatura dentro de um <div data-theme="…">, que
// os tokens do próprio tema pintam (os seletores [data-theme] do tokens.css
// servem para isso, 4.2). "Usar configuração do sistema" mostra o Claro e o
// Escuro lado a lado, porque resolve para um dos dois (4.1). O Full fica fora
// da lista até o M51. O resto das Configurações chega no M39.
//
// A escolha vai para o `aplicarTema` (lib/theme.js), que grava pelo
// `settings_set`; a tela acompanha o <html> pelo evento `tt-tema`, então uma
// troca que venha do `tt://settings` também marca o rádio certo.
//
// M38: o título em Title Large e, antes da Aparência, a seção "Sessões de
// foco", com os cartões expansíveis do Relógio (clock-focus-sessions-
// settings.png; o SettingsExpander do WinUI): "Períodos de foco" (o período
// de foco e o intervalo, em listas), "Som de fim de foco" e "Som de fim de
// intervalo" (o switch no cabeçalho e, aberto, o "Testar") e o cartão
// "Volume", que não abre. O cabeçalho de um expansível é um <button> com
// aria-expanded; o switch fica ao lado dele, e não dentro (um controle dentro
// de um botão é HTML inválido), na mesma linha pela grade do shell.css.
//
// Os valores vêm do store (a última cópia das configurações: get_state,
// tt://settings e a resposta do settings_set) e cada mudança grava só a
// própria chave pelo `store.gravarConfiguracoes`. Se o Rust recusar, o
// controle volta ao valor do store e o erro vai para o console, como na troca
// de tema (M24): o que se vê nunca fica diferente do que está no disco.
//
// M39: depois da Aparência, a seção "Sistema" ("Fechar para a bandeja" e
// "Tempo na bandeja", em cartões com switch, e "Sair do Tomatito", que chama
// o mesmo `app_quit` do Ctrl+Q) e a seção "Sobre", com um expansível como o
// "Sobre" dos apps do WinUI: o nome, a licença e a versão (`getVersion()`,
// do Cargo.toml) no cabeçalho; aberto, os avisos de terceiros (o botão só
// funciona a partir do M46) e o aviso de marcas (seção 9 do plano). As
// opções que dependem de um recurso da plataforma (platform/recursos.js)
// somem quando ele falta: hoje, o "Tempo na bandeja" sem o ícone da bandeja.
import t from '../lib/i18n/pt-BR.js';
import { ESCOLHAS, EVENTO } from '../lib/theme.js';
import { minutosPorExtenso } from '../lib/format.js';
import { store as storeDoApp } from '../lib/store.js';
import * as ipcDoApp from '../lib/ipc.js';
import { SEM_RECURSOS, assinarRecursos, recursos as recursosAtuais } from '../platform/recursos.js';
import { marcaDoApp } from '../components/app-mark.js';

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

// M38: a seção "Sessões de foco".

/**
 * As opções das listas, em minutos. O período de foco (o F da regra dos
 * intervalos, 3.2) de 15 a 60, de 5 em 5; o intervalo (B), 5, 10 e 15, os do
 * Relógio. Um valor gravado fora da lista (à mão no settings.json, que aceita
 * F de 1 a 240 e B de 1 a 60) entra na lista, na ordem, para não sumir.
 */
export const FOCOS = Object.freeze([15, 20, 25, 30, 35, 40, 45, 50, 55, 60]);
export const INTERVALOS = Object.freeze([5, 10, 15]);

/** Os padrões da 3.3 para as chaves da tela, até o store ter a cópia do Rust. */
export const PADROES = Object.freeze({
  focusMinutes: 25,
  breakMinutes: 5,
  sounds: Object.freeze({ focusEnd: true, breakEnd: true }),
  volume: 80,
  // M39
  closeToTray: true,
  trayTime: false,
});

/** Os valores de uma lista com o atual incluído, em ordem. */
export function valoresDaLista(lista, atual) {
  return Number.isInteger(atual) && atual > 0 && !lista.includes(atual) ? [...lista, atual].sort((a, b) => a - b) : [...lista];
}

// As duas listas: a chave do settings.json, o id do rótulo e as opções.
const LISTAS = Object.freeze([
  { chave: 'focusMinutes', id: 'config-foco-rotulo', rotulo: c.periodos.foco, valores: FOCOS },
  { chave: 'breakMinutes', id: 'config-intervalo-rotulo', rotulo: c.periodos.intervalo, valores: INTERVALOS },
]);

// Os dois sons: a chave em `sounds`, o id do cartão e os textos.
export const SONS = Object.freeze([
  { chave: 'focusEnd', id: 'som-foco', textos: c.somFoco },
  { chave: 'breakEnd', id: 'som-intervalo', textos: c.somIntervalo },
]);

/** Os cartões abertos, lembrados enquanto o app roda (voltar à tela os reabre). */
const abertos = new Set();

/** O texto ao lado do switch. */
export const textoDoEstado = (ligado) => (ligado ? c.ativado : c.desativado);

/** Escreve o texto ao lado de um switch já desenhado ("Ativado" ou "Desativado"). */
function escreverEstado(sw) {
  const el = sw.parentElement?.querySelector('[data-estado]');
  if (el) el.textContent = textoDoEstado(Boolean(sw.checked));
}

/** Um volume válido (0 a 100) ou o padrão. */
const volumeDe = (v) => (Number.isInteger(v) && v >= 0 && v <= 100 ? v : PADROES.volume);

// Ícone, título e descrição de um cartão, com os ids que os controles usam
// como nome (aria-labelledby) e descrição (aria-describedby).
const cabeca = (id, iconeHtml, titulo, descricao) =>
  `<span class="tt-config-icone">${iconeHtml}</span>` +
  `<span class="tt-config-textos"><span id="config-${id}" class="tt-config-titulo">${titulo}</span>` +
  `<span id="config-${id}-desc" class="tt-config-descricao tt-t-caption">${descricao}</span></span>`;

/**
 * Um cartão expansível (o SettingsExpander): o cabeçalho de 68 px é um botão
 * com o chevron, e `acao` (o switch, nos sons) fica na mesma linha, fora do
 * botão; o conteúdo, embaixo, com uma linha por item. M39: `valor` é um texto
 * do cabeçalho (a versão, no Sobre), dentro do botão, na coluna do meio, e
 * entra na descrição acessível.
 */
function expansor({ id, iconeHtml, titulo, descricao, acao = '', valor = null, conteudo, chevron, aberto = false }) {
  const descritoPor = valor === null ? `config-${id}-desc` : `config-${id}-desc config-${id}-valor`;
  return (
    `<div class="tt-config-cartao tt-expansor" data-cartao="${id}"${aberto ? ' data-aberto' : ''}>` +
    '<div class="tt-expansor-topo">' +
    `<button type="button" class="tt-expansor-botao" data-expansor aria-expanded="${aberto}" ` +
    `aria-controls="config-${id}-conteudo" aria-labelledby="config-${id}" aria-describedby="${descritoPor}">` +
    `<span class="tt-config-cabeca">${cabeca(id, iconeHtml, titulo, descricao)}</span>` +
    (valor === null ? '' : `<span id="config-${id}-valor" class="tt-expansor-valor">${valor}</span>`) +
    `<span class="tt-expansor-chevron">${chevron}</span></button>` +
    acao +
    '</div>' +
    `<div id="config-${id}-conteudo" class="tt-expansor-conteudo" role="group" aria-labelledby="config-${id}"${aberto ? '' : ' hidden'}>` +
    `${conteudo}</div></div>`
  );
}

const item = (rotuloId, rotulo, controle) =>
  `<div class="tt-config-item"><span id="${rotuloId}" class="tt-config-item-rotulo">${rotulo}</span>${controle}</div>`;

const opcoesDaLista = (valores, atual) =>
  valores
    .map((v) => `<fluent-option value="${v}"${v === atual ? ' selected' : ''}>${minutosPorExtenso(v)}</fluent-option>`)
    .join('');

/**
 * HTML da seção "Sessões de foco" com os valores de `s` (as configurações, no
 * formato do settings.json). `abertosAgora` são os ids dos cartões abertos.
 */
export function marcacaoDasSessoes(s = PADROES, { icone = semIcone, abertosAgora = new Set() } = {}) {
  const chevron = icone('chevron_down', 16);
  const listas = LISTAS.map(({ chave, id, rotulo, valores }) =>
    item(
      id,
      rotulo,
      `<fluent-dropdown data-config="${chave}" data-rotulo="${id}">` +
        `<fluent-listbox>${opcoesDaLista(valoresDaLista(valores, s[chave]), s[chave])}</fluent-listbox></fluent-dropdown>`,
    ),
  ).join('');
  const periodos = expansor({
    id: 'periodos',
    iconeHtml: icone('target', 20),
    titulo: c.periodos.titulo,
    descricao: c.periodos.descricao,
    conteudo: listas,
    chevron,
    aberto: abertosAgora.has('periodos'),
  });
  const sons = SONS.map(({ chave, id, textos }) => {
    const ligado = s.sounds?.[chave] !== false;
    const acao =
      `<label class="tt-expansor-acao"><span class="tt-config-estado" data-estado aria-hidden="true">${textoDoEstado(ligado)}</span>` +
      `<fluent-switch data-som="${chave}" aria-labelledby="config-${id}" aria-describedby="config-${id}-desc"${ligado ? ' checked' : ''}></fluent-switch></label>`;
    const testar =
      `<span class="tt-config-item-acoes"><span class="tt-config-valor">${textos.som}</span>` +
      `<button type="button" data-testar="${chave}" aria-label="${textos.testar}">${icone('play', 16)}${c.testar}</button></span>`;
    return expansor({
      id,
      iconeHtml: icone('clock_alarm', 20),
      titulo: textos.titulo,
      descricao: textos.descricao,
      acao,
      conteudo: item(`config-${id}-som`, c.somDoAviso, testar),
      chevron,
      aberto: abertosAgora.has(id),
    });
  }).join('');
  const v = volumeDe(s.volume);
  const volume =
    '<div class="tt-config-cartao" data-cartao="volume"><div class="tt-config-cabecalho">' +
    cabeca('volume', icone('speaker_2', 20), c.volume.titulo, c.volume.descricao) +
    '<span class="tt-config-controle">' +
    `<input type="range" class="tt-deslizante" min="0" max="100" step="1" value="${v}" data-config="volume" ` +
    `aria-labelledby="config-volume" aria-describedby="config-volume-desc" aria-valuetext="${c.volume.valor(v)}">` +
    `<span class="tt-config-valor tt-num" data-volume-valor aria-hidden="true">${v}</span></span></div></div>`;
  return (
    '<section class="tt-config-secao" aria-labelledby="config-sessoes">' +
    `<h2 id="config-sessoes" class="tt-t-body-strong">${c.sessoes}</h2>` +
    `${periodos}${sons}${volume}</section>`
  );
}

// M39: as seções "Sistema" e "Sobre".

/**
 * Os switches da seção "Sistema": a chave do settings.json, o id do cartão, o
 * ícone (grade de 20), os textos, o padrão da 3.3 e o recurso de que a opção
 * precisa (platform/recursos.js). Os dois valem na hora: o Rust lê o
 * `closeToTray` a cada fechamento e avisa a bandeja do `trayTime` no próprio
 * `settings_set` (M36).
 */
export const OPCOES_DO_SISTEMA = Object.freeze([
  Object.freeze({ chave: 'closeToTray', id: 'fechar-bandeja', icone: 'arrow_minimize', textos: c.fecharParaBandeja, padrao: true, precisa: null }),
  Object.freeze({ chave: 'trayTime', id: 'tempo-bandeja', icone: 'clock', textos: c.tempoNaBandeja, padrao: false, precisa: 'bandeja' }),
]);

/** Se a opção vale com os recursos `rec` (a que não se aplica some da tela). */
export const seAplica = (opcao, rec) => !opcao.precisa || rec?.[opcao.precisa] === true;

/** O valor de uma opção do sistema nas configurações `s`, ou o padrão. */
const ligadaEm = (s, opcao) => (typeof s?.[opcao.chave] === 'boolean' ? s[opcao.chave] : opcao.padrao);

/**
 * HTML da seção "Sistema" com os valores de `s` e os recursos `recursos`: um
 * cartão com switch por opção (escondido, com `hidden`, se não se aplica) e o
 * cartão "Sair do Tomatito", com o botão.
 */
export function marcacaoDoSistema(s = PADROES, { icone = semIcone, recursos = SEM_RECURSOS } = {}) {
  const opcoes = OPCOES_DO_SISTEMA.map((o) => {
    const ligado = ligadaEm(s, o);
    return (
      `<div class="tt-config-cartao" data-cartao="${o.id}"${seAplica(o, recursos) ? '' : ' hidden'}><div class="tt-config-cabecalho">` +
      cabeca(o.id, icone(o.icone, 20), o.textos.titulo, o.textos.descricao) +
      `<label class="tt-config-controle"><span class="tt-config-estado" data-estado aria-hidden="true">${textoDoEstado(ligado)}</span>` +
      `<fluent-switch data-config="${o.chave}" aria-labelledby="config-${o.id}" aria-describedby="config-${o.id}-desc"${ligado ? ' checked' : ''}></fluent-switch></label>` +
      '</div></div>'
    );
  }).join('');
  // O nome do botão é o título do cartão, que começa pelo texto visível (WCAG 2.5.3).
  const sair =
    '<div class="tt-config-cartao" data-cartao="sair"><div class="tt-config-cabecalho">' +
    cabeca('sair', icone('power', 20), c.sair.titulo, c.sair.descricao) +
    '<span class="tt-config-controle"><button type="button" data-sair aria-labelledby="config-sair" aria-describedby="config-sair-desc">' +
    `${c.sair.botao}</button></span></div></div>`;
  return (
    '<section class="tt-config-secao" aria-labelledby="config-sistema">' +
    `<h2 id="config-sistema" class="tt-t-body-strong">${c.sistema}</h2>${opcoes}${sair}</section>`
  );
}

/** A versão, lida uma vez do Tauri e guardada enquanto o app roda. */
let versaoConhecida = null;

/**
 * HTML da seção "Sobre": o expansível com o nome, a licença e a versão
 * (`versao`, ou vazio até o `getVersion()` responder) e, aberto, os avisos de
 * terceiros e o aviso de marcas.
 */
export function marcacaoDoSobre({ icone = semIcone, versao = null, abertosAgora = new Set() } = {}) {
  const avisos = item(
    'config-avisos',
    c.sobre.avisos,
    // M46: os avisos entram no pacote (bundle.resources) e este botão os abre.
    `<button type="button" data-avisos aria-describedby="config-avisos" disabled>${c.sobre.verAvisos}</button>`,
  );
  const marcas = `<div class="tt-config-item tt-config-nota"><p id="config-marcas" class="tt-config-descricao tt-t-caption">${c.sobre.marcas}</p></div>`;
  return (
    '<section class="tt-config-secao" aria-labelledby="config-sobre-secao">' +
    `<h2 id="config-sobre-secao" class="tt-t-body-strong">${c.sobre.secao}</h2>` +
    expansor({
      id: 'sobre',
      iconeHtml: marcaDoApp('tt-marca'),
      titulo: t.app.nome,
      descricao: c.sobre.licenca,
      valor: versao ? c.sobre.versao(versao) : '',
      conteudo: avisos + marcas,
      chevron: icone('chevron_down', 16),
      aberto: abertosAgora.has('sobre'),
    }) +
    '</section>'
  );
}

/**
 * HTML da tela. `pref` é o `data-theme-pref` atual; `icone(nome, grade)`, o
 * do components/icon.js (os testes passam um falso); `configuracoes`, a cópia
 * do store (M38); `recursos` e `versao`, os do M39.
 */
export function marcacao({
  pref = 'lite',
  icone = semIcone,
  configuracoes = PADROES,
  abertosAgora = new Set(),
  recursos = SEM_RECURSOS,
  versao = null,
} = {}) {
  const marcada = escolhaDe(pref);
  const opcoes = ESCOLHAS.map(
    (e) =>
      `<label class="tt-tema" data-tema="${e}"${e === marcada ? ' data-marcado' : ''}>${previa(e)}` +
      `<span class="tt-opcao"><fluent-radio value="${e}"></fluent-radio>${c.temas[e]}</span></label>`,
  ).join('');
  return (
    `<div class="tt-pagina"><h1 class="tt-t-title-large" tabindex="-1">${t.navegacao.configuracoes}</h1>` +
    marcacaoDasSessoes(configuracoes, { icone, abertosAgora }) +
    '<section class="tt-config-secao" aria-labelledby="config-aparencia">' +
    `<h2 id="config-aparencia" class="tt-t-body-strong">${c.aparencia}</h2>` +
    '<div class="tt-config-cartao" data-cartao="tema">' +
    `<div class="tt-config-cabecalho"><span class="tt-config-icone">${icone('paint_brush', 20)}</span>` +
    `<span class="tt-config-textos"><span id="config-tema" class="tt-config-titulo">${c.tema}</span>` +
    `<span id="config-tema-desc" class="tt-config-descricao tt-t-caption">${c.temaDescricao}</span></span></div>` +
    '<fluent-radio-group class="tt-temas" name="tema" orientation="horizontal" ' +
    `aria-labelledby="config-tema" aria-describedby="config-tema-desc"${marcada ? ` value="${marcada}"` : ''}>` +
    `${opcoes}</fluent-radio-group></div></section>` +
    marcacaoDoSistema(configuracoes, { icone, recursos }) +
    marcacaoDoSobre({ icone, versao, abertosAgora }) +
    '</div>'
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
 * O patch do `settings_set` para uma mudança num controle da seção, ou null
 * se o valor não serve (uma lista sem escolha, um volume fora de 0 a 100). Não
 * compara com a cópia do store: o `change` só sai quando o controle muda, e
 * duas mudanças seguidas (ligar e desligar antes da primeira resposta) gravam
 * as duas, na ordem, e a última vale.
 */
export function patchDe(controle, valor) {
  if (controle === 'focusMinutes' || controle === 'breakMinutes') {
    const n = Number(valor);
    return valor === '' || !Number.isInteger(n) || n < 1 ? null : { [controle]: n };
  }
  if (controle === 'volume') {
    const n = Number(valor);
    return valor === '' || !Number.isInteger(n) || n < 0 || n > 100 ? null : { volume: n };
  }
  if (SONS.some((s) => s.chave === controle)) return { sounds: { [controle]: Boolean(valor) } };
  if (OPCOES_DO_SISTEMA.some((o) => o.chave === controle)) return { [controle]: Boolean(valor) };
  return null;
}

/** Abre ou fecha o cartão expansível do botão `botao`. */
export function alternar(botao, aberto = botao.getAttribute('aria-expanded') !== 'true') {
  const cartao = botao.closest('.tt-expansor');
  botao.setAttribute('aria-expanded', String(aberto));
  cartao.toggleAttribute('data-aberto', aberto);
  const conteudo = cartao.querySelector('.tt-expansor-conteudo');
  if (conteudo) conteudo.hidden = !aberto;
  if (aberto) abertos.add(cartao.dataset.cartao);
  else abertos.delete(cartao.dataset.cartao);
  return aberto;
}

/**
 * Liga a seção "Sessões de foco" já desenhada em `raiz` ao store e ao IPC.
 * Devolve a limpeza.
 */
export function ligarSessoes(raiz, { store = storeDoApp, ipc = ipcDoApp, doc = globalThis.document } = {}) {
  const win = doc?.defaultView ?? globalThis;
  const secao = raiz.querySelector('[aria-labelledby="config-sessoes"]');
  const listas = [...raiz.querySelectorAll('fluent-dropdown[data-config]')];
  const switches = [...raiz.querySelectorAll('fluent-switch[data-som]')];
  const volume = raiz.querySelector('input[data-config="volume"]');
  const valorDoVolume = raiz.querySelector('[data-volume-valor]');
  let arrastando = false;
  let desligado = false;
  const atuais = () => store.configuracoes ?? PADROES;

  // O rótulo visível de cada lista vira o nome do <button role="combobox">
  // que o fluent-dropdown cria (o modelo do M12 e do M28). Ele nasce numa
  // fila do FAST: se ainda não existe, no quadro seguinte.
  const rotularListas = () => {
    for (const dd of listas) dd.control?.setAttribute('aria-labelledby', dd.dataset.rotulo);
  };
  rotularListas();
  win.requestAnimationFrame?.(() => !desligado && rotularListas());

  const pintarVolume = () => {
    const v = volumeDe(Number(volume.value));
    volume.style.setProperty('--tt-fracao', String(v / 100));
    volume.setAttribute('aria-valuetext', c.volume.valor(v));
    valorDoVolume.textContent = String(v);
  };
  const garantirOpcao = (dd, v) => {
    if (!Number.isInteger(v) || v < 1) return;
    const lista = dd.querySelector('fluent-listbox');
    const opcoes = [...lista.querySelectorAll('fluent-option')];
    if (opcoes.some((o) => Number(o.value ?? o.getAttribute('value')) === v)) return;
    const nova = doc.createElement('fluent-option');
    nova.setAttribute('value', String(v));
    nova.textContent = minutosPorExtenso(v);
    const depois = opcoes.find((o) => Number(o.getAttribute('value')) > v);
    lista.insertBefore(nova, depois ?? null);
  };
  // Escolhe `v` na lista sem emitir `change`. Uma opção recém-posta só entra
  // nas opções do fluent-listbox depois do `slotchange`: até lá, tenta de
  // novo (poucas vezes, a cada 16 ms).
  const escolher = (dd, v, tentativas = 5) => {
    if (desligado || dd.value === String(v)) return;
    dd.value = String(v);
    if (dd.value !== String(v) && tentativas > 0) win.setTimeout(() => escolher(dd, v, tentativas - 1), 16);
  };

  /** Mostra `s` nos controles (do store, ou de volta depois de uma recusa). */
  const mostrar = (s) => {
    if (desligado || !s) return;
    for (const dd of listas) {
      const v = s[dd.dataset.config];
      garantirOpcao(dd, v);
      if (Number.isInteger(v)) escolher(dd, v);
    }
    for (const sw of switches) {
      const ligado = s.sounds?.[sw.dataset.som] !== false;
      if (Boolean(sw.checked) !== ligado) sw.checked = ligado;
      escreverEstado(sw);
    }
    // Não puxa o controle de quem está arrastando.
    if (!arrastando && Number.isInteger(s.volume) && volume.value !== String(s.volume)) {
      volume.value = String(s.volume);
      pintarVolume();
    }
  };

  const gravar = async (patch) => {
    if (!patch) return;
    try {
      await store.gravarConfiguracoes(patch);
    } catch (erro) {
      console.error('[configurações]', erro);
      mostrar(atuais());
    }
  };

  const aoMudar = (ev) => {
    const alvo = ev.target;
    if (alvo.matches?.('fluent-dropdown[data-config]')) {
      void gravar(patchDe(alvo.dataset.config, alvo.value));
    } else if (alvo.matches?.('fluent-switch[data-som]')) {
      escreverEstado(alvo);
      void gravar(patchDe(alvo.dataset.som, alvo.checked));
    } else if (alvo === volume) {
      arrastando = false;
      pintarVolume();
      void gravar(patchDe('volume', volume.value));
    }
  };
  const aoArrastar = () => pintarVolume();
  const aoApertar = () => {
    arrastando = true;
  };
  const aoSoltar = () => {
    arrastando = false;
  };
  const aoClicar = (ev) => {
    const expansor = ev.target.closest?.('[data-expansor]');
    if (expansor) {
      alternar(expansor);
      return;
    }
    const testar = ev.target.closest?.('[data-testar]');
    if (testar) {
      Promise.resolve(ipc.sons.testar(testar.dataset.testar)).catch((erro) => console.error('[som]', erro));
    }
  };

  secao.addEventListener('change', aoMudar);
  secao.addEventListener('click', aoClicar);
  volume.addEventListener('input', aoArrastar);
  volume.addEventListener('pointerdown', aoApertar);
  doc.addEventListener('pointerup', aoSoltar);
  doc.addEventListener('pointercancel', aoSoltar);
  pintarVolume();
  // A marcação já saiu com a cópia do store; daqui em diante, cada cópia nova.
  const desassinar = store.assinarConfiguracoes(mostrar);
  return () => {
    desligado = true;
    desassinar();
    secao.removeEventListener('change', aoMudar);
    secao.removeEventListener('click', aoClicar);
    volume.removeEventListener('input', aoArrastar);
    volume.removeEventListener('pointerdown', aoApertar);
    doc.removeEventListener('pointerup', aoSoltar);
    doc.removeEventListener('pointercancel', aoSoltar);
  };
}

/**
 * M39: liga as seções "Sistema" e "Sobre" já desenhadas em `raiz` ao store,
 * aos recursos e ao IPC. Os switches gravam só a própria chave (recusado, o
 * switch volta ao valor do store); "Sair" chama o `app_quit`, que não
 * responde (o processo sai antes); o expansível do Sobre abre e fecha; a
 * versão chega pelo `ipc.versao()` na primeira vez. Devolve a limpeza.
 */
export function ligarSistemaESobre(
  raiz,
  { store = storeDoApp, ipc = ipcDoApp, recursos = { atuais: () => recursosAtuais, assinar: assinarRecursos } } = {},
) {
  const sistema = raiz.querySelector('[aria-labelledby="config-sistema"]');
  const sobre = raiz.querySelector('[aria-labelledby="config-sobre-secao"]');
  const switches = [...sistema.querySelectorAll('fluent-switch[data-config]')];
  let desligado = false;

  const mostrar = (s) => {
    if (desligado || !s) return;
    for (const sw of switches) {
      const ligado = ligadaEm(s, OPCOES_DO_SISTEMA.find((o) => o.chave === sw.dataset.config));
      if (Boolean(sw.checked) !== ligado) sw.checked = ligado;
      escreverEstado(sw);
    }
  };
  const aplicarRecursos = (rec) => {
    if (desligado) return;
    for (const o of OPCOES_DO_SISTEMA) {
      const cartao = sistema.querySelector(`[data-cartao="${o.id}"]`);
      if (cartao) cartao.hidden = !seAplica(o, rec);
    }
  };
  const escreverVersao = (v) => {
    const el = sobre.querySelector('#config-sobre-valor');
    if (el) el.textContent = c.sobre.versao(v);
  };

  const aoMudar = async (ev) => {
    const sw = ev.target;
    if (!sw.matches?.('fluent-switch[data-config]')) return;
    escreverEstado(sw);
    const patch = patchDe(sw.dataset.config, sw.checked);
    if (!patch) return;
    try {
      await store.gravarConfiguracoes(patch);
    } catch (erro) {
      console.error('[configurações]', erro);
      mostrar(store.configuracoes ?? PADROES);
    }
  };
  const aoClicarNoSistema = (ev) => {
    if (!ev.target.closest?.('[data-sair]')) return;
    Promise.resolve(ipc.sair()).catch((erro) => console.error('[sair]', erro));
  };
  const aoClicarNoSobre = (ev) => {
    const botao = ev.target.closest?.('[data-expansor]');
    if (botao) alternar(botao);
  };

  sistema.addEventListener('change', aoMudar);
  sistema.addEventListener('click', aoClicarNoSistema);
  sobre.addEventListener('click', aoClicarNoSobre);
  // A marcação saiu com a cópia do store e os recursos de então; daqui em
  // diante, cada cópia nova (e os recursos, que chegam no mesmo get_state).
  aplicarRecursos(recursos.atuais());
  const desassinarRecursos = recursos.assinar(aplicarRecursos);
  const desassinar = store.assinarConfiguracoes(mostrar);
  if (versaoConhecida) escreverVersao(versaoConhecida);
  else {
    Promise.resolve(ipc.versao?.())
      .then((v) => {
        if (typeof v !== 'string' || !v) return;
        versaoConhecida = v;
        if (!desligado) escreverVersao(v);
      })
      .catch((erro) => console.error('[versão]', erro));
  }
  return () => {
    desligado = true;
    desassinar();
    desassinarRecursos();
    sistema.removeEventListener('change', aoMudar);
    sistema.removeEventListener('click', aoClicarNoSistema);
    sobre.removeEventListener('click', aoClicarNoSobre);
  };
}

/**
 * `tema.aplicar(pref)` é o `aplicarTema` com as dependências da janela (o
 * main.js o passa pelo contexto do roteador); sem ele, a tela só desenha.
 * `store` e `ipc` (M38) são os do app; os testes passam falsos.
 * Devolve a limpeza (o roteador a chama ao sair da tela).
 */
export function montar(raiz, { icone = semIcone, tema = null, doc = globalThis.document, store = storeDoApp, ipc = ipcDoApp } = {}) {
  const h = doc.documentElement;
  raiz.innerHTML = marcacao({
    pref: h.dataset.themePref,
    icone,
    configuracoes: store.configuracoes ?? PADROES,
    abertosAgora: abertos,
    recursos: recursosAtuais,
    versao: versaoConhecida,
  });
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
  const desligarSessoes = ligarSessoes(raiz, { store, ipc, doc });
  const desligarSistema = ligarSistemaESobre(raiz, { store, ipc });
  return () => {
    grupo.removeEventListener('change', aoMudar);
    h.removeEventListener(EVENTO, aoTrocar);
    desligarSessoes();
    desligarSistema();
  };
}
