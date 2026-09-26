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
