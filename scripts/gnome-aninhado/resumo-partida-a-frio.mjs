#!/usr/bin/env node
// Resume uma rodada do roteiro partida-a-frio (M08): os quadros de cada
// partida, o console do DevTools e a CSP. Sai com código 1 se alguma
// conferência falhar.
//
//   node scripts/gnome-aninhado/resumo-partida-a-frio.mjs <pasta da rodada>
//
// Com TT_CONTROLE=tema-errado na rodada (controle negativo), as conferências
// dos quadros se invertem: a rodada só passa se a captura acusar os quadros
// fora do Lite que a sonda provocou.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

const pasta = process.argv[2];
const ler = (nome) => (existsSync(`${pasta}/${nome}`) ? readFileSync(`${pasta}/${nome}`, 'utf8') : '');
const r = JSON.parse(ler('resultado.json') || '{}');
// M23: o tema da rodada (TT_TEMA); rodadas antigas, sem o campo, são do Lite.
const tema = r.tema ?? 'lite';
const partidas = r.partidas ?? [];
const pct = (v) => `${(100 * v).toFixed(2)}%`;

// Hash do script de boot do index.html, como o Tauri calcula para a CSP.
const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const boot = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? '';
const hashBoot = `'sha256-${createHash('sha256').update(boot.replace(/\r\n?/g, '\n')).digest('base64')}'`;

console.log(`rodada: ${pasta}`);
console.log(`tema: ${tema}; modo: ${r.modo}${r.controle ? ` (controle: ${r.controle})` : ''}; binário: ${r.binario}`);
if (r.erro) console.log(`ERRO no roteiro: ${r.erro}`);

const checagens = {};
const checar = (nome, ok) => (checagens[nome] = Boolean(ok));

for (const P of partidas) {
  const q = P.quadros.filter((x) => x.arq);
  const seq = q.map((x) => `${x.t}ms:${x.veredito}${x.repeticoes ? `x${x.repeticoes + 1}` : ''}`).join(' ');
  console.log(
    `partida ${P.partida}: janela em ${P.t_janela} ms, 1º quadro em ${P.t_primeiro_quadro} ms, ` +
      `${q.length} quadros distintos [${seq}], diferença de cada um para o final ` +
      `[${q.map((x) => pct(x.diferenca_do_final)).join(' ')}], ${P.saida}`,
  );
  const c = P.console ?? {};
  const recusas = (c.mensagens ?? []).filter((m) => /Refused to/i.test(m.texto));
  const erros = (c.mensagens ?? []).filter((m) => m.nivel === 'error');
  console.log(
    `  console: ${(c.mensagens ?? []).length} mensagens, ${erros.length} erros, ${recusas.length} "Refused to"; ` +
      `controle: ${c.controle}; estado: ${JSON.stringify(c.estado?.dataset)} Inter ${c.estado?.interCarregada}`,
  );
  for (const m of c.mensagens ?? []) console.log(`    [${m.fonte}/${m.nivel}] ${m.texto}`);
}

const todos = partidas.flatMap((P) => P.quadros.filter((x) => x.arq));
const ms = partidas.map((P) => P.t_primeiro_quadro).filter((v) => v !== undefined).sort((a, b) => a - b);
if (ms.length) console.log(`1º quadro: mínimo ${ms[0]} ms, mediana ${ms[Math.floor(ms.length / 2)]} ms, máximo ${ms.at(-1)} ms`);

const esperadas = Number(process.env.TT_PARTIDAS || 10);
checar(`${esperadas} partidas, todas com janela e quadros`, partidas.length === esperadas && partidas.every((P) => !P.erro && P.quadros.some((x) => x.arq)));
checar('o app sai sozinho ao fechar a janela, em todas', partidas.every((P) => P.saida === 'saiu 0'));

if (r.controle === 'tema-errado') {
  const fora = partidas.filter((P) => P.quadros.some((x) => x.arq && x.veredito !== tema));
  checar(`controle: a captura acusa quadros fora do tema ${tema} em todas as partidas`, fora.length === partidas.length);
  checar(`controle: e o último quadro volta ao tema ${tema}`, partidas.every((P) => P.quadros.filter((x) => x.arq).at(-1)?.veredito === tema));
} else {
  const ruins = todos.filter((x) => x.veredito !== tema);
  checar(`nenhum quadro branco, escuro, transparente ou de outro tema (${todos.length} quadros)`, ruins.length === 0);
  // Um quadro "liso" é só o fundo do tema (a background_color da janela),
  // antes de o WebView pintar a página. Depois dele, o primeiro quadro com
  // conteúdo já precisa ser o final (a janela aparece de uma vez). O limite de
  // 0,01% da amostra (uns 70 px) pega até um radio que só marca no quadro
  // seguinte (0,02%, o defeito que o Updates.process() do main.js corrigiu).
  const liso = (x) => (x.tema ?? x.lite) > 0.995;
  checar(
    'a janela aparece de uma vez: no máximo 1 quadro de fundo liso, e o 1º quadro com conteúdo já é o final',
    partidas.every((P) => {
      const q = P.quadros.filter((x) => x.arq);
      const i = q.findIndex((x) => !liso(x));
      return i >= 0 && i <= 1 && q[i].diferenca_do_final < 0.0001;
    }),
  );
  checar(
    `atributos do boot na página: tema ${tema} e plataforma linux`,
    partidas.every((P) => {
      const d = P.console?.estado?.dataset ?? {};
      return d.themePref === tema && d.theme === tema && d.platform === 'linux';
    }),
  );
  // M23: as configurações pelo IPC da página (console.mjs) e o arquivo que o
  // app gravou, lido pelo roteiro depois de fechar.
  checar(
    `configurações: get_state e settings_get iguais, no tema ${tema} (resolvido e último também)`,
    partidas.every((P) => {
      const c = P.console?.configuracoes ?? {};
      return c.antes && JSON.stringify(c.doEstado) === JSON.stringify(c.antes) &&
        c.antes.theme === tema && c.antes.resolvedTheme === tema && c.antes.lastNormalTheme === tema;
    }),
  );
  checar(
    'configurações: settings_set grava o volume 37, recusa o 999 com invalidValue e emite um tt://settings só',
    partidas.every((P) => {
      const c = P.console?.configuracoes ?? {};
      return c.depois?.volume === 37 && c.depois?.theme === tema && c.recusa?.code === 'invalidValue' &&
        c.final?.volume === 37 && c.eventos?.length === 1 && c.eventos[0].volume === 37;
    }),
  );
  checar(
    'configurações: o settings.json no disco, depois de fechar, tem o volume 37 e o tema certo',
    partidas.every((P) => {
      const arquivos = Object.values(P.settingsNoDisco ?? {});
      const gravado = arquivos.find((a) => a.volume === 37);
      return gravado && gravado.theme === tema && gravado.resolvedTheme === tema && gravado.lastNormalTheme === tema;
    }),
  );
  checar('Inter carregada', partidas.every((P) => P.console?.estado?.interCarregada === true));
  checar(
    'console do DevTools sem nenhum "Refused to"',
    partidas.every((P) => P.console && !P.console.erro && !(P.console.mensagens ?? []).some((m) => /Refused to/i.test(m.texto))),
  );
  // M12: os controles que abrem por cima da tela, abertos e fechados pelo
  // console.mjs no #/dev, sem nenhum "Refused to" (no build, sob a CSP).
  // M13: e a dica própria dos botões de ícone.
  const ABREM = ['menu-sessao', 'menu-temporizador', 'meta', 'zerar', 'amostra-dica-reiniciar', 'amostra-dica-volta', 'dica-botao', 'dialogo', 'dialogo-meta'];
  checar(
    'os menus, as listas, as dicas (também a dos botões de ícone) e o diálogo do #/dev abrem e fecham, sem nenhum "Refused to" no console',
    partidas.every((P) => {
      const x = P.console?.exercicio;
      return x && ABREM.every((k) => x.abriu?.[k] === true) && x.abertosNoFim === 0 &&
        !(P.console.mensagensDoExercicio ?? []).some((m) => /Refused to/i.test(m.texto));
    }),
  );
  if (r.modo === 'build') {
    const csp = partidas[0]?.console?.estado?.csp ?? '';
    console.log(`CSP recebida com o index.html: ${csp}`);
    console.log(`hash do script de boot: ${hashBoot}`);
    checar('build: a CSP do tauri.conf.json chega com o hash do script de boot', csp.includes("default-src 'self'") && csp.includes(hashBoot));
    checar(
      'build: controle positivo, a CSP recusa um script inline sem hash e o console mostra "Refused to"',
      partidas.every(
        (P) =>
          P.console?.controle === 'script inline recusado' &&
          (P.console?.mensagensDoControle ?? []).some((m) => /Refused to/i.test(m.texto)),
      ),
    );
  }
}

let falhou = false;
for (const [nome, ok] of Object.entries(checagens)) {
  console.log(`${ok ? 'ok   ' : 'FALHA'} ${nome}`);
  if (!ok) falhou = true;
}
process.exit(falhou || r.erro ? 1 : 0);
