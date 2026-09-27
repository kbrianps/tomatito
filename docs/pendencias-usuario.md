# Pendências do usuário

O que depende de você (decisão, `sudo`, conta no GitHub, outra máquina ou olhar a tela). Cada item diz desde quando está aberto e o que ele bloqueia.

## Abertas

1. **Conferir o M01 na tela** (desde o M01). Uns 2 minutos, com os passos em `docs/verificacao-manual.md`, seção M01. Não bloqueia os próximos marcos: a janela, o switch e a recarga já foram conferidos de forma automática.
2. **Repositório no GitHub e o CI do M03** (plano 1.2, item 4; desde o M01). Decidir quando criar `kbrianps/tomatito` e se será público ou privado. Nada foi criado: não há remote, push nem tag. O nome estava livre em 26/09/2026. O `ci.yml` já está no commit do M03; falta só o que depende da sua conta. Quando quiser (uns 5 minutos, mais uns 20 de espera na primeira rodada, que compila tudo sem cache):

   ```bash
   cd ~/dev/tomatito
   gh repo create kbrianps/tomatito --public --source . --push     # ou --private
   gh repo edit kbrianps/tomatito --description "Timer de foco leve para Windows e Linux"
   gh run watch                                                    # acompanha a rodada do push
   ```

   - O `--source . --push` cria o remote `origin` e manda o `main` com todos os commits (M01 em diante).
   - Público mantém o Actions sem custo e é o que o Flathub exige depois (1.1). Privado gasta a cota de minutos.
   - **Pronto quando:** os dois jobs, `ubuntu-24.04` e `windows-latest`, ficam verdes. O passo que mais importa conferir no Windows é o "5. cargo test": ele é o primeiro a linkar o app com o manifesto novo (`docs/decisoes.md`, M03, item 7).
   - Se ficar vermelho: `gh run view --log-failed` mostra o erro; leve essa saída para a próxima sessão de trabalho no projeto. Os passos do que conferir estão em `docs/verificacao-manual.md`, seção M03.
   - Bloqueia só o M45 (release), que precisa do CI verde.
3. **Testes em Windows de verdade** (plano 1.2, item 6). Hoje só existe a checagem cruzada `cargo check --target x86_64-pc-windows-msvc` (ver `docs/decisoes.md`, M01, item 8). Bloqueia o M47a em diante.
4. **Decisões do plano ainda abertas**, sem pressa: nome definitivo do "Tomatito Suave" (1.2, item 3; antes do M24), tempo na bandeja ligado por padrão no GNOME (1.2, item 7; M36) e o que fazer com `~/Documentos/tomatito_stats.jsonl`, `~/Documentos/tomatito_checkpoint.json` e `~/Android/Sdk` (1.2, item 8).
5. **Nome no `LICENSE`** (desde o M02, opcional). Está "Copyright (c) 2026 kbrianps", como o `authors` do `Cargo.toml`. Se quiser o nome completo, troque a linha. Não bloqueia nada.
6. **Conferir o spike A na tela** (desde o M04). Uns 3 minutos, com os passos em `docs/verificacao-manual.md`, seção M04. O teste automático (num GNOME Shell aninhado, com o mesmo Mutter 50.1) e uma abertura rápida na sessão real já conferiram transparência, arraste e botões. O que falta é o seu olho na tela de verdade. Não bloqueia o M05; cantos pretos ou brancos mudariam o veredito para B3.
7. **Conferir o spike B na tela** (desde o M05). Uns 4 minutos, com os passos em `docs/verificacao-manual.md`, seção M05; dá para fazer junto com o item 6, na mesma abertura da `spike/full`. O teste aninhado e o comando do "Pronto quando" na sessão real já conferiram a região, o clique atravessando, o arraste e os botões, e o veredito ficou A. Falta ver o clique atravessar para um terminal de verdade. Não bloqueia os próximos marcos (o Full só volta no M50); se o clique não atravessar, o veredito cai para B1 e a fase 10 muda (plano, 5.8).
8. **(Opcional) Monitor externo na NVIDIA** (desde o M05). O passo 8 da seção M05 de `docs/verificacao-manual.md`. É o gatilho do risco #10702 (Error 71). Não bloqueia nada agora; vale fazer antes do M50.
9. **Conferir o M06 na tela** (desde o M06). Uns 3 minutos, com os passos em `docs/verificacao-manual.md`, seção M06. As cores, os componentes, os cliques e a fonte já foram conferidos no WebKitGTK de verdade (numa janela fora da tela e numa abertura do `tauri dev`); falta o seu olho. Não bloqueia o M06b nem o M07.
10. **Conferir o M07 na tela** (desde o M07). Uns 4 minutos, com os passos em `docs/verificacao-manual.md`, seção M07. O teste num GNOME Shell aninhado já conferiu com ponteiro e teclado virtuais o arraste, o duplo clique, os três botões, o hover do X, o redimensionar pelas bordas, o zoom e a borda (36 conferências ok), e uma abertura rápida na sua sessão confirmou que a janela sobe sem moldura. Falta o mouse de verdade. Não bloqueia o M08.
11. **Barra de título no Windows** (desde o M07). A janela sem moldura no Windows (arrastar, duplo clique, redimensionar pela borda que o Tauri cria, cantos arredondados do `shadow(true)` no Windows 11) só foi conferida pela checagem cruzada, que compila mas não roda. Entra na conferência do M48 (item 3).
12. **Conferir o M08 na tela** (desde o M08). Uns 5 minutos, com os passos em `docs/verificacao-manual.md`, seção M08: gravar 10 aberturas do build de debug com Ctrl+Alt+Shift+R, ver o vídeo em câmera lenta e olhar o console do DevTools. O teste aninhado já conferiu quadro a quadro 20 partidas a frio (nenhum quadro branco nem de outro tema; o primeiro é o fundo do Lite e o segundo já é a tela final) e leu o console pelo inspetor remoto, inclusive numa abertura rápida na sua sessão (nenhum "Refused to"). Falta o seu olho. Não bloqueia o M09.
13. **CSP e boot no Windows** (desde o M08). A CSP ganhou `connect-src 'self' ipc: http://ipc.localhost`; o `http://ipc.localhost` é o endereço do IPC no WebView2 e só pode ser conferido no Windows: no build de debug, o console do DevTools (F12 ou botão direito → Inspecionar) não pode mostrar "Refused to" nem o aviso "IPC custom protocol failed". Na mesma ida ao Windows, ver se a janela abre sem clarão branco (o WebView2 tem o próprio fundo antes da primeira pintura). Entra na conferência do M49.
14. **Conferir o M09 na tela** (desde o M09). Uns 4 minutos, com os passos em `docs/verificacao-manual.md`, seção M09: clicar nos itens do painel e ver o indicador deslizar, os atalhos Ctrl+1/2/3 e Ctrl+,, Tab e as setas, e o selecionado no Claro e no Escuro contra a captura do Relógio. O teste aninhado já conferiu tudo isso com ponteiro e teclado virtuais (25 conferências ok) e mediu as cores na tela; falta o seu olho e o seu teclado. Não bloqueia o M10.
15. **Navegação pelo teclado no Windows** (desde o M09). No Linux, as setas do painel vêm do polyfill; no Windows, o WebView2 (Chromium) deve usar o `focusgroup` nativo, como o Chrome 153 da prévia, onde tudo passou. Na ida ao Windows (M48), repetir o passo 4 da seção M09 de `docs/verificacao-manual.md`. Não bloqueia nada antes do M48.
16. **Conferir o M10 na tela** (desde o M10). Uns 4 minutos, com os passos em `docs/verificacao-manual.md`, seção M10: a camada, estreitar a janela com o mouse até 480 px, a dica do painel compacto com o mouse, o Esc e o teclado, e o zoom. O teste aninhado já estreitou a janela pela borda com o ponteiro virtual (18 paradas, nenhuma rolagem horizontal) e exercitou as dicas (18 conferências ok), e os dois motores foram conferidos em 15 larguras; falta o seu olho e o seu mouse. Não bloqueia o M11.
17. **Painel compacto e barras de rolagem no Windows** (desde o M10). No WebView2, conferir o passo 3 da seção M10 de `docs/verificacao-manual.md` com uma tela mais alta que a janela (o `#/dev`): a barra vertical do Windows fica dentro da camada, não cria rolagem horizontal e não muda o número de colunas da Foco. A prévia do Chrome com barras clássicas já passou; falta o WebView2 de verdade, com a escala do Windows (125% e 150%). Entra na conferência do M48.

## Resolvidas

- **Nome** (1.2, item 1): continua "Tomatito".
- **Disco** (1.2, item 5): builds em `/opt/cargo-target/tomatito`, pela `.cargo/config.toml` (fora do git).
