#!/usr/bin/env bash
# Ambiente Android do Tomatito (PLANO-ANDROID, 3.3 e 6). Para usar:
#
#   source scripts/android/ambiente.sh [--emulador]
#   bash scripts/android/ambiente.sh [--emulador]      # só confere
#
# Lê o ~/.config/tomatito/android.env (A01) e confere ANDROID_HOME, NDK_HOME,
# adb e BUNDLETOOL. Com --emulador, confere também o emulador e o KVM
# (`emulator -accel-check`): o /dev/kvm vem de uma ACL do logind que só existe
# com a sessão gráfica ativa (3.1).
#
# Portas próprias (A02): o servidor do adb desta faixa escuta na 5041, e não na
# 5037, onde já roda o adb do pacote do sistema (de outra versão; um adb do kit
# na 5037 derrubaria aquele). O emulador usa a porta de console 5620 (adb na
# 5621), fora da faixa 5554–5585 que os servidores do adb varrem sozinhos: o
# adb da 5037 não enxerga o nosso emulador.

_tt_env="${TT_ANDROID_ENV:-$HOME/.config/tomatito/android.env}"
if [ ! -r "$_tt_env" ]; then
  echo "ambiente.sh: falta $_tt_env (rode o A01, PLANO-ANDROID 3.3)" >&2
  return 1 2>/dev/null || exit 1
fi
# shellcheck disable=SC1090
source "$_tt_env"

export ANDROID_ADB_SERVER_PORT="${ANDROID_ADB_SERVER_PORT:-5041}"
export TT_EMU_PORTA="${TT_EMU_PORTA:-5620}"
export ANDROID_SERIAL="emulator-$TT_EMU_PORTA"

_tt_confere() {
  local v
  for v in TT_ANDROID ANDROID_HOME NDK_HOME ANDROID_AVD_HOME ANDROID_USER_HOME GRADLE_USER_HOME BUNDLETOOL; do
    [ -n "${!v}" ] || { echo "ambiente.sh: $v vazio no $_tt_env" >&2; return 1; }
  done
  case "$(readlink -f "$ANDROID_HOME")" in
    /opt/*) ;;
    *) echo "ambiente.sh: ANDROID_HOME fora do /opt ($ANDROID_HOME)" >&2; return 1 ;;
  esac
  [ -d "$NDK_HOME/toolchains/llvm" ] || { echo "ambiente.sh: NDK ausente em $NDK_HOME" >&2; return 1; }
  [ -f "$BUNDLETOOL" ] || { echo "ambiente.sh: bundletool ausente em $BUNDLETOOL" >&2; return 1; }
  [ "$(command -v adb)" = "$ANDROID_HOME/platform-tools/adb" ] \
    || { echo "ambiente.sh: o adb no PATH não é o do kit ($(command -v adb))" >&2; return 1; }
  mkdir -p "$ANDROID_AVD_HOME" "$TT_ANDROID/logs"
  if [ "${1:-}" = "--emulador" ]; then
    [ "$(command -v emulator)" = "$ANDROID_HOME/emulator/emulator" ] \
      || { echo "ambiente.sh: o emulator no PATH não é o do kit" >&2; return 1; }
    if ! emulator -accel-check 2>&1 | grep -q 'is installed and usable'; then
      echo "ambiente.sh: sem KVM: abra a sessão gráfica ou rode \`sudo usermod -aG kvm $USER\` (e saia e entre de novo)" >&2
      return 1
    fi
  fi
  return 0
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  _tt_confere "${1:-}" || exit 1
  echo "ambiente ok: ANDROID_HOME=$ANDROID_HOME adb=:$ANDROID_ADB_SERVER_PORT serial=$ANDROID_SERIAL"
else
  _tt_confere "${1:-}" || return 1
fi
