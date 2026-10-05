# Atualizações (v0.3)

Três caminhos, conforme a instalação:

| Instalação | Como atualiza |
| --- | --- |
| Windows (`.exe` ou `.msi`) | Por dentro do app: Configurações → Atualização. |
| Linux, AppImage | Por dentro do app: Configurações → Atualização. |
| Linux, `.deb` | Pelo atualizador do sistema (APT) ou por dentro do app. |
| Android | Pela Google Play. |
| Web | O próprio navegador baixa a versão nova (cartão "Atualizar"). |

## Por dentro do app

O código está em `src-tauri/src/update.rs` e `src/views/atualizar-app.js`.

- O Tomatito só consulta a internet quando a pessoa clica em **Procurar
  atualizações** ou liga **Procurar ao abrir** (a chave `autoUpdate`,
  desligada por padrão).
- A consulta lê `https://github.com/kbrianps/tomatito/releases/latest/download/latest.json`,
  que o `release.yml` gera junto com os instaladores. Só vale o release
  **publicado** (o rascunho não aparece).
- O instalador baixado é conferido com a chave pública do `tauri.conf.json`
  (`plugins.updater.pubkey`) antes de ser usado.
- Depois de instalar, o app reinicia. Uma sessão de foco em andamento volta
  pela retomada, como em qualquer reinício.
- No `.deb`, a instalação pede a senha de administrador (pelo `pkexec`).

### A chave de assinatura

A chave privada fica **fora do repositório**, em
`~/.config/tomatito/updater/` (`tomatito.key` e `senha.txt`), e nos segredos
do GitHub `TAURI_SIGNING_PRIVATE_KEY` e `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
Quem perde essa chave não consegue mais publicar atualizações que as
instalações existentes aceitem: guarde uma cópia num gerenciador de senhas.

Para gerar os instaladores assinados sem o GitHub:

```bash
export TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.config/tomatito/updater/tomatito.key)"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="$(cat ~/.config/tomatito/updater/senha.txt)"
npx tauri build --bundles deb appimage --config src-tauri/tauri.release.conf.json
```

Sem o `tauri.release.conf.json`, o build não assina nada e não precisa da
chave (é assim no CI comum e no `scripts/instalar-uso-diario.sh`).

## Pelo atualizador do Ubuntu (APT)

O `.deb` instala dois arquivos (`bundle.linux.deb.files`):

- `/etc/apt/sources.list.d/tomatito.sources`: a fonte
  `https://kbrianps.github.io/tomatito/apt`, suíte `stable`;
- `/usr/share/keyrings/tomatito-archive-keyring.gpg`: a chave pública que
  confere o repositório.

Basta instalar o `.deb` uma vez. Daí em diante, o "Atualizador de programas"
(ou `sudo apt update && sudo apt upgrade`) traz as versões novas.

O repositório é refeito pelo `.github/workflows/apt.yml` cada vez que um
release é **publicado**: ele baixa o `.deb` do release, roda o
`scripts/apt/montar-repo.sh`, assina e publica na branch `gh-pages`.

A chave privada do repositório também fica fora do repositório, em
`~/.config/tomatito/apt/` (`chave-privada.asc`), e no segredo
`APT_GPG_PRIVATE_KEY`. A impressão digital é
`EF17 A4B6 C89A F256 2AF5  9BBF 7EA1 0ED4 DBA4 343B`.

Para parar de receber por esse caminho, apague o arquivo `tomatito.sources`
ou troque `Enabled: yes` por `Enabled: no`.
