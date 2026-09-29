#!/bin/bash
# O Tomatito instalado num GNOME Shell aninhado (M21b e M45): a janela aparece
# e é desenhada, o shell a casa com o Tomatito.desktop (o que o dock e o
# Alt+Tab usam), fechar a esconde (bandeja), abrir de novo a mostra (instância
# única) e o Ctrl+Q encerra o app. Nada aparece na tela da sessão de verdade.
#
#   bash scripts/gnome-aninhado/instalado.sh [caminho do AppImage]   # o de ~/.local (instalar-uso-diario.sh)
#   bash scripts/gnome-aninhado/instalado.sh --deb [caminho do .deb] # o .deb, sem instalar: o binário,
#                                                                    # o .desktop e os ícones do pacote
set -u
AQUI=$(cd "$(dirname "$0")" && pwd)
RAIZ=$(cd "$AQUI/../.." && pwd)
DADOS=${XDG_DATA_HOME:-$HOME/.local/share}
EXTRAS=$(mktemp -d "${TMPDIR:-/tmp}/tomatito-extras-XXXXXX")
PACOTE=$(mktemp -d "${TMPDIR:-/tmp}/tomatito-deb-XXXXXX")
trap 'rm -rf "$EXTRAS" "$PACOTE"' EXIT
mkdir -p "$EXTRAS/applications" "$EXTRAS/icons"

if [ "${1:-}" = "--deb" ]; then
  DEB=${2:-}
  if [ -z "$DEB" ]; then
    ALVO=$(sed -n 's/^[[:space:]]*target-dir[[:space:]]*=[[:space:]]*"\(.*\)"/\1/p' "$RAIZ/.cargo/config.toml" 2>/dev/null | head -n1)
    VERSAO=$(sed -n 's/^version[[:space:]]*=[[:space:]]*"\(.*\)"/\1/p' "$RAIZ/src-tauri/Cargo.toml" | head -n1)
    DEB=${ALVO:-$RAIZ/src-tauri/target}/release/bundle/deb/Tomatito_${VERSAO}_amd64.deb
  fi
  [ -f "$DEB" ] || { echo "falta o .deb: $DEB (npx tauri build --bundles deb)"; exit 1; }
  dpkg-deb -x "$DEB" "$PACOTE"
  BIN=$PACOTE/usr/bin/tomatito
  # O Exec do pacote é `tomatito` (no PATH, em /usr/bin); aqui, o binário extraído.
  sed "s|^Exec=.*|Exec=$BIN|" "$PACOTE/usr/share/applications/Tomatito.desktop" > "$EXTRAS/applications/Tomatito.desktop"
  cp -r "$PACOTE/usr/share/icons/hicolor" "$EXTRAS/icons/"
else
  BIN=${1:-$HOME/.local/bin/Tomatito.AppImage}
  [ -x "$BIN" ] || { echo "falta o Tomatito instalado: $BIN (bash scripts/instalar-uso-diario.sh)"; exit 1; }
  [ -f "$DADOS/applications/Tomatito.desktop" ] || { echo "falta o $DADOS/applications/Tomatito.desktop"; exit 1; }
  cp "$DADOS/applications/Tomatito.desktop" "$EXTRAS/applications/"
  # -a: com as datas, para o icon-theme.cache da pasta (se houver) valer ou
  # não valer como na sessão de verdade.
  cp -a "$DADOS/icons/hicolor" "$EXTRAS/icons/"
fi
[ -x "$BIN" ] || { echo "binário ausente: $BIN"; exit 1; }
TOMATITO_BIN=$BIN TT_DADOS_EXTRAS=$EXTRAS TT_ESPERA_DESKTOP=1 TT_LIMITE=${TT_LIMITE:-150} \
  bash "$AQUI/rodar.sh" instalado
