// A seção "Dados" das Configurações, só na versão web (v0.3; o antigo W19 do
// PLANO-WEB). Dois cartões:
//
// - "Exportar dados": baixa um arquivo `tomatito-AAAA-MM-DD.json` com as
//   estatísticas, as tarefas e as configurações deste navegador;
// - "Importar dados": lê um arquivo desses e, depois de uma confirmação no
//   próprio cartão (quantos períodos e tarefas, e de quando é o arquivo),
//   SUBSTITUI os dados deste navegador e recarrega a página.
//
// Quem lê e grava é o `dadosDaCasca` (platform/web/dados.js; null no
// desktop). Módulo à parte, ligado por uma linha no settings.js, como o
// navegador-web.js. Fica antes da Atualização e do Sobre.
import t from '../lib/i18n/pt-BR.js';

const d = t.configuracoes.dados;
const semIcone = () => '';
const plataformaPadrao = () => import('#plataforma');

/** "05/10/2026" de um ISO, ou null. */
export function dataDoArquivo(iso) {
  const quando = new Date(iso ?? NaN);
  if (Number.isNaN(quando.getTime())) return null;
  const dois = (n) => String(n).padStart(2, '0');
  return `${dois(quando.getDate())}/${dois(quando.getMonth() + 1)}/${quando.getFullYear()}`;
}

/** O texto de um erro do `interpretar` ou da gravação. */
export const textoDoErro = (erro) => d.erros[erro?.code] ?? d.erros.gravacao;

/** HTML do rodapé do cartão Importar: a confirmação, um erro ou nada. */
export function marcacaoDoRodape(estado) {
  if (estado?.tipo === 'confirmar') {
    return (
      `<span class="tt-t-caption" data-resumo>${d.confirmar(estado.periods, estado.tasks, dataDoArquivo(estado.exportadoEm))}</span>` +
      `<button type="button" class="tt-accent" data-substituir>${d.substituir}</button>` +
      `<button type="button" data-cancelar>${d.cancelar}</button>`
    );
  }
  if (estado?.tipo === 'erro') return `<span class="tt-t-caption" data-erro>${estado.texto}</span>`;
  if (estado?.tipo === 'gravando') return `<span class="tt-t-caption">${d.gravando}</span>`;
  return '';
}

const cartao = (id, nomeDoIcone, textos, controle, icone) =>
  `<div class="tt-config-cartao" data-cartao="${id}"><div class="tt-config-cabecalho">` +
  `<span class="tt-config-icone">${icone(nomeDoIcone, 20)}</span>` +
  `<span class="tt-config-textos"><span id="config-${id}" class="tt-config-titulo">${textos.titulo}</span>` +
  `<span id="config-${id}-desc" class="tt-config-descricao tt-t-caption">${textos.descricao}</span></span>` +
  `<span class="tt-config-controle">${controle}</span></div>`;

/** HTML da seção. */
export function marcacao({ icone = semIcone } = {}) {
  return (
    '<section class="tt-config-secao" aria-labelledby="config-dados" data-secao="dados">' +
    `<h2 id="config-dados" class="tt-t-body-strong">${d.secao}</h2>` +
    cartao('exportar', 'arrow_download', d.exportar, `<button type="button" data-exportar aria-describedby="config-exportar-desc">${d.exportar.botao}</button>`, icone) +
    '</div>' +
    cartao(
      'importar',
      'arrow_upload',
      d.importar,
      `<button type="button" data-importar aria-describedby="config-importar-desc">${d.importar.botao}</button>` +
        '<input type="file" accept="application/json,.json" data-arquivo hidden>',
      icone,
    ) +
    '<div class="tt-config-rodape" role="status" hidden></div></div>' +
    '</section>'
  );
}

/** Entrega o texto como um arquivo baixado. */
function baixar(doc, { nome, texto }) {
  const url = URL.createObjectURL(new Blob([texto], { type: 'application/json' }));
  const link = doc.createElement('a');
  link.href = url;
  link.download = nome;
  link.hidden = true;
  doc.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Liga a seção na página (`.tt-pagina`); devolve a limpeza. */
export function ligarDadosWeb(pagina, { icone = semIcone, plataforma = plataformaPadrao, entregar = baixar } = {}) {
  let desligada = false;
  let secao = null;

  const montar = async () => {
    const plat = await plataforma();
    const dados = plat?.dadosDaCasca ?? null;
    if (desligada || !plat?.casca?.web || !dados) return;
    const antes =
      pagina.querySelector?.('[data-secao="atualizacao"]') ?? pagina.querySelector?.('[aria-labelledby="config-sobre-secao"]');
    const html = marcacao({ icone });
    if (antes) {
      antes.insertAdjacentHTML('beforebegin', html);
      secao = antes.previousElementSibling;
    } else {
      pagina.insertAdjacentHTML('beforeend', html);
      secao = pagina.lastElementChild;
    }
    const exportar = secao.querySelector('[data-exportar]');
    const importar = secao.querySelector('[data-importar]');
    const arquivo = secao.querySelector('[data-arquivo]');
    const pe = secao.querySelector('.tt-config-rodape');
    let lido = null;

    const mostrar = (estado) => {
      if (desligada) return;
      pe.innerHTML = marcacaoDoRodape(estado);
      pe.hidden = !estado;
      importar.disabled = estado?.tipo === 'gravando';
      if (estado?.tipo === 'confirmar') pe.querySelector('[data-cancelar]')?.focus?.();
    };

    exportar.addEventListener('click', async () => {
      exportar.disabled = true;
      try {
        entregar(secao.ownerDocument, await dados.exportar());
      } catch (erro) {
        console.error('[dados] exportação', erro);
      } finally {
        exportar.disabled = false;
      }
    });
    importar.addEventListener('click', () => arquivo.click());
    arquivo.addEventListener('change', async () => {
      const escolhido = arquivo.files?.[0];
      // Limpo, o mesmo arquivo pode ser escolhido de novo.
      arquivo.value = '';
      if (!escolhido) return;
      try {
        lido = dados.interpretar(await escolhido.text());
        mostrar({ tipo: 'confirmar', periods: lido.periods.length, tasks: lido.tasks.length, exportadoEm: lido.exportadoEm });
      } catch (erro) {
        lido = null;
        console.warn('[dados] arquivo recusado', erro);
        mostrar({ tipo: 'erro', texto: textoDoErro(erro) });
      }
    });
    pe.addEventListener('click', async (e) => {
      if (e.target.closest?.('[data-cancelar]')) {
        lido = null;
        mostrar(null);
        importar.focus?.();
        return;
      }
      if (!e.target.closest?.('[data-substituir]') || !lido) return;
      const aGravar = lido;
      lido = null;
      mostrar({ tipo: 'gravando' });
      try {
        // Grava e recarrega a página.
        await dados.importar(aGravar);
      } catch (erro) {
        console.error('[dados] importação', erro);
        mostrar({ tipo: 'erro', texto: d.erros.gravacao });
      }
    });
  };
  montar().catch((erro) => console.warn('[dados]', erro));
  return () => {
    desligada = true;
    secao?.remove();
  };
}
