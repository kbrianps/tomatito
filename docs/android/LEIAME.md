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
- **Plugin `tomatito-android` (A07a):** `src-tauri/plugins/tomatito-android` (crate em Rust só com o registro; a Kotlin em `android/src/main/java/io/github/kbrianps/tomatito/android/`). O JS chama `plugin:tomatito-android|<comando>` (`src/lib/ipc.js`, `android`); cada comando novo entra no `build.rs`, no `permissions/default.toml` e num `@Command` de mesmo nome (o `regras-do-repo.test.mjs` confere). Cores das barras por tema, com o app aberto: `node scripts/android/barras.mjs [--capturas <prefixo>]`.
