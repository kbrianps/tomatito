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
- 27/09/2026, M13: passar a dica do painel compacto (M10) para a dica própria dos botões de ícone (`src/components/dica.js`), para as duas terem o mesmo comportamento (Esc, folga para o mouse, some na troca de tela). Hoje as duas funcionam e têm o mesmo desenho.
- 27/09/2026, M13: anel de foco duplo também nos componentes Fluent (caixa, radio, switch e item de menu), que hoje mostram o anel simples do próprio Fluent na cor do anel externo. Exige esconder o do componente e desenhar o anel em volta do rótulo (como o `FocusVisual` do CheckBox do WinUI). Decidir com o Orca no M43.
- 27/09/2026, M17: gravar a última duração do seletor de minutos entre aberturas do app (hoje ela é lembrada só enquanto o app está aberto; o plano não pede e não há chave no `settings.json`).
- 27/09/2026, M17: seletor de minutos como o NumberBox por completo: repetir o passo com o chevron apertado (o `RepeatButton`), a roda do mouse com o campo focado e a digitação de um valor. Hoje: teclas, chevrons e Home/End.
- 27/09/2026, M18: "Pular o próximo intervalo" de dentro do foco (o foco atual continua e emenda no seguinte). Hoje o `focus_skip` pula a fase atual, e o item "Pular intervalo" do menu só vale num intervalo; exigiria um comando novo no núcleo.
- 27/09/2026, M18: o botão de janela compacta que o Relógio mostra no canto do cartão em sessão. No Tomatito, o papel é do Full (M50 a M57); decidir lá se o cartão ganha um atalho para ele.
