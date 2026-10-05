package io.github.kbrianps.tomatito.android

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.media.AudioAttributes
import android.net.Uri
import android.os.Build

/**
 * Cria (ou confirma) os canais de [Canais.todos] no sistema (5.5, A08). Vale
 * chamar sempre: criar um canal que já existe não muda o som nem a
 * importância (o usuário é dono deles), só o nome e a descrição. Chamado no
 * `load` do plugin e, a partir do A10a, pelo `FimReceiver` antes de postar
 * (o processo pode ter subido só pelo alarme). Antes do Android 8 não há
 * canais: o som e a importância vão em cada notificação.
 */
fun criarCanais(contexto: Context) {
    if (Build.VERSION.SDK_INT < 26) return
    val gerente = contexto.getSystemService(NotificationManager::class.java) ?: return
    val atributos = AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_NOTIFICATION)
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
        .build()
    val canais = Canais.todos.map { c ->
        val importancia = if (c.alta) NotificationManager.IMPORTANCE_HIGH else NotificationManager.IMPORTANCE_LOW
        NotificationChannel(c.id, c.nome, importancia).apply {
            description = c.descricao
            if (c.som != null) {
                setSound(Uri.parse(Canais.uriDoSom(contexto.packageName, c.som)), atributos)
            } else {
                setSound(null, null)
            }
            enableVibration(c.alta)
            setShowBadge(false)
        }
    }
    gerente.createNotificationChannels(canais)
}
