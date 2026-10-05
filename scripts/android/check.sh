#!/usr/bin/env bash
# Guarda do Android (PLANO-ANDROID, 4.1 e A03): o Rust do app compila para os
# dois alvos do dia a dia, sem erro e sem aviso.
#
#   bash scripts/android/check.sh
#
# Faz `source` do ambiente (o ~/.config/tomatito/android.env do A01, com o
# CC_*/AR_*/CARGO_TARGET_*_LINKER do NDK): sem ele, o `cc` do libsqlite3-sys
# (rusqlite `bundled`) procura `x86_64-linux-android-clang`, não acha, e o
# `cargo check` falha por ambiente, não por código.
#
# Um aviso do nosso código (o `tomatito` e o `tomatito-core`) reprova: o cargo
# repete os avisos das unidades que já estavam em cache, então uma segunda
# rodada sem mudança também os mostra. Os avisos das dependências ficam de
# fora (o cargo os corta com `--cap-lints`). O `target-dir` vem da
# `.cargo/config.toml` da worktree (/opt/cargo-target/tomatito-android, A00).
set -euo pipefail
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAIZ="$(cd "$AQUI/../.." && pwd)"
# shellcheck source=ambiente.sh
source "$AQUI/ambiente.sh"

ALVOS=(x86_64-linux-android aarch64-linux-android)
falhou=0
for alvo in "${ALVOS[@]}"; do
  var_cc="CC_${alvo//-/_}"
  [ -x "${!var_cc:-}" ] || { echo "check.sh: $var_cc não aponta para o clang do NDK" >&2; exit 1; }
  echo "== cargo check --target $alvo"
  saida="$(cd "$RAIZ/src-tauri" && cargo check --locked --target "$alvo" --message-format short 2>&1)" \
    || { echo "$saida"; echo "check.sh: $alvo: erro de compilação" >&2; falhou=1; continue; }
  avisos="$(grep -E '^(warning|error)' <<<"$saida" || true)"
  if [ -n "$avisos" ]; then
    echo "$saida"
    echo "check.sh: $alvo: avisos" >&2
    falhou=1
  else
    echo "   ok"
  fi
done
exit "$falhou"
