// A seção "Atualização" das Configurações, só no desktop (v0.3;
// src-tauri/src/update.rs). Dois cartões:
//
// - "Atualizações": [Procurar atualizações] consulta o último release no
//   GitHub; havendo versão nova, o botão vira [Atualizar agora], que baixa,
//   instala e reinicia o Tomatito;
// - "Procurar ao abrir" (a `autoUpdate`, desligada por padrão): a mesma
//   consulta, sozinha, a cada início.
//
// Sem a opção e sem o clique, o Tomatito não acessa a internet. Quem decide
// se a seção existe é o Rust (`update_info`: o app precisa ter vindo de um
// instalador). Módulo à parte, ligado por uma linha no settings.js, como o
// opcao-x11.js; a seção entra antes do Avançado (ou do Sobre).
import t from '../lib/i18n/pt-BR.js';

const a = t.configuracoes.atualizarApp;
const semIcone = () => '';

// O IPC, carregado só quando a tela monta (os testes em Node passam um falso).
const ipcPadrao = () =>
  import('../lib/ipc.js').then((ipc) => ({
    info: ipc.atualizacao.info,
    procurar: ipc.atualizacao.procurar,
    instalar: ipc.atualizacao.instalar,
    obter: ipc.configuracoes.obter,
    gravar: ipc.configuracoes.gravar,
    ouvir: ipc.ouvir,
    EVENTOS: ipc.EVENTOS,
  }));

/**
 * O que o cartão mostra em cada estado (`{ tipo, ... }`): o texto e o botão
 * (`acao` é `'procurar'` ou `'instalar'`; `ocupado` desabilita o botão).
 */
export function quadro(estado, canal = null) {
  switch (estado?.tipo) {
    case 'procurando':
      return { texto: a.procurando, botao: a.procurar, acao: 'procurar', ocupado: true };
    case 'atual':
      return { texto: a.atual(estado.versao), botao: a.procurar, acao: 'procurar', ocupado: false };
    case 'disponivel':
      return { texto: a.disponivel(estado.versao), botao: a.instalar, acao: 'instalar', ocupado: false };
    case 'baixando':
      return { texto: estado.fracao == null ? a.baixando : a.baixandoEm(Math.round(estado.fracao * 100)), botao: a.instalar, acao: 'instalar', ocupado: true };
    case 'instalando':
      return { texto: a.instalando, botao: a.instalar, acao: 'instalar', ocupado: true };
    case 'erroDeRede':
      return { texto: a.erroDeRede, botao: a.procurar, acao: 'procurar', ocupado: false };
    case 'erroAoInstalar':
      return { texto: a.erroAoInstalar, botao: a.procurar, acao: 'procurar', ocupado: false };
    default:
      return { texto: canal === 'deb' ? a.descricaoDeb : a.descricao, botao: a.procurar, acao: 'procurar', ocupado: false };
  }
}

/** A fração baixada (0 a 1), ou null sem o tamanho total. */
export function fracao({ downloaded, total } = {}) {
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(downloaded)) return null;
  return Math.min(1, Math.max(0, downloaded / total));
}

/** HTML da seção: o cartão do botão e o da opção "Procurar ao abrir". */
export function marcacao({ canal = null, auto = false, estado = null, icone = semIcone } = {}) {
  const q = quadro(estado, canal);
  return (
    '<section class="tt-config-secao" aria-labelledby="config-atualizacao-app" data-secao="atualizacao-app">' +
    `<h2 id="config-atualizacao-app" class="tt-t-body-strong">${a.secao}</h2>` +
    '<div class="tt-config-cartao" data-cartao="atualizar-app"><div class="tt-config-cabecalho">' +
    `<span class="tt-config-icone">${icone('arrow_sync', 20)}</span>` +
    `<span class="tt-config-textos"><span id="config-atualizar-app" class="tt-config-titulo">${a.titulo}</span>` +
    `<span id="config-atualizar-app-desc" class="tt-config-descricao tt-t-caption" role="status">${q.texto}</span></span>` +
    `<span class="tt-config-controle"><button type="button" data-atualizar-app="${q.acao}" aria-describedby="config-atualizar-app-desc"` +
    `${q.acao === 'instalar' ? ' class="tt-accent"' : ''}${q.ocupado ? ' disabled' : ''}>${q.botao}</button></span>` +
    '</div></div>' +
    '<div class="tt-config-cartao" data-cartao="atualizar-ao-abrir"><div class="tt-config-cabecalho">' +
    `<span class="tt-config-icone">${icone('clock', 20)}</span>` +
    `<span class="tt-config-textos"><span id="config-atualizar-auto" class="tt-config-titulo">${a.auto.titulo}</span>` +
    `<span id="config-atualizar-auto-desc" class="tt-config-descricao tt-t-caption">${a.auto.descricao}</span></span>` +
    `<fluent-switch class="tt-config-controle" aria-labelledby="config-atualizar-auto" aria-describedby="config-atualizar-auto-desc"${auto ? ' checked' : ''}></fluent-switch>` +
    '</div></div></section>'
  );
}

/**
 * Liga a seção na página (`.tt-pagina`). Sem instalador (`update_info`), não
 * mostra nada. Devolve a limpeza.
 */
export function ligarAtualizarApp(pagina, { icone = semIcone, ipc = ipcPadrao } = {}) {
  let desligada = false;
  let secao = null;
  let parar = () => {};

  const montar = async () => {
    const api = await ipc();
    const [info, cfg] = await Promise.all([api.info(), api.obter()]);
    if (desligada || !info?.available) return;
    // `pending`: a versão que uma procura anterior (a do início, com a opção
    // ligada, ou a de outra visita a esta tela) já achou.
    let estado = typeof info.pending === 'string' && info.pending ? { tipo: 'disponivel', versao: info.pending } : null;
    const html = marcacao({ canal: info.channel, auto: cfg?.autoUpdate === true, estado, icone });
    // Antes do Avançado e do Sobre, que fecham a página; sem eles, no fim.
    const depois = pagina.querySelector?.('[data-secao="avancado"]') ?? pagina.querySelector?.('[aria-labelledby="config-sobre-secao"]');
    if (depois) {
      depois.insertAdjacentHTML('beforebegin', html);
      secao = depois.previousElementSibling;
    } else {
      pagina.insertAdjacentHTML('beforeend', html);
      secao = pagina.lastElementChild;
    }
    const texto = secao.querySelector('#config-atualizar-app-desc');
    const botao = secao.querySelector('[data-atualizar-app]');
    const chave = secao.querySelector('fluent-switch');

    const mostrar = (novo) => {
      if (desligada) return;
      estado = novo;
      const q = quadro(estado, info.channel);
      if (texto.textContent !== q.texto) texto.textContent = q.texto;
      botao.textContent = q.botao;
      botao.dataset.atualizarApp = q.acao;
      botao.disabled = q.ocupado;
      botao.classList?.toggle('tt-accent', q.acao === 'instalar');
    };

    const procurar = async () => {
      mostrar({ tipo: 'procurando' });
      try {
        const r = await api.procurar();
        mostrar(r?.version ? { tipo: 'disponivel', versao: r.version } : { tipo: 'atual', versao: r?.current ?? '' });
      } catch (erro) {
        console.warn('[atualização]', erro);
        mostrar({ tipo: 'erroDeRede' });
      }
    };
    const instalar = async () => {
      mostrar({ tipo: 'baixando', fracao: null });
      try {
        // Resolve quando a instalação termina; o Rust reinicia em seguida.
        await api.instalar();
        mostrar({ tipo: 'instalando' });
      } catch (erro) {
        console.warn('[atualização]', erro);
        mostrar({ tipo: erro?.code === 'network' ? 'erroDeRede' : 'erroAoInstalar' });
      }
    };
    botao.addEventListener('click', () => {
      if (botao.disabled) return;
      if (botao.dataset.atualizarApp === 'instalar') void instalar();
      else void procurar();
    });
    chave.addEventListener('change', async () => {
      const ligada = chave.checked === true;
      try {
        await api.gravar({ autoUpdate: ligada });
      } catch (erro) {
        console.error('[atualização]', erro);
        chave.checked = !ligada;
      }
    });

    const semProgresso = await api.ouvir(api.EVENTOS.atualizacaoProgresso, (p) => {
      if (estado?.tipo !== 'baixando') return;
      const f = fracao(p);
      mostrar(f === 1 ? { tipo: 'instalando' } : { tipo: 'baixando', fracao: f });
    });
    const semAchada = await api.ouvir(api.EVENTOS.atualizacaoDisponivel, (p) => {
      if (typeof p?.version !== 'string') return;
      if (!estado || estado.tipo === 'atual') mostrar({ tipo: 'disponivel', versao: p.version });
    });
    parar = () => {
      semProgresso?.();
      semAchada?.();
    };
    if (desligada) parar();
  };
  montar().catch((erro) => console.warn('[atualização]', erro));
  return () => {
    desligada = true;
    parar();
    secao?.remove();
  };
}
