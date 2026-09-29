# Revisão de fidelidade (M42)

Comparação do Tomatito com as capturas do Relógio do Windows 11 em `~/dev/tomatito-ref/`, tela a tela, em Claro e em Escuro, com uma olhada no Lite e no Suave. As imagens do Relógio não entram no repositório; a montagem lado a lado foi feita fora dele, só para olhar.

## Como as capturas foram feitas

`node scripts/preview/fidelidade.mjs --temas light,dark,lite,suave` (Chrome headless, com o mock do Tauri e `plataforma=windows`). Cada tela sai no tamanho de janela da referência e com a mesma densidade dela (175%): 1372 × 936 px CSS, ou 2401 × 1638 px, e 1372 × 1012 px CSS (2401 × 1771 px) nas Configurações. O estado imita o da referência:

| Captura | Referência | Estado |
|---|---|---|
| `fidelidade-foco-<tema>.png` | `clock-focus-sessions-page.png` | duas tarefas, sem sessão |
| `fidelidade-foco-sessao-<tema>.png` | `crop-insession.png` (recorte do cartão) | sessão de 60 min, primeiro foco, 27 min restantes |
| `fidelidade-temporizador-<tema>.png` | `timers-in-clock-app.png` | os quatro temporizadores padrão, parados |
| `fidelidade-cronometro-<tema>.png` | `stopwatch-in-clock-app.png` | correndo, a partir de 1,87 s |
| `fidelidade-configuracoes-<tema>.png` | `clock-focus-sessions-settings.png` | cartões da seção "Sessões de foco" abertos |

As 8 capturas do marco são as de Foco, Temporizador, Cronômetro e Configurações em `claro` e `escuro`. As da sessão em andamento e as do Lite e do Suave são a mais.

Limite da prévia: sem a Segoe UI, o texto sai na fonte de reserva (a Inter do Linux), um pouco mais larga. A fonte de verdade fica para a ida ao Windows (M48).

## Diferenças e destino

Legenda: **corrigido** (neste marco, em até 15 min), **depois** (item em `docs/depois.md`), **intencional** (decisão do plano ou de um marco anterior, sem mudança).

### Todas as telas

1. **Barra de título.** No Relógio, o conteúdo sobe até a borda de cima da janela, e a barra de título fica por cima, só com o nome sobre o painel. No Tomatito, a barra ocupa uma faixa de 32 px na largura toda, e a camada do conteúdo começa abaixo dela, com a borda e o canto arredondado do NavigationView. Consequência: tudo o que está no topo do conteúdo fica uns 6 a 17 px mais baixo que lá. **Depois** (mexe na barra de título do M07 e nas regiões de arrastar dos dois sistemas).
2. **Cartões do Escuro.** No Relógio, o cartão é #323232, sem borda visível, sobre um fundo #272727. No Tomatito, é #2B2B2B com a borda #3A3A3A sobre #282828 (a paleta do plano, 4). **Depois** (a paleta é do plano e passa pelo `contrast.mjs`).
3. **Cor de destaque** vermelha, em vez da lilás da captura (que é a cor de destaque do Windows de quem tirou a captura). **Intencional** (4).
4. **Painel.** Sem Alarme, Relógio mundial e a conta no rodapé. **Intencional** (escopo, 2).

### Foco (sem sessão)

5. **Título "Foco" visível**, que o Relógio não mostra; empurrava a grade uns 64 px para baixo. **Corrigido**: o título fica só para o leitor de tela e para o foco na troca de tela (`.tt-so-leitor`), e a página começa a 16 px da barra de título. O cartão de preparo está a 49 px da borda da janela (lá, 43) e a 313 px da esquerda (lá, 316).
6. **Botões "Janela compacta" e "…" no canto do cartão de preparo.** O compacto já está em `docs/depois.md` (M18, com o Full). O "…" do preparo: **depois**.
7. **Cartão do Spotify** e "Sequência" (Streak) no progresso: **intencional** (escopo, 2; o progresso mostra "Esta semana", 3.3).

### Foco (em sessão)

8. **Fundo do cartão em sessão.** No Relógio, um degradê discreto (acrílico, do cinza-azulado em cima ao marrom embaixo). No Tomatito, a cor lisa do cartão. **Depois**.
9. **Botão "Janela compacta" no canto do cartão**: já em `docs/depois.md` (M18).
10. **Marca de progresso do mostrador** em outra posição: o mostrador segue a regra da 3.2 e as medidas do M17 (feitas sobre esta mesma captura). **Intencional**.

### Temporizador

11. **Título "Temporizador" visível**: **corrigido** como o do item 5. O primeiro card está a 49 px da borda de cima (lá, 50) e a 341 px da esquerda (lá, 340).
12. **Botões "Expandir" e "Manter no topo" no canto de cada card**: já em `docs/depois.md` ("Modo Expandir do temporizador" e "Janela mini").

### Cronômetro

13. **Título "Cronômetro" visível**: **corrigido** como o do item 5. O número continua no terço de cima, com a margem da decisão do M34: o topo dos algarismos a 193 px da borda da janela (lá, 195), e os botões uns 10 px mais baixos que lá.
14. **Bandeira da volta** em contorno; no Relógio, preenchida. **Corrigido**: `flag` passou ao estilo preenchido (`scripts/copy-icons.mjs`), como o play e o pause ao lado.
15. **Botões "Expandir" e "Manter no topo" acima do número**: já em `docs/depois.md` (os mesmos do item 12).
16. **"h min s" e a vírgula dos centésimos**, em vez de "hr min sec" e o ponto: **intencional** (pt-BR).

### Configurações

17. **Título e recuo.** O título ficava 29 px mais baixo que o "Settings", e os cartões a 32 px dos lados (lá, 58). **Corrigido**: a página começa a 16 px da barra de título, e com 1000 px ou mais de conteúdo (a janela da captura) o recuo dos lados é de 56 px. O topo das letras do título está a 60 px da borda da janela (lá, 43; o resto é o item 1), e os cartões vão de 337 a 1316 px (lá, de 339 a 1315).
18. **"Automático" no período de foco** e **lista de sons** no lugar do nome do som com "Testar": já em `docs/depois.md` (M38).
19. **Seções Conta e Spotify**: **intencional** (escopo, 2). O Tomatito tem Volume, Aparência e Sistema, que o Relógio não tem.

### Claro

Não há captura clara do Relógio: a comparação é de estrutura, com as mesmas referências. As diferenças são as das telas acima; nada a mais. O painel sai em #F3F3F3 e o conteúdo em #F9F9F9, a relação do WinUI no tema claro.

### Lite e Suave

Uma olhada nas 10 capturas: as correções dos itens 5, 11, 13, 14 e 17 valem igual, sem corte nem sobreposição. Nada a anotar além do que já está acima.
