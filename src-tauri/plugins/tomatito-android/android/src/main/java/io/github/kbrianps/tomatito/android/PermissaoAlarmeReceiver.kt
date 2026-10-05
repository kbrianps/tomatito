package io.github.kbrianps.tomatito.android

import android.app.AlarmManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

/**
 * O alarme exato foi concedido (PLANO-ANDROID 5.2, item 5; A10b). Só no
 * Android 12/12L: do 13 em diante o `USE_EXACT_ALARM` não se desliga. O
 * sistema manda o broadcast só na concessão (na revogação, o Android 12 mata
 * o app e cancela os alarmes exatos). A agenda gravada volta como exata, a
 * partir das `SharedPreferences`, sem o Rust.
 */
class PermissaoAlarmeReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return
        if (intent.action != AlarmManager.ACTION_SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED) return
        AgendaDoSistema.reagendar(context, MotivoDoReagendamento.PERMISSAO)
    }
}
