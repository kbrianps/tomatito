#!/bin/bash
# Parte do rodar.sh que roda dentro do dbus-run-session: sobe o GNOME Shell
# headless com o roteiro auto.js e o Tomatito conectado a ele.
AQUI=$(dirname "$0")
gnome-shell --headless --wayland --no-x11 --wayland-display=tt-aninhado \
  --virtual-monitor 1920x1080 --automation-script="$AQUI/auto.js" > "$TT_OUT/shell.log" 2>&1 &
SHELL_PID=$!
for _ in $(seq 150); do [ -S "$XDG_RUNTIME_DIR/tt-aninhado" ] && break; sleep 0.2; done
WAYLAND_DISPLAY=tt-aninhado GDK_BACKEND=wayland WAYLAND_DEBUG=client \
  "$TOMATITO_BIN" > "$TT_OUT/app.log" 2>&1 &
APP_PID=$!
# O shell sai sozinho no fim do roteiro; o limite é só uma rede de proteção.
for _ in $(seq 900); do kill -0 $SHELL_PID 2>/dev/null || break; sleep 0.2; done
kill $APP_PID $SHELL_PID 2>/dev/null
sleep 1
kill -9 $APP_PID $SHELL_PID 2>/dev/null
exit 0
