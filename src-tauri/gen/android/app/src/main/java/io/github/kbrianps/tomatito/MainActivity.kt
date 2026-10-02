package io.github.kbrianps.tomatito

import android.os.Bundle
import android.util.Log
import android.view.ViewGroup
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

/**
 * A Activity do app (PLANO-ANDROID 5.7; A06).
 *
 * - Borda a borda, mas com as barras do sistema, o recorte da câmera e o
 *   teclado aplicados como *padding* no conteúdo: a WebView nunca fica sob
 *   eles, e a página não depende de `env(safe-area-inset-*)` (que vinha
 *   errado em WebViews antigas). O teclado encolhe a área da WebView, e o
 *   campo focado fica à vista.
 * - Voltar: fora da tela Foco, volta para ela; na Foco (a raiz), manda o app
 *   para segundo plano (`moveTaskToBack`) em vez de destruir a Activity, o
 *   que recriaria a WebView e o `setup` do Rust.
 */
class MainActivity : TauriActivity() {
  // O voltar é nosso (o do WryActivity iria pelo histórico da WebView).
  override val handleBackNavigation: Boolean = false

  private var webView: WebView? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    val conteudo = findViewById<ViewGroup>(android.R.id.content)
    ViewCompat.setOnApplyWindowInsetsListener(conteudo) { v, insets ->
      val tipos = WindowInsetsCompat.Type.systemBars() or
        WindowInsetsCompat.Type.displayCutout() or
        WindowInsetsCompat.Type.ime()
      val i = insets.getInsets(tipos)
      v.setPadding(i.left, i.top, i.right, i.bottom)
      WindowInsetsCompat.CONSUMED
    }
  }

  // O dispatcher chama o callback registrado por último. A biblioteca do Tauri
  // registra o dela (que vai pelo histórico da WebView) depois do onCreate;
  // por isso o nosso entra quando a WebView existe e de novo a cada retomada.
  private val callbackDoVoltar = object : OnBackPressedCallback(true) {
    override fun handleOnBackPressed() = voltar()
  }

  private fun registrarVoltar() {
    callbackDoVoltar.remove()
    onBackPressedDispatcher.addCallback(this, callbackDoVoltar)
  }

  override fun onWebViewCreate(webView: WebView) {
    this.webView = webView
    registrarVoltar()
  }

  override fun onResume() {
    super.onResume()
    if (webView != null) registrarVoltar()
  }

  private fun voltar() {
    val w = webView
    if (w == null) {
      Log.i(TAG, "voltar: sem WebView, para segundo plano")
      moveTaskToBack(true)
      return
    }
    // A decisão é da página, num script só: fora da Foco, vai para ela.
    w.evaluateJavascript(VOLTAR) { r ->
      Log.i(TAG, "voltar: $r")
      if (r == null || r.contains("raiz")) moveTaskToBack(true)
    }
  }

  private companion object {
    const val TAG = "TomatitoVoltar"
    const val VOLTAR =
      "(function(){var h=location.hash;if(h&&h!=='#/foco'&&h!=='#/'){location.replace('#/foco');return 'foi';}return 'raiz';})()"
  }
}
