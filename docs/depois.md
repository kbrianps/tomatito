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
- 28/09/2026, M30: trocar a tarefa no meio da sessão (exigiria um comando `focus_set_task` no núcleo e um período novo a partir da troca).
- 28/09/2026, M30: renomear uma tarefa (duplo clique no título) e arrastar para reordenar. Hoje só adicionar, concluir, escolher e apagar.
- 28/09/2026, M36: "Iniciar foco" da bandeja com a última duração usada na tela Foco (hoje, sempre 30 min, a duração com que o seletor abre). Exigiria guardar a última duração no `settings.json`.
- 28/09/2026, M37: os outros atalhos de navegador do WebView2 no app de produção (no Chromium, Ctrl+P imprime e Ctrl+F abre a busca, entre outros). O M37 prende só o menu de contexto, o F5 e o Ctrl+R, como pede o plano; conferir os demais na ida ao Windows (M48) e decidir se entram no `producao.js` ou no `AreBrowserAcceleratorKeysEnabled` do WebView2.
- 28/09/2026, M38: "Automático" no período de foco, como no Relógio (o app escolheria o F pela duração da sessão). Exigiria mudar a regra da 3.2; hoje o F é fixo, de 15 a 60 min.
- 28/09/2026, M38: escolher o som de cada aviso numa lista, como o "Alarm sound" do Relógio. Hoje há um som por tipo (M20), e o cartão só o nomeia e testa.
- 28/09/2026, M38: lembrar os cartões abertos das Configurações entre aberturas do app (hoje, só enquanto o app roda).
- 28/09/2026, M38: achados de passagem, que já existiam no M37 e não são deste marco: o `scripts/preview/responsivo.mjs` acusa rolagem horizontal no Cronômetro com zoom (a partir de 120% no WebKitGTK e de 160% no Chrome com barras clássicas; os centésimos passam da janela), e o `scripts/preview/cartao-sessao.mjs` no WebKitGTK não recebe os cliques nos chevrons do seletor (as teclas funcionam; no Chrome, tudo passa). O primeiro é do M43 (zoom de 150% sem rolagem horizontal); o segundo, da ferramenta de prévia.
- 28/09/2026, M39: `recursos.bandeja` pelo D-Bus no Linux: `true` só com alguém mostrando o ícone (o `org.kde.StatusNotifierWatcher`, que no GNOME vem da extensão AppIndicator), acompanhando a extensão ligada ou desligada com o app aberto. Hoje é "o ícone foi criado", e no GNOME sem a extensão o "Tempo na bandeja" aparece sem ter onde mostrar o tempo.
- 28/09/2026, M39: a versão do Sobre selecionável (e com "Copiar"), como o texto de versão da WinUI Gallery. Hoje ela fica dentro do botão do cabeçalho, que abre e fecha o cartão.
