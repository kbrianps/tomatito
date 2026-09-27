// Ícones do app: SVG em linha, pintados com currentColor (fill no shell.css e
// no controls.css), para acompanhar a cor do texto em qualquer tema.
//
// M09: só os quatro do painel, lidos direto do @fluentui/svg-icons (MIT) pelo
// Vite (?raw); o build embute o texto no JS, e nada é pedido em tempo de
// execução. No M13, o scripts/copy-icons.mjs passa a copiar para
// src/assets/icons/ só os ícones usados, e este arquivo muda de fonte.
import target from '@fluentui/svg-icons/icons/target_16_regular.svg?raw';
import hourglassHalf from '@fluentui/svg-icons/icons/hourglass_half_16_regular.svg?raw';
import timer from '@fluentui/svg-icons/icons/timer_16_regular.svg?raw';
import settings from '@fluentui/svg-icons/icons/settings_16_regular.svg?raw';

const SVG = Object.freeze({
  target,
  hourglass_half: hourglassHalf,
  timer,
  settings,
});

/**
 * O SVG do ícone, decorativo (aria-hidden) e fora do foco, com a classe
 * tt-icone. O nome é o do Fluent System Icons, sem tamanho nem estilo.
 */
export function icone(nome) {
  const svg = SVG[nome];
  if (!svg) throw new Error(`ícone desconhecido: ${nome}`);
  return svg.trim().replace('<svg ', '<svg class="tt-icone" aria-hidden="true" focusable="false" ');
}
