// Caso dados (v0.3; platform/web/dados.js e views/dados-web.js): exportar e
// importar os dados da versão web.
//
//   node scripts/web/verificar.mjs dados
//
// Roda no servidor de desenvolvimento, para importar os módulos do app.
// (a) as Configurações têm a seção Dados, com Exportar e Importar, antes do
//     Sobre;
// (b) com uma tarefa, um foco de 25 min e o tema Escuro, o `exportar()` traz
//     o período, a tarefa e a `tomatito:config`;
// (c) um arquivo que não é do Tomatito é recusado com o texto do plano, e
//     nada muda;
// (d) escolhido o arquivo exportado, o cartão pede a confirmação (1 período
//     e 1 tarefa); "Cancelar" não muda nada;
// (e) apagados os dados e trocado o tema, "Substituir" traz tudo de volta: a
//     página recarrega no Escuro, com a tarefa e os 25 minutos de hoje.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const servidor = 'dev';
export const caminho = '/#/configuracoes';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function esperar(p, expr, ms = 8000) {
  const fim = Date.now() + ms;
  for (;;) {
    if (await p.avaliar(expr)) return true;
    if (Date.now() > fim) return false;
    await sleep(50);
  }
}
const ipc = (p, corpo) => p.avaliar(`(async () => { const ipc = await import('/src/lib/ipc.js'); ${corpo} })()`);
const SECAO = `document.querySelector('[data-secao="dados"]')`;
const RODAPE = `${SECAO}.querySelector('.tt-config-rodape')`;
const RETRATO = `(async () => {
  const ipc = await import('/src/lib/ipc.js');
  return {
    tema: document.documentElement.dataset.theme,
    tarefas: (await ipc.tarefas.listar()).map((x) => x.title),
    hoje: (await ipc.estatisticas.obter()).todayS,
    historico: (await ipc.estatisticas.historico()).periods,
  };
})()`;

async function escolherArquivo(p, caminhoDoArquivo) {
  const { root } = await p.cmd('DOM.getDocument');
  const { nodeId } = await p.cmd('DOM.querySelector', { nodeId: root.nodeId, selector: '[data-secao="dados"] [data-arquivo]' });
  await p.cmd('DOM.setFileInputFiles', { nodeId, files: [caminhoDoArquivo] });
}

export default async function dados(t) {
  const p = t.pagina;
  const pasta = mkdtempSync(join(tmpdir(), 'tomatito-dados-'));
  try {
    // (a)
    const apareceu = await esperar(p, `!!${SECAO}`);
    const a = await p.avaliar(`(() => {
      const s = ${SECAO};
      const secoes = [...document.querySelectorAll('.tt-config-secao')].map((x) => x.querySelector('h2').textContent);
      return { secoes, botoes: [...s.querySelectorAll('button')].map((b) => b.textContent.trim()), icones: s.querySelectorAll('.tt-config-icone svg').length };
    })()`);
    t.conferir(
      '(a) a seção Dados, com Exportar e Importar, antes do Sobre',
      apareceu && a.secoes.indexOf('Dados') === a.secoes.indexOf('Sobre') - 1 && a.botoes.join('|') === 'Exportar|Importar' && a.icones === 2,
      a,
    );

    // (b)
    await ipc(p, `await ipc.tarefas.adicionar('Ler o capítulo 3'); await ipc.configuracoes.gravar({ theme: 'dark' }); await ipc.foco.iniciar(25);`);
    await t.relogio.avancar(25 * 60_000 + 2000);
    await esperar(p, `(async () => (await (await import('/src/lib/ipc.js')).estatisticas.obter()).todayS === 1500)()`, 6000);
    const antes = await p.avaliar(RETRATO);
    const saida = await p.avaliar(`(async () => (await import('/src/platform/web/index.js')).dadosDaCasca.exportar())()`);
    const lido = JSON.parse(saida.texto);
    t.conferir(
      '(b) o arquivo traz o período, a tarefa e a tomatito:config, com o nome tomatito-AAAA-MM-DD.json',
      /^tomatito-\d{4}-\d\d-\d\d\.json$/.test(saida.nome) && lido.formato === 'tomatito-dados' && lido.versao === 1 && lido.periods.length === 1 &&
        lido.periods[0].actualS === 1500 && lido.tasks.length === 1 && lido.tasks[0].title === 'Ler o capítulo 3' &&
        JSON.parse(lido.local['tomatito:config']).theme === 'dark' && antes.hoje === 1500,
      { nome: saida.nome, chaves: Object.keys(lido.local), periods: lido.periods.length, tasks: lido.tasks.length, antes },
    );
    const bom = join(pasta, saida.nome);
    writeFileSync(bom, saida.texto);
    const ruim = join(pasta, 'outro.json');
    writeFileSync(ruim, JSON.stringify({ receita: 'bolo' }));

    // (c)
    await escolherArquivo(p, ruim);
    const recusou = await esperar(p, `!!${RODAPE}.querySelector('[data-erro]')`, 3000);
    const c = await p.avaliar(`${RODAPE}.textContent`);
    t.conferir('(c) um arquivo que não é do Tomatito é recusado, e nada muda', recusou && c === 'Este não é um arquivo de dados do Tomatito.' && JSON.stringify(await p.avaliar(RETRATO)) === JSON.stringify(antes), c);

    // (d)
    await escolherArquivo(p, bom);
    const pediu = await esperar(p, `!!${RODAPE}.querySelector('[data-substituir]')`, 3000);
    const d = await p.avaliar(`({ texto: ${RODAPE}.querySelector('[data-resumo]').textContent, foco: document.activeElement?.hasAttribute('data-cancelar') })`);
    await p.avaliar(`${RODAPE}.querySelector('[data-cancelar]').click()`);
    const fechou = await p.avaliar(`${RODAPE}.hidden`);
    t.conferir(
      '(d) o cartão pede a confirmação (1 período e 1 tarefa), com o foco em Cancelar; cancelar não muda nada',
      pediu && /tem 1 período e 1 tarefa\. Importar apaga o que está neste navegador/.test(d.texto) && d.foco && fechou &&
        JSON.stringify(await p.avaliar(RETRATO)) === JSON.stringify(antes),
      d,
    );

    // (e)
    await ipc(p, `for (const x of await ipc.tarefas.listar()) await ipc.tarefas.apagar(x.id); await ipc.tarefas.adicionar('Outra'); await ipc.configuracoes.gravar({ theme: 'light' });`);
    await p.avaliar(`new Promise((ok, falha) => {
      const r = indexedDB.open('tomatito');
      r.onsuccess = () => { const tx = r.result.transaction('periods', 'readwrite'); tx.objectStore('periods').clear(); tx.oncomplete = () => { r.result.close(); ok(); }; tx.onerror = () => falha(tx.error); };
      r.onerror = () => falha(r.error);
    })`);
    const meio = await p.avaliar(RETRATO);
    await escolherArquivo(p, bom);
    await esperar(p, `!!${RODAPE}.querySelector('[data-substituir]')`, 3000);
    await p.avaliar(`window.__antesDaRecarga = true; ${RODAPE}.querySelector('[data-substituir]').click()`);
    const recarregou = await esperar(p, `window.__antesDaRecarga !== true && document.readyState === 'complete' && !!${SECAO}`, 8000);
    const depois = await p.avaliar(RETRATO);
    t.conferir(
      '(e) "Substituir" traz tudo de volta e recarrega: o Escuro, a tarefa e os 25 minutos de hoje',
      meio.tema === 'light' && meio.hoje === 0 && meio.tarefas.join() === 'Outra' && recarregou && JSON.stringify(depois) === JSON.stringify(antes),
      { antes, meio, depois },
    );
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
}
