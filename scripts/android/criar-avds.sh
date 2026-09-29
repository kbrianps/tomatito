#!/usr/bin/env bash
# Cria (ou recria, com --recriar) os três AVDs do Tomatito em $ANDROID_AVD_HOME
# (PLANO-ANDROID, A02), todos a partir do perfil pixel_5 e com a tela das
# capturas da loja (8.2): 1080 × 1920 a 420 dpi, que cabe no limite de 2:1.
#
#   tt37   Android 17 (API 37.0), google_apis, x86_64
#   tt37k  o mesmo, com o kernel de páginas de 16 KB (google_apis_ps16k)
#   tt31   Android 12 (API 31), google_apis, x86_64
#
#   bash scripts/android/criar-avds.sh [--recriar]
set -euo pipefail
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=ambiente.sh
source "$AQUI/ambiente.sh"

declare -A IMAGEM=(
  [tt37]="system-images;android-37.0;google_apis;x86_64"
  [tt37k]="system-images;android-37.0;google_apis_ps16k;x86_64"
  [tt31]="system-images;android-31;google_apis;x86_64"
)

# Chaves do config.ini que diferem do perfil pixel_5. Sem cartão SD (o arquivo
# de 512 MB não serve a nada aqui) e sem moldura; a memória vem do -memory
# 2048 do emulador.mjs, mas fica também aqui para quem abrir o AVD à mão.
AJUSTES=(
  "hw.lcd.width=1080"
  "hw.lcd.height=1920"
  "hw.lcd.density=420"
  "hw.ramSize=2048M"
  "hw.sdCard=no"
  "showDeviceFrame=no"
  "disk.dataPartition.size=6G"
)

for nome in tt37 tt37k tt31; do
  if [ -f "$ANDROID_AVD_HOME/$nome.ini" ] && [ "${1:-}" != "--recriar" ]; then
    echo "$nome: já existe (use --recriar para refazer)"
  else
    echo no | avdmanager create avd --force -n "$nome" -k "${IMAGEM[$nome]}" -d pixel_5 >/dev/null
    echo "$nome: criado"
  fi
  cfg="$ANDROID_AVD_HOME/$nome.avd/config.ini"
  for par in "${AJUSTES[@]}"; do
    chave="${par%%=*}"
    if grep -q "^${chave//./\\.}=" "$cfg"; then
      sed -i "s|^${chave//./\\.}=.*|$par|" "$cfg"
    else
      echo "$par" >>"$cfg"
    fi
  done
  rm -f "$ANDROID_AVD_HOME/$nome.avd/sdcard.img"
done

# Nada pode ter ido para o ~/.android/avd (os AVDs moram no kit, no /).
if [ -d "$HOME/.android/avd" ] && [ -n "$(ls -A "$HOME/.android/avd")" ]; then
  echo "aviso: há AVDs em ~/.android/avd (não são desta faixa)" >&2
fi
ls -1 "$ANDROID_AVD_HOME"
