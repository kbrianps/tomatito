// O menu do botão direito do tomate (PLANO.md, 5.10; M56): um Menu.popup()
// nativo, porque o menu do WebView seria uma janela própria, fora da região
// (5.3). Aqui só a lista, sem Tauri nem DOM, para os testes; o src/tomato.js
// cria os itens com o @tauri-apps/api/menu e liga as ações.
//
// A ordem: as ações do foco (as mesmas dos botões, com os mesmos textos e o
// mesmo "ativo"), o tamanho (P, M e G) e o "Sempre na frente" (só no Windows
// e no X11), depois Configurações e Voltar ao modo normal, e por fim Minimizar
// e Fechar.
import t from './i18n/pt-BR.js';

export const TAMANHOS = Object.freeze([240, 280, 320]);

const tm = t.tomate.menu;

/**
 * Os itens do menu, de cima para baixo. Cada um é
 * `{ id, tipo: 'item', texto, ativo }`, `{ id, tipo: 'marcar', texto, marcado }`,
 * `{ tipo: 'separador' }` ou `{ id, tipo: 'submenu', texto, itens }`. Os `id`
 * são as ações (`principal`, `pular`, `encerrar`, `tamanho-240`…,
 * `sempre-na-frente`, `configuracoes`, `voltar`, `minimizar`, `fechar`).
 * @param {{ vista: { principal: { rotulo: string }, encerrar: { rotulo: string, ativo: boolean }, pular: { rotulo: string, ativo: boolean } },
 *   tamanho: number, sempreNaFrente: boolean, naFrente: boolean }} dados
 *   `vista` é a de lib/tomate.js; `tamanho` o `tomatoSize`; `sempreNaFrente`
 *   se o item existe (o `tomato_on_top_available`); `naFrente` o `tomatoOnTop`.
 */
export function itensDoMenu({ vista, tamanho, sempreNaFrente, naFrente }) {
  const itens = [
    { id: 'principal', tipo: 'item', texto: vista.principal.rotulo, ativo: true },
    { id: 'pular', tipo: 'item', texto: vista.pular.rotulo, ativo: Boolean(vista.pular.ativo) },
    { id: 'encerrar', tipo: 'item', texto: vista.encerrar.rotulo, ativo: Boolean(vista.encerrar.ativo) },
    { tipo: 'separador' },
    {
      id: 'tamanho',
      tipo: 'submenu',
      texto: tm.tamanho,
      itens: TAMANHOS.map((lado) => ({
        id: `tamanho-${lado}`,
        tipo: 'marcar',
        texto: tm.tamanhos[lado],
        marcado: lado === tamanho,
      })),
    },
  ];
  if (sempreNaFrente) {
    itens.push({ id: 'sempre-na-frente', tipo: 'marcar', texto: tm.sempreNaFrente, marcado: Boolean(naFrente) });
  }
  itens.push(
    { tipo: 'separador' },
    { id: 'configuracoes', tipo: 'item', texto: t.tomate.configuracoes, ativo: true },
    { id: 'voltar', tipo: 'item', texto: t.tomate.voltar, ativo: true },
    { tipo: 'separador' },
    { id: 'minimizar', tipo: 'item', texto: tm.minimizar, ativo: true },
    { id: 'fechar', tipo: 'item', texto: tm.fechar, ativo: true },
  );
  return itens;
}

/** O lado de um id `tamanho-240`, ou null. */
export function ladoDoItem(id) {
  const m = /^tamanho-(\d+)$/.exec(id ?? '');
  const lado = m ? Number(m[1]) : NaN;
  return TAMANHOS.includes(lado) ? lado : null;
}

/**
 * Cria os itens do menu com as fábricas do @tauri-apps/api/menu (`item`:
 * `MenuItem.new`, `marcar`: `CheckMenuItem.new`, `submenu`: `Submenu.new`,
 * `separador`: um `PredefinedMenuItem` Separator), na ordem da lista, e põe
 * cada um em `recursos` (quem chama fecha todos depois). `acao(id)` recebe o
 * id da lista.
 *
 * Cada item é criado à parte, e não dentro do `Menu.new({ items: [...] })`:
 * no Tauri 2.12, o item criado ali dentro é descartado logo depois de entrar
 * no menu, e o `Drop` dele tira o canal da ação (menu/plugin.rs,
 * `remove_menu_channel`); o menu aparece, mas o clique não chega à página
 * (docs/decisoes.md, M56). Criado à parte, o item fica na tabela de recursos
 * até o `close()`. Sem `id`: o Tauri gera um único a cada menu.
 */
export async function criarItens(itens, acao, fabricas, recursos = []) {
  const criados = await Promise.all(
    itens.map(async (i) => {
      if (i.tipo === 'separador') return fabricas.separador();
      if (i.tipo === 'submenu') {
        return fabricas.submenu({ text: i.texto, items: await criarItens(i.itens, acao, fabricas, recursos) });
      }
      const base = { text: i.texto, action: () => acao(i.id) };
      if (i.tipo === 'marcar') return fabricas.marcar({ ...base, checked: i.marcado });
      return fabricas.item({ ...base, enabled: i.ativo });
    }),
  );
  recursos.push(...criados);
  return criados;
}
