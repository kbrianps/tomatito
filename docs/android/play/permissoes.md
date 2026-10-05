# Permissões do app Android e por quê

As mesmas justificativas estão na política de privacidade (`src/platform/web/publico/privacidade.html`). O `node scripts/android/ficha.mjs` confere que cada permissão do pacote tem uma linha aqui.

| Permissão | Para quê |
|---|---|
| `android.permission.POST_NOTIFICATIONS` | Notificações: avisar o fim de cada período de foco e de cada intervalo, e mostrar a contagem enquanto uma sessão corre. |
| `android.permission.USE_EXACT_ALARM` | Alarmes exatos (Android 13 ou mais novo): o aviso chega na hora certa com a tela apagada ou o app fechado. É a função principal de um timer. |
| `android.permission.SCHEDULE_EXACT_ALARM` | Alarmes exatos no Android 12 (declarada só até o SDK 32), pelo mesmo motivo. |
| `android.permission.RECEIVE_BOOT_COMPLETED` | Iniciar com o aparelho: reagendar os avisos de uma sessão em andamento depois que o aparelho reinicia. |

O app **não** pede `INTERNET`, localização, câmera, microfone, contatos, arquivos nem acessibilidade.
