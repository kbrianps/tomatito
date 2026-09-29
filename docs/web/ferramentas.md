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

## `verificar.mjs`, perfis de celular e caso fumaça (W01b)

- `node scripts/web/verificar.mjs <caso>|--todos [--servidor fumaca|preview] [--celular p|m|g|paisagem|minimo|tablet]`. O Chrome sobe pelo `scripts/web/chrome.mjs` (cópia das funções de subir e fechar do `shot.mjs`, com o protocolo só pelo `--remote-debugging-pipe`, sem porta de depuração) num perfil `tomatito-chrome-web-*`, apagado no fim; o servidor de teste é próprio, na **4273** com `strictPort`.
- `--servidor fumaca`: build da `scripts/web/fumaca/` (base `/`, importando o `src/platform/web/pkg/` sem plugin) numa pasta temporária `tomatito-fumaca-*`, apagada no fim, e `vite preview` dela. Sem o `pkg/`, roda o `npm run wasm` antes. `--servidor preview` serve o `dist-web` pelo `vite.web.config.js`, que chega no W03a (até lá, erro claro).
- Relógio de teste: script injetado em cada documento novo (`Date.now` e `new Date()` sem argumentos com deslocamento, `__ttAvancar(ms)`); o deslocamento volta ao Node por binding e é reinjetado, então sobrevive a recarregar e a reabrir; `t.relogio.avancarComAbaFechada(ms)` soma antes de reabrir; com a aba oculta, `__ttAvancar` lança erro (na página e no `t.relogio.avancar`). Conferido pelo caso `relogio` (5/5).
- `scripts/web/celular.mjs` é a sonda de 29/09 virada módulo: os 6 perfis da seção 6 do PLANO-WEB-V1 (métricas `mobile: true`, toque com 5 pontos, UA do Chrome Android com `userAgentData.mobile`, safe areas), `tocar`, `arrastar`, `teclado` e `alvos`. O caso `sonda-celular` refaz a sonda com essas funções (7/7).
- **Confirmado no W01b (item "a confirmar" do PLANO-WEB-V1, seção 11):** o Vite 8.3.1 emite o wasm em `/assets/` com hash no nome (`/assets/tomatito_wasm_bg-<hash>.wasm`), servido como `application/wasm` pelo `vite preview`.
- **Achado do W01b: o Chrome 153 não escreve mais "Refused to" nas violações de CSP.** A mensagem agora é "Loading the image '…' violates the following Content Security Policy directive: … The action has been blocked." (e "Executing inline script violates …"). Uma regra só com "Refused to" deixaria passar a CSP quebrada. O `verificar.mjs` reprova por "Refused to", por "violates the following Content Security Policy" e por qualquer evento `securitypolicyviolation` do documento (ouvido por script injetado), que pega também o `eval` e o WebAssembly sem `'wasm-unsafe-eval'`, que não vão para o console. Também reprova exceção sem tratamento (`Runtime.exceptionThrown`).
- `arrastar()` precisa de `touch-action: none` no elemento (como um deslizante de verdade); sem isso o Chrome trata o gesto como rolagem, manda os `touchmove` espaçados e o último se perde.
- Em 29/09/2026: `fumaca --servidor fumaca` = `ok fumaca: 5/5` (também com `--celular m`); `sonda-celular` 7/7; `relogio` 5/5; depois de cada rodada (e depois de um SIGTERM no meio), `ls /tmp | grep -c '^tomatito-chrome-'` igual ao de antes (0) e `ss -ltn 'sport = :4273'` vazio.
