#!/usr/bin/env bash
# Constrói o APK da sonda de som (A02) sem Gradle: javac + d8 + aapt2 +
# zipalign + apksigner, com o android.jar da plataforma 37.0 do kit. Saída e
# chave de depuração ficam no kit ($TT_ANDROID/saidas/sonda-som), fora do /home.
#
#   bash scripts/android/sonda-som/construir.sh     # imprime o caminho do APK
set -euo pipefail
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../ambiente.sh
source "$AQUI/../ambiente.sh"

BT="$ANDROID_HOME/build-tools/37.0.0"
JAR="$ANDROID_HOME/platforms/android-37.0/android.jar"
OUT="$TT_ANDROID/saidas/sonda-som"
rm -rf "$OUT/classes" "$OUT/dex" "$OUT/res" && mkdir -p "$OUT/classes" "$OUT/dex" "$OUT/res/raw"

# O som do fim do foco do desktop entra como res/raw/focus_end.wav, como os
# canais do A08 (PLANO-ANDROID 5.5): nada de som padrão do sistema, que numa
# primeira partida ainda nem tem arquivo (docs/android/kit.md).
cp "$AQUI/../../../src-tauri/sounds/focus-end.wav" "$OUT/res/raw/focus_end.wav"
"$BT/aapt2" compile --dir "$OUT/res" -o "$OUT/res.zip"

javac -nowarn --release 17 -classpath "$JAR" -d "$OUT/classes" \
  $(find "$AQUI/src" -name '*.java') 2>&1 | grep -v '^Note:' >&2 || true
"$BT/d8" --min-api 26 --lib "$JAR" --output "$OUT/dex" $(find "$OUT/classes" -name '*.class')
"$BT/aapt2" link -o "$OUT/sem-dex.apk" -I "$JAR" --manifest "$AQUI/AndroidManifest.xml" \
  -R "$OUT/res.zip" --min-sdk-version 26 --target-sdk-version 37
cp "$OUT/sem-dex.apk" "$OUT/sem-assinatura.apk"
(cd "$OUT/dex" && zip -q -j "$OUT/sem-assinatura.apk" classes.dex)
"$BT/zipalign" -f -p 4 "$OUT/sem-assinatura.apk" "$OUT/alinhado.apk"

CHAVE="$OUT/sonda.p12"
if [ ! -f "$CHAVE" ]; then
  keytool -genkeypair -keystore "$CHAVE" -storetype PKCS12 -storepass sondasom -keypass sondasom \
    -alias sonda -keyalg RSA -keysize 2048 -validity 3650 -dname "CN=sonda" >/dev/null 2>&1
fi
"$BT/apksigner" sign --ks "$CHAVE" --ks-pass pass:sondasom --out "$OUT/sonda-som.apk" "$OUT/alinhado.apk"
echo "$OUT/sonda-som.apk"
