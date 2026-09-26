# Pendências do usuário

O que depende de você (decisão, `sudo`, conta no GitHub, outra máquina ou olhar a tela). Cada item diz desde quando está aberto e o que ele bloqueia.

## Abertas

1. **Conferir o M01 na tela** (desde o M01). Uns 2 minutos, com os passos em `docs/verificacao-manual.md`, seção M01. Não bloqueia os próximos marcos: a janela, o switch e a recarga já foram conferidos de forma automática.
2. **Repositório no GitHub** (plano 1.2, item 4). Decidir quando criar `kbrianps/tomatito` e se será público ou privado. Nada foi criado: não há remote, push nem tag. Bloqueia o M03 (CI), que pode ser pulado até o M45.
3. **Testes em Windows de verdade** (plano 1.2, item 6). Hoje só existe a checagem cruzada `cargo check --target x86_64-pc-windows-msvc` (ver `docs/decisoes.md`, M01, item 8). Bloqueia o M47a em diante.
4. **Decisões do plano ainda abertas**, sem pressa: nome definitivo do "Tomatito Suave" (1.2, item 3; antes do M24), tempo na bandeja ligado por padrão no GNOME (1.2, item 7; M36) e o que fazer com `~/Documentos/tomatito_stats.jsonl`, `~/Documentos/tomatito_checkpoint.json` e `~/Android/Sdk` (1.2, item 8).

## Resolvidas

- **Nome** (1.2, item 1): continua "Tomatito".
- **Disco** (1.2, item 5): builds em `/opt/cargo-target/tomatito`, pela `.cargo/config.toml` (fora do git).
