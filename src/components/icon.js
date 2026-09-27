// Ícones do app: SVG em linha, pintados com currentColor (fill no shell.css e
// no controls.css), para acompanhar a cor do texto em qualquer tema.
//
// M13: a fonte é só a pasta src/assets/icons/, que o scripts/copy-icons.mjs
// preenche com os ícones usados, copiados do @fluentui/svg-icons (MIT). O Vite
// embute o texto de cada arquivo no JS (?raw), e nada é pedido em tempo de
// execução. Nenhum outro arquivo do app importa o pacote (um teste confere).
const ARQUIVOS = import.meta.glob('../assets/icons/*.svg', { query: '?raw', import: 'default', eager: true });

// nome → { grade → svg }. O nome do arquivo é o do Fluent System Icons:
// <nome>_<grade>_<estilo>.svg; cada nome tem um estilo só (a lista do script).
const SVG = new Map();
for (const [caminho, svg] of Object.entries(ARQUIVOS)) {
  const m = /\/([a-z_]+)_(\d+)_(regular|filled)\.svg$/.exec(caminho);
  if (!m) continue;
  const [, nome, grade] = m;
  if (!SVG.has(nome)) SVG.set(nome, new Map());
  SVG.get(nome).set(Number(grade), svg.trim());
}

/** Os nomes dos ícones disponíveis (o catálogo do #/dev mostra todos). */
export const NOMES = Object.freeze([...SVG.keys()].sort());

/** As grades copiadas de um ícone, em ordem (ex.: [16, 24]). */
export function grades(nome) {
  return [...(SVG.get(nome)?.keys() ?? [])].sort((a, b) => a - b);
}

/**
 * O SVG do ícone, decorativo (aria-hidden) e fora do foco, com a classe
 * tt-icone. O nome é o do Fluent System Icons, sem tamanho nem estilo.
 * `grade` escolhe o desenho (16 por padrão); sem essa grade na pasta, vale a
 * menor maior que ela (o arrow_reset começa na 20). O tamanho na tela vem do
 * CSS.
 */
export function icone(nome, grade = 16) {
  const porGrade = SVG.get(nome);
  if (!porGrade) throw new Error(`ícone desconhecido: ${nome}`);
  const escolhida = grades(nome).find((g) => g >= grade);
  if (escolhida === undefined) throw new Error(`ícone ${nome} sem grade ${grade} ou maior`);
  return porGrade.get(escolhida).replace('<svg ', '<svg class="tt-icone" aria-hidden="true" focusable="false" ');
}
