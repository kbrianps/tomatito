package io.github.kbrianps.tomatito.android

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Depois de reiniciar (PLANO-ANDROID 5.2, item 5; A10b): o sistema apaga os
 * alarmes ao desligar, e a agenda gravada nas `SharedPreferences` os traz de
 * volta, sem o Rust. Só o que ainda não venceu; o vencido sai sem aviso.
 *
 * `BOOT_COMPLETED` (e não o `LOCKED_BOOT_COMPLETED`) chega depois do primeiro
 * desbloqueio, quando as `SharedPreferences` (armazenamento protegido por
 * credencial) já podem ser lidas.
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        AgendaDoSistema.reagendar(context, MotivoDoReagendamento.BOOT)
    }
}
