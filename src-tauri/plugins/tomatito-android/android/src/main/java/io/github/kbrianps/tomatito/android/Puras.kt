package io.github.kbrianps.tomatito.android

// Funções puras do plugin (PLANO-ANDROID 4.2): nada de API do Android aqui
// (só o org.json, que os testes trazem de verdade), para os testes de JVM
// (src/test, A07b) rodarem sem emulador.

/** O `notificacoes` do comando `permissoes`. */
object Notificacoes {
    const val CONCEDIDA = "granted"
    const val NEGADA = "denied"
    const val PERGUNTAR = "prompt"

    /**
     * O estado da permissão de avisos.
     * - Antes do Android 13 não há permissão: vale só o interruptor do app nas
     *   configurações do sistema (`habilitadas`).
     * - Do 13 em diante, `POST_NOTIFICATIONS` concedida e o interruptor ligado
     *   é `granted`. Sem ela: `prompt` enquanto o sistema ainda mostra o pedido
     *   (nunca pedido, ou recusado uma vez, com `podeExplicar`); `denied`
     *   depois de o usuário recusar de vez.
     */
    fun estado(sdk: Int, concedida: Boolean, habilitadas: Boolean, jaPediu: Boolean, podeExplicar: Boolean): String =
        when {
            sdk < 33 -> if (habilitadas) CONCEDIDA else NEGADA
            concedida -> if (habilitadas) CONCEDIDA else NEGADA
            !jaPediu || podeExplicar -> PERGUNTAR
            else -> NEGADA
        }
}

/** O alarme exato: só do Android 12 (31) em diante depende de permissão. */
fun alarmeExato(sdk: Int, podeAgendarExato: () -> Boolean): Boolean = sdk < 31 || podeAgendarExato()

/**
 * Lê `#rgb` ou `#rrggbb` (o `--tt-bg-app` dos temas) como uma cor opaca
 * `0xFFrrggbb`. Qualquer outra coisa (`transparent`, vazio) dá `null`.
 */
fun corOpaca(texto: String?): Int? {
    val t = texto?.trim()?.removePrefix("#") ?: return null
    if (texto.trim().firstOrNull() != '#') return null
    val seis = when (t.length) {
        3 -> t.map { "$it$it" }.joinToString("")
        6 -> t
        else -> return null
    }
    if (!seis.all { it in '0'..'9' || it in 'a'..'f' || it in 'A'..'F' }) return null
    return (0xFF000000L or seis.toLong(16)).toInt()
}

/**
 * O `pedir_notificacoes` só mostra o pedido do sistema quando ele ainda
 * aparece: do Android 13 em diante e com o estado `prompt`. Nos outros casos
 * o comando só devolve o estado (com `denied`, o caminho é o
 * `abrir_config_avisos`).
 */
fun mostraPedidoDeNotificacoes(sdk: Int, estado: String): Boolean = sdk >= 33 && estado == Notificacoes.PERGUNTAR

/** A tela do sistema que o `abrir_config_avisos` abre. */
enum class TelaDeAvisos {
    /** `Settings.ACTION_APP_NOTIFICATION_SETTINGS` (Android 8 em diante). */
    AVISOS_DO_APP,

    /** `Settings.ACTION_APPLICATION_DETAILS_SETTINGS` (Android 7, sem tela de avisos por app). */
    DETALHES_DO_APP,

    /** `Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM` (só no 12/12L, onde a permissão pode faltar). */
    ALARME_EXATO,
}

/**
 * Qual tela abrir: os avisos primeiro (sem eles, nada aparece); com os avisos
 * já permitidos, no Android 12/12L (31 e 32) sem alarme exato, a do alarme
 * exato. Do 13 em diante o alarme exato vem do `USE_EXACT_ALARM`, que não se
 * desliga, então a tela é sempre a dos avisos.
 */
fun telaDeAvisos(sdk: Int, notificacoes: String, alarmeExato: Boolean): TelaDeAvisos =
    when {
        sdk in 31..32 && !alarmeExato && notificacoes == Notificacoes.CONCEDIDA -> TelaDeAvisos.ALARME_EXATO
        sdk >= 26 -> TelaDeAvisos.AVISOS_DO_APP
        else -> TelaDeAvisos.DETALHES_DO_APP
    }

/** A API do `AlarmManager` para cada item da agenda (5.2, item 3). */
enum class ApiDoAlarme {
    /** `setAlarmClock`: sem cota e tira o aparelho do Doze pouco antes. */
    RELOGIO,

    /** `setAndAllowWhileIdle(RTC_WAKEUP, ...)`: pode atrasar alguns minutos. */
    OCIOSO,
}

fun apiDoAlarme(sdk: Int, podeAgendarExato: () -> Boolean): ApiDoAlarme =
    if (alarmeExato(sdk, podeAgendarExato)) ApiDoAlarme.RELOGIO else ApiDoAlarme.OCIOSO

/**
 * O recurso de `res/raw` de cada som do `tocar`, pelos nomes do JS (os do
 * `sound_test`: `focusEnd`, `breakEnd`). Recurso Android não aceita `-`, por
 * isso `focus-end.wav` vira `focus_end` (5.5; a cópia é do A08).
 */
fun recursoDoSom(som: String?): String? =
    when (som) {
        "focusEnd" -> "focus_end"
        "breakEnd" -> "break_end"
        else -> null
    }

/**
 * O `abrir_url` só entrega ao navegador endereços `http`/`https` com host
 * (os links do Sobre e da política). O resto (`javascript:`, `file:`,
 * `intent:`, caminhos relativos) é recusado.
 */
fun urlExterna(url: String?): Boolean {
    if (url.isNullOrBlank() || url.any { it.isWhitespace() }) return false
    val uri = try {
        java.net.URI(url)
    } catch (e: java.net.URISyntaxException) {
        return false
    }
    val esquema = uri.scheme?.lowercase() ?: return false
    return (esquema == "http" || esquema == "https") && !uri.host.isNullOrEmpty()
}

/** O que a notificação contínua mostra (5.3). */
data class Continua(
    /** `foco`, `intervalo` ou `temporizador`. */
    val tipo: String,
    /** O nome do temporizador (vazio nos outros tipos). */
    val nome: String = "",
    /** O `ends_at_ms` da fase (relógio de parede); vale quando não está pausada. */
    val fimMs: Long = 0,
    val pausado: Boolean = false,
    /** O que falta, com a fase pausada. */
    val restanteMs: Long = 0,
)

/** "Foco", "Intervalo", "Temporizador: Chá" (ou só "Temporizador", sem nome). */
fun tituloDaContinua(c: Continua): String =
    when (c.tipo) {
        "intervalo" -> "Intervalo"
        "temporizador" -> if (c.nome.isBlank()) "Temporizador" else "Temporizador: ${c.nome}"
        else -> "Foco"
    }

/**
 * "Termina às 14:35" (no fuso do aparelho) ou, pausada, "Pausado · faltam
 * 12 min", com os minutos arredondados para cima como no mostrador e na
 * bandeja do desktop (`tray_time`), e nunca menos de 1.
 */
fun textoDaContinua(c: Continua, fuso: java.util.TimeZone): String =
    if (c.pausado) {
        "Pausado · faltam ${minutosParaCima(c.restanteMs)} min"
    } else {
        "Termina às ${horaMinuto(c.fimMs, fuso)}"
    }

fun minutosParaCima(ms: Long): Long = maxOf(1L, (maxOf(0L, ms) + 59_999L) / 60_000L)

fun horaMinuto(ms: Long, fuso: java.util.TimeZone): String =
    java.text.SimpleDateFormat("HH:mm", java.util.Locale.ROOT).apply { timeZone = fuso }.format(java.util.Date(ms))

/**
 * Um item da agenda (5.2): o aviso que o `FimReceiver` posta em `quandoMs`,
 * já com o texto (o Rust pode estar parado na hora), e a contínua que fica
 * depois dele (`null`: a contínua sai).
 */
data class Alarme(
    /** Também o código de pedido do `PendingIntent`. */
    val id: Int,
    val quandoMs: Long,
    /** `fim-foco`, `fim-intervalo`, `fim-temporizador` ou `fim-sem-som` (5.5). */
    val canal: String,
    val titulo: String,
    val corpo: String? = null,
    val continuaDepois: Continua? = null,
)

/**
 * A agenda gravada nas `SharedPreferences` (JSON, com as chaves em camelCase,
 * as mesmas do `serde(rename_all = "camelCase")` do Rust, A09):
 * `[{"id":1,"quandoMs":...,"canal":"fim-foco","titulo":"...","corpo":"..."|null,
 * "continuaDepois":{"tipo":"intervalo","nome":"","fimMs":...,"pausado":false,"restanteMs":0}|null}]`.
 */
object Agenda {
    /** Até quanto depois do fim um aviso ainda sai ([trocaDeAgenda]). */
    const val TOLERANCIA_MS = 60_000L

    fun paraJson(itens: List<Alarme>): String {
        val lista = org.json.JSONArray()
        for (a in itens) {
            lista.put(
                org.json.JSONObject()
                    .put("id", a.id)
                    .put("quandoMs", a.quandoMs)
                    .put("canal", a.canal)
                    .put("titulo", a.titulo)
                    .put("corpo", a.corpo ?: org.json.JSONObject.NULL)
                    .put("continuaDepois", a.continuaDepois?.let(::continuaParaJson) ?: org.json.JSONObject.NULL),
            )
        }
        return lista.toString()
    }

    /**
     * Lê a agenda gravada. Texto vazio ou quebrado dá lista vazia (nada a
     * reagendar); um item sem `id`, `quandoMs`, `canal` ou `titulo` é
     * descartado sem derrubar os outros.
     */
    fun deJson(texto: String?): List<Alarme> {
        if (texto.isNullOrBlank()) return emptyList()
        val lista = try {
            org.json.JSONArray(texto)
        } catch (e: org.json.JSONException) {
            return emptyList()
        }
        return (0 until lista.length()).mapNotNull { i -> lista.optJSONObject(i)?.let(::alarmeDeJson) }
    }

    /** O que ainda vale reagendar depois do boot (5.2, item 5): o que vence depois de `agoraMs`, em ordem. */
    fun pendentes(itens: List<Alarme>, agoraMs: Long): List<Alarme> =
        itens.filter { it.quandoMs > agoraMs }.sortedBy { it.quandoMs }

    private fun continuaParaJson(c: Continua) =
        org.json.JSONObject()
            .put("tipo", c.tipo)
            .put("nome", c.nome)
            .put("fimMs", c.fimMs)
            .put("pausado", c.pausado)
            .put("restanteMs", c.restanteMs)

    private fun alarmeDeJson(o: org.json.JSONObject): Alarme? {
        if (!o.has("id") || !o.has("quandoMs")) return null
        val canal = texto(o, "canal") ?: return null
        val titulo = texto(o, "titulo") ?: return null
        return try {
            Alarme(
                id = o.getInt("id"),
                quandoMs = o.getLong("quandoMs"),
                canal = canal,
                titulo = titulo,
                corpo = texto(o, "corpo"),
                continuaDepois = o.optJSONObject("continuaDepois")?.let(::continuaDeJson),
            )
        } catch (e: org.json.JSONException) {
            null
        }
    }

    private fun continuaDeJson(o: org.json.JSONObject): Continua? {
        val tipo = texto(o, "tipo") ?: return null
        return Continua(
            tipo = tipo,
            nome = texto(o, "nome") ?: "",
            fimMs = o.optLong("fimMs", 0),
            pausado = o.optBoolean("pausado", false),
            restanteMs = o.optLong("restanteMs", 0),
        )
    }

    // `optString` devolve "null" para um null do JSON; aqui, null é null.
    private fun texto(o: org.json.JSONObject, chave: String): String? =
        if (!o.has(chave) || o.isNull(chave)) null else o.optString(chave)
}

/**
 * Um canal de notificação (5.5). Os canais são imutáveis depois de criados
 * (o usuário é dono do som e da importância): mudar o som de um deles é criar
 * outro, com outro `id`.
 */
data class Canal(
    val id: String,
    /** O nome que o usuário vê nas configurações de avisos do sistema. */
    val nome: String,
    val descricao: String,
    /** Importância alta (aviso com som e heads-up) ou baixa (sem som, sem pop-up). */
    val alta: Boolean,
    /** O recurso de `res/raw` do som, ou `null` para um canal mudo. */
    val som: String?,
)

/** Os canais do Tomatito, criados no `load` do plugin e antes de cada aviso. */
object Canais {
    const val FIM_FOCO = "fim-foco"
    const val FIM_INTERVALO = "fim-intervalo"
    const val FIM_TEMPORIZADOR = "fim-temporizador"
    const val FIM_SEM_SOM = "fim-sem-som"
    const val SESSAO = "sessao"

    val todos: List<Canal> = listOf(
        Canal(FIM_FOCO, "Fim do foco", "Avisa quando um bloco de foco termina.", alta = true, som = "focus_end"),
        Canal(FIM_INTERVALO, "Fim do intervalo", "Avisa quando um intervalo termina.", alta = true, som = "break_end"),
        Canal(
            FIM_TEMPORIZADOR,
            "Fim do temporizador",
            "Avisa quando um temporizador termina.",
            alta = true,
            som = "focus_end",
        ),
        Canal(
            FIM_SEM_SOM,
            "Fim sem som",
            "Avisos de fim quando o som daquele tipo está desligado no Tomatito.",
            alta = true,
            som = null,
        ),
        Canal(SESSAO, "Sessão em andamento", "O tempo da fase atual, sem som.", alta = false, som = null),
    )

    /**
     * O endereço do som de um canal: `android.resource://<pacote>/raw/<nome>`,
     * pelo nome e não pelo número do recurso, que pode mudar de um build para
     * outro (e o canal guarda o endereço para sempre).
     */
    fun uriDoSom(pacote: String, som: String): String = "android.resource://$pacote/raw/$som"
}

/**
 * A troca de uma agenda pela seguinte (5.2, item 3; A10a), calculada antes
 * de mexer no `AlarmManager`:
 * - [cancelar]: os códigos de pedido de todos os alarmes da agenda anterior
 *   (os `PendingIntent` são recriados com o mesmo código para o `cancel`);
 * - [postarAgora]: os itens da agenda anterior que já venceram, que o
 *   `FimReceiver` ainda não postou (ele tira da agenda gravada o que posta) e
 *   que não estão na nova. É o caso do app aberto: o motor chega ao fim da
 *   fase no mesmo instante do alarme e, se a agenda nova (sem aquele fim)
 *   chegar antes do disparo, cancelar sem postar perderia o aviso. Só vale
 *   até [Agenda.TOLERANCIA_MS] depois do fim: um item mais velho que isso
 *   (processo morto por horas, aparelho desligado) não avisa de novo; a
 *   retomada do motor (M40) mostra "Sessão concluída" ao abrir;
 * - [agendar]: a agenda nova inteira, em ordem.
 */
data class Troca(val cancelar: List<Int>, val postarAgora: List<Alarme>, val agendar: List<Alarme>)

fun trocaDeAgenda(antiga: List<Alarme>, nova: List<Alarme>, agoraMs: Long): Troca {
    val naNova = nova.map { it.id to it.quandoMs }.toSet()
    val vencidos = antiga.filter {
        it.quandoMs <= agoraMs && agoraMs - it.quandoMs <= Agenda.TOLERANCIA_MS && (it.id to it.quandoMs) !in naNova
    }
    return Troca(
        cancelar = antiga.map { it.id }.distinct(),
        postarAgora = vencidos.sortedBy { it.quandoMs },
        agendar = nova.sortedWith(compareBy({ it.quandoMs }, { it.id })),
    )
}

/**
 * O disparo de um alarme (A10a): o item da agenda gravada com o mesmo `id` e
 * o mesmo instante (o `FimReceiver` recebe os dois no `Intent`) e a agenda
 * sem ele. `null` se o item não está lá: já foi postado (pela troca) ou a
 * agenda mudou e o alarme era de uma anterior; nada a postar.
 */
fun disparoDaAgenda(itens: List<Alarme>, id: Int, quandoMs: Long): Pair<Alarme, List<Alarme>>? {
    val item = itens.firstOrNull { it.id == id && it.quandoMs == quandoMs } ?: return null
    return item to itens.filterNot { it === item }
}

/** Por que a agenda gravada é reaplicada sem o Rust (5.2, item 5; A10b). */
enum class MotivoDoReagendamento {
    /** `BOOT_COMPLETED`: o sistema apagou todos os alarmes ao desligar. */
    BOOT,

    /**
     * `ACTION_SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED` (Android 12/12L,
     * só na concessão): os alarmes inexatos viram exatos.
     */
    PERMISSAO,
}

/**
 * A agenda gravada reaplicada pelo `BootReceiver` ou pelo
 * `PermissaoAlarmeReceiver` (5.2, item 5; A10b): cancela os códigos de
 * pedido de todos os itens gravados e agenda de novo só os que ainda não
 * venceram ([Agenda.pendentes]); os vencidos saem da agenda **sem aviso**
 * (a retomada do motor, M40, mostra "Sessão concluída" ao abrir).
 *
 * Exceção, só na troca de permissão: um item vencido há menos de
 * [Agenda.TOLERANCIA_MS] ainda está gravado porque o alarme inexato dele
 * não disparou (o `FimReceiver` tira o que posta); ele sai agora, como na
 * [trocaDeAgenda], em vez de sumir calado. Depois do boot, nada vencido
 * avisa, por mais recente que seja.
 */
fun reagendamento(itens: List<Alarme>, agoraMs: Long, motivo: MotivoDoReagendamento): Troca {
    val pendentes = Agenda.pendentes(itens, agoraMs)
    return when (motivo) {
        MotivoDoReagendamento.BOOT ->
            Troca(cancelar = itens.map { it.id }.distinct(), postarAgora = emptyList(), agendar = pendentes)
        MotivoDoReagendamento.PERMISSAO -> trocaDeAgenda(itens, pendentes, agoraMs)
    }
}
