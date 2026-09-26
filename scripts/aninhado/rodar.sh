#!/bin/bash
# Teste do Tomatito Full num GNOME Shell aninhado, sem tela (spike, M04).
#
# Sobe um GNOME Shell 50 headless (o mesmo Mutter da sessão), com monitor
# virtual de 1920x1080, e roda o app de debug nele. O roteiro auto.js confere a
# transparência pelos pixels, arrasta a janela e clica nos botões com um
# ponteiro virtual. Nada aparece na tela da sessão de verdade.
#
#   bash scripts/aninhado/rodar.sh                # teste completo
#   TT_SO_TAMANHO=1 bash scripts/aninhado/rodar.sh # só mede a janela
#
# Pré-requisitos: `npm run build` não é preciso (usa o Vite), mas o binário de
# debug sim: `cd src-tauri && cargo build`. A porta 5173 precisa estar livre.
#
# Isolamento: tudo roda num escopo do systemd do usuário (morto no fim), com
# XDG_* próprios, GSettings em memória (não toca no dconf), um barramento de
# sessão novo e um barramento de sistema falso, sem logind nem GDM (o shell
# aninhado não mexe na sessão de verdade). O XDG_RUNTIME_DIR fica num
# diretório curto em /tmp porque o caminho do socket Wayland tem limite de 108
# bytes; ele é apagado no fim. A saída vai para $TT_OUT ou um diretório
# temporário, impresso no fim, com resultado.json, as capturas e os logs.
set -u
AQUI=$(cd "$(dirname "$0")" && pwd)
RAIZ=$(cd "$AQUI/../.." && pwd)

if [ -z "${TT_DENTRO_DO_ESCOPO:-}" ]; then
  UNIDADE=tt-aninhado-$$
  TT_DENTRO_DO_ESCOPO=1 systemd-run --user --scope --quiet --unit="$UNIDADE" -- timeout 300 bash "$0" "$@"
  CODIGO=$?
  systemctl --user stop "$UNIDADE.scope" 2>/dev/null
  exit $CODIGO
fi

export TT_OUT=${TT_OUT:-$(mktemp -d "${TMPDIR:-/tmp}/tomatito-aninhado-XXXXXX")}
mkdir -p "$TT_OUT"
export SONDA_LOG=$TT_OUT/sonda.jsonl
: > "$SONDA_LOG"
TARGET=$(cd "$RAIZ/src-tauri" && cargo metadata --format-version 1 --no-deps 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).target_directory))')
export TOMATITO_BIN=${TOMATITO_BIN:-$TARGET/debug/tomatito}
[ -x "$TOMATITO_BIN" ] || { echo "falta o binário de debug: $TOMATITO_BIN (cargo build)"; exit 1; }

RUNDIR=$(mktemp -d /tmp/tt-XXXXXX)
chmod 700 "$RUNDIR"
ISO=$TT_OUT/iso
mkdir -p "$ISO"/{config,cache,data,state}
export XDG_RUNTIME_DIR=$RUNDIR XDG_CONFIG_HOME=$ISO/config XDG_CACHE_HOME=$ISO/cache \
  XDG_DATA_HOME=$ISO/data XDG_STATE_HOME=$ISO/state
export GSETTINGS_BACKEND=memory XDG_CURRENT_DESKTOP=GNOME XDG_SESSION_TYPE=wayland NO_AT_BRIDGE=1
unset WAYLAND_DISPLAY DISPLAY XDG_SESSION_DESKTOP GNOME_SHELL_SESSION_MODE DBUS_SESSION_BUS_ADDRESS
# Mesa (Intel) para o shell e para o app; o EGL da NVIDIA fica de fora.
export __EGL_VENDOR_LIBRARY_FILENAMES=/usr/share/glvnd/egl_vendor.d/50_mesa.json

dbus-daemon --session --address="unix:path=$RUNDIR/sistema" --nofork --nopidfile > "$TT_OUT/sistema.log" 2>&1 &
SISTEMA=$!
export DBUS_SYSTEM_BUS_ADDRESS="unix:path=$RUNDIR/sistema"

cd "$RAIZ"
node node_modules/vite/bin/vite.js --config "$AQUI/sonda.config.mjs" > "$TT_OUT/vite.log" 2>&1 &
VITE=$!
for _ in $(seq 100); do curl -sf http://localhost:5173/tomato.html > /dev/null && break; sleep 0.2; done

dbus-run-session -- bash "$AQUI/dentro.sh" > "$TT_OUT/dbus.log" 2>&1

kill $VITE $SISTEMA 2>/dev/null
sleep 0.5
rm -rf "$RUNDIR" "$ISO"
node "$AQUI/resumo.mjs" "$TT_OUT"
