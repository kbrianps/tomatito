// Marca do app (M44): a silhueta do ícone (src-tauri/icons/icon.svg), um
// disco com o arco de progresso vazado, em uma cor só (currentColor ou a do
// CSS), para acompanhar o tema. Usada na barra de título (16 px) e no "Sobre"
// das Configurações (20 px). O ícone colorido fica para o sistema (dock,
// Alt+Tab, bandeja e instaladores).
//
// O arco é vazado por uma máscara; cada chamada ganha um id próprio, para
// duas marcas na mesma página não dividirem a máscara.

let proxima = 0;

/**
 * SVG da marca, com `classe` no <svg>. O desenho é o da variante da bandeja
 * (icons/tray.svg) numa grade de 16: disco de raio 7,75 e arco de raio 4,5
 * com traço de 2,4, aberto no quadrante de cima à esquerda.
 */
export function marcaDoApp(classe = '') {
  const id = `tt-marca-${++proxima}`;
  return (
    `<svg class="${classe}" viewBox="0 0 16 16" aria-hidden="true" focusable="false">` +
    `<mask id="${id}"><circle cx="8" cy="8" r="8" fill="#fff"/>` +
    '<path d="M8 3.5A4.5 4.5 0 1 1 3.5 8" fill="none" stroke="#000" stroke-width="2.4" stroke-linecap="round"/></mask>' +
    `<circle cx="8" cy="8" r="7.75" mask="url(#${id})"/></svg>`
  );
}
