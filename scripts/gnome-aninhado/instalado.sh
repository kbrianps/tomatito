#!/bin/bash
# O Tomatito instalado pelo scripts/instalar-uso-diario.sh num GNOME Shell
# aninhado (M21b): a janela aparece e é desenhada, o shell a casa com o
# Tomatito.desktop (o que o dock e o Alt+Tab usam) e fechar encerra o app.
# Nada aparece na tela da sessão de verdade.
#
#   bash scripts/gnome-aninhado/instalado.sh [caminho do AppImage]
set -u
AQUI=$(cd "$(dirname "$0")" && pwd)
DADOS=${XDG_DATA_HOME:-$HOME/.local/share}
BIN=${1:-$HOME/.local/bin/Tomatito.AppImage}
[ -x "$BIN" ] || { echo "falta o Tomatito instalado: $BIN (bash scripts/instalar-uso-diario.sh)"; exit 1; }
[ -f "$DADOS/applications/Tomatito.desktop" ] || { echo "falta o $DADOS/applications/Tomatito.desktop"; exit 1; }
EXTRAS=$(mktemp -d "${TMPDIR:-/tmp}/tomatito-extras-XXXXXX")
trap 'rm -rf "$EXTRAS"' EXIT
mkdir -p "$EXTRAS/applications" "$EXTRAS/icons"
cp "$DADOS/applications/Tomatito.desktop" "$EXTRAS/applications/"
cp -r "$DADOS/icons/hicolor" "$EXTRAS/icons/"
TOMATITO_BIN=$BIN TT_DADOS_EXTRAS=$EXTRAS TT_ESPERA_DESKTOP=1 TT_LIMITE=${TT_LIMITE:-120} \
  bash "$AQUI/rodar.sh" instalado
