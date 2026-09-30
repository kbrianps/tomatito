# Tomatito no Android: mapa dos documentos

O plano é o `PLANO-ANDROID.md` (fora do repositório, em `~/dev/tomatito-ref/`). Aqui fica o que o trabalho produz, marco a marco (A00–A26). Os desvios do plano e o porquê de cada escolha vão no `docs/decisoes.md`, seção "Android"; o que depende do usuário, no `docs/pendencias-usuario.md`, bloco "Android".

| Documento | O que tem | Marco |
|---|---|---|
| `LEIAME.md` | Este mapa. | A00 |
| `kit.md` | O kit Android no `/`: raiz, versões exatas, SHA-256 dos downloads, variáveis do `~/.config/tomatito/android.env`, AVDs e a validação do som com `-no-audio`. | A01, A02 |
| `versoes.md` | Uma linha por AAB enviado à Play: versão, `versionCode`, SHA-256, trilha e data. | A19 |
| `capturas/` | Capturas do emulador (`scripts/android/captura.mjs`). | A02 em diante |
| `play/ficha.md` | Ficha da loja em pt-BR. | A24 |
| `play/formularios.md` | Respostas prontas dos formulários do Play Console. | A24 |
| `PUBLICAR.md` | Passo a passo do usuário no Play Console, do teste interno à produção. | A25 |

## Onde fica cada coisa

- **Worktree:** `~/dev/tomatito-android`, branch `android`.
- **Rust:** `/opt/cargo-target/tomatito-android` (pelo `.cargo/config.toml`, fora do git).
- **Dependências do npm:** `node_modules` é um link para `/opt/cargo-target/tomatito-android/node/node_modules`, para não gastar o `/home`. Para reinstalar, rode o `npm ci` **dentro** de `/opt/cargo-target/tomatito-android/node` (com o `package.json` e o `package-lock.json` copiados da worktree); um `npm ci` na worktree troca o link por uma pasta de verdade no `/home`.
- **Guarda do Rust (A03):** `bash scripts/android/check.sh` compila o app para `x86_64-linux-android` e `aarch64-linux-android` com o clang do NDK e reprova com qualquer aviso. Entra na bateria de todo marco daqui em diante, junto com a do desktop.
- **Kit Android, AVDs, Gradle e saídas do Gradle:** no `/`, na raiz `$TT_ANDROID` do `kit.md` (A01). O `~/Android/Sdk` é de outro projeto e fica intocado.
- **Projeto Android (A04):** `src-tauri/gen/android` (gerado pelo `npx tauri android init` e ajustado: saídas do Gradle, manifesto). Build de depuração: `source scripts/android/ambiente.sh && npx tauri android build --debug --apk --target x86_64`; o APK sai em `$TT_GRADLE_SAIDAS/app/outputs/apk/universal/debug/` (o CLI imprime o caminho padrão, que não existe). Instalar e abrir: `node scripts/android/instalar.mjs --abrir` (com o emulador de pé). Ler a página: `node scripts/android/cdp.mjs tela` (e `avaliar`, `invoke`, `clicar`, `geometria`).
- **Plugin `tomatito-android` (A07a):** `src-tauri/plugins/tomatito-android` (crate em Rust só com o registro; a Kotlin em `android/src/main/java/io/github/kbrianps/tomatito/android/`). O JS chama `plugin:tomatito-android|<comando>` (`src/lib/ipc.js`, `android`); cada comando novo entra no `build.rs`, no `permissions/default.toml` e num `@Command` de mesmo nome (o `regras-do-repo.test.mjs` confere). Cores das barras por tema, com o app aberto: `node scripts/android/barras.mjs [--capturas <prefixo>]`. O JS chama pelo nome em snake_case (`abrir_url`) e o Tauri entrega ao método Kotlin em lowerCamelCase (`abrirUrl`).
- **Testes de JVM do plugin (A07b):** `source scripts/android/ambiente.sh && (cd src-tauri/gen/android && ./gradlew :tauri-plugin-tomatito-android:testDebugUnitTest)`; as funções puras ficam no `Puras.kt` e os testes em `android/src/test/`. Os comandos que abrem outra tela, pedem permissão ou tocam, no emulador com o build de depuração instalado: `node scripts/android/comandos.mjs` (começa com `pm clear`).
- **Canais e som (A08):** os canais de notificação nascem no `load` do plugin (`CanaisDoSistema.kt`, lista em `Canais.todos` no `Puras.kt`); os WAV do `src-tauri/sounds/` entram em `res/raw` pela tarefa `copiarSons` do `build.gradle.kts` do plugin (fonte única, nada copiado para o repositório); `ic_stat_tomatito` provisório em `res/drawable` do plugin. Conferência com o app aberto: `node scripts/android/canais.mjs`.
- **Alarmes e avisos de fim (A10a):** o Rust entrega a agenda (A09) ao comando `agendar` do plugin, só do Rust (`AgendaDoSistema.kt`: `setAlarmClock`, agenda gravada em `shared_prefs/tomatito-android.xml`); o `FimReceiver` posta o aviso na hora. Painel do aparelho em JSON (alarmes, notificações, agenda gravada, Doze, `logcat -s tomatito`): `node scripts/android/painel.mjs`. Roteiro do marco, com o app instalado (começa com `pm clear`): `node scripts/android/alarmes.mjs`.
- **Boot e permissão do alarme exato (A10b):** o `BootReceiver` (`BOOT_COMPLETED`) e o `PermissaoAlarmeReceiver` (concessão do alarme exato no Android 12/12L) reaplicam a agenda gravada sem o Rust (`AgendaDoSistema.reagendar`): o que não venceu volta ao `AlarmManager`, o vencido sai sem aviso. Roteiros, com o app instalado: `node scripts/android/reagendar.mjs boot` (no `tt37`, faz `adb reboot`) e `node scripts/android/reagendar.mjs permissao` (no `tt31`, `appops ... deny` e `allow`).
- **Notificação contínua (A11):** o `agendar` leva também a contínua de agora (`agenda::continua_atual`), e a Kotlin a mostra, troca ou tira no canal `sessao`, com o cronômetro regressivo desenhado pelo sistema; com o processo morto, o `FimReceiver` troca pela `continuaDepois`. Roteiro, com o app instalado: `node scripts/android/continua.mjs`.
