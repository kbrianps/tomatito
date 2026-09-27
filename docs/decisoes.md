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

### M05 (26/09/2026)

| Item | Versão ou valor | Como foi conferido |
|---|---|---|
| gtk (crate) | 0.18.2, agora também dependência direta, só no Linux (`gtk = "0.18"`) | `cargo tree -i gtk`: a mesma instância que o `tao`, o `wry` e o `tauri` usam; o `Cargo.lock` só ganhou a aresta `tomatito → gtk` |
| cairo-rs (via `gtk::cairo`) | 0.18.5 | `Cargo.lock` |
| WebKitGTK / GNOME Shell / Mutter | 2.52.6 / 50.1 / 50.1 | sem mudança desde o M04 |
| tao / wry | 0.37.1 / 0.57.0 | sem mudança desde o M04 |
| GPU | Intel Alder Lake-S UHD Graphics | a mesma do M04 (descritores do processo); não foi relida no M05 |

### M06 (26/09/2026)

| Item | Versão ou valor | Como foi conferido |
|---|---|---|
| @fontsource-variable/inter | 5.3.0 (fontes do Google Fonts "v20", de 10/09/2025) | `package.json` e `metadata.json` do pacote |
| Arquivos da Inter no build | `inter-latin-opsz-normal.woff2` (72.920 bytes) e `inter-latin-ext-opsz-normal.woff2` (133.336 bytes): 206.256 bytes | `dist/assets/` depois do `npm run build` |
| WebKitGTK da prévia `shot:webkit` | 2.52.6, a mesma do app (WebKit2 4.1 via PyGObject) | `WebKit2.get_major_version()` e afins |
| Fontes Segoe e Inter instaladas no sistema | nenhuma | `fc-list \| grep -iE 'segoe\|inter'` vazio: no Linux, a pilha cai sempre na Inter embutida |

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

### Spike B: região de entrada e veredito (M05, 26/09/2026)

**Veredito: A.** A transparência (spike A) e a região de entrada funcionam no GNOME 50.1 Wayland desta máquina, com WebKitGTK 2.52.6 e a GPU Intel. Pela tabela da seção 5.8, os marcos M50 a M57 seguem como estão. A conferência na tela de verdade (`docs/verificacao-manual.md`, M05) e o monitor externo na NVIDIA (opcional) continuam com você; se o clique não atravessar lá, o veredito cai para B1.

**O que entrou** (branch `spike/full`):
- `gtk = "0.18"` só no Linux e o `apply_region` da seção 5.6 em `src-tauri/src/window/region_linux.rs`: a região vai no `GtkWidget` (`gtk_window().input_shape_combine_region`), dentro de `run_on_main_thread`;
- a região aproximada do M05 em `src-tauri/src/window/region_approx.rs`: a elipse do corpo (centro (160,185), raios 141,5 × 115, mais 2 px), o retângulo do cálice e do cabinho (x 100–220, y 40–115) e o dos ombros (x 16–304, y 64–190), escalados por `size/320`. Cada linha de pixels vira a união das três formas, e linhas seguidas iguais viram um retângulo só;
- a `tomato` nasce com `visible(false)`, recebe a região e só então faz `show()`.

**Como foi conferido:**

1. **Testes do Rust** (`cargo test --workspace`): os contornos do desenho (corpo, cabinho, as cinco sépalas, a elipse da base e as nervuras, com o traço) são amostrados com passo bem menor que 0,05 px, e todo pixel que o contorno toca precisa estar na região.

   | Tamanho | Retângulos | Folga horizontal mínima | Cantos da janela |
   |---|---|---|---|
   | 240 px | 59 | 1 px | fora da região |
   | 280 px | 67 | 2 px | fora da região |
   | 320 px | 76 | 2 px | fora da região |

   Cada linha tem uma faixa só, então cobrir o contorno cobre o miolo. Conferido por mutação: com o cálice começando em y 50 (em vez de 40), o cabinho fica de fora e o teste falha; sem o retângulo dos ombros, também. Tirar os 2 px da elipse não quebra a cobertura (o retângulo dos ombros cobre a parte de cima, e embaixo a elipse já passa do corpo); os 2 px ficaram como folga, como o plano pede.

2. **GNOME Shell 50.1 aninhado, sem tela** (`bash scripts/aninhado/rodar.sh`, na `spike/full`), quatro rodadas seguidas, todas com as 22 conferências certas. A janela de trás é a `main` do template (branca, 800×600), posta atrás de toda a caixa do tomate; antes de cada clique, o tomate é ativado.

   | Item do "Pronto quando" | Resultado |
   |---|---|
   | `set_input_region` depois do show | O primeiro `wl_surface.set_input_region` da `tomato` vem depois do `get_toplevel` (o show) e no mesmo `commit` do primeiro quadro: não há instante em que a caixa inteira capture o clique. Os 67 retângulos são exatamente os calculados no Rust. O GTK reenvia a região a cada `configure` (foco, arraste), cerca de 100 vezes por rodada, sempre igual. |
   | Clicar num canto transparente ativa a janela de trás | Nos quatro cantos (a 4 px da borda), à esquerda do corpo (7, 175), acima do cabinho (140, 18) e na sombra embaixo do corpo (140, 273), o foco foi para a `main`, o `mousedown` chegou à página da `main`, e a `tomato` não recebeu nada. |
   | Arrastar, inclusive pelos ombros | Pelo corpo, pelo cabinho, por uma sépala e pelo ombro (ponto (34, 120) do viewBox, fora da elipse e coberto só pelo retângulo dos ombros), a janela andou exatamente o que o ponteiro andou. |
   | Clicar nos botões | As 5 linhas `[tomato] botão: …` chegaram, e a janela não se mexeu. |
   | Transparência (do spike A, repetida) | Os quatro cantos seguem idênticos ao fundo, pixel a pixel. |

   Controle: um clique na zona morta do ombro (19, 61), dentro do retângulo e fora do desenho, fica no tomate, como previsto para a região aproximada. No M04, sem região, o clique a 4 px do canto chegava à página do tomate; agora atravessa.

3. **Sessão real, com o comando do "Pronto quando"** (`WAYLAND_DEBUG=client npm run tauri dev 2>&1 | grep set_input_region`, com o log completo salvo à parte e lido pelo `node scripts/aninhado/regiao.mjs`): a `tomato` (`wl_surface#48`) recebeu `set_input_region` depois do `get_toplevel` e no commit do primeiro quadro, com os mesmos 67 retângulos calculados; a geometria é `0, 0, 280, 280`, sem região opaca e sem erro de protocolo. As outras linhas do `grep` são da `main`, cuja região o próprio GTK define por causa do CSD. As duas janelas ficaram abertas uns 3 min, e não uns 10 s como no M04 (o roteiro esperava a saída do `grep`, que só chega no fim por causa do buffer); foram fechadas, e não sobrou processo nem porta.

**Capturas** (do shell aninhado, com o tomate sobre a `main` branca):
- `docs/capturas/spike-b.png`: o tomate como aparece;
- `docs/capturas/spike-b-regiao.png`: a mesma cena com a região por cima. Dentro do contorno azul, o tomate recebe o clique; fora, o clique atravessa. A região ocupa 63% da caixa de 280×280.

**Achados** (para o M53 e o M54):
1. **A região no widget funciona como a 5.6 descreve.** O GTK guarda a região do widget, cruza com a do CSD e manda no mapeamento. Ela sobrevive ao arraste, à troca de foco e aos `configure`, sem código a mais. Ainda falta ver a troca de tamanho (P/M/G), que é do M54.
2. **A região aproximada tem zonas mortas pequenas:** os cantos de cima do retângulo dos ombros (entre o corpo e o cálice) e até uns 2 px em volta do corpo. Para o dia a dia, isso é aceitável; a região exata do M53 tira essas zonas.
3. **A sombra fica fora da região,** como a 5.6 pede: o clique na sombra embaixo do corpo atravessa.
4. **O Windows não recebe região no spike:** lá o `apply_region` não faz nada (seção 5.5; M55).

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

### M05

1. **Dois commits do M05, um em cada branch,** como no M04 (seção 5.8): o código em "M05: spike B, região de entrada e veredito (código)", na `spike/full`, e este registro, a verificação manual, as pendências e as capturas em "M05: spike B, região de entrada e veredito", na `main`. Depois, a `spike/full` foi rebaseada de novo sobre a `main`. Tudo local: sem remote e sem push.
2. **`apply_region` sem efeito fora do Linux.** O M05 só pede o Linux. Para o código compilar no Windows, um `#[cfg(not(target_os = "linux"))]` no `window/tomato.rs` devolve `Ok(())`; a região do Windows (`SetWindowRgn`, seção 5.5) é do M55. Conferido com `cargo clippy --workspace --all-targets --target x86_64-pc-windows-msvc -- -D warnings` (com o `llvm-rc`, como no M01).
3. **Nomes dos arquivos.** O `region_linux.rs` segue a árvore da seção 3.7. O cálculo aproximado ficou num arquivo próprio, `window/region_approx.rs`, que não está na árvore: é do spike e sai quando a região em JS (5.4) entrar no M53.
4. **Uma linha de log a mais, só no build de debug.** A `tomato` escreve no stderr `[tomato] região: N retângulos em 280 px: [...]`, para o teste aninhado e o `regiao.mjs` compararem com o que o GTK mandou ao compositor. Está sob `#[cfg(debug_assertions)]` e sai com o spike.
5. **A janela de trás no teste aninhado é a `main` do template, e não um terminal.** O "Pronto quando" cita um terminal "por exemplo"; o que importa é a janela de trás receber o clique e o foco. A conferência com um terminal de verdade está em `docs/verificacao-manual.md`, M05.
6. **Teste aninhado ampliado** (na `spike/full`; fora do plano, como no M04): a sonda agora roda nas duas páginas e marca cada evento com o rótulo da janela; o `auto.js` arrasta pelo ombro, clica em sete pontos fora da região e em um dentro dela, e desenha a região sobre a captura (Cairo, dentro do shell); o `regiao.mjs` lê a região no log do `WAYLAND_DEBUG` e serve também para a sessão real.
7. **Dois testes novos no `npm test`** (na `spike/full`): um confere o `gtk = "0.18"` só na seção do Linux, o `visible(false)`, a ordem `build()` → `apply_region` → `show()` e a região no widget, nunca na `GdkWindow`; o outro proíbe `set_ignore_cursor_events` e `setIgnoreCursorEvents` (seção 5.3). Conferidos por mutação: com `gtk = "0.19"`, ou com o `show()` antes do `apply_region`, o teste falha.
8. **O opcional do monitor externo (HDMI, na NVIDIA) não foi feito:** pede o monitor ligado e alguém olhando. Ficou em `docs/verificacao-manual.md` e em `docs/pendencias-usuario.md`.

### M06

1. **`shell.css` e `controls.css` já no M06, com o mínimo.** A seção 4.2 põe as duas folhas no `index.html`, e a amostra pede botões e cartão; como os botões são `<button>` nativos (1.1), sem CSS próprio eles apareceriam com o visual padrão do WebKit, fora do Lite. O `controls.css` traz o botão padrão e o de destaque (repouso, hover e pressionado, medidas do Button do WinUI: 32 px, raio 4, texto normal), o cartão, o anel e os rótulos de switch e radio. O resto dos botões (sutil, circular, desabilitado, anel de foco duplo) continua no M13. O `shell.css` só tem o layout da página da amostra, que muda no M07, no M09 e no M10.
2. **Acréscimos ao `base.css`.** O bloco da 4.2 está literal no começo do arquivo. Depois dele entraram: `box-sizing: border-box`, margens zeradas em `h1`–`h4`, `p` e `figure`, `button { font: inherit }`, as classes da rampa de tipos (`.tt-t-caption` a `.tt-t-display`, que só leem os `--tt-type-*`) e `.tt-fg-2` e `.tt-accent-fg`. O `tokens.css` e o `bridge.css` são cópias literais dos blocos da 4.2 e da 4.3 (a ponte ganhou só um comentário de cabeçalho), para o `contrast.mjs` do M06b ler exatamente o que o plano mediu.
3. **`fonts.css`.** Os `url()` usam o especificador do pacote (`@fontsource-variable/inter/files/...`), que o Vite resolve no dev e no build; o build copia só os dois `woff2` para `dist/assets/`. O `unicode-range`, o `font-display: swap`, o `font-weight: 100 900` e o `format("woff2-variations")` são os do `opsz.css` do pacote. Com o texto de hoje, o WebKitGTK baixa só o `latin` (o `latin-ext` fica `unloaded`). O minificador do build escreve `url(...)format(...)`, sem espaço, e o `U+0000-00FF` vira `U+??`; o WebKitGTK aceitou os dois (conferido com o `dist/` servido pelo `vite preview`). No Windows, a Segoe UI Variable vem antes na pilha e os `woff2` nem deveriam ser baixados; isso fica para o M49.
4. **Rótulos com `<label>` nativo.** O switch e os radios vão dentro de um `<label>`, sem `fluent-field` (que pediria mais um import e um componente a mais para esconder no `:not(:defined)`). Clicar no texto marca o radio e liga o switch, nos dois motores. Duas sobreposições pequenas no `controls.css`: `fluent-radio-group { gap: 0 }` (32 px por item, como o RadioButtons do WinUI, no lugar dos 16 px de folga do Fluent) e a cor dos rótulos em `--tt-fg-1`, porque o `::slotted()` do grupo pintaria o texto de `--colorNeutralForeground3` (fg-2) e, no hover, de `--colorNeutralForeground2`, que a ponte não cobre (viria cinza do `webDarkTheme`).
5. **Observação para o M11 e o M22: a bolinha do switch ligado é cinza-escura** (`rgb(36, 36, 36)`) sobre o creme. É o `--colorNeutralForegroundInverted` do `setTheme(webDarkTheme)` provisório, que a ponte não cobre (4.3). O contraste é bom, mas o tom é neutro, e não o vermelho do Lite (o `ToggleSwitchKnobFillOn` do WinUI é o `TextOnAccentFillColorPrimary`, que no Lite seria o `--tt-fg-on-accent`, `#972620`). No M11 o valor vem do `createDarkTheme` (continua cinza); no M22, do `tintNeutrals(dark)`, que deve avermelhá-lo. Se no M22 ainda destoar, a saída é mapear esse token na ponte, conferindo antes o tooltip e os outros componentes que o usam.
6. **`<html lang="pt-BR" data-theme="lite">`.** O teste de regras do M02 exigia `<html lang="pt-BR">` exato; agora aceita outros atributos depois do `lang`. O `data-theme` fixo sai no M08, quando o script de boot passa a gravar os atributos.
7. **Três testes novos no `npm test`** (`scripts/regras-do-repo.test.mjs`): as folhas do `index.html` são `<link>` no `<head>`, na ordem da 4.2, e nenhum JS importa CSS; todo `fluent-*` usado no `index.html` ou no JS tem o seu `import` (senão o `:not(:defined)` do `base.css` o esconde); o `fonts.css` aponta só para os dois arquivos `latin` e `latin-ext` em opsz, e nenhum JS importa o pacote da fonte inteiro. Conferidos por mutação: sem o import do `radio-group.js`, com o `bridge.css` antes do `tokens.css`, ou com o arquivo cirílico no `fonts.css`, o teste correspondente falha.
8. **Harness de prévia corrigido e ampliado** (fora do plano, como no M01):
   - **O defeito do `shot.mjs`.** Ele mandava SIGTERM ao Chrome, esperava só o processo principal (e, com `exitCode === null` depois de morte por sinal, mandava ainda um SIGKILL inútil) e apagava o perfil em seguida. Os filhos e o `chrome_crashpad_handler`, que sai do grupo de processos, ainda gravavam no perfil: daí o `ENOTEMPTY`, o código de saída 1 e as pastas `/tmp/tomatito-chrome-*` para trás. Achado a mais: com um SIGTERM mandado ao Node (por exemplo, pelo `timeout`), o ouvinte que o próprio Vite registra (`process.once('SIGTERM')`, fora do `middlewareMode`) fechava o servidor e chamava `process.exit()`, cortando a limpeza; e, como o `timeout` manda o sinal duas vezes (ao filho e ao grupo), um ouvinte com `once` deixaria o segundo sinal matar o Node.
   - **A correção.** O Chrome ganha `--remote-debugging-pipe` além da porta: o pipe serve de cordão, e o Chrome fecha sozinho se o Node morrer de qualquer jeito, até com SIGKILL. No fim, o Node pede `Browser.close` pelo pipe, espera o Chrome sair e espera também todos os processos cuja linha de comando cita o perfil (`/proc/*/cmdline`); os que sobrarem recebem SIGTERM e depois SIGKILL. Só então o perfil é apagado, com `maxRetries` e mais cinco tentativas; uma falha na limpeza vira aviso e não muda o código de saída. SIGINT, SIGTERM e SIGHUP passam pela mesma limpeza, uma vez só. O servidor do Vite nasce pelo `scripts/preview/servidor.mjs`, que tira os ouvintes de SIGTERM e de fim do stdin que o Vite acrescenta. Perfis de uma execução morta com SIGKILL (a única que ainda deixa a pasta) são apagados pela execução seguinte, se estiverem parados há mais de 2 min e sem processo.
   - **Conferido:** 10 execuções seguidas com código 0 e nenhum perfil nem processo sobrando; `timeout -s TERM 6` no meio de um `--wait 20000`, dois SIGINT seguidos, SIGTERM só no Node com o stdin fechado e SIGINT no grupo (como o Ctrl+C) terminam sem sobras; com SIGKILL no Node, o Chrome fecha sozinho pelo pipe, e a pasta que ficou foi apagada pela execução seguinte.
   - **`--fonts "seletor"`** no `shot.mjs`: imprime as fontes que o Chrome usou no texto do elemento (`CSS.getPlatformFontsForNode`), com o número de glifos.
   - **`npm run shot:webkit`** (`scripts/preview/webkit-shot.mjs` e `webkit-shot.py`): a mesma prévia, mas no WebKitGTK 2.52.6 de verdade, que é o motor do app no Linux. O Python (PyGObject) carrega a página numa `Gtk.OffscreenWindow`, que não é mapeada no compositor: nada aparece na tela (conferido com `WAYLAND_DEBUG`: nenhum `get_xdg_surface` nem `get_toplevel`). A captura sai do `webkit_web_view_get_snapshot`. A renderização é por software (`HardwareAccelerationPolicy.NEVER`), porque a janela fora da tela não consegue contexto GL no Wayland ("GDK is not able to create a GL context"); para CSS, fontes e layout, o resultado é o do app. Passos: `--eval` (promessas são esperadas), `--wait` e `--shot`; os `console.error`/`warn` e as exceções da página vão para o stderr, e uma exceção dá código 1. Depende do `python3-gi` e do `gir1.2-webkit2-4.1`, que já estão na máquina; não roda no CI.
   - Nada disso entra no bundle: o build só parte do `index.html`, e o `grep` no `dist/` não acha o mock nem a sonda.
9. **Conferência no app real (sessão Wayland), com uma sonda fora do repositório,** como no M01: uma configuração do Vite no scratchpad injetou um script que mediu, dentro da janela do `tauri dev`, as cores, os componentes definidos e as fontes, e mandou o resultado ao servidor. Os valores bateram com os da prévia (tabela em `docs/verificacao-manual.md`, M06). **Um tropeço meu:** o roteiro que devia fechar o app depois da resposta da sonda tinha um erro de shell (a variável com o caminho só existia num subshell), e a janela "Tomatito" ficou aberta na sua sessão por uns 4 min, e não pelos poucos segundos previstos. Ela foi fechada, e conferi que não sobrou processo (`tomatito`, `WebKitWebProcess`, Vite) nem a porta 5173.

