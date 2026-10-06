# Versões do Android

Uma linha por pacote (`.aab`) gerado para a Play. O `versionCode` vem da versão: `maior × 1 000 000 + menor × 1 000 + correção` (0.2.0 → 2000). A Play recusa um `versionCode` repetido ou menor que um já enviado: o `node scripts/android/versao.mjs` confere isso contra as linhas **enviadas** desta tabela.

| Versão | versionCode | SHA-256 do AAB | Trilha | Data |
|---|---|---|---|---|
| 0.2.0 | 2000 | `28ca9b06383c41c85ddf7fac621fde2ef1019ec2f94b9935fd58ce2b4f4fb764` | não enviado | 05/10/2026 |
| 0.3.0 | 3000 | `923bcd59468194b686c146aa6c934b3b1bffb5a3fbd94aa43913ec3601e2fd08` | não enviado | 05/10/2026 |
| 0.5.0 | 5000 | `024b2ed89a9b32c3b1c09973827c47f041671a3d821a3949bc66f5d31cef0efd` | não enviado | 06/10/2026 |

Ao enviar um pacote ao Play Console, troque "não enviado" pela trilha (teste interno, teste fechado, produção) e a data.

## Como gerar

```bash
source scripts/android/ambiente.sh
node scripts/android/versao.mjs
npx tauri android build --aab --target aarch64 --target armv7 --target x86_64
node scripts/android/conferir-aab.mjs
```

O pacote sai em `$TT_GRADLE_SAIDAS/app/outputs/bundle/universalRelease/app-universal-release.aab`.

## A chave de upload

- Fica **fora do repositório**, em `~/.config/tomatito/android/`: `upload.jks` (a chave) e `keystore.properties` (a senha e o caminho), os dois com permissão 600.
- **Guarde uma cópia dos dois arquivos num gerenciador de senhas.** Sem ela não dá para enviar atualizações do app (a Play permite pedir a troca da chave de upload, mas é um processo com o suporte).
- Na Play, o **Play App Signing** guarda a chave definitiva do app; esta é só a de envio.
- Sem o `keystore.properties`, o build de release falha com uma mensagem clara. Para um build sem assinatura (teste): `TOMATITO_SEM_ASSINATURA=1`.
