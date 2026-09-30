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

## W07b: temporizador e cronômetro

*30/09/2026.*

- **Nada mudou no app:** os comandos `timer_*` e `stopwatch_*` já iam ao wasm desde o W06b (nunca estiveram nos `PROVISORIOS`), e os efeitos `timers` e `stopwatch` já viravam `tt://timers` e `tt://stopwatch` no barramento. O marco são os dois casos novos, no servidor de desenvolvimento como o `foco`: `temporizador` (6/6) e `cronometro` (5/5), que também passam com `--celular m`. Como o commit não toca no `src/` nem no `src-tauri/`, a bateria do desktop não foi repetida.
- **"Encerrado, igual ao desktop":** a referência é o teste `contagem_negativa_depois_do_zero` do `tomatito-core/tests/temporizadores.rs` (depois do zero o temporizador **continua correndo**, com o restante negativo, `ended` e `is_overdue`) e o M32 (card com "Encerrado há", o tempo com sinal de menos, `data-vencido`, "Pausar" e "Redefinir" habilitados). O fim sai uma vez só, sem atraso (`timerNotice` com `late: false`, ainda em `semDono` até o W12 e o W13).
- **Folga do relógio de teste:** o relógio da página é o real mais o deslocamento, então entre o clique e a leitura corre tempo de verdade. Os casos medem esse tempo no Node e usam como folga máxima: o temporizador de 1 min, depois de 61 s, leu `-00:00:02` e `remainingMs = -2040` com 1 043 ms reais; as voltas do cronômetro deram 12 344 e 22 349 ms para 12 340 e 22 340 (as do teste `voltas_guardam_o_total_e_so_correndo` do `cronometro.rs`), com 7 e 11 ms reais entre os cliques. Nenhum item confere um valor exato que dependa da velocidade da máquina.
- **O evento chega à tela sem o store:** nos dois casos, uma mudança feita pelo `/src/lib/ipc.js` direto (criar e excluir um temporizador; redefinir o cronômetro) não passa pelo `store.comandoDo…` da tela, então só o `tt://timers`/`tt://stopwatch` a leva ao DOM. O `cronometro` também confere a sequência de retratos no barramento (`running 0`, `running 1`, `running 2`, `paused 2`, `idle 0`).

## W08: estatísticas e tarefas no IndexedDB

*30/09/2026.*

- **Banco:** IndexedDB `tomatito`, versão 1, com as stores `periods` (chave `id` crescente, índice `endedAt`, o `periods_ended_at` do desktop) e `tasks` (chave `id` crescente). O `armazenamento.js` (sem dependência) abre o banco uma vez, fecha no `versionchange` de outra aba e roda cada operação numa transação.
- **Gravação dos períodos:** o efeito `period` do motor deixou o `semDono`: o `motor.js` ganhou `aoEfeito(tipo, f)`, e o `index.js` registra o `estatisticas.gravarPeriodo` (assim o `motor.js` não importa quem o importa). A gravação é assíncrona e nunca lança; o `stats_get` chama o `motor.estado()` (o `engine.state()` do desktop, que fecha o que venceu), espera as gravações pendentes e só então soma. Como o `period` sai antes do `state` na mesma resposta, o cartão, que relê a cada `tt://state`, já pega o período novo.
- **Soma e lista:** as faixas (ontem, hoje, semana) vêm do wasm (`faixas`, o `stats_ranges` do core, no fuso do navegador); o título e a virada da lista também (`limparTitulo` e `visivelDesde`, o `clean_title` e o `visible_since` do motor). A regra de soma (só foco, concluído ou interrompido com pelo menos 60 s, pelo `endedAt` em `[start, end)`) e o filtro da lista ficam no `contagem.js`, puro, com teste no Node; o teste confere o `MIN_INTERRUPTED_S` contra o `stats.rs`. As tarefas saem com as chaves e a ordem do `TaskDto` (`id`, `title`, `createdAt`, `doneAt`), e os erros com os `code` do desktop (`emptyTitle`, `titleTooLong`, `notFound`, `storage`; um id que não é inteiro dá `invalidArgs`).
- **Motor provisório:** o `motor-prototipo.js` foi apagado, e com ele a lista `PROVISORIOS`. O `sound_test` resolve sem tocar, com `console.debug('[sem som] sound_test')`, até o W12.
- **`.wasm`:** **501 863 bytes** (490,1 KiB; limite 532 480), eram 485 709 no W07a. Os 16 KiB são o `days.rs` e o `tasks.rs` do motor, que agora têm uso.
- **`npm run test:wasm`:** Node e Chrome com **106 passando e 3 ignorados** (os testes novos: `faixas_com_horario_de_verao` no `lib.rs` e `estatisticas_e_tarefas_pelo_lado_do_js` no `motor_js.rs`).
- **Caso `estatisticas`** (servidor de desenvolvimento, 7/7, também com `--celular m`): o `verificar.mjs` ganhou `t.relogio.posicionar(instante)`, que leva o relógio de teste de todas as abas a um instante fixo (inclusive para trás), seguido de uma recarga. O caso põe o relógio em 30/09/2026 12:00 de São Paulo (longe da virada, para a rodada não depender da hora em que roda).
- **Horário de verão, o teste do `days.rs`:** `horario_de_verao` (`tomatito-core/src/days.rs`) fixa que o dia 08/03/2026 em Nova York tem 23 h (`day_range(date(2026, 3, 8), &ny, 0).len_ms() == 23 h`), e portanto termina às 00:00 EDT de 09/03 (04:00 UTC). Com `Emulation.setTimezoneOverride('America/New_York')`, um foco que terminou às 23:49 EDT de 08/03 caiu em "Ontem", e um que terminou às 00:14 EDT de 09/03 caiu em "Hoje" e em "Esta semana" (09/03 é segunda). Com um fuso fixo de -05:00, os dois cairiam no mesmo dia. Resultado da rodada: fins às `03:49:00Z` e `04:14:01Z`, `yesterdayS = todayS = weekS = 1500`.
- **Bateria do desktop:** o diff fica só nas pastas da web (`src/platform/web/`, `scripts/web/`, `src-tauri/tomatito-wasm/`, `docs/`), então a bateria não foi repetida. O `npm run build` do desktop continua sem `.wasm` e sem `data-forma`, `indexedDB` ou `armazenamento` nos assets.

## W09: retomada

*30/09/2026.*

- **Gravação:** o `tomatito:estado` no localStorage tem o formato do `state.json` do desktop (`tomatito_motor::state_file`: `schemaVersion`, `savedAt`, `focus` com o `lastSessionId`, `timers`, `stopwatch`). O `motor.js` o regrava inteiro depois de cada resposta do wasm que traz um efeito `state`, `timers` ou `stopwatch` (as transições que gravam o `state.json` no desktop), nunca a cada tick. Quem monta o conteúdo é o wasm (`Motor.gravavel`, o `save_all` do desktop, com o `lastSessionId` guardado no `Motor` para não voltar a 0 no ocioso); o `estado.js` só lê e grava o texto. Depois de um pânico, nada mais é gravado.
- **Retomada:** o `Motor.restaurar(texto)` faz a carga do `StateStore::load` do desktop sobre o texto (`ler_estado`, no `tomatito-wasm`: ausente dá o padrão; texto que não abre como objeto JSON fica guardado em `tomatito:estado.corrompido`, o `state.corrompido.json` do desktop; `schemaVersion` desconhecida é ignorada inteira; cada parte vale sozinha) e chama o `Engine::restaurar` do M40, que roda o `advance_to(agora)` com a regra do atraso. O `motor.js` faz isso uma vez, no `iniciar()`, logo depois do `configurar` e antes do primeiro comando; os efeitos vão aos donos (o `period` ao IndexedDB) e o resto ao `semDono`, e em seguida vem uma gravação completa, como o `save_all` ao abrir no desktop.
- **"Concluída às HH:MM":** o fechamento com mais de 60 s de atraso sai como um aviso só, `notice` com `kind: 'late'`, `sessionCompleted: true` e `endedAt` no prazo, sem `sound`. O texto "Sessão concluída às HH:MM" é do `i18n` do motor e aparece como notificação só no W13; até lá, o caso confere o aviso no `semDono`. Na tela, a sessão fica `completed` (a tela Foco mostra o preparo) e o progresso já soma o período.
- **Caso `retomada`** (servidor de desenvolvimento, 11/11, também com `--celular m`): recarregar no meio do foco (diferença de 0 ms além do tempo real da recarga), temporizador e cronômetro com volta depois de recarregar, e fechar a aba por `Target.closeTarget`, somar até 2 min depois do fim e reabrir (período gravado, aviso de atraso, nenhum `sound`, e nada repetido numa segunda recarga). `--todos`: os 10 casos verdes.
- **`.wasm`:** **534 103 bytes** (521,6 KiB), eram 501 863 no W08: **1 623 bytes acima do limite de 532 480** (520 KiB) do W01a e do W06a. Cerca de 20 KiB são a desserialização das partes do estado (`SavedFocus`, `SavedTimer`, `SavedStopwatch` e os enums de estado; o `serde_json::Value` já estava no pacote) e cerca de 12 KiB o `Engine::restaurar` e a gravação. Tentativas sem ganho: desserializar pelo `serde-wasm-bindgen` (534 549), texto por `serde_json::to_string` (536 835; a versão final devolve um objeto e o JS faz o `JSON.stringify`), mensagens sem `format!` (535 896), `wasm-opt --converge` (533 836) e `opt-level = "z"` (626 147). Com gzip, 204 938 bytes. Decisão pendente: subir o limite ou cortar outra coisa (docs/depois.md).
- **`npm run test:wasm`:** Node e Chrome com **111 passando e 3 ignorados** (5 testes novos no `lib.rs`: `retomada_no_meio_do_foco_mantem_o_prazo`, `retomada_depois_do_fim_com_atraso_grava_o_periodo_sem_som`, `retomada_de_temporizador_e_cronometro`, `ultimo_id_continua_no_ocioso` e `texto_ausente_ilegivel_ou_de_outra_versao`).
- **Fora do escopo:** duas abas abertas gravam por cima uma da outra (a última transição vence); a instância única é da 3.7 do PLANO-WEB.
- **Bateria do desktop:** o diff fica só nas pastas da web, então não foi repetida. O `npm run build` do desktop continua sem `.wasm` e sem `tomatito:estado` ou `indexedDB` nos assets.

## W11: prazo único na página

*30/09/2026.*

- **Sem Worker e sem sonda** (PLANO-WEB-V1, 2.2 e W11): o relógio é todo por `setTimeout` na página, com três temporizadores no `motor.js`: o prazo único (`proximoPrazo`), o tick de 1 Hz só com a aba visível e, com a aba oculta, a virada de minuto (`proximaViradaDeMinuto` + 50 ms). O `prazo.js` é puro e tem o `prazo.test.js` (12 testes: foco, pausa, temporizadores, nada correndo, a virada no foco, na pausa, com só temporizador e com a fase acabando antes da virada, e a deduplicação por `fase.id`).
- **Fora da cadeia:** o rearme do prazo e da virada nunca sai de dentro de um `setTimeout`. Depois de cada chamada ao wasm, o `motor.js` posta uma mensagem num `MessageChannel`, e o rearme roda nessa tarefa (que não é de timer, então o nível de aninhamento volta a 0), além de rodar direto no `visibilitychange`. O prazo nunca chega a uma cadeia de 5 `setTimeout` aninhados, que é a condição do *intensive throttling* do Chrome. A virada também passa por esse caminho, o que é mais do que o plano pede (ele aceita que ela caia no limite de 1 por minuto). O modo intensivo exige mais de 5 min de aba oculta, e o caso não espera tanto: a ausência de aninhamento vem da construção, não de medição (a sonda foi para depois).
- **Conferência cruzada:** a cada rearme, o `proximoPrazo(retrato)` do `prazo.js` é comparado com o `proximoPrazo` que o wasm devolve (`Engine::proximo_prazo`); uma diferença vira `console.warn('[motor] prazo diverge …')`, e o caso reprova com ela.
- **Folgas:** 15 ms depois do prazo (o `setTimeout` mede num relógio monotônico e o motor lê o `Date.now`) e 50 ms depois da virada.
- **Evento novo:** `tt-web://virada`, `{ fase, minutos, at }`, uma vez por fase e minuto (deduplicado), só com a aba oculta. É o que o `aba.js` do W17 vai ouvir.
- **Caso `segundo-plano`** (servidor de desenvolvimento, 5/5, também com `--celular m`): com restam 5 s, a aba some por `Target.activateTarget` numa segunda aba (novo `t.ativarAba` no `verificar.mjs`), cerca de 3,7 s antes do prazo, e "Sessão de foco concluída." chega à região viva com `visibilityState === 'hidden'` **1,2 a 1,7 s reais depois do prazo** (Chrome headless, que alinha os timers de abas ocultas a 1 s). Com a folga da virada trocada à mão para 6 s (só para a medição, depois desfeita), o prazo sozinho fechou a fase com 1,25 s, então o resultado não depende da virada.
- **Regra 5** no `regras-do-repo.test.mjs`: nenhum `setInterval` em `src/platform/web/`, nenhum arquivo de Worker, e o `motor.js` com o `MessageChannel` e o import do `prazo.js`.
- **Bateria do desktop:** o diff fica nas pastas da web e no `regras-do-repo.test.mjs` (um teste novo). O `npm test` passa sem o `pkg/` (403/403), o `npm run build` do desktop e o contraste também. Nenhum arquivo Rust mudou, então o `cargo` não foi repetido.

## W12: som

*30/09/2026.*

- **`som.js`** (PLANO-WEB, 3.6): `criarSom(deps)` com o navegador injetado (o `index.js` passa o real; o `som.test.js`, 9 testes, um `AudioContext` de mentira). Os WAVs são os do desktop (`src-tauri/sounds/*.wav`), importados com `?url`: o Vite os publica em `dist-web/assets/` com hash (88 KB cada, acima do limite de inline, então nada de `data:` e a CSP `default-src 'self'` basta). A decodificação é na carga, num `OfflineAudioContext`, que não depende de gesto; o `AudioContext` só nasce no primeiro gesto.
- **Gesto:** o `invoke` chama `som.despertar()` antes de ir ao motor em `focus_start`, `focus_resume`, `focus_skip` e `timer_start`, e o `sound_test` também desperta. Criado dentro do clique, o contexto já nasce `running` (sem `resume`); nos gestos seguintes, `resume()` se não estiver `running`.
- **Parado:** `motor.estaCorrendo()` (novo no `motor.js`, sobre o `Engine::is_running`). Cada `tt://state` e `tt://timers` chama `som.revisar()`: parado por 30 s, `suspend()`; algo voltando a correr cancela.
- **Fim de fase ou de temporizador:** o efeito `sound` do motor tem dono (`motor.aoEfeito('sound', …)`) e saiu do `semDono`. Com o contexto suspenso, tenta `resume()` por até 500 ms; sem `running` (página sem ativação, ou o `interrupted`), não toca e anota o motivo. Cada pedido fica no `historico` do `som.js` (até 50), que os casos `retomada` e `estatisticas` passaram a ler no lugar do `semDono` e do `[sem som]`.
- **Volume e fila:** um `GainNode` por som, `gain = volume / 100` lido das configurações na hora de tocar (linear, como o `Pedido::ganho`). Dois sons seguidos começam a 1,5 s um do outro (o `SEGURAR` da thread do `audio.rs`); o "Testar" sem som escolhido toca os dois.
- **Caso `som`** (servidor de desenvolvimento, 8/8, e 8/8 com `--celular m`, em que o "Iniciar" é um `Input.dispatchTouchEvent`): espiões em `AudioBufferSourceNode.prototype.start`, `AudioContext.prototype.resume`/`suspend`, no construtor do `AudioContext` e no `connect` de fonte para `GainNode`. Antes do clique, nenhum contexto; depois do clique real, `running`; o fim do foco, 1 `start`; com `sounds.focusEnd` desligado, nenhum; pausa + 31 s reais, 1 `suspend` e estado `suspended`; "Retomar", `resume` e `running`, e o fim, 1 `start`; temporizador de 1 min fora de sessão, 1 `start`; "Testar", 1 `start`; volume 0, 35 e 100 dão `gain.value` 0, 0,35 (0,3499999940… em float32) e 1.
- **Chrome dos testes com `--mute-audio`** (`scripts/web/chrome.mjs`): os casos tocam de verdade, e nada sai na saída de áudio da sessão.
- **Demais casos** de novo verdes: `fumaca`, `relogio`, `sonda-celular`, `casca`, `foco`, `config`, `temporizador`, `cronometro`, `estatisticas`, `retomada`, `segundo-plano`.
- **Bateria do desktop:** o diff fica nas pastas da web. `npm test` sem o `pkg/` 412/412, `npm run build` do desktop sem `.wasm` e sem `data-forma`. Nenhum arquivo Rust mudou.

## W13: notificações

*30/09/2026.*

- **`i18n::notice_com_atraso(notice, prazo, tz)`** no motor (`tomatito-motor/src/i18n.rs`), com o teste `com_atraso_curto_a_hora_do_prazo_vai_ao_titulo`: "Período de foco concluído às 14:32", "Intervalo concluído às 14:32" e "Sessão concluída às 14:32" (a mesma palavra do atrasado), com o corpo de sempre; o atrasado (`Notice::Late`) sai igual ao `notice`, e um prazo fora do calendário fica sem hora. O desktop não a usa (o `notify.rs` não mudou).
- **Textos prontos nos efeitos** (`tomatito-wasm`): o `notice` virou `AvisoWebDto` (os campos do `AvisoDto`, com o `kind`, achatados, mais `prazo`, `texto` e `textoComAtraso`) e o `timerNotice` ganhou `texto` e `textoComAtraso` ("Temporizador encerrado às HH:MM", o `timer_ended` com `late`). O `prazo` vem do `WebSink`: o `advance_to` do núcleo grava os períodos (com o prazo como fim) antes do aviso, e o sink guarda o `endedAt` do último período concluído até o aviso seguinte. Os textos saem no fuso do navegador (`TimeZone::system()`, pelo Intl). Testes novos: `aviso_de_fase_com_prazo_e_textos` e `aviso_de_temporizador_com_textos`.
- **`avisos.js`** (dono do `notice` e do `timerNotice`, que saíram do `semDono`): só com `Notification.permission === 'granted'` (nunca pede; o pedido é do W14); `registration.showNotification(título, { body, tag, silent, renotify: !silent, timestamp: prazo, lang })`, com `tag` `tomatito:fase` ou `tomatito:temporizador`. `silent` quando o som do mesmo passo tocou: o `index.js` guarda a promise do `som.tocar` do `sound` e a entrega ao aviso que vem logo depois (o `sound` sempre vem antes). De 10 s de atraso em diante (medido na hora do efeito), o título é o `textoComAtraso`. Sem permissão, sem suporte, sem service worker ativo em 5 s ou com erro, nada lança: o motivo fica no `historico` (até 50), que os casos `temporizador` e `retomada` passaram a ler no lugar do `semDono`. `avisos.test.js`: 8 testes.
- **`sw.js`** mínimo (`src/platform/web/sw.js`): só o `notificationclick` (fecha o aviso, foca a aba do Tomatito, a visível primeiro, ou abre o escopo). Sem `fetch` e sem precache (W16). O `plugin-web.mjs` o emite na raiz do `dist-web` como `sw.js`, sem hash, e o serve do arquivo no dev (`Cache-Control: no-cache`). O `index.js` o registra na carga, com escopo na base.
- **Caso `avisos`** (servidor de desenvolvimento, 6/6, também com `--celular m`): `Browser.setPermission` em `granted` (novo `t.navegador` no `verificar.mjs`, para os comandos do DevTools fora da aba), TZ de São Paulo e o relógio de teste às 14:02:40 de 21/09/2026; o sw.js ativo em `/sw.js` com escopo `/`; o fim do primeiro foco de 60 min dá 1 aviso em `tomatito:fase` com "Período de foco concluído" e "Intervalo de 5 min. Próximo foco às 14:35." (os textos do teste do `i18n.rs`) e `silent === true` (o som tocou); um único `__ttAvancar` de 30 s além do prazo do intervalo, com a aba visível, dá "Intervalo concluído às 14:35"; o temporizador de 1 min dá "Temporizador encerrado", "1 min"; com `denied`, nenhum aviso, nenhum erro no console e o motivo no histórico. Repetido 6 vezes seguidas sem falha.
- **Chrome dos testes com `--disable-features=NativeNotifications,SystemNotifications`** (`scripts/web/chrome.mjs`): sem isso, no Linux, o Chrome headless entrega cada aviso ao servidor de notificações da sessão pelo D-Bus (conferido com `dbus-monitor`: 6 chamadas `Notify` numa rodada), o aviso aparece no GNOME de quem roda os testes, e o `getNotifications` voltava vazio em cerca de 1 rodada de cada 3 (o GNOME fechava o aviso). Com a opção, 0 chamadas `Notify` e nenhuma falha.
- **Build:** `dist-web/sw.js` presente; com o `vite preview` do build, o sw.js fica ativo em `/sw.js` com escopo `/` (conferido por um caso descartável). O `dist/` do desktop continua sem `sw.js` e sem `serviceWorker` (invariante da bateria).
- **`.wasm`:** **543 253 bytes**, eram 534 103 no W09: os textos dos avisos (`i18n::notice`, `notice_com_atraso` e `timer_ended`, que o `wasm-opt` tirava por não terem uso) somam 9 150 bytes. Continua acima do limite de 532 480 (decisão pendente em `docs/depois.md`).
- **`npm run test:wasm`:** Node e Chrome com **113 passando e 3 ignorados** (os 2 testes novos do `lib.rs`; os do motor rodam só no nativo).
- **`--todos`:** os 13 casos verdes no perfil de desktop e no `--celular m`.
- **Bateria do desktop** (o `i18n.rs` do motor é compartilhado): `bash scripts/web/bateria-desktop.sh <pasta> --app`, saída 0. `build.txt` igual ao da base (todos os passos com 0, inclusive `cargo fmt --check`, `clippy -D warnings`, `cargo test --workspace`, contraste, `build:debug`, os invariantes do `dist/` e o `desktop-sem-celular`); nenhum teste da base sumiu (cargo 245 → 267, node 368 → 420); `arvore-desktop.txt` só com a linha do `tomatito-motor` (a do W04a); 24/24 capturas iguais; `app-real.txt` igual ao da base (aparencia 21/21, configuracoes 17/17, config-sistema 16/16, retomada 25/25, tomate 28/28).
- **Fora do escopo** (roteiro manual do W26): o clique no aviso voltando à aba e a entrega no Chrome do Android de verdade.

### W13: correções da verificação

*30/09/2026.*

- **O caso `avisos` era intermitente** (a verificação viu 5 falhas em cerca de 40 rodadas, e 4 em 6 com 12 processos de carga): `(b)`/`(c)` ou `(e)` sem aviso no `getNotifications`, com o som tocado. Reproduzido aqui com `Emulation.setCPUThrottlingRate` 8 na aba (3 falhas em 10). Com o registro do DevTools das notificações (`BackgroundService`, service `notifications`) e o `historico` do avisos.js no detalhe, as rodadas que falhavam mostraram: `showNotification` resolvido (`mostrado: true`, nenhum aviso de erro), um "Notification displayed" do Chrome para a tag, nenhum "Notification closed", e mesmo assim o `getNotifications` vazio por mais 30 s. Não é defeito de entrega do avisos.js nem do sw.js (a espera do som e do `registroAtivo` acaba antes do `showNotification`, que resolveu), nem só prazo curto: o `getNotifications` do Chrome sincroniza o registro com a central e tira dele os avisos que a central ainda não mostra, e o caso o chamava a cada 50 ms justamente na janela entre o `showNotification` resolver e a central mostrar o aviso (janela que cresce com a máquina ocupada). O app nunca chama o `getNotifications`.
- **Correção, só no teste:** o `verificar.mjs` guarda os eventos do `BackgroundService` de cada aba (`pagina.segundoPlano`); o caso liga o registro das notificações, espera o "Notification displayed" da tag (até 15 s), dá 1 s e lê o `getNotifications` uma única vez, sem sondar. O `(d)` passou a conferir também `length === 1` e o título na leitura única; o `(f)` confere também que nenhum "Notification displayed" novo chegou com `denied`. Os detalhes de `(b)` e `(e)` levam o `historico` e se o aviso foi exibido, para a próxima falha já dizer onde parou. Nenhum arquivo do `src/` mudou.
- **Rodadas:** com a aba a 8× mais lenta, 10/10; com a aba a 8× e 24 processos de carga (load acima de 40), 6/6 no perfil de desktop e 6/6 no `--celular m`; sem carga, 10/10 em cada perfil. `--todos` verde nos dois perfis (13 casos). `npm test` 420/420.
- **Bateria do desktop** (`bash scripts/web/bateria-desktop.sh <pasta> --app`, com a faixa Android compilando ao mesmo tempo): saída 0; `build.txt` igual ao da base; nenhum teste da base sumiu (cargo 245 → 267, node 368 → 420); `arvore-desktop.txt` só com a linha do `tomatito-motor`; 24/24 capturas iguais; `app-real.txt` igual ao da base (aparencia 21/21, configuracoes 17/17, config-sistema 16/16, retomada 25/25, tomate 28/28). O 16/17 do `configuracoes` que a verificação viu uma vez ("volume vai a 97 pelo teclado": 99 na tela, 97 no disco) não se repetiu aqui nem nas duas rodadas isoladas dela; o W13 não toca nesse caminho.

## W14: pedido de permissão e seção Avisos

*30/09/2026.*

- **`permissao.js`** (`src/platform/web/`): o estado (`default`, `granted`, `denied` ou `sem-suporte` sem a API), o `pedir()` (o único `Notification.requestPermission` do app; uma regra nova do `regras-do-repo.test.mjs` confere), o "Agora não" em `tomatito:web.avisoDispensado`, o `assinar` (acompanha o `permissions.query`, então mudar pelo cadeado aparece sem recarregar) e o `testar` (um aviso na tag `tomatito:teste`, pelo service worker). Chega às telas como `avisosDaCasca` do `#plataforma`; no desktop, `avisosDaCasca = null` no `platform/tauri.js`. `permissao.test.js`: 9 testes.
- **InfoBar** (`src/views/focus/pedido-de-avisos.js`): o `card-session.js` emite `tt-foco-iniciado` no cartão depois de um início aceito (clique ou Espaço); o InfoBar ouve e aparece logo depois do rodapé "A seguir:" só com `recursosDaCasca.notificacoes`, permissão `default` e sem "Agora não". "Permitir avisos" pede no próprio clique (o `avisosDaCasca` fica guardado desde o início, sem `await` antes do pedido); recusado, vira "Avisos bloqueados neste navegador…" com [Fechar]; aceito ou fechado sem resposta, some. "Agora não" grava a chave e some.
- **Seção Avisos** (`src/views/avisos-web.js`, ligada por uma linha no `settings.js`, como o `opcao-x11.js`): só com `casca.web`, logo depois da Aparência. Os 4 estados com os textos da seção 4 do PLANO-WEB; o rodapé com "No navegador, o aviso depende de a aba continuar aberta." e o texto do celular da seção 7 do PLANO-WEB-V1 (no lugar do número do W10); no 4º estado, a linha do iPhone e do iPad. O estado vem do `recursosDaCasca.notificacoes` (sem ele, o 4º) e da permissão; o `recursos.js` não mudou (`git diff main -- src/platform/recursos.js` vazio).
- **Ícones novos:** `alert_20_regular` (o cartão) e `info_16_filled` (o InfoBar), pela lista do `copy-icons.mjs` (40 ícones). O desktop os carrega no catálogo, mas nenhuma tela dele os usa.
- **Textos** no `pt-BR.js`: `pedidoDeAvisos` (fora do `foco`, que o teste da tela Foco confere chave a chave) e `configuracoes.avisos`.
- **Caso `permissao`** (servidor de desenvolvimento, 11/11, também com `--celular m`): espião em `Notification.requestPermission` injetado antes de cada documento; 0 pedidos ao carregar e ao iniciar, 1 depois do clique real em "Permitir avisos"; "Agora não", recarregar e iniciar de novo não mostra o InfoBar; sem `Notification` (apagado por script injetado), nenhum InfoBar e o 4º estado; o cartão acompanha o `Browser.setPermission` sem recarregar; "Testar aviso" dá 1 aviso na tag `tomatito:teste`; "Permitir avisos" nas Configurações dá 1 pedido. Capturas: `docs/capturas/web-avisos-{default,granted,denied,sem-suporte}.png` (1000×700) e `web-cel-avisos-*.png` (perfil `m`), mais `web-avisos-infobar.png` e `web-cel-avisos-infobar.png` só para revisão.
- **Achado:** o Chrome headless nunca mostra a janela de permissão; num perfil novo ele recusa (`denied`), e com `Browser.setPermission` em `prompt` ele fecha sem resposta (`default`). O `Browser.resetPermissions` não desfaz uma recusa dada pelo próprio pedido; o caso usa `prompt`. O item (c) aceita os dois desfechos (o bloqueio ou o InfoBar sumindo) e confere o que o navegador respondeu. Ver a janela de verdade fica como pendência do usuário (item 120).
- **`--todos`:** os 14 casos verdes no perfil de desktop e no `--celular m`. `npm test` 436/436 (eram 420; 15 testes novos e a regra nova). O `dist/` do desktop continua sem `serviceWorker`, sem `requestPermission` e sem `tomatito:web.avisoDispensado`.
- **Bateria do desktop** (o `card-session.js`, o `focus/index.js`, o `settings.js`, o `pt-BR.js`, o `platform/tauri.js`, o `shell.css` e os ícones são compartilhados): `bash scripts/web/bateria-desktop.sh <pasta> --app`, saída 0; `build.txt` igual ao da base; nenhum teste da base sumiu (node 368 → 436); `arvore-desktop.txt` só com a linha do `tomatito-motor` (a do W04a); 24/24 capturas iguais, inclusive as Configurações a 1000×700 e a 480×500 nos 3 temas; `app-real.txt` igual ao da base (aparencia 21/21, configuracoes 17/17, config-sistema 16/16, retomada 25/25, tomate 28/28).

## W16: PWA (instalável e offline)

*30/09/2026.*

- **Ícones** (`scripts/web/icones.mjs`): rasterizados do `src-tauri/icons/icon.svg` (M44) pelo Chrome headless, em `src/platform/web/icones/`: `icone-192.png`, `icone-512.png` (o próprio SVG, fundo transparente, `any`) e `icone-maskable-512.png` (o gradiente do disco de ponta a ponta e o anel a 0,9, com raio externo de 281 px de 1024, dentro da zona segura de 409,6). Os PNG ficam no repositório (o build não precisa do Chrome); `node scripts/web/icones.mjs --conferir` confere que batem com o SVG (a rasterização é determinística: duas rodadas, bytes iguais).
- **`plugin-web.mjs`:** o `<link rel="manifest">` no `<head>` (dev e build), o `manifest.webmanifest` na raiz (id, `start_url` e `scope` em `/`, `standalone`, `pt-BR`, cor do Lite, `launch_handler.client_mode: focus-existing`, os 3 ícones em `assets/` com hash no nome) e, no `generateBundle` (`order: 'post'`, depois do `index.html` do Vite), o `sw.js` com o precache: todos os arquivos publicados, com a página como `./` e sem o próprio `sw.js` (19 entradas hoje). **`grep -c 'index.html' dist-web/sw.js` = 0.** O nome do cache é `tomatito-<versão do Cargo.toml>-<hash8>`; a versão é lida pelo próprio plugin (`versaoDoCargo`), para a linha do `vite.web.config.js` que a regra do W07a confere não mudar.
- **`sw.js`:** `install` com `cache.addAll` (pedidos `cache: 'reload'`), sem `skipWaiting`; `activate` apaga os caches `tomatito-*` que não são o atual; `message` `SKIP_WAITING` chama o `skipWaiting`; `fetch` só com o precache (no dev a lista é vazia e nada é interceptado): navegação para a raiz do escopo recebe o `./` guardado, o resto casa pelo pedido, senão vai à rede. O `cache.match` usa `ignoreVary: true`: o `vite preview` responde com `Vary: Origin`, e os módulos (pedidos com `Origin`, por causa do `crossorigin`) não casavam com o que o precache guardou; offline, a página vinha e os scripts falhavam (visto na primeira rodada do caso).
- **Atualização** (`src/platform/web/atualizacao.js`, 4 testes): um SW em `waiting` com a página já controlada é aplicado na hora (`SKIP_WAITING`, e uma recarga no `controllerchange` que a página pediu) só com nada correndo (`motor.estaCorrendo()`, lido depois do `motor.iniciar()`, para uma fase retomada contar); com algo correndo, fica "pronta" e só o botão aplica, e só com nada correndo. A primeira instalação não recarrega. Exposta às telas como `atualizacaoDaCasca` (null no `platform/tauri.js`).
- **Cartão "Atualizar"** (`src/views/atualizar-web.js`, 4 testes; uma linha no `settings.js`, como o avisos-web.js): seção "Atualização" antes do Sobre, só com `casca.web` e um SW em `waiting`: "Nova versão disponível", com o botão habilitado ("Já baixada. Ao atualizar, a página recarrega.") ou desabilitado ("…encerre a sessão e os temporizadores em andamento."). Ícone novo `arrow_sync_20_regular` (41 ícones).
- **Caso `pwa`** (preview, 9/9, também com `--celular m`; 3 rodadas seguidas sem falha): (a) `Page.getAppManifest` sem erros e `Page.getInstallabilityErrors` vazio; (b) o `sw.js` sem `index.html`, SW ativo com 1 cache e as 19 entradas guardadas; (c) com o servidor derrubado (`t.servidor.parar()`, novo no `verificar.mjs`), recarregar mostra o Foco servido pelo SW, e "Iniciar" começa a sessão, que anda com o relógio de teste; (d) com a fase correndo, o segundo build (`TOMATITO_WEB_BUILD=teste2 npm run build:web -- --outDir <tmp>`) sobe na mesma origem (`t.servidor.subir({ outDir })`), o `update()` deixa um SW em `waiting` e a página não recarrega; (e) o cartão aparece desabilitado durante a fase, e depois de encerrar nada recarrega sozinho e o botão habilita; (f) o clique ativa o SW do `teste2`, a página recarrega uma vez, e `caches.keys()` devolve 1 cache com nome diferente do anterior.
- **Desvio:** o segundo build vai para uma pasta temporária (`--outDir`), e não para o `dist-web`, para o caso não deixar o `dist-web` com o build de teste; o comando e a variável são os do plano. O hash do nome do cache usa, além da lista, o sha256 do conteúdo de cada entrada (a página e os documentos não têm hash no nome; sem isso, uma mudança só no `index.html` manteria o nome).
- **`--todos`:** os 15 casos verdes no perfil de desktop e no `--celular m`. `npm test` 451/451 (eram 436). Testes da web (`node --conditions=tomatito-web --test "src/platform/web/**/*.test.js"`): 62/62.
- **Bateria do desktop** (o `settings.js`, o `pt-BR.js`, o `platform/tauri.js`, o `copy-icons.mjs` e os ícones são compartilhados): `bash scripts/web/bateria-desktop.sh <pasta> --app`, saída 0; `build.txt` igual ao da base; nenhum teste da base sumiu (cargo 267, node 368 → 451); `arvore-desktop.txt` só com a linha do `tomatito-motor` (a do W04a); 24/24 capturas iguais, inclusive as Configurações nos 3 temas e nos 2 tamanhos; `app-real.txt` igual ao da base (aparencia 21/21, configuracoes 17/17, config-sistema 16/16, retomada 25/25, tomate 28/28). O `dist/` do desktop continua sem `sw.js`, `*.webmanifest` e `serviceWorker`.
