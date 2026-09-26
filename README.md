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
cd src-tauri && cargo test -p tomatito-core    # testes do motor, sem compilar o Tauri
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
