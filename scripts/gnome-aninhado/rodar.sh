#!/bin/bash
# Teste da janela main num GNOME Shell aninhado, sem tela (M07 em diante).
#
# Sobe um GNOME Shell 50 headless (o mesmo Mutter da sessão), com monitor
# virtual de 1920x1080, e roda nele o binário de debug do app. Um roteiro de
# automação (roteiros/*.js) roda dentro do shell: mexe na janela com ponteiro
# e teclado virtuais, tira capturas e grava resultado.json. O resumo.mjs junta
# isso ao que o app pediu ao compositor (WAYLAND_DEBUG) e sai com código 1 se
# algo falhar. Nada aparece na tela da sessão de verdade.
#
#   bash scripts/gnome-aninhado/rodar.sh barra-de-titulo   # roteiro do M07
#   bash scripts/gnome-aninhado/rodar.sh partida-a-frio    # roteiro do M08
#   TT_TEMA=dark bash scripts/gnome-aninhado/rodar.sh partida-a-frio   # M23: com um settings.json no Escuro
#   bash scripts/gnome-aninhado/rodar.sh aparencia         # M24: troca de tema, reinício e theme()
#   bash scripts/gnome-aninhado/rodar.sh sistema           # M25: seguir o sistema, com um portal falso
#   bash scripts/gnome-aninhado/rodar.sh estatisticas      # M26: períodos no SQLite e o stats_get
#   bash scripts/gnome-aninhado/rodar.sh progresso         # M27: o cartão "Progresso diário" e o reinício
#   bash scripts/gnome-aninhado/rodar.sh meta              # M28: o diálogo "Editar meta diária"
#   bash scripts/gnome-aninhado/rodar.sh tarefas           # M29: os comandos task_* e a virada do dia
#   bash scripts/gnome-aninhado/rodar.sh cartao-tarefas    # M30: o cartão "Tarefas", da tela ao banco
#   TOMATITO_SPEED=10 bash scripts/gnome-aninhado/rodar.sh temporizador   # M32: a tela Temporizador, do clique à notificação
#   bash scripts/gnome-aninhado/rodar.sh temporizador-edicao   # M33: criar, editar e excluir, com o state.json
#   bash scripts/gnome-aninhado/rodar.sh cronometro        # M34: o cronômetro, minimizado e escondido, com o state.json
#   bash scripts/gnome-aninhado/rodar.sh voltas            # M35: as voltas, o Copiar na área de transferência e o LibreOffice
#   TT_PIPEWIRE=/run/user/$UID bash scripts/gnome-aninhado/rodar.sh bandeja   # M36: o menu da bandeja pelo D-Bus, fechar para a bandeja e Sair
#   TT_BIN_BUILD=<cópia do build:debug> bash scripts/gnome-aninhado/rodar.sh instancia   # M37: segunda instância, Ctrl+W, Ctrl+Q, window-state e o build sem menu nem recarga
#   bash scripts/gnome-aninhado/rodar.sh configuracoes     # M38: períodos, sons e volume, do clique ao fim de fase (sem saída de áudio)
#   bash scripts/gnome-aninhado/rodar.sh config-sistema    # M39: fechar para a bandeja, tempo na bandeja, Sair, Sobre e os recursos
#   TT_LIMITE=480 bash scripts/gnome-aninhado/rodar.sh retomada   # M40: kill -9 no meio do foco, fase vencida com o app fechado, e fechar e reabrir
#   bash scripts/gnome-aninhado/instalado.sh               # o Tomatito instalado (M21b)
#
# Pré-requisito: o binário de debug atualizado (`cd src-tauri && cargo build`).
# O `npm run build` não é preciso: a página vem do Vite (porta 5173, que
# precisa estar livre), com a sonda injetada só nesse servidor. Para testar um
# build com os arquivos embutidos (`npx tauri build --debug --no-bundle`), aponte
# TOMATITO_BIN para uma cópia dele; o Vite continua subindo, mas fica sem uso.
#
# Um roteiro com a linha `export const LANCA_O_APP = true;` abre o app
# sozinho (quantas vezes quiser); sem ela, o dentro.sh abre o app uma vez. O
# resumo é o resumo-<roteiro>.mjs, se existir, ou o resumo.mjs. TT_LIMITE (em
# segundos, padrão 300) é o prazo da rodada inteira.
#
# Derivado do teste do spike (scripts/aninhado, na branch spike/full), com o
# mesmo isolamento: tudo roda num escopo do systemd do usuário (morto no fim),
# com XDG_* próprios, GSettings em memória (não toca no dconf), um barramento
# de sessão novo e um barramento de sistema falso, sem logind nem GDM. O
# XDG_RUNTIME_DIR fica num diretório curto em /tmp (o caminho do socket
# Wayland tem limite de 108 bytes) e é apagado no fim. A saída vai para $TT_OUT
# ou um diretório temporário, impresso no fim, com resultado.json, capturas e
# logs.
set -u
AQUI=$(cd "$(dirname "$0")" && pwd)
RAIZ=$(cd "$AQUI/../.." && pwd)
ROTEIRO=${1:-barra-de-titulo}
[ -f "$AQUI/roteiros/$ROTEIRO.js" ] || { echo "roteiro inexistente: $AQUI/roteiros/$ROTEIRO.js"; exit 2; }

if [ -z "${TT_DENTRO_DO_ESCOPO:-}" ]; then
  UNIDADE=tt-aninhado-$$
  TT_DENTRO_DO_ESCOPO=1 systemd-run --user --scope --quiet --unit="$UNIDADE" -- timeout "${TT_LIMITE:-300}" bash "$0" "$@"
  CODIGO=$?
  systemctl --user stop "$UNIDADE.scope" 2>/dev/null
  exit $CODIGO
fi

# M20: fora do PipeWire, o ALSA do app pode abrir a placa direto; os fins de
# fase dos roteiros tocam a 1%, salvo TOMATITO_VOLUME explícito.
export TOMATITO_VOLUME=${TOMATITO_VOLUME:-1}
export TT_OUT=${TT_OUT:-$(mktemp -d "${TMPDIR:-/tmp}/tomatito-aninhado-XXXXXX")}
mkdir -p "$TT_OUT"
export SONDA_LOG=$TT_OUT/sonda.jsonl
: > "$SONDA_LOG"
TARGET=$(cd "$RAIZ/src-tauri" && cargo metadata --format-version 1 --no-deps 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).target_directory))')
export TOMATITO_BIN=${TOMATITO_BIN:-$TARGET/debug/tomatito}
[ -x "$TOMATITO_BIN" ] || { echo "falta o binário de debug: $TOMATITO_BIN (cargo build)"; exit 1; }
export TT_ROTEIRO=$AQUI/roteiros/$ROTEIRO.js
grep -q '^export const LANCA_O_APP = true;' "$TT_ROTEIRO" && export TT_APP_PELO_ROTEIRO=1
export TT_NODE=$(command -v node) TT_CONSOLE_MJS=$AQUI/console.mjs
# O Vite sobe direto, sem o `npm run dev`: o predev (tokens do Fluent, M11) roda aqui.
node "$RAIZ/scripts/build-theme-css.mjs" > "$TT_OUT/tokens.log" 2>&1 || { cat "$TT_OUT/tokens.log"; exit 1; }

RUNDIR=$(mktemp -d /tmp/tt-XXXXXX)
chmod 700 "$RUNDIR"
ISO=$TT_OUT/iso
mkdir -p "$ISO"/{config,cache,data,state}
# M21b: TT_DADOS_EXTRAS é uma pasta no formato de ~/.local/share (com
# applications/ e icons/) copiada para o XDG_DATA_HOME da rodada, para o shell
# achar o .desktop do Tomatito instalado e casar a janela com ele.
[ -n "${TT_DADOS_EXTRAS:-}" ] && cp -r "$TT_DADOS_EXTRAS"/. "$ISO/data/"
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
for _ in $(seq 100); do curl -sf http://localhost:5173/ > /dev/null && break; sleep 0.2; done

dbus-run-session -- bash "$AQUI/dentro.sh" > "$TT_OUT/dbus.log" 2>&1

kill $VITE $SISTEMA 2>/dev/null
sleep 0.5
rm -rf "$RUNDIR" "$ISO"
RESUMO=$AQUI/resumo-$ROTEIRO.mjs
[ -f "$RESUMO" ] || RESUMO=$AQUI/resumo.mjs
node "$RESUMO" "$TT_OUT"
