// Roteiro do M43 (acessibilidade e escala), carregado com
// `gnome-shell --automation-script` pelo dentro.sh. Abre o app sozinho
// (LANCA_O_APP), em três partidas, e usa só o teclado virtual para mexer no
// app (o ponteiro fica parado num canto):
//   partida 1, com o barramento de acessibilidade ligado e o Orca rodando
//     dentro do shell aninhado (fala para lugar nenhum: sem PipeWire e com o
//     ALSA sem configuração; o que ele diria vai para o --debug-file), e o
//     relógio a 60× (TOMATITO_SPEED=60, pelo rodar.sh):
//       a. as quatro telas percorridas só com Tab: cada parada tem o anel de
//          foco (:focus-visible) e está na janela, e todo controle visível da
//          tela é alcançado; a barra de título fica fora do Tab (3.8);
//       b. as ações de cada tela pelo teclado: na Foco, o seletor com PageUp,
//          Iniciar com Enter, pausar e retomar com Espaço, a sessão de 60 min
//          corre sozinha até o fim, e uma segunda sessão é encerrada pelo
//          menu "Mais opções" (Enter, setas, Enter); no Temporizador, iniciar
//          e pausar, e o diálogo "Adicionar" aberto e fechado com Esc; no
//          Cronômetro, iniciar, volta, pausar e zerar; nas Configurações, um
//          expansível, um switch e o tema pelas setas;
//       c. o Orca anuncia cada troca de fase uma única vez (as linhas
//          "SPEECH OUTPUT" do log dele contra a região aria-live);
//       d. zoom do Ctrl + (140% e 160%) nas quatro telas, na janela de
//          1000 × 700 e na mínima: nada passa da borda nem rola na horizontal;
//   partida 2, a escala do monitor do GNOME em 125%, 150% e 200% (pelo
//     org.gnome.Mutter.DisplayConfig; no Mutter 50, a fracionária já vem
//     ligada): a janela cabe na área de trabalho e as quatro telas
//     não rolam na horizontal;
//   partida 3, o "Texto grande" do GNOME (text-scaling-factor 1,25, por um
//     keyfile do GSettings só para o app): o WebKitGTK aplica como zoom de
//     125%; as quatro telas, a 1000 × 700 e na mínima, e com o Ctrl + por
//     cima (175% e 200%) na mínima.
// O resumo-acessibilidade.mjs confere as checagens e o log do Orca.
//
//   TOMATITO_SPEED=60 TT_LIMITE=900 bash scripts/gnome-aninhado/rodar.sh acessibilidade
//   TT_PARTES=1 ...   (só a partida 1; "2,3" para as outras)
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import 'resource:///org/gnome/shell/ui/screenshot.js'; // promisifica Shell.Screenshot

export const METRICS = {};
export const LANCA_O_APP = true;

Gio._promisify(Gio.DBusConnection.prototype, 'call', 'call_finish');

const OUT = GLib.getenv('TT_OUT');
const BIN = GLib.getenv('TOMATITO_BIN');
const SONDA_LOG = GLib.getenv('SONDA_LOG');
const PARTES = (GLib.getenv('TT_PARTES') ?? '1,2,3').split(',');
const R = { passos: [], checagens: {}, medidas: {} };

const salvar = () => GLib.file_set_contents(`${OUT}/resultado.json`, JSON.stringify(R, null, 2));
const sleep = (ms) =>
  new Promise((r) => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => (r(), GLib.SOURCE_REMOVE)));
const agoraMs = () => GLib.get_monotonic_time() / 1000;
const passo = (m) => {
  R.passos.push(`${Math.round(agoraMs())} ${m}`);
  salvar();
};
const checar = (nome, ok, detalhe) => {
  R.checagens[nome] = { ok: Boolean(ok), detalhe };
  passo(`${ok ? 'ok' : 'FALHA'}: ${nome}`);
};

function sonda() {
  try {
    const [, bytes] = GLib.file_get_contents(SONDA_LOG);
    return new TextDecoder().decode(bytes).split('\n').filter(Boolean).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}
async function esperar(fn, ms, oque) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const v = await fn();
    if (v) return v;
    await sleep(150);
  }
  throw new Error(`tempo esgotado: ${oque}`);
}

let nComando = 0;
async function comando(js, { log = true } = {}) {
  const id = `c${++nComando}`;
  // Só vale uma resposta que chegou depois do pedido (o log da sonda é
  // compartilhado pelas partidas).
  const antes = sonda().length;
  GLib.file_set_contents(`${OUT}/comando.json`, JSON.stringify({ id, js }));
  const r = await esperar(
    () => sonda().slice(antes).find((e) => e.tipo === 'comando' && e.dados.id === id),
    15000,
    `comando ${js.slice(0, 80)}`,
  );
  if (log) {
    const texto = JSON.stringify(r.dados.resultado) ?? 'null';
    passo(`comando ${js.slice(0, 100)} => ${texto.length > 300 ? `${texto.slice(0, 300)}…` : texto}`);
  }
  return r.dados.resultado;
}
const limparComando = () => GLib.file_set_contents(`${OUT}/comando.json`, '{}');
const estadoRust = () =>
  comando("window.__TAURI_INTERNALS__.invoke('get_state').then((s) => ({ foco: s.focus.status, fase: s.focus.phase?.kind ?? null, velocidade: s.speed }))");

function limparDadosDoApp() {
  for (const base of [GLib.get_user_data_dir(), GLib.get_user_cache_dir(), GLib.get_user_config_dir()]) {
    let it;
    try {
      it = Gio.File.new_for_path(base).enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
    } catch {
      continue;
    }
    for (let info = it.next_file(null); info; info = it.next_file(null)) {
      if (/tomatito/i.test(info.get_name())) GLib.spawn_command_line_sync(`rm -rf ${GLib.shell_quote(`${base}/${info.get_name()}`)}`);
    }
  }
}

// --- Teclado e ponteiro virtuais.
let ptr;
let kb;
const agora = () => GLib.get_monotonic_time();
const tecla = (keyval, apertada) => kb.notify_keyval(agora(), keyval, apertada ? Clutter.KeyState.PRESSED : Clutter.KeyState.RELEASED);
async function teclas(...keyvals) {
  for (const k of keyvals) {
    tecla(k, true);
    await sleep(30);
  }
  for (const k of [...keyvals].reverse()) {
    tecla(k, false);
    await sleep(30);
  }
  await sleep(120);
}
const K = Clutter;
const tab = () => teclas(K.KEY_Tab);
/** Aperta Tab (ou Shift+Tab) até o foco chegar num elemento do seletor. */
async function tabAte(seletor, { max = 40, voltar = false } = {}) {
  for (let i = 0; i < max; i++) {
    if (await comando(`__ttFocoEm(${JSON.stringify(seletor)})`, { log: false })) {
      passo(`foco em ${seletor} depois de ${i} ${voltar ? 'Shift+Tab' : 'Tab'}`);
      return true;
    }
    await (voltar ? teclas(K.KEY_Shift_L, K.KEY_Tab) : tab());
  }
  throw new Error(`o Tab não chegou em ${seletor}`);
}

// --- App.
let proc = null;
let pid = null;
const janelaDoApp = () =>
  global.get_window_actors().map((a) => a.meta_window).find((w) => String(w.get_pid()) === String(pid) && w.get_title() === 'Tomatito');
function esperarProcesso(p, ms) {
  return new Promise((resolve) => {
    let feito = false;
    const fim = (v) => !feito && ((feito = true), resolve(v));
    p.wait_async(null, () => fim(true));
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => (fim(false), GLib.SOURCE_REMOVE));
  });
}
const KEYFILE_DIR = `${GLib.get_user_config_dir()}/glib-2.0/settings`;
function lancador(arquivo, { a11y = false, textoGrande = false } = {}) {
  const L = new Gio.SubprocessLauncher({ flags: Gio.SubprocessFlags.STDERR_MERGE });
  L.setenv('WAYLAND_DISPLAY', 'tt-aninhado', true);
  L.setenv('GDK_BACKEND', 'wayland', true);
  L.setenv('ALSA_CONFIG_PATH', '/dev/null', true);   // sem saída de áudio
  if (a11y) L.unsetenv('NO_AT_BRIDGE');
  if (textoGrande) L.setenv('GSETTINGS_BACKEND', 'keyfile', true);
  L.set_stdout_file_path(`${OUT}/${arquivo}`);
  return L;
}
async function abrir(i, opcoes = {}) {
  const antes = sonda().filter((e) => e.tipo === 'estado').length;
  proc = lancador(`app-${i}.log`, opcoes).spawnv([BIN]);
  pid = proc.get_identifier();
  passo(`partida ${i}: pid ${pid} ${JSON.stringify(opcoes)}`);
  const W = await esperar(() => { const w = janelaDoApp(); return w && w.get_frame_rect().width > 0 ? w : null; }, 60000, `a janela da partida ${i}`);
  await esperar(() => sonda().filter((e) => e.tipo === 'estado').length > antes, 30000, 'a sonda da página');
  if (W.is_maximized()) W.unmaximize();
  W.move_resize_frame(true, 300, 100, 1000, 700);
  for (let k = 0; k < 20 && (Main.overview.visible || Main.overview.animationInProgress); k++) {
    if (!Main.overview.animationInProgress) Main.overview.hide();
    await sleep(500);
  }
  Main.activateWindow(W);
  await sleep(1200);
  return W;
}
async function sair() {
  await comando("window.__TAURI_INTERNALS__.invoke('app_quit').then(() => 'ok', (e) => ({ erro: e }))").catch(() => null);
  const saiu = await esperarProcesso(proc, 10000);
  limparComando();
  if (!saiu) {
    passo('o app não saiu pelo app_quit; SIGKILL');
    proc.force_exit();
    await esperarProcesso(proc, 5000);
  }
}
async function redimensionar(W, w, h) {
  W.move_resize_frame(true, W.get_frame_rect().x, W.get_frame_rect().y, w, h);
  await sleep(700);
  const r = W.get_frame_rect();
  return [r.width, r.height];
}
async function captura(nome) {
  const W = janelaDoApp();
  if (!W) return;
  const r = W.get_frame_rect();
  const shooter = new Shell.Screenshot();
  const s = Gio.File.new_for_path(`${OUT}/${nome}`).replace(null, false, Gio.FileCreateFlags.NONE, null);
  await shooter.screenshot_area(r.x, r.y, r.width, r.height, s);
  s.close(null);
  passo(`captura ${nome}`);
}

// --- Medidas de layout: as quatro telas, sem rolagem horizontal e sem nada
// passando da borda direita (scripts/preview/medidas.js, __ttMedir).
const TELAS = ['#/foco', '#/temporizador', '#/cronometro', '#/configuracoes'];
async function medirTelas(rotulo) {
  const linhas = [];
  for (const t of TELAS) {
    const m = await comando(`__ttMedir(${JSON.stringify(t)}).then((m) => ({ janela: m.janela, dpr: m.dpr, rolagem: m.rolagem, fora: m.foraDaJanela, fontes: m.fontesComErro }))`, { log: false });
    linhas.push({ tela: t, ...m });
  }
  R.medidas[rotulo] = linhas;
  salvar();
  const ruins = linhas.filter((l) => l.rolagem.pagina || l.rolagem.conteudo || l.rolagem.camada || l.fora.length || l.fontes.length);
  checar(`${rotulo}: as quatro telas sem rolagem horizontal e nada fora da janela (${linhas[0].janela.join(' × ')} px CSS, dpr ${Math.round(linhas[0].dpr * 100) / 100})`, ruins.length === 0, ruins.length ? ruins : linhas[0]);
  return linhas;
}

// --- Partida 1: teclado, Orca e zoom.
let orca = null;
function orcaNaSessaoDeVerdade() {
  // O Orca, ao subir, derruba as outras instâncias do mesmo usuário
  // (other_orcas() no /usr/bin/orca). Com um Orca seu aberto, a parte do Orca
  // fica de fora, para não mexer no leitor de tela da sua sessão.
  const [, saida] = GLib.spawn_command_line_sync(`pgrep -u ${GLib.getenv('UID') ?? ''} -x orca`);
  return new TextDecoder().decode(saida).trim().length > 0;
}
function abrirOrca() {
  const L = new Gio.SubprocessLauncher({ flags: Gio.SubprocessFlags.STDERR_MERGE });
  L.unsetenv('NO_AT_BRIDGE');
  L.setenv('WAYLAND_DISPLAY', 'tt-aninhado', true);
  L.setenv('ALSA_CONFIG_PATH', '/dev/null', true);
  L.set_stdout_file_path(`${OUT}/orca.log`);
  return L.spawnv(['orca', `--debug-file=${OUT}/orca-debug.out`]);
}
// O Orca grava o log com buffer do Python: só dá para ler tudo depois que ele
// sai. Por isso as conferências da fala marcam o horário de cada trecho
// (relogio(), o mesmo formato das linhas do log) e rodam no fim, com o Orca
// já fechado (conferirFalas).
const relogio = () => GLib.DateTime.new_now_local().format('%H:%M:%S.%f');
function falasDoOrca() {
  try {
    const [, bytes] = GLib.file_get_contents(`${OUT}/orca-debug.out`);
    // "HH:MM:SS.ffffff - SPEECH OUTPUT: 'texto' {voz}" (orca/speech.py): o
    // texto vai até o "' {" da voz, ou até o último apóstrofo.
    return new TextDecoder().decode(bytes).split('\n').filter((l) => l.includes("SPEECH OUTPUT: '")).map((l) => {
      const resto = l.slice(l.indexOf("SPEECH OUTPUT: '") + 16);
      const fim = resto.indexOf("' {");
      return { t: l.slice(0, 15), texto: fim >= 0 ? resto.slice(0, fim) : resto.replace(/'\s*$/, '') };
    });
  } catch {
    return [];
  }
}
const trechos = {};
const falasEntre = (todas, [de, ate]) => todas.filter((f) => f.t >= de && f.t <= ate).map((f) => f.texto);

const ATALHOS = {
  '#/foco': [K.KEY_Control_L, K.KEY_1],
  '#/temporizador': [K.KEY_Control_L, K.KEY_2],
  '#/cronometro': [K.KEY_Control_L, K.KEY_3],
  '#/configuracoes': [K.KEY_Control_L, K.KEY_comma],
};
async function irPeloTeclado(tela) {
  await teclas(...ATALHOS[tela]);
  await sleep(500);
  const hash = await comando('location.hash', { log: false });
  if (hash !== tela) throw new Error(`o atalho de ${tela} deu ${hash}`);
}

async function percorrerComTab(tela) {
  await irPeloTeclado(tela);
  // Começa do título da tela (o ponto de partida depois de trocar de tela
  // pelo painel): Tab e Shift+Tab a partir dele.
  await comando("(document.querySelector('.tt-rolagem h1')?.focus(), document.activeElement?.localName)", { log: false });
  const esperados = await comando('__ttTabulaveis()', { log: false });
  await comando('__ttGravarFoco()', { log: false });
  const n = esperados.length + 4;
  for (let i = 0; i < n; i++) await tab();
  await sleep(300);
  const ida = await comando('__ttColherFoco()', { log: false });
  for (let i = 0; i < n; i++) await teclas(K.KEY_Shift_L, K.KEY_Tab);
  await sleep(300);
  const volta = await comando('__ttColherFoco()', { log: false });
  R.medidas[`tab ${tela}`] = { esperados, ida, volta };
  salvar();
  const visitados = new Set(ida.map((f) => f.id));
  const faltam = esperados.filter((e) => !visitados.has(e.id));
  const semAnel = ida.filter((f) => f.id && (!f.visivel || !f.anel));
  const foraDaVista = ida.filter((f) => f.id && !f.naJanela);
  const naBarra = ida.filter((f) => f.area === 'barra');
  const noCorpo = ida.filter((f) => !f.id);
  const voltaVisitados = new Set(volta.map((f) => f.id));
  checar(`Tab em ${tela}: ${esperados.length} controles, todos alcançados só com o teclado`, esperados.length > 0 && faltam.length === 0, { faltam, ida: ida.map((f) => f.nome) });
  checar(`Tab em ${tela}: cada parada com o anel de foco e dentro da janela, nenhuma na barra de título`,
    semAnel.length === 0 && foraDaVista.length === 0 && naBarra.length === 0, { semAnel, foraDaVista, naBarra, noCorpo: noCorpo.length });
  checar(`Shift+Tab em ${tela}: volta pelos mesmos controles`, esperados.every((e) => voltaVisitados.has(e.id)), volta.map((f) => f.nome));
}

function conferirFalas() {
  const todas = falasDoOrca();
  R.medidas.falasDoOrca = todas;
  if (trechos.telaFoco) {
    const lidas = falasEntre(todas, trechos.telaFoco);
    const nomes = ['Duração da sessão', 'spin button', '30 minutos', 'Pular intervalos', 'check box', 'Iniciar sessão de foco',
      'Adicionar tarefa', 'Mais opções das tarefas', 'Editar meta diária', 'Principal', 'Foco', 'Página atual'];
    const faltam = nomes.filter((n) => !lidas.some((l) => l.includes(n)));
    checar('Orca lê a tela Foco pelo Tab: o nome, o papel e o valor de cada controle, e o item atual do painel', faltam.length === 0, { faltam, lidas });
  }
  if (trechos.fases) {
    // Cada texto é dito tantas vezes quantas foi anunciado (o "1 de 2" abre
    // as duas sessões): nem menos (perdido), nem mais (repetido).
    const falas = falasEntre(todas, trechos.fases);
    const esperados = R.medidas.anunciosEsperados;
    const contagem = Object.fromEntries([...new Set(esperados)].map((t) => [t, { anunciado: esperados.filter((e) => e === t).length, dito: falas.filter((f) => f.includes(t.replace(/\.$/, ''))).length }]));
    checar('Orca: cada troca de fase dita uma única vez', Object.values(contagem).every((c) => c.dito === c.anunciado), contagem);
    const minuto = falas.filter((f) => /minutos? restantes/.test(f));
    checar('Orca: o rótulo do mostrador (uma vez por minuto) não é lido sozinho durante a sessão', minuto.length === 0, minuto);
  }
  if (trechos.copiar) {
    const ditas = falasEntre(todas, trechos.copiar).filter((f) => f.includes('Voltas copiadas'));
    checar('Orca lê "Voltas copiadas" uma vez', ditas.length === 1, ditas);
  }
}

async function partida1() {
  const semOrca = orcaNaSessaoDeVerdade();
  R.medidas.orcaNaSessao = semOrca;
  if (!semOrca) {
    orca = abrirOrca();
    passo(`Orca: pid ${orca.get_identifier()}`);
    await sleep(4000);
  } else {
    passo('há um Orca na sua sessão: a parte do Orca fica de fora');
  }
  const W = await abrir(1, { a11y: true });
  const e0 = await estadoRust();
  checar('partida 1: o relógio acelerado (TOMATITO_SPEED=60) e o foco ocioso', e0.velocidade === 60 && e0.foco === 'idle', e0);
  await comando('__ttOuvirAnuncios()');
  const arvore = await comando('__ttArvoreA11y()');
  checar('uma única região aria-live, polite e vazia, e o <html> em pt-BR', arvore.lang === 'pt-BR' && arvore.vivos.length === 1 && arvore.vivos[0].live === 'polite' && arvore.vivos[0].texto === '', arvore);

  // O Orca lendo a tela Foco: Tab devagar (um a cada 900 ms, para ele
  // terminar de falar), do título até o painel.
  if (!semOrca) {
    await irPeloTeclado('#/foco');
    await comando("document.querySelector('.tt-rolagem h1').focus()", { log: false });
    await sleep(1500);
    const de = relogio();
    const n = (await comando('__ttTabulaveis()', { log: false })).length + 1;
    for (let i = 0; i < n; i++) {
      await tab();
      await sleep(900);
    }
    trechos.telaFoco = [de, relogio()];
  }

  // a. As quatro telas só com Tab.
  for (const t of TELAS) await percorrerComTab(t);

  // b. Foco pelo teclado: seletor, Iniciar, pausar e retomar.
  await irPeloTeclado('#/foco');
  await comando("document.querySelector('.tt-rolagem h1').focus()", { log: false });
  await tabAte('[data-cartao="sessao"] [role="spinbutton"]');
  await teclas(K.KEY_Page_Up);
  await teclas(K.KEY_Page_Up);
  const valor = await comando("document.querySelector('[data-cartao=\"sessao\"] [role=\"spinbutton\"]').getAttribute('aria-valuenow')");
  checar('Foco: PageUp duas vezes leva o seletor de 30 a 60 minutos', valor === '60', valor);
  await tabAte('[data-cartao="sessao"] [data-iniciar]');
  const inicioDasFases = relogio();
  const t0 = agoraMs();
  await teclas(K.KEY_Return);
  await sleep(600);
  const e1 = await estadoRust();
  checar('Foco: Enter no "Iniciar" começa a sessão', e1.foco === 'focus', e1);
  await tabAte('[data-cartao="sessao"] button[data-acao]');
  await teclas(K.KEY_space);
  await sleep(400);
  const e2 = await estadoRust();
  await teclas(K.KEY_space);
  await sleep(400);
  const e3 = await estadoRust();
  checar('Foco: Espaço no botão principal pausa e retoma', e2.foco === 'paused' && e3.foco === 'focus', [e2, e3]);
  await captura('m43-foco-teclado.png');
  // A sessão de 60 min corre sozinha: foco, intervalo, foco e concluída.
  const fim = await esperar(async () => { const e = await estadoRust(); return e.foco === 'completed' || e.foco === 'idle' ? e : null; }, 150000, 'o fim da sessão');
  passo(`sessão concluída em ${Math.round((agoraMs() - t0) / 1000)} s: ${JSON.stringify(fim)}`);
  await sleep(1500);   // o Orca fala depois de um instante
  // Segunda sessão, encerrada pelo menu "Mais opções" com o teclado.
  await comando("document.querySelector('.tt-rolagem h1').focus()", { log: false });
  await tabAte('[data-cartao="sessao"] [data-iniciar]');
  await teclas(K.KEY_Return);
  await sleep(600);
  await tabAte('[data-cartao="sessao"] [data-mais]');
  await teclas(K.KEY_Return);
  await sleep(500);
  for (let i = 0; i < 4 && !(await comando('__ttFocoEm(\'fluent-menu-item[data-item="parar"]\')', { log: false })); i++) await teclas(K.KEY_Down);
  const noItem = await comando('__ttFocoAgora()');
  await teclas(K.KEY_Return);
  await sleep(800);
  const e4 = await estadoRust();
  checar('Foco: "Mais opções" com Enter, as setas até "Encerrar sessão" e Enter encerram a sessão', e4.foco === 'idle' && /Encerrar/.test(noItem.nome), { e4, noItem });
  await sleep(2500);

  // c. O que foi anunciado, e o que o Orca disse.
  const anuncios = (await comando('window.__ttAnuncios')).map((a) => a.texto);
  trechos.fases = [inicioDasFases, relogio()];
  R.medidas.anuncios = anuncios;
  const esperados = [
    'Começou o período de foco 1 de 2.', 'Começou o intervalo 1 de 1.', 'Começou o período de foco 2 de 2.',
    'Sessão de foco concluída.', 'Começou o período de foco 1 de 2.', 'Sessão de foco encerrada.',
  ];
  R.medidas.anunciosEsperados = esperados;
  checar('região aria-live: um texto por troca de fase, na ordem, sem repetir', JSON.stringify(anuncios) === JSON.stringify(esperados), anuncios);

  // Temporizador pelo teclado.
  await irPeloTeclado('#/temporizador');
  await comando("document.querySelector('.tt-rolagem h1').focus()", { log: false });
  await tabAte('.tt-temporizador .tt-temporizador-botoes button[data-acao]');
  await teclas(K.KEY_Return);
  await sleep(500);
  const tm1 = await comando("document.querySelector('.tt-temporizador').dataset.estado");
  await teclas(K.KEY_Return);
  await sleep(500);
  const tm2 = await comando("document.querySelector('.tt-temporizador').dataset.estado");
  checar('Temporizador: Enter inicia e pausa o primeiro temporizador', tm1 === 'running' && tm2 === 'paused', [tm1, tm2]);
  await tabAte('[data-adicionar]');
  await teclas(K.KEY_Return);
  await sleep(700);
  const aberto = await comando("Boolean(document.querySelector('fluent-dialog dialog[open], fluent-dialog [open]') || [...document.querySelectorAll('fluent-dialog')].some((d) => d.shadowRoot?.querySelector('dialog')?.open))");
  const focoNoDialogo = await comando('__ttFocoAgora()');
  await teclas(K.KEY_Escape);
  await sleep(700);
  const fechado = await comando("![...document.querySelectorAll('fluent-dialog')].some((d) => d.shadowRoot?.querySelector('dialog')?.open)");
  const devolvido = await comando("__ttFocoEm('[data-adicionar]')");
  checar('Temporizador: Enter no "+" abre o diálogo com o foco dentro, Esc fecha e devolve o foco ao "+"', aberto && focoNoDialogo.area === 'diálogo' && fechado && devolvido, { aberto, focoNoDialogo, fechado, devolvido });

  // Cronômetro pelo teclado.
  await irPeloTeclado('#/cronometro');
  await comando("document.querySelector('.tt-rolagem h1').focus()", { log: false });
  await tabAte('.tt-cronometro-botoes button[data-acao]');
  await teclas(K.KEY_Return);
  await sleep(700);
  await tabAte('button[data-acao="volta"]');
  await teclas(K.KEY_Return);
  await sleep(300);
  const voltas = await comando("document.querySelectorAll('.tt-voltas [data-linhas] tr').length");
  // "Copiar" pelo teclado: o aviso "Voltas copiadas" (o Orca o lê uma vez;
  // conferido no fim).
  const deCopiar = relogio();
  await tabAte('[data-copiar]');
  await teclas(K.KEY_Return);
  await sleep(2500);
  trechos.copiar = [deCopiar, relogio()];
  const aviso = await comando("document.querySelector('[data-aviso]').textContent");
  checar('Cronômetro: "Copiar" pelo teclado mostra "Voltas copiadas"', aviso === 'Voltas copiadas', aviso);
  await tabAte('.tt-cronometro-botoes button[data-acao]:first-child', { voltar: true });
  await teclas(K.KEY_Return);
  await sleep(400);
  await tabAte('button[data-acao="redefinir"]');
  await teclas(K.KEY_Return);
  await sleep(500);
  const zerado = await comando("document.querySelector('[data-tempo]').getAttribute('aria-label')");
  const focoDepois = await comando('__ttFocoAgora()');
  checar('Cronômetro: Enter inicia, marca uma volta, pausa e zera; o foco do "Redefinir", que se desabilita, vai para o principal',
    voltas >= 1 && zerado === 'Cronômetro zerado' && /Iniciar/.test(focoDepois.nome), { voltas, zerado, focoDepois });

  // As Configurações rodam sem o Orca: no modo de navegação dele, as setas
  // andam pelo texto e não chegam ao grupo de temas (é o comportamento de
  // leitor de tela; o Orca+A ou o Espaço passam ao modo de foco).
  if (orca) {
    orca.send_signal(15);
    await esperarProcesso(orca, 5000);
    try { orca.force_exit(); } catch { /* já saiu */ }
    orca = null;
    passo('Orca fechado');
    conferirFalas();
  }

  // Configurações pelo teclado.
  await irPeloTeclado('#/configuracoes');
  await comando("document.querySelector('.tt-rolagem h1').focus()", { log: false });
  await tabAte('.tt-expansor-botao');
  await teclas(K.KEY_Return);
  await sleep(400);
  const expandido = await comando("document.querySelector('.tt-expansor-botao').getAttribute('aria-expanded')");
  await teclas(K.KEY_Return);
  await sleep(300);
  await comando("document.querySelector('.tt-rolagem h1').focus()", { log: false });
  await tabAte('[data-cartao="fechar-bandeja"] fluent-switch');
  const sw0 = await comando("document.querySelector('[data-cartao=\"fechar-bandeja\"] fluent-switch').checked");
  await teclas(K.KEY_space);
  await sleep(400);
  const sw1 = await comando("document.querySelector('[data-cartao=\"fechar-bandeja\"] fluent-switch').checked");
  await teclas(K.KEY_space);
  await sleep(400);
  checar('Configurações: Enter abre o expansível e Espaço liga e desliga o switch', expandido === 'true' && sw0 !== sw1, { expandido, sw0, sw1 });
  await comando("document.querySelector('.tt-rolagem h1').focus()", { log: false });
  await tabAte('fluent-radio-group.tt-temas');
  const tema0 = await comando('document.documentElement.dataset.theme');
  await teclas(K.KEY_Right);
  await sleep(900);
  const tema1 = await comando('document.documentElement.dataset.theme');
  const focoNoTema = await comando('__ttFocoAgora()');
  await teclas(K.KEY_Left);
  await sleep(900);
  const tema2 = await comando('document.documentElement.dataset.theme');
  checar('Configurações: as setas no grupo de temas trocam o tema e voltam', tema0 !== tema1 && tema2 === tema0, { temas: [tema0, tema1, tema2], focoNoTema });

  // d. Zoom pelo Ctrl +.
  const Z = [K.KEY_Control_L, K.KEY_equal];
  await teclas(...Z);
  await teclas(...Z);
  await sleep(600);
  await medirTelas('zoom de 140%, 1000 × 700');
  await teclas(...Z);
  await sleep(600);
  await medirTelas('zoom de 160%, 1000 × 700');
  await redimensionar(W, 480, 500);
  await medirTelas('zoom de 160%, janela mínima');
  await comando("location.hash = '#/cronometro'", { log: false });
  await sleep(500);
  await captura('m43-zoom160-minima.png');
  await teclas(K.KEY_Control_L, K.KEY_0);
  await sleep(600);
  const dpr = await comando('devicePixelRatio');
  checar('Ctrl+0 volta ao zoom de 100%', Math.abs(dpr - 1) < 0.01, dpr);
  await sair();
}

// --- Partida 2: escala do monitor.
const DC = ['org.gnome.Mutter.DisplayConfig', '/org/gnome/Mutter/DisplayConfig', 'org.gnome.Mutter.DisplayConfig'];
async function estadoDosMonitores() {
  const r = await Gio.DBus.session.call(...DC, 'GetCurrentState', null, null, Gio.DBusCallFlags.NONE, -1, null);
  return r.deepUnpack();
}
async function aplicarEscala(escala) {
  const [serial, monitores, logicos] = await estadoDosMonitores();
  const [spec, modos] = monitores[0];
  const modo = modos.find((m) => m[6]['is-current']?.unpack()) ?? modos[0];
  const suportadas = modo[5];
  const exata = suportadas.reduce((a, b) => (Math.abs(b - escala) < Math.abs(a - escala) ? b : a));
  const [x, y, , transform, primario] = logicos[0];
  const cfg = new GLib.Variant('(uua(iiduba(ssa{sv}))a{sv})', [
    serial, 1, [[x, y, exata, transform, primario, [[spec[0], modo[0], {}]]]], {},
  ]);
  await Gio.DBus.session.call(...DC, 'ApplyMonitorsConfig', cfg, null, Gio.DBusCallFlags.NONE, -1, null);
  await sleep(1500);
  const m = global.display.get_monitor_geometry(0);
  return { pedida: escala, aplicada: exata, suportadas: suportadas.map((s) => Math.round(s * 1000) / 1000), logico: [m.width, m.height], escalaDoMonitor: global.display.get_monitor_scale(0) };
}
async function partida2() {
  // No Mutter 50, a escala fracionária já vem ligada (o experimental
  // "scale-monitor-framebuffer" não existe mais).
  const W = await abrir(2);
  for (const escala of [1.25, 1.5, 2]) {
    const e = await aplicarEscala(escala);
    R.medidas[`escala ${escala}`] = e;
    checar(`escala do GNOME em ${escala * 100}%: aplicada no monitor`, Math.abs(e.escalaDoMonitor - escala) < 0.01, e);
    const area = W.get_work_area_current_monitor();
    // A janela de 1000 × 700, ou o que couber, no canto da área de trabalho
    // (a 200%, a área lógica é de 960 × 508).
    W.move_resize_frame(true, area.x, area.y, Math.min(1000, area.width), Math.min(700, area.height));
    await sleep(700);
    const [w, h] = [W.get_frame_rect().width, W.get_frame_rect().height];
    Main.activateWindow(W);
    await sleep(800);
    const r = W.get_frame_rect();
    checar(`escala ${escala * 100}%: a janela cabe na área de trabalho (${r.width} × ${r.height} em ${area.width} × ${area.height})`,
      r.x >= area.x && r.y >= area.y && r.x + r.width <= area.x + area.width && r.y + r.height <= area.y + area.height, { r: [r.x, r.y, r.width, r.height], area: [area.x, area.y, area.width, area.height], pedido: [w, h] });
    await medirTelas(`escala ${escala * 100}%, ${r.width} × ${r.height}`);
    await redimensionar(W, 480, 500);
    await medirTelas(`escala ${escala * 100}%, janela mínima`);
    if (escala === 2) {
      await comando("location.hash = '#/foco'", { log: false });
      await sleep(400);
      await captura('m43-escala200-minima.png');
    }
  }
  await aplicarEscala(1);
  await sair();
}

// --- Partida 3: "Texto grande".
async function partida3() {
  GLib.mkdir_with_parents(KEYFILE_DIR, 0o755);
  GLib.file_set_contents(`${KEYFILE_DIR}/keyfile`, '[org/gnome/desktop/interface]\ntext-scaling-factor=1.25\n');
  const W = await abrir(3, { textoGrande: true });
  const z = await comando('({ dpr: devicePixelRatio, largura: innerWidth })');
  R.medidas.textoGrande = z;
  checar('"Texto grande": o WebKitGTK aplica como zoom de 125% (a janela de 1000 px tem 800 px CSS)', Math.abs(z.dpr - 1.25) < 0.01 && Math.abs(z.largura - 800) <= 1, z);
  await medirTelas('"Texto grande", 1000 × 700');
  await redimensionar(W, 480, 500);
  await medirTelas('"Texto grande", janela mínima');
  const Z = [K.KEY_Control_L, K.KEY_equal];
  await teclas(...Z);
  await teclas(...Z);
  await sleep(600);
  await medirTelas('"Texto grande" com Ctrl + (175%), janela mínima');
  await teclas(...Z);
  await sleep(600);
  await medirTelas('"Texto grande" com Ctrl + (200%), janela mínima');
  for (const t of ['#/temporizador', '#/cronometro', '#/configuracoes']) {
    await comando(`location.hash = ${JSON.stringify(t)}`, { log: false });
    await sleep(500);
    await captura(`m43-textogrande200-${t.slice(2)}.png`);
  }
  await teclas(K.KEY_Control_L, K.KEY_0);
  await sleep(600);
  const z0 = await comando('devicePixelRatio');
  checar('"Texto grande": Ctrl+0 volta aos 125% do sistema, e não a 100%', Math.abs(z0 - 1.25) < 0.01, z0);
  await sair();
  GLib.unlink(`${KEYFILE_DIR}/keyfile`);
}

async function principal() {
  passo(`início (partes ${PARTES.join(', ')})`);
  Main.messageTray.bannerBlocked = true;
  new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' }).set_boolean('enable-animations', false);
  if (Main.overview.visible) Main.overview.hide();
  const seat = global.stage.context.get_backend().get_default_seat();
  ptr = seat.create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
  kb = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
  await sleep(200);
  ptr.notify_absolute_motion(agora(), 1900, 1070);   // o ponteiro fica num canto, fora do app
  await sleep(300);
  limparDadosDoApp();
  if (PARTES.includes('1')) await partida1();
  if (PARTES.includes('2')) await partida2();
  if (PARTES.includes('3')) await partida3();
  passo('fim');
}

export async function run() {
  try {
    await principal();
  } catch (e) {
    R.erro = `${e}\n${e.stack}`;
    salvar();
    try {
      proc?.force_exit();
    } catch {
      // já saiu
    }
  }
  try {
    orca?.force_exit();
  } catch {
    // já saiu
  }
  GLib.file_set_contents(`${OUT}/comando.json`, '{}');
}
