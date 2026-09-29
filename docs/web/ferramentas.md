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

## Testes do core em wasm (W02)

- O `core-wasm-tests.patch` (`~/dev/tomatito-ref/web/`) entrou limpo com `patch -p1` no `tomatito-core` (só deslocamentos de linha no `countdown.rs` e no `stopwatch.rs`), mais o mesmo `use wasm_bindgen_test::wasm_bindgen_test as test;` à mão no `tests/retomada.rs` (M40). O `cargo fmt` reordenou os `use` e quebrou os `cfg_attr` longos: 44 linhas em vez de 28, todas em testes e no `[target.'cfg(target_family = "wasm")'.dev-dependencies]` (`wasm-bindgen-test = "0.3.79"`, que usa o `wasm-bindgen` 0.2.129 já fixado). O `Cargo.lock` ganha 8 pacotes só do wasm; o `cargo tree -p tomatito -e normal` continua igual ao `arvore-desktop.txt` da linha de base.
- `npm run test:wasm` = `node scripts/web/testar-wasm.mjs [--node | --chrome]`: `cargo test -p tomatito-core --target wasm32-unknown-unknown` no perfil de debug, com o runner como `CARGO_TARGET_WASM32_UNKNOWN_UNKNOWN_RUNNER`, primeiro no Node e depois no Chrome headless (`WASM_BINDGEN_USE_BROWSER=1`, `CHROMEDRIVER`). Imprime uma linha `ok <ambiente>: N passaram, F falharam, I ignorados` por ambiente e sai com 1 se algum falhar.
- Runner: `$TOMATITO_WBG` (o executável ou a pasta do `--root`), senão `/opt/cargo-target/ferramentas/wbg/bin/wasm-bindgen-test-runner`; recusa versão diferente de 0.2.129.
- Chromedriver: `$CHROMEDRIVER`, senão `/opt/cargo-target/ferramentas/chromedriver-<versão do Chrome>/chromedriver`. Na primeira rodada, a 153.0.8010.52 foi copiada da semente `~/dev/tomatito-ref/web/chromedriver-linux64/`; com outra versão de Chrome, o script baixa do Chrome for Testing para a mesma pasta (conferido com uma pasta de ferramentas descartável: download, extração e 87/3 no Chrome; a pasta foi apagada). A pasta de ferramentas muda com `TOMATITO_FERRAMENTAS`. Nada vai para o `/home` fora do repositório.
- **Achado do W02: o chromedriver não procura o Chrome pelo `PATH`** (acha o da instalação padrão). Para o Chrome que roda ser o mesmo cuja versão escolheu o chromedriver (`$TOMATITO_CHROME`, senão `google-chrome`), o script passa o caminho absoluto dele em `goog:chromeOptions.binary`, por um `webdriver.json` temporário apontado por `WASM_BINDGEN_TEST_WEBDRIVER_JSON` (o runner 0.2.129 lê essa variável no lugar do `webdriver.json` da pasta atual). Conferido com um Chrome "espião" em `TOMATITO_CHROME`: sem isso ele só era chamado para o `--version`; com isso, também pelo chromedriver.
- Em 29/09/2026: Node `ok node: 87 passaram, 0 falharam, 3 ignorados` e Chrome 153.0.8010.52 `ok chrome: 87 passaram, 0 falharam, 3 ignorados`, iguais à conta do `linha-de-base.md` (93 − 2 − 1 − 3). Os 3 ignorados são os do `SystemTime` (`clock::tests::epoch_ms_converte_antes_e_depois_de_1970`, `clock::tests::relogio_do_sistema_e_o_relogio_de_parede`, `clock::tests_acelerado::variavel_de_ambiente`); o `isolamento.rs` não compila testes no wasm ("no tests to run!"). Nativo: os mesmos 93 de antes. Depois de cada rodada, nenhum `chromedriver` nem Chrome do runner ficou aberto, e nenhuma pasta `tomatito-wasm-*` ficou no `/tmp`.
- Clippy com `-D warnings` limpo no nativo (`--workspace --all-targets`) e no wasm (`-p tomatito-core -p tomatito-wasm --all-targets --target wasm32-unknown-unknown`, com o target do wasm).
- Regras 3 e 4 da 3.2 do PLANO-WEB no `regras-do-repo.test.mjs`: nenhum arquivo de `scripts/web/` casa com a descoberta do `node --test`, e nenhum `src/platform/web/**/*.test.js` importa `pkg/`, `motor.js` ou `index.js` (conferidas com arquivos de mentira que as quebram). `rm -rf src/platform/web/pkg && npm test`: 370/370 (368 da base + as 2 regras), sem nenhuma menção ao `testar-wasm`.
- Bateria do desktop (`--app`, fora do repositório), porque o diff mexe no `tomatito-core`: `build.txt` igual ao da base (11 passos com 0); `arvore-desktop.txt` igual; capturas 24/24 iguais; `testes-cargo.txt` só com 5 a mais (os do `tomatito-wasm`, do W01a) e `testes-node.txt` só com as 2 regras novas, nada removido (compare com `LC_ALL=C sort` e `diff`: o `comm` no locale pt_BR reclama da ordem). Roteiros: `aparencia` 21/21, `configuracoes` 17/17, `config-sistema` 16/16 e `retomada` 25/25 como na base; o `tomate` saiu com 1 e 3/4 na primeira vez (tempo esgotado no `switch_window_mode`, com a máquina em carga média 16 por processos de fora do Tomatito) e com 0 e 28/28 ao rodar de novo sozinho. O diff do W02 não toca em código que rode no app (só testes e uma dev-dependency do wasm).
