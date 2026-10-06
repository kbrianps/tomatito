package io.github.kbrianps.tomatito.android

import android.Manifest
import android.app.Activity
import android.app.AlarmManager
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.view.View
import android.webkit.WebView
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.Permission
import app.tauri.annotation.PermissionCallback
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

@InvokeArg
class TocarArgs {
    /** `focusEnd` ou `breakEnd`, os nomes do `sound_test`. */
    var som: String? = null
}

@InvokeArg
class AbrirUrlArgs {
    var url: String? = null
}

/**
 * O plugin `tomatito-android` (PLANO-ANDROID 4.2). A07a: `permissoes` e
 * `cores`; A07b: `pedir_notificacoes`, `abrir_config_avisos`, `tocar` e
 * `abrir_url`; A08: os canais de notificação, criados no `load`; A10a:
 * `agendar` (só do Rust), que desde o A11 também leva a contínua; os outros
 * comandos entram nos marcos de cada um. O JS chama
 * pelo nome em snake_case, e o Tauri entrega ao método em lowerCamelCase.
 */
@TauriPlugin(
    permissions = [Permission(strings = [Manifest.permission.POST_NOTIFICATIONS], alias = TomatitoPlugin.AVISOS)],
)
class TomatitoPlugin(private val activity: Activity) : Plugin(activity) {

    /** Os canais existem desde a primeira abertura (5.5, A08), antes de qualquer aviso. */
    override fun load(webView: WebView) {
        criarCanais(activity.applicationContext)
        // v0.5: aberto por um botão da contínua, com o app fechado.
        guardarAcao(activity.intent, emSegundoPlano = true)
    }

    // v0.5: o controle pela barra de notificações. A ação pedida num botão da
    // contínua fica guardada até a página buscá-la (`acao_pendente`), e
    // `voltar` diz se o app estava em segundo plano (parado) quando ela
    // chegou: nesse caso, depois de executar, a página o devolve para lá
    // (`para_o_fundo`).
    private var acaoGuardada: String? = null
    private var voltarDepois = false
    private var parado = true

    override fun onResume() {
        parado = false
    }

    override fun onStop() {
        parado = true
    }

    override fun onNewIntent(intent: Intent) {
        guardarAcao(intent, emSegundoPlano = parado)
    }

    private fun guardarAcao(intent: Intent?, emSegundoPlano: Boolean) {
        val acao = intent?.getStringExtra(EXTRA_ACAO) ?: return
        intent.removeExtra(EXTRA_ACAO)
        // Um pedido já atendido (a Activity recriada com o mesmo Intent) não repete.
        val id = intent.getLongExtra(EXTRA_ACAO_ID, 0L)
        if (id != 0L) {
            if (preferencias().getLong(CHAVE_ULTIMA_ACAO, 0L) == id) return
            preferencias().edit().putLong(CHAVE_ULTIMA_ACAO, id).apply()
        }
        acaoGuardada = acao
        voltarDepois = emSegundoPlano
    }

    /** `{ acao, voltar }` da ação guardada (e a esquece), ou `{ acao: null }`. */
    @Command
    fun acaoPendente(invoke: Invoke) {
        val r = JSObject()
        r.put("acao", acaoGuardada ?: org.json.JSONObject.NULL)
        r.put("voltar", voltarDepois)
        acaoGuardada = null
        voltarDepois = false
        invoke.resolve(r)
    }

    /** Devolve o app ao segundo plano, depois de uma ação pedida pela barra. */
    @Command
    fun paraOFundo(invoke: Invoke) {
        activity.moveTaskToBack(true)
        invoke.resolve()
    }

    /**
     * A agenda dos avisos de fim (5.2, item 3; A10a) e a notificação contínua
     * (5.3; A11), mandadas pelo Rust a cada mudança:
     * `{ agenda: [Alarme...], continua: Continua | null }` ([Agenda.pacoteDeJson]).
     * Cancela os alarmes anteriores, grava a agenda, agenda cada item e
     * mostra, troca ou tira a contínua ([AgendaDoSistema.agendar]). Só o Rust
     * chama: o comando não está no `build.rs` nem na ACL, e o JS recebe "not
     * allowed".
     */
    @Command
    fun agendar(invoke: Invoke) {
        val pacote = Agenda.pacoteDeJson(invoke.getArgs().toString())
        if (pacote == null) {
            invoke.reject("agenda ausente")
            return
        }
        val contagem = AgendaDoSistema.agendar(activity, pacote.agenda, pacote.continua)
        invoke.resolve(
            JSObject().apply {
                put("exatos", contagem.getValue(ApiDoAlarme.RELOGIO))
                put("inexatos", contagem.getValue(ApiDoAlarme.OCIOSO))
            },
        )
    }

    /** `{ notificacoes: granted|denied|prompt, jaPediu, alarmeExato, sdk }`. */
    @Command
    fun permissoes(invoke: Invoke) {
        invoke.resolve(estadoDasPermissoes())
    }

    /**
     * Mostra o pedido de `POST_NOTIFICATIONS` do sistema (Android 13+) quando
     * ele ainda aparece (`prompt`) e resolve com o estado depois da resposta,
     * o mesmo objeto do `permissoes`. Nos outros casos (já permitido,
     * recusado de vez, Android 12 ou antes) só devolve o estado. Chamado no
     * primeiro "Iniciar" ou pelo cartão Avisos, nunca ao abrir (5.4).
     */
    @Command
    fun pedirNotificacoes(invoke: Invoke) {
        val estado = estadoDasPermissoes()
        if (!mostraPedidoDeNotificacoes(Build.VERSION.SDK_INT, estado.getString("notificacoes"))) {
            invoke.resolve(estado)
            return
        }
        preferencias().edit().putBoolean(JA_PEDIU_NOTIFICACOES, true).apply()
        requestPermissionForAlias(AVISOS, invoke, "depoisDoPedido")
    }

    @PermissionCallback
    private fun depoisDoPedido(invoke: Invoke) {
        invoke.resolve(estadoDasPermissoes())
    }

    /**
     * Abre a tela de avisos do app nas configurações do sistema (ou, no
     * Android 12/12L com os avisos permitidos e sem alarme exato, a do
     * alarme exato; `telaDeAvisos`). Resolve com o nome da tela aberta.
     */
    @Command
    fun abrirConfigAvisos(invoke: Invoke) {
        val sdk = Build.VERSION.SDK_INT
        val estado = estadoDasPermissoes()
        val tela = telaDeAvisos(sdk, estado.getString("notificacoes"), estado.getBoolean("alarmeExato"))
        val pacote = activity.packageName
        val intent = when (tela) {
            TelaDeAvisos.AVISOS_DO_APP ->
                Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, pacote)
            TelaDeAvisos.ALARME_EXATO ->
                Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:$pacote"))
            TelaDeAvisos.DETALHES_DO_APP ->
                Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$pacote"))
        }
        abrir(invoke, intent, JSObject().apply { put("tela", tela.name) })
    }

    /**
     * O "Testar" das Configurações (5.5): toca o som de `res/raw` (os WAV do
     * `src-tauri/sounds/`, copiados pelo Gradle, A08) com
     * `USAGE_NOTIFICATION_EVENT`, no volume de notificação do sistema. Só é
     * chamado com a Activity visível (no Android 17, o áudio de um app sem
     * Activity visível é silenciado). O Rust chama pelo `sound_test`.
     */
    @Command
    fun tocar(invoke: Invoke) {
        val args = invoke.parseArgs(TocarArgs::class.java)
        val recurso = recursoDoSom(args.som)
        val id = when (recurso) {
            "focus_end" -> R.raw.focus_end
            "break_end" -> R.raw.break_end
            else -> {
                invoke.reject("som desconhecido: ${args.som}")
                return
            }
        }
        val atributos = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
        val player = MediaPlayer.create(activity, id, atributos, 0)
        if (player == null) {
            invoke.reject("o som raw/$recurso não abriu")
            return
        }
        player.setOnCompletionListener { it.release() }
        player.start()
        invoke.resolve()
    }

    /**
     * Abre um link `http(s)` no navegador (`Intent.ACTION_VIEW`), fora do
     * app: a WebView do app nunca navega para fora. Recusa o que não é
     * `http(s)` com host e o aparelho sem navegador.
     */
    @Command
    fun abrirUrl(invoke: Invoke) {
        val args = invoke.parseArgs(AbrirUrlArgs::class.java)
        val url = args.url
        if (url == null || !urlExterna(url)) {
            invoke.reject("url recusada: $url")
            return
        }
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).addCategory(Intent.CATEGORY_BROWSABLE)
        abrir(invoke, intent, null)
    }

    // Abre uma Activity de outro app (configurações, navegador) numa tarefa
    // nova, sem esperar resultado.
    private fun abrir(invoke: Invoke, intent: Intent, resposta: JSObject?) {
        activity.runOnUiThread {
            try {
                activity.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                if (resposta == null) invoke.resolve() else invoke.resolve(resposta)
            } catch (e: ActivityNotFoundException) {
                invoke.reject("nada abre ${intent.action}")
            }
        }
    }

    private fun estadoDasPermissoes(): JSObject {
        val sdk = Build.VERSION.SDK_INT
        val concedida = sdk < 33 ||
            ContextCompat.checkSelfPermission(activity, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED
        val podeExplicar = sdk >= 33 &&
            ActivityCompat.shouldShowRequestPermissionRationale(activity, Manifest.permission.POST_NOTIFICATIONS)
        val jaPediu = preferencias().getBoolean(JA_PEDIU_NOTIFICACOES, false)
        val notificacoes = Notificacoes.estado(
            sdk = sdk,
            concedida = concedida,
            habilitadas = NotificationManagerCompat.from(activity).areNotificationsEnabled(),
            jaPediu = jaPediu,
            podeExplicar = podeExplicar,
        )
        val exato = alarmeExato(sdk) {
            (activity.getSystemService(Context.ALARM_SERVICE) as AlarmManager).canScheduleExactAlarms()
        }
        return JSObject().apply {
            put("notificacoes", notificacoes)
            // A13: se o pedido do sistema já saiu uma vez (a tela só pede
            // sozinha no primeiro "Iniciar" e mostra a faixa depois dele).
            put("jaPediu", jaPediu)
            put("alarmeExato", exato)
            put("sdk", sdk)
        }
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
        /** v0.5: o número do último pedido de ação atendido ([EXTRA_ACAO_ID]). */
        const val CHAVE_ULTIMA_ACAO = "ultima-acao"
        const val PREFERENCIAS = "tomatito-android"
        /** Gravada pelo `pedir_notificacoes` (A07b): distingue "nunca pedido" de "recusado de vez". */
        const val JA_PEDIU_NOTIFICACOES = "notificacoes_pedidas"
        /** O apelido de `POST_NOTIFICATIONS` no `@TauriPlugin`. */
        const val AVISOS = "avisos"
    }
}
