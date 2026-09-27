# Tomatito

Timer de foco leve para Windows e Linux.

Você escolhe a duração da sessão de foco, e o Tomatito intercala intervalos curtos nas sessões longas. A v1 terá também temporizadores, cronômetro, progresso diário e cinco temas, com estética sóbria e sem gamificação.

**Em desenvolvimento.** Ainda não há versão publicada nem instaladores.

## Plataformas

- Linux: Ubuntu 26.04 com GNOME 50 (Wayland).
- Windows 11. O Windows 10 é suportado em melhor esforço.

## Privacidade

Nenhum dado sai do computador: sem rede e sem contas. Configurações e histórico ficam na pasta de dados do app.

## Desenvolvimento

Requisitos: Node 22.12 ou mais novo, Rust 1.90 ou mais novo e as dependências do Tauri 2 para o seu sistema (no Linux, WebKitGTK 4.1).

```bash
npm ci
npm run tauri dev                              # o app em modo de desenvolvimento
npm test                                       # testes do JS (node --test)
node scripts/contrast.mjs                      # contraste (WCAG 2.2) dos pares de cada tema
cd src-tauri && cargo test -p tomatito-core    # testes do motor, sem compilar o Tauri
```

O `src/styles/fluent-tokens.gen.css` (os tokens do Fluent de cada tema) é gerado pelo `scripts/build-theme-css.mjs`, que roda sozinho antes do `npm run dev` e do `npm run build` (e, portanto, do `tauri dev` e do `tauri build`). Ele fica fora do git; para refazê-lo à mão, `node scripts/build-theme-css.mjs`.

Os ícones da interface ficam em `src/assets/icons/`, no git: só os usados, copiados do `@fluentui/svg-icons` (MIT) pelo `scripts/copy-icons.mjs`. Para acrescentar um, inclua-o na lista do script e rode `node scripts/copy-icons.mjs`; o `npm test` confere se a pasta bate com a lista.

Conferências visuais sem abrir janelas na sua sessão (em `scripts/`, fora do app):

```bash
npm run shot -- --path "/?plataforma=linux" --shot /tmp/previa.png   # prévia no Chrome headless
bash scripts/gnome-aninhado/rodar.sh barra-de-titulo                 # a janela de verdade num GNOME Shell aninhado (Linux)
bash scripts/gnome-aninhado/rodar.sh partida-a-frio                  # 10 aberturas, quadro a quadro, e o console do DevTools
bash scripts/gnome-aninhado/rodar.sh navegacao                       # painel, atalhos, teclado e o indicador deslizando
bash scripts/gnome-aninhado/rodar.sh responsivo                      # estreitar a janela até 480 px, zoom e dicas do painel
bash scripts/gnome-aninhado/rodar.sh temas-fluent                    # os tokens do Fluent em cada tema, na página e na tela
bash scripts/gnome-aninhado/rodar.sh controles                       # menus, listas, dicas e diálogo com o ponteiro e o teclado
bash scripts/gnome-aninhado/rodar.sh botoes                          # botões, anel de foco pelo Tab e a dica dos botões de ícone
node scripts/preview/responsivo.mjs                                  # o layout em 15 larguras, no Chrome e no WebKitGTK
node scripts/preview/temas-fluent.mjs                                # os tokens do Fluent nos cinco temas, no Chrome e no WebKitGTK
node scripts/preview/controles.mjs                                   # onde abrem os menus, as listas e as dicas, nos dois motores
node scripts/preview/botoes.mjs                                      # botões, desabilitados, anel, dica e ícones, nos dois motores
```

O CI (`.github/workflows/ci.yml`) roda o build, os testes, o `cargo fmt` e o `cargo clippy` no Linux e no Windows a cada push.

Estrutura:

- `src/`: interface (Vite, JS puro e Fluent UI Web Components);
- `src-tauri/`: o app em Rust (Tauri 2);
- `src-tauri/tomatito-core/`: o motor do timer, sem dependência do Tauri;
- `docs/`: decisões, ideias para depois e capturas.

As versões das dependências são exatas (`.npmrc` com `save-exact`, crates do Tauri com `=`), e os arquivos `package-lock.json` e `Cargo.lock` ficam no repositório.

## Licença

MIT. Veja o arquivo `LICENSE`.

Interface inspirada no Fluent Design. Windows e Segoe são marcas da Microsoft. O Tomatito não é afiliado à Microsoft.
