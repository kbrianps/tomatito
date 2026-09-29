# Ferramentas da faixa web

Conferido em 29/09/2026, no W00a, na worktree `~/dev/tomatito-web` (branch `web`, criada a partir da `main` em `388d845`, `v0.1.0-1-g388d845`).

## Onde fica cada coisa

| Item | Caminho |
|---|---|
| Worktree da web | `~/dev/tomatito-web` (branch `web`) |
| `target-dir` do Cargo do desktop nesta worktree | `/opt/cargo-target/tomatito-web-desktop` (em `.cargo/config.toml`, fora do git) |
| Saída do build wasm | `$TOMATITO_WASM_TARGET_DIR` = `/opt/cargo-target/tomatito-web` (exportado no `~/.profile`) |
| `wasm-bindgen-cli` 0.2.129 | `/opt/cargo-target/ferramentas/wbg/bin/` (`wasm-bindgen`, `wasm-bindgen-test-runner`, `wasm2es6js`) |
| Pasta de ferramentas | `/opt/cargo-target/ferramentas` (gravável pelo usuário, no `/`) |

O `wasm-bindgen-cli` foi instalado com `cargo install wasm-bindgen-cli --version 0.2.129 --locked --root /opt/cargo-target/ferramentas/wbg`, com o build intermediário em `/opt/cargo-target/ferramentas/wbg-build` (apagado depois). Nada foi para `~/.cache/tomatito/`.

## Checagens

| Checagem | Resultado |
|---|---|
| `rustup target list --installed \| grep -x wasm32-unknown-unknown` | `wasm32-unknown-unknown` |
| `wasm-pack --version` | `wasm-pack 0.15.0` |
| `node --version` (≥ 22) | `v22.23.2` |
| `npm --version` | `10.9.8` |
| `rustc --version` | `rustc 1.95.0 (59807616e 2026-04-14)` |
| `google-chrome --version` | `Google Chrome 153.0.8010.52` (o W02 usa o chromedriver 153.0.8010.52, que já está na semente `~/dev/tomatito-ref/web/chromedriver-linux64/`) |
| `/opt/cargo-target/ferramentas/wbg/bin/wasm-bindgen-test-runner --version` | `wasm-bindgen-test-runner 0.2.129` |
| `ls -d /opt/cargo-target/ferramentas` gravável | `drwxrwxr-x kbrianps kbrianps`, `test -w` ok |
| `test ! -e /opt/cargo-target/wasm-spike` | ok: apagado (1,4 GB). Só o `~/dev/tomatito-ref/web/receita.sh` o citava, como `CARGO_TARGET_DIR` do spike; era saída de build, refeita se a receita rodar de novo |
| `cargo metadata ... --manifest-path ~/dev/tomatito-web/src-tauri/Cargo.toml` | `"target_directory":"/opt/cargo-target/tomatito-web-desktop"` |
| `git -C ~/dev/tomatito-web branch --show-current` / `git -C ~/dev/tomatito branch --show-current` | `web` / `main` |
| `df --output=avail -BG /home` | `6G` (depois do `npm ci`) |

## Observações

- O `~/.profile` só vale em sessões novas. Nos terminais já abertos, `export TOMATITO_WASM_TARGET_DIR=/opt/cargo-target/tomatito-web` à mão.
- O `wasm-bindgen-test-runner` não está no `PATH` de propósito: os scripts da web o procuram em `$TOMATITO_WBG` ou nesse caminho fixo (W02).

## `npm run wasm` (W01a)

- `scripts/web/wasm.mjs` roda `wasm-pack build src-tauri/tomatito-wasm --target web --out-dir ../../src/platform/web/pkg --profile wasm-release --no-pack`, com o `CARGO_TARGET_DIR` tirado de `TOMATITO_WASM_TARGET_DIR`, depois `CARGO_TARGET_DIR`, e por fim `src-tauri/target-wasm`.
- O wasm-pack reaproveita o `wasm-bindgen` 0.2.129 e o `wasm-opt` que já estavam em `~/.cache/.wasm-pack` (68 MB, do spike de 28/09); nada novo foi baixado para o `/home`.
- Em 29/09/2026, no W01a: `src/platform/web/pkg/tomatito_wasm_bg.wasm` com **316 828 bytes** (limite do plano: 532 480). É menor que o do spike (485,5 KiB) porque o `lib.rs` mínimo ainda não traz os temporizadores, o cronômetro, o `events.rs` e o `i18n.rs`; o fuso (tzdb do jiff) já está dentro.
- Conferido à parte no Node (`initSync`, `TZ=America/Sao_Paulo`): `focusStart` em t0 e `restanteMs(t0 + 60 000)` = 1 440 000; `focusPause` sem fase correndo lança "não há fase correndo para pausar"; `fusoDoSistema()` = `America/Sao_Paulo`. O caso fumaça no Chrome é do W01b.
