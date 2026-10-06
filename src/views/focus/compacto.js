// O botão "Modo compacto" do cartão de sessão (v0.4), só no desktop. Abre a
// janelinha do Full como um cartão nas cores do tema em uso, com o anel
// redondo, os mesmos botões e o "Sempre na frente" (o `switch_window_mode`
// com `compact`; src-tauri/src/window/tomato.rs). "Voltar ao modo normal",
// na janelinha, traz esta janela de volta.
//
// Quem decide se o botão existe é a casca (`casca.full`, fora da web).
// Módulo à parte, ligado por uma linha no focus/index.js.
import t from '../../lib/i18n/pt-BR.js';

const semIcone = () => '';
const plataformaPadrao = () => import('#plataforma');
const ipcPadrao = () => import('../../lib/ipc.js');

/** HTML do botão: só o ícone, com o nome e a dica do catálogo. */
export function marcacao(icone = semIcone) {
  return `<button type="button" class="tt-sutil tt-sessao-compacto" aria-label="${t.foco.compacto}" data-dica data-compacto>${icone('picture_in_picture', 16)}</button>`;
}

/** Põe o botão no cartão de sessão; devolve a limpeza. */
export function ligar(cartao, { icone = semIcone, plataforma = plataformaPadrao, ipc = ipcPadrao } = {}) {
  let desligado = false;
  let botao = null;
  const montar = async () => {
    const plat = await plataforma();
    if (desligado || !plat?.casca?.full || plat.casca.web) return;
    cartao.insertAdjacentHTML('beforeend', marcacao(icone));
    botao = cartao.lastElementChild;
    botao.addEventListener('click', async () => {
      if (botao.disabled) return;
      botao.disabled = true;
      try {
        await (await ipc()).full.trocarModo(true, { compacto: true });
      } catch (erro) {
        console.error('[modo compacto]', erro);
      } finally {
        if (botao) botao.disabled = false;
      }
    });
  };
  montar().catch((erro) => console.warn('[modo compacto]', erro));
  return () => {
    desligado = true;
    botao?.remove();
    botao = null;
  };
}
