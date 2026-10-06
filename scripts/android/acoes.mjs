#!/usr/bin/env node
// Os botões da notificação contínua (v0.5: o controle pela barra), no
// emulador de pé e com o build de depuração instalado:
//
//   node scripts/android/acoes.mjs
//
// Começa do zero (`pm clear`), inicia um foco por CDP e dispara as ações dos
// botões com o mesmo `Intent` do `PendingIntent` de cada um (`am start`):
//  1. com a fase correndo, a contínua tem "Pausar", "Pular" e "Encerrar";
//  2. app em segundo plano (HOME): "Pausar" pausa (a contínua fica sem
//     cronômetro, com "Retomar" e "Encerrar") e o app volta ao segundo plano;
//  3. "Retomar" retoma, do mesmo jeito;
//  4. processo morto (`am kill`): "Pausar" abre o app, pausa e o devolve ao
//     segundo plano;
//  5. app na frente: "Encerrar" encerra a sessão (a contínua some) e o app
//     continua na frente.
// Imprime um JSON com cada conferência e sai 1 se alguma falhou.
import { conectar } from './cdp.mjs';
import { abrir, ATIVIDADE, esperarPid, PACOTE_DEBUG } from './instalar.mjs';
import { carregarAmbiente, criarAdb, esperar } from './lib/ambiente.mjs';
import { ler } from './painel.mjs';

const env = carregarAmbiente();
const adb = criarAdb(env);
adb.serial = env.ANDROID_SERIAL;
const pacote = process.env.TT_PACOTE || PACOTE_DEBUG;

const resultados = [];
const conferir = (nome, ok, detalhe) => resultados.push({ nome, ok: Boolean(ok), detalhe });
const continua = () => ler(adb, pacote).notificacoes.find((n) => n.tag === 'sessao') ?? null;
async function esperarContinua(condicao, limiteMs = 12000) {
  const ate = Date.now() + limiteMs;
  let n = continua();
  while (!condicao(n) && Date.now() < ate) {
    await esperar(400);
    n = continua();
  }
  return n;
}
// Os textos dos botões da contínua, como o sistema os guarda.
const botoes = () => {
  const dump = adb.shell('dumpsys notification --noredact');
  const bloco = dump.split(/\n(?=\s*NotificationRecord\()/).find((b) => b.includes(`pkg=${pacote}`) && b.includes('tag=sessao')) ?? '';
  return [...bloco.matchAll(/\[\d+\] "([^"]+)" ->/g)].map((m) => m[1]);
};
const naFrente = () => /(mResumedActivity|topResumedActivity|ResumedActivity)[^\n]*tomatito/.test(adb.shell('dumpsys activity activities'));
const vivo = () => Boolean(adb.shell(`pidof ${pacote} || true`).trim());

/**
 * Dispara a ação de um botão com o mesmo `Intent` do `PendingIntent` dele
 * (AgendaDoSistema.acaoDoApp: a `MainActivity`, a `action`, o extra e as
 * flags NEW_TASK | SINGLE_TOP | NO_ANIMATION). O toque de verdade no painel
 * não dá para automatizar aqui: com o cronômetro da contínua andando, o
 * `uiautomator dump` não consegue o estado ocioso e devolve a árvore antiga
 * (o toque foi conferido à mão, docs/decisoes.md, v0.5).
 */
const ACOES = { Pausar: 'pausar', Retomar: 'retomar', Pular: 'pular', Encerrar: 'encerrar' };
async function tocarNoBotao(texto) {
  const acao = ACOES[texto];
  const saida = adb.shell(
    `am start -n ${pacote}/${ATIVIDADE} -a io.github.kbrianps.tomatito.ACAO.${acao} --es io.github.kbrianps.tomatito.ACAO ${acao} --el io.github.kbrianps.tomatito.ACAO_ID ${Date.now()} -f 0x30010000`,
  );
  await esperar(600);
  return !/Error|Exception/.test(saida);
}

async function principal() {
  adb(['shell', 'pm', 'clear', pacote]);
  adb(['shell', 'pm', 'grant', pacote, 'android.permission.POST_NOTIFICATIONS']);
  adb(['logcat', '-c']);
  abrir(adb, pacote);
  if (!(await esperarPid(adb, pacote))) throw new Error(`o app ${pacote} não abriu`);
  await esperar(1500);
  const cdp = await conectar({ pacote });
  try {
    await cdp.invoke('focus_start', { minutes: 60 });
  } finally {
    await cdp.fechar();
  }
  let n = await esperarContinua((x) => x?.cronometro);
  const b1 = botoes();
  conferir('1. correndo: a contínua tem Pausar, Pular e Encerrar', n?.cronometro && b1.join('|') === 'Pausar|Pular|Encerrar', { botoes: b1, titulo: n?.titulo });
  // Cada botão é um PendingIntent de atividade, com a ação no Intent.
  const dump = adb.shell('dumpsys notification --noredact');
  const alvos = [...dump.matchAll(/"(Pausar|Pular|Encerrar)" -> PendingIntent\{[^}]*\}/g)].length;
  conferir('1. os três botões têm PendingIntent', alvos >= 3, { alvos });

  // 2. Em segundo plano.
  adb(['shell', 'input', 'keyevent', 'KEYCODE_HOME']);
  await esperar(1500);
  const tocou2 = await tocarNoBotao('Pausar');
  n = await esperarContinua((x) => x && !x.cronometro);
  await esperar(2500);
  const b2 = botoes();
  conferir('2. em segundo plano: "Pausar" pausa, e os botões viram Retomar e Encerrar', tocou2 && n && !n.cronometro && /Pausado/.test(n.texto) && b2.join('|') === 'Retomar|Encerrar', { tocou: tocou2, texto: n?.texto, botoes: b2 });
  conferir('2. o app volta ao segundo plano', !naFrente(), { naFrente: naFrente() });

  // 3. Retomar.
  const tocou3 = await tocarNoBotao('Retomar');
  n = await esperarContinua((x) => x?.cronometro);
  await esperar(2500);
  conferir('3. "Retomar" retoma, e o app volta ao segundo plano', tocou3 && n?.cronometro && !naFrente(), { tocou: tocou3, cronometro: n?.cronometro, naFrente: naFrente() });

  // 4. Processo morto.
  adb(['shell', 'am', 'kill', pacote]);
  await esperar(1500);
  const morto = !vivo();
  const tocou4 = await tocarNoBotao('Pausar');
  n = await esperarContinua((x) => x && !x.cronometro, 20000);
  await esperar(3000);
  conferir('4. com o processo morto: "Pausar" abre o app, pausa e o devolve ao segundo plano', morto && tocou4 && n && !n.cronometro && vivo() && !naFrente(), { morto, tocou: tocou4, texto: n?.texto, vivo: vivo(), naFrente: naFrente() });

  // 5. Na frente.
  abrir(adb, pacote);
  await esperar(2500);
  const tocou5 = await tocarNoBotao('Encerrar');
  n = await esperarContinua((x) => !x);
  await esperar(1500);
  conferir('5. com o app na frente: "Encerrar" encerra a sessão, e o app continua na frente', tocou5 && !n && naFrente(), { tocou: tocou5, continua: n?.texto ?? null, naFrente: naFrente() });

  const log = adb.shell('logcat -d');
  conferir('logcat sem FATAL EXCEPTION nem panicked', !/FATAL EXCEPTION|panicked at/.test(log));
}

principal()
  .catch((erro) => conferir('o roteiro rodou até o fim', false, String(erro?.stack ?? erro)))
  .finally(() => {
    const falhas = resultados.filter((r) => !r.ok).length;
    console.log(JSON.stringify({ ok: falhas === 0, falhas, resultados }, null, 2));
    process.exit(falhas ? 1 : 0);
  });
