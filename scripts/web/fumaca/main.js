// Fumaça do wasm (W01b): carrega o pacote do `npm run wasm` como a web vai
// carregar (PLANO-WEB, 1.1, "Vite": `await init()` sem plugin) e expõe o
// motor para o caso fumaça. Nada daqui entra no app.
import init, { Motor, fusoDoSistema } from '../../../src/platform/web/pkg/tomatito_wasm.js';

const estado = document.getElementById('estado');

window.fumaca = {
  pronto: init().then(
    () => {
      estado.textContent = 'pronto';
      return true;
    },
    (erro) => {
      estado.textContent = `erro: ${erro.message}`;
      throw erro;
    },
  ),
  Motor,
  fusoDoSistema,
};
