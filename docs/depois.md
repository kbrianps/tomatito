# Depois

Ideias que ficam fora do marco da vez. Regra do plano (2.2): ideia nova entra aqui e não no marco em andamento. Esta lista é revista só depois da v1.

## Já estacionadas no plano (2.2)

**Janelas e Windows**
- Mica no Windows 11 (v1.1).
- Janela mini "Manter no topo".
- Snap Layouts (`tauri-plugin-frame`).

**Telas**
- Modo "Expandir" do temporizador.
- Card "Registro de hoje".
- Faixa "Reflexão".
- Seletor de hora em 3 segmentos (na v1 é um dropdown de horas).

**Sistema**
- Iniciar com o sistema (`tauri-plugin-autostart`).
- Atalhos globais (no Wayland, dependem do portal GlobalShortcuts).
- Impedir a suspensão durante o foco.
- Atualização automática.

**Idioma e pacotes**
- Interface em inglês.
- Pacotes rpm e Flatpak.

## Novas

Formato: data, marco em que surgiu e uma linha sobre a ideia.

- 26/09/2026, M07: barra de título esmaecida com a janela inativa (título e glifos em `--tt-fg-disabled`, como no Windows 11), pelo `onFocusChanged`.
- 26/09/2026, M08: o script de boot aceitar só os seis valores de tema e cair no Lite com qualquer outro. Hoje ele confia no Rust (um `settings.json` editado à mão com um tema inexistente deixaria o `<html>` sem bloco de tokens).
- 26/09/2026, M09: Espaço também abrir o item focado do painel, como no NavigationView do WinUI (hoje só Enter, como num link). Decidir junto com o Espaço de iniciar e pausar da tela Foco (3.8), para os dois não brigarem.
- 26/09/2026, M09: esconder (só visualmente) o título das telas Foco, Temporizador e Cronômetro, que o Relógio não mostra; o `<h1>` continua para o leitor de tela e para o foco na troca de tela. Decidir no M17, no M32 e no M34, ou na revisão de fidelidade do M42.
- 27/09/2026, M10: botão de expandir o painel compacto por cima do conteúdo (o `PaneToggleButton` do NavigationView), para ver os nomes sem alargar a janela. Hoje o painel compacto tem só os ícones e as dicas, como pede o M10.
