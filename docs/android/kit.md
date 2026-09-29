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

## Para o A02

- Já existe um servidor `adb` na porta padrão 5037: o do pacote do sistema (`/usr/lib/android-sdk/platform-tools/adb`, iniciado às 08:21 de 29/09, fora desta faixa). O `adb` 37.0.1 do kit na mesma porta derrubaria esse servidor por diferença de versão. Os scripts do A02 devem usar outra porta (`ANDROID_ADB_SERVER_PORT`) e nunca matar o servidor da 5037.
