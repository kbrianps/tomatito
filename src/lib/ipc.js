// Ponte com o Rust (PLANO.md, 3.5): os comandos (invoke) e os eventos
// (listen) que as telas usam, com os nomes do Rust num lugar só. O formato dos
// retratos está em src-tauri/src/events.rs.
import { invoke } from '@tauri-apps/api/core';
import { emit, listen } from '@tauri-apps/api/event';

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
});

/** `get_state`: `{ focus, speed, setup, timers, stopwatch, settings }`. */
export const obterEstado = () => invoke('get_state');

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
 */
export const full = Object.freeze({
  EVENTO_PRONTO: 'tt://tomato-ready',
  trocarModo: (entrar) => invoke('switch_window_mode', { full: entrar }),
  mostrarMain: (rota = null) => invoke('show_main', { route: rota }),
  avisarPronto: (dados) => emit('tt://tomato-ready', dados),
});

/** Ouve um evento do Rust; `cb` recebe só o conteúdo. Devolve o `unlisten`. */
export const ouvir = (evento, cb) => listen(evento, (e) => cb(e.payload));
