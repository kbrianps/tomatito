package io.github.kbrianps.tomatito.android

import android.Manifest
import android.app.Activity
import android.app.AlarmManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.view.View
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@InvokeArg
class CoresArgs {
    /** O `--tt-bg-app` do tema, `#rrggbb`. */
    var fundo: String? = null
    /** Tema claro: ícones escuros nas barras. */
    var claro: Boolean = false
}

/**
 * O plugin `tomatito-android` (PLANO-ANDROID 4.2). A01–A07a: `permissoes` e
 * `cores`; os outros comandos entram nos marcos de cada um.
 */
@TauriPlugin
class TomatitoPlugin(private val activity: Activity) : Plugin(activity) {

    /** `{ notificacoes: granted|denied|prompt, alarmeExato, sdk }`. */
    @Command
    fun permissoes(invoke: Invoke) {
        val sdk = Build.VERSION.SDK_INT
        val concedida = sdk < 33 ||
            ContextCompat.checkSelfPermission(activity, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED
        val podeExplicar = sdk >= 33 &&
            ActivityCompat.shouldShowRequestPermissionRationale(activity, Manifest.permission.POST_NOTIFICATIONS)
        val notificacoes = Notificacoes.estado(
            sdk = sdk,
            concedida = concedida,
            habilitadas = NotificationManagerCompat.from(activity).areNotificationsEnabled(),
            jaPediu = preferencias().getBoolean(JA_PEDIU_NOTIFICACOES, false),
            podeExplicar = podeExplicar,
        )
        val exato = alarmeExato(sdk) {
            (activity.getSystemService(Context.ALARM_SERVICE) as AlarmManager).canScheduleExactAlarms()
        }
        invoke.resolve(
            JSObject().apply {
                put("notificacoes", notificacoes)
                put("alarmeExato", exato)
                put("sdk", sdk)
            },
        )
    }

    /**
     * A cor atrás das barras do sistema e a cor dos ícones delas (5.7). Com o
     * `enableEdgeToEdge` da MainActivity, as barras são transparentes do
     * Android 15 em diante (e o `statusBarColor` não vale mais): a cor que
     * aparece é a do que está atrás delas. Por isso o fundo vai para a
     * janela e para o conteúdo (o pai da WebView, que ganha o padding dos
     * insets no A06), e só antes do 15 também para as próprias barras. O
     * contraste forçado (o véu da barra de navegação de 3 botões) sai, senão
     * a cor ficaria esmaecida.
     */
    @Command
    fun cores(invoke: Invoke) {
        val args = invoke.parseArgs(CoresArgs::class.java)
        val cor = corOpaca(args.fundo)
        if (cor == null) {
            invoke.reject("cor inválida: ${args.fundo}")
            return
        }
        activity.runOnUiThread {
            val janela = activity.window
            janela.decorView.setBackgroundColor(cor)
            activity.findViewById<View>(android.R.id.content)?.setBackgroundColor(cor)
            if (Build.VERSION.SDK_INT < 35) pintarBarras(cor)
            if (Build.VERSION.SDK_INT >= 29) semVeu()
            WindowCompat.getInsetsController(janela, janela.decorView).apply {
                isAppearanceLightStatusBars = args.claro
                isAppearanceLightNavigationBars = args.claro
            }
            invoke.resolve()
        }
    }

    // Obsoletas do Android 15 em diante (lá as barras são sempre transparentes),
    // mas são elas que pintam as barras do 7 ao 14.
    @Suppress("DEPRECATION")
    private fun pintarBarras(cor: Int) {
        activity.window.statusBarColor = cor
        activity.window.navigationBarColor = cor
    }

    // O véu da barra de navegação de 3 botões (e o da barra de status), que o
    // sistema põe por cima de uma barra transparente; do 29 em diante.
    @Suppress("DEPRECATION")
    private fun semVeu() {
        activity.window.isStatusBarContrastEnforced = false
        activity.window.isNavigationBarContrastEnforced = false
    }

    private fun preferencias() = activity.getSharedPreferences(PREFERENCIAS, Context.MODE_PRIVATE)

    companion object {
        const val PREFERENCIAS = "tomatito-android"
        /** Gravada pelo `pedir_notificacoes` (A07b): distingue "nunca pedido" de "recusado de vez". */
        const val JA_PEDIU_NOTIFICACOES = "notificacoes_pedidas"
    }
}
