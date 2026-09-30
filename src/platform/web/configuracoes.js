// As configurações da versão web (PLANO-WEB, 3.2 e 3.5; W07a). O dono é o
// motor, como no desktop: a leitura (`normalizarConfig`, o `load_from` do
// settings.rs) e o patch (`aplicarPatch`, o `aplicar_patch` do motor) vêm do
// wasm, com as mesmas regras e os mesmos `{ code, message }`. Aqui fica só o
// arquivo: o texto JSON em `tomatito:config` no localStorage, no lugar do
// settings.json.
//
// As funções usam o wasm já carregado: quem chama espera o `motor.iniciar()`.
import { aplicarPatch, normalizarConfig } from './pkg/tomatito_wasm.js';

let atuais = null;

function lerTexto() {
  try {
    return localStorage.getItem('tomatito:config');
  } catch {
    // Sem localStorage (bloqueado pelo navegador): os padrões.
    return null;
  }
}

/** As configurações atuais, normalizadas (uma cópia). */
export function ler() {
  atuais ??= normalizarConfig(lerTexto());
  return structuredClone(atuais);
}

/**
 * O `settings_set` sem os efeitos: aplica o patch, grava e devolve as
 * configurações novas. Um patch recusado lança o erro do motor; uma
 * gravação que falha lança `writeFailed`, e nada muda, nem na memória.
 */
export function gravar(patch) {
  const novas = aplicarPatch(JSON.stringify(ler()), JSON.stringify(patch ?? null));
  try {
    localStorage.setItem('tomatito:config', JSON.stringify(novas));
  } catch (erro) {
    throw { code: 'writeFailed', message: `tomatito:config: ${erro?.message ?? erro}` };
  }
  atuais = novas;
  return structuredClone(novas);
}
