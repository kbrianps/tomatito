# Linha de base do desktop (W00b)

*29/09/2026, na worktree `~/dev/tomatito-web` (branch `web`), commit `522f109` (W00a). O código é o da `main` em `388d845` (v0.1.0): o W00a só acrescentou `docs/web/ferramentas.md`. Esta é a referência da bateria do desktop (PLANO-WEB-V1, 3.3, sobre a 3.10 do PLANO-WEB) para todos os marcos da web.*

## Como rodar

```bash
bash scripts/web/bateria-desktop.sh <pasta> [--app] [--raiz <checkout>]
```

- Portas próprias, diferentes das do desktop (5173/5174): prévia em `TT_PREVIEW_PORT` (padrão 5184) e Vite do aninhado em `TT_PORT` (padrão 5183; o binário de debug é recompilado com esse `devUrl`). A bateria recusa rodar se uma delas estiver ocupada, ou se o `/home` tiver menos de 3 GB livres.
- Os logs completos vão para `$TT_BATERIA_LOGS` ou uma pasta nova em `/tmp`, impressa no fim.
- Sai com 0 se todos os passos do `build.txt` saírem com 0. O `app-real.txt` não muda o código de saída: o critério dele é "igual à linha de base".
- Tempo de máquina: cerca de 16 min por volta com `--app` (load entre 2 e 4), dos quais uns 13 no GNOME aninhado.

Comparar uma rodada nova (`<atual>`) com esta base:

```bash
B=docs/web/linha-de-base
diff $B/build.txt <atual>/build.txt                    # vazio
export LC_ALL=C   # com o locale pt_BR, o comm reclama da ordem do sort (visto no W03b)
comm -23 <(sort $B/testes-cargo.txt) <(sort <atual>/testes-cargo.txt)  # vazio (nomes podem crescer, nenhum some); diff vazio no W04a, W04b e W05
comm -23 <(sort $B/testes-node.txt) <(sort <atual>/testes-node.txt)    # vazio
diff $B/arvore-desktop.txt <atual>/arvore-desktop.txt  # vazio; do W04a em diante, só a linha tomatito-motor
python3 scripts/web/comparar-capturas.py $B <atual>    # saída 0
diff $B/app-real.txt <atual>/app-real.txt              # vazio (com --app)
```

## O que a base tem

| Arquivo | Conteúdo |
|---|---|
| `build.txt` | 11 passos, todos com 0: `npm run build`, `cargo fmt --all --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace`, `npm test`, `node scripts/contrast.mjs`, `npm run build:debug`, o invariante do `dist/` (sem `.wasm`, `sw.js`, `*.webmanifest` nem as strings `data-forma`, `tomatito:motor`, `documentPictureInPicture` e `serviceWorker`), o caso `desktop-sem-celular` e as capturas |
| `testes-cargo.txt` | 245 nomes: 152 do `tomatito` (151 passam, 1 ignorado) e 93 do `tomatito-core` |
| `testes-node.txt` | 368 testes do `npm test`, todos passando |
| `arvore-desktop.txt` | 316 pacotes do `cargo tree -p tomatito -e normal`, com o caminho do checkout trocado por `<raiz>` (para o W26 comparar com a `main`) |
| `capturas/` e `capturas.sha256` | 24 PNG da prévia (mock do Tauri, plataforma `linux`, movimento reduzido): Foco, Temporizador, Cronômetro e Configurações × Lite, Claro e Escuro, a 1000×700 e a 480×500 |
| `app-real.txt` | `cargo build` com o `devUrl` da porta 5183 e os 5 roteiros do GNOME aninhado |

O caso `desktop-sem-celular` (`scripts/web/desktop-sem-celular.mjs`) abre a prévia do desktop a 390×844, com toque emulado e UA do Chrome Android, e confere 5 itens: a emulação pegou (`pointer: coarse` e `innerWidth === 390`), sem `data-forma` no `<html>`, `.tt-nav` visível e nenhuma `.tt-barra-inferior` visível. Na base: 5/5.

## Roteiros do app real

| Roteiro | Rodada 1 | Rodada 2 |
|---|---|---|
| `cargo build` (devUrl na 5183) | 0 | 0 |
| `aparencia` | saída 0, 21/21 | saída 0, 21/21 |
| `configuracoes` | saída 0, 17/17 | saída 0, 17/17 |
| `config-sistema` | saída 0, 16/16 | saída 0, 16/16 |
| `retomada` (limite de 480 s) | saída 0, 25/25 | saída 0, 25/25 |
| `tomate` | saída 0, 28/28 | saída 0, 28/28 |

Os 5 passam, com os mesmos números da junção. Os roteiros antigos que falham na `main` desde o M36 ("o app sai sozinho depois de fechar a janela": `barra-de-titulo`, `partida-a-frio`, `contagem`, `notificacoes` e outros) ficam fora da bateria, como decidido na seção 1 do plano.

## Testes do core em wasm: a conta

Recontada com `cargo test -p tomatito-core -- --list`:

| Alvo | Testes |
|---|---|
| `src/lib.rs` (unitários) | 36 |
| `tests/cronometro.rs` | 10 |
| `tests/foco.rs` | 22 |
| `tests/isolamento.rs` | 2 |
| `tests/retomada.rs` | 13 |
| `tests/temporizadores.rs` | 10 |
| **Total nativo** | **93** |

No wasm (W02):
- saem os 2 do `isolamento.rs` (`#![cfg(not(target_family = "wasm"))]`: ele chama o `cargo tree`);
- sai 1 que só existe em `cfg(unix)`: `clock::tests_acelerado::variavel_de_ambiente_que_nao_e_utf8_e_recusada`;
- ficam ignorados 3 que usam `SystemTime`: `clock::tests::epoch_ms_converte_antes_e_depois_de_1970`, `clock::tests::relogio_do_sistema_e_o_relogio_de_parede` e `clock::tests_acelerado::variavel_de_ambiente`.

**Passam: 93 − 2 − 1 − 3 = 87, com 3 ignorados**, o que confirma a estimativa do plano. O `retomada.rs` (M40) não usa `SystemTime`, arquivo, ambiente nem thread; entra inteiro. O módulo `tests_acelerado` só existe com `debug_assertions`: os testes wasm precisam rodar no perfil de debug (o padrão do `cargo test`) para a conta fechar.

## As duas rodadas

- Rodada 1: `bash scripts/web/bateria-desktop.sh docs/web/linha-de-base --app`, das 15:51 às 16:08, saída 0.
- Rodada 2: a mesma bateria numa pasta temporária (fora do repositório), das 16:08 às 16:25, saída 0.
- `build.txt`, `testes-cargo.txt`, `testes-node.txt`, `arvore-desktop.txt` e `app-real.txt`: idênticos entre as duas (`diff` vazio).
- `comparar-capturas.py` entre as duas: saída 0, 24/24. 23 capturas com 0 pixel diferente acima do limiar; a `configuracoes-lite-480x500.png` com 7 de 240 000 px (0,0029%, bem abaixo do 0,1%).
- **sha256:** bateu em 21 das 24. Diferiram `configuracoes-lite-480x500.png`, `cronometro-lite-480x500.png` e `foco-lite-480x500.png` (as duas últimas sem nenhum pixel acima de 8/255: diferença de antisserrilhado). Por isso a comparação é pelo comparador, e o `capturas.sha256` fica só como informação, como previsto na 3.10 do PLANO-WEB.
- Nada ficou aberto depois: portas 5183 e 5184 livres, sem Chrome headless, GNOME aninhado nem app de debug nosso.

## Observações

- Uma tentativa anterior deste marco tinha deixado uma rodada parcial com `npm test` em 1: a regra do repositório "caminhos de arquivo nos scripts do Node saem do `fileURLToPath`" pegou o `desktop-sem-celular.mjs`, que foi corrigido antes desta base. As duas rodadas aqui partem do script já corrigido; a regra passa a valer para tudo em `scripts/web/`.
- A bateria roda o `npm test` do checkout inteiro, então os scripts de `scripts/web/` também passam pelas regras do repositório.
