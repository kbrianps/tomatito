// Copiar texto para a área de transferência (M35: as voltas do cronômetro).
//
// Primeiro o `navigator.clipboard.writeText`, que existe no WebView2 (a página
// vem de http://tauri.localhost, contexto seguro) e no WebKitGTK (tauri://,
// que o wry registra como seguro, e o http://localhost do `tauri dev`). Os
// dois pedem um gesto do usuário, então quem chama copia dentro do próprio
// clique, sem esperar nenhum `invoke` antes. Se a API não existir ou recusar,
// cai no `document.execCommand('copy')` com um <textarea> fora da tela, que o
// WebKitGTK aceita durante um gesto. Sem plugin do Tauri: nada no Rust precisa
// ver o texto (docs/decisoes.md, M35).

/**
 * Copia `texto`. Resolve `true` se alguma das duas vias aceitou e `false` se
 * nenhuma aceitou; nunca rejeita. `nav` e `doc` são o navigator e o document
 * (os testes passam outros).
 */
export async function copiarTexto(texto, { nav = globalThis.navigator, doc = globalThis.document } = {}) {
  try {
    if (nav?.clipboard?.writeText) {
      await nav.clipboard.writeText(texto);
      return true;
    }
  } catch {
    // segue para a via antiga
  }
  return viaExecCommand(texto, doc);
}

function viaExecCommand(texto, doc) {
  if (!doc?.body || typeof doc.execCommand !== 'function') return false;
  const area = doc.createElement('textarea');
  area.value = texto;
  area.setAttribute('readonly', '');
  area.setAttribute('aria-hidden', 'true');
  area.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0;';
  const antes = doc.activeElement;
  doc.body.append(area);
  try {
    area.select();
    return Boolean(doc.execCommand('copy'));
  } catch {
    return false;
  } finally {
    area.remove();
    antes?.focus?.({ preventScroll: true });
  }
}
