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

## M06. Tokens, ponte e amostra do Lite

A amostra fica direto no `index.html` (a rota `#/dev` entra no M09). A janela ainda é a do template (800×600, com a moldura do sistema); a barra própria vem no M07.

### O que já foi conferido sem olhar a tela (26/09/2026)

- **Nos dois motores, com os mesmos valores:** Chrome headless (`npm run shot`) e o WebKitGTK 2.52.6 de verdade, numa janela fora da tela (`npm run shot:webkit`, novo neste marco).

  | Item | Valor medido |
  |---|---|
  | Fundo da página / cartão | `#A5342B` / `#AF4135` |
  | Botão de destaque | fundo `#FFF4EE`, texto `#972620` |
  | Botão padrão | fundo branco a 8%, borda de cima `#BD6359`, de baixo `#E1B7B2` |
  | Switch ligado / radio marcado | `#FFF4EE` / ponto e borda `#FFF4EE` |
  | Anel | arco `#FFF4EE` sobre o trilho `#B9615A` |
  | Componentes Fluent | os 6 da página definidos; um `fluent-inexistente` de teste fica com `visibility: hidden` (a regra `:not(:defined)`) |
  | Fonte | Chrome: `CSS.getPlatformFontsForNode` diz "Inter (web font)" no título, nos botões e nos rótulos. WebKitGTK: `document.fonts.check('14px "Inter Variable"')` é `true`, o arquivo `latin` está `loaded`, e a largura de um texto de teste com a pilha do tema é igual à da Inter (189,1 px) e diferente da `sans-serif` do sistema (181,3 px) |
  | Cliques | clicar em "10 minutos" marca o radio; clicar no segundo switch o liga |
  | Largura | sem rolagem horizontal em 1000 e em 480 px |

- **Build:** o `dist/` leva só os dois `woff2` (206 KB). Servido pelo `vite preview` e aberto no WebKitGTK, carrega só o `latin` e mede igual.
- **App real (`tauri dev`, sessão Wayland):** uma sonda fora do repositório, injetada só no servidor do teste, rodou na janela `main` e devolveu os mesmos valores da tabela (tema `lite`, fundo, cartão, botão, switch, radio, anel, nenhum `fluent-*` indefinido, Inter carregada e com a mesma largura). A janela ficou aberta uns 4 min, e não segundos, por um erro no roteiro de encerramento (ver `docs/decisoes.md`, M06, item 9); foi fechada, sem processo sobrando.
- **Captura:** `docs/capturas/m06-amostra-lite.png`, tirada no WebKitGTK, em 1000×700.

### Passos para você (uns 3 minutos)

1. [ ] Em `~/dev/tomatito`, rode `npm run tauri dev`. A janela "Tomatito" abre com o título "Amostra do tema" sobre o fundo vermelho-tomate.
2. [ ] Compare com `docs/capturas/m06-amostra-lite.png`: fundo vermelho, cartões um pouco mais claros com borda fina, texto creme. Não aparece nada branco nem azul. O único detalhe escuro é a bolinha do switch ligado ("Tocar som no fim do foco"), esperado até o M22 (`docs/decisoes.md`, M06, item 5).
3. [ ] No cartão "Opções", os três radios aparecem (círculos com borda creme), com "5 minutos" marcado. Clique no texto "10 minutos": o ponto creme passa para ele.
4. [ ] Clique em "Pular intervalos": o switch fica creme, e a bolinha desliza para a direita.
5. [ ] Passe o mouse sobre "Iniciar sessão de foco" (fica um pouco mais rosado) e sobre "Cancelar" (fica um pouco mais claro). Segurando o clique, os dois mudam de novo.
6. [ ] A letra é a Inter, a mesma da captura (o "25:00" do cartão "Texto" e o "16:00" do anel com números da mesma largura). Para conferir pelo console: botão direito → **Inspecionar** → Console, e digite `document.fonts.check('14px "Inter Variable"')`. A resposta é `true`.
7. [ ] Feche a janela e encerre o `tauri dev` com Ctrl+C no terminal.

## M06b. Conferência de contraste

Nada a conferir na tela: o marco é um script, e o "Pronto quando" é automático.

### O que já foi conferido (26/09/2026)

- `node scripts/contrast.mjs` termina com código 0 e imprime a tabela 4.4 (os quatro temas e os três estados do tomate), com os 90 valores iguais aos do plano.
- `npm test` roda o mesmo cálculo (`scripts/contrast.test.mjs`), então o CI confere a tabela em todo push.

### Se quiser rodar (1 minuto)

1. [ ] Em `~/dev/tomatito`, rode `node scripts/contrast.mjs; echo $?`. Aparece a tabela, a última linha diz "todos no mínimo ou acima e iguais à tabela 4.4 do plano." e o `echo` mostra `0`.

## M07. Janela em Rust e barra de título

A `main` agora nasce no `setup` (em Rust), sem a moldura do sistema, e a barra de título é própria. Capturas: `docs/capturas/m07-barra-de-titulo.png` (a janela inteira, com a borda de 1 px) e `docs/capturas/m07-barra-estados.png` (o X em hover e o glifo de restaurar com a janela maximizada, ampliados 3 vezes). As duas saíram do WebKitGTK de verdade, no GNOME Shell aninhado.

### O que já foi conferido sem olhar a tela (26/09/2026)

- **Teste num GNOME Shell aninhado** (Mutter 50.1, Wayland, o app de debug de verdade; nada aparece na sua tela): `bash scripts/gnome-aninhado/rodar.sh barra-de-titulo` terminou com código 0 e as 36 conferências ok:

  | Conferência | Resultado |
  |---|---|
  | Janela | 1000 × 700, sem moldura (o quadro é igual ao buffer), uma janela só, título "Tomatito", app_id `tomatito`, mínimo 480 × 500 enviado ao compositor |
  | Globais do `initialization_script` | `__TT_PREF__ = "lite"`, `__TT_PLATFORM__ = "linux"` |
  | Botões | Minimizar, Maximizar e Fechar, com `aria-label` e `tabindex="-1"` |
  | Borda de 1 px | `#BD6359` nos quatro lados, com `#A5342B` logo por dentro; some com a janela maximizada |
  | Hover do X | fundo `#C42B1C` e glifo `#FFFFFF` (pixels da captura e estilo calculado) |
  | Hover do minimizar | branco a 6% (`--tt-subtle-hover`) |
  | Arrastar | pelo título, pelo ícone e pela área vazia da barra, a janela anda exatamente o que o ponteiro andou; pelo botão Minimizar e pelo conteúdo, não anda (e soltar fora do botão não minimiza) |
  | Duplo clique na barra | maximiza (1920 × 1048, a área de trabalho) e restaura (1000 × 700, no mesmo lugar) |
  | Botão do meio | maximiza e restaura; o glifo e o rótulo trocam entre Maximizar e Restaurar, também quando quem maximiza é o próprio GNOME |
  | Minimizar | a janela minimiza |
  | Redimensionar | pelas bordas direita, de baixo, esquerda e de cima (esta, sobre a barra), pelo canto de baixo à direita, e até o mínimo de 480 × 500 |
  | Zoom | Ctrl+= deixa a página com 833 px de largura (120%); Ctrl+- volta a 1000 e depois vai a 1250 (80%); Ctrl+0 volta a 1000 |
  | Fechar | a janela some, e o app sai sozinho com código 0 |
  | Protocolo | o app pediu `xdg_toplevel.move`, `resize` com as bordas 8, 2, 4, 1 e 10, `set_maximized`, `unset_maximized` e `set_minimized`, sem erro |

- **Na sua sessão, rápido e sem mexer na janela:** o binário de debug, com a sonda, abriu a janela em 1,1 s, a 1000 × 700, no tema Lite, com a plataforma `linux` e a borda. O `npm run tauri dev` também abriu a janela, em uns 4 s. As duas vezes o app foi fechado logo em seguida, sem processo sobrando.
- **Prévia no Chrome headless:** posições da barra (ícone em x = 16, título em x = 46, botões de 46 × 32 a partir de x = 862), hover e pressionado do X e o glifo trocando ao clicar no botão do meio.
- `npm test` (27 testes, 4 novos da barra e 3 novos de regras), `cargo test --workspace`, `cargo clippy --workspace --all-targets -- -D warnings` e a checagem cruzada do Windows passam.

### Passos para você (uns 4 minutos)

1. [ ] Em `~/dev/tomatito`, rode `npm run tauri dev`. A janela abre sem a barra do GNOME: no topo há uma faixa de 32 px com um anel pequeno, "Tomatito" em letra pequena e três botões à direita (traço, quadrado e X).
2. [ ] Em volta da janela há uma linha fina, um pouco mais clara que o vermelho do fundo (é a borda de 1 px; o GNOME não desenha sombra para esta janela).
3. [ ] **Arrastar:** segure o clique sobre o título "Tomatito" e arraste: a janela vem junto. Repita pegando o anel e um ponto vazio da faixa, entre o título e os botões.
4. [ ] **Duplo clique** num ponto vazio da faixa: a janela maximiza, a linha fina some e o quadrado do meio vira dois quadrados sobrepostos. Outro duplo clique: volta ao tamanho de antes, e o glifo volta a ser um quadrado.
5. [ ] **Botões:** passe o mouse sobre o X: o fundo fica vermelho vivo e o X fica branco. Sobre o traço e o quadrado, o fundo só clareia um pouco. Clique no quadrado (maximiza), de novo (restaura) e no traço (minimiza); traga a janela de volta pelo dock ou pelo Alt+Tab.
6. [ ] Passe o mouse sobre cada botão e espere: aparece a dica "Minimizar", "Maximizar" (ou "Restaurar") e "Fechar".
7. [ ] **Redimensionar:** leve o mouse até a beirada de qualquer lado da janela (os últimos 5 px por dentro, sobre a linha fina): o cursor vira uma seta de redimensionar. Arraste e a janela muda de tamanho. Tente também por um canto e pela beirada de cima (sobre a faixa da barra). A janela não fica menor que uns 480 × 500.
8. [ ] **Zoom:** clique no meio da página e aperte Ctrl e = (ou Ctrl e +): tudo fica maior, inclusive a barra. Ctrl e -: diminui. Ctrl e 0: volta ao normal.
9. [ ] **Fechar:** clique no X. A janela fecha, e o `tauri dev` no terminal termina sozinho (ou fica esperando; nesse caso, Ctrl+C).

Se algo não bater, anote o passo e o que apareceu. Se o duplo clique só arrastar, sem maximizar, ou se a beirada não mostrar o cursor de redimensionar, é justamente o que o teste aninhado não consegue ver com um mouse de verdade.

## M08. Boot sem clarão

O script do `<head>` grava o tema e a plataforma no `<html>` antes de qualquer folha de estilo, e a `main` só aparece depois que os componentes, as fontes e a barra de título estão prontos. Captura: `docs/capturas/m08-partida-a-frio.png`, com os quadros de uma partida a frio do build (em cima: o primeiro quadro, só a cor de fundo do Lite, e o segundo, 27 ms depois, já igual ao final) e de uma partida do controle negativo (embaixo: o teste acusa os quadros com o tema Claro que a sonda provocou de propósito).

### O que já foi conferido sem olhar a tela (26/09/2026)

- **Teste num GNOME Shell aninhado** (Mutter 50.1, Wayland, o app de verdade; nada aparece na sua tela): `bash scripts/gnome-aninhado/rodar.sh partida-a-frio` abre o app 10 vezes, com os dados e o cache apagados antes de cada partida, e guarda cada quadro que o compositor pinta com a janela, do primeiro até 2,5 s depois. Resultados:

  | Rodada | Quadros | Brancos, escuros, transparentes ou de outro tema | 1º quadro | 2º quadro | Console do DevTools |
  |---|---|---|---|---|---|
  | Build de debug (`npx tauri build --debug --no-bundle`), 10 partidas | 189 distintos | nenhum | só o fundo `#A5342B`, entre 521 e 593 ms depois de abrir o processo | igual ao final, 26 a 35 ms depois do 1º | nenhuma mensagem; a CSP chega com o hash do script de boot, e o controle (um script inline sem hash) é recusado com "Refused to" |
  | Dev (Vite), 10 partidas | 219 distintos | nenhum | só o fundo `#A5342B`, entre 543 e 622 ms | igual ao final, 25 a 35 ms depois do 1º | só o "[vite] connecting..." e o "[vite] connected." (no dev, a CSP não vale) |
  | Controle negativo: a sonda mostra o tema Claro por 600 ms, 2 partidas | 30 distintos | acusados nas 2 partidas (2 e 3 quadros brancos), como devia | só o fundo | branco | |
  | Controle negativo: sem o `Updates.process()` no `main.js`, 3 partidas | 88 distintos | nenhum, mas o teste falha, como devia | só o fundo | radio "5 minutos" ainda desmarcado (0,02% diferente do final) | |

- **Antes da correção da CSP**, o mesmo teste achou, em toda partida do build, `Refused to connect to ipc://localhost/plugin%3Aevent%7Clisten ...` e o aviso `IPC custom protocol failed, Tauri will now use the postMessage interface instead` (`docs/decisoes.md`, M08, item 1). Depois do `connect-src`, o console ficou vazio.
- **Na sua sessão, rápido e sem mexer na janela:** o build de debug abriu com o inspetor remoto ligado, o `console.mjs` leu o console em 1,3 s (nenhuma mensagem; o `<html>` com `lite`, `lite` e `linux`; a Inter carregada; a CSP com o hash do script de boot e o `connect-src`; o controle recusado com "Refused to"), e o app foi fechado logo em seguida, sem processo sobrando. A janela ficou na tela uns 2 s.
- **Prévia no Chrome headless:** com `?pref=dark`, `?pref=light`, `?pref=system` e `?pref=full&ultimo=suave`, o `<html>` sai com o tema resolvido e a cor de fundo certa (`#202020`, `#F3F3F3`, o do sistema e `#F6ECE9`).
- O roteiro do M07 (`barra-de-titulo`) continua com as 36 conferências ok, agora com o `data-platform` gravado pelo script de boot.
- `npm test` (36 testes, 9 novos do boot), `cargo test --workspace`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo fmt --check` e a checagem cruzada do Windows passam.

### Passos para você (uns 5 minutos)

O "Pronto quando" pede 10 partidas a frio gravadas. A gravação é para ver com os seus olhos o que o teste já mediu quadro a quadro.

1. [ ] Gere o build de debug: em `~/dev/tomatito`, `npx tauri build --debug --no-bundle` (uns 40 s). Não pule este passo: um `cargo build` ou um `npm run tauri dev` deixam no mesmo caminho um binário que procura o Vite e abre com erro.
2. [ ] Deixe um terminal aberto em `~/dev/tomatito`, sobre um fundo claro (por exemplo, uma janela do Nautilus maximizada atrás), para um clarão branco ou preto ficar fácil de ver.
3. [ ] Aperte **Ctrl+Alt+Shift+R**: abre a ferramenta de gravação do GNOME. Escolha gravar a **tela** inteira e clique no botão redondo. Aparece um ponto vermelho no canto de cima.
4. [ ] No terminal, rode `/opt/cargo-target/tomatito/debug/tomatito`. A janela vermelha aparece de uma vez, já com a amostra do tema (desde o M09: com o painel à esquerda e o título "Foco"; a amostra foi para o `#/dev`). Feche no X da própria janela. Repita até completar **10 vezes**.
5. [ ] Pare a gravação clicando no ponto vermelho (ou Ctrl+Alt+Shift+R de novo). O vídeo fica em `~/Vídeos/Screencasts/`.
6. [ ] Para ver quadro a quadro sem instalar nada, gere uma cópia 8 vezes mais lenta e assista:

   ```bash
   cd ~/Vídeos/Screencasts
   ffmpeg -i "$(ls -t *.webm | head -1)" -vf "setpts=8*PTS" -an /tmp/tomatito-lento.webm
   xdg-open /tmp/tomatito-lento.webm
   ```

   Em nenhuma das 10 aberturas pode aparecer um retângulo branco, preto ou cinza, nem a janela com outras cores antes do vermelho. O esperado é: no lugar da janela surge o vermelho liso e, logo em seguida, a tela completa (até o M08, a amostra com título, cartões e anel; desde o M09, o painel e o título "Foco", com o item Foco já marcado, sem o fundo dele "acender" depois). O GNOME faz a janela crescer um pouco ao abrir; isso é do sistema.
7. [ ] **Console do DevTools:** rode `/opt/cargo-target/tomatito/debug/tomatito` mais uma vez, clique com o botão direito no meio da janela → **Inspecionar** → aba **Console**. Não pode haver nenhuma linha com "Refused to". Feche o inspetor e a janela.
8. [ ] Apague o vídeo e a cópia lenta, se não quiser guardá-los: `rm /tmp/tomatito-lento.webm` e o arquivo em `~/Vídeos/Screencasts/`.

Se aparecer algum clarão, anote em qual das 10 aberturas (a ordem do vídeo) e a cor. Se o console mostrar um "Refused to", copie a linha inteira.

## M09. Navegação

O painel de 280 px com Foco, Temporizador e Cronômetro em cima e Configurações no rodapé, o roteador por hash (`#/foco`, `#/temporizador`, `#/cronometro`, `#/configuracoes` e o `#/dev` com a amostra do M06) e os atalhos Ctrl+1/2/3 e Ctrl+,. Captura: `docs/capturas/m09-navegacao.png`, toda tirada do app de verdade no teste aninhado: em cima, a janela na tela Foco e, à direita, 8 dos 15 quadros que o compositor pintou enquanto o indicador descia do Cronômetro para as Configurações (Ctrl+,); no meio, o painel no Lite, no Suave, no Claro e no Escuro; embaixo, o anel de foco do teclado no Temporizador.

### O que já foi conferido sem olhar a tela (26/09/2026)

- **Teste num GNOME Shell aninhado** (Mutter 50.1, Wayland, o app de verdade com ponteiro e teclado virtuais; nada aparece na sua tela): `bash scripts/gnome-aninhado/rodar.sh navegacao`, 25 conferências, todas ok:
  - `<nav aria-label="Principal">`, a Foco como tela inicial, e só o item dela no Tab;
  - itens de 272 × 36 em x = 4, a cada 40 px a partir de y = 34, e Configurações a 6 px da base; indicador de 3 × 16 na borda esquerda do item, centrado, em `--tt-nav-indicator` (creme no Lite);
  - clicar em Temporizador troca a tela; Ctrl+3, Ctrl+,, Ctrl+1 e Ctrl+2 também;
  - **o indicador desliza** nas cinco trocas, medido de dois jeitos: pela página, a cada quadro (de 194 a 242 ms até parar a menos de 0,5 px do destino, de 6 a 15 posições intermediárias, sem voltar); e pelos quadros que o compositor pintou (de 6 a 15 quadros com o indicador no meio do caminho, em 255 a 311 ms, com o atraso do shell aninhado);
  - Tab entra no painel pelo item da tela atual, com o anel de foco; ↓ ↓ ↓ ↑ Home ↑ End ↑ levam o foco a Cronômetro, Configurações, Configurações (sem dar a volta), Cronômetro, Foco, Foco, Configurações e Cronômetro; as setas não trocam a tela, e só o item focado fica no Tab; Enter abre o item focado; saindo do painel com o foco em outro item e voltando com o Tab, a entrada é de novo o item da tela atual;
  - no `#/dev`, o painel é uma parada só do Tab entre o começo e o conteúdo: Shift+Tab do primeiro botão volta ao painel, e o Tab seguinte, mesmo depois de ↓, vai ao primeiro botão;
  - hover do Lite em branco a 6% e selecionado em branco a 10%;
  - **selecionado no Claro e no Escuro, trocando o `data-theme`** (pela sonda, como no console do DevTools), medido na tela e comparado com a captura do Relógio: Claro `#F3F3F3` → `#EAEAEA` (Relógio, sobre a Mica: `#F0F3F9` → `#E8EAF0`, a mesma sobreposição de preto a ~3,5%); Escuro `#202020` → `#2D2D2D` (Relógio: `#202020` → `#2D2D2D`, igual); indicador `#B8402D` no Claro e `#F0745A` no Escuro. Suave e Lite também conferidos;
  - nenhum erro na página; o app sai sozinho quando a janela fecha.
- **Boot sem clarão, de novo:** o roteiro do M08 (`partida-a-frio`) passa no dev e no build de debug, 10 partidas cada: só dois quadros distintos por partida, o fundo liso e o final. Na primeira rodada do M09 ele pegou o fundo do item Foco "acendendo" depois do `show()` (uma transição de 83 ms); a correção está em `docs/decisoes.md`, M09, item 6. O roteiro do M07 (`barra-de-titulo`) continua com as 36 conferências ok.
- **Prévias:** no Chrome headless (onde o `focusgroup` é nativo, como no WebView2 do Windows), clique, Ctrl+1/2/3, Ctrl+,, Tab, as setas, Home, End e Enter fazem o mesmo; com `--motion reduce`, o indicador troca com fade de 83 ms, sem sair do lugar. No WebKitGTK fora da tela (`npm run shot:webkit`), o polyfill cuida das setas e da parada do Tab, o indicador desliza em uns 250 ms, e com o "Animações" do GTK desligado vira o fade.
- **Na sua sessão, rápido e sem mexer na janela:** o build de debug abriu com o inspetor remoto ligado; o console veio vazio (nenhum "Refused to"), a URL em `#/foco`, o tema Lite e a Inter carregada; o app foi fechado logo em seguida, sem processo sobrando.
- `npm test` (48 testes, 12 novos), `node scripts/contrast.mjs`, `cargo fmt --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace` e a checagem cruzada do Windows passam.

### Passos para você (uns 4 minutos)

1. [ ] Em `~/dev/tomatito`, rode `npm run tauri dev` e espere a janela (uns 5 s).
2. [ ] **Clique** em Temporizador, Cronômetro, Configurações e Foco. A cada clique, o título da direita muda, o item clicado fica com o fundo um pouco mais claro, e a barrinha creme da esquerda **desliza** do item anterior até ele (rápida no começo e freando no fim, em um quarto de segundo). De Cronômetro para Configurações ela atravessa o painel inteiro.
3. [ ] **Atalhos:** Ctrl+2, Ctrl+3, Ctrl+, (vírgula) e Ctrl+1. Cada um abre a tela certa, com o mesmo deslize.
4. [ ] **Teclado:** clique na área vazia da direita e aperte **Tab**: o item da tela atual ganha um contorno creme. Use **↑** e **↓**: o contorno anda pelos quatro itens, sem dar a volta nas pontas, e a tela não muda. **Enter** abre o item com o contorno. Mais um **Tab** sai do painel.
5. [ ] **Claro e Escuro contra o Relógio:** clique com o botão direito na área vazia → **Inspecionar** → aba **Console**, e rode `document.documentElement.dataset.theme = 'light'`. Compare o item marcado com o da janela da esquerda de `~/dev/tomatito-ref/wl-the-old-Focus-sessions-on-the-left-and-new-Focus-sessions-on-the-right.png` (um cinza só um pouco mais escuro que o painel). Depois rode `document.documentElement.dataset.theme = 'dark'` e compare com `~/dev/tomatito-ref/clock-focus-sessions-page.png` (o mesmo cinza do "Focus sessions"). A barrinha é vermelha nos dois (e não rosa, como no Relógio, que usa a cor de destaque do Windows). Volte com `document.documentElement.dataset.theme = 'lite'` e feche o inspetor.
6. [ ] (Opcional) Desligue as animações do GNOME num terminal, com `gsettings set org.gnome.desktop.interface enable-animations false`, e troque de tela (se nada mudar, feche e abra o app de novo): a barrinha some de um item e aparece no outro com um fade rápido, sem deslizar. Religue com `gsettings set org.gnome.desktop.interface enable-animations true`.
7. [ ] Feche a janela no X e, no terminal, Ctrl+C se o `tauri dev` não sair sozinho.

Se algo não bater, anote qual passo e o que apareceu.

## M10. Camada de conteúdo e responsivo

A área das telas virou uma camada (`--tt-bg-surface`) com borda de 1 px em cima e à esquerda e o canto superior esquerdo de 8 px; abaixo de 860 px de janela, o painel compacta para 48 px, só com os ícones e uma dica ao lado; a tela Foco ganhou a grade dos cartões (por enquanto só com os títulos), com 2 colunas a partir de 560 px de área e 1 abaixo. Captura: `docs/capturas/m10-responsivo.png`, toda tirada do app de verdade no teste aninhado: em cima, a janela com 1000, 859, 608 e 480 px; embaixo, o canto da camada ampliado no Lite e no Escuro, a dica com o mouse e com o teclado, e a janela de 480 px com zoom de 160%.

### O que já foi conferido sem olhar a tela (27/09/2026)

- **Teste num GNOME Shell aninhado** (Mutter 50.1, Wayland, o app de verdade com ponteiro e teclado virtuais; nada aparece na sua tela): `bash scripts/gnome-aninhado/rodar.sh responsivo`, 18 conferências, todas ok:
  - a 1000 px: painel de 280, camada em x = 280 e y = 32, borda de 1 px só em cima e à esquerda, canto de 8 px e 2 colunas; nos pixels, Lite (painel `#A5342B`, camada `#AA392F`, borda `#BD6359`) e Escuro (`#202020`, `#282828`, `#3A3A3A`), com o fundo no vértice do canto;
  - **estreitando a janela pela borda direita com o ponteiro**, de 1000 px até passar do mínimo, com 18 paradas: nenhuma rolagem horizontal em nenhuma; painel de 280 até 860 px e de 48 em 859; 2 colunas até 609 px e 1 em 608; a janela para em 480;
  - a 480 px, as cinco telas (Foco, Temporizador, Cronômetro, Configurações e `#/dev`) sem rolagem horizontal, também com a tela forçada a rolar na vertical; e com zoom de 120%, 140% e 160% (Ctrl+=), que deixam a página com 400, 343 e 300 px CSS; Ctrl+0 volta;
  - a dica do painel compacto: aparece uns 250 ms depois de o mouse parar no item (265 ms medidos pela página), à direita dele e centrada; some com Esc e volta no item seguinte; some ao apertar o item e não volta com o mouse parado; acompanha o foco do teclado (Tab e ↓) e some com Esc; não aparece no painel largo;
  - nenhum erro na página; o app sai sozinho quando a janela fecha.
- **Nos dois motores, sem janela** (`node scripts/preview/responsivo.mjs`): 15 larguras (1000, 880, 861, 860, 859, 700, 610, 609, 608, 560 e 480, e 480 com zoom de 120% a 160%) × 5 telas no Chrome headless e no WebKitGTK fora da tela, e de novo nos dois com barras de rolagem clássicas e a tela forçada a rolar (como no Windows; no WebKitGTK, com `GTK_OVERLAY_SCROLLING=0`): nenhuma rolagem horizontal, painel e colunas nos limites certos, e a camada certa nos quatro temas normais. No Chrome, também as dicas com mouse, teclado e Esc. O rótulo continua sendo o nome do link no painel compacto (`link "Foco"`, sem descrição repetida).
- **Regressões:** os roteiros do M07 (36 conferências), do M08 (10 partidas no dev e 10 no build de debug, sem quadro fora do Lite e sem "Refused to") e do M09 (25) continuam passando.
- **Na sua sessão, rápido e sem mexer na janela:** o build de debug abriu com o inspetor remoto; o console veio vazio, e o layout de 1000 px veio com o painel de 280, a camada com a borda e o canto, e 2 colunas; o app foi fechado logo em seguida, sem processo sobrando.
- `npm test` (56 testes, 8 novos), `node scripts/contrast.mjs` (com a tabela nova da camada), `cargo fmt --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace` e a checagem cruzada do Windows passam.

### Passos para você (uns 4 minutos)

1. [ ] Em `~/dev/tomatito`, rode `npm run tauri dev` e espere a janela (uns 5 s).
2. [ ] **A camada:** à direita do painel, a área das telas é um vermelho um pouco mais claro que o do painel, separada dele por uma linha fina em cima e à esquerda, com o canto de cima à esquerda arredondado. Na tela Foco, três cartões só com o título: "Pronto para focar" e "Tarefas" à esquerda, "Progresso diário" à direita.
3. [ ] **Estreitar:** puxe a borda direita da janela devagar para a esquerda, até ela parar (480 px). Em nenhum momento aparece barra de rolagem horizontal. Quando a janela fica mais estreita que uns 860 px, o painel vira uma coluna só com os ícones; os cartões continuam em duas colunas até uns 610 px e depois ficam um embaixo do outro. Volte a alargar: tudo volta ao que era.
4. [ ] **Dica:** com o painel só com ícones, pare o mouse sobre o ícone da ampulheta: em um quarto de segundo aparece "Temporizador" ao lado. Aperte **Esc**: a dica some sem você mover o mouse. Clique no ícone: a tela troca, e a dica não volta enquanto o mouse fica parado ali.
5. [ ] **Teclado:** clique na área vazia da direita e aperte **Tab**: o ícone da tela atual ganha o contorno e, logo depois, a dica com o nome. **↑** e **↓** levam o contorno e a dica aos outros ícones.
6. [ ] **Zoom:** com a janela estreita, aperte **Ctrl+=** três vezes. Tudo cresce, os títulos dos cartões quebram em duas linhas, e continua sem barra de rolagem horizontal. **Ctrl+0** volta.
7. [ ] (Opcional) Em Configurações do GNOME → Acessibilidade, ligue a opção de sempre mostrar as barras de rolagem, abra o `#/dev` (botão direito → Inspecionar → Console: `location.hash = '#/dev'`), que é mais alto que a janela, e repita o passo 3. Se a barra vertical aparecer (o teste automático só conseguiu ligá-la pela variável `GTK_OVERLAY_SCROLLING=0`, e não se sabe se o WebKitGTK segue a opção do GNOME), ela fica dentro da camada, e ainda assim nada rola na horizontal. Desligue a opção depois.
8. [ ] Feche a janela no X e, no terminal, Ctrl+C se o `tauri dev` não sair sozinho.

Se algo não bater, anote qual passo e o que apareceu.

## M11. Tokens do Fluent gerados

Os tokens do Fluent (as cores, os raios e as sombras que os componentes leem) agora vêm de um arquivo gerado no build, `src/styles/fluent-tokens.gen.css`, com um bloco por tema; o `setTheme` provisório do M01 saiu. No Lite, nada muda na tela. Nos temas claros (Suave e Claro), a bolinha do switch ligado passa de escura a branca, como no Windows 11. Captura: `docs/capturas/m11-temas-fluent.png`, do app de verdade no teste aninhado: em cima, o cartão "Opções" do `#/dev` nos quatro temas; embaixo, o Suave e o Claro como eram no M10.

### O que já foi conferido sem olhar a tela (27/09/2026)

- **Teste num GNOME Shell aninhado** (Mutter 50.1, Wayland, o app de verdade; nada aparece na sua tela): `bash scripts/gnome-aninhado/rodar.sh temas-fluent`, 18 conferências, todas ok:
  - **nada muda na tela:** as cinco telas no Lite, a 1000 × 700, idênticas pixel a pixel às do M10 (uma rodada com o `index.html` e o `main.js` do M10, outra com os do M11, comparadas com `TT_ANTES`);
  - trocando o `data-theme` do `<html>` como no console do DevTools, entre `lite`, `suave`, `light` e `dark`: os 459 tokens do Fluent de cada tema são os do bloco gerado (e, nos 22 que a ponte cobre, o `--tt-*` do tema); o switch, o radio e o cartão pintam as cores do tema na página e na captura da tela, de quatro jeitos diferentes;
  - um `<div data-theme="suave">` dentro do `<html>` do Lite recebe os tokens e o switch do Suave;
  - nenhum erro na página; o app sai sozinho quando a janela fecha.
  - Controle negativo: com o `index.html` e o `main.js` do M10, as conferências de tokens falham nos quatro temas, e as da tela no Suave e no Claro (a bolinha escura).
- **Nos dois motores, sem janela** (`node scripts/preview/temas-fluent.mjs`): o mesmo no Chrome headless (o motor do Windows) e no WebKitGTK fora da tela, nos cinco temas (com o `full`, que pinta como o Lite) e na prévia aninhada do Suave, do Claro e do Escuro. As prévias das cinco telas no Lite e da Foco e do `#/dev` no Escuro também saíram idênticas às do M10, pixel a pixel, nos dois motores.
- **Build:** `rm -f src/styles/fluent-tokens.gen.css && npm run build` gerou o arquivo de novo antes do Vite; no CSS do `dist/`, os tokens de cada tema equivalem aos do dev (o build só encurta a escrita, como `200ms` para `.2s`).
- **Regressões:** os roteiros do M07 (36 conferências), do M09 (25) e do M10 (18) e as partidas a frio do M08 (10 no dev e 10 no build de debug, sem quadro fora do Lite e sem "Refused to") continuam passando.
- **Na sua sessão, rápido e sem mexer na janela:** o build de debug (`npx tauri build --debug --no-bundle`) abriu com o inspetor remoto; o console veio vazio, a CSP recusou o controle, o `<html>` veio com `lite`, a Inter carregada, nenhuma folha adotada no documento (a do `setTheme` saiu), os tokens do Fluent vindos do CSS gerado (`--colorNeutralForegroundInverted` `#242424`, `--borderRadiusCircular` `10000px`) e o layout de 1000 px igual ao do M10. O app foi fechado logo em seguida, sem processo sobrando.
- `npm test` (64 testes, 8 novos do gerador), `node scripts/contrast.mjs`, `cargo fmt --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace` e a checagem cruzada do Windows passam.

### Passos para você (uns 3 minutos)

1. [ ] Em `~/dev/tomatito`, rode `rm -f src/styles/fluent-tokens.gen.css && npm run build`. A primeira linha depois do `> prebuild` diz `build-theme-css: src/styles/fluent-tokens.gen.css gerado (39811 bytes)`, e o build termina com o `dist/` montado; o arquivo existe de novo em `src/styles/`.
2. [ ] Rode `npm run tauri dev` e espere a janela (uns 5 s). Ela abre no Lite, igual à de antes.
3. [ ] Botão direito na janela → **Inspecionar** → aba **Console**. Digite `location.hash = '#/dev'` e Enter: aparece a "Amostra do tema".
4. [ ] No Console, digite `document.documentElement.dataset.theme = 'suave'` e Enter. O fundo fica rosado claro, o switch "Tocar som no fim do foco" fica vermelho com a **bolinha branca**, o desligado tem a bolinha marrom, e o radio "5 minutos" fica vermelho. Repita com `'light'` (o mesmo sobre cinza claro), `'dark'` (fundo escuro, switch em vermelho claro com a bolinha escura) e `'lite'` (volta ao vermelho, com o switch creme).
5. [ ] (Opcional) Na aba **Elements**, clique no `<html>`, dê duplo clique no valor de `data-theme` e troque por `suave`: o efeito é o mesmo do passo 4. No painel **Styles** de um `fluent-switch`, os `--color...` vêm do `fluent-tokens.gen.css`, e os que a ponte cobre (como `--colorNeutralBackground1`), do `bridge.css`.
6. [ ] Feche a janela no X e, no terminal, Ctrl+C se o `tauri dev` não sair sozinho.

Se algo não bater, anote qual passo e o que apareceu.

## M12. Controles Fluent e posicionamento

O `#/dev` virou o "Catálogo de controles": além da amostra do M06, tem caixas de seleção, duas listas suspensas ("Meta diária" e a longa "Zerar progresso às"), dois menus, um diálogo ("Editar meta diária", com uma lista dentro) e duas dicas. No WebKitGTK, tudo abre no lugar certo com o CSS Anchor Positioning, inclusive o `fluent-menu`, então o popover próprio (plano B do marco) não foi preciso. Captura: `docs/capturas/m12-controles.png`, toda tirada do app de verdade no teste aninhado: em cima, o menu "Sessão" aberto embaixo do botão, o menu "Temporizador" virado para cima perto da borda de baixo e a lista das 24 horas também virada para cima; embaixo, a lista "Meta diária", as duas dicas (em cima e embaixo do botão), as caixas de seleção marcadas em creme e o diálogo com a lista aberta.

### O que já foi conferido sem olhar a tela (27/09/2026)

- **Teste num GNOME Shell aninhado** (Mutter 50.1, Wayland, o app de verdade com ponteiro e teclado virtuais; nada aparece na sua tela): `bash scripts/gnome-aninhado/rodar.sh controles`, 22 conferências, todas ok:
  - a caixa marcada é creme (`#FFF4EE`) na tela, sem nenhum pixel azul; clicar marca e desmarca; com o mouse em cima, fica no creme do hover (`#FDE8E0`), e apertada, no do pressionado (`#F8D7CC`);
  - com o clique do ponteiro, os dois menus abrem embaixo do próprio botão, alinhados à esquerda dele (cada um no seu, apesar de o Fluent dar o mesmo nome de âncora aos dois); com o botão colado na borda de baixo, o menu vira para cima; as listas suspensas abrem embaixo da caixa, com pelo menos a largura dela, e a longa vira para cima e cabe na janela. Conferido pela página e pelos pixels (o que mudou na tela entre antes e depois do clique fica em volta do que abriu). Esc fecha e devolve o foco ao botão;
  - a roda do mouse com o menu aberto rola a tela, e o menu acompanha o botão (78 px os dois);
  - teclado: Enter no botão abre o menu com o foco no 1º item, ↓ e ↑ andam, Esc fecha e volta ao botão;
  - clicar em "2 horas" troca o valor da lista e fecha;
  - as dicas aparecem com o mouse parado, centradas em cima do botão (ou embaixo, na "Volta"), a 4 px; Esc fecha; somem ao tirar o mouse (também para fora da janela, com um movimento de verdade); o foco do teclado também as mostra;
  - o diálogo é modal, centrado, com o fundo escurecido pelo `--tt-smoke` (o painel atrás fica `#73241E`, o Lite a 70%); a lista de dentro abre embaixo da caixa; o 1º Esc fecha só a lista, o 2º fecha o diálogo, e o foco volta ao botão que o abriu; Cancelar fecha;
  - nenhum erro na página; o app sai sozinho quando a janela fecha.
- **Nos dois motores, sem janela** (`node scripts/preview/controles.mjs`): as mesmas posições no Chrome headless (o motor do Windows) e no WebKitGTK fora da tela, e as caixas marcadas no accent de cada tema (creme no Lite, `#B8402D` no Suave e no Claro, `#DD634B` no Escuro), nunca azuis, com o hover e o clique da borda vindos da ponte. Controle negativo: com as âncoras sabotadas de propósito, as 5 conferências de menu e de lista acusam a falha nos dois motores.
- **Build de debug, com a CSP:** as 10 partidas a frio do teste aninhado agora também vão ao `#/dev` e abrem e fecham os menus, as listas, as dicas e o diálogo pelo console do inspetor: nenhum "Refused to".
- **Regressões:** os roteiros do M07 (36 conferências), do M09 (25), do M10 (18) e do M11 (17), as partidas a frio do M08 (10 no dev e 10 no build de debug) e as prévias do M10 e do M11 continuam passando.
- **Na sua sessão, rápido e sem mexer na janela:** o build de debug abriu com o inspetor remoto por menos de 25 s; o console veio vazio, a CSP recusou o controle, e os menus, as listas, as dicas e o diálogo do `#/dev` abriram e fecharam sem nenhum "Refused to". O app foi fechado logo em seguida, sem processo sobrando.
- `npm test`, `node scripts/contrast.mjs`, `npm run build`, `cargo fmt --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace` e a checagem cruzada do Windows passam.

### Passos para você (uns 5 minutos)

1. [ ] Em `~/dev/tomatito`, rode `npm run tauri dev` e espere a janela (uns 5 s).
2. [ ] Botão direito na janela → **Inspecionar** → aba **Console**. Digite `location.hash = '#/dev'` e Enter: aparece o "Catálogo de controles". Feche o DevTools.
3. [ ] **Caixas de seleção:** role até "Caixas de seleção". "Pular intervalos" está marcada em **creme** (não azul), com o visto escuro. Clique em "Tocar som no fim do intervalo": ela fica creme também. Clique de novo: desmarca. (As duas desabilitadas estão pretas: é esperado até o M13, que acerta os estados desabilitados.)
4. [ ] **Menus:** em "Menus", clique em "Sessão": a lista abre logo embaixo do botão, com a borda esquerda alinhada à dele. Aperte **Esc**: fecha. Clique em "Temporizador": abre embaixo **dele**, e não do "Sessão". Com o menu aberto, gire a roda do mouse sobre a área da direita: o menu anda junto com o botão.
5. [ ] **Virar para cima:** role a tela até o botão "Temporizador" ficar bem perto da borda de baixo da janela e clique nele: o menu abre **em cima** do botão. Faça o mesmo com a lista "Zerar progresso às": ela abre para cima, com uma barra de rolagem, e cabe na janela.
6. [ ] **Listas:** clique na caixa "Meta diária": a lista abre embaixo, da largura da caixa ou mais. Clique em "2 horas": a caixa passa a mostrar "2 horas", e a lista fecha.
7. [ ] **Dicas:** pare o mouse sobre "Reiniciar": em um quarto de segundo aparece, **em cima** e centrada, "Voltar o temporizador ao início". Sobre "Volta", a dica aparece **embaixo**. Tire o mouse: some.
8. [ ] **Diálogo:** clique em "Editar meta diária": o diálogo aparece no meio da janela, com o resto escurecido. Abra a lista "Meta diária" dele: abre embaixo da caixa, por cima da borda do diálogo. Aperte **Esc** uma vez: fecha só a lista. Aperte **Esc** de novo: fecha o diálogo. Abra de novo e clique em "Cancelar": fecha.
9. [ ] Feche a janela no X e, no terminal, Ctrl+C se o `tauri dev` não sair sozinho.

Se algo não bater, anote qual passo e o que apareceu.

## M13. Botões próprios, foco e ícones

O `#/dev` agora mostra todos os botões do app (padrão, destaque, sutil de 32 × 32 e circulares de 32 e 64 px), cada um com o seu desabilitado, os desabilitados dos componentes Fluent (caixas, switches, radio, lista suspensa e item de menu) e o cartão "Ícones", com os 18 ícones copiados para `src/assets/icons/`. O Tab mostra o anel duplo nos botões, e os botões só de ícone têm uma dica própria. Capturas: `docs/capturas/m13-botoes.png` (app de verdade, no teste aninhado: os botões com o anel do Tab e a dica, os desabilitados e os ícones) e `docs/capturas/m13-temas.png` (prévia no Chrome: os botões e as opções nos quatro temas).

### O que já foi conferido sem olhar a tela (27/09/2026)

- **Teste num GNOME Shell aninhado** (Mutter 50.1, Wayland, o app de verdade com ponteiro e teclado virtuais; nada aparece na sua tela): `bash scripts/gnome-aninhado/rodar.sh botoes`, 17 conferências, todas ok:
  - os botões e os desabilitados do Fluent com as cores dos tokens do Lite (nenhum preto nem cinza do Fluent) e os ícones do catálogo no tamanho certo, sem nenhum pedido ao pacote de ícones;
  - o Tab (do teclado virtual) leva ao primeiro botão com o anel duplo, conferido também nos pixels: 1 px do cartão colado ao botão e 2 px de creme por fora; o Tab seguinte vai ao "Cancelar" e o outro pula os dois desabilitados e chega ao "Mais opções", com o anel e a dica em cima; Esc fecha a dica e o foco fica;
  - o clique do ponteiro não mostra o anel; o botão padrão fica `#B55045` em repouso, `#B75449` com o mouse e `#B34A3F` apertado (com a borda de baixo lisa); o sutil, sem fundo em repouso, ganha o hover;
  - a dica com o ponteiro parado no "Marcar volta": fechada 120 ms depois, aberta depois do atraso, em cima e centrada a 4 px (na página e na tela); passando ao vizinho "Pausar", a dica dele vem sem o atraso; some com Esc, ao tirar o mouse (também para fora da janela), ao apertar o botão; volta quando o mouse volta; nada no botão desabilitado; com o menu "Sessão" aberto, a dica aparece e o menu continua aberto.
- **Nos dois motores, sem janela** (`node scripts/preview/botoes.mjs`): os botões e os desabilitados nos quatro temas, contra os tokens de cada um; os ícones; a dica (atraso, posição, virar para baixo perto do topo, sair, desabilitado, menu aberto); e, no Chrome (o motor do Windows), o mouse e o Tab de verdade, inclusive o anel redondo no botão circular. Controle negativo: com a âncora da dica sabotada, a posição acusa nos dois.
- **Contraste:** `node scripts/contrast.mjs` imprime uma tabela nova, "Desabilitados", só de registro: no Lite e no Suave, os valores ficaram na faixa do Claro e do Escuro (os do Windows).
- **Build de debug, com a CSP:** as partidas a frio também abrem e fecham a dica dos botões de ícone: nenhum "Refused to".
- **Regressões:** os roteiros do M07 (36 conferências), do M09 (25), do M10 (18), do M11 (17) e do M12 (22), as partidas a frio do M08 (10 no dev e 10 no build de debug) e as prévias do M10, do M11 e do M12 continuam passando.
- **Na sua sessão, rápido e sem mexer na janela:** o build de debug abriu por uns 5 s com o inspetor remoto; o console veio vazio, a CSP recusou o controle, e os controles do `#/dev` (inclusive a dica dos botões de ícone) abriram e fecharam sem nenhum "Refused to". O app foi fechado logo em seguida, sem processo sobrando.
- `npm test`, `node scripts/copy-icons.mjs --conferir`, `npm run build`, `cargo fmt --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace` e a checagem cruzada do Windows passam.

### Passos para você (uns 5 minutos)

1. [ ] Em `~/dev/tomatito`, rode `npm run tauri dev` e espere a janela (uns 5 s).
2. [ ] Botão direito na janela → **Inspecionar** → aba **Console**. Digite `location.hash = '#/dev'` e Enter. Feche o DevTools.
3. [ ] **Botões:** no cartão "Botões", o "Iniciar sessão de foco" é creme com um ▶ vermelho; o "Cancelar" é translúcido. Passe o mouse e aperte (sem soltar) o "Cancelar": ele clareia no hover e escurece um pouco apertado. Embaixo, "Salvar" e "Descartar" estão desabilitados: texto apagado, mas legível, e nada muda com o mouse.
4. [ ] **Anel do Tab:** clique no título "Catálogo de controles" e aperte **Tab**: o "Iniciar sessão de foco" ganha um anel creme por fora, separado do botão por uma linha fina vermelha. Tab de novo: vai ao "Cancelar". Tab de novo: pula os dois desabilitados e vai ao "…" (Mais opções), e um quarto de segundo depois aparece a dica "Mais opções" em cima. Aperte **Esc**: a dica some e o anel fica.
5. [ ] **Clique sem anel:** clique no "Cancelar" com o mouse: nenhum anel aparece.
6. [ ] **Dica com o mouse:** pare o mouse sobre o botão redondo grande da bandeira: aparece "Marcar volta" em cima, centrada. Tire o mouse: some. Pare de novo e clique: some. Sobre o último botão redondo grande (desabilitado), nenhuma dica.
7. [ ] **Desabilitados do Fluent:** role até "Opções", "Caixas de seleção" e "Listas suspensas": os switches, o radio de 30 minutos, as duas caixas desabilitadas e a lista "Som do intervalo" aparecem apagados, **sem nada preto**. Abra o menu "Temporizador": o item "Duplicar" está apagado e sem fundo escuro.
8. [ ] **Ícones:** no fim da página, o cartão "Ícones" mostra 18 ícones (alguns em dois tamanhos), todos visíveis e em creme.
9. [ ] **Outros temas (opcional):** no Console do DevTools, `document.documentElement.dataset.theme = 'suave'` (e depois `'light'` e `'dark'`): os botões e os desabilitados acompanham o tema. No Suave, o botão padrão apertado fica um pouco mais claro que no hover.
10. [ ] Feche a janela no X e, no terminal, Ctrl+C se o `tauri dev` não sair sozinho.

Se algo não bater, anote qual passo e o que apareceu.

## M14. Regra dos intervalos

Nada a conferir na tela neste marco: é só o `tomatito-core`, sem janela. O que foi conferido de forma automática (27/09/2026):

- `cargo test -p tomatito-core plan` (o "Pronto quando"): 10 testes do `plan.rs`, todos ok. Com um `CARGO_TARGET_DIR` vazio, compila só o `tomatito-core`.
- `cargo test -p tomatito-core`: também os 2 testes de `tests/isolamento.rs`, que leem a árvore do `cargo tree` (todos os sistemas; dependências normais, de build e de desenvolvimento).
- Mutações: 4 na regra (cada uma derruba de 1 a 3 testes) e 5 no `Cargo.toml` do núcleo, numa cópia (a forma de tabela, uma dependência indireta, uma só do Windows, uma de desenvolvimento e uma de build: todas reprovadas; o controle com `serde` passa). Detalhes em `docs/decisoes.md`, M14, itens 5 e 6.
- `cargo fmt --all --check`, `cargo clippy --workspace -- -D warnings`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace` e `npm test` passam; a checagem cruzada `cargo clippy --workspace --all-targets --target x86_64-pc-windows-msvc -- -D warnings` (com o `llvm-rc` do LLVM 21 no PATH) também.

### Se quiser rodar (1 minuto)

1. [ ] `cd ~/dev/tomatito/src-tauri && cargo test -p tomatito-core plan`: `test result: ok. 10 passed`.
2. [ ] `cargo test -p tomatito-core --test isolamento`: `test result: ok. 2 passed`.
3. [ ] No CI do Windows (quando o repositório existir; `docs/pendencias-usuario.md`, item 2), o passo **5. cargo test** lista também `Running tests\isolamento.rs` com `test result: ok. 2 passed`. É a primeira vez que o teste roda o `cargo tree` no Windows.


## M15. Relógio e máquina de estados

Nada a conferir na tela neste marco: é só o `tomatito-core`, sem janela, som nem notificação de verdade (o som e o aviso são pedidos ao `FakeEffects`, que só anota). O que foi conferido de forma automática (27/09/2026):

- `cargo test -p tomatito-core` (o "Pronto quando"): 21 testes nos módulos (10 do `plan.rs` e 11 do `clock.rs`), 22 em `tests/foco.rs` e 2 em `tests/isolamento.rs`, todos ok. Os três itens do marco estão em `tests/foco.rs`:
  - iniciar, pausar, retomar, pular e parar: `iniciar_*`, `pausar_guarda_o_restante_e_o_tempo_pausado_nao_conta`, `pular_*` e `parar_*`;
  - o relógio pulando 40 min fecha a fase: `relogio_pulando_40_min_fecha_a_fase`;
  - o relógio pulando 2 h numa sessão de 60 min: `relogio_pulando_2_h_numa_sessao_de_60_min_termina_concluida` (Concluído, 2 focos e 1 intervalo gravados, um único aviso "atrasado", nenhum som).
- `cargo test -p tomatito-core --release`: 15 + 20 + 2 testes; sem `debug_assertions`, o `ScaledClock` e os 8 testes dele ficam de fora, e o resto passa.
- Mutações: 21, numa cópia do núcleo (19 na máquina de estados e 2 no relógio), todas reprovadas. Lista em `docs/decisoes.md`, M15, item 18.
- `cargo fmt --all --check`, `cargo clippy --workspace -- -D warnings`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo clippy -p tomatito-core --all-targets --release -- -D warnings`, `cargo test --workspace` e `npm test` passam; a checagem cruzada `cargo clippy --workspace --all-targets --target x86_64-pc-windows-msvc -- -D warnings` (com o `llvm-rc` do LLVM 21 no PATH) também.

O som tocando, a notificação aparecendo e a contagem na tela chegam no M16 (contagem), no M20 (som) e no M21 (notificação), com as conferências de cada um.

### Se quiser rodar (1 minuto)

1. [ ] `cd ~/dev/tomatito/src-tauri && cargo test -p tomatito-core`: as linhas `test result: ok.` mostram `21 passed`, `22 passed` e `2 passed` (e `0 passed` dos doc-tests).
2. [ ] `cargo test -p tomatito-core --test foco relogio_pulando`: `test result: ok. 2 passed` (o salto de 40 min e o de 2 h).
3. [ ] `cargo test -p tomatito-core --release`: `15 passed`, `20 passed` e `2 passed` (o modo acelerado não existe no release).
4. [ ] No CI do Windows (quando o repositório existir; `docs/pendencias-usuario.md`, item 2), o passo **5. cargo test** lista `Running tests\foco.rs` com `test result: ok. 22 passed`.


## M16. Laço, IPC e primeira contagem

O que foi conferido de forma automática (27/09/2026):

- **Motor (`cargo test -p tomatito`, 17 testes; também em `--release`):** iniciar emite `tt://state` e `tt://phase` e devolve o retrato; um `tt://tick` por segundo mostrado; o relógio de parede saltando 1 min entre dois ticks num foco de 5 min (a volta de uma suspensão) já sai descontado no primeiro tick e no `get_state`; o `get_state` fecha a fase vencida antes do tick; a sessão de 60 min inteira pelo laço (três sons, 3.600 ticks); pausar para os ticks; os códigos de erro; a faixa de minutos; o limite do atraso no modo acelerado; e o laço de verdade com o tempo do tokio parado: ocioso, pausado, concluído e depois de encerrar, uma hora sem nenhum tick.
- **JS (`npm test`, 94 testes):** o `store.js` (estimativa pelo relógio de parede, correção pelo tick, `seq`, ressincronização no `visibilitychange` e no foco da janela, velocidade do `TOMATITO_SPEED`), o relógio de quadros (120 quadros em 2 s = 3 escritas no DOM; parado, nenhum quadro pendente) e o `mm:ss`.
- **Prévia no Chrome headless** com o mock do Tauri (`scripts/preview/tauri-mock.js`, agora com um motor de foco simulado): iniciar, contar e pausar.
- **Teste aninhado** (`bash scripts/gnome-aninhado/rodar.sh contagem`, GNOME Shell 50 headless com o binário de debug e o motor de verdade), 14 conferências ok:
  - "Iniciar 25 min" com o ponteiro virtual: `25:00` logo depois do clique; 5 s depois, `24:55`, igual ao `get_state`, com 5 trocas do texto no DOM (uma por segundo);
  - minimizada por 360 s: na volta, `18:38`, igual ao Rust (1.117.812 ms) e ao relógio do roteiro (1.118 s);
  - app e processos do WebView congelados com `SIGSTOP` por 60 s, 10 s depois de iniciar um foco de 5 min (o substituto da suspensão): no `SIGCONT`, `03:49`, com 229 s esperados, e 2 s depois ainda igual ao Rust;
  - CPU: as threads do tokio (o laço) gastaram 0 tick de CPU em 30 s antes de qualquer sessão e em 30 s depois de encerrar; com a contagem correndo, 0,2% (o controle de que a medida enxerga o laço). O processo inteiro fica em 0,6% a 0,8% por causa do próprio teste (`WAYLAND_DEBUG` e a sonda);
  - captura em `docs/capturas/m16-contagem.png`.
- **Sessão real, 1 minuto:** o binário de debug aberto e fechado sozinho (limite de 60 s), sem sessão: `top -b -d 5` por 30 s mostrou 0,0% no `tomatito`, no `WebKitWebProcess` e no `WebKitNetworkProcess` em todas as amostras depois da primeira.
- `cargo fmt --all --check`, `cargo clippy --workspace -- -D warnings`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace`, `cargo test -p tomatito --release`, `npm run build` e `npm test` passam; a checagem cruzada `cargo clippy --workspace --all-targets --target x86_64-pc-windows-msvc -- -D warnings` (com o `llvm-rc` do LLVM 21 no PATH) também.

### Para conferir (uns 15 minutos, quase todos esperando)

1. [ ] `cd ~/dev/tomatito && npm run tauri dev`. Na tela Foco, o cartão "Pronto para focar" mostra o seletor de minutos (desde o M17; antes, `00:00` e os botões provisórios).
2. [ ] Ponha **25** no seletor (no `tauri dev`, as setas andam de 1 em 1; Home leva a 1 e PageUp soma 15) e clique em **Iniciar sessão de foco**: aparece `25:00` e, em seguida, `24:59`, `24:58`... A linha de baixo diz "Período de foco 1 de 1".
3. [ ] **Minimizar 6 min:** anote o tempo na tela, minimize a janela, espere 6 min no relógio do sistema e volte pela barra de tarefas (ou Alt+Tab). O número deve ser o anotado menos 6 min (± 1 s), já no primeiro quadro, sem "pular" depois.
4. [ ] Clique em **Encerrar**, ponha **5** no seletor e clique em **Iniciar sessão de foco**. Espere uns 30 s e anote o tempo.
5. [ ] **Suspensão:** num terminal, `systemctl suspend`; acorde o computador depois de 1 min pelo relógio do celular. Na volta, o tempo deve ser o anotado menos o tempo que passou (≈ 1 min e pouco), e não o anotado. Se a fase tiver vencido durante a suspensão, a tela mostra "Sessão concluída".
6. [ ] **CPU parado:** clique em **Encerrar**, abra outro terminal e rode `top -p $(pgrep -x tomatito)`. Depois de uns 10 s, a coluna `%CPU` fica em `0,0` (no máximo um `0,3` de vez em quando). Com uma sessão correndo, fica um pouco acima.
7. [ ] Feche o `tauri dev` (Ctrl+C no terminal).


## M17. Card "Pronto para focar"

O que foi conferido de forma automática (27/09/2026):

- **Posições contra a captura do Relógio** (`node scripts/preview/cartao-sessao.mjs`, Chrome headless e WebKitGTK fora da tela, janela de 1372 × 936 px CSS no Escuro, o tamanho da captura a 175%): título, as duas linhas do texto, o seletor (topo e sublinhado), os algarismos, a unidade, os dois chevrons, a frase, a caixa e o botão diferem no máximo 2,0 px em y e 1,1 px no centro em x, medidos pelos pixels dentro do cartão (`scripts/preview/bandas.py`). Com o conteúdo 6 px mais baixo (controle negativo), as 11 posições acusam. Captura lado a lado em `docs/capturas/m17-lado-a-lado.png`, e os quatro temas em `docs/capturas/m17-temas.png`.
- **Seletor:** 160 × 87, campo de 111 e coluna de 48 com 1 px de separação, chevrons de 42 + 1 + 42; fundo `--tt-input-bg`, sublinhado `--tt-stroke-control`, unidade `--tt-fg-2-on-ctl` e texto `--tt-fg-2`; ARIA: `role="spinbutton"`, "Duração da sessão", 5 a 240, `aria-valuetext` "30 minutos", descrito pela frase; chevrons fora do Tab.
- **Teclas e chevrons** (no Chrome, teclas e cliques de verdade; no WebKitGTK, eventos do JS): chevrons 35, 30, 25; ↑ 30, PageUp 45, ↑ 50, PageUp 65, PageDown 50, ↓ 45, End 240 (chevron de cima desabilitado; o clique nele não faz nada), Home 5 (o de baixo desabilitado), ↓ 5, e PageUp até 65. O clique no chevron deixa o foco no campo.
- **Frase:** 30 e 5 min "Sem intervalos.", 45 e 50 "Você terá 1 intervalo.", 65 "Você terá 2 intervalos.", 240 "Você terá 7 intervalos."; com "Pular intervalos", "Sem intervalos.". Os exemplos do `plan.rs` (30, 45, 60, 90 e 185 min) estão travados no `format.test.js`.
- **Iniciar:** o botão pede o `focus_start` com `{ minutes: 65, skipBreaks: true }`, e o cartão passa para a contagem. No debug, o seletor anda de 1 em 1 a partir de 1 min.
- **App de verdade** (teste aninhado do M16, `bash scripts/gnome-aninhado/rodar.sh contagem`, com o motor em Rust e o WebKitGTK): as sessões de 25 e de 5 min começam pelo seletor e pelo botão novo, com as 14 conferências ok.
- `npm test` (110 testes), `npm run build`, `cargo test --workspace`, `cargo fmt --all --check`, `cargo clippy --workspace --all-targets -- -D warnings` e a checagem cruzada `cargo clippy --workspace --all-targets --target x86_64-pc-windows-msvc -- -D warnings` (com o `llvm-rc` do LLVM 21 no PATH) passam; o `scripts/preview/responsivo.mjs` também (85 conferências).

### Para conferir (uns 5 minutos)

1. [ ] `cd ~/dev/tomatito && npm run tauri dev`. Na tela Foco, o cartão "Pronto para focar" mostra o texto "Escolha a duração. Em sessões longas, o Tomatito intercala intervalos curtos.", o seletor com **30** e "min", "Sem intervalos.", a caixa "Pular intervalos" e o botão "Iniciar sessão de foco" com o ícone de play.
2. [ ] Abra `~/dev/tomatito-ref/clock-focus-sessions-page.png` ao lado e compare o cartão a olho: título, texto, seletor, frase, caixa e botão na mesma ordem e nas mesmas alturas (a captura está a 175%; se quiser a mesma escala, use o Ctrl + do app duas ou três vezes).
3. [ ] Clique na seta de cima do seletor: **31** (no `tauri dev`, o passo é 1; no Tomatito instalado, a partir do M21b, é 5). Clique na de baixo: volta a **30**.
4. [ ] Clique no número e use o teclado: ↑ e ↓ mudam 1; PageUp e PageDown mudam 15; End vai a **240** (a seta de cima fica apagada) e Home a **1** (a de baixo fica apagada). A tela não rola com essas teclas.
5. [ ] Com **60**, a frase diz "Você terá 1 intervalo."; com **90**, "Você terá 2 intervalos."; com **30**, "Sem intervalos.". Marque "Pular intervalos": com 90, a frase vira "Sem intervalos.".
6. [ ] Com **5** e "Pular intervalos" desmarcado, clique em **Iniciar sessão de foco**: o cartão passa para a contagem (`05:00`, "Período de foco 1 de 1"). Clique em **Encerrar**: o cartão volta ao seletor, ainda com **5**.
7. [ ] Passe o mouse sobre uma seta do seletor e espere: aparece a dica "Aumentar" ou "Diminuir".
8. [ ] Feche o `tauri dev` (Ctrl+C no terminal).


## M18. Mostrador em foco

O que foi conferido de forma automática (27/09/2026):

- **"Pronto quando" no app de verdade** (`TOMATITO_SPEED=60 bash scripts/gnome-aninhado/rodar.sh mostrador`, GNOME Shell aninhado, motor em Rust e WebKitGTK): o seletor vai a 25 e o ponteiro virtual clica em "Iniciar sessão de foco"; o cartão mostra "Período de foco (1 de 1)", 25 min e o traço 0; em uns 10 s o traço aceso passa de 0 a 11 sem voltar e o número de 25 a 13, batendo com o restante do Rust; o ponteiro clica no "..." (o menu abre com "Encerrar sessão" e "Pular intervalo" desabilitado) e em "Encerrar sessão": o Rust volta ao ocioso e o cartão ao "Pronto para focar". 11 conferências ok. Captura do menu aberto em `docs/capturas/m18-app-menu.png`.
- **Posições contra a captura do Relógio em sessão** (`node scripts/preview/mostrador.mjs`, Chrome headless e WebKitGTK fora da tela, 1372 × 936 px CSS no Escuro): cabeçalho, traços das 12, 3, 6 e 9 horas, número com a unidade, botões e rodapé diferem no máximo 2,9 px (o rodapé; o resto, até 1,9), medidos pelos pixels dentro do cartão (`scripts/preview/mostrador_bandas.py`). Com o mostrador 6 px mais baixo (controle negativo), 7 das 8 posições acusam. Lado a lado em `docs/capturas/m18-lado-a-lado.png`; os quatro temas em `docs/capturas/m18-temas.png`.
- **O resto do marco**, nos dois motores: rótulo do `role="img"` ("27 minutos restantes, período de foco 1 de 2"), cores dos traços e do traço aceso, peso 350 do número, disco com 62% do cartão; no acelerado (`?velocidade=60`), 8 traços em 8 s; o menu encerra; no intervalo, "Intervalo", "A seguir: foco de 27 min" e "Pular intervalo" habilitado, que passa a "Período de foco (2 de 2)"; pausar e retomar trocam o glifo e o rótulo; o modo "uma volta por minuto" anda a cada 2,5 s. 15 conferências em cada motor.
- **Regressões:** o roteiro aninhado do M16 (`contagem`, agora com o número do mostrador e o encerrar pelo menu; rodado com `TT_MINIMIZADA_S=30 TT_CONGELADA_S=20`, 14 conferências ok), o `scripts/preview/cartao-sessao.mjs` do M17 (36) e o `scripts/preview/responsivo.mjs` (85) passam; a 480 px com zoom de 160%, o cabeçalho quebra em duas linhas e empurra o disco, sem nada fora da janela.
- `npm test` (120 testes), `npm run build` (sem nada da prévia no bundle) e `cargo clippy --workspace --all-targets -- -D warnings` passam. O Rust não mudou.

### Para conferir (uns 5 minutos)

1. [ ] `cd ~/dev/tomatito && TOMATITO_SPEED=60 npm run tauri dev`. Na tela Foco, ponha **25** no seletor (no `tauri dev`, as setas andam de 1 em 1) e clique em **Iniciar sessão de foco**.
2. [ ] O cartão mostra, em cima e à esquerda, **Período de foco (1 de 1)**; no meio, o disco com 24 traços e **25 min**; embaixo, o botão redondo de pausar (claro, com o glifo vermelho no Lite) e o "...". Com 1 min passando por segundo, o traço aceso anda no sentido horário mais ou menos a cada segundo, e o número desce um por segundo.
3. [ ] Abra `~/dev/tomatito-ref/crop-insession.png` ao lado e compare a olho: cabeçalho, disco, traços, número, botões e rodapé nas mesmas posições (a captura está a 175%).
4. [ ] **Tom dos traços:** abra o DevTools (botão direito, Inspecionar) e, no console, troque o tema com `document.documentElement.dataset.theme = 'suave'`, depois `'light'`, `'dark'` e `'lite'`. Os traços apagados devem aparecer discretos, mas visíveis, nos quatro. Se algum ficar forte ou fraco demais, anote em `docs/pendencias-usuario.md` (item 25).
5. [ ] **Os dois modos do traço:** no console, `document.documentElement.dataset.ttMostrador = 'minuto'` faz o traço dar uma volta por minuto; `'periodo'` volta ao padrão. Diga qual prefere (item 25).
6. [ ] Clique no **pausar**: o glifo vira play e o número para; clique de novo: volta a contar.
7. [ ] Clique no **"..."**: o menu mostra **Encerrar sessão** e **Pular intervalo** (apagado no foco). Clique em **Encerrar sessão**: o cartão volta ao "Pronto para focar".
8. [ ] Com **60** no seletor, inicie de novo e espere uns 30 s (o primeiro foco, de 27,5 min): o rodapé dizia "A seguir: **intervalo de 5 min**" e passa a "Intervalo", com "A seguir: foco de 27 min". No "...", **Pular intervalo** agora está ativo e leva a "Período de foco (2 de 2)".
9. [ ] Feche o `tauri dev` (Ctrl+C no terminal).

## M19. Pausado, intervalo e concluído

O que foi conferido de forma automática (27/09/2026):

- **"Pronto quando" no app de verdade** (`TOMATITO_SPEED=60 bash scripts/gnome-aninhado/rodar.sh fases`, GNOME Shell aninhado, motor em Rust e WebKitGTK): o seletor vai a 60 e o teclado virtual aperta Espaço com o foco no título: a sessão começa; Espaço pausa ("Período de foco (1 de 2) · Pausado", número em `--tt-fg-2`, glifo de play) e Espaço retoma; a sessão corre sozinha por foco (0 s), intervalo (26,5 s; "Intervalo", traço aceso em `--tt-fg-2`, "A seguir: foco de 27 min"), foco 2 de 2 (31,5 s) e ocioso (59,1 s; "Pronto para focar", Rust em `completed`, sem animação); a região `aria-live` recebeu exatamente quatro textos, um por fase: "Começou o período de foco 1 de 2.", "Começou o intervalo 1 de 1.", "Começou o período de foco 2 de 2.", "Sessão de foco concluída.". 11 conferências ok. Captura do intervalo em `docs/capturas/m19-app-intervalo.png`.
- **Prévia nos dois motores** (`node scripts/preview/fases.mjs`, Chrome headless com teclas de verdade e WebKitGTK fora da tela): a mesma sessão, o pausado no foco e no intervalo, o Espaço no seletor de minutos (não inicia) e a região única, polite, atômica e de 1 px. 6 conferências em cada motor. Os três estados lado a lado em `docs/capturas/m19-estados.png`.
- `npm test` (131 testes), `cargo fmt --all --check`, `cargo test --workspace`, `cargo clippy --workspace --all-targets -- -D warnings`, a checagem cruzada `cargo clippy --workspace --all-targets --target x86_64-pc-windows-msvc -- -D warnings` (com o `llvm-rc` do LLVM 21 no PATH) e `npm run build` (sem nada da prévia no bundle) passam. Regressões: o roteiro aninhado `mostrador` do M18 (11 ok), o `scripts/preview/mostrador.mjs` (15 em cada motor) e o `scripts/preview/cartao-sessao.mjs` do M17 (36) passam.

### Para conferir (uns 5 minutos)

1. [ ] `cd ~/dev/tomatito && TOMATITO_SPEED=60 npm run tauri dev`. Na tela Foco, ponha **60** no seletor (no `tauri dev`, as setas andam de 1 em 1) e clique no título **Foco** (fora de botões), depois aperte **Espaço**: a sessão começa.
2. [ ] Aperte **Espaço** de novo: o cabeçalho vira **Período de foco (1 de 2) · Pausado**, o número fica mais apagado e o botão redondo mostra o play. **Espaço** outra vez retoma.
3. [ ] Espere uns 27 s: o cabeçalho vira **Intervalo**, o traço aceso fica cinza-claro (no Lite, rosa-claro; veja se dá para notar a diferença do branco do foco) e o rodapé, **A seguir: foco de 27 min**. Pause no intervalo: **Intervalo · Pausado**. Retome.
4. [ ] Uns 5 s depois, **Período de foco (2 de 2)**, sem rodapé; uns 27 s depois, o cartão volta ao **Pronto para focar** de uma vez, sem animação, com 60 no seletor.
5. [ ] **Região `aria-live`:** abra o DevTools (botão direito, Inspecionar), ache no fim do `<body>` o `<div class="tt-anuncio" aria-live="polite">` e repita os passos 1 a 4 olhando o nó: ele muda de texto uma vez por fase (quatro vezes na sessão), e não muda ao pausar e retomar nem a cada minuto.
6. [ ] (Opcional, o Orca é do M43.) Com o Orca ligado (Super+Alt+S), cada troca de fase é lida uma vez.
7. [ ] Feche o `tauri dev` (Ctrl+C no terminal).

## M20. Sons

O que foi conferido de forma automática (27/09/2026):

- **Os arquivos e a thread** (`cargo test -p tomatito audio`): os dois WAVs embutidos são mono, 44,1 kHz, 16 bits e 1 s; o rodio decodifica os dois; o fim de foco tem dois ataques e o de intervalo, um; o volume escala o som; a thread atende os pedidos na ordem, não trava quem pede e segue depois de um erro e de um pânico. `python3 scripts/gen-sounds.py --check` confere que os arquivos são os do script, byte a byte.
- **Tocando de verdade na saída da máquina, a 1%** (`cargo test -p tomatito toca_na_saida -- --ignored`, com o `pw-dump` olhando): o PipeWire mostrou o fluxo `alsa_playback.tomatito…` rodando, um por som, e sumindo entre um e outro.
- **No app de verdade, com PipeWire** (`TOMATITO_SPEED=60 TT_PIPEWIRE=/run/user/$UID bash scripts/gnome-aninhado/rodar.sh sons`, GNOME Shell aninhado): no `#/dev`, o ponteiro virtual clica em "Testar fim de foco" e em "Testar fim de intervalo": cada clique abre um fluxo novo no PipeWire, de uns 1,4 s, ligado à saída padrão, que fecha sozinho; o `sound_test` sem argumento abre dois, um depois do outro; uma sessão de 5 min (5 s a 60×) termina e o som sai pelo motor. Nenhuma falha de som no log.
- **No app de verdade, sem áudio** (o mesmo com `TT_SEM_AUDIO=1` no lugar do `TT_PIPEWIRE`): os cinco pedidos viram cinco linhas "`[tomatito] som: … não tocou: sem saída de áudio`" no log, a sessão termina, o app segue respondendo e fecha normalmente, sem pânico.
- `npm test`, `npm run build`, `cargo fmt --all --check`, `cargo test --workspace`, `cargo clippy --workspace --all-targets -- -D warnings` e a checagem cruzada `cargo clippy --workspace --all-targets --target x86_64-pc-windows-msvc -- -D warnings` (com o `llvm-rc` do LLVM 21 no PATH) passam.

O que não dá para conferir daqui: **ouvir** os sons e **trocar a saída** (esta máquina só tem a saída interna, e trocar a saída padrão da sua sessão durante o teste mexeria no seu áudio).

### Para conferir (uns 5 minutos, com um fone à mão)

1. [ ] Volume do sistema num nível normal. `cd ~/dev/tomatito && npm run tauri dev` e vá ao catálogo: no console do DevTools (botão direito, Inspecionar), digite `location.hash = '#/dev'` e Enter. Role até o cartão **Sons**.
2. [ ] Clique em **Testar fim de foco**: duas notas curtas, subindo, que somem em menos de 1 s. Clique em **Testar fim de intervalo**: uma nota só. Nenhum estalo no começo nem no fim. Diga se o timbre e o volume (80%) servem (`docs/pendencias-usuario.md`, item 29).
3. [ ] **Sem reiniciar o app**, plugue o fone (ou conecte um fone Bluetooth) e confira em Configurações → Som que a saída mudou para ele. Clique de novo em **Testar fim de foco**: o som sai **no fone**, e não no alto-falante.
4. [ ] Desplugue o fone (a saída volta ao alto-falante) e teste de novo: sai no alto-falante.
5. [ ] Com o som do sistema **mudo**, clique em Testar: nada toca e o app segue normal.
6. [ ] **Fim de fase:** feche o `tauri dev` e abra com `TOMATITO_SPEED=60 npm run tauri dev`. Na Foco, ponha **60** no seletor e inicie: uns 27 s depois, o fim do foco toca as duas notas; uns 5 s depois, o fim do intervalo toca a nota só; uns 27 s depois, o fim da sessão toca as duas notas de novo. Repita com a janela **minimizada**: os sons tocam do mesmo jeito.
7. [ ] Feche o `tauri dev` (Ctrl+C no terminal).

## M21. Notificações

O que foi conferido de forma automática (28/09/2026):

- **"Pronto quando" no app de verdade** (`TOMATITO_SPEED=60 TT_PIPEWIRE=/run/user/$UID bash scripts/gnome-aninhado/rodar.sh notificacoes`, GNOME Shell 50.1 aninhado, com o motor, o som a 1% e as notificações de verdade): uma sessão de 60 min começa e a janela é minimizada; no fim do foco (uns 27,5 s), no fim do intervalo (5 s depois) e no fim da sessão, chega ao shell uma notificação com os textos do plano ("Período de foco concluído" / "Intervalo de 5 min. Próximo foco às HH:MM.", com a hora batendo com o prazo do intervalo no fuso local; "Intervalo concluído" / "Período de foco 2 de 2, 27 min."; "Sessão de foco concluída" / "60 min de foco."), com a janela ainda minimizada, o balão na tela (e ainda lá 1,5 s depois) e um som no PipeWire junto de cada uma. Captura dos dois balões em `docs/capturas/m21-baloes.png`.
- **"Não perturbe"** (o `show-banners` desligado, como o botão do GNOME faz): uma sessão de 5 min, minimizada, termina com a notificação na lista, nenhum balão e o som tocando. Nenhuma notificação do app some da lista durante a rodada.
- **Fim atrasado:** o app congelado (`SIGSTOP`) por 66 s numa sessão de 5 min (a 60×, passa do limite do atraso) dá, na volta, um aviso só, "Sessão concluída às HH:MM", sem corpo e sem som; a sessão termina concluída. 25 conferências ok, e o app sai sozinho depois de a janela fechar.
- `cargo test --workspace` (os textos no `i18n.rs` e as horas locais no núcleo), `cargo fmt --all --check`, `cargo clippy --workspace --all-targets -- -D warnings`, a checagem cruzada `cargo clippy --workspace --all-targets --target x86_64-pc-windows-msvc -- -D warnings` (com o `llvm-rc` do LLVM 21 no PATH), `npm test` (131) e `npm run build` passam. Regressões: os roteiros aninhados `sons` e `fases` passam. Numa primeira rodada do `sons`, o primeiro som foi para o fone Bluetooth (a saída padrão no começo) e os outros para a saída interna, porque o fone desconectou no meio; a segunda rodada passou inteira. Sem querer, foi a troca de saída do M20 funcionando.

O que não dá para conferir daqui: ver os balões no **seu** GNOME, ouvir os sons junto e o botão "Não perturbe" de verdade (o teste mexe só no GSettings do shell aninhado, que fica em memória).

### Para conferir (uns 5 minutos)

1. [ ] `cd ~/dev/tomatito && TOMATITO_SPEED=60 npm run tauri dev`. Na tela Foco, ponha **60** no seletor (no `tauri dev`, as setas andam de 1 em 1), clique em **Iniciar sessão de foco** e **minimize** a janela (o botão "–" da barra de título). Deixe outra janela qualquer na frente.
2. [ ] Uns 27 s depois: as duas notas tocam e aparece no alto da tela o balão **Período de foco concluído**, com **Intervalo de 5 min. Próximo foco às HH:MM.** A hora sai adiantada no modo acelerado (o relógio do app anda 60× mais rápido); no uso normal, é a hora de verdade. O balão fica alguns segundos e não some na hora.
3. [ ] Uns 5 s depois: uma nota e o balão **Intervalo concluído**, com **Período de foco 2 de 2, 27 min.**
4. [ ] Uns 27 s depois: as duas notas e o balão **Sessão de foco concluída**, com **60 min de foco.** (diga se prefere o foco de fato, "55 min de foco."; `docs/pendencias-usuario.md`, item 31).
5. [ ] Clique no relógio do painel de cima: as três notificações estão na lista, sob "tomatito" (no `tauri dev` não há `.desktop`; no instalado, "Tomatito" com o ícone). Ao voltar para a janela do Tomatito, o GNOME tira as notificações dele da lista; é regra do shell.
6. [ ] **Não perturbe:** no mesmo menu do relógio, ligue **Não perturbe**. Volte à janela, ponha **5** no seletor, inicie e minimize. Uns 5 s depois: as duas notas tocam e **nenhum** balão aparece; no menu do relógio, a notificação **Sessão de foco concluída** / **5 min de foco.** está na lista. Desligue o Não perturbe.
7. [ ] (Opcional) **Fim atrasado:** com **5** no seletor, inicie e, no mesmo segundo, num terminal, `kill -STOP $(pgrep -f 'debug/tomatito$')`. Espere 70 s e `kill -CONT $(pgrep -f 'debug/tomatito$')`: nenhum som, e um balão só, **Sessão concluída às HH:MM** (hora adiantada, como no passo 2).
8. [ ] Feche o `tauri dev` (Ctrl+C no terminal).

## M21b. Build de uso diário e ID de desenvolvimento

O que foi conferido de forma automática (28/09/2026):

- `npx tauri build --bundles deb appimage` gera o `.deb` e o AppImage; o `bash scripts/instalar-uso-diario.sh --sem-build` instala o AppImage, o `Tomatito.desktop` (válido no `desktop-file-validate`) e os ícones em `~/.local`, sem `sudo`.
- **"Pronto quando" na sua sessão:** `gtk-launch Tomatito` (abre pelo `.desktop`, como o menu de apps) e, com ele aberto, `npm run dev:app`: os dois processos rodando juntos (o do AppImage, com o WebKitGTK embutido, e o `debug/tomatito`), cada um com o seu WebKitWebProcess; `ls -d ~/.local/share/io.github.kbrianps.tomatito*` lista `io.github.kbrianps.tomatito` e `io.github.kbrianps.tomatito.dev`. Os dois foram fechados logo depois.
- **Roteiro aninhado `instalado`** (`bash scripts/gnome-aninhado/instalado.sh`, GNOME Shell 50.1 aninhado): o AppImage abre, a página embutida aparece no Lite (`docs/capturas/m21b-instalado.png`), o shell casa a janela com o `Tomatito.desktop` (nome "Tomatito"), o `app_id` é `tomatito` e fechar encerra o app (6 conferências ok).
- `npm run build:debug` compila; `npm test` (132), `cargo test --workspace`, `cargo fmt --all --check`, `cargo clippy --workspace --all-targets -- -D warnings` e a checagem cruzada para `x86_64-pc-windows-msvc` passam.

O que não dá para conferir daqui: o ícone e o nome no **seu** dock e no Alt+Tab, e abrir pelo menu de apps com o mouse.

### Para conferir (uns 3 minutos)

1. [ ] Aperte a tecla Super e digite **Tomatito**: aparece o Tomatito com o ícone. Clique nele: a janela abre no Lite, e o dock mostra o ícone do Tomatito (não o genérico). No Alt+Tab, "Tomatito" com o ícone.
2. [ ] Com ele aberto, num terminal: `cd ~/dev/tomatito && npm run dev:app`. Abre uma segunda janela (a de desenvolvimento), sem fechar a primeira. No dock, as duas ficam sob o mesmo ícone (o `app_id` é o mesmo; `docs/decisoes.md`, M21b, item 5).
3. [ ] Na janela instalada, as setas do seletor andam de **5 em 5**; na de desenvolvimento, de **1 em 1** (build de debug).
4. [ ] Noutro terminal: `ls -d ~/.local/share/io.github.kbrianps.tomatito*` lista as duas pastas, `io.github.kbrianps.tomatito` e `io.github.kbrianps.tomatito.dev`.
5. [ ] Feche o `npm run dev:app` (Ctrl+C no terminal). A janela instalada continua aberta; feche-a pelo X.
6. [ ] Para atualizar o de uso diário depois de outros marcos: `bash scripts/instalar-uso-diario.sh` (gera e reinstala; uns 2 min).

## M22. Tingimento do Lite e do Suave

O que foi conferido de forma automática (28/09/2026):

- `npm test` (os testes do gerador e do `contrast.mjs`), `node scripts/contrast.mjs` (138 pares no mínimo ou acima, a tabela 4.4 igual à do plano e a tabela nova dos estados dos controles Fluent).
- `node scripts/preview/tingimento.mjs`: no Chrome headless, com o ponteiro de verdade, o item de menu e a opção da lista no hover e apertados, nos cinco temas (20 conferências): vermelhos no Lite e no Full, rosados no Suave, os cinzas de fábrica no Claro e no Escuro, texto a 4,5:1 ou mais.
- `node scripts/preview/temas-fluent.mjs`: os tokens gerados na página, no Chrome e no WebKitGTK fora da tela; a bolinha do switch ligado do Lite é `rgb(173, 61, 50)`.

O que não dá para conferir daqui: o seu olho sobre os tons, com o mouse de verdade, no WebKitGTK do app.

### Para conferir (uns 3 minutos)

1. [ ] `cd ~/dev/tomatito && npm run dev:app`. Na janela, clique com o botão direito na área vazia → **Inspecionar** → aba **Console**, e rode `location.hash = '#/dev'`.
2. [ ] No Lite (o padrão), role até **Menus** e clique em **Sessão**. Passe o mouse em **Encerrar sessão**: o fundo fica um vermelho um pouco mais claro que o cartão (o mesmo tom do hover dos botões), sem nenhum cinza. Aperte e segure o botão do mouse (sem soltar, e arraste para fora antes de soltar, para não encerrar nada): fica um pouco mais escuro que o hover, ainda vermelho.
3. [ ] Em **Listas suspensas**, abra **Meta diária** e passe o mouse nas opções: o mesmo vermelho do hover. Aperte e segure uma opção: o fundo fica um vermelho mais escuro (o da camada de conteúdo). Solte fora da lista e feche com Esc.
4. [ ] Em **Opções**, o switch ligado tem a bolinha **vermelha** sobre o creme (antes do M22, cinza-escura), e a caixa marcada de **Caixas de seleção**, o "✓" vermelho.
5. [ ] No console, `document.documentElement.dataset.theme = 'suave'`. Repita os passos 2 e 3: os fundos do hover e do apertado são rosados bem claros (discretos, como o próprio tema), nunca um cinza neutro. O switch ligado fica vermelho com a bolinha quase branca.
6. [ ] (Controle) `document.documentElement.dataset.theme = 'light'` e depois `'dark'`: aqui, os hovers continuam cinzas, como no Relógio do Windows. Diga o que achou (`docs/pendencias-usuario.md`, item 35) e feche o `dev:app` (Ctrl+C no terminal).

## M23. Configurações no Rust

O que foi conferido de forma automática (28/09/2026):

- `cargo test --workspace`: os padrões, a chave desconhecida ignorada e o arquivo corrompido (vira padrão e fica em `settings.corrompido.json`), além da gravação atômica e das recusas do `settings_set`.
- Roteiro aninhado `partida-a-frio` com `TT_TEMA=lite|suave|light|dark` (3 partidas a frio cada, `settings.json` com só o `theme` trocado): nenhum quadro de outro tema ou branco, e a página no tema do arquivo. O controle negativo e uma mutação (fundo da janela fixo no Lite) são acusados.
- Uma abertura do `npm run dev:app` na sua sessão com `"theme": "dark"` à mão: a página abriu no Escuro (lido pelo inspetor remoto).

O que não dá para conferir daqui: o seu olho vendo a janela nascer, sem clarão, na sua tela.

### Para conferir (uns 4 minutos)

1. [ ] Com o `dev:app` fechado: `mkdir -p ~/.local/share/io.github.kbrianps.tomatito.dev && printf '{\n  "theme": "dark"\n}\n' > ~/.local/share/io.github.kbrianps.tomatito.dev/settings.json`
2. [ ] `cd ~/dev/tomatito && npm run dev:app`. A janela aparece já no **Escuro** (cinza-escuro), sem nenhum quadro vermelho ou branco antes. Feche (Ctrl+C no terminal).
3. [ ] Troque `"dark"` por `"suave"` no arquivo (com o editor de texto) e abra de novo: nasce no **Suave** (rosado claro). Repita com `"light"` (**Claro**) e com `"lite"` (o vermelho, **Lite**).
4. [ ] Troque para `"full"`: abre a janela normal no tema anterior (o tomate só existe a partir do M50).
5. [ ] Estrague o arquivo de propósito (apague a última `}`) e abra: nasce no **Lite**, e `ls ~/.local/share/io.github.kbrianps.tomatito.dev/` mostra o `settings.corrompido.json` com o que você escreveu. O terminal mostra "`configurações ilegíveis`".
6. [ ] Para limpar: `rm ~/.local/share/io.github.kbrianps.tomatito.dev/settings*.json`.


## M24. Aparência: seletor com prévia

O que foi conferido de forma automática (28/09/2026):

- `npm test`: o `applyTheme` da 4.6 (a ordem `settings_set` → `setTheme`, a guarda (c) do Sistema, a volta do `<html>` se a gravação falhar, o Full recusado), a marcação da tela (cinco opções, sem o Full, cada prévia com o próprio `data-theme`) e o `contrast.mjs` conferindo a `background_color` do `build_main` contra o `--tt-bg-app` de cada tema (com mutações dos dois lados).
- `cargo test`: o tema nativo da janela na criação (Lite e Escuro → escuro; Suave e Claro → claro; Sistema → nenhum).
- `node scripts/preview/aparencia.mjs` (Chrome headless, clique e setas de verdade, 30 conferências): cada prévia pinta os tokens do próprio tema em qualquer tema da página, e cada troca grava o patch certo e fixa o tema nativo certo.
- Roteiro aninhado `aparencia` (`bash scripts/gnome-aninhado/rodar.sh aparencia`, WebKitGTK e Rust de verdade, 20 conferências): o pixel de cada prévia na tela; o clique na prévia do Suave troca a página, o `theme()` vira `light` e o `settings.json` grava `suave`; fechado e reaberto, o app nasce no Suave com o Suave marcado; Sistema, Escuro e, na terceira abertura, as setas até o Lite. Capturas em `docs/capturas/m24-configuracoes-*.png`.
- Roteiro aninhado `partida-a-frio` com `TT_TEMA=lite|suave|light|dark` e `TT_PARTIDAS=3`: 12 partidas a frio, nenhum quadro de outro tema ou branco.

O que não dá para conferir daqui: o seu olho e o seu mouse, na sua sessão (GNOME escuro de verdade, com o portal).

### Para conferir (uns 4 minutos)

1. [ ] Com o `dev:app` fechado, apague as configurações de teste: `rm -f ~/.local/share/io.github.kbrianps.tomatito.dev/settings*.json`.
2. [ ] `cd ~/dev/tomatito && npm run dev:app`. Vá a **Configurações** (Ctrl+,). Em **Aparência > Tema do aplicativo** há cinco opções: Tomatito Lite, Tomatito Suave, Claro, Escuro e "Usar configuração do sistema", cada uma com uma miniatura nas próprias cores (a do sistema com o Claro à esquerda e o Escuro à direita). O Tomatito Full **não** aparece (entra no M51). O Lite vem marcado.
3. [ ] Clique na miniatura do **Suave**: a janela inteira fica rosada na hora, sem piscar, e a moldura do Suave ganha o contorno vermelho. Clique com o botão direito numa área de texto do app: o menu do WebKit sai **claro** (o tema nativo acompanha).
4. [ ] Feche o app (Ctrl+C no terminal) e abra de novo: nasce no **Suave**, sem nenhum quadro vermelho ou branco antes, e com o Suave marcado em Configurações.
5. [ ] Repita o passo 4 mais duas vezes, e depois escolha **Claro**, **Escuro** e **Lite**, fechando e reabrindo três vezes em cada (3 partidas a frio por tema): nunca um quadro de outra cor.
6. [ ] Com o teclado: Tab até o grupo de temas e setas ← → trocam o tema a cada tecla.
7. [ ] "Usar configuração do sistema" com o GNOME escuro deixa o app no **Escuro**. O acompanhamento ao vivo das Configurações do GNOME é do M25 (não precisa conferir agora).
8. [ ] Para limpar: `rm ~/.local/share/io.github.kbrianps.tomatito.dev/settings*.json`.


## M25. Seguir o sistema

O que foi conferido de forma automática (28/09/2026):

- `npm test`: as guardas (a) e (b) do `ligarSistema` no Linux e no Windows, sem laço mesmo contra uma janela que não obedece, e o claro intermediário da guarda (c) que não chega à página.
- Roteiro aninhado `sistema` (`bash scripts/gnome-aninhado/rodar.sh sistema`, WebKitGTK e Rust de verdade, com um portal falso que emite o `SettingChanged` como o GNOME, 18 conferências): no Sistema, a página segue o estilo em ~215 ms; do Lite para o Sistema, Claro com o GNOME claro e Escuro com o escuro; tema explícito sem mudança e sem laço; reabertura depois de o GNOME mudar com o app fechado.

O que não dá para conferir daqui: o painel de Configurações do GNOME de verdade (mexer nele mudaria o estilo da sua sessão).

### Para conferir (uns 4 minutos)

1. [ ] `cd ~/dev/tomatito && npm run dev:app`. Clique com o botão direito na página e escolha **Inspecionar elemento**; deixe a aba **Console** aberta.
2. [ ] Com o GNOME no estilo **Claro** (Configurações > Aparência), vá a **Configurações** do Tomatito (Ctrl+,), escolha **Tomatito Lite** e depois **Usar configuração do sistema**: o app fica **Claro**.
3. [ ] Em Configurações do GNOME > Aparência, troque para **Escuro**: o Tomatito fica escuro em até 1 s (sem precisar focar a janela). O console mostra uma linha `[tema] ThemeChanged dark (prefers-color-scheme)` e uma `[tema] sistema: light → dark`, uma vez cada.
4. [ ] Volte o GNOME para **Claro**: o Tomatito volta ao Claro em até 1 s, com as mesmas duas linhas (agora `light`).
5. [ ] No Tomatito, escolha **Escuro**. Troque o estilo do GNOME algumas vezes: o Tomatito **não** muda. A cada troca, o console mostra no máximo duas linhas `ThemeChanged` e uma `reaplicado`; nunca uma sequência que não para, e nunca `sem nova tentativa`. O menu do botão direito continua escuro.
6. [ ] Escolha **Tomatito Suave** e troque o estilo do GNOME: o app continua rosado e o menu do botão direito continua claro.
7. [ ] Volte a **Usar configuração do sistema**, feche o app (Ctrl+C no terminal), mude o estilo do GNOME e abra de novo: nasce no tema do GNOME. Feche e abra mais uma vez: nenhum quadro da cor antiga.
8. [ ] Deixe o GNOME e o Tomatito como preferir; para limpar: `rm ~/.local/share/io.github.kbrianps.tomatito.dev/settings*.json`.


## M26. Estatísticas

O que foi conferido de forma automática (28/09/2026):

- `cargo test --workspace`: os dias e a semana (`days.rs`), com a meia-noite, a hora de zerar às 04:00, a semana de segunda a domingo e o horário de verão; o `stats.sqlite` (migração, regra de soma, reabrir, arquivo corrompido) e o motor gravando os períodos pelo `Effects`.
- Roteiro aninhado `estatisticas` (app de verdade, `TOMATITO_SPEED=60`, 14 conferências): sessão concluída e sessões encerradas no banco e no `stats_get`, e os números iguais depois de fechar e reabrir.

Ainda não há tela (o card "Progresso diário" é do M27); a conferência é pelo DevTools.

### Para conferir (uns 3 minutos)

1. [ ] `cd ~/dev/tomatito && TOMATITO_SPEED=60 npm run dev:app`. Clique com o botão direito na página, **Inspecionar elemento**, aba **Console**.
2. [ ] No console: `await window.__TAURI_INTERNALS__.invoke('stats_get')`. Anote o `todayS` (na primeira vez, 0) e confira `dailyGoalMinutes: 120` e `resetHour: 0`.
3. [ ] Inicie uma sessão de 5 min pela tela e espere uns 6 s (ela termina sozinha, com som). Repita o comando do passo 2: o `todayS` e o `weekS` subiram 300.
4. [ ] Feche o app (Ctrl+C no terminal) e abra de novo com o mesmo comando. Repita o passo 2: os mesmos números.
5. [ ] O arquivo existe: `ls -l ~/.local/share/io.github.kbrianps.tomatito.dev/stats.sqlite`.
6. [ ] Para zerar: feche o app e `rm ~/.local/share/io.github.kbrianps.tomatito.dev/stats.sqlite`.


## M27. Card "Progresso diário"

O que foi conferido de forma automática (28/09/2026):

- Prévia no Chrome headless e no WebKitGTK fora da tela (`node scripts/preview/progresso.mjs`): posições contra a captura do Relógio, cores dos quatro temas, o arco andando em ~1 s numa sessão acelerada, meta desativada, acima da meta, movimento reduzido e janela estreita.
- Roteiro aninhado `progresso` (app de verdade, `TOMATITO_SPEED=60`): o anel avança ao concluir uma sessão e os números sobrevivem a fechar e reabrir.

O que só você consegue ver: a animação suave do arco na sua tela e a leitura pelo Orca.

### Para conferir (uns 3 minutos)

1. [ ] `cd ~/dev/tomatito && TOMATITO_SPEED=60 npm run dev:app`. Na tela Foco, o cartão "Progresso diário" mostra Ontem, o anel com "Meta diária 2 horas" dentro, Esta semana e "Concluído: X minutos".
2. [ ] Escolha 5 min no seletor e clique em "Iniciar sessão de foco". Em uns 5 s a sessão termina (com som): o arco sai das 12 h e cresce no sentido horário, suave, em cerca de 1 s; o rodapé soma 5 minutos, e Esta semana também.
3. [ ] Repita algumas vezes com 30 min (30 s cada) e veja o arco avançar de novo a cada fim; as pontas do arco são redondas.
4. [ ] Feche o app (Ctrl+C no terminal) e abra de novo com o mesmo comando: o cartão abre com os mesmos números e o arco já no lugar, sem encher de novo.
5. [ ] Troque o tema em Configurações (Lite, Suave, Claro, Escuro) e volte à Foco: o trilho e o arco mudam de cor com o tema, e o arco continua visível sobre o trilho.
6. [ ] (Opcional, Orca ligado: Super+Alt+S) Com o Tab ou as setas do Orca, chegue ao anel: ele é lido como imagem, com "Meta diária de 2 horas. Concluído hoje: N minutos, P% da meta."
7. [ ] Para zerar: feche o app e `rm ~/.local/share/io.github.kbrianps.tomatito.dev/stats.sqlite`.


## M28. Diálogo "Editar meta diária"

O que foi conferido de forma automática (28/09/2026):

- Prévia no Chrome headless e no WebKitGTK fora da tela (`node scripts/preview/meta.mjs`): o lápis na posição do Relógio, o diálogo (320 px, sombra de 64, fundo de trás a 30%, título, as 9 metas e as 24 horas, os valores atuais, os nomes das listas, os botões lado a lado e com a mesma largura, o foco na primeira lista), Esc, Esc com a lista aberta (só no Chrome, com tecla de verdade), Cancelar, Salvar, "Desativada", gravação recusada, os quatro temas e a janela estreita. 14 conferências no Chrome e 13 no WebKitGTK, todas ok.
- Roteiro aninhado `meta` (app de verdade, ponteiro e teclado virtuais): abrir pelo lápis, Esc, escolher com o ponteiro, Salvar (o anel muda na hora e o `settings.json` no disco tem as duas chaves), "Desativada", e depois de reabrir, os valores guardados e Cancelar sem gravar. 17 conferências ok.

O que só você consegue ver: o diálogo na sua tela, o Tab e o anel de foco, e a leitura pelo Orca.

### Para conferir (uns 3 minutos)

1. [ ] `cd ~/dev/tomatito && npm run dev:app`. Na tela Foco, o cartão "Progresso diário" tem um lápis no canto de cima, à direita. Pare o mouse nele: aparece a dica "Editar meta diária".
2. [ ] Clique no lápis. O fundo escurece e abre o diálogo "Editar meta diária", com "Meta diária" e "Zerar progresso às" preenchidos com o que está valendo, e os botões Salvar (destaque) e Cancelar do mesmo tamanho.
3. [ ] Aperte Esc: o diálogo fecha e nada muda no cartão. Aperte Espaço ou Enter: o diálogo abre de novo (o foco ficou no lápis).
4. [ ] Abra a lista "Meta diária" e aperte Esc: fecha só a lista. Aperte Esc de novo: fecha o diálogo.
5. [ ] Abra, escolha "1 hora" e clique em Salvar: o diálogo fecha e o anel mostra "1 hora" no centro na mesma hora, com o arco na fração nova.
6. [ ] Abra, escolha "Desativada" e salve: o anel e a meta somem; ficam Ontem, Esta semana e o rodapé.
7. [ ] Abra, mude qualquer coisa e clique em Cancelar: nada muda. Clique fora do diálogo, no fundo escurecido: ele continua aberto (como no Relógio).
8. [ ] Feche e abra o app: a meta e a hora de zerar continuam as que você salvou.
9. [ ] Só com o teclado: Tab até o lápis, Enter abre, Tab passa pelas duas listas, Salvar e Cancelar, e volta à primeira lista (o foco não sai do diálogo).
10. [ ] (Opcional, Orca ligado: Super+Alt+S) Ao abrir, o Orca lê "Editar meta diária, diálogo" e a lista "Meta diária" com o valor.
11. [ ] Para voltar ao padrão: salve "2 horas" e "00:00".



## M29. Tarefas: dados

O que foi conferido de forma automática (28/09/2026):

- `cargo test`: adicionar, concluir e desmarcar, títulos recusados, apagar, reabrir o arquivo e as concluídas sumindo na virada do dia (meia-noite e hora de zerar às 04:00).
- Roteiro aninhado `tarefas` (app de verdade, `TOMATITO_SPEED=60`, 22 conferências): os quatro comandos, os erros, o período gravado com o `task_id`, a lista igual depois de reabrir e a virada acelerada (as concluídas somem, as pendentes ficam, o banco guarda tudo).

Ainda não há tela (o cartão "Tarefas" é do M30); a conferência é pelo DevTools.

### Para conferir (uns 3 minutos)

1. [ ] `cd ~/dev/tomatito && npm run dev:app`. Clique com o botão direito na página, **Inspecionar elemento**, aba **Console**, e cole: `const i = window.__TAURI_INTERNALS__.invoke`.
2. [ ] `await i('task_add', { title: 'Ler o capítulo 3' })` e `await i('task_add', { title: 'Lista 2' })`: cada um devolve a tarefa, com `doneAt: null`.
3. [ ] `await i('task_complete', { id: 1 })` e depois `await i('task_list')`: as duas aparecem, a primeira com `doneAt` preenchido, no mesmo lugar.
4. [ ] `await i('task_add', { title: '   ' })`: rejeita com `code: "emptyTitle"`.
5. [ ] Feche o app (Ctrl+C no terminal) e abra de novo. `await i('task_list')` devolve as mesmas duas.
6. [ ] (A virada, opcional) Anote a hora atual, por exemplo 14:37. `await i('settings_set', { patch: { resetHour: 15 } })` (a hora cheia seguinte) e, depois das 15:00, `await i('task_list')`: só a pendente. Volte com `resetHour: 0`.
7. [ ] Para zerar: feche o app e `rm ~/.local/share/io.github.kbrianps.tomatito.dev/stats.sqlite`.



## M30. Card "Tarefas"

O que foi conferido de forma automática (28/09/2026):

- Prévia (`node scripts/preview/tarefas.mjs`), no Chrome headless e no WebKitGTK: vazio, o campo, três tarefas pelo Enter, Esc, escolher, iniciar com o `taskId`, as cores na sessão, concluir, o período com o `taskId`, os quatro temas.
- Roteiro aninhado `cartao-tarefas` (app de verdade, `TOMATITO_SPEED=60`, 22 conferências): o "Pronto quando" inteiro, com o banco lido de fora mostrando o período com o `task_id`, e a lista igual depois de reabrir.
- Correção da verificação: a altura das linhas com o mouse em cima e com o foco do teclado. Na prévia, 41 px em todas as linhas com o mouse em cada uma (Chrome) e com o foco em cada uma (Chrome; no WebKitGTK fora da tela, o estado forçado), a 1000 × 700, 1400 × 800 e 480 × 700, com um título longo. No app de verdade, o ponteiro virtual desce pelas três linhas e a página amostra a altura a cada quadro: só 41 px; o mesmo com o foco em cada linha e um Tab de verdade até o "Escolher". Controle negativo nos dois: com o CSS de antes, a linha cresce (58 px no app, a 1000 × 700) e as conferências acusam.

O que só você consegue ver: o hover revelando o "Escolher" e o "x" sem a lista se mexer (a altura já é medida; aqui é a impressão com o seu mouse), o Tab passando pelos botões da linha, a dica com o título inteiro de uma tarefa longa, e o leitor de tela.

### Para conferir (uns 5 minutos)

1. [ ] `cd ~/dev/tomatito && rm -f ~/.local/share/io.github.kbrianps.tomatito.dev/stats.sqlite && npm run dev:app` (o banco do `.dev` começa limpo). Role até o cartão "Tarefas": aparece "Mantenha o rumo" e o botão "Adicionar tarefa".
2. [ ] Clique em "Adicionar tarefa". A caixa abre com o cursor. Digite "Ler o capítulo 3" e Enter; "Lista 2" e Enter; "Revisar as notas" e Enter. As três aparecem, na ordem, e a caixa continua aberta e vazia. Esc fecha a caixa e o foco vai para o "+".
3. [ ] Passe o mouse devagar de cima para baixo pelas três linhas: em cada uma aparecem o "Escolher" (na janela de 1000 × 700; "Escolher para a sessão" com a janela maximizada) e o "x", e nenhuma linha muda de altura (a lista não se mexe). Clique no "Escolher" de "Lista 2": vira "Escolhida" e a linha ganha a borda na cor de destaque.
   - [ ] Adicione uma tarefa com um título bem longo (mais que a largura do cartão): ela fica numa linha só, com reticências, e o mouse parado sobre o título mostra a dica com o texto inteiro.
4. [ ] No seletor, deixe 1 min (Home) e clique em "Iniciar sessão de foco". O subtítulo vira "Você está focando em"; "Lista 2" fica com a borda e as outras duas, com o texto mais apagado. O "Escolher" some das linhas.
5. [ ] Clique no círculo de "Lista 2": vira o check preenchido e o texto fica apagado, no mesmo lugar.
6. [ ] Espere a sessão acabar (1 min). O subtítulo volta a "Escolha uma tarefa para a sessão".
7. [ ] Feche o app (Ctrl+C no terminal) e abra de novo. As três tarefas continuam, "Lista 2" marcada.
8. [ ] (O `task_id` no banco, opcional) Com o app fechado: `python3 -c "import sqlite3,os; c=sqlite3.connect(os.path.expanduser('~/.local/share/io.github.kbrianps.tomatito.dev/stats.sqlite')); print(list(c.execute('SELECT kind, completed, task_id FROM periods')))"` mostra `[('focus', 1, 2)]`.
9. [ ] Teclado: Tab a partir do "+" passa pelo "…", pelo círculo, "Escolher para a sessão" e o "x" de cada linha, com o anel de foco. Espaço no círculo marca e desmarca.
10. [ ] (Opcional, Orca ligado: Super+Alt+S) O círculo é lido como caixa de seleção com o título da tarefa ("Ler o capítulo 3, caixa de seleção, não marcada").
11. [ ] No "…", "Apagar concluídas" apaga "Lista 2". Para zerar: feche o app e apague o `stats.sqlite` do passo 1.

## M31. Motor de temporizadores

Sem conferência manual: o marco é só o motor no `tomatito-core`, sem tela nem comando, e o "Pronto quando" é coberto pelo `cargo test -p tomatito-core --test temporizadores`. A conferência com os olhos e os ouvidos vem no M32.

## M32. Tela Temporizador

O que já foi conferido sem você:
- `cargo test` (motor): dois temporizadores juntos, o fim com o som de fim de foco e a notificação uma vez só, o `-12 s` ainda correndo, a pausa de um sem mexer no outro, o redefinir rearmando o fim, o laço dormindo depois do zero, o fim atrasado sem som, os erros e o foco junto com um temporizador.
- Prévia (`node scripts/preview/temporizador.mjs`), no Chrome headless e no WebKitGTK: cards de 313 × 321 centrados, anel de 210 com traço de 12, cores de parado, correndo e vencido, "Encerrado há" com `-00:00:12`, o Lite distinguível só pelo rótulo e pelo sinal, pausar no negativo e redefinir, e a tela estreita.
- Roteiro aninhado `temporizador` (app de verdade, `TOMATITO_SPEED=10`, 18 conferências): cliques de verdade no painel e nos dois "Iniciar", a notificação "Temporizador encerrado | 1 min" com o balão no shell aninhado, um fluxo de som no PipeWire, o `-00:00:12` com "Encerrado há" (captura `docs/capturas/m32-app-vencido.png`) e o fim uma vez só.

O que só você consegue: ouvir o som, ver o balão no seu GNOME e julgar a leitura no Lite.

### Para conferir (uns 4 minutos)

1. [ ] `cd ~/dev/tomatito && TOMATITO_SPEED=10 npm run dev:app` (o relógio 10 vezes mais rápido; 1 min passa em 6 s). No painel, clique em "Temporizador" (ou Ctrl+2). Aparecem quatro cards, "1 min", "3 min", "5 min" e "10 min", com o tempo cinza e o "Redefinir" apagado.
2. [ ] Clique no play do "1 min" e logo depois no do "3 min". Os dois contam juntos, com o tempo mais forte e o anel diminuindo.
3. [ ] Uns 6 s depois, o "1 min" chega a zero: toca o som de fim de foco (o mesmo do fim de um período de foco) e aparece a notificação "Temporizador encerrado", corpo "1 min". O card passa a contar em negativo, com "Encerrado há" acima do tempo. O "3 min" segue contando normalmente.
4. [ ] Com o tema Lite (o padrão), o negativo e o que corre têm a mesma cor: confira que dá para distinguir pelo "Encerrado há" e pelo sinal de menos (algo como `-00:00:12`).
5. [ ] Espere mais alguns segundos: nenhuma notificação nem som a mais do "1 min". Pause o "1 min" (o tempo negativo para) e clique em "Redefinir": volta a 00:01:00, cinza, com o "Redefinir" apagado de novo.
6. [ ] Esconda a janela (feche com "fechar para a bandeja" ou minimize) com o "3 min" correndo: a notificação e o som chegam mesmo assim, uns 18 s depois de ele começar.
7. [ ] Teclado: Tab passa pelo play e pelo "Redefinir" de cada card (o "Redefinir" apagado fica fora), com o anel de foco; Espaço ou Enter aciona.
8. [ ] Feche o app (Ctrl+C no terminal). Os temporizadores voltam aos padrões ao reabrir: gravar a lista é do M33, e carregá-la ao abrir, do M40.


## M33. Adicionar, editar e excluir temporizadores

O que já foi conferido sem você:
- `cargo test` (`state_file.rs`): o formato do `state.json` para parado, correndo e pausado, a lista inteira regravada a cada vez e a falha de disco sem pânico.
- Prévia (`node scripts/preview/temporizador-edicao.mjs`), no Chrome headless e no WebKitGTK: a barra no canto inferior direito, o diálogo com 00:05:00, criar "Chá · 4 min", o modo de edição com "Editar" e "Excluir" em cada card, editar para "Chá verde · 5 min", excluir, o Lite, o Claro e a lista vazia.
- Roteiro aninhado `temporizador-edicao` (app de verdade, 18 conferências): cliques de verdade no "+", no chevron, no Salvar, no lápis, no "Editar" e no "Excluir", com o `state.json` lido do disco depois de cada operação.

O que só você consegue: julgar o desenho do diálogo e da barra ao lado do Relógio, e digitar de verdade.

### Para conferir (uns 4 minutos)

1. [ ] `cd ~/dev/tomatito && npm run dev:app`. Em outro terminal, deixe pronto: `cat ~/.local/share/io.github.kbrianps.tomatito.dev/state.json` (antes da primeira operação, o arquivo pode não existir ou ter a lista de uma rodada anterior: o app ainda não o lê ao abrir, isso é do M40).
2. [ ] No painel, "Temporizador". No canto inferior direito há uma barra com um lápis e um "+".
3. [ ] Clique no "+". Abre "Adicionar temporizador" com 00 : 05 : 00. Clique no chevron de baixo dos minutos (vira 04), clique em "Nome do temporizador" e digite `Chá`. Salvar. Aparece o card "Chá" com 00:04:00 no fim da grade.
4. [ ] `cat` do arquivo: tem `"schemaVersion": 1` e os cinco temporizadores, o último com `"name": "Chá"` e `"durationMs": 240000`.
5. [ ] Clique no lápis: ele vira um check ("Concluído"), e cada card ganha um lápis e uma lixeira no canto de cima. Clique no lápis do "Chá": abre "Editar temporizador" com 00:04:00 e "Chá". No campo dos minutos, aperte ↑ (vira 05) e troque o nome para `Chá verde`. Enter (ou Salvar). O card vira "Chá verde", 00:05:00.
6. [ ] `cat`: o último agora tem `"name": "Chá verde"` e `"durationMs": 300000`.
7. [ ] Clique na lixeira do "Chá verde". O card some sem pedir confirmação (como no Relógio), e o foco fica na lixeira do card vizinho. `cat`: só os quatro padrões.
8. [ ] Clique no check: os botões de cima somem. Inicie o "1 min" e dê `cat`: ele aparece com `"status": "running"` e `"endsAt"`. Pause e dê `cat`: `"paused"` com `"remainingMs"`.
9. [ ] Teclado: Tab chega à barra (lápis e "+"); com o diálogo aberto, Esc fecha sem salvar e o foco volta ao "+". Nos campos de tempo, ↑/↓ dão a volta (59 → 00), e digitar `75` nos minutos vira 59 ao sair do campo.
10. [ ] Feche o app (Ctrl+C). O `state.json` continua lá com a última lista. Ao reabrir, os temporizadores voltam aos padrões: carregar a lista gravada é do M40.


## M34. Cronômetro

O que já foi conferido sem você:
- `cargo test`: o núcleo (`tomatito-core/tests/cronometro.rs`: 10 min de relógio são 10 min de cronômetro, 36 mil leituras em passos de um quadro sem nenhum desvio, uma lacuna de janela escondida contada na primeira leitura, pausar e retomar, voltas, redefinir, relógio para trás), o motor (um `tt://stopwatch` por transição, erros sem emitir, o laço dormindo com o cronômetro correndo) e o `state.json` (o cronômetro ao lado dos temporizadores, sem um apagar o outro).
- Prévia (`node scripts/preview/cronometro.mjs`), no Chrome headless e no WebKitGTK: medidas do número (clamp, 70% dos centésimos, unidades embaixo de cada par), os três botões de 64 px, os centésimos mudando a cada quadro (61 textos em 61 quadros), Espaço e L com e sem o foco num botão, trocar de tela e voltar sem perder tempo, e os tamanhos de janela.
- Roteiro aninhado `cronometro` (app de verdade, 13 conferências): clique em Iniciar, L e Espaço pelo teclado virtual, a janela minimizada por 20 s e escondida (hide) por 20 s; ao voltar, o tempo na tela bateu com o relógio monotônico com 8 ms e 5 ms de diferença; o `state.json` lido do disco a cada transição.

O que só você consegue: comparar com um relógio de fora (o celular) por 10 minutos, e esconder a janela do jeito que você usa.

### Para conferir (uns 12 minutos, quase todos de espera)

1. [ ] `cd ~/dev/tomatito && npm run dev:app`. No painel, "Cronômetro": 00:00:00,00, com h, min e s embaixo; o botão de bandeira e o de redefinir apagados.
2. [ ] Abra o cronômetro do celular. Aperte "Iniciar" no Tomatito e o do celular ao mesmo tempo (o melhor que der). Os centésimos do Tomatito correm liso, sem saltos.
3. [ ] Minimize o Tomatito (ou troque de área de trabalho) e deixe os dois correndo.
4. [ ] Uns 10 minutos depois, volte ao Tomatito e pare os dois juntos (Espaço no Tomatito, com o foco fora dos botões: clique antes no título "Cronômetro"). A diferença deve ser só a do seu reflexo (algumas dezenas de centésimos), e não crescer com o tempo. Confira também que, ao voltar para a janela, o número já apareceu certo no primeiro instante, sem "correr para alcançar".
5. [ ] `cat ~/.local/share/io.github.kbrianps.tomatito.dev/state.json`: tem `"stopwatch"` com `"status": "paused"` e o `"accumulatedMs"` do tempo parado.
6. [ ] Espaço de novo retoma. Aperte L: nada visível muda ainda (a lista de voltas é do M35), mas o `cat` mostra a volta em `"laps"`. Com o foco num botão (Tab até ele), L não marca volta.
7. [ ] "Redefinir": volta a 00:00:00,00, e o `cat` mostra `"status": "idle"` sem voltas.
8. [ ] Encolha a janela até o mínimo (480 px): o número diminui e continua inteiro, sem cortar nem rolar para o lado.


## M35. Voltas

O que já foi conferido sem você:
- `cargo test` e `node --test`: as voltas atravessando uma pausa, as linhas (tempo da volta e total), o texto do "Copiar" igual à tela e as duas vias da área de transferência.
- Prévia (`node scripts/preview/voltas.mjs`), no Chrome headless e no WebKitGTK: a lista aparecendo com a primeira volta, a mais nova em cima, colunas alinhadas, números tabulares e selecionáveis, "Copiar" pela API e pela via antiga, redefinir, Claro, Lite e a janela mínima.
- Roteiro aninhado `voltas` (app de verdade, 12 conferências): L três vezes, a lista contra o `state.json`, um clique de verdade no "Copiar", o texto lido da área de transferência do GNOME Shell e aberto no LibreOffice Calc sem tela: cada valor na sua célula, tempos reconhecidos como tempo.

O que só você consegue: colar de verdade numa planilha e julgar a lista ao lado do Relógio.

### Para conferir (uns 3 minutos)

1. [ ] `cd ~/dev/tomatito && npm run dev:app`. No painel, "Cronômetro". Não há lista embaixo dos botões.
2. [ ] "Iniciar". Clique no título "Cronômetro" (para tirar o foco dos botões) e aperte L três ou quatro vezes, com intervalos diferentes. Aparece "Voltas" com a tabela Volta, Tempo e Total, a mais nova em cima. Em cada linha, o Total é o Total da linha de baixo mais o Tempo (a menos de um centésimo). Os dígitos das colunas ficam alinhados, sem dançar.
3. [ ] Arraste o mouse sobre alguns tempos da tabela: o texto fica selecionado (o resto da interface não se seleciona).
4. [ ] Clique em "Copiar". Ao lado do botão aparece "Voltas copiadas", que some em uns 3 s.
5. [ ] Abra o LibreOffice Calc (planilha nova) e aperte Ctrl+V na célula A1. Se o Calc abrir "Importar texto", confira que "Tabulação" está marcada e o idioma é "Português (Brasil)" (ou "Padrão", com o sistema em pt-BR), e dê OK.
6. [ ] A planilha tem o cabeçalho Volta, Tempo e Total em A1:C1 e uma linha por volta embaixo, cada valor na sua célula, sem nada juntado numa célula só e sem colunas vazias no meio. Os tempos aparecem como na tela (`00:00:02,34`); clicando num deles, a barra de fórmulas mostra um tempo, e não um texto com apóstrofo.
7. [ ] Volte ao Tomatito, "Pausar" e "Redefinir": a lista some.
8. [ ] Teclado: Tab chega ao "Copiar" depois dos três botões redondos, e Enter nele copia (o aviso aparece).
9. [ ] Feche o app (Ctrl+C no terminal).

## M36. Bandeja e fechar para a bandeja

O que já foi conferido sem você:
- `cargo test` e `npm test`: o item de cada estado, o tempo na bandeja em minutos (para cima, mudando uma vez por minuto), a dica do Windows, a ordem no `setup` e o `CloseRequested`.
- Roteiro aninhado `bandeja` (app de verdade, extensão AppIndicator ligada no GNOME Shell aninhado, relógio a 60×, 24 conferências): o menu usado pelo D-Bus, como o painel faz; iniciar, pausar e retomar pela bandeja; o rótulo de tempo ligado e andando; fechar esconde e a sessão continua; o fim com a janela escondida (notificação no shell e som no PipeWire); "Mostrar Tomatito"; "Sair"; `closeToTray` desligado.
- Abertura curta na sua sessão: o ícone registrado no seu painel, com os três itens.

O que só você consegue: clicar de verdade no ícone do painel, ouvir o som com a janela escondida e ver a janela voltar.

### Para conferir (uns 5 minutos)

1. [ ] `cd ~/dev/tomatito && TOMATITO_SPEED=60 npm run dev:app`. No canto de cima, à direita do painel do GNOME, aparece o ícone do app (ainda o do Tauri; o do Tomatito é do M44), sem texto ao lado.
2. [ ] Clique no ícone: o menu tem "Iniciar foco", "Mostrar Tomatito", um separador e "Sair".
3. [ ] "Iniciar foco": a tela Foco mostra a sessão de 30 min correndo (a 60×, 30 s). Abra o menu de novo: o primeiro item agora é "Pausar foco". Clique nele: a tela mostra "Pausado", e o item vira "Retomar foco". Clique para retomar.
4. [ ] Feche a janela pelo X da barra de título. A janela some, o ícone continua no painel e o terminal não mostra o app saindo.
5. [ ] Espere o fim da sessão (uns 30 s a 60×) com a janela escondida: **o som toca** e aparece a notificação "Sessão de foco concluída".
6. [ ] No menu do ícone, "Mostrar Tomatito": a janela volta (o GNOME pode só avisar "Tomatito está pronto"; clique no aviso), com a sessão concluída na tela. O item voltou a "Iniciar foco".
7. [ ] Repita o passo 4 com Alt+F4 e depois com Ctrl+W, e traga a janela de volta por "Mostrar Tomatito" a cada vez.
8. [ ] Tempo na bandeja (opcional; a opção na tela é do M39): no DevTools (botão direito → Inspecionar → Console), `await window.__TAURI_INTERNALS__.invoke('settings_set', { patch: { trayTime: true } })`. Inicie pela bandeja: ao lado do ícone aparece "30 min", que desce um por segundo a 60× ("Intervalo · N min" num intervalo, "Pausado · N min" no pausado). Volte com `{ trayTime: false }`: o texto some.
9. [ ] "Sair" no menu: o app fecha e o terminal mostra o `tauri dev` terminando (ou Ctrl+C no terminal, se o Vite continuar).

## M50. Tomate definitivo ligado ao motor

O que já foi conferido sem você:
- `npm test` e `cargo test`: o que o tomate mostra em cada estado (ocioso, foco, intervalo, pausado, concluída), o restante pelo `endsAt`, a contagem com o vocabulário da tela Foco, as regras do `tomato.html` e do `tomato.css` e a janela da 5.3.
- Roteiro aninhado `tomate` (o app de verdade no GNOME Shell 50.1 aninhado, com a Mesa da Intel, 28 conferências): cantos transparentes pixel a pixel; arraste pelo corpo, pelo cabinho, pelo cálice e pelo tempo; os botões comandando o motor; o tomate e a `main` com o mesmo tempo; fechar e reabrir sem zerar; Configurações e "Voltar ao modo normal".
- Roteiro aninhado `tomate-csp` (o binário do `npm run build:debug`, com a CSP): o console da `tomato` vazio, sem nenhum "Refused to", na partida e ao usar os botões.
- Deuteranopia e protanopia emuladas no Chrome: o cálice do protótipo (`#35603C`) sumia no Intervalo; trocado por `#789F6B` (`docs/capturas/m50-deuteranopia.png`).

O que só você consegue: ver o tomate de verdade sobre a sua área de trabalho, arrastar com o seu mouse e olhar o cálice com a emulação.

### Para conferir (uns 6 minutos)

1. [ ] `cd ~/dev/tomatito-full && npm run dev:app` (ou, depois da junção, em `~/dev/tomatito`). Na janela, abra o DevTools (botão direito → Inspecionar → Console), digite `location.hash = '#/dev'` e, no cartão "Tomate (Full)", clique em "Abrir o tomate".
2. [ ] O tomate aparece com 280 px, **sem nenhum retângulo em volta**: nos quatro cantos, e em volta do corpo, aparece a sua área de trabalho (ou a janela de trás), sem preto, branco ou cinza. Embaixo do corpo há uma sombra suave.
3. [ ] Arraste o tomate pelo corpo (numa parte vermelha sem botão), pelo cabinho e pelas folhinhas verdes de cima: ele acompanha o mouse nos três. Clicar num canto transparente ainda fica no tomate (a região de entrada é do M53 e do M54).
4. [ ] O tomate mostra "PRONTO", "30:00" e "Sessão de 30 min", sem anel. Clique no botão claro do meio: começa uma sessão de 30 min ("FOCO", "30:00" descendo, "Período de foco (1 de 1)"), e a tela Foco da janela principal mostra a mesma sessão, com "30 min" no mostrador. Os minutos da janela principal são os do tomate arredondados para cima (com 29:41 no tomate, "30 min" na principal).
5. [ ] Clique de novo no botão do meio: "PAUSADO", o corpo fica mais apagado e a janela principal mostra "Pausado". Clique mais uma vez para retomar.
6. [ ] Feche o tomate com Alt+F4 (com ele ativo). Espere uns 5 s e abra de novo pelo botão do `#/dev`: o tempo continua de onde devia (não voltou a 30:00).
7. [ ] Clique no quadrado da esquerda embaixo ("Encerrar sessão"): volta a "PRONTO". Na janela principal, inicie uma sessão de 60 min: o tomate mostra "Período de foco (1 de 2)". Clique no botão da direita embaixo ("Pular para o intervalo"): o corpo fica vinho, o anel verde-claro, "INTERVALO" e "A seguir: foco de 27 min".
8. [ ] Engrenagem (em cima, à direita): a janela principal vem para a frente, nas Configurações, e o tomate continua aberto. O ícone de janela (em cima, à esquerda, "Voltar ao modo normal"): a janela principal vem para a frente e o tomate fecha.
9. [ ] Deuteranopia: com o `npm run dev:app` aberto (o Vite serve na 5173; na worktree `tomatito-full`, na porta que você passou), abra no Chrome `http://localhost:5173/tomato.html` (a página fica sem dados do app; basta ver o desenho). F12 → menu ⋮ → More tools → Rendering → "Emulate vision deficiencies" → Deuteranopia. As folhinhas do cálice continuam visíveis contra o corpo. Repita com Protanopia. Volte para "No emulation".
10. [ ] Feche o app (Ctrl+C no terminal).

## M51. Alternar para o Full e de volta

O que já foi conferido sem você:
- `npm test` e `cargo test`: a escolha do Full e a saída pelas Configurações (esperando o `tt://settings` da saída), a ordem do "Entrar" e do "Sair" da 5.7, o limite de 2 s do `tt://tomato-ready`, o início só com a `tomato` e a chave de validação.
- Prévia no Chrome (`node scripts/preview/aparencia.mjs`, 42 conferências): a opção "Tomatito Full" com o tomate em miniatura, e a ida e a volta pela Aparência em cada tema de partida.
- Roteiro aninhado `full` (o app de verdade no GNOME Shell 50.1 aninhado, 20 conferências): 20 idas e voltas com uma sessão correndo, sem clarão quadro a quadro (949 quadros do tomate, 820 da janela principal), sem zerar o timer e sem crash; a memória do app e do WebKit +0,7%; o Claro escolhido com o Full ativo; o início direto no Full.

O que só você consegue: ver a troca na sua tela e com o seu teclado.

Desde o M51, o botão "Abrir o tomate" do `#/dev` (passo 1 da seção M50) esconde a janela principal: para os passos do M50 que olham as duas janelas, traga a principal de volta pela engrenagem do tomate.

### Para conferir (uns 5 minutos)

1. [ ] `cd ~/dev/tomatito-full && npm run dev:app` (ou, depois da junção, em `~/dev/tomatito`). Vá em Configurações: em "Tema do aplicativo" há seis opções, e "Tomatito Full" mostra um tomate sobre um fundo cinza.
2. [ ] Na tela Foco, inicie uma sessão. Volte a Configurações e clique em "Tomatito Full": o tomate aparece e a janela principal some, **sem nenhum quadro branco, preto ou cinza** no lugar do tomate e sem piscar. O tomate mostra o mesmo tempo que a tela Foco mostrava.
3. [ ] Com o tomate ativo (clique nele, fora dos botões, se precisar), aperte Esc: a janela principal volta, em Configurações, no tema de antes, e o tomate fecha. O tempo continua de onde estava.
4. [ ] Entre no Full de novo e clique no ícone de janela (em cima, à esquerda do tomate, "Voltar ao modo normal"): o mesmo do passo 3.
5. [ ] Faça umas 5 idas e voltas seguidas, alternando o Esc e o botão: nenhum clarão, o tempo nunca volta ao começo.
6. [ ] No Full, clique na engrenagem do tomate: a janela principal aparece em Configurações, com o tomate ainda aberto e "Tomatito Full" marcado. Clique em "Claro": o tomate fecha e a janela principal fica no Claro.
7. [ ] Escolha "Tomatito Full" de novo e feche o app (Ctrl+C no terminal). Rode `npm run dev:app` outra vez: **só o tomate aparece**, sem a janela principal. Clique na engrenagem: a principal aparece já em Configurações, no Claro. Aperte Esc no tomate: ele fecha e o app fica no Claro.
8. [ ] (Depois da junção, com o build de uso diário instalado e os outros apps WebKit fechados, como o GNOME Web.) Abra o Tomatito instalado, rode no terminal o comando abaixo, faça 20 idas e voltas (passos 2 e 3) e rode de novo. O segundo número é no máximo 10% maior que o primeiro.

   ```bash
   ps -o rss= -p "$(pgrep -d, -f 'tomatito|WebKitWebProcess|WebKitNetworkProcess')" | awk '{s+=$1} END{print s" KB"}'
   ```
9. [ ] Feche o app (Ctrl+C no terminal).
