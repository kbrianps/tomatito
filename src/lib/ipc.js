// Ponte com o Rust (PLANO.md, 3.5): os comandos (invoke) e os eventos
// (listen) que as telas usam, com os nomes do Rust num lugar só. O formato dos
// retratos está em src-tauri/src/events.rs.
// PLANO-WEB (3.2): tudo pelo `#plataforma` (o Tauri no desktop, a camada web
// no build web).
import { invoke, emit, listen } from '#plataforma';

export const EVENTOS = Object.freeze({
  estado: 'tt://state',
  tick: 'tt://tick',
  fase: 'tt://phase',
  // M23: as configurações inteiras, depois de cada `settings_set`.
  configuracoes: 'tt://settings',
  // M32: o retrato de todos os temporizadores, a cada mudança.
  temporizadores: 'tt://timers',
  // M34: o retrato do cronômetro, a cada transição.
  cronometro: 'tt://stopwatch',
  // v0.3: o download da atualização (`{ downloaded, total }`) e a versão
  // achada pela procura ao abrir (`{ version }`); só no desktop.
  atualizacaoProgresso: 'tt://update-progress',
  atualizacaoDisponivel: 'tt://update-available',
});

/** `get_state`: `{ focus, speed, setup, timers, stopwatch, settings, recursos }`. */
export const obterEstado = () => invoke('get_state');

/**
 * `app_quit` (M37): "Sair" (3.4). Encerra a sessão de foco com o parcial,
 * grava o `state.json` e fecha o app; o mesmo caminho do "Sair" da bandeja.
 */
export const sair = () => invoke('app_quit');
// M43: pede ao leitor de tela do Linux que leia um texto (src-tauri/src/anuncio.rs).
// `fase: true` marca o anúncio das fases, que a `main` e a `tomato` repetem:
// só esse passa pelo filtro da janela da frente; os outros sempre valem.
export const anunciarAoLeitor = (texto, { fase = false } = {}) => invoke('a11y_announce', { text: texto, fase });

/**
 * M39: a versão do app, para o Sobre. O `getVersion()` do Tauri lê a versão
 * da configuração, que não tem a chave `version` (1.1): vale a do Cargo.toml.
 * Na web, a mesma versão, gravada no build. Função nas duas plataformas.
 */
export { versao } from '#plataforma';

/**
 * M46: os arquivos de licença do pacote (bundle.resources), lidos pelo Rust
 * (src-tauri/src/avisos.rs). `ler('avisos')` resolve com o texto do
 * THIRD_PARTY_NOTICES.md e `ler('ofl')`, com o do OFL-Inter.txt; sem o
 * arquivo, rejeita com `{ code: 'notFound', message }`.
 */
export const avisos = Object.freeze({
  ler: (doc) => invoke('notices_read', { doc }),
});

/**
 * Comandos do foco. Cada um devolve o retrato novo (o mesmo do `tt://state`)
 * ou rejeita com `{ code, message }` (engine.rs, `CommandError`).
 */
export const foco = Object.freeze({
  iniciar: (minutos, { pularIntervalos = false, tarefa = null } = {}) =>
    invoke('focus_start', { minutes: minutos, skipBreaks: pularIntervalos, taskId: tarefa }),
  pausar: () => invoke('focus_pause'),
  retomar: () => invoke('focus_resume'),
  pular: () => invoke('focus_skip'),
  parar: () => invoke('focus_stop'),
});

/**
 * `sound_test{sound?}` (audio.rs, M20): toca `'focusEnd'` ou `'breakEnd'`
 * agora, com o volume atual; sem argumento, os dois, um depois do outro.
 * Resolve na hora, sem esperar o som; um erro de áudio só vai para o log do Rust.
 */
export const sons = Object.freeze({
  testar: (som) => invoke('sound_test', som ? { sound: som } : {}),
});

/**
 * Configurações (src-tauri/src/settings.rs, M23): o formato do
 * `settings.json`, em camelCase. O Rust é o único dono: `gravar` manda só as
 * chaves que mudam (`sounds` pode ir pela metade), resolve com as
 * configurações inteiras depois das regras de tema, e o Rust emite
 * `tt://settings` para todas as janelas. Uma chave desconhecida ou um valor
 * inválido rejeita o patch inteiro com `{ code, message }` (`unknownKey`,
 * `invalidValue`, `invalidPatch` ou `writeFailed`).
 */
export const configuracoes = Object.freeze({
  obter: () => invoke('settings_get'),
  gravar: (patch) => invoke('settings_set', { patch }),
});

/**
 * Estatísticas (src-tauri/src/stats.rs, M26). `obter` resolve com
 * `{ yesterdayS, todayS, weekS, dailyGoalMinutes, resetHour }`: os segundos
 * de foco de ontem, de hoje e desta semana (segunda a domingo), contados pela
 * hora de zerar, e a meta (0 = desativada) lida das configurações. A meta e a
 * hora de zerar se gravam pelo `configuracoes.gravar` (M28).
 */
export const estatisticas = Object.freeze({
  obter: () => invoke('stats_get'),
  /**
   * v0.3: `{ totalS, periods, days, since, weeks: [{ monday, focusS }] }`: os
   * totais de todo o tempo e o foco de cada semana (a segunda em
   * `AAAA-MM-DD`), da primeira com foco até a atual, em ordem.
   */
  historico: () => invoke('stats_history'),
});

/**
 * Tarefas (src-tauri/src/tasks.rs, M29). Cada tarefa é
 * `{ id, title, createdAt, doneAt }`, com os horários em ms UTC e `doneAt`
 * nulo nas pendentes. `listar` traz as pendentes e as concluídas desde a
 * virada de hoje (a hora de zerar), na ordem de criação: a concluída fica na
 * lista, marcada, até a virada seguinte. `adicionar` e `concluir` resolvem
 * com a tarefa como ficou; `concluir(id, false)` volta a pendente. Os erros
 * vêm como `{ code, message }`, com `code` em `emptyTitle`, `titleTooLong`
 * (mais de 255 caracteres), `notFound` ou `storage`.
 */
export const tarefas = Object.freeze({
  listar: () => invoke('task_list'),
  adicionar: (titulo) => invoke('task_add', { title: titulo }),
  concluir: (id, feita = true) => invoke('task_complete', { id, done: feita }),
  apagar: (id) => invoke('task_delete', { id }),
});

/**
 * Temporizadores (src-tauri/src/engine.rs, M32). Cada comando resolve com o
 * retrato de todos (`{ seq, at, timers: [{ id, name, durationMs, status,
 * endsAt, remainingMs, ended, overdue }] }`, o mesmo do `tt://timers`), com
 * `status` em `idle`, `running` ou `paused` e `remainingMs` negativo depois do
 * zero. Os erros vêm como `{ code, message }`, com `code` em `notFound`,
 * `invalidDuration`, `nameTooLong`, `alreadyRunning` ou `notRunning`.
 * `criar`, `editar` e `excluir` são da barra e do diálogo do M33.
 */
export const temporizadores = Object.freeze({
  criar: (nome, duracaoMs) => invoke('timer_create', { name: nome, durationMs: duracaoMs }),
  editar: (id, nome, duracaoMs) => invoke('timer_update', { id, name: nome, durationMs: duracaoMs }),
  excluir: (id) => invoke('timer_delete', { id }),
  iniciar: (id) => invoke('timer_start', { id }),
  pausar: (id) => invoke('timer_pause', { id }),
  redefinir: (id) => invoke('timer_reset', { id }),
});

/**
 * Cronômetro (src-tauri/src/engine.rs, M34). Cada comando resolve com o
 * retrato novo (`{ seq, at, status, startedAt, accumulatedMs, elapsedMs,
 * laps }`, o mesmo do `tt://stopwatch`), com `status` em `idle`, `running` ou
 * `paused`, `startedAt` (ms UTC) só correndo e `laps` com o decorrido total
 * em cada volta. Os erros vêm como `{ code, message }`, com `code` em
 * `alreadyRunning`, `notRunning` ou `tooManyLaps`.
 */
export const cronometro = Object.freeze({
  iniciar: () => invoke('stopwatch_start'),
  pausar: () => invoke('stopwatch_pause'),
  volta: () => invoke('stopwatch_lap'),
  redefinir: () => invoke('stopwatch_reset'),
});

/**
 * Tomatito Full (3.5 e 5.7). `trocarModo(full)` é o `switch_window_mode{full}`
 * (M51): `true` entra no Full (a `tomato` aparece e a `main` se esconde),
 * `false` sai (volta ao `lastNormalTheme`, mostra a `main` e fecha a
 * `tomato`). `mostrarMain(rota)` é o `show_main{route}`: mostra a `main` sem
 * fechar a `tomato`, na rota dada (`'#/configuracoes'`) ou na tela em que
 * estava. `avisarPronto(dados)` emite o `tt://tomato-ready` (só a página do
 * tomate), com `{ userAgent, renderer }`: libera o `show()` do tomate.
 * M52: `validacao()` é o `full_validation_get` e `responderValidacao(r)` o
 * `full_validation_answer{answer}` (`keep`, `revert`, `opaque` ou
 * `dismiss`); os dois devolvem o retrato da validação com reversão (5.9),
 * que também chega pelo `tt://full-validation` (window/validacao.rs).
 * M54: `definirRegiao(faixas)` é o `set_tomato_region{strips}` (só a página
 * do tomate): a região de entrada, em `[x, y, largura, altura]`; devolve
 * `'applied'` ou `'ignored'`. O Rust pede a região de novo, a cada troca de
 * tamanho da janela, pelo `tt://tomato-region` (`EVENTO_REGIAO`).
 * `tamanhoDeDebug(lado)` é o `tomato_debug_size{size}` (só no build de debug,
 * sem gravar; a escolha de verdade grava o `tomatoSize` pelo `settings_set`,
 * e o Rust troca o tamanho, M56). M56: `sempreNaFrente()` é o
 * `tomato_on_top_available`: se o "Sempre na frente" funciona por código
 * (Windows e X11; no Wayland, não).
 */
export const full = Object.freeze({
  EVENTO_PRONTO: 'tt://tomato-ready',
  EVENTO_VALIDACAO: 'tt://full-validation',
  EVENTO_REGIAO: 'tt://tomato-region',
  // v0.4: `compacto` abre a janelinha como um cartão no tema normal.
  trocarModo: (entrar, { compacto = false } = {}) => invoke('switch_window_mode', { full: entrar, compact: compacto }),
  mostrarMain: (rota = null) => invoke('show_main', { route: rota }),
  avisarPronto: (dados) => emit('tt://tomato-ready', dados),
  validacao: () => invoke('full_validation_get'),
  responderValidacao: (resposta) => invoke('full_validation_answer', { answer: resposta }),
  definirRegiao: (faixas) => invoke('set_tomato_region', { strips: faixas }),
  tamanhoDeDebug: (lado) => invoke('tomato_debug_size', { size: lado }),
  sempreNaFrente: () => invoke('tomato_on_top_available'),
});

/**
 * M57, plano B2 (src-tauri/src/compat_x11.rs): `situacao()` é o
 * `x11_compat_get`, `{ disponivel, ativa, xwayland }`; `reiniciar()` é o
 * `app_restart`, para a `linuxX11` gravada valer.
 */
export const compatX11 = Object.freeze({
  situacao: () => invoke('x11_compat_get'),
  reiniciar: () => invoke('app_restart'),
});

/**
 * v0.3 (src-tauri/src/update.rs): a atualização por dentro do app, no desktop.
 * `info()` resolve com `{ available, channel, pending }`; `procurar()`, com
 * `{ current, version }` (`version` nulo: já é a última); `instalar()` baixa,
 * instala e o Rust reinicia. Os erros são `{ code, message }`.
 */
export const atualizacao = Object.freeze({
  info: () => invoke('update_info'),
  procurar: () => invoke('update_check'),
  instalar: () => invoke('update_install'),
});

/**
 * A07a/A07b (PLANO-ANDROID 4.2): o plugin `tomatito-android`, que só existe
 * no Android (a Kotlin responde direto, sem comando no Rust do app).
 * `permissoes()` resolve com `{ notificacoes: 'granted'|'denied'|'prompt',
 * jaPediu, alarmeExato, sdk }` (`jaPediu`: o pedido do sistema já saiu uma
 * vez, A13); `cores(fundo, claro)` pinta atrás das barras do
 * sistema (`fundo` em `#rrggbb`) e escolhe ícones escuros (`claro`) ou claros;
 * `pedirNotificacoes()` mostra o pedido do sistema, se ele ainda aparece, e
 * resolve com o mesmo objeto do `permissoes()`; `abrirConfigAvisos()` abre a
 * tela de avisos do app no sistema (resolve com `{ tela }`); `tocar(som)`
 * toca `'focusEnd'` ou `'breakEnd'` (os WAV entram no A08); `abrirUrl(url)`
 * abre um link `http(s)` no navegador, fora do app.
 */
export const android = Object.freeze({
  permissoes: () => invoke('plugin:tomatito-android|permissoes'),
  cores: (fundo, claro) => invoke('plugin:tomatito-android|cores', { fundo, claro }),
  pedirNotificacoes: () => invoke('plugin:tomatito-android|pedir_notificacoes'),
  abrirConfigAvisos: () => invoke('plugin:tomatito-android|abrir_config_avisos'),
  tocar: (som) => invoke('plugin:tomatito-android|tocar', { som }),
  abrirUrl: (url) => invoke('plugin:tomatito-android|abrir_url', { url }),
  // v0.5: a ação pedida num botão da notificação (`{ acao, voltar }`), e a
  // volta ao segundo plano depois de executá-la.
  acaoPendente: () => invoke('plugin:tomatito-android|acao_pendente'),
  paraOFundo: () => invoke('plugin:tomatito-android|para_o_fundo'),
});

/** Ouve um evento do Rust; `cb` recebe só o conteúdo. Devolve o `unlisten`. */
export const ouvir = (evento, cb) => listen(evento, (e) => cb(e.payload));
