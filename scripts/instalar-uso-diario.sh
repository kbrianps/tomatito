#!/usr/bin/env bash
# Instala o Tomatito de uso diário na pasta do usuário, sem sudo (M21b).
#
#   bash scripts/instalar-uso-diario.sh             # gera o .deb e o AppImage e instala
#   bash scripts/instalar-uso-diario.sh --sem-build # só instala o que já foi gerado
#   bash scripts/instalar-uso-diario.sh --remover   # tira o que este script instalou
#
# O que vai para ~/.local (docs/decisoes.md, M21b):
#   bin/Tomatito.AppImage
#   share/applications/Tomatito.desktop   (o do .deb, com o Exec apontando para o AppImage)
#   share/icons/hicolor/*/apps/tomatito.png
#
# A pasta de dados é a do ID de uso diário, ~/.local/share/io.github.kbrianps.tomatito.
# O `npm run dev:app` usa a do `.dev`. Instalar o .deb com o apt (sudo) é a outra
# forma; as duas não devem ficar juntas (docs/pendencias-usuario.md).
set -euo pipefail

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dados="${XDG_DATA_HOME:-$HOME/.local/share}"
bin="$HOME/.local/bin"
apps="$dados/applications"
icones="$dados/icons/hicolor"

remover() {
  rm -f "$bin/Tomatito.AppImage" "$apps/Tomatito.desktop"
  find "$icones" -path '*/apps/tomatito.png' -delete 2>/dev/null || true
  command -v update-desktop-database >/dev/null && update-desktop-database -q "$apps" || true
  echo "Tomatito removido de ~/.local (a pasta de dados ficou)."
}

build=1
case "${1:-}" in
  --sem-build) build=0 ;;
  --remover) remover; exit 0 ;;
  '') ;;
  *) echo "uso: $0 [--sem-build | --remover]" >&2; exit 2 ;;
esac

# target-dir: CARGO_TARGET_DIR, a .cargo/config.toml (fora do git) ou o padrão.
alvo="${CARGO_TARGET_DIR:-}"
if [[ -z "$alvo" && -f "$raiz/.cargo/config.toml" ]]; then
  alvo="$(sed -n 's/^[[:space:]]*target-dir[[:space:]]*=[[:space:]]*"\(.*\)"/\1/p' "$raiz/.cargo/config.toml" | head -n1)"
fi
alvo="${alvo:-$raiz/src-tauri/target}"

versao="$(sed -n 's/^version[[:space:]]*=[[:space:]]*"\(.*\)"/\1/p' "$raiz/src-tauri/Cargo.toml" | head -n1)"
bundle="$alvo/release/bundle"
deb="$bundle/deb/Tomatito_${versao}_amd64.deb"
appimage="$bundle/appimage/Tomatito_${versao}_amd64.AppImage"

if (( build )); then
  (cd "$raiz" && npx tauri build --bundles deb appimage)
fi

for f in "$deb" "$appimage"; do
  [[ -f "$f" ]] || { echo "não achei $f; rode sem --sem-build" >&2; exit 1; }
done

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
dpkg-deb -x "$deb" "$tmp"

mkdir -p "$bin" "$apps" "$icones"
install -m 755 "$appimage" "$bin/Tomatito.AppImage.novo"
mv -f "$bin/Tomatito.AppImage.novo" "$bin/Tomatito.AppImage"

# Ícones do .deb (os mesmos tamanhos que o apt instalaria em /usr/share). O
# Tauri 2.12 põe o de 256 px em `256x256@2`, que não é um nome do tema hicolor
# (o certo seria `@2x`) e que nenhum programa lê: fica de fora.
for dir in "$tmp"/usr/share/icons/hicolor/*/; do
  tam="$(basename "$dir")"
  [[ "$tam" =~ ^[0-9]+x[0-9]+(@2x)?$ ]] || continue
  mkdir -p "$icones/$tam/apps"
  install -m 644 "$dir/apps/tomatito.png" "$icones/$tam/apps/tomatito.png"
done

# O .desktop do .deb, trocando só o Exec: o nome (Tomatito.desktop), o Icon
# (tomatito) e o StartupWMClass (tomatito) ficam como no pacote, e é por eles
# que o GNOME casa a janela e as notificações (PLANO.md, 3.8; decisoes.md, M21).
sed -e "s|^Exec=.*|Exec=\"$bin/Tomatito.AppImage\"|" \
    -e "s|^TryExec=.*|TryExec=$bin/Tomatito.AppImage|" \
    "$tmp/usr/share/applications/Tomatito.desktop" > "$apps/Tomatito.desktop"
chmod 644 "$apps/Tomatito.desktop"

command -v update-desktop-database >/dev/null && update-desktop-database -q "$apps" || true
touch "$icones"

echo "Tomatito $versao instalado:"
echo "  $bin/Tomatito.AppImage"
echo "  $apps/Tomatito.desktop"
echo "O .deb para o apt ficou em $deb"
