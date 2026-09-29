#!/bin/bash
# M46: o Sobre mostrando os avisos que estão no .deb, num GNOME Shell
# aninhado. Extrai o .deb numa pasta temporária e põe o binário de debug (com a
# página do Vite e a sonda) no lugar do binário do pacote: o Tauri procura os
# recursos em ../lib/Tomatito a partir do binário, que é onde o .deb instala o
# THIRD_PARTY_NOTICES.md e o OFL-Inter.txt (/usr/lib/Tomatito). O roteiro
# avisos confere o que a tela mostra contra esses arquivos e, de controle, a
# tela sem a pasta. Nada aparece na tela da sessão de verdade.
#
#   npx tauri build --bundles deb && (cd src-tauri && cargo build)
#   bash scripts/gnome-aninhado/avisos.sh [caminho do .deb]
set -u
AQUI=$(cd "$(dirname "$0")" && pwd)
RAIZ=$(cd "$AQUI/../.." && pwd)
TARGET=$(cd "$RAIZ/src-tauri" && cargo metadata --format-version 1 --no-deps 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).target_directory))')
DEB=${1:-$TARGET/release/bundle/deb/Tomatito_0.1.0_amd64.deb}
DEBUG=$TARGET/debug/tomatito
[ -f "$DEB" ] || { echo "falta o .deb: $DEB (npx tauri build --bundles deb)"; exit 1; }
[ -x "$DEBUG" ] || { echo "falta o binário de debug: $DEBUG (cargo build)"; exit 1; }
PACOTE=$(mktemp -d "${TMPDIR:-/tmp}/tomatito-deb-XXXXXX")
trap 'rm -rf "$PACOTE"' EXIT
dpkg-deb -x "$DEB" "$PACOTE" || exit 1
[ -f "$PACOTE/usr/lib/Tomatito/THIRD_PARTY_NOTICES.md" ] || { echo "o .deb não tem usr/lib/Tomatito/THIRD_PARTY_NOTICES.md"; exit 1; }
cp "$DEBUG" "$PACOTE/usr/bin/tomatito"
TOMATITO_BIN=$PACOTE/usr/bin/tomatito TT_AVISOS_RECURSOS=$PACOTE/usr/lib/Tomatito TT_LIMITE=${TT_LIMITE:-180} \
  bash "$AQUI/rodar.sh" avisos
