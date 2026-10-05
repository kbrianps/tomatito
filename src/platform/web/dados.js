// Exportar e importar os dados da versão web (v0.3; o antigo W19 do
// PLANO-WEB). Os dados da web moram só neste navegador; o arquivo serve de
// cópia de segurança e de mudança para outro navegador ou aparelho.
//
// O arquivo é um JSON com:
//   { formato: 'tomatito-dados', versao: 1, exportadoEm, app,
//     local: { 'tomatito:config': '…', … },   // o localStorage do Tomatito
//     periods: [ … ], tasks: [ … ] }           // as duas stores do IndexedDB
//
// Importar SUBSTITUI o que há no navegador: as duas stores são esvaziadas e
// regravadas numa transação só (ou entra tudo, ou nada), o localStorage do
// Tomatito é trocado, e a página recarrega para o motor nascer dos dados
// novos. As configurações e o estado passam pelas mesmas leituras tolerantes
// de sempre (o wasm normaliza), então um arquivo antigo abre.
import { esperar, transacao } from './armazenamento.js';

export const FORMATO = 'tomatito-dados';
export const VERSAO = 1;
const PREFIXO = 'tomatito:';
/** Não viajam: o original ilegível guardado à parte e as marcas da sessão. */
const FORA = new Set(['tomatito:estado.corrompido']);
/** O limite de um arquivo aceito (um ano de uso intenso não chega a 1 MB). */
export const TAMANHO_MAXIMO = 20 * 1024 * 1024;

const inteiro = (v) => Number.isSafeInteger(v);
const naoNegativo = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;

/** Um período como o `PeriodoDto` do wasm grava, ou null. */
export function periodoValido(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
  if (typeof p.kind !== 'string' || !inteiro(p.endedAt) || !naoNegativo(p.actualS)) return null;
  if (p.id !== undefined && !(inteiro(p.id) && p.id > 0)) return null;
  return p;
}

/** Uma tarefa `{ id, title, createdAt, doneAt }`, ou null. */
export function tarefaValida(x) {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
  if (typeof x.title !== 'string' || x.title.length === 0 || [...x.title].length > 255) return null;
  if (!inteiro(x.createdAt) || !(x.doneAt === null || x.doneAt === undefined || inteiro(x.doneAt))) return null;
  if (x.id !== undefined && !(inteiro(x.id) && x.id > 0)) return null;
  return x;
}

/**
 * Lê o texto de um arquivo e devolve `{ local, periods, tasks, exportadoEm }`
 * ou lança `{ code, message }`: `'formato'` (não é um arquivo do Tomatito),
 * `'versao'` (de uma versão mais nova) ou `'conteudo'` (itens inválidos).
 */
export function interpretar(texto) {
  const erro = (code, message) => ({ code, message });
  if (typeof texto !== 'string' || texto.length > TAMANHO_MAXIMO) throw erro('formato', 'arquivo grande demais ou ilegível');
  let dados;
  try {
    dados = JSON.parse(texto);
  } catch (e) {
    throw erro('formato', `JSON inválido: ${e.message}`);
  }
  if (!dados || typeof dados !== 'object' || dados.formato !== FORMATO) throw erro('formato', 'não é um arquivo de dados do Tomatito');
  if (!inteiro(dados.versao) || dados.versao < 1) throw erro('formato', 'sem a versão do formato');
  if (dados.versao > VERSAO) throw erro('versao', `formato ${dados.versao}, mais novo que este Tomatito`);
  if (!Array.isArray(dados.periods) || !Array.isArray(dados.tasks)) throw erro('conteudo', 'faltam os períodos ou as tarefas');
  if (!dados.periods.every(periodoValido)) throw erro('conteudo', 'há um período inválido');
  if (!dados.tasks.every(tarefaValida)) throw erro('conteudo', 'há uma tarefa inválida');
  const local = {};
  if (dados.local && typeof dados.local === 'object' && !Array.isArray(dados.local)) {
    for (const [chave, valor] of Object.entries(dados.local)) {
      if (chave.startsWith(PREFIXO) && !FORA.has(chave) && typeof valor === 'string') local[chave] = valor;
    }
  }
  return {
    local,
    periods: dados.periods,
    tasks: dados.tasks,
    exportadoEm: typeof dados.exportadoEm === 'string' ? dados.exportadoEm : null,
  };
}

/** As chaves do Tomatito no localStorage, como `{ chave: texto }`. */
function lerLocal(armazem) {
  const local = {};
  for (let i = 0; i < armazem.length; i++) {
    const chave = armazem.key(i);
    if (chave?.startsWith(PREFIXO) && !FORA.has(chave)) local[chave] = armazem.getItem(chave);
  }
  return local;
}

const dois = (n) => String(n).padStart(2, '0');
/** `tomatito-2026-10-05.json`, pela data local. */
export const nomeDoArquivo = (quando = new Date()) =>
  `tomatito-${quando.getFullYear()}-${dois(quando.getMonth() + 1)}-${dois(quando.getDate())}.json`;

/**
 * As ações, com as dependências do navegador (os testes passam falsas):
 * `exportar()` resolve com `{ nome, texto, periods, tasks }`; `importar(dados)`
 * recebe o resultado do `interpretar`, grava e recarrega.
 */
export function criarDados({
  armazem = globalThis.localStorage,
  banco = { esperar, transacao },
  versaoDoApp = '',
  agora = () => new Date(),
  recarregar = () => globalThis.location.reload(),
  antesDeLer = async () => {},
} = {}) {
  return Object.freeze({
    interpretar,
    async exportar() {
      // As gravações pendentes (o período que acabou de fechar) entram.
      await antesDeLer();
      const { periods, tasks } = await banco.transacao(['periods', 'tasks'], 'readonly', async (s) => ({
        periods: await banco.esperar(s.periods.getAll()),
        tasks: await banco.esperar(s.tasks.getAll()),
      }));
      const quando = agora();
      const dados = { formato: FORMATO, versao: VERSAO, exportadoEm: quando.toISOString(), app: versaoDoApp, local: lerLocal(armazem), periods, tasks };
      return { nome: nomeDoArquivo(quando), texto: JSON.stringify(dados, null, 2), periods: periods.length, tasks: tasks.length };
    },
    async importar({ local, periods, tasks }) {
      await antesDeLer();
      await banco.transacao(['periods', 'tasks'], 'readwrite', async (s) => {
        await banco.esperar(s.periods.clear());
        await banco.esperar(s.tasks.clear());
        for (const p of periods) s.periods.put(p);
        for (const x of tasks) s.tasks.put(x);
      });
      // O localStorage e a recarga no mesmo passo: o motor desta aba não tem
      // como regravar o estado antigo por cima.
      const antigas = Object.keys(lerLocal(armazem));
      for (const chave of antigas) armazem.removeItem(chave);
      for (const [chave, valor] of Object.entries(local)) armazem.setItem(chave, valor);
      recarregar();
    },
  });
}
