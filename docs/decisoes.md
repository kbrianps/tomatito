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
