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
comm -23 <(sort $B/testes-cargo.txt) <(sort <atual>/testes-cargo.txt)  # vazio (nomes podem crescer, nenhum some); no W04a, W04b e W05, diff vazio contra a lista do marco anterior (a base já tem 5 nomes a menos, dos W01a a W03a)
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

## W06a: o relógio no glue e a conta nova do `test:wasm`

*30/09/2026, depois do `npm run wasm` do W06a (perfil `wasm-release`, `wasm-opt -Oz`).*

- **`.wasm`:** `src/platform/web/pkg/tomatito_wasm_bg.wasm` com **400 275 bytes** (390,9 KiB; limite 532 480). Agora com o motor do desktop (`Engine`, eventos, temporizadores e cronômetro); era 316 828 no W01a.
- **`grep -c 'Date.now' src/platform/web/pkg/tomatito_wasm.js` = 1.** É o import do `js_sys::Date::now()` do `RelogioJs`:

  ```js
  __wbg_now_<hash>: function() {
      const ret = Date.now();
      return ret;
  },
  ```

  O glue resolve `Date.now` pelo global **a cada chamada** (não guarda a função num `const` do módulo). Por isso o relógio de teste do `verificar.mjs`, que troca o `Date.now` depois do carregamento, vale para o motor: o caso `fumaca` (b) confere isso no Chrome, e o teste `o_relogio_le_o_date_now_global_a_cada_uso` (`tomatito-wasm/tests/motor_js.rs`) confere no Node e no Chrome trocando o `Date.now` entre duas chamadas.
- **`new Date()` sumiu do glue.** O `const ret = new Date();` do spike vinha do `Timestamp::now()` do jiff (feature `js`); o motor lê o tempo só pelo `RelogioJs`, e o `wasm-bindgen` tirou o import que ninguém usa. O único outro import de tempo é o `new Intl.DateTimeFormat(…)` do fuso (`fusoDoSistema`). O relógio de teste continua trocando o construtor sem argumentos, para o JS da página.
- **Conta do `npm run test:wasm`:** o `testar-wasm.mjs` passa a rodar também o `tomatito-wasm`. Node e Chrome: **101 passam, 3 ignorados** = 87 do `tomatito-core` (a conta acima) + 9 unitários do `tomatito-wasm/src/lib.rs` + 5 do `tomatito-wasm/tests/motor_js.rs` (só no wasm). Os testes do `tomatito-motor` são `#[test]` simples e continuam só no nativo.

## W06b: motor na aba, estado de carregamento e o caso foco

*30/09/2026.*

- **Estado de carregamento: não precisa** (o "a confirmar no W06b" do PLANO-WEB, nas limitações e no risco 13). O `motor.js` carrega o wasm na primeira chamada, e toda chamada espera por ele; até lá, a tela Foco já aparece com o preparo padrão do store (`PREPARO_PADRAO`, os mesmos 25 e 5 do motor), e o primeiro `get_state` só a completa. No caso `foco` (servidor de desenvolvimento, máquina livre), a tela apareceu antes de o Chrome terminar o `.wasm` (fim da resposta em cerca de 0,7 s desde a navegação, 15 ms de transferência) e nenhum item viu um estado incoerente. Sob carga pesada (2,4 s medidos no spike), o que se vê é o preparo com os números padrão por um instante, que é o mesmo que o desktop mostra antes do primeiro `get_state`. Se o celular real mostrar outra coisa, o W37 reabre.
- **Onde o caso `foco` roda:** no servidor de desenvolvimento (`verificar.mjs --servidor dev`, novo, na mesma 4273). Os itens que não passam pela tela (pausar sem fase, `trocarModo`, `anunciarAoLeitor` e os comandos novos do desktop) fazem `await import('/src/lib/ipc.js')` na página, que no dev é o mesmo módulo que o app usa; no `dist-web`, o `ipc.js` fica dentro do bundle e não há como alcançá-lo sem um gancho de teste no app. Os casos que conferem o build (`casca`, e a CSP do W07a) continuam no `preview`.
- **`notices_read`:** o `THIRD_PARTY_NOTICES.md` e o `OFL-Inter.txt` vão para a raiz do `dist-web` (e são servidos no dev) por um plugin provisório no `vite.web.config.js`, que o W07a leva para o `plugin-web.mjs`. Sem o arquivo, um servidor de SPA devolve o `index.html` com 200; por isso o `notices_read` recusa uma resposta `text/html` com `notFound`.
- **Consequência para o grep do W03a:** o `THIRD_PARTY_NOTICES.md` lista o `@tauri-apps/api` entre as licenças, então `grep -rlE "__TAURI_INTERNALS__|@tauri-apps" dist-web` passa a imprimir `dist-web/THIRD_PARTY_NOTICES.md`. O que a regra protege é o código: a conferência passa a ser `grep -rlE "__TAURI_INTERNALS__|@tauri-apps" dist-web --include='*.js' --include='*.html' --include='*.css'`, que continua sem imprimir nada.
- **Efeitos sem dono:** `sound`, `notice`, `period` e `timerNotice` ficam em `semDono` (no `motor.js`, os 50 mais recentes) e num `console.debug('[motor] efeito …')`, sem tocar nem gravar nada, até o W08, o W12 e o W13.

## W07a: configurações, boot, viewport e CSP

*30/09/2026.*

- **`.wasm`:** **485 709 bytes** (474,3 KiB; limite 532 480), eram 400 275 no W06a. Os 85 KiB a mais são o `settings.rs` do motor (o `apply` e o `aplicar_patch`, que vão e voltam pelo `serde_json::Value`) e o próprio `serde_json`, que antes o `wasm-opt` tirava por não ter uso. As configurações passam entre o JS e o wasm como texto JSON (`normalizarConfig`, `aplicarPatch`, `Motor.configurar`): é o que o `localStorage` guarda e evita a conversão de números do `serde-wasm-bindgen` (um `25.5` tem de chegar como `25.5` para ser recusado igual ao desktop).
- **Onde o caso `config` roda:** no servidor de desenvolvimento, como o `foco` (os itens do patch chamam o `/src/lib/ipc.js`), mas **com a CSP do build**: o `verificar.mjs` liga `TOMATITO_WEB_CSP_DEV=1` antes de subir o dev, e o `plugin-web.mjs` põe a mesma `<meta>` (com o hash do script de boot) também no dev. Assim `casca` (preview, `dist-web`), `foco` e `config` (dev) rodam os três debaixo da política e passam sem nenhum "Refused to". Fora do `verificar.mjs`, o `npm run dev:web` continua sem CSP, como o `tauri dev`. O item (h) do `config` lê o `dist-web/index.html` do disco (CSP e viewport).
- **`boot-web.js` no build:** vai para `dist-web/assets/boot-web-<8 hex do sha256>.js` (o nome muda com o conteúdo, então o arquivo pode ficar em cache para sempre). É script clássico, sem `type="module"`, logo depois da `<meta>` de CSP e do `theme-color`, e antes do boot do `index.html`.
- **`theme-color`:** o `boot-web.js` acompanha o `data-theme` por um `MutationObserver` (vale para a troca pela tela, para o `tt://settings` e para o modo Sistema); as cores são o `--tt-bg-app` de cada tema, e o `boot-web.test.js` confere as duas listas contra o `tokens.css`.
- **"reaplicado" na recarga:** com Escuro salvo e o sistema claro, a conferência do boot (`main.js`, guarda (b) do `ligarSistema`) lia o `prefers-color-scheme` pela janela falsa e "reaplicava" o escuro a cada recarga. A `janela.js` passa a nascer com o tema fixado pelo boot (`NATIVO[data-theme]`, fora do Sistema). O item (c) do `config` pega a regressão: com a `janela.js` antiga, falha com `"[tema] tema nativo light fora do Sistema; reaplicado dark"`.
- **`recursosDaCasca`:** função nas duas plataformas (a web sabe do `beforeinstallprompt` só depois do boot): no desktop, `() => SEM_RECURSOS_DA_CASCA` (`{ notificacoes: false, instalavel: false }`); na web, `notificacoes` = `Notification` e `serviceWorker` existem, `instalavel` = recebeu o `beforeinstallprompt`. Ninguém a lê ainda (Avisos no W14, instalar no W16). O `recursos.js` não mudou (`git diff main -- src/platform/recursos.js` vazio).
- **Volume:** o `settings_set` da web grava, reconfigura o motor e emite o `tt://settings`; o passo "`som.volume(…)`" entra com o `som.js` no W12.
- **Bateria:** a primeira rodada deu 16/24 capturas, com as 8 do Escuro em branco (a prévia ainda não tinha montado a tela quando o `shot.mjs` capturou). Ela rodou ao mesmo tempo que o `test:wasm` e o `verificar.mjs --todos` (três Chromes e o `cargo` juntos); repetidas sozinhas, as 8 saíram com 0 pixel diferente da base. A rodada que fecha o marco foi feita sem nada rodando junto.
