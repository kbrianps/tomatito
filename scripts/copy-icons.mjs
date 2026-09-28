#!/usr/bin/env node
// Copia do @fluentui/svg-icons (MIT, devDependency) só os ícones que o app usa
// (PLANO.md, 3.7, 9 e M13) para src/assets/icons/, de onde o
// src/components/icon.js os lê. Nada do pacote entra no app por outro caminho:
// um teste (scripts/regras-do-repo.test.mjs) recusa qualquer import dele em
// src/.
//
//   node scripts/copy-icons.mjs              copia o que falta, regrava o que
//                                            mudou e apaga o que saiu da lista
//   node scripts/copy-icons.mjs --conferir   só confere: sai com 1 se a pasta
//                                            não bate com a lista e o pacote
//
// A pasta copiada fica no git (ao contrário do fluent-tokens.gen.css): o build
// não depende de rodar este script, e quem revisa vê exatamente o que vai no
// app. O `npm test` roda a conferência, então mudar a lista (ou a versão do
// pacote) sem rodar o script falha no teste.
//
// Tamanhos: o nome do arquivo do Fluent traz a grade do desenho (16, 20, 24);
// o tamanho na tela vem do CSS. Os ícones do painel e dos botões de 32 px usam
// a grade de 16; os dos botões circulares de 64 px, a de 24. O arrow_reset não
// tem grade de 16 no pacote e usa a de 20 nos botões pequenos.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = new URL('..', import.meta.url);
const PACOTE = new URL('node_modules/@fluentui/svg-icons/', RAIZ);
export const DESTINO = new URL('src/assets/icons/', RAIZ);

// A lista do M13, na ordem do plano: nome do Fluent System Icons, estilo e as
// grades copiadas.
export const ICONES = Object.freeze([
  // painel de navegação (M09)
  { nome: 'target', estilo: 'regular', tamanhos: [16] },
  { nome: 'hourglass_half', estilo: 'regular', tamanhos: [16] },
  { nome: 'timer', estilo: 'regular', tamanhos: [16] },
  { nome: 'settings', estilo: 'regular', tamanhos: [16] },
  // iniciar, pausar e encerrar (preenchidos, como no Relógio)
  { nome: 'play', estilo: 'filled', tamanhos: [16, 24] },
  { nome: 'pause', estilo: 'filled', tamanhos: [16, 24] },
  { nome: 'stop', estilo: 'filled', tamanhos: [16, 24] },
  // cronômetro, temporizador, tarefas e seletor de minutos
  { nome: 'flag', estilo: 'regular', tamanhos: [16, 24] },
  { nome: 'arrow_reset', estilo: 'regular', tamanhos: [20, 24] },
  { nome: 'more_horizontal', estilo: 'regular', tamanhos: [16] },
  { nome: 'edit', estilo: 'regular', tamanhos: [16] },
  { nome: 'add', estilo: 'regular', tamanhos: [16] },
  { nome: 'chevron_up', estilo: 'regular', tamanhos: [16] },
  { nome: 'chevron_down', estilo: 'regular', tamanhos: [16] },
  // M30: as tarefas. O círculo da pendente e o check preenchido da concluída
  // na grade de 20 (o tamanho do CheckBox redondo do Relógio), e o contorno
  // do check, na de 20, no cabeçalho do cartão
  { nome: 'circle', estilo: 'regular', tamanhos: [16, 20] },
  { nome: 'checkmark_circle', estilo: 'regular', tamanhos: [16, 20] },
  { nome: 'checkmark_circle', estilo: 'filled', tamanhos: [20] },
  { nome: 'dismiss', estilo: 'regular', tamanhos: [16] },
  { nome: 'save', estilo: 'regular', tamanhos: [16] },
  // Configurações: o ícone do cartão "Tema do aplicativo" (M24), na grade de
  // 20 do HeaderIcon do SettingsCard do WinUI
  { nome: 'paint_brush', estilo: 'regular', tamanhos: [20] },
  // aviso de erro (M28: o diálogo da meta quando o Rust recusa a gravação),
  // preenchido, como o InfoBar de erro do WinUI
  { nome: 'error_circle', estilo: 'filled', tamanhos: [16] },
  // M33: a lixeira do "Excluir" de cada temporizador no modo de edição e o
  // check do "Concluído", que troca o lápis da barra enquanto se edita
  { nome: 'delete', estilo: 'regular', tamanhos: [16] },
  { nome: 'checkmark', estilo: 'regular', tamanhos: [16] },
  // M35: o "Copiar" das voltas do cronômetro
  { nome: 'copy', estilo: 'regular', tamanhos: [16] },
]);

/** Os arquivos da lista, no formato do pacote: `play_16_filled.svg`. */
export function arquivos(icones = ICONES) {
  return icones.flatMap(({ nome, estilo, tamanhos }) => tamanhos.map((t) => `${nome}_${t}_${estilo}.svg`)).sort();
}

const LEIAME = 'README.md';

function versaoDoPacote(pacote) {
  return JSON.parse(readFileSync(new URL('package.json', pacote), 'utf8')).version;
}

/** O README.md da pasta: origem, versão e licença, gerado com a lista. */
export function leiame(versao, lista = arquivos()) {
  return [
    '# Ícones da interface',
    '',
    '<!-- Gerado por scripts/copy-icons.mjs; não edite à mão. -->',
    '',
    `Cópia de ${lista.length} arquivos do pacote npm \`@fluentui/svg-icons\` ${versao}`,
    '(Fluent System Icons, repositório `microsoft/fluentui-system-icons`), sem',
    'nenhuma alteração. Licença MIT, a mesma declarada no `package.json` do pacote;',
    'o texto completo vai para os avisos de terceiros do app (PLANO.md, 9).',
    '',
    'Só entram os ícones que o Tomatito usa. Para acrescentar um, inclua-o na',
    'lista `ICONES` de `scripts/copy-icons.mjs` e rode `node scripts/copy-icons.mjs`.',
    '',
    ...lista.map((a) => `- \`${a}\``),
    '',
  ].join('\n');
}

/**
 * Compara a pasta `destino` com a lista e o pacote. Devolve as diferenças
 * (faltando, diferentes, sobrando) e o conteúdo esperado de cada arquivo.
 */
export function comparar({ pacote = PACOTE, destino = DESTINO, icones = ICONES } = {}) {
  const lista = arquivos(icones);
  const esperado = new Map();
  for (const a of lista) {
    const origem = new URL(`icons/${a}`, pacote);
    if (!existsSync(origem)) throw new Error(`o pacote não tem ${a} (${fileURLToPath(origem)})`);
    esperado.set(a, readFileSync(origem, 'utf8'));
  }
  esperado.set(LEIAME, leiame(versaoDoPacote(pacote), lista));
  const presentes = existsSync(destino) ? readdirSync(destino) : [];
  const faltando = [];
  const diferentes = [];
  for (const [a, texto] of esperado) {
    const alvo = new URL(a, destino);
    if (!existsSync(alvo)) faltando.push(a);
    else if (readFileSync(alvo, 'utf8') !== texto) diferentes.push(a);
  }
  const sobrando = presentes.filter((a) => !esperado.has(a)).sort();
  return { esperado, faltando, diferentes, sobrando };
}

/** Deixa a pasta igual à lista. Só escreve o que mudou. */
export function copiar(opcoes = {}) {
  const destino = opcoes.destino ?? DESTINO;
  const { esperado, faltando, diferentes, sobrando } = comparar(opcoes);
  mkdirSync(destino, { recursive: true });
  for (const a of [...faltando, ...diferentes]) writeFileSync(new URL(a, destino), esperado.get(a));
  for (const a of sobrando) rmSync(new URL(a, destino));
  return { escritos: [...faltando, ...diferentes], apagados: sobrando, total: esperado.size - 1 };
}

function principal(argv) {
  const conferir = argv.includes('--conferir');
  if (argv.some((a) => a !== '--conferir')) {
    console.error('uso: node scripts/copy-icons.mjs [--conferir]');
    return 2;
  }
  try {
    if (conferir) {
      const { faltando, diferentes, sobrando } = comparar();
      const problemas = [
        ...faltando.map((a) => `falta ${a}`),
        ...diferentes.map((a) => `${a} difere do pacote (ou da lista)`),
        ...sobrando.map((a) => `${a} não está na lista`),
      ];
      if (problemas.length) {
        console.error(`copy-icons: src/assets/icons/ fora de dia:\n${problemas.map((p) => `  - ${p}`).join('\n')}\n  Rode: node scripts/copy-icons.mjs`);
        return 1;
      }
      console.log(`copy-icons: src/assets/icons/ em dia (${arquivos().length} ícones).`);
      return 0;
    }
    const { escritos, apagados, total } = copiar();
    console.log(
      `copy-icons: ${total} ícones em src/assets/icons/` +
        (escritos.length || apagados.length ? ` (${escritos.length} escritos, ${apagados.length} apagados)` : ', nada mudou') +
        '.',
    );
    return 0;
  } catch (erro) {
    console.error(`copy-icons: ${erro.message}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = principal(process.argv.slice(2));
}
