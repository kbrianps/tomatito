// Spike A (M04, branch spike/full): código descartável.
// Só confere que a janela `tomato` recebe os cliques: cada botão escreve uma
// linha no console. O arraste vem do `data-tauri-drag-region="deep"` no
// .stage, tratado pelo drag.js que o próprio Tauri injeta.

const stage = document.getElementById('stage');
const ring = document.getElementById('ring');
const play = document.getElementById('play');

// Anel: pathLength=100, com 5,5 unidades escondidas sob o cálice em cada ponta.
const GAP = 5.5;
const SPAN = 100 - 2 * GAP;
function setProgress(f) {
  const v = Math.max(0, Math.min(1, f)) * SPAN;
  ring.style.strokeDasharray = `${v.toFixed(2)} 200`;
}
setProgress(1 - (18 * 60 + 42) / (25 * 60));

for (const btn of stage.querySelectorAll('button[data-acao]')) {
  btn.addEventListener('click', () => {
    console.log(`[tomato] botão: ${btn.dataset.acao}`);
  });
}

// Sem estado de verdade no spike: o botão principal só alterna o desenho.
play.addEventListener('click', () => {
  const pausado = stage.dataset.state !== 'paused';
  stage.dataset.state = pausado ? 'paused' : 'focus';
  play.setAttribute('aria-label', pausado ? 'Retomar' : 'Pausar');
});

// O menu de contexto do WebView seria uma janela própria, fora do desenho
// (PLANO.md, 5.3). O menu nativo entra no M52.
document.addEventListener('contextmenu', (e) => e.preventDefault());

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') console.log('[tomato] tecla: Esc');
});

console.log('[tomato] pronto');
