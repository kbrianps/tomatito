package io.github.kbrianps.tomatito.android

// Funções puras do plugin (PLANO-ANDROID 4.2): nada de API do Android aqui,
// para os testes de JVM (A07b) rodarem sem emulador.

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
