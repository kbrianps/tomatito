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
- **Kit Android, AVDs, Gradle e saídas do Gradle:** no `/`, na raiz `$TT_ANDROID` do `kit.md` (A01). O `~/Android/Sdk` é de outro projeto e fica intocado.
