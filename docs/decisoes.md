# Decisões e desvios

Registro das versões conferidas e de tudo o que se afastou do `PLANO.md` (em `~/dev/tomatito-ref/`), com o motivo. Entradas novas vão no fim de cada seção, com o marco.

## Versões conferidas

### M01 (26/09/2026)

| Item | Versão | Como foi conferido |
|---|---|---|
| WebKitGTK (sistema) | 2.52.6 | `pkg-config --modversion webkit2gtk-4.1` |
| tauri | 2.12.0 | `Cargo.lock` |
| tauri-build | 2.7.0 | `Cargo.lock` |
| tauri-runtime / tauri-runtime-wry | 2.12.0 | `Cargo.lock` |
| tauri-utils / tauri-codegen / tauri-macros | 2.10.0 / 2.7.0 / 2.7.0 | `Cargo.lock` |
| tao | 0.37.1 | `cargo tree -i tao` |
| wry | 0.57.0 | `cargo tree -i wry` |
| webkit2gtk (crate) | 2.0.2 | `cargo tree -i webkit2gtk` |
| gtk (crate) | 0.18.2 | `Cargo.lock` (a mesma que o M05 vai pedir) |
| tauri-cli | 2.12.0 | `npm run tauri -- --version` |
| @tauri-apps/api | 2.12.0 | `package.json` |
| @fluentui/web-components | 3.1.3 | `package.json` |
| @fluentui/tokens | 1.0.0-alpha.24 | `package.json` |
| @microsoft/fast-element (transitiva) | 3.0.3 | `npm ls --all` |
| @microsoft/focusgroup-polyfill (transitiva) | 1.6.0 | `npm ls --all` |
| vite | 8.3.1 | `npm ls --all` (no `package.json` ainda está `^8.3.0`; o M02 fixa) |
| Node / npm | 22.23.2 / 10.9.8 | `node --version`, `npm --version` |
| Rust / Cargo | 1.95.0 / 1.95.0 | `rustc --version` |
| Google Chrome (prévia headless) | 153.0.8010.52 | `google-chrome --version` |

Ambiente no M01 (seção 6.4 do plano):
- `XDG_SESSION_TYPE=wayland`; `WEBKIT_DISABLE_DMABUF_RENDERER` vazio. A janela abriu sem precisar da variável.
- `df -h /home /`: `/home` com 13 GB livres (92% de uso); `/` com 201 GB livres.
- `target-dir` em `/opt/cargo-target/tomatito` (3,0 GB depois do primeiro build de debug e do clippy). `src-tauri/target/` não existe.
- Na janela real, o WebKitGTK informa o userAgent `Mozilla/5.0 (X11; Ubuntu; Linux x86_64) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/60.5 Safari/605.1.15`. O "X11" é fixo no userAgent do WebKitGTK; o protocolo usado foi Wayland (ver `docs/verificacao-manual.md`).

### M02 (26/09/2026)

Versões fixadas conforme a seção 3.6. Todas as entradas do `package.json` estão exatas (`grep -nE '"[\^~]' package.json` não imprime nada), e o `.npmrc` com `save-exact=true` mantém assim as próximas instalações.

| Item | Versão | Onde |
|---|---|---|
| vite | 8.3.1 | `devDependencies` (era `^8.3.0`) |
| @fluentui/svg-icons | 1.1.343 | `devDependencies` (novo) |
| @microsoft/fast-element | 3.0.3 | `dependencies` (antes só transitiva; é `peerDependency` do Fluent) |
| @microsoft/focusgroup-polyfill | 1.6.0 | `dependencies` (idem) |
| @fontsource-variable/inter | 5.3.0 | `dependencies` (novo; usado no M06) |
| tomatito-core | 0.1.0 | membro do workspace em `src-tauri/tomatito-core` |

### M03 (26/09/2026)

Conferido sem criar nada no GitHub (só leituras: `git ls-remote` e `gh repo view`).

| Item | Versão | Como foi conferido |
|---|---|---|
| actions/checkout | v7 (aponta para a v7.0.1) | `git ls-remote --tags https://github.com/actions/checkout` |
| actions/setup-node | v7 (aponta para a v7.0.0) | idem |
| Swatinem/rust-cache | v2 (última: v2.9.2) | idem |
| actionlint (só para validar o `ci.yml`, fora do repositório) | 1.7.12 | binário da release oficial, baixado no scratchpad da sessão |
| Node no CI | 22 (a última 22.x do runner) | `setup-node` com `node-version: 22` |
| Rust no CI | a stable do runner (sem fixar) | o passo "Rust" imprime `rustc --version` |

O nome `kbrianps/tomatito` estava livre em 26/09/2026: `gh repo view kbrianps/tomatito` respondeu "Could not resolve to a Repository".

### M04 (26/09/2026)

| Item | Versão ou valor | Como foi conferido |
|---|---|---|
| GNOME Shell / Mutter | 50.1 / 50.1 | `gnome-shell --version`; o shell aninhado registra "using mutter 50.1" |
| WebKitGTK (sistema) | 2.52.6 | sem mudança desde o M01 |
| tao / wry | 0.37.1 / 0.57.0 | sem mudança desde o M01 |
| GPU usada pelo app na sessão real | Intel Alder Lake-S UHD Graphics (i915), `/dev/dri/renderD128`, PCI 0000:00:02.0 | descritores abertos pelo `tomatito` e pelos dois `WebKitWebProcess` (`/proc/<pid>/fd`). A NVIDIA (`renderD129`, PCI 0000:01:00.0) não aparece |
| Monitor da sessão | painel AUO 1920×1080, escala 1 | `wl_output.mode` e `wl_output.scale` no `WAYLAND_DEBUG` |
| userAgent do WebKitGTK | `Mozilla/5.0 (X11; Ubuntu; Linux x86_64) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/60.5 Safari/605.1.15` | sonda na janela `tomato` |
| Renderizador WebGL informado | vendor "Apple Inc.", renderer "Apple GPU" (WebGL 2.0), mesmo com `WEBGL_debug_renderer_info` | sonda na janela `tomato`; ver o achado 3 do spike A |

## Spike do Full (M04–M05)

Seção 5.8 do plano. O código do spike está na branch `spike/full`; a `main` recebe só este registro e as capturas.

### Spike A: janela-tomate transparente (M04, 26/09/2026)

**Resultado: a transparência funciona** no GNOME 50.1 Wayland desta máquina, com a Intel. O veredito B3 fica descartado aqui (a menos que a conferência na tela, em `docs/verificacao-manual.md`, mostre o contrário). A escolha entre A e B1 depende da região de entrada e sai no M05.

**Como foi conferido sem olhar a tela.** Duas frentes:

1. **GNOME Shell 50.1 aninhado, sem tela** (`scripts/aninhado/rodar.sh`, na branch `spike/full`). É o mesmo Mutter da sessão, rodando headless num monitor virtual de 1920×1080 e isolado da sessão de verdade (detalhes no desvio 5 do M04). O app de debug conecta nele, e um roteiro dentro do próprio shell tira capturas e usa um ponteiro virtual. O `rodar.sh` roda tudo e imprime as conferências. Resultado da rodada final:

   | Item do "Pronto quando" | Resultado |
   |---|---|
   | Os quatro cantos mostram a área de trabalho | Nos quatro cantos, o bloco de 24×24 px é idêntico, pixel a pixel, à captura do fundo sem o tomate: diferença máxima 0 e nenhum pixel preto ou branco novo. Na caixa de 280×280, 38,8% dos pixels são iguais ao fundo; o resto é o tomate com a sombra. |
   | Arrastar pelo corpo e pelo cálice | A janela andou exatamente o que o ponteiro andou. Pelo corpo (alvo `use.hit`): (150, 40). Pelo cabinho (`path.stem`): (−160, 60). Por uma sépala do cálice, fora do corpo (`path` em `g.calyx`): (−120, −80). |
   | Os 5 botões respondem | As 5 linhas `[tomato] botão: voltar / configuracoes / reiniciar / iniciar-pausar / pular` chegaram do console, e a janela não se mexeu com os cliques. |
   | Captura | `docs/capturas/spike-a.png`, tirada no shell aninhado (o fundo é o papel de parede padrão dele). |

2. **Sessão real, por uns 10 s**, com a sonda na página e `WAYLAND_DEBUG=client`:
   - a superfície da `tomato` recebe buffers ARGB8888: `wl_shm` formato 0 no primeiro quadro e, depois, dmabuf `AR24` (875713089) do EGL da Mesa;
   - a `tomato` nunca chama `set_opaque_region`, ao contrário da `main`. Então o Mutter faz a mistura pelo alfa;
   - a geometria é `0, 0, 280, 280`, a página desenhou (`html` e `body` com `rgba(0, 0, 0, 0)`, 280×280, `devicePixelRatio` 1) e não houve erro de protocolo;
   - a GPU é a Intel (tabela de versões acima);
   - o shell aninhado mostrou os mesmos pedidos ao compositor (mesmos formatos, sem região opaca), então a captura do item 1 vale para o caminho da sessão real.

**Achados:**
1. **`visible(true)` no builder deixa a janela errada, na maioria das vezes.** O tao chama `set_visible` antes de `set_decorated(false)` e do `set_titlebar`. No Wayland, o GTK então mapeia a janela ainda decorada: o `xdg_toplevel` nasce com `set_min_size(112, 37)` da barra padrão. Em 11 de 15 rodadas no shell aninhado, a janela ficou com 332×369: a barra de título vazia de 37 px mais a margem de sombra do CSD, de 26 px de cada lado. Nessas rodadas, a página também parou de desenhar (o `requestAnimationFrame` não voltou em 30 s). Com `visible(false)` e `show()` logo depois, foram 15 de 15 rodadas certas: `set_min_size(280, 280)` e geometria `0, 0, 280, 280`. É o que a seção 5.3 e o M05 já pedem (a janela nasce escondida e só aparece no `show()`). Ver o desvio 1.
2. **Sem região, a caixa inteira é da janela.** O GTK define a região de entrada como a janela toda mais 10 px de folga (`set_input_region` com `-10, -10, 300, 300`). Um clique a 4 px do canto chegou à página, no `body`. É o ponto de partida do M05.
3. **O WebKitGTK mascara o renderizador WebGL.** Mesmo com `WEBGL_debug_renderer_info`, a página vê só "Apple Inc." e "Apple GPU". A chave `fullValidated` (3.3, 5.7 e 5.9) usa "userAgent + renderizador WebGL" para saber se a combinação já foi validada, e assim ela não distingue a Intel da NVIDIA nem uma troca de driver. **A decidir no M51:** trocar essa chave, por exemplo, pela versão do WebKitGTK mais a GPU lida no Rust (o nó DRM ou o `GL_RENDERER` de um contexto EGL próprio). O `webkit://gpu` mostra o renderizador de verdade, mas é uma página interna, fora do alcance do JS do app.
4. **`always_on_top(true)` não tem efeito no Wayland,** como previsto (3.8): o Mutter informa `is_above() = false`.

## Desvios do plano

### M01

1. **create-vite e tauri init sem perguntas.** O plano manda responder "No" à pergunta "Install with npm and start now?" e responder as perguntas do `tauri init`. Como o marco foi feito sem terminal interativo, usei as flags equivalentes: `npm create vite@latest . -- --template vanilla --no-interactive --no-immediate` e `npx tauri init --ci -A Tomatito -W Tomatito -D ../dist -P http://localhost:5173 --before-dev-command "npm run dev" --before-build-command "npm run build"`. O resultado é o mesmo.
2. **Arquivos de demonstração do template removidos.** O `src/main.js` do plano não importa mais `counter.js`, `style.css`, `src/assets/*` nem os SVGs de `public/` (logos do Vite). Eles foram apagados para não irem para o repositório sem uso; o `<link rel="icon">` do Vite saiu do `index.html`. O `<title>` virou "Tomatito". O `lang="pt-BR"` fica para o M02, como no plano.
3. **Janela ainda declarada no `tauri.conf.json`.** O M01 usa a janela do template (800×600, rótulo `main`, título "Tomatito"). O `app.windows: []` e a `main` criada em Rust (seções 3.4 e 4.7) ficam para o marco que cria a `main_window.rs`.
4. **`cargo fmt` aplicado ao código do template.** O template do `tauri init` usa 2 espaços; o `rustfmt` padrão usa 4. Formatei agora para o `cargo fmt --all --check` do CI (M03) já passar.
5. **`features = []` no `Cargo.toml`.** O próprio `tauri dev` reescreve as linhas de `tauri` e `tauri-build` com `features = []` (ele sincroniza as features com a configuração). Mantido.
6. **Harness de prévia no navegador (fora do plano).** Criado `scripts/preview/` para conferir o visual no Chrome headless sem abrir janelas na sessão do usuário:
   - `tauri-mock.js`: usa `mockIPC` e `mockWindows` do `@tauri-apps/api/mocks`; os comandos ganham respostas fixas à medida que as telas os chamarem;
   - `vite.config.js`: estende o da raiz e injeta o mock só no servidor de prévia (porta 5174). O build de produção não conhece essa pasta; conferido com `grep` no `dist/`;
   - `shot.mjs` (`npm run shot -- ...`): sobe o Vite, abre o Chrome headless pelo protocolo DevTools (WebSocket nativo do Node 22, sem dependência nova), executa `--eval`, `--click`, `--wait` e `--shot` em ordem e fecha tudo.
   - Motivo: o trabalho é feito sem poder olhar a tela; a prévia dá capturas reprodutíveis. Ela não substitui a conferência no WebKitGTK, que continua em `docs/verificacao-manual.md`.
7. **Arquivos de documentação a mais.** `docs/verificacao-manual.md` (passos que só uma pessoa consegue conferir) e `docs/pendencias-usuario.md` (o que depende de você) não estão na árvore da seção 3.7. Entram porque o trabalho é feito sem acesso à tela nem a `sudo`.
8. **Checagem cruzada para Windows, sem máquina Windows.** `rustup target add x86_64-pc-windows-msvc` (só a std, em `~/.rustup`). O `cargo check --target x86_64-pc-windows-msvc` falha no build script do `tauri-build` com `NotAttempted("llvm-rc")`, porque o `tauri-winres` procura `llvm-rc` no PATH e o Ubuntu só instala `llvm-rc-18/19/21`. Com o `llvm-rc` do LLVM 21 à frente no PATH, passa:

   ```bash
   cd src-tauri
   PATH=/usr/lib/llvm-21/bin:$PATH cargo check  --target x86_64-pc-windows-msvc
   PATH=/usr/lib/llvm-21/bin:$PATH cargo clippy --target x86_64-pc-windows-msvc -- -D warnings
   ```

   Os avisos `GNU compiler is not supported for this target` vêm do crate `cc` no build script e não afetam o `check`. Isso só confere tipos e `cfg`; não linka nem roda nada. O teste real no Windows segue em `docs/pendencias-usuario.md`.

### M02

1. **Crates da seção 3.6 entram quando forem usados.** Ficaram fixados agora só os que o projeto já usa: `tauri` `=2.12.0` e `tauri-build` `=2.7.0` (com `=`), mais `serde` e `serde_json` (travados pelo `Cargo.lock`). Os plugins, `rodio`, `rusqlite`, `tokio`, `jiff`, `gtk`, `windows` e as features `tray-icon` e `image-png` do `tauri` entram nos marcos que os usam, com as versões da 3.6. Motivo: dependência sem uso só aumenta o build (o `rusqlite` com `bundled` compila o SQLite em C), e o `tauri dev` reescreve a lista de features do `tauri` para casar com a configuração (visto no M01), então a `tray-icon` é conferida junto com a bandeja. Os pacotes npm da 3.6 entraram todos, porque não custam build e o "Pronto quando" é sobre o `package.json`.
2. **O app ainda não depende do `tomatito-core`.** O workspace existe (`[workspace] members = ["tomatito-core"]` no `src-tauri/Cargo.toml`), mas a linha `tomatito-core = { path = "tomatito-core" }` entra no M16, quando o `engine.rs` passa a usar o motor.
3. **Teste do núcleo.** O "1 teste" do `tomatito-core` confere a própria regra de isolamento: lê o `Cargo.toml` do crate com `include_str!` e falha se alguma dependência direta for `tauri`, `wry`, `tao`, `gtk`, `webkit2gtk` ou `webview2*`. Conferido por mutação (numa cópia fora do repositório, com `tauri` como dependência, o teste falha com "o tomatito-core não pode depender de `tauri`").
4. **`npm test` com testes de regras do repositório.** O `node --test` ainda não tinha o que testar (o `format.test.js` vem depois), então entrou `scripts/regras-do-repo.test.mjs`, que confere: versões npm exatas; `tauri` e `tauri-build` com `=` e no mesmo major.minor dos pacotes `@tauri-apps/*` (regra de atualização da 3.6); `version` ausente do `tauri.conf.json` e do `package.json`; a CSP exata da 3.8; `<html lang="pt-BR">` sem `<style>` nem `style="..."` no `index.html`; e a palavra proibida (1.1) fora do `package.json`, do `Cargo.toml`, do `tauri.conf.json`, do README, do `index.html` e de `src/`. Conferido por mutação (com `^8.3.1` no `vite`, o teste 1 falha).
5. **`version` removida do `package.json`** (e da raiz do `package-lock.json`). O `0.0.0` vinha do template do Vite; a versão vive só no `Cargo.toml` (1.1). O pacote é `private`, então o npm não exige o campo.
6. **`.gitignore` único na raiz.** O `src-tauri/.gitignore` do `tauri init` foi apagado, e as duas linhas dele (`target/` e `gen/schemas`) foram para o da raiz, junto com as da lista do M02. Ficaram também as entradas úteis do template do Vite (logs, editores, `*.local`).
7. **`.npmrc` com `save-exact=true`** (fora do plano). Um `npm i` sem `--save-exact` não reintroduz o `^`.
8. **Titular no `LICENSE`:** "kbrianps", o mesmo nome do `authors` do `Cargo.toml`. O `git config user.name` é outro; se preferir o nome completo, basta trocar a linha do copyright.
9. **`docs/depois.md` começa com a lista da seção 2.2** (o estacionamento do plano), mais uma seção "Novas" para o que surgir nos marcos.
10. **CSP.** Está no `tauri.conf.json` e passou pelo `generate_context!` (o `cargo clippy --workspace` recompilou o app com ela). O efeito no WebView só aparece no build e fica para o M08, como no plano.

### M03

1. **O repositório no GitHub não foi criado, e o push não foi feito.** O pré-requisito do marco (plano 1.2, item 4) continua sendo decisão sua, e criar repositório, adicionar remote e dar push estavam fora do que eu podia fazer nesta rodada. Ficou pronto tudo o que é local: o `.github/workflows/ci.yml`, validado com o `actionlint`, e os seis passos rodados em sequência, no Linux, numa cópia limpa do que foi para o commit. O `gh repo create`, o `gh repo edit` e o "Pronto quando" (push verde nos dois sistemas) estão em `docs/pendencias-usuario.md`, com os comandos exatos.
2. **`shell: bash` em todos os passos** (fora do plano). No Windows, o padrão do Actions é o PowerShell; com o Git Bash, os comandos são os mesmos nos dois sistemas, e nada depende de como o PowerShell trata o `--` do `cargo clippy --workspace -- -D warnings`.
3. **`fail-fast: false`, `concurrency` e `permissions: contents: read`** (fora do plano). Sem o `fail-fast: false`, uma falha no Linux cancelaria o Windows, e o "verde nos dois" precisa ver os dois. O `concurrency` cancela a rodada anterior quando chega outro push no mesmo ramo. O token do CI fica só com leitura.
4. **Rust sem versão fixada no CI.** O plano não fixa a toolchain; o CI usa a stable que vem no runner (hoje pode ser mais nova que a 1.95.0 local) e roda `rustup component add rustfmt clippy`, que não faz nada se os componentes já estiverem lá. Se um lint novo do clippy quebrar o CI, a correção é no código. Fixar com `rust-toolchain.toml` só se isso virar rotina.
5. **Pacotes do apt: a lista inteira da seção 6.2**, inclusive o `patchelf`, que só o AppImage usa. Assim a lista do CI e a da máquina não divergem.
6. **`.gitattributes` com `* text=auto eol=lf`** (fora do plano). O runner do Windows faz o checkout com `core.autocrlf=true`, o que trocaria os finais de linha para CRLF. Com LF em todo lugar, o `rustfmt`, o `include_str!` do teste do núcleo e os testes de regras veem os mesmos bytes nos dois sistemas. PNG, JPG, ICO, ICNS, WAV e WOFF2 ficam marcados como binários. O `git add --renormalize .` não mudou nenhum arquivo (todos já estavam em LF).
7. **Manifesto do Windows pelo linker, no `build.rs`** (fora do plano). O `tauri-build` põe o manifesto do Common Controls v6 só no `.exe` do app, como recurso (`rustc-link-arg-bins`). Os binários de teste do `cargo test` ficam sem ele e, como importam funções que só existem no comctl32 v6 (o `TaskDialogIndirect`, por exemplo, que o `tauri-runtime-wry` e o `muda` usam com a feature padrão `common-controls-v6`), o Windows os recusa ao carregar, com `STATUS_ENTRYPOINT_NOT_FOUND` (0xc0000139). É um problema conhecido: o `build.rs` do próprio crate `tauri` 2.12.0 tem o mesmo contorno para os testes dele ("workaround needed to prevent `STATUS_ENTRYPOINT_NOT_FOUND` error in tests"), e há a issue tauri-apps/tauri#13419 e a discussão tauri-apps #11179. O contorno:
   - só quando o alvo é Windows MSVC (lido de `CARGO_CFG_TARGET_OS` e `CARGO_CFG_TARGET_ENV`, porque o build script roda no host), o `build.rs` usa `WindowsAttributes::new_without_app_manifest()` e passa o manifesto ao linker com `/MANIFEST:EMBED` e `/MANIFESTINPUT:src-tauri/windows-app-manifest.xml`, que vale para o app, a cdylib e os testes;
   - o `windows-app-manifest.xml` é cópia literal do padrão do `tauri-build` 2.7.0;
   - no Linux nada muda: o caminho antigo (`tauri_build::build()`) era `try_build` com os atributos padrão, e é o que continua rodando.

   Conferido daqui: `cargo clippy --workspace --all-targets --target x86_64-pc-windows-msvc -- -D warnings` passa; a saída do build script para esse alvo tem as duas linhas `rustc-link-arg` do manifesto; e o `resource.rc` gerado não traz mais o manifesto (o do build anterior trazia), então o `.exe` recebe o manifesto uma vez só, sem o erro de recurso duplicado. Não há `link.exe` nesta máquina, então quem confere o link de verdade é o passo 5 do CI no `windows-latest`. **Se o Windows falhar com erro de link** (LNK ou CVT1100), volte o `build.rs` para `tauri_build::build()` e anote aqui.
8. **Dois testes novos no `npm test`** (`scripts/regras-do-repo.test.mjs`): um confere que o `ci.yml` roda em todo push, na matriz `ubuntu-24.04` e `windows-latest`, com as três actions da seção 10 e os seis passos na ordem do plano (os três do Cargo com `working-directory: src-tauri`); o outro confere o manifesto e o `build.rs`. Conferidos por mutação: trocar a ordem do clippy e do test, ou trocar `windows-latest` por `windows-2022`, faz o teste falhar.
9. **Conferência do `npm ci` do Windows sem Windows.** Numa cópia limpa, `npm ci --os=win32 --cpu=x64 --ignore-scripts` instalou `@tauri-apps/cli-win32-x64-msvc`, `@rolldown/binding-win32-x64-msvc` e `lightningcss-win32-x64-msvc`: o `package-lock.json` gerado no Linux já traz os binários nativos do Windows.

### M04

1. **`visible(false)` seguido de `show()`, em vez de "visível" no builder.** O M04 pede a `tomato` "como na seção 5.3, mas visível e sem região". Com `visible(true)` no `WebviewWindowBuilder`, a janela saiu errada em 11 de 15 rodadas (achado 1 do spike A). O `window/tomato.rs` constrói com `visible(false)` e chama `show()` logo em seguida, ainda no `setup`. Para quem olha, dá no mesmo: a janela aparece na hora e sem região. O M05 continua igual, com a região aplicada entre o `build()` e o `show()`.
2. **Vite 8: a opção é `build.rolldownOptions.input`.** A seção 3.7 deixou "a confirmar". No Vite 8.3.1, `rollupOptions` ainda funciona, mas é um apelido obsoleto de `rolldownOptions` (`@deprecated Use rolldownOptions instead` no `index.d.ts`). O build gera `dist/index.html` e `dist/tomato.html`.
3. **Dois commits do M04, um em cada branch.** Seguindo a 5.8, o código ficou na branch `spike/full`, no commit "M04: spike A, janela-tomate transparente (código)". A `main` recebeu só este registro, a verificação manual, as pendências e a captura, no commit "M04: spike A, janela-tomate transparente". Depois, a `spike/full` foi rebaseada sobre a `main`, e agora é a `main` mais o commit de código. O M05 continua na `spike/full`. Tudo é local: sem remote e sem push.
4. **A captura veio do GNOME Shell aninhado, não da tela de verdade.** Capturar a tela da sessão pede permissão interativa ao portal, e a captura mostraria o que você estivesse fazendo. O shell aninhado é o mesmo Mutter 50.1, e o app faz os mesmos pedidos ao compositor nas duas sessões (spike A, "Como foi conferido", item 2). A conferência na tela de verdade ficou em `docs/verificacao-manual.md` (M04).
5. **Teste num GNOME Shell aninhado (`scripts/aninhado/`, fora do plano, na branch `spike/full`).** É ferramenta de teste, e não código do app: nada disso entra no bundle.
   - O `rodar.sh` sobe o `gnome-shell --headless --wayland --no-x11 --virtual-monitor 1920x1080` com `--automation-script`. É o modo de roteiros de desempenho do próprio GNOME Shell, que roda um módulo JS dentro do shell e sai no fim.
   - O roteiro (`auto.js`) acha as janelas, move a `main` para longe e compara os pixels da caixa do tomate com a captura do fundo (via `GdkPixbuf`). Também arrasta e clica com um ponteiro virtual do Clutter e grava `resultado.json`.
   - A sonda (`sonda.js`, servida só pelo `sonda.config.mjs`) manda o console e os eventos de mouse da página para um arquivo.
   - O `resumo.mjs` junta o resultado com o que o app pediu ao compositor (`WAYLAND_DEBUG`) e sai com código 1 se algo falhar.
   - **Isolamento:** tudo roda num escopo do systemd do usuário, que é parado no fim. O teste usa `XDG_*` próprios, GSettings em memória (o dconf não é tocado), um barramento de sessão novo e um barramento de sistema falso. Sem logind e sem GDM, o shell aninhado não registra nada na sessão de verdade. O `XDG_RUNTIME_DIR` fica num diretório curto em `/tmp`, porque o caminho do socket Wayland tem limite de 108 bytes, e é apagado no fim. Depois de cada rodada, conferi que não sobrou processo, escopo nem diretório.
   - **Limites:** o monitor é virtual (sem KMS nem scanout direto); o EGL do shell e do app fica na Mesa (Intel), via `__EGL_VENDOR_LIBRARY_FILENAMES`; o ponteiro é virtual. O canto ativo e os avisos do shell são desligados dentro do roteiro, porque o ponteiro virtual nasce em (0, 0) e abriria a visão geral.
6. **O que o spike deixa de fora, de propósito:**
   - as preferências (`tomatoSize`, `tomatoOnTop`, `fullMode`), que viram constantes (280 px e `true`);
   - o `initialization_script` com `__TT_PREF__` e companhia, a região (M05) e o Windows (M55);
   - os tokens `--tt-tomato-*` (as variáveis continuam as do protótipo, `--body-*` e afins) e o catálogo de textos ("Sessão 2 de 4" continua como no protótipo; o texto é decidido no M50);
   - a `main` do template, que continua abrindo junto com a `tomato`.

   Tudo isso é do M50 em diante.
7. **Regras do repositório na `spike/full`.** O `scripts/regras-do-repo.test.mjs` passou a conferir também a `tomato.html`: `lang="pt-BR"`, sem `<style>` nem `style="..."` e sem a palavra proibida. Um teste novo confere as duas entradas do Vite, o `data-tauri-drag-region="deep"` no `.stage` e o `allow-start-dragging` na `capabilities/tomato.json`. Conferido por mutação: sem o `="deep"`, o teste falha.
8. **Checagem cruzada do Windows.** O `#[cfg(windows)] no_redirection_bitmap(true)` da 5.3 entrou e passa em `cargo clippy --workspace --all-targets --target x86_64-pc-windows-msvc -- -D warnings`, com o `llvm-rc` como no M01. O Windows de verdade continua no M55.
