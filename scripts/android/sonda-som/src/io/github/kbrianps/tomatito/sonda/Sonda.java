package io.github.kbrianps.tomatito.sonda;

import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.media.AudioAttributes;
import android.os.Bundle;
import android.net.Uri;

// Posta uma notificação no canal "sonda_raw" (importância alta, som próprio em
// res/raw, uso USAGE_NOTIFICATION, como os canais do A08) e fecha.
// O extra "id" escolhe o id da notificação (padrão 1).
public class Sonda extends Activity {
    @Override
    protected void onCreate(Bundle estado) {
        super.onCreate(estado);
        NotificationManager nm = getSystemService(NotificationManager.class);
        NotificationChannel canal =
                new NotificationChannel("sonda_raw", "Sonda de som", NotificationManager.IMPORTANCE_HIGH);
        int som = getResources().getIdentifier("focus_end", "raw", getPackageName());
        canal.setSound(
                Uri.parse("android.resource://" + getPackageName() + "/" + som),
                new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build());
        nm.createNotificationChannel(canal);
        Notification n = new Notification.Builder(this, "sonda_raw")
                .setSmallIcon(android.R.drawable.ic_popup_reminder)
                .setContentTitle("Sonda de som")
                .setContentText("Fim do foco")
                .build();
        nm.notify(getIntent().getIntExtra("id", 1), n);
        finish();
    }
}
