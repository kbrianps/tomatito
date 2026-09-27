#!/bin/bash
# Parte do rodar.sh que roda dentro do dbus-run-session: sobe o GNOME Shell
# headless com o roteiro e o Tomatito conectado a ele (ou deixa o roteiro abrir
# o app, se TT_APP_PELO_ROTEIRO estiver definida). No fim, anota se o app saiu
# sozinho (o roteiro do M07 termina clicando em Fechar).
AQUI=$(dirname "$0")
gnome-shell --headless --wayland --no-x11 --wayland-display=tt-aninhado \
  --virtual-monitor 1920x1080 --automation-script="$TT_ROTEIRO" > "$TT_OUT/shell.log" 2>&1 &
SHELL_PID=$!
for _ in $(seq 150); do [ -S "$XDG_RUNTIME_DIR/tt-aninhado" ] && break; sleep 0.2; done
if [ -n "${TT_APP_PELO_ROTEIRO:-}" ]; then
  # O roteiro abre o app sozinho (M08: várias partidas a frio).
  APP_PID=
else
  WAYLAND_DISPLAY=tt-aninhado GDK_BACKEND=wayland WAYLAND_DEBUG=client \
    "$TOMATITO_BIN" > "$TT_OUT/app.log" 2>&1 &
  APP_PID=$!
fi
# O shell sai sozinho no fim do roteiro; o limite é só uma rede de proteção.
for _ in $(seq $(( ${TT_LIMITE:-300} * 5 ))); do kill -0 $SHELL_PID 2>/dev/null || break; sleep 0.2; done
if [ -z "$APP_PID" ]; then
  echo "aberto pelo roteiro" > "$TT_OUT/app-estado.txt"
elif kill -0 $APP_PID 2>/dev/null; then
  echo "rodando" > "$TT_OUT/app-estado.txt"
else
  wait $APP_PID
  echo "saiu $?" > "$TT_OUT/app-estado.txt"
fi
kill $APP_PID $SHELL_PID 2>/dev/null
sleep 1
kill -9 $APP_PID $SHELL_PID 2>/dev/null
# Um app aberto pelo roteiro que tenha ficado para trás está no mesmo escopo
# do systemd, que o rodar.sh para no fim da rodada.
exit 0
