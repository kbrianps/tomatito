#!/bin/bash
# Parte do rodar.sh que roda dentro do dbus-run-session: sobe o GNOME Shell
# headless com o roteiro e o Tomatito conectado a ele (ou deixa o roteiro abrir
# o app, se TT_APP_PELO_ROTEIRO estiver definida). No fim, anota se o app saiu
# sozinho (o roteiro do M07 termina clicando em Fechar).
AQUI=$(dirname "$0")
# M57: com TT_X11=1, o shell sobe com o Xwayland (sob demanda), para o
# roteiro x11 (o plano B2); sem ela, sem X11 nenhum, como sempre.
X11=--no-x11
[ -n "${TT_X11:-}" ] && X11=
gnome-shell --headless --wayland $X11 --wayland-display=tt-aninhado \
  --virtual-monitor 1920x1080 --automation-script="$TT_ROTEIRO" > "$TT_OUT/shell.log" 2>&1 &
SHELL_PID=$!
for _ in $(seq 150); do [ -S "$XDG_RUNTIME_DIR/tt-aninhado" ] && break; sleep 0.2; done
# v0.4: o que o app manda à dock (o progresso no ícone, progresso.rs), para os
# resumos conferirem.
dbus-monitor --session "type='signal',interface='com.canonical.Unity.LauncherEntry'" > "$TT_OUT/dock.log" 2>&1 &
if [ -n "${TT_APP_PELO_ROTEIRO:-}" ]; then
  # O roteiro abre o app sozinho (M08: várias partidas a frio).
  APP_PID=
else
  # M20: com TT_PIPEWIRE (a pasta do socket do PipeWire da sessão, em geral
  # /run/user/$UID), só o app fala com o PipeWire de verdade, para o som sair;
  # sem ela, o ALSA não acha o PipeWire (o XDG_RUNTIME_DIR é o da rodada) e
  # pode abrir a placa direto. Com TT_SEM_AUDIO=1, o ALSA fica sem nenhuma
  # configuração e o app, sem saída de áudio (o caminho de erro do M20).
  env WAYLAND_DISPLAY=tt-aninhado GDK_BACKEND=wayland WAYLAND_DEBUG=client \
    ${TT_PIPEWIRE:+PIPEWIRE_RUNTIME_DIR=$TT_PIPEWIRE} \
    ${TT_SEM_AUDIO:+ALSA_CONFIG_PATH=/dev/null} \
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
