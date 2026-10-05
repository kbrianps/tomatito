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
- 26/09/2026, M09: esconder (só visualmente) o título das telas Foco, Temporizador e Cronômetro, que o Relógio não mostra; o `<h1>` continua para o leitor de tela e para o foco na troca de tela. Decidir no M17, no M32 e no M34, ou na revisão de fidelidade do M42. Feito no M42 (`docs/fidelidade.md`, itens 5, 11 e 13).
- 27/09/2026, M10: botão de expandir o painel compacto por cima do conteúdo (o `PaneToggleButton` do NavigationView), para ver os nomes sem alargar a janela. Hoje o painel compacto tem só os ícones e as dicas, como pede o M10.
- 27/09/2026, M13: passar a dica do painel compacto (M10) para a dica própria dos botões de ícone (`src/components/dica.js`), para as duas terem o mesmo comportamento (Esc, folga para o mouse, some na troca de tela). Hoje as duas funcionam e têm o mesmo desenho.
- 27/09/2026, M13: anel de foco duplo também nos componentes Fluent (caixa, radio, switch e item de menu), que hoje mostram o anel simples do próprio Fluent na cor do anel externo. Exige esconder o do componente e desenhar o anel em volta do rótulo (como o `FocusVisual` do CheckBox do WinUI). Decidir com o Orca no M43. **M43: fica como está** (o anel do Fluent aparece em todos, e o Orca lê os componentes; `docs/decisoes.md`, M43, item 7).
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
- 28/09/2026, M38: achados de passagem, que já existiam no M37 e não são deste marco: o `scripts/preview/responsivo.mjs` acusa rolagem horizontal no Cronômetro com zoom (a partir de 120% no WebKitGTK e de 160% no Chrome com barras clássicas; os centésimos passam da janela), e o `scripts/preview/cartao-sessao.mjs` no WebKitGTK não recebe os cliques nos chevrons do seletor (as teclas funcionam; no Chrome, tudo passa). O primeiro é do M43 (zoom de 150% sem rolagem horizontal; **resolvido no M43**); o segundo, da ferramenta de prévia.
- 28/09/2026, M39: `recursos.bandeja` pelo D-Bus no Linux: `true` só com alguém mostrando o ícone (o `org.kde.StatusNotifierWatcher`, que no GNOME vem da extensão AppIndicator), acompanhando a extensão ligada ou desligada com o app aberto. Hoje é "o ícone foi criado", e no GNOME sem a extensão o "Tempo na bandeja" aparece sem ter onde mostrar o tempo.
- 28/09/2026, M39: a versão do Sobre selecionável (e com "Copiar"), como o texto de versão da WinUI Gallery. Hoje ela fica dentro do botão do cabeçalho, que abre e fecha o cartão.
- 28/09/2026, M41: o conteúdo do expansível descendo ao abrir (333 ms) e subindo ao fechar (167 ms), como o do Expander do WinUI. Hoje só o chevron gira; o conteúdo aparece e some de uma vez.
- 28/09/2026, M41: a bolinha do deslizante do volume crescendo no hover e encolhendo ao apertar com a animação do Slider do WinUI (escala em 167 ms e 250 ms, `Slider_themeresources.xaml`). Hoje o tamanho muda de uma vez.
- 28/09/2026, M41: no WebKitGTK, o fundo escuro atrás do diálogo some de uma vez ao fechar (o WebKitGTK 2.52 não tem a propriedade `overlay`, e o `::backdrop` só existe na camada de cima); a caixa faz a saída inteira. No Chrome (e no WebView2), o fundo também some em 83 ms. Rever quando o WebKitGTK tiver o `overlay`.
- 29/09/2026, M42: o conteúdo subindo até a borda de cima da janela, com a barra de título transparente por cima e só o nome sobre o painel, como no Relógio. Hoje a barra ocupa uma faixa de 32 px na largura toda, e o topo do conteúdo fica de 6 a 17 px mais baixo que nas capturas (`docs/fidelidade.md`, item 1). Mexe na barra do M07 e nas regiões de arrastar.
- 29/09/2026, M42: os cartões do Escuro em #323232, sem borda visível, sobre #272727, como na captura do Relógio (hoje, #2B2B2B com borda #3A3A3A sobre #282828, a paleta da seção 4 do plano). Exige rever a paleta com o `contrast.mjs`.
- 29/09/2026, M42: o botão "…" no canto do cartão de preparo da tela Foco, como no Relógio (hoje, só na sessão em andamento).
- 29/09/2026, M42: o fundo do cartão em sessão com o degradê discreto do Relógio (acrílico, do cinza-azulado ao marrom); hoje, a cor lisa do cartão.
- 29/09/2026, M42: para o M43, o transbordo do Cronômetro com zoom anotado no M38, medido no M42 (igual ao do M41; `docs/decisoes.md`, M42, item 7): o `responsivo.mjs` dá 9 linhas FALHA, todas no Cronômetro a 480 × 500. Rolagem horizontal do conteúdo: 2 px no Chrome com barras a 160%; 1, 24, 33 e 41 px no WebKitGTK a 120%, 140%, 150% e 160%; 10, 32, 40 e 48 px no WebKitGTK com barras; os centésimos fora da janela de 140% em diante. A causa no WebKitGTK: o `100cqi` do tamanho do número (M34) vale a largura sem o zoom (402 px em vez de 251 a 160%). Trocar o `cqi` por uma conta que o zoom respeite (por exemplo, `vw` menos o painel, ou medir no JS) e rever os 2 px do Chrome com barras. **Resolvido no M43** (`src/lib/larguras.js`; `docs/decisoes.md`, M43, item 1).
- 29/09/2026, M43: nos fins de fase com as notificações ligadas, o Orca da sessão de verdade deve ler duas mensagens sobre a mesma troca: o balão do GNOME ("Período de foco concluído…") e o anúncio do app ("Começou o intervalo 1 de 1."). Não são o mesmo texto, e o anúncio do app é o único que vale com o "Não perturbe" ou com o balão desligado. Se incomodar, pular o anúncio do app quando o balão for mostrado (o shell não diz ao app se mostrou).
- 29/09/2026, M43: quando o WebKitGTK passar a entregar ao Orca o texto das regiões `aria-live` (`object:text-changed:insert`), tirar o `a11y_announce` do anúncio das fases e do "Voltas copiadas", senão o Orca lê duas vezes. O roteiro `acessibilidade` acusa ("dito" maior que "anunciado").
- 29/09/2026, M43: o `scripts/preview/botoes.mjs` espera 18 ícones e 23 desenhos no catálogo, e hoje são 29 e 37 (os ícones que as telas ganharam desde o M13). Atualizar a conta da prévia.

- **Roteiro e prévia `fases` desatualizados (anotado na junção).** O roteiro aninhado ainda espera que o app saia ao fechar a janela (desde o M36, "fechar para a bandeja" vem ligado) e a volta ao preparo conta uma animação em curso (`document.getAnimations()`), também na prévia `scripts/preview/fases.mjs`, desde antes do M36. Conferir qual transição é e se a regra ou o CSS deve mudar.
- **Roteiros e prévias antigos desatualizados (anotado nas correções da junção, 29/09/2026).** A bateria completa rodou de novo depois das correções, e as falhas abaixo aparecem igual no commit do M46 (`a865eab`, a `main` antes da junção), rodado de propósito para comparar: não são da junção. (1) "O app sai sozinho depois de fechar a janela" em `barra-de-titulo`, `partida-a-frio`, `navegacao`, `botoes`, `controles`, `mostrador`, `responsivo`, `sistema`, `estatisticas`, `progresso`, `meta`, `tarefas`, `cartao-tarefas`, `temporizador-edicao`, `cronometro`, `voltas`, `notificacoes`, `sons`, `contagem`, `temporizador` e `fases` (o mesmo caso do M36: "fechar para a bandeja" vem ligado). (2) `barra-de-titulo` e `responsivo`: as cores esperadas da borda e da camada do painel são as de antes do M42. (3) `navegacao`: Tab, setas e Enter no painel (5 checagens; o M42 mexeu no painel) e, no `a865eab`, também o indicador deslizando. (4) `responsivo`: a dica acompanhando o foco no painel compacto. (5) `botoes` (roteiro e prévia): a conta de ícones do catálogo (já anotada no M43). (6) Prévias `cartao-sessao` (chevrons do seletor) e `mostrador` (menu "Encerrar sessão" e "Pular intervalo"). (7) `movimento` (roteiro): uma das duas checagens do "Animações" desligado falha por rodada (o diálogo numa, a troca de tela na outra), e a prévia `movimento` falhou uma vez em três. Revisar cada roteiro contra o app de hoje num marco de correção.
- **Assinar os instaladores do Windows (anotado no M45).** O `.msi` e o `.exe` do `release.yml` saem sem assinatura de código, e o SmartScreen avisa na primeira abertura ("O Windows protegeu o computador"). Assinar pede um certificado (ou o Azure Trusted Signing) e segredos no repositório; o `tauri-action` usa o `bundle.windows.certificateThumbprint` ou o `signCommand`.
- **Tamanho do `.wasm` da web (anotado no W09, 30/09/2026).** Com a retomada, o `tomatito_wasm_bg.wasm` tem 534 103 bytes, 1 623 acima do limite de 532 480 (520 KiB) do W01a e do W06a (detalhe e tentativas em `docs/web/linha-de-base.md`, W09). Decidir entre subir o limite (o gzip é de 205 KB) ou cortar: por exemplo, o tzdb embutido do jiff (a maior parte dos 250 KiB da seção de dados) ou uma desserialização manual das partes do estado. **W13:** com os textos dos avisos (`i18n::notice`, `notice_com_atraso` e `timer_ended` agora em uso no wasm), 543 253 bytes, 10 773 acima do limite.
- **Ícone nos avisos da web (anotado no W13, 30/09/2026).** O `showNotification` sai sem `icon` e sem `badge` (o Chrome mostra o ícone do site ou o dele). Os ícones do PWA chegam no W16; passar o de 192 px como `icon` (e um monocromático como `badge`, no Android) quando existirem.
- **"Voltar ao Tomatito" nos avisos da web (anotado no W13).** O `sw.js` só trata o clique no corpo do aviso (foca a aba ou abre uma). Botões de ação ("Pular intervalo", "Iniciar próximo foco") exigiriam falar com o motor, que mora na aba, e não funcionam no iOS.
- Barra inferior do celular (web): ícone preenchido no item atual (W31, decisão 2).

## Web: o que ficou para depois (PLANO-WEB-V1, 2.2)

- Sonda e relógio em Worker para o segundo plano (W10).
- Atalhos na aba (W21) e revisão de acessibilidade da web (W22).
- CI da web (W25a) e documentação de uso (W25b).
- `--servidor pages` no `verificar.mjs` e o caso `pwa-publicado` (W40b).
- **Tamanho do `.wasm` da web (anotado no W09, 30/09/2026).** Com a retomada, o `tomatito_wasm_bg.wasm` tem 534 103 bytes, 1 623 acima do limite de 532 480 (520 KiB) do W01a e do W06a (detalhe e tentativas em `docs/web/linha-de-base.md`, W09). Decidir entre subir o limite (o gzip é de 205 KB) ou cortar: por exemplo, o tzdb embutido do jiff (a maior parte dos 250 KiB da seção de dados) ou uma desserialização manual das partes do estado.
- **Android: rodada com o *notification cooldown* do sistema (A12).** O `emulador.mjs subir` desliga o cooldown do Android 15+ para que cada fim da receita de 60 s toque. No aparelho do usuário ele vem ligado, e no A02 um aviso 30 s depois de outro saiu mudo. Rodar o roteiro do A12 uma vez com `settings delete system notification_cooldown_enabled` e registrar se o fim do intervalo (a 60 s do fim do foco) toca, baixo ou mudo. Se calar com fases curtas, anotar na ficha ou no `PUBLICAR.md`; com fases de vários minutos não deve pesar. **Feito no A12 (30/09/2026):** os 3 fins a 60 s tocaram com o cooldown do sistema (`segundo-plano.mjs --cooldown-do-sistema`).
- **Android: repor a contínua depois do boot (anotado no A11, 30/09/2026).** O `BootReceiver` reagenda os alarmes, mas não a notificação contínua, que o sistema apagou; ela volta no próximo fim ou ao abrir o app. Dá para guardar a contínua de agora nas `SharedPreferences` a cada `agendar`/disparo e repô-la no `reagendar` (se o `fimMs` não venceu, ou se está pausada).
- **Android: botões na notificação contínua (5.3; anotado no A11).** "Pausar"/"Retomar" pela notificação exigiria acordar o motor (subir o processo e o Rust) a partir de um `BroadcastReceiver`. Fora da v1.
- **Android: anúncio da sessão concluída na retomada (anotado no A12, 30/09/2026).** Ao reabrir o app depois de a sessão acabar com ele morto, o "Sessão de foco concluída." da região `aria-live` depende de o `tt://phase` da retomada chegar depois de o ouvinte estar ligado (às vezes chega antes e o TalkBack não diz nada). Anunciar a partir do `get_state` inicial quando `focus.status = "completed"` e `completedAt` for recente; e dar à tela Foco do celular um estado "Concluída" visível (A05/A16a).
- **Web: a tela ligada fora do Full.** O Wake Lock entrou só no palco do Tomatito Full (v0.3); na tela Foco normal, a tela ainda pode apagar.
- **Atualização por dentro do app: a instalação de ponta a ponta.** A procura foi conferida num AppImage de teste (0.2.99 contra um `latest.json` local: achou a 0.3.0 e avisou). O download e a troca do instalador são do plugin do Tauri e só vão ser exercitados de verdade na primeira versão depois da 0.3.0; o Windows nunca foi testado em máquina real.
