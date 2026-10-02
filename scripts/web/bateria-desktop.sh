#!/bin/bash
# Bateria do desktop (PLANO-WEB-V1, 3.3, sobre a 3.10 do PLANO-WEB): confere
# que o trabalho da web não mudou nada no Tomatito do desktop.
#
#   bash scripts/web/bateria-desktop.sh <pasta> [--app] [--raiz <checkout>]
#
# Grava em <pasta>:
#   build.txt         código de saída de cada passo (npm run build, cargo fmt,
#                     clippy, cargo test, npm test, contraste, build:debug, os
#                     invariantes do dist/ e o caso desktop-sem-celular)
#   testes-cargo.txt  cargo test --workspace -- --list (só os nomes, ordenados)
#   testes-node.txt   os "ok" do node --test em TAP, ordenados
#   arvore-desktop.txt  cargo tree do pacote tomatito (dependências normais),
#                     com o caminho do checkout trocado por <raiz>
#   capturas/ e capturas.sha256
#                     a prévia (shot.mjs, mock do Tauri, plataforma linux):
#                     Foco, Temporizador, Cronômetro e Configurações × Lite,
#                     Claro e Escuro, a 1000×700 e a 480×500 (24 PNG)
#   app-real.txt      (com --app) o cargo build de debug e os roteiros do GNOME
#                     aninhado aparencia, configuracoes, config-sistema,
#                     retomada e tomate, com o código de saída e o "n/m" de
#                     cada um
#
# --raiz roda tudo em outro checkout (o W26 usa ~/dev/tomatito). Os logs
# completos vão para $TT_BATERIA_LOGS ou uma pasta nova em /tmp, impressa no
# fim. Portas (diferentes das do desktop, 5173/5174): TT_PREVIEW_PORT (prévia,
# padrão 5184) e TT_PORT (Vite do aninhado, padrão 5183; o binário de debug é
# compilado com esse devUrl). Sai com 0 se todos os passos do build.txt
# saírem com 0; o app-real.txt não muda o código de saída, porque o critério
# dele é "igual à linha de base" (compare com diff).
#
# Comparar duas rodadas:
#   diff <base>/build.txt <atual>/build.txt
#   comm -23 <base>/testes-cargo.txt <atual>/testes-cargo.txt   # vazio
#   comm -23 <base>/testes-node.txt <atual>/testes-node.txt     # vazio
#   python3 scripts/web/comparar-capturas.py <base> <atual>
#   diff <base>/app-real.txt <atual>/app-real.txt
set -u
AQUI=$(cd "$(dirname "$0")" && pwd)
RAIZ=$(cd "$AQUI/../.." && pwd)
PASTA=
APP=
while [ $# -gt 0 ]; do
  case "$1" in
    --app) APP=1 ;;
    --raiz) RAIZ=$(cd "$2" && pwd) || exit 2; shift ;;
    -*) echo "opção desconhecida: $1" >&2; exit 2 ;;
    *) PASTA=$1 ;;
  esac
  shift
done
[ -n "$PASTA" ] || { echo "uso: bash scripts/web/bateria-desktop.sh <pasta> [--app] [--raiz <checkout>]" >&2; exit 2; }
mkdir -p "$PASTA" && PASTA=$(cd "$PASTA" && pwd)

# Pouco espaço no /home (onde ficam os checkouts): abaixo de 3 GB, não roda.
LIVRE=$(df --output=avail -BG /home | tail -1 | tr -dc 0-9)
[ "$LIVRE" -ge 3 ] || { echo "só ${LIVRE}G livres no /home (mínimo 3G); a bateria não roda" >&2; exit 3; }

export TT_PREVIEW_PORT=${TT_PREVIEW_PORT:-5184}
PORTA_APP=${TT_PORT:-5183}
LOGS=${TT_BATERIA_LOGS:-$(mktemp -d /tmp/tomatito-bateria-XXXXXX)}
mkdir -p "$LOGS"
porta_ocupada() { ss -Hltn "sport = :$1" | grep -q .; }
for p in "$TT_PREVIEW_PORT" ${APP:+"$PORTA_APP"}; do
  porta_ocupada "$p" && { echo "porta $p ocupada; escolha outra (TT_PREVIEW_PORT/TT_PORT)" >&2; exit 2; }
done

: > "$PASTA/build.txt"
FALHAS=0
N=0
# passo "<rótulo>" <pasta relativa à raiz> <comando...>
passo() {
  local rotulo=$1 dir=$2
  shift 2
  N=$((N + 1))
  local log
  log=$LOGS/$(printf '%02d' $N)-$(echo "$rotulo" | tr -c 'a-zA-Z0-9\n' '-' | tr -s '-').log
  echo "== $rotulo" >&2
  local ini=$SECONDS
  (cd "$RAIZ/$dir" && "$@") > "$log" 2>&1
  local codigo=$?
  echo "   saída $codigo em $((SECONDS - ini)) s ($log)" >&2
  printf '%s\t%s\n' "$codigo" "$rotulo" >> "$PASTA/build.txt"
  [ "$codigo" -eq 0 ] || FALHAS=$((FALHAS + 1))
  ULTIMO_LOG=$log
}

passo "npm run build" . npm run build
passo "cargo fmt --all --check" src-tauri cargo fmt --all --check
passo "cargo clippy --workspace --all-targets -- -D warnings" src-tauri cargo clippy --workspace --all-targets -- -D warnings
passo "cargo test --workspace" src-tauri cargo test --workspace
passo "npm test" . npm test -- --test-reporter=tap
sed -nE 's/^ *ok [0-9]+ - //p' "$ULTIMO_LOG" | sort > "$PASTA/testes-node.txt"
passo "node scripts/contrast.mjs" . node scripts/contrast.mjs
passo "npm run build:debug" . npm run build:debug

# Invariantes do dist/ do desktop (3.3 e 3.10.2): nada da camada web.
invariante_dist() {
  local achados=0
  for f in $(find dist -name '*.wasm' -o -name 'sw.js' -o -name '*.webmanifest'); do
    echo "arquivo da web no dist: $f"; achados=$((achados + 1))
  done
  for s in data-forma tomatito:motor documentPictureInPicture serviceWorker; do
    local n
    n=$(cat dist/assets/*.js | grep -o "$s" | wc -l)
    echo "$s: $n"
    achados=$((achados + n))
  done
  [ "$achados" -eq 0 ]
}
passo "invariante: dist/ sem arquivos nem strings da web" . invariante_dist
passo "invariante: desktop-sem-celular (390x844, toque)" . node "$AQUI/desktop-sem-celular.mjs" --raiz "$RAIZ"

echo "== listas" >&2
(cd "$RAIZ/src-tauri" && cargo test --workspace -- --list 2>/dev/null) | grep ': test$' | sort > "$PASTA/testes-cargo.txt"
(cd "$RAIZ/src-tauri" && cargo tree -p tomatito -e normal --prefix none -f '{p}') \
  | sed 's/ (\*)$//' | sed "s|$RAIZ|<raiz>|g" | sort -u > "$PASTA/arvore-desktop.txt"

echo "== capturas" >&2
rm -rf "$PASTA/capturas"
mkdir -p "$PASTA/capturas"
TELAS="foco temporizador cronometro configuracoes"
CAP_FALHAS=0
for par in lite:lite claro:light escuro:dark; do
  nome=${par%%:*}
  pref=${par#*:}
  passos=()
  for tam in 1000x700 480x500; do
    passos+=(--resize "$tam")
    for tela in $TELAS; do
      passos+=(--eval "location.hash = '#/$tela'" --wait 700 --shot "$PASTA/capturas/$tela-$nome-$tam.png")
    done
  done
  (cd "$RAIZ" && node scripts/preview/shot.mjs --size 1000x700 --motion reduce \
    --path "/?pref=$pref&plataforma=linux#/foco" "${passos[@]}") > "$LOGS/capturas-$nome.log" 2>&1 \
    || { echo "   capturas no $nome falharam ($LOGS/capturas-$nome.log)" >&2; CAP_FALHAS=$((CAP_FALHAS + 1)); }
done
(cd "$PASTA/capturas" && sha256sum -- *.png) > "$PASTA/capturas.sha256"
printf '%s\t%s\n' "$CAP_FALHAS" "capturas (shot.mjs, 3 temas)" >> "$PASTA/build.txt"
[ "$CAP_FALHAS" -eq 0 ] || FALHAS=$((FALHAS + 1))
echo "   $(ls "$PASTA/capturas" | wc -l) capturas" >&2

if [ -n "$APP" ]; then
  echo "== app real (GNOME aninhado, porta $PORTA_APP)" >&2
  : > "$PASTA/app-real.txt"
  (cd "$RAIZ/src-tauri" && TAURI_CONFIG="{\"build\":{\"devUrl\":\"http://localhost:$PORTA_APP\"}}" cargo build) \
    > "$LOGS/app-cargo-build.log" 2>&1
  printf '%s\t%s\n' "$?" "cargo build (devUrl na porta do aninhado)" >> "$PASTA/app-real.txt"
  for roteiro in aparencia configuracoes config-sistema retomada tomate; do
    limite=300
    [ "$roteiro" = retomada ] && limite=480
    saida=$LOGS/app-$roteiro
    echo "   $roteiro" >&2
    TT_PORT=$PORTA_APP TT_LIMITE=$limite TT_OUT=$saida \
      bash "$RAIZ/scripts/gnome-aninhado/rodar.sh" "$roteiro" > "$LOGS/app-$roteiro.txt" 2>&1
    codigo=$?
    ok=$(grep -c '^ok ' "$LOGS/app-$roteiro.txt")
    falha=$(grep -c '^FALHA' "$LOGS/app-$roteiro.txt")
    printf '%s\tsaída %s\t%s/%s\n' "$roteiro" "$codigo" "$ok" "$((ok + falha))" >> "$PASTA/app-real.txt"
    echo "   saída $codigo, $ok/$((ok + falha)) ($LOGS/app-$roteiro.txt)" >&2
    # A pasta da rodada (capturas e logs do shell) só fica se falhar.
    [ "$codigo" -eq 0 ] && rm -rf "$saida"
  done
fi

# Nada nosso pode ficar para trás (a máquina é a sessão real do usuário).
for p in "$TT_PREVIEW_PORT" "$PORTA_APP"; do
  porta_ocupada "$p" && echo "AVISO: a porta $p continua aberta depois da bateria" >&2
done

echo "logs: $LOGS" >&2
echo "resultado: $FALHAS passo(s) com falha no build.txt" >&2
[ "$FALHAS" -eq 0 ]
