# Verificação manual

O que só uma pessoa na frente da tela consegue conferir. Para cada marco: o que já foi conferido de forma automática (o "proxy") e os passos exatos para a conferência humana. Marque `[x]` quando fizer.

## M01. Teste de fumaça

### O que já foi conferido sem olhar a tela (26/09/2026)

- **Janela na sessão Wayland:** `npm run tauri dev` com `WAYLAND_DEBUG=client` mostrou `xdg_toplevel.set_title("Tomatito")`, `xdg_toplevel.set_app_id("tomatito")` e os `configure` do compositor, sem `wl_display.error`. A janela ficou aberta uns 5 s e foi fechada.
- **Switch no WebKitGTK real:** um script de sonda, injetado só numa configuração do Vite fora do repositório, rodou dentro da janela e devolveu: `customElements.get('fluent-switch')` é `function`; borda `1px solid rgb(173, 173, 173)`; tamanho 40×20; depois de `click()`, `checked` passou de `false` para `true`, a bolinha foi de x=3 para x=23 e o fundo ficou `rgb(71, 158, 245)`.
- **Recarga ao salvar:** regravar o `index.html` com `tauri dev` aberto fez o Vite registrar `page reload index.html`; 1,5 s depois a janela pediu `/` de novo e a sonda rodou outra vez.
- **Prévia no Chrome headless:** `npm run shot -- --size 800x600 --click fluent-switch --wait 400 --shot docs/capturas/m01-switch.png` mostra o switch com borda (desligado) e azul com a bolinha à direita (ligado).

### Passos para você (uns 2 minutos)

1. [ ] Em `~/dev/tomatito`, rode `npm run tauri dev`. Espere a janela "Tomatito" aparecer (a primeira compilação já foi feita; deve levar menos de 1 min).
2. [ ] A janela **não** está em branco: no canto superior esquerdo aparece um switch pequeno, com borda cinza e uma bolinha à esquerda. O fundo branco é esperado neste marco (os temas entram no M06).
3. [ ] Clique no switch: a bolinha desliza para a direita e o fundo do switch fica azul. Clique de novo: volta.
4. [ ] Botão direito na janela → **Inspecionar**. No console, digite `customElements.get('fluent-switch')` e confira que a resposta **não** é `undefined`.
5. [ ] Com a janela aberta, abra o `index.html` no editor, acrescente um espaço numa linha e salve. A janela recarrega sozinha (o switch volta ao estado desligado). Desfaça a mudança e salve de novo.
6. [ ] Feche a janela e encerre o `tauri dev` com Ctrl+C no terminal.

Se a janela abrir em branco no passo 2: feche, rode uma vez `WEBKIT_DISABLE_DMABUF_RENDERER=1 npm run tauri dev` só para diagnosticar e anote o resultado em `docs/decisoes.md`. Não deixe a variável exportada.

## M02. Base do repositório local

Nada a conferir na tela neste marco. O que foi conferido de forma automática (26/09/2026):

- `grep -nE '"[\^~]' package.json` não imprime nada.
- `cargo test -p tomatito-core`, com um `CARGO_TARGET_DIR` vazio, compilou só o `tomatito-core` (uma linha "Compiling", sem `tauri` nem `webkit2gtk`), e `cargo tree -p tomatito-core` não lista dependências.
- `npm test` roda o `node --test` (6 testes das regras do repositório).
- `cargo fmt --all --check`, `cargo clippy --workspace --all-targets -- -D warnings` e `cargo test --workspace` passam em `src-tauri/`.
- Com o workspace novo, `WAYLAND_DEBUG=client npm run tauri dev` ainda abre a janela: `xdg_toplevel.set_app_id("tomatito")` e `set_title("Tomatito")` em uns 5 s, sem `wl_display.error`. O processo foi encerrado logo depois.
- A checagem cruzada `cargo clippy --workspace --target x86_64-pc-windows-msvc -- -D warnings` (com o `llvm-rc` do LLVM 21 no PATH, como no M01) passa.

A CSP só tem efeito no build; a conferência no console ("Refused to") é do M08.


## M03. CI nos dois sistemas

O "Pronto quando" (push verde no Linux e no Windows) depende de criar o repositório no GitHub, que é seu (`docs/pendencias-usuario.md`, item 2). Nada abre janela neste marco.

### O que já foi conferido sem o GitHub (26/09/2026)

- `actionlint` 1.7.12 no `.github/workflows/ci.yml`: sem erros.
- Os seis passos do CI, na ordem, numa cópia limpa do que foi para o commit (`git checkout-index` para o scratchpad, sem `node_modules/` nem `dist/`): `npm ci`, `npm run build`, `cargo fmt --all --check`, `cargo clippy --workspace -- -D warnings`, `cargo test --workspace` (0 + 0 + 1 testes, mais os doc-tests) e `npm test` (8 testes). Tudo passou. A cópia foi apagada depois.
- Windows, sem Windows: `cargo clippy --workspace --all-targets --target x86_64-pc-windows-msvc -- -D warnings` passa, e a saída do build script para esse alvo tem `/MANIFEST:EMBED` e `/MANIFESTINPUT:.../windows-app-manifest.xml`. O `npm ci --os=win32 --cpu=x64` instala os binários nativos do Windows (Tauri CLI, rolldown e lightningcss) a partir do `package-lock.json`.
- As tags `actions/checkout@v7`, `actions/setup-node@v7` e `Swatinem/rust-cache@v2` existem (`git ls-remote`).

### Passos para você (depois de criar o repositório)

1. [ ] Rode os três comandos do item 2 de `docs/pendencias-usuario.md`. O `gh run watch` pergunta qual rodada acompanhar; escolha a do commit mais recente.
2. [ ] Em `https://github.com/kbrianps/tomatito/actions`, a rodada "CI" do push tem dois jobs: `ubuntu-24.04` e `windows-latest`. Os dois terminam com o ícone verde. A primeira rodada leva uns 15 a 25 min (compila o Tauri do zero); as seguintes usam o cache.
3. [ ] Abra o job `windows-latest` e o passo **5. cargo test**. Ele lista `Running unittests src\lib.rs`, `src\main.rs` e o `tomatito-core`, todos com `test result: ok`. Se aparecer `exit code: 0xc0000139, STATUS_ENTRYPOINT_NOT_FOUND`, o manifesto não chegou ao binário de teste; se aparecer erro de link (`LNK` ou `CVT1100`), é o manifesto duplicado. Nos dois casos, veja `docs/decisoes.md`, M03, item 7.
4. [ ] No job `ubuntu-24.04`, o passo **Pacotes do sistema (Linux)** termina sem erro do `apt`.
5. [ ] No próximo push (por exemplo, com o commit do marco seguinte), o passo **Cache do Cargo** não diz mais `No cache found`, e a rodada fica bem mais curta.

## M04. Spike A: janela-tomate transparente

O código está na branch `spike/full`. O resultado completo, com os números, está em `docs/decisoes.md`, na seção "Spike do Full".

### O que já foi conferido sem olhar a tela (26/09/2026)

- **GNOME Shell 50.1 aninhado, sem tela** (`bash scripts/aninhado/rodar.sh`, na `spike/full`):
  - os quatro cantos da janela são idênticos, pixel a pixel, ao fundo sem o tomate;
  - arrastar pelo corpo, pelo cabinho e por uma sépala move a janela exatamente o que o ponteiro andou;
  - os 5 botões escrevem no console, e clicar neles não move a janela;
  - a captura é a `docs/capturas/spike-a.png`.
- **Sessão real, por uns 10 s** (a janela abriu e foi fechada):
  - a `tomato` usa buffers ARGB8888 e não declara região opaca;
  - ela fica com 280×280 e a página desenhou;
  - sem erro de protocolo, e a GPU usada é a Intel.

### Passos para você (uns 3 minutos)

1. [ ] Em `~/dev/tomatito`, rode `git checkout spike/full` e depois `npm run tauri dev`. Aparecem duas janelas: a branca "Tomatito", do template (esperado no spike), e o tomate de 280 px.
2. [ ] Arraste o tomate para cima do papel de parede. Em volta do tomate aparece o que está atrás: nenhum quadrado, borda ou cantos pretos ou brancos. Repita em cima da janela branca e de uma janela escura (um terminal).
3. [ ] Arraste o tomate de três jeitos: pelo corpo (à esquerda do tempo), pelo cabinho e por uma das folhinhas verdes. Nos três, a janela acompanha o mouse.
4. [ ] Clique no botão redondo do meio. O tomate fica mais apagado, e o ícone vira ▶. Clique de novo: ele volta ao vermelho, com ‖.
5. [ ] (Opcional) Para ver os outros quatro botões no console: clique no corpo do tomate e aperte Ctrl+Shift+I. Se o Web Inspector abrir, vá em Console e clique em cada botão do tomate. Cada clique escreve uma linha `[tomato] botão: …` (voltar, configuracoes, reiniciar, iniciar-pausar, pular). Se o atalho não abrir nada, pule este passo: o teste aninhado já conferiu os cliques.
6. [ ] (Opcional, GPU) Na janela branca, clique com o botão direito e escolha **Inspecionar**. No Console, digite `location.href = 'webkit://gpu'`. A janela branca mostra a página de GPU do WebKit. A linha do renderizador deve citar a Intel (algo como "Mesa Intel(R) UHD Graphics"). Anote se aparecer NVIDIA ou `llvmpipe`.
7. [ ] Encerre com Ctrl+C no terminal e volte para a `main` com `git checkout main`.

Se algum passo falhar, anote o que viu em `docs/decisoes.md`, na seção do spike A. Cantos pretos ou brancos no passo 2 mudam o veredito para B3 (plano, 5.8).

## M05. Spike B: região de entrada e veredito

O código está na branch `spike/full`. O resultado completo e o veredito (A) estão em `docs/decisoes.md`, na seção "Spike do Full".

### O que já foi conferido sem olhar a tela (26/09/2026)

- **Testes do Rust:** em 240, 280 e 320 px, a região cobre todo o contorno do desenho, e os quatro cantos da janela ficam fora dela.
- **GNOME Shell 50.1 aninhado, sem tela** (`bash scripts/aninhado/rodar.sh`, na `spike/full`), em quatro rodadas:
  - a região chega ao compositor depois do show e já no primeiro quadro, igual à calculada no Rust;
  - com a `main` atrás do tomate, os cliques nos quatro cantos, ao lado do corpo, acima do cabinho e na sombra ativam a `main`, e a `tomato` não recebe nada;
  - arrastar pelo corpo, pelo cabinho, por uma sépala e pelo ombro move a janela; os 5 botões respondem;
  - as capturas são a `docs/capturas/spike-b.png` e a `docs/capturas/spike-b-regiao.png` (a região em azul).
- **Sessão real:** o comando do "Pronto quando" mostrou o `set_input_region` da `tomato` depois do show, com a mesma região, sem erro de protocolo. As janelas foram fechadas depois.

### Passos para você (uns 4 minutos)

A "caixa" do tomate é o quadrado invisível de 280 px em volta dele. Os cantos da caixa são os vazios em diagonal, fora do desenho.

1. [ ] Em `~/dev/tomatito`, rode `git checkout spike/full` e depois:

   ```bash
   WAYLAND_DEBUG=client npm run tauri dev 2>&1 | tee /tmp/tt.log | grep set_input_region
   ```

   Aparecem a janela branca "Tomatito" (do template, esperada no spike) e o tomate. No terminal, surgem linhas `-> wl_surface#N.set_input_region(wl_region#M)`: umas da janela branca e, quando o tomate aparece, as dele.
2. [ ] Abra outro terminal e arraste o tomate para cima dele, de modo que o terminal fique atrás da caixa inteira. Clique no corpo do tomate (ele vem para a frente).
3. [ ] Clique no vazio em diagonal abaixo e à esquerda do corpo: o canto inferior esquerdo da caixa, a meio caminho entre a curva do corpo e o ponto onde ficaria o vértice do quadrado. O terminal de trás fica ativo (a barra de título dele deixa de ficar apagada), e dá para digitar nele. Clique no corpo do tomate de novo para trazê-lo à frente.
4. [ ] Repita o passo 3 nos outros três cantos e na sombra logo abaixo do tomate. Em todos, o clique ativa o terminal. Evite os dois cantinhos acima dos "ombros", entre o corpo e as folhas: ali a região aproximada ainda pega o clique (zona morta; some no M53).
5. [ ] Arraste o tomate pelo "ombro" (a parte de cima do corpo, à esquerda do ícone de janela), pelo corpo, pelo cabinho e por uma folhinha. Nos quatro, a janela acompanha o mouse.
6. [ ] Clique no botão redondo do meio: o tomate fica mais apagado, e o ícone vira ▶. Clique de novo: volta.
7. [ ] Encerre com Ctrl+C no terminal do `tauri dev`. Rode `node scripts/aninhado/regiao.mjs /tmp/tt.log`: as quatro linhas terminam em `ok`. Depois, `rm /tmp/tt.log` e `git checkout main`.
8. [ ] (Opcional, NVIDIA) Com o monitor externo na HDMI, que está na NVIDIA: repita o passo 1, arraste o tomate para o monitor externo e repita os passos 3 a 5 lá. Anote em `docs/decisoes.md`, no spike B, se aparecerem cantos pretos, se o clique não atravessar ou se o app cair com `Error 71 (Protocol error) dispatching to Wayland display` no terminal (risco #10702).

Se nos passos 3 e 4 o clique ficar no tomate (o terminal não fica ativo), o veredito cai para B1 (plano, 5.8): anote em `docs/decisoes.md`, no spike B.
