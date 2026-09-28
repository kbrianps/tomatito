// Ícones do app: SVG em linha, pintados com currentColor (fill no shell.css e
// no controls.css), para acompanhar a cor do texto em qualquer tema.
//
// M13: a fonte é só a pasta src/assets/icons/, que o scripts/copy-icons.mjs
// preenche com os ícones usados, copiados do @fluentui/svg-icons (MIT). O Vite
// embute o texto de cada arquivo no JS (?raw), e nada é pedido em tempo de
// execução. Nenhum outro arquivo do app importa o pacote (um teste confere).
const ARQUIVOS = import.meta.glob('../assets/icons/*.svg', { query: '?raw', import: 'default', eager: true });

// nome → { estilo → { grade → svg } }. O nome do arquivo é o do Fluent System
// Icons: <nome>_<grade>_<estilo>.svg. M30: um nome pode ter os dois estilos
// (o checkmark_circle: o contorno no cabeçalho das tarefas e o preenchido na
// tarefa concluída); sem estilo pedido, vale o regular, ou o único que houver.
const SVG = new Map();
for (const [caminho, svg] of Object.entries(ARQUIVOS)) {
  const m = /\/([a-z_]+)_(\d+)_(regular|filled)\.svg$/.exec(caminho);
  if (!m) continue;
  const [, nome, grade, estilo] = m;
  if (!SVG.has(nome)) SVG.set(nome, new Map());
  const porEstilo = SVG.get(nome);
  if (!porEstilo.has(estilo)) porEstilo.set(estilo, new Map());
  porEstilo.get(estilo).set(Number(grade), svg.trim());
}

/** Os nomes dos ícones disponíveis (o catálogo do #/dev mostra todos). */
export const NOMES = Object.freeze([...SVG.keys()].sort());

/** O estilo usado quando nenhum é pedido: o regular, ou o único que houver. */
const estiloPadrao = (nome) => {
  const porEstilo = SVG.get(nome);
  if (!porEstilo) return null;
  return porEstilo.has('regular') ? 'regular' : [...porEstilo.keys()][0];
};

/** As grades copiadas de um ícone, em ordem (ex.: [16, 24]). */
export function grades(nome, estilo = estiloPadrao(nome)) {
  return [...(SVG.get(nome)?.get(estilo)?.keys() ?? [])].sort((a, b) => a - b);
}

/**
 * O SVG do ícone, decorativo (aria-hidden) e fora do foco, com a classe
 * tt-icone e o nome em data-icone (M18: as conferências leem o glifo do
 * botão de pausar; M30: `data-preenchido` no estilo filled). O nome é o do Fluent System Icons, sem tamanho nem estilo.
 * `grade` escolhe o desenho (16 por padrão); sem essa grade na pasta, vale a
 * menor maior que ela (o arrow_reset começa na 20). `estilo` ('regular' ou
 * 'filled', M30) só é preciso num nome que tem os dois. O tamanho na tela vem
 * do CSS.
 */
export function icone(nome, grade = 16, estilo = estiloPadrao(nome)) {
  const porGrade = SVG.get(nome)?.get(estilo);
  if (!porGrade) throw new Error(`ícone desconhecido: ${nome} (${estilo})`);
  const escolhida = grades(nome, estilo).find((g) => g >= grade);
  if (escolhida === undefined) throw new Error(`ícone ${nome} sem grade ${grade} ou maior`);
  return porGrade.get(escolhida).replace('<svg ', `<svg class="tt-icone" data-icone="${nome}"${estilo === 'filled' ? ' data-preenchido' : ''} aria-hidden="true" focusable="false" `);
}
