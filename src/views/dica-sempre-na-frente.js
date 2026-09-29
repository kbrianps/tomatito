// A dica do "Sempre na frente" no Wayland (PLANO.md, 5.7 e M56): no GNOME
// Wayland, o código não consegue manter o tomate por cima (mutter#973), só o
// Alt+Espaço. A dica aparece uma vez, discreta, nas Configurações (logo
// abaixo do título Aparência), quando elas estão na tela com o Full ativo: é o caminho do
// botão Configurações do tomate. Depois de vista, não volta (a marca fica no
// localStorage da página; sem ele, ela pode voltar, e tudo bem).
//
// Módulo à parte, ligado por uma linha no settings.js: as Configurações
// crescem na frente A (M38 e M39), e a junção só precisa manter essa linha
// (docs/decisoes.md, M56). Na junção com o M39, a tela deixou de perguntar
// pelo sistema (3.8): quem diz se há "Sempre na frente" por código é o Rust
// (`porCodigo`, o `tomato_on_top_available`, verdadeiro no Windows e no X11).
import t from '../lib/i18n/pt-BR.js';

export const CHAVE = 'tt.dica.sempreNaFrente';

/**
 * Se a dica aparece agora: com o Full ativo, com a página na tela, ainda não
 * vista, e sem "Sempre na frente" por código (no Windows e no X11 ele existe,
 * no menu do tomate; sobra o Wayland). `porCodigo` é o `tomato_on_top_available` (null enquanto
 * não chegou).
 */
export function deveMostrar({ pref, visivel, vista, porCodigo }) {
  return pref === 'full' && visivel && !vista && porCodigo === false;
}

const ler = (win) => {
  try {
    return win.localStorage.getItem(CHAVE) === '1';
  } catch {
    return false;
  }
};
const marcar = (win) => {
  try {
    win.localStorage.setItem(CHAVE, '1');
  } catch {
    // Sem armazenamento, a dica pode aparecer de novo.
  }
};

/**
 * Liga a dica na seção `secao`. `porCodigo()` resolve com o
 * `tomato_on_top_available`; `evento` é o que o <html> dispara a cada troca
 * de tema (lib/theme.js). Devolve a limpeza.
 */
export function ligarDicaSempreNaFrente(secao, { doc = globalThis.document, porCodigo, evento }) {
  const h = doc.documentElement;
  const win = doc.defaultView;
  let sabido = null;
  let dica = null;
  let desligada = false;

  const conferir = () => {
    if (desligada) return;
    // Aberta, fica até sair do Full (ou da tela).
    if (dica) {
      if (h.dataset.themePref !== 'full') {
        dica.remove();
        dica = null;
      }
      return;
    }
    const agora = {
      pref: h.dataset.themePref,
      visivel: doc.visibilityState === 'visible',
      vista: ler(win),
      porCodigo: sabido,
    };
    if (agora.pref !== 'full') return;
    if (sabido === null) {
      Promise.resolve()
        .then(porCodigo)
        .then((v) => {
          sabido = v === true;
          conferir();
        })
        .catch((erro) => console.warn('[dica]', erro));
      return;
    }
    if (!deveMostrar(agora)) return;
    dica = doc.createElement('p');
    dica.className = 'tt-config-dica tt-t-caption';
    // Sem data-dica: esse atributo é o das dicas dos botões (components/dica.js).
    dica.dataset.aviso = 'sempre-na-frente';
    dica.textContent = t.tomate.dicaSempreNaFrente;
    // Logo abaixo do título da seção, antes do cartão: à vista sem rolar.
    const titulo = secao.querySelector?.('h2');
    if (titulo) titulo.after(dica);
    else secao.append(dica);
    marcar(win);
  };

  // A troca de tema só tira a dica. Mostrar, só ao abrir a tela ou ao ela
  // voltar à tela: escolher o Full aqui mesmo esconde esta janela logo
  // depois, e a dica seria marcada como vista sem ter sido lida.
  const aoTrocarTema = () => {
    if (dica && h.dataset.themePref !== 'full') conferir();
  };
  doc.addEventListener('visibilitychange', conferir);
  h.addEventListener(evento, aoTrocarTema);
  conferir();
  return () => {
    desligada = true;
    doc.removeEventListener('visibilitychange', conferir);
    h.removeEventListener(evento, aoTrocarTema);
    dica?.remove();
  };
}
