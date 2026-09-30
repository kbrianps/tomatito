package io.github.kbrianps.tomatito.android

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * O fim de uma fase ou de um temporizador (PLANO-ANDROID 5.2, item 4; A10a):
 * o alarme do [AgendaDoSistema] chega aqui na hora, com o app aberto, em
 * segundo plano ou com o processo morto (o sistema sobe o processo só para
 * o receiver; o Rust não roda). Posta o aviso já pronto da agenda gravada,
 * troca a contínua e tira o item da agenda. Não toca som por conta própria:
 * quem toca é o canal (5.5).
 */
class FimReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != AgendaDoSistema.ACAO_FIM) return
        val id = intent.getIntExtra(AgendaDoSistema.EXTRA_ID, -1)
        val quandoMs = intent.getLongExtra(AgendaDoSistema.EXTRA_QUANDO, -1)
        if (id < 0 || quandoMs < 0) return
        AgendaDoSistema.disparou(context, id, quandoMs)
    }
}
