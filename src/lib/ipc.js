// Ponte com o Rust (PLANO.md, 3.5): os comandos (invoke) e os eventos
// (listen) que as telas usam, com os nomes do Rust num lugar só. O formato dos
// retratos está em src-tauri/src/events.rs.
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export const EVENTOS = Object.freeze({
  estado: 'tt://state',
  tick: 'tt://tick',
  fase: 'tt://phase',
  // M23: as configurações inteiras, depois de cada `settings_set`.
  configuracoes: 'tt://settings',
});

/** `get_state`: `{ focus, speed, setup, settings }`. */
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

/** Ouve um evento do Rust; `cb` recebe só o conteúdo. Devolve o `unlisten`. */
export const ouvir = (evento, cb) => listen(evento, (e) => cb(e.payload));
