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
4. [ ] No terminal, rode `/opt/cargo-target/tomatito/debug/tomatito`. A janela vermelha aparece de uma vez, já com a amostra do tema. Feche no X da própria janela. Repita até completar **10 vezes**.
5. [ ] Pare a gravação clicando no ponto vermelho (ou Ctrl+Alt+Shift+R de novo). O vídeo fica em `~/Vídeos/Screencasts/`.
6. [ ] Para ver quadro a quadro sem instalar nada, gere uma cópia 8 vezes mais lenta e assista:

   ```bash
   cd ~/Vídeos/Screencasts
   ffmpeg -i "$(ls -t *.webm | head -1)" -vf "setpts=8*PTS" -an /tmp/tomatito-lento.webm
   xdg-open /tmp/tomatito-lento.webm
   ```

   Em nenhuma das 10 aberturas pode aparecer um retângulo branco, preto ou cinza, nem a janela com outras cores antes do vermelho. O esperado é: no lugar da janela surge o vermelho liso e, logo em seguida, a amostra (título, cartões, anel). O GNOME faz a janela crescer um pouco ao abrir; isso é do sistema.
7. [ ] **Console do DevTools:** rode `/opt/cargo-target/tomatito/debug/tomatito` mais uma vez, clique com o botão direito no meio da janela → **Inspecionar** → aba **Console**. Não pode haver nenhuma linha com "Refused to". Feche o inspetor e a janela.
8. [ ] Apague o vídeo e a cópia lenta, se não quiser guardá-los: `rm /tmp/tomatito-lento.webm` e o arquivo em `~/Vídeos/Screencasts/`.

Se aparecer algum clarão, anote em qual das 10 aberturas (a ordem do vídeo) e a cor. Se o console mostrar um "Refused to", copie a linha inteira.
