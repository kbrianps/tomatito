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

1. [ ] `cd ~/dev/tomatito && npm run tauri dev`. Na tela Foco, o cartão "Pronto para focar" mostra `00:00` e "Nenhuma sessão em andamento".
2. [ ] Clique em **Iniciar 25 min**: aparece `25:00` e, em seguida, `24:59`, `24:58`... A linha de baixo diz "Período de foco 1 de 1".
3. [ ] **Minimizar 6 min:** anote o tempo na tela, minimize a janela, espere 6 min no relógio do sistema e volte pela barra de tarefas (ou Alt+Tab). O número deve ser o anotado menos 6 min (± 1 s), já no primeiro quadro, sem "pular" depois.
4. [ ] Clique em **Encerrar** e depois em **Iniciar 5 min**. Espere uns 30 s e anote o tempo.
5. [ ] **Suspensão:** num terminal, `systemctl suspend`; acorde o computador depois de 1 min pelo relógio do celular. Na volta, o tempo deve ser o anotado menos o tempo que passou (≈ 1 min e pouco), e não o anotado. Se a fase tiver vencido durante a suspensão, a tela mostra "Sessão concluída".
6. [ ] **CPU parado:** clique em **Encerrar**, abra outro terminal e rode `top -p $(pgrep -x tomatito)`. Depois de uns 10 s, a coluna `%CPU` fica em `0,0` (no máximo um `0,3` de vez em quando). Com uma sessão correndo, fica um pouco acima.
7. [ ] Feche o `tauri dev` (Ctrl+C no terminal).
