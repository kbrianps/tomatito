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

## Resolvidas

- **Nome** (1.2, item 1): continua "Tomatito".
- **Disco** (1.2, item 5): builds em `/opt/cargo-target/tomatito`, pela `.cargo/config.toml` (fora do git).
