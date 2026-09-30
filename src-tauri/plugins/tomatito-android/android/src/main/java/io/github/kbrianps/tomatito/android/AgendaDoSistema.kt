package io.github.kbrianps.tomatito.android

import android.Manifest
import android.app.AlarmManager
import android.app.Notification
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat

/**
 * A agenda dos avisos de fim no `AlarmManager` (PLANO-ANDROID 5.2, itens 3 e
 * 4; A10a). O Rust manda a agenda inteira a cada mudança (`agendar`); cada
 * item vira um alarme que, na hora, acorda o [FimReceiver], mesmo com o
 * processo morto. O `agendar` e o disparo passam pela mesma trava: o
 * `agendar` roda na thread do plugin e o receiver na principal, e os dois
 * leem e regravam a agenda das `SharedPreferences`. O [BootReceiver] e o
 * [PermissaoAlarmeReceiver] (A10b) passam por ela também ([reagendar]).
 */
object AgendaDoSistema {
    const val TAG = "tomatito"
    const val ACAO_FIM = "io.github.kbrianps.tomatito.android.FIM"
    const val EXTRA_ID = "id"
    const val EXTRA_QUANDO = "quandoMs"

    /** A agenda gravada (JSON do [Agenda.paraJson]), nas preferências do plugin. */
    const val CHAVE_AGENDA = "agenda"

    /** A etiqueta das notificações de fim (o número é o `id` do item) e a da contínua. */
    const val ETIQUETA_FIM = "fim"
    const val ETIQUETA_CONTINUA = "sessao"
    const val ID_CONTINUA = 1

    private val trava = Any()

    /**
     * Troca a agenda gravada pela nova do Rust ([trocaDeAgenda]): o que venceu
     * sem aviso sai agora, e a nova vai inteira para o `AlarmManager`
     * ([aplicar]). Devolve quantos itens foram agendados com cada API.
     */
    fun agendar(contexto: Context, nova: List<Alarme>): Map<ApiDoAlarme, Int> = synchronized(trava) {
        val ctx = contexto.applicationContext
        val antiga = Agenda.deJson(preferencias(ctx).getString(CHAVE_AGENDA, null))
        val troca = trocaDeAgenda(antiga, nova, System.currentTimeMillis())
        val contagem = aplicar(ctx, troca)
        // Nada correndo (parado, pausado, fim da sessão): a contínua sai. Até o
        // A11 (comando `continua`), é o único lugar que a tira fora do disparo.
        if (troca.agendar.isEmpty() && troca.postarAgora.isEmpty()) continua(ctx, null)
        Log.i(TAG, "agendar: ${troca.agendar.size} alarme(s) $contagem, ${troca.cancelar.size} cancelado(s)")
        contagem
    }

    /**
     * Reaplica a agenda gravada sem o Rust (5.2, item 5; A10b): depois do boot
     * ([BootReceiver]) ou da concessão do alarme exato no Android 12/12L
     * ([PermissaoAlarmeReceiver]). O que ainda não venceu volta ao
     * `AlarmManager` (exato, se permitido); o vencido sai da agenda sem aviso
     * ([reagendamento]). A contínua fica como está: no boot o sistema já a
     * apagou, e ela volta no próximo disparo ou ao abrir o app (A11).
     */
    fun reagendar(contexto: Context, motivo: MotivoDoReagendamento): Map<ApiDoAlarme, Int> = synchronized(trava) {
        val ctx = contexto.applicationContext
        val gravada = Agenda.deJson(preferencias(ctx).getString(CHAVE_AGENDA, null))
        val agora = System.currentTimeMillis()
        val troca = reagendamento(gravada, agora, motivo)
        val descartados = gravada.size - troca.agendar.size - troca.postarAgora.size
        val contagem = aplicar(ctx, troca)
        Log.i(
            TAG,
            "reagendar ($motivo): ${troca.agendar.size} alarme(s) $contagem, " +
                "$descartados vencido(s) descartado(s) sem aviso, ${troca.postarAgora.size} postado(s) agora",
        )
        contagem
    }

    /**
     * Aplica uma [Troca]: cancela os alarmes da agenda gravada, grava a nova,
     * posta o que venceu sem aviso e agenda cada item: `setAlarmClock` com
     * alarme exato permitido, `setAndAllowWhileIdle` sem ele ([apiDoAlarme]).
     * Devolve quantos itens foram agendados com cada API. Chamar com a trava.
     */
    private fun aplicar(ctx: Context, troca: Troca): Map<ApiDoAlarme, Int> {
        val am = ctx.getSystemService(AlarmManager::class.java)
        for (id in troca.cancelar) {
            pedidoDoFim(ctx, id, 0, PendingIntent.FLAG_NO_CREATE)?.let {
                am.cancel(it)
                it.cancel()
            }
        }
        // Grava antes de agendar: um alarme que dispare já encontra o item.
        preferencias(ctx).edit().putString(CHAVE_AGENDA, Agenda.paraJson(troca.agendar)).commit()
        for (a in troca.postarAgora) {
            Log.i(TAG, "fim ${a.id} venceu antes do alarme; aviso postado agora")
            postar(ctx, a)
        }
        val contagem = mutableMapOf(ApiDoAlarme.RELOGIO to 0, ApiDoAlarme.OCIOSO to 0)
        for (a in troca.agendar) {
            val api = agendarUm(ctx, am, a)
            contagem[api] = contagem.getValue(api) + 1
        }
        return contagem
    }

    /**
     * Um alarme disparou (o [FimReceiver]): se o item ainda está na agenda
     * gravada, posta o aviso, troca a contínua e tira o item da agenda.
     * Devolve se postou.
     */
    fun disparou(contexto: Context, id: Int, quandoMs: Long): Boolean = synchronized(trava) {
        val ctx = contexto.applicationContext
        val prefs = preferencias(ctx)
        val itens = Agenda.deJson(prefs.getString(CHAVE_AGENDA, null))
        val (item, resto) = disparoDaAgenda(itens, id, quandoMs) ?: run {
            Log.i(TAG, "FimReceiver: fim $id ($quandoMs) fora da agenda; nada a postar")
            return false
        }
        prefs.edit().putString(CHAVE_AGENDA, Agenda.paraJson(resto)).commit()
        Log.i(TAG, "FimReceiver: fim $id no canal ${item.canal}")
        postar(ctx, item)
        true
    }

    private fun agendarUm(ctx: Context, am: AlarmManager, a: Alarme): ApiDoAlarme {
        val pedido = pedidoDoFim(ctx, a.id, a.quandoMs, PendingIntent.FLAG_UPDATE_CURRENT)!!
        val api = apiDoAlarme(Build.VERSION.SDK_INT) { am.canScheduleExactAlarms() }
        if (api == ApiDoAlarme.RELOGIO) {
            try {
                am.setAlarmClock(AlarmManager.AlarmClockInfo(a.quandoMs, abrirOApp(ctx)), pedido)
                return ApiDoAlarme.RELOGIO
            } catch (e: SecurityException) {
                // A permissão caiu entre a consulta e a chamada (Android 12).
                Log.w(TAG, "setAlarmClock recusado; alarme inexato para o fim ${a.id}", e)
            }
        }
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, a.quandoMs, pedido)
        return ApiDoAlarme.OCIOSO
    }

    /**
     * O `PendingIntent` do alarme de um item: o código de pedido é o `id`
     * (5.2, item 3), e o `Intent` explícito para o [FimReceiver] leva o `id`
     * e o instante. Com `FLAG_NO_CREATE`, devolve o existente (ou `null`),
     * para o `cancel`: os extras não contam na comparação.
     */
    private fun pedidoDoFim(ctx: Context, id: Int, quandoMs: Long, flag: Int): PendingIntent? {
        val intent = Intent(ctx, FimReceiver::class.java)
            .setAction(ACAO_FIM)
            .putExtra(EXTRA_ID, id)
            .putExtra(EXTRA_QUANDO, quandoMs)
        return PendingIntent.getBroadcast(ctx, id, intent, flag or PendingIntent.FLAG_IMMUTABLE)
    }

    /** Toque no aviso, na contínua ou no "próximo alarme": abre o app. */
    private fun abrirOApp(ctx: Context): PendingIntent {
        val intent = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)
            ?: Intent().setPackage(ctx.packageName)
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
        return PendingIntent.getActivity(
            ctx,
            0,
            intent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
    }

    /**
     * Posta o aviso do item no canal dele (o canal toca o som, 5.5; nada de
     * `MediaPlayer` aqui) e troca a contínua pela `continuaDepois` (ou a
     * tira). Sem permissão de avisos, não posta nada e não quebra.
     */
    private fun postar(ctx: Context, a: Alarme) {
        // O processo pode ter subido só por este alarme: os canais primeiro.
        criarCanais(ctx)
        val aviso = NotificationCompat.Builder(ctx, a.canal)
            .setSmallIcon(R.drawable.ic_stat_tomatito)
            .setContentTitle(a.titulo)
            .apply { a.corpo?.let { setContentText(it) } }
            .setWhen(a.quandoMs)
            .setShowWhen(true)
            .setAutoCancel(true)
            .setContentIntent(abrirOApp(ctx))
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            // Antes do Android 8 não há canal: a importância vai no aviso.
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setDefaults(0)
            .build()
        notificar(ctx, ETIQUETA_FIM, a.id, aviso)
        continua(ctx, a.continuaDepois)
    }

    /**
     * A notificação contínua (5.3): canal `sessao`, sem som, com a contagem
     * desenhada pelo sistema até `fimMs`; pausada, sem cronômetro. `null`
     * tira. A10a só a troca no disparo; mostrá-la desde o início da fase é
     * do A11.
     */
    fun continua(contexto: Context, c: Continua?) {
        val ctx = contexto.applicationContext
        if (c == null) {
            NotificationManagerCompat.from(ctx).cancel(ETIQUETA_CONTINUA, ID_CONTINUA)
            return
        }
        criarCanais(ctx)
        val b = NotificationCompat.Builder(ctx, Canais.SESSAO)
            .setSmallIcon(R.drawable.ic_stat_tomatito)
            .setContentTitle(tituloDaContinua(c))
            .setContentText(textoDaContinua(c, java.util.TimeZone.getDefault()))
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setContentIntent(abrirOApp(ctx))
            .setCategory(NotificationCompat.CATEGORY_PROGRESS)
            .setPriority(NotificationCompat.PRIORITY_LOW)
        if (c.pausado) {
            b.setShowWhen(false).setUsesChronometer(false)
        } else {
            b.setWhen(c.fimMs).setShowWhen(true).setUsesChronometer(true).setChronometerCountDown(true)
        }
        notificar(ctx, ETIQUETA_CONTINUA, ID_CONTINUA, b.build())
    }

    private fun notificar(ctx: Context, etiqueta: String, id: Int, n: Notification) {
        val permitido = Build.VERSION.SDK_INT < 33 ||
            ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED
        if (!permitido) {
            Log.w(TAG, "sem POST_NOTIFICATIONS: aviso $etiqueta/$id não postado")
            return
        }
        try {
            NotificationManagerCompat.from(ctx).notify(etiqueta, id, n)
        } catch (e: SecurityException) {
            Log.w(TAG, "aviso $etiqueta/$id recusado pelo sistema", e)
        }
    }

    private fun preferencias(ctx: Context) =
        ctx.getSharedPreferences(TomatitoPlugin.PREFERENCIAS, Context.MODE_PRIVATE)
}
