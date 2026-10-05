// O que o palco do Tomatito Full precisa do build (v0.3; views/palco-tomate.js):
// o desenho do tomate, tirado do tomato.html do desktop (uma fonte só), e a
// folha tomato.css, aplicada como folha construída (a CSP não deixa <style>
// criado em tempo de execução ser a regra; `adoptedStyleSheets` não passa por
// ela). Só a web importa este arquivo, e só quando monta o palco.
import fonteDoTomate from '../../../tomato.html?raw';
import folhaDoTomate from '../../styles/tomato.css?inline';
import folhaDoPalco from '../../styles/palco.css?inline';

/** O `.stage` do tomato.html, sem o arraste de janela do Tauri. */
export function desenhoDoTomate(fonte = fonteDoTomate) {
  const inicio = fonte.indexOf('<div class="stage"');
  const fim = fonte.indexOf('<!-- Anúncio das fases');
  if (inicio < 0 || fim < inicio) throw new Error('palco: o .stage não está no tomato.html');
  return fonte
    .slice(inicio, fim)
    .trim()
    .replace(' data-tauri-drag-region="deep"', '')
    .replace(/<!--[\s\S]*?-->/g, '');
}

/**
 * A folha do tomate sem a regra da janela (`html, body { overflow: hidden }`,
 * que na página do app esconderia a rolagem) e sem o que é só da janela do
 * desktop.
 */
export function folhaParaAPagina(css = folhaDoTomate) {
  return css.replace(/html,\s*body\s*\{[^}]*\}/, '');
}

/** Aplica as folhas num documento (a página ou o mini tomate). */
export function estilos(doc, janela) {
  const folha = new janela.CSSStyleSheet();
  folha.replaceSync(`${folhaParaAPagina()}\n${folhaDoPalco}`);
  doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, folha];
}
