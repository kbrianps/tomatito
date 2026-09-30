# Regras que o :app aplica ao minificar o release (R8). O Tauri acha a classe
# do plugin pelo nome (register_android_plugin) e os comandos por reflexão
# (@Command), e lê os argumentos por Jackson (@InvokeArg).
-keep class io.github.kbrianps.tomatito.android.TomatitoPlugin { *; }
-keep @app.tauri.annotation.InvokeArg class io.github.kbrianps.tomatito.android.** { *; }
