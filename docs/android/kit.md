# Kit Android

Preenchido no A01 (instalação) e no A02 (AVDs e validação do som). Plano: `PLANO-ANDROID.md`, seção 3.

## Raiz e variáveis (A01, 29/09/2026)

- **Raiz (`$TT_ANDROID`):** `/opt/cargo-target/android`. O `/opt/android` não existe (criá-lo pede `sudo`, pendência 201), e o `/opt/cargo-target` é do usuário. O plano sugeria `/opt/cargo-target/android-kit`; a pasta ficou `android` (`docs/decisoes.md`, Android, A01).
- **Variáveis:** `~/.config/tomatito/android.env`, fora do repositório e fora do `~/.profile`. Para usar no terminal: `source ~/.config/tomatito/android.env`. Os scripts `scripts/android/*` (A02 em diante) leem o mesmo arquivo.

| Variável | Valor |
|---|---|
| `TT_ANDROID` | `/opt/cargo-target/android` |
| `ANDROID_HOME`, `ANDROID_SDK_ROOT` | `$TT_ANDROID/sdk` |
| `NDK_HOME` | `$ANDROID_HOME/ndk/30.0.16248370` |
| `ANDROID_AVD_HOME` | `$TT_ANDROID/avd` |
| `ANDROID_USER_HOME` | `$TT_ANDROID/usuario` (fora do plano; ver abaixo) |
| `ANDROID_EMULATOR_HOME` | `$ANDROID_USER_HOME` (A02, fora do plano; ver "AVDs e emulador") |
| `GRADLE_USER_HOME` | `$TT_ANDROID/gradle` |
| `JAVA_HOME` | `~/.sdkman/candidates/java/current` (Temurin 25.0.4) |
| `PATH` | ganha `platform-tools`, `emulator` e `cmdline-tools/latest/bin` do kit |
| `BUNDLETOOL` | `$TT_ANDROID/tools/bundletool-all-1.18.3.jar` |
| `TT_GRADLE_SAIDAS` | `$TT_ANDROID/saidas/tomatito-android` |
| `CC_*`, `AR_*` | clang e `llvm-ar` do NDK, API 24, para `x86_64-linux-android`, `aarch64-linux-android` e `armv7-linux-androideabi` |
| `CARGO_TARGET_*_LINKER` | o mesmo clang de cada alvo |

**`ANDROID_USER_HOME` no kit.** O `sdkmanager` do cmdline-tools 23.0 é só um script que chama o "Android CLI" (`cmdline-tools/latest/bin/android`, 1.0.16457483). Na primeira execução, esse CLI baixa o executável completo e um pacote com JRE próprio (~250 MB) para `$ANDROID_USER_HOME`, que por padrão é `~/.android`. Com a variável apontando para o kit, nada disso cai no `/home`. Efeitos colaterais para os marcos seguintes: a chave do `adb`, as preferências do emulador e o `debug.keystore` do Gradle passam a ser os de `$TT_ANDROID/usuario`, e não os de `~/.android` (que é do Ônibus RJ e fica intocado).

## Versões instaladas

`sdkmanager --list_installed` (o CLI novo imprime os caminhos com `/` no lugar de `;`):

| Pacote | Versão | Arquivo baixado | SHA-1 (publicado no XML do repositório e conferido pelo CLI) |
|---|---|---|---|
| `cmdline-tools;latest` | 23.0 | `commandlinetools-linux-16111833_latest.zip` | `e025545c62a8e64c7559119566a569fb1dec5f60` |
| `platform-tools` | 37.0.1 (adb 1.0.41, 37.0.1-15733141) | `platform-tools_r37.0.1-linux.zip` | `477254aa5f903c15cf51001717bdf347fb6b53e0` |
| `platforms;android-37.0` | 2 | `platform-37.0_r02.zip` | `ed8ebf7f8822a4de5686d427f237d2fa30ff7410` |
| `build-tools;37.0.0` | 37.0.0 | `build-tools_r37_linux.zip` | `70954e99f4c3d9d46ee70fa32624672fe7cd6ebe` |
| `ndk;30.0.16248370` | r30 (clang 21.0.0) | `android-ndk-r30-linux.zip` | `5107f898313790e449e87eee2183d9a20602dee9` |
| `emulator` | 37.1.11 (build 15917651) | `emulator-linux_x64-15917651.zip` | `1b1f78891abf8ec268264356e1365c25519e8379` |
| `system-images;android-37.0;google_apis;x86_64` | 6 | `x86_64-37.0_r06.zip` | `629e507fd5b737c2c836b12b52c81cd0e3b12399` |
| `system-images;android-37.0;google_apis_ps16k;x86_64` | 7 | `x86_64-ps16k-37.0_r07.zip` | `9c50c3299708039310c98c94d698a75861b2f1bf` |
| `system-images;android-31;google_apis;x86_64` | 14 | `x86_64-31_r14.zip` | `9aedd3e85cad7a479146f6858f4a94840c2a3f29` |

- O repositório do SDK (`repository2-3.xml` e `sys-img/google_apis/sys-img2-3.xml`) publica só SHA-1. O CLI guarda cada download pelo SHA-1 antes de descompactar (os nomes dos arquivos em `sdk/.sdk/arch` batiam com a tabela) e apaga os `.zip` no fim.
- **cmdline-tools:** SHA-256 do zip, calculado aqui: `0877a1d048fe4a24efe2eff536ca4223f7adeb58648bb81909d33c446918cfa8` (181 052 239 bytes). A página developer.android.com/studio ainda aponta o anterior (15859902), então não há SHA-256 publicado para o 16111833; vale o SHA-1 do XML, que bateu.
- **bundletool 1.18.3** (a mais nova do GitHub, de 15/12/2025): `bundletool-all-1.18.3.jar`, 32 520 401 bytes, SHA-256 `a099cfa1543f55593bc2ed16a70a7c67fe54b1747bb7301f37fdfd6d91028e29`, igual ao `digest` publicado pelo GitHub para o arquivo da release. `java -jar $BUNDLETOOL version` → `1.18.3`.
- **Rust:** alvos `aarch64-linux-android`, `armv7-linux-androideabi` e `x86_64-linux-android` no `rustc 1.95.0` (+380 MB no `~/.rustup`).
- **Aceleração:** `emulator -accel-check` → "KVM (version 12) is installed and usable" (pela ACL do logind; pendência 205).

## Disco

| Onde | Tamanho |
|---|---|
| `sdk/system-images` (3 imagens) | 14 GB (o plano estimava ~5 GB) |
| `sdk/ndk` | 2,3 GB |
| `sdk/emulator` | 821 MB |
| `sdk/platforms`, `build-tools`, `platform-tools`, `cmdline-tools` | 513 MB |
| `usuario` (Android CLI) | 249 MB |
| `tools` (bundletool) | 32 MB |
| **Total do kit** | **18 GB** no `/` (138 GB livres depois) |

No `/home`: `~/.rustup` 1 595 → 1 975 MB (+380 MB, os três `rust-std`); `~/.android` 12 MB antes e depois (sem arquivo novo); `~/Android/Sdk` 462 MB antes e depois; `~/.config/tomatito/android.env`, 2 KB. `du -s -B1M ~`: 147 280 MB antes e 147 667 MB depois (+387 MB, dos quais 380 são os `rust-std`; o resto é o uso normal da sessão no meio tempo). A medida de "antes" foi feita depois de tirar do `~/.android` os 250 MB da tentativa interrompida (`docs/decisoes.md`, Android, A01, item 2).

## Como refazer

Seção 3.3 do plano, com duas diferenças: `TT_ANDROID=/opt/cargo-target/android` e `ANDROID_USER_HOME="$TT_ANDROID/usuario"` exportada **antes** do primeiro `sdkmanager`. O `sdkmanager --licenses` agora só avisa que não é mais necessário.

## AVDs e emulador (A02, 29/09/2026)

Os três AVDs moram em `$ANDROID_AVD_HOME` (`/opt/cargo-target/android/avd`), criados por `bash scripts/android/criar-avds.sh` (`--recriar` para refazer), todos a partir do perfil `pixel_5` e com a tela das capturas da loja: 1080 × 1920 a 420 dpi. O `config.ini` também leva `hw.ramSize=2048M`, `hw.sdCard=no` (sem o `sdcard.img` de 512 MB), `showDeviceFrame=no` e `disk.dataPartition.size=6G`.

| AVD | Imagem | Para quê | Partida a frio (medida) |
|---|---|---|---|
| `tt37` | `system-images;android-37.0;google_apis;x86_64` | o padrão de todos os marcos | 95 s na primeira; 41–47 s depois |
| `tt31` | `system-images;android-31;google_apis;x86_64` | Android 12 (A13: `SCHEDULE_EXACT_ALARM`) | 40 s na primeira; 20–59 s depois |
| `tt37k` | `system-images;android-37.0;google_apis_ps16k;x86_64` | kernel de páginas de 16 KB (`getconf PAGE_SIZE` = 16384; A20) | 113 s na primeira; 39–43 s depois |

Disco: 3,9 GB para os três (userdata em qcow2, cresce com o uso). Nada foi para o `~/.android/avd` (a pasta nem existe).

**Scripts** (`scripts/android/`):

| Script | Faz |
|---|---|
| `ambiente.sh [--emulador]` | `source` do `android.env`; confere as variáveis, o NDK, o `bundletool`, o `adb` e o `emulator` do kit no `PATH`; com `--emulador`, roda `emulator -accel-check` e falha com a mensagem de KVM da seção 3.1 do plano. Define as portas desta faixa (abaixo). |
| `lib/ambiente.mjs` | O mesmo ambiente para os `.mjs` (um bash lê o `ambiente.sh` e devolve as variáveis) e um `adb` preso ao servidor e ao serial desta faixa. |
| `criar-avds.sh [--recriar]` | Cria os três AVDs e ajusta o `config.ini`. |
| `emulador.mjs subir [--avd tt37\|tt31\|tt37k] [--com-audio]` | Sobe sem janela (`-no-window -no-boot-anim -gpu swiftshader_indirect -memory 2048 -no-snapshot-save -no-metrics`, e `-no-audio` ou, com `--com-audio`, `-audio none`), espera o `sys.boot_completed = 1` (limite de 180 s), reinicia uma vez se o aparelho subiu com os efeitos de notificação desligados (abaixo), zera as três escalas de animação, desliga o *notification cooldown* (abaixo) e fixa o fuso `America/Sao_Paulo`. Imprime um JSON com o tempo, o SDK, o fuso e o modo de áudio. Um emulador por vez. |
| `emulador.mjs parar` | `adb emu kill`, depois SIGTERM e SIGKILL no que sobrar do emulador do kit (qemu, `netsimd`, `crashpad_handler`), espera o `adb devices` vazio, derruba o servidor do `adb` desta faixa e apaga o `~/.android/adb.5041` que ele deixa. Sai 1 se sobrar aparelho ou processo. |
| `emulador.mjs estado` | Lista os processos do emulador do kit, sem subir o `adb`. |
| `captura.mjs <nome>` | `adb exec-out screencap -p` → `docs/android/capturas/<nome>.png`; confere a assinatura e lê largura e altura do IHDR. |
| `sonda-som/` | APK mínimo (javac + d8 + aapt2 + apksigner, sem Gradle; saída em `$TT_ANDROID/saidas/sonda-som`) que posta uma notificação num canal de importância alta com som próprio em `res/raw` (o `focus-end.wav` do desktop) e `USAGE_NOTIFICATION`, como os canais do A08. Só para a validação abaixo. |

**Portas.** O servidor do `adb` desta faixa escuta na **5041** (`ANDROID_ADB_SERVER_PORT`), e não na 5037, onde roda o `adb` do pacote do sistema (outra versão; um `adb` 37 na 5037 derrubaria aquele). O emulador usa a porta de console **5620** (adb na 5621, serial `emulator-5620`), fora da faixa 5554–5585 que os servidores do `adb` varrem sozinhos: o `adb` da 5037 não enxerga o emulador desta faixa.

**Memória.** As imagens do Android 17 (`tt37`, `tt37k`) sobem a RAM para 4 GB por conta própria ("Increasing RAM size to 4096MB" no log), apesar do `-memory 2048`; a `tt31` fica com 2 GB. Vale a regra da seção 3.2 do plano: nunca emulador e build de release ao mesmo tempo.

**`ANDROID_EMULATOR_HOME`.** O emulador não usa o `ANDROID_USER_HOME` para os arquivos dele (`modem-nv-ram-<porta>`, `emu-update-last-check.ini`, `emu-last-feature-flags.protobuf`, a própria `adbkey`); sem a variável, eles caíam no `~/.android`. O `android.env` ganhou `ANDROID_EMULATOR_HOME="$ANDROID_USER_HOME"`. O único arquivo que o kit ainda escreve no `~/.android` é o `adb.5041` (48 bytes, o caminho do binário do servidor; o `adb` não tem variável para isso), e o `emulador.mjs parar` o apaga.

### Validação do som com `-no-audio`

**Resultado: o `-no-audio` não esconde o som das notificações.** Com a sonda, nos três AVDs e sem `--com-audio`, cada aviso aparece como tocado nos dois lugares que o A08 e o A12 conferem:

- `dumpsys notification --noredact`: `mSoundNotificationKey=0|<pacote>|<id>|null|<uid>` (o último aviso que tocou), com `mZenMode=ZEN_MODE_OFF` e `mDisableNotificationEffects=false`. O campo `audiblyAlerted` **não aparece** no texto do `dumpsys` (nem no 31 nem no 37); o `mSoundNotificationKey` e o `mInterruptionTimeMs` do registro fazem esse papel.
- `dumpsys audio`, no histórico de players (o player do SystemUI é solto ~2 s depois, então a lista "players:" do momento em geral já está vazia): `new player … MediaPlayer`, `new AudioAttributes … usage=USAGE_NOTIFICATION content=CONTENT_TYPE_SONIFICATION` e depois `event:started` / `event:stopped` no Android 17, ou `state:started` / `state:stopped` no Android 12, no dispositivo `speaker(2)`. No `logcat`, `RingtonePlayer: play uri=android.resource://<pacote>/<id>`.
- Três avisos seguidos, a cada 10 s, no `tt37`: os três tocaram (três players, três `event:started`).
- `--com-audio` (`-audio none`) também funciona (boot de 105 s no `tt37`, som tocado) e nada chega ao servidor de som da sessão (`pactl list short sink-inputs` sem o emulador). Não é necessário: **o A08 e o A12 sobem o emulador sem `--com-audio`.**

Três armadilhas achadas na validação, que valem para o A08 e o A12:

1. **Primeira partida de um AVD novo, no Android 12:** o NotificationManagerService sobe antes de o aparelho ficar "provisionado" e começa com `mDisableNotificationEffects=true`: o aviso é postado, mas não toca, até a partida seguinte. Visto no `tt31` recém-criado. O `emulador.mjs subir` confere isso e reinicia uma vez (no `tt37` e no `tt37k` não aconteceu).
2. **Som padrão do sistema numa primeira partida:** no `tt37k` recém-criado, o `content://settings/system/notification_sound` ainda não tinha arquivo (`settings get system notification_sound` = `null`; "Couldn't open fd" no log) e o aviso não tocou. Os canais do Tomatito usam `res/raw` (5.5 do plano), então isso não os afeta; a sonda passou a usar `res/raw` também.
3. **Notification cooldown do Android 15+:** com o padrão do sistema, um aviso do mesmo app ~30 s depois de outro que tocou saiu **mudo** (sem player nenhum); com `settings put system notification_cooldown_enabled 0`, o mesmo aviso tocou. O `emulador.mjs subir` desliga o cooldown, porque as receitas da seção 6 dão fins a cada 60 s. **No aparelho do usuário o cooldown vem ligado**; com fases de vários minutos ele não deve pesar, mas o A12 deve fazer uma rodada com o cooldown do sistema (`settings delete system notification_cooldown_enabled`) e registrar o que acontece com fins a 60 s. Outra: postar e, na mesma hora, reinstalar o app cancela o aviso (o `PACKAGE_REPLACED` de uma instalação incremental chega segundos depois de o `adb install` voltar); nos roteiros, esperar o fim da instalação antes de abrir o app.

Se um dia o som deixar de aparecer, o plano B do A02 continua valendo: "o canal tem som, a notificação foi postada nesse canal e o DND está desligado (`mZenMode=0`)".
