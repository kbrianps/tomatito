// Cartão "Tarefas" da tela Foco (M30), como o do Relógio
// (clock-focus-sessions-page.png, microsoft-to-do-in-focus-sessions.png e,
// na sessão, windows-11-clock-with-focus-sessions.png), só com dados locais
// (tasks.rs, M29):
//   - cabeçalho com o `checkmark_circle`, "Tarefas", o "+" e o "…" (menu com
//     "Adicionar tarefa" e "Apagar concluídas");
//   - subtítulo "Escolha uma tarefa para a sessão"; durante a sessão, "Você
//     está focando em" (ou "Sessão sem tarefa escolhida", se ela começou sem
//     uma);
//   - linhas de 41 px com o círculo (pendente) ou o check preenchido
//     (concluída, com o texto em --tt-fg-2), o título e, sem sessão, o botão
//     "Escolher para a sessão" (aparece com o mouse em cima ou o foco do
//     teclado; na escolhida, fica à vista como "Escolhida") e o "x" de
//     apagar. Na sessão, as linhas que não são a tarefa da sessão ficam em
//     --tt-fg-2, e a da sessão tem a borda no accent (e aria-current), para
//     não depender só da cor: no Lite, o fg-1 e o fg-2 ficam perto;
//   - sem tarefas: "Mantenha o rumo" e o botão "Adicionar tarefa".
//
// A tarefa escolhida vive aqui, no módulo (como a duração do seletor no
// card-session.js): o "Iniciar sessão de foco" a lê por `escolhida()` e a
// manda no `focus_start{taskId}`; o Rust grava o `task_id` em cada período.
// Durante a sessão, quem manda é o retrato (`session.taskId`), que sobrevive
// ao reinício do app com a sessão. Uma escolhida concluída ou apagada deixa
// de ser escolhida.
//
// A lista vem do `task_list` (as pendentes e as concluídas desde a virada do
// dia) e é relida depois de cada mudança, a cada retrato do foco (o store
// também reenvia o retrato ao voltar a janela), a cada `tt://settings` (a
// hora de zerar) e uma vez por minuto com a janela visível (a virada).
import t from '../../lib/i18n/pt-BR.js';
import * as ipcDoApp from '../../lib/ipc.js';

const L = t.foco.listaDeTarefas;
/** Intervalo da releitura periódica, em ms (a virada do dia). */
export const RELEITURA_MS = 60_000;
/** O máximo do título, em caracteres (tasks.rs, MAX_TITLE_CHARS). */
export const MAX_TITULO = 255;

// A escolhida para a próxima sessão e a última lista lida (a tela abre já
// com ela ao voltar à Foco).
let escolhidaId = null;
let ultima = null;

/** A tarefa escolhida para a próxima sessão (id), ou null. */
export const escolhida = () => escolhidaId;
/** Só para os testes: esquece a escolhida e a última lista. */
export const esquecer = () => {
  escolhidaId = null;
  ultima = null;
};

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** O texto seguro para o HTML (o título vem do usuário). */
export const escapar = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);

/** Se há uma sessão em andamento (o mesmo critério do card-session.js). */
export const emSessao = (foco) => Boolean(foco?.session) && foco.status !== 'completed';

/**
 * O que o cartão mostra, a partir da lista e do retrato do foco:
 * `{ sessao, focada, escolhida, subtitulo, vazio }`. `focada` é a tarefa da
 * sessão (se ela ainda está na lista); `escolhida`, a da próxima sessão,
 * limpa se foi concluída ou sumiu.
 */
export function situacao(lista, foco, id = escolhidaId) {
  const tarefas = Array.isArray(lista) ? lista : [];
  const pendente = (x) => tarefas.some((tt) => tt.id === x && tt.doneAt == null);
  const sessao = emSessao(foco);
  const idDaSessao = sessao ? (foco.session.taskId ?? null) : null;
  const focada = idDaSessao != null && tarefas.some((tt) => tt.id === idDaSessao) ? idDaSessao : null;
  const esc = !sessao && id != null && pendente(id) ? id : null;
  let subtitulo = L.escolha;
  if (sessao) subtitulo = idDaSessao != null ? L.focando : L.semTarefa;
  return { sessao, focada, escolhida: esc, subtitulo, vazio: tarefas.length === 0 };
}

/**
 * HTML de uma linha. O círculo é um checkbox (role="checkbox") com o título
 * como nome; "Escolher para a sessão" é um botão de alternar (aria-pressed).
 */
export function linha(tarefa, s, icone = () => '') {
  const id = Number(tarefa.id);
  const feita = tarefa.doneAt != null;
  const tituloId = `tarefa-${id}-titulo`;
  const escolhidaAqui = s.escolhida === id;
  const focadaAqui = s.focada === id;
  const attrs =
    (feita ? ' data-feita' : '') +
    (escolhidaAqui ? ' data-escolhida' : '') +
    (focadaAqui ? ' data-focada aria-current="true"' : '') +
    (s.sessao && !focadaAqui ? ' data-esmaecida' : '');
  const check = feita ? icone('checkmark_circle', 20, 'filled') : icone('circle', 20);
  const escolher =
    s.sessao || feita
      ? ''
      : escolhidaAqui
        ? `<button type="button" class="tt-tarefa-escolher" aria-pressed="true" aria-describedby="${tituloId}" data-acao="escolher">${L.escolhida}</button>`
        : // Num cartão estreito, o texto visível encurta para "Escolher" (o
          // CSS escolhe pela largura do cartão), e o nome continua inteiro.
          `<button type="button" class="tt-tarefa-escolher" aria-pressed="false" aria-label="${L.escolher}" aria-describedby="${tituloId}" data-acao="escolher">` +
          `<span class="tt-escolher-longo" aria-hidden="true">${L.escolher}</span><span class="tt-escolher-curto" aria-hidden="true">${L.escolherCurto}</span></button>`;
  const apagar = focadaAqui
    ? ''
    : `<button type="button" class="tt-sutil tt-tarefa-apagar" aria-label="${L.apagar}" aria-describedby="${tituloId}" data-dica data-acao="apagar">${icone('dismiss')}</button>`;
  return (
    `<li class="tt-tarefa" data-tarefa="${id}"${attrs}>` +
    `<button type="button" role="checkbox" aria-checked="${feita}" aria-labelledby="${tituloId}" class="tt-tarefa-check" data-acao="concluir">${check}</button>` +
    `<span class="tt-tarefa-titulo" id="${tituloId}" title="${escapar(tarefa.title)}">${escapar(tarefa.title)}</span>` +
    escolher +
    apagar +
    `</li>`
  );
}

/** HTML das linhas, na ordem da lista (a de criação). */
export const linhas = (lista, s, icone) => (lista ?? []).map((x) => linha(x, s, icone)).join('');

const semIcone = () => '';

/** HTML do conteúdo do cartão (depois do título). */
export function marcacao({ icone = semIcone } = {}) {
  return (
    `<div class="tt-tarefas-acoes">` +
    `<button type="button" class="tt-sutil" aria-label="${L.adicionar}" data-dica data-adicionar>${icone('add')}</button>` +
    `<fluent-menu data-menu-tarefas>` +
    `<button type="button" slot="trigger" class="tt-sutil" aria-label="${L.mais}" data-dica data-mais-tarefas>${icone('more_horizontal')}</button>` +
    `<fluent-menu-list>` +
    `<fluent-menu-item data-item="adicionar">${L.adicionar}</fluent-menu-item>` +
    `<fluent-menu-item data-item="apagar-concluidas" disabled>${L.apagarConcluidas}</fluent-menu-item>` +
    `</fluent-menu-list></fluent-menu></div>` +
    `<div class="tt-tarefas-corpo"${ultima ? '' : ' data-carregando'} data-tarefas>` +
    `<p class="tt-tarefas-sub" data-sub>${L.escolha}</p>` +
    `<ul class="tt-tarefas-lista" data-lista></ul>` +
    `<form class="tt-tarefa-nova" data-nova hidden>` +
    `<input type="text" class="tt-texto" aria-label="${L.campo}" placeholder="${L.dicaDoCampo}" maxlength="${MAX_TITULO}" autocomplete="off" enterkeyhint="done" data-campo>` +
    `</form>` +
    `<p class="tt-tarefas-erro" role="alert" data-erro hidden></p>` +
    `<div class="tt-tarefas-vazio" data-vazio hidden>` +
    `<p class="tt-tarefas-vazio-titulo">${L.vazio}</p>` +
    `<p class="tt-tarefas-vazio-texto">${L.vazioTexto}</p>` +
    `<button type="button" data-adicionar-vazio>${icone('add')}${L.adicionar}</button>` +
    `</div>` +
    `</div>`
  );
}

/** A mensagem de um erro do `task_*` ({ code, message }). */
export const mensagemDeErro = (erro) => (erro?.code === 'titleTooLong' ? L.longa : L.erro);

/**
 * Liga o cartão já desenhado. `store` é o do lib/store.js; `ipc`, o
 * lib/ipc.js (`tarefas.*`, `ouvir` e `EVENTOS`). Devolve a função de limpeza.
 */
export function ligar(cartao, store, { ipc = ipcDoApp, doc = cartao.ownerDocument, relogio = globalThis, icone = semIcone } = {}) {
  const corpo = cartao.querySelector('[data-tarefas]');
  const sub = cartao.querySelector('[data-sub]');
  const listaEl = cartao.querySelector('[data-lista]');
  const nova = cartao.querySelector('[data-nova]');
  const campo = cartao.querySelector('[data-campo]');
  const erroEl = cartao.querySelector('[data-erro]');
  const vazioEl = cartao.querySelector('[data-vazio]');
  const mais = cartao.querySelector('[data-adicionar]');
  const menu = cartao.querySelector('[data-menu-tarefas]');
  const apagarConcluidas = cartao.querySelector('fluent-menu-item[data-item="apagar-concluidas"]');
  let lista = ultima;
  let desligado = false;
  let pedidos = 0;
  let aplicado = 0;
  let desenhado = null;

  const avisar = (erro) => {
    if (erro) console.warn('[tarefas]', erro);
    erroEl.textContent = erro ? mensagemDeErro(erro) : '';
    erroEl.hidden = !erro;
  };

  const desenhar = () => {
    if (!lista) return;
    const s = situacao(lista, store?.foco);
    // A escolhida concluída ou apagada deixa de ser escolhida; na sessão, a
    // da sessão continua escolhida para a próxima.
    if (s.sessao) escolhidaId = s.focada;
    else escolhidaId = s.escolhida;
    corpo.removeAttribute('data-carregando');
    corpo.toggleAttribute('data-sessao', s.sessao);
    if (sub.textContent !== s.subtitulo) sub.textContent = s.subtitulo;
    const vazio = s.vazio && nova.hidden;
    sub.hidden = vazio;
    vazioEl.hidden = !vazio;
    if (lista.some((x) => x.doneAt != null)) apagarConcluidas.removeAttribute('disabled');
    else apagarConcluidas.setAttribute('disabled', '');
    const html = linhas(lista, s, icone);
    if (html === desenhado) return;
    // Guarda o foco do teclado: a mesma ação na mesma linha, ou o círculo da
    // linha, ou o "+" se a linha sumiu.
    const ativo = doc?.activeElement ?? null;
    const linhaAtiva = listaEl.contains(ativo) ? ativo.closest('[data-tarefa]') : null;
    const alvo = linhaAtiva ? { id: linhaAtiva.dataset.tarefa, acao: ativo.dataset?.acao } : null;
    listaEl.innerHTML = html;
    desenhado = html;
    if (alvo) {
      const li = listaEl.querySelector(`[data-tarefa="${alvo.id}"]`);
      const b = li?.querySelector(`[data-acao="${alvo.acao}"]`) ?? li?.querySelector('[data-acao="concluir"]');
      (b ?? (vazio ? vazioEl.querySelector('button') : mais))?.focus();
    }
  };

  const atualizar = async () => {
    const meu = ++pedidos;
    try {
      const l = await ipc.tarefas.listar();
      if (desligado || meu < aplicado) return;
      lista = l;
      ultima = l;
      aplicado = meu;
      desenhar();
    } catch (erro) {
      console.warn('[tarefas]', erro);
    }
  };

  const mudar = async (acao) => {
    try {
      await acao();
      avisar(null);
    } catch (erro) {
      avisar(erro);
    }
    if (!desligado) await atualizar();
  };

  const abrirCampo = () => {
    nova.hidden = false;
    vazioEl.hidden = true;
    sub.hidden = false;
    campo.focus();
  };
  const fecharCampo = ({ devolver = true } = {}) => {
    const tinhaFoco = nova.contains(doc?.activeElement ?? null);
    campo.value = '';
    nova.hidden = true;
    avisar(null);
    desenhar();
    if (devolver && tinhaFoco) (vazioEl.hidden ? mais : vazioEl.querySelector('button'))?.focus();
  };

  const aoEnviar = (e) => {
    e.preventDefault();
    const titulo = campo.value;
    if (!titulo.trim()) return;
    campo.value = '';
    void mudar(() => ipc.tarefas.adicionar(titulo)).then(() => {
      // Recusado: o texto volta para o campo, para corrigir.
      if (!erroEl.hidden && !campo.value) campo.value = titulo;
    });
  };
  const aoTeclarNoCampo = (e) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    fecharCampo();
  };
  // Sair do campo vazio o fecha; com texto, ele fica aberto.
  const aoSairDoCampo = () => {
    if (!campo.value.trim()) fecharCampo({ devolver: false });
  };

  const aoClicarNaLista = (e) => {
    const b = e.target.closest?.('button[data-acao]');
    const li = b?.closest('[data-tarefa]');
    if (!b || !li || !listaEl.contains(li)) return;
    const id = Number(li.dataset.tarefa);
    const tarefa = lista?.find((x) => x.id === id);
    if (!tarefa) return;
    if (b.dataset.acao === 'concluir') void mudar(() => ipc.tarefas.concluir(id, tarefa.doneAt == null));
    else if (b.dataset.acao === 'apagar') void mudar(() => ipc.tarefas.apagar(id));
    else if (b.dataset.acao === 'escolher') {
      escolhidaId = escolhidaId === id ? null : id;
      desenhar();
    }
  };

  const aoEscolherNoMenu = (e) => {
    const item = e.target.closest?.('fluent-menu-item[data-item]');
    if (!item || !cartao.contains(item) || item.hasAttribute('disabled')) return;
    if (item.dataset.item === 'adicionar') abrirCampo();
    else if (item.dataset.item === 'apagar-concluidas') {
      const feitas = (lista ?? []).filter((x) => x.doneAt != null).map((x) => x.id);
      void mudar(async () => {
        for (const id of feitas) await ipc.tarefas.apagar(id);
      });
    }
  };

  const botaoVazio = vazioEl.querySelector('button');
  mais.addEventListener('click', abrirCampo);
  botaoVazio.addEventListener('click', abrirCampo);
  nova.addEventListener('submit', aoEnviar);
  campo.addEventListener('keydown', aoTeclarNoCampo);
  campo.addEventListener('blur', aoSairDoCampo);
  listaEl.addEventListener('click', aoClicarNaLista);
  menu?.addEventListener('change', aoEscolherNoMenu);

  const desassinar = store?.assinar(() => {
    desenhar();
    void atualizar();
  }) ?? (() => {});
  let pararDeOuvir = null;
  Promise.resolve(ipc.ouvir(ipc.EVENTOS.configuracoes, () => void atualizar()))
    .then((f) => (desligado ? f?.() : (pararDeOuvir = f)))
    .catch((erro) => console.warn('[tarefas]', erro));
  const periodico = relogio.setInterval(() => {
    if (doc?.visibilityState !== 'hidden') void atualizar();
  }, RELEITURA_MS);
  desenhar();
  void atualizar();

  return () => {
    desligado = true;
    mais.removeEventListener('click', abrirCampo);
    botaoVazio.removeEventListener('click', abrirCampo);
    nova.removeEventListener('submit', aoEnviar);
    campo.removeEventListener('keydown', aoTeclarNoCampo);
    campo.removeEventListener('blur', aoSairDoCampo);
    listaEl.removeEventListener('click', aoClicarNaLista);
    menu?.removeEventListener('change', aoEscolherNoMenu);
    menu?.closeMenu?.();
    desassinar();
    pararDeOuvir?.();
    relogio.clearInterval(periodico);
  };
}
