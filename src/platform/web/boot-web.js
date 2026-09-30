// Boot da versão web (PLANO-WEB, 3.9; PLANO-WEB-V1, 5.1; W07a). Script
// clássico, síncrono, no começo do <head> (o plugin-web.mjs o põe lá), antes
// do script de boot do index.html. Faz na web o papel do initialization_script
// do Rust, e mais o que só a web tem:
//
// 1. As globais que o boot do index.html lê (__TT_PREF__ e __TT_LAST__), a
//    partir das configurações salvas em `tomatito:config`. Assim o boot já
//    grava o data-theme certo antes da primeira folha de estilo (sem clarão).
// 2. data-casca="web" no <html> (o shell.css esconde a barra de título etc.).
// 3. data-forma="celular" no <html> enquanto valer a consulta da 5.1 (celular
//    em pé ou deitado), ligado e desligado a cada mudança dela. O
//    `casca.formaCelular` da web é `true`; este arquivo só existe na web, e é
//    o único lugar que atribui o data-forma.
// 4. <meta name="theme-color"> com o fundo do tema resolvido (a barra de
//    status do Android e a barra do navegador), acompanhando cada troca do
//    data-theme.
//
// Sem módulo nem import: roda antes de tudo. Os erros de leitura caem nos
// padrões (o tema Lite), como o boot do desktop sem as globais.
(function () {
  var h = document.documentElement;
  var w = window;

  try {
    var s = JSON.parse(w.localStorage.getItem('tomatito:config') || 'null');
    if (s && typeof s.theme === 'string') {
      w.__TT_PREF__ = s.theme;
      w.__TT_LAST__ = s.lastNormalTheme;
    }
  } catch (e) {
    // Sem localStorage (bloqueado) ou com lixo nele: os padrões.
  }

  h.dataset.casca = 'web';

  // 5.1: celular em pé (largura < 600) ou deitado (toque e altura < 500).
  var forma = w.matchMedia('(width < 600px) or ((pointer: coarse) and (height < 500px))');
  function aplicarForma() {
    if (forma.matches) h.dataset.forma = 'celular';
    else delete h.dataset.forma;
  }
  aplicarForma();
  forma.addEventListener('change', aplicarForma);

  // O --tt-bg-app de cada tema (src/styles/tokens.css; o boot-web.test.js
  // confere as duas listas).
  var COR = { lite: '#A5342B', full: '#A5342B', suave: '#F6ECE9', light: '#F3F3F3', dark: '#202020' };
  var meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  function aplicarCor() {
    var cor = COR[h.dataset.theme];
    if (cor && meta.content !== cor) meta.content = cor;
  }
  // O data-theme chega logo depois, pelo boot do index.html; e muda a cada
  // troca de tema (lib/theme.js, trocarAtributos).
  new MutationObserver(aplicarCor).observe(h, { attributes: true, attributeFilter: ['data-theme'] });
  aplicarCor();
})();
