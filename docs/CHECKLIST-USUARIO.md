# Checklist do usuário

Tudo o que falta e só você pode fazer, em cinco blocos. Uma ação por item.

- Os passos completos estão em `docs/verificacao-manual.md`, na seção do marco (Mxx).
- "P23" é o item 23 de `docs/pendencias-usuario.md`.
- Todo comando roda em `~/dev/tomatito`.
- Marque `[x]` quando fizer. Se algo falhar, anote o passo e o que viu.

---

## 1. Decisões que só você toma

Nenhuma bloqueia o uso. Se não decidir, fica o padrão.

| # | Decisão | Padrão hoje | Recomendo | Onde |
|---|---|---|---|---|
| 1 | Repositório público ou privado | nada criado | **Público** (Actions sem custo; o Flathub exige) | P2 |
| 2 | Windows em PC ou em VM | nenhum | **PC com Windows 11**, se tiver acesso (sem `sudo` nem 100 GB no `/`); senão, VM | P3, P88 |
| 3 | Apagar as sobras da versão antiga | ainda existem (conferido em 29/09) | **Apagar** (o `/home` está com 97%) | P4 |
| 4 | Nome do "Tomatito Suave" | "Tomatito Suave" | Manter | P4, P39 |
| 5 | Tempo na bandeja ligado por padrão | desligado | Manter desligado (a opção está nas Configurações) | P4, P37 |
| 6 | Meta diária e volume iniciais | 2 horas, 80% | Manter | P37 |
| 7 | Como voltar do modo opaco ao transparente | só editando o `settings.json` | Item "Usar o fundo transparente" no menu do tomate | P108 |
| 8 | Fechar com "fechar para a bandeja" desligado | não encerra a sessão; ela volta ao reabrir | Manter | P71 |
| 9 | Texto do fim da sessão | "60 min de foco." | Manter (é o do plano) | P31 |
| 10 | Modo do traço do mostrador | progresso do período | Manter | P25 |
| 11 | "1,5 hora" ou "1,5 horas" | "1,5 hora" | Manter (norma) | P46 |
| 12 | Tarefa concluída | fica no lugar | Manter (a lista não pula) | P52 |
| 13 | Orca lendo o balão e o anúncio | lê os dois | Manter | P85 |
| 14 | Cor da bolinha do switch no Lite | vermelho `#AD3D32` | Manter | P35 |
| 15 | Nome no `LICENSE` | "kbrianps" | Manter | P5 |
| 16 | Uso diário: AppImage ou `.deb` | AppImage em `~/.local` | Manter (sem `sudo`) | P33 |
| 17 | Lembrar a posição do tomate no X11 | não | Manter | P115 |
| 18 | Textos e escolhas fora do plano | como estão | **Aceitar em lote**; mude só o que incomodar nas conferências | P49, P54, P57, P60, P63, P68, P74, P77, P80, P82, P87, P91, P102, P114, P115 |

Para a decisão 3 (se aceitar):

```bash
rm ~/Documentos/tomatito_stats.jsonl ~/Documentos/tomatito_checkpoint.json
rm -rf ~/Android/Sdk      # 462 MB; só se não usa Android
```

As três decisões do Windows (padrão do `no_redirection_bitmap`, folga da região, plano B) saem do teste do bloco 4.

---

## 2. Conferências na tela (Linux)

Em ordem de importância. Pare onde quiser; as de baixo pesam menos.

### A. O tomate (decide se o Full fica como está)

1. [ ] **Tomate transparente e clique que atravessa** (M50, M54; P101, P111). ~10 min.
   - `npm run dev:app` → Configurações → "Tomatito Full" → Manter.
   - Em volta do tomate, nenhum quadrado preto, branco ou cinza.
   - Ponha um terminal atrás. Clique num canto da caixa, fora do desenho: o terminal vem para a frente.
   - Arraste pelo corpo e pelas folhas: o tomate acompanha.
   - Se o clique não atravessar, anote "B1".
2. [ ] **Pergunta de validação** (M52; P107). ~6 min.
   - Zere a validação com o `sed` do passo 1 da seção M52.
   - Entre no Full e não responda: em 10 s volta sozinho e oferece o modo opaco.
   - Teste Reverter, Esc, Manter e "Usar o modo opaco".
3. [ ] **Ida e volta do Full** (M51; P104). ~5 min.
   - 5 idas e voltas com uma sessão correndo: sem clarão, o tempo não volta ao começo.
4. [ ] **Menu do tomate e atalhos** (M56, Linux; P113). ~4 min.
   - Botão direito no tomate: menu completo, sem "Sempre na frente".
   - Tamanho › Grande e › Pequeno. Espaço inicia e pausa.
5. [ ] **Junção** (seção "Junção"). ~5 min.
   - Ctrl+Q no Full sai do app. Orca diz cada fase uma vez só.
6. [ ] **Memória com o instalado** (M51, passo 8; P105). ~3 min.
   - Feche o GNOME Web e outros apps WebKit. Abra o Tomatito instalado.
   - Rode o comando abaixo, faça 20 idas e voltas ao Full, rode de novo. O segundo número é no máximo 10% maior.

   ```bash
   ps -o rss= -p "$(pgrep -d, -f 'tomatito|WebKitWebProcess|WebKitNetworkProcess')" | awk '{s+=$1} END{print s" KB"}'
   ```

### B. Uso do dia a dia

7. [ ] **App instalado no dock** (M45, M44, M21b; P116, P86, P34). ~5 min.
   - Super → "Tomatito": ícone do disco vermelho com o arco creme.
   - Abra. Dock e Alt+Tab com o ícone e o nome certos.
   - Se aparecer o ícone antigo: saia da sessão e entre de novo.
8. [ ] **Bandeja e fechar** (M36, M39; P67, P76). ~8 min.
   - Clique no ícone do painel: Iniciar, Pausar, "Mostrar Tomatito", Sair.
   - Feche pelo X com uma sessão correndo: **o som toca** com a janela escondida.
   - Ligue "Tempo na bandeja": o tempo aparece ao lado do ícone.
9. [ ] **Sons e fone** (M20, M38; P29, P73). ~10 min, com um fone.
   - Configurações → "Testar" nos dois sons. Diga se o timbre e o volume servem.
   - Plugue o fone **sem reiniciar o app** e teste: sai no fone.
   - Desligue "Som de fim de foco" e rode uma sessão acelerada: esse som não toca.
10. [ ] **Notificações** (M21; P31). ~5 min.
    - `TOMATITO_SPEED=60 npm run tauri dev`, sessão de 60, minimize.
    - Três balões com som. Com "Não perturbe": sem balão, com som.
11. [ ] **Retomada depois de matar o app** (M40; P79). ~6 min.
    - `pkill -9 -x tomatito` no meio de uma sessão; reabra: continua no tempo certo.
    - Sessão de 1 min, mate, espere 2 min, reabra: "Sessão concluída às HH:MM", sem som.
12. [ ] **Instância única e Ctrl+W/Ctrl+Q** (M37; P70). ~8 min (3 de compilação).
13. [ ] **Suspensão de verdade** (M16; P23). ~15 min, quase tudo esperando.
    - Sessão de 5 min, `systemctl suspend` por 1 min: na volta, o tempo desceu.
14. [ ] **Cronômetro contra o celular** (M34; P62). ~12 min, quase tudo esperando.

### C. Telas e acabamento

15. [ ] **Temas e "Usar configuração do sistema"** (M24, M25; P39, P41). ~8 min.
16. [ ] **Cartão "Tarefas"** (M30; P53). ~5 min.
17. [ ] **Progresso diário e meta** (M27, M28; P45, P48). ~6 min.
18. [ ] **Temporizador: dois juntos, criar, editar, excluir** (M32, M33; P56, P59). ~8 min.
19. [ ] **Colar as voltas no LibreOffice Calc** (M35; P65). ~3 min.
20. [ ] **Orca, só teclado, escala e "Texto grande"** (M43; P84). ~10 min.
21. [ ] **Movimento e "Reduzir animação"** (M41; P81). ~4 min. Religue as animações no fim.
22. [ ] **Semelhança com o Relógio** (M42). ~4 min.
23. [ ] **"Ver avisos" e "Ver licença" no Sobre** (M46; P90). ~3 min.
24. [ ] **Faixas da região** (M53; P110). ~2 min.
25. [ ] (Opcional) **Compatibilidade X11** (M57; P115). ~5 min. Diga se o texto fica borrado.

### D. Opcionais (já cobertos por teste automático)

Só se quiser ver com os próprios olhos. Todos passam pelo `#/dev` ou pelo DevTools.

- [ ] Amostra do Lite e fonte Inter (M06; P9). ~3 min.
- [ ] Barra de título: arrastar, duplo clique, bordas (M07; P10). ~4 min.
- [ ] Gravar 10 aberturas sem clarão (M08; P12). ~5 min.
- [ ] Painel: deslize, Ctrl+1/2/3, setas (M09; P14). ~4 min.
- [ ] Janela estreita até 480 px (M10; P16). ~4 min.
- [ ] Tokens gerados e troca de tema pelo console (M11; P18). ~3 min.
- [ ] Menus, listas e diálogo do catálogo (M12; P19). ~5 min.
- [ ] Botões, anel do Tab e ícones (M13; P21). ~5 min.
- [ ] Mostrador acelerado (M18; P25). ~5 min.
- [ ] Pausado e intervalo pelo Espaço (M19; P27). ~5 min.
- [ ] Hover dos menus no Lite e no Suave (M22; P35). ~3 min.
- [ ] `settings.json` à mão e arquivo estragado (M23; P36). ~4 min.
- [ ] Monitor externo na NVIDIA (M05, passo 8; P8). ~5 min. Risco do "Error 71".

---

## 3. GitHub, CI e publicação

Pré-requisito: decisão 1 (público ou privado). ~5 min, mais ~20 de espera.

1. [ ] Confira o login:

   ```bash
   gh auth status
   ```

2. [ ] Crie o repositório e mande o `main` (troque `--public` por `--private`, se for o caso):

   ```bash
   cd ~/dev/tomatito
   gh repo create kbrianps/tomatito --public --source . --push
   gh repo edit kbrianps/tomatito --description "Timer de foco leve para Windows e Linux"
   gh run watch
   ```

3. [ ] **Pronto quando:** os jobs `ubuntu-24.04` e `windows-latest` do "CI" ficam verdes. No Windows, olhe o passo "5. cargo test" (seção M03).
4. [ ] Se ficar vermelho, guarde o erro e leve para a próxima sessão:

   ```bash
   gh run view --log-failed > ~/tomatito-ci-erro.txt
   ```

5. [ ] Com o CI verde, dispare o rascunho do release (~25 min de espera):

   ```bash
   git push origin v0.1.0
   gh run watch
   gh release view v0.1.0 --json isDraft,assets --jq '.isDraft, .assets[].name'
   ```

6. [ ] **Pronto quando:** o rascunho tem o `.deb`, o `.AppImage`, o `.msi` e o `-setup.exe`.
7. [ ] Se o job do Windows falhar na língua do instalador: numa sessão, tirar `nsis.languages` e `wix.language` do `src-tauri/tauri.conf.json`, commitar e refazer a tag:

   ```bash
   git tag -d v0.1.0 && git push origin :refs/tags/v0.1.0
   gh release delete v0.1.0 --yes
   git tag v0.1.0 && git push origin v0.1.0
   ```

8. [ ] Publicar só depois do bloco 4 (instaladores testados no Windows):

   ```bash
   gh release edit v0.1.0 --draft=false
   ```

Pedir numa sessão depois que o repositório existir (não é com você):
- o passo `node scripts/gerar-avisos.mjs --conferir` no CI (P92);
- o `homepage` com a URL do repositório no `tauri.conf.json` (M45).

Regra que fica (P92): mudou `package.json` ou `Cargo.lock`? Rode `node scripts/gerar-avisos.mjs` e commite o `THIRD_PARTY_NOTICES.md`.

---

## 4. Windows (M47a a M49 e os testes do M55)

Pré-requisitos: decisão 2 e o bloco 3 (o rascunho com os instaladores). Leve de volta: a tabela do M55 preenchida e os erros que aparecerem.

### Passo 1. A máquina (M47a, ~60 min)

- **PC:** pule para o passo 2.
- **VM:** confira o espaço e rode (pede `sudo`; ~100 GB no `/`, ~7 GB de ISO):

  ```bash
  df -h /home /var/lib/libvirt/images
  sudo apt install virt-manager qemu-system-x86 libvirt-daemon-system swtpm swtpm-tools ovmf
  sudo usermod -aG libvirt,kvm $USER
  # saia da sessão e entre de novo; `groups` deve mostrar libvirt e kvm
  # copie o link da ISO em microsoft.com/software-download/windows11 e:
  sudo wget -c -O /var/lib/libvirt/images/win11.iso '<link>'
  df -h /home /
  ```

  - A ISO vai para o `/`, nunca para `~/Downloads`. Se o `/home` ficar abaixo de 3 GB, pare.
  - No virt-manager: disco de 100 GB, UEFI (OVMF), TPM emulado, Windows 11 sem ativação.
- [ ] **Pronto quando:** o Windows 11 abre e baixa o `.msi` e o `.exe` do rascunho.

### Passo 2. Ferramentas (M47b, ~45 min), no PowerShell do Windows

```powershell
winget install Microsoft.VisualStudio.2022.BuildTools --override "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
winget install Rustlang.Rustup
winget install Git.Git
# Node 22: instalador do nodejs.org
gh auth login          # só se o repositório for privado
git clone https://github.com/kbrianps/tomatito
cd tomatito
npm ci
npm run dev:app
```

- [ ] **Pronto quando:** o `npm run dev:app` abre a janela no Windows.

### Passo 3. Instaladores (M45 no Windows; P116), ~10 min

- [ ] `.exe`: SmartScreen → "Mais informações" → "Executar assim mesmo". Em português, sem pedir administrador.
- [ ] Abre pelo menu Iniciar com ícone e nome certos.
- [ ] Na pasta do app: `THIRD_PARTY_NOTICES.md` e `OFL-Inter.txt` (P93).
- [ ] Desinstale. Repita com o `.msi` (este pede administrador).

### Passo 4. Casca e temas (M48), ~60 min

A borda do Windows 11 que segue o tema (`window/dwm.rs`) é código de uma sessão de trabalho no Windows, não sua. Você confere:

- [ ] Fonte: Segoe UI Variable no DevTools (F12).
- [ ] Os quatro temas, sem clarão ao abrir (P13, P40, P42).
- [ ] Barra de título: arrastar, duplo clique, cantos arredondados (P11).
- [ ] Escala de 125% e 150%: nada cortado, ícones nítidos (P17, P47, P69, P89).
- [ ] Alto contraste ligado (P22, P26, P28).
- [ ] Console sem "Refused to" no `npm run build:debug` (P13).
- [ ] Teclado no painel e controles (P15, P20).
- [ ] Contagem, suspensão e som (P24, P30).
- [ ] Arquivos em `%APPDATA%\io.github.kbrianps.tomatito.dev\`, sem `.tmp` sobrando (P38, P44, P61, P80).
- [ ] Configurações, bandeja, instância única e build de produção (P69, P72, P75, P78).
- [ ] Temporizador, cronômetro e voltas na Segoe (P58, P64, P66).
- [ ] Diálogo da meta e tarefas com o Narrador (P50, P55); movimento (P83).

### Passo 5. Notificação, som e Narrador (M49), ~45 min, com o app instalado

- [ ] O toast mostra "Tomatito" com o ícone certo (P32).
- [ ] O som toca uma vez só (sem som duplo).
- [ ] O Narrador lê as trocas de fase.
- [ ] A desinstalação limpa o app.

### Passo 6. Tomate no Windows e o A/B (M55, M56; P112, P103, P106, P109, P113), ~35 min

- [ ] Siga a seção M55 de `docs/verificacao-manual.md`: lados A e B, a 100% e 150%.
- [ ] Preencha a tabela do M55 (clique atravessa, sem retângulo nem borda, sem clarão, borda do desenho).
- [ ] "Sempre na frente" no menu do tomate (seção M56, "no Windows"). ~5 min.
- [ ] (Opcional) Repita no Windows 10. Sem ele, anote "sem Windows 10".

Saem daqui três decisões (a tabela decide, não precisa escolher antes):
- o padrão do `no_redirection_bitmap` (hoje ligado);
- a folga da região no Windows (hoje 1 px; "folga 2" se a borda sair cortada);
- se o plano B só do Windows (janela opaca com região) é preciso.

---

## 5. Itens que já estavam resolvidos

Marcados como resolvidos em `docs/pendencias-usuario.md` e em `docs/verificacao-manual.md` em 29/09/2026:

- **P1 (M01) substituído.** O switch da tela inicial não existe mais; os controles são conferidos no `#/dev` (P19, P21).
- **P6 e P7 (spikes do M04 e do M05) substituídos por P101 e P111.** Eles conferem o tomate definitivo, com a região de verdade, na mesma sessão.
- **P43 (M26 pelo DevTools) substituído por P45.** O cartão do M27 mostra os mesmos números e confere que eles voltam ao reabrir.
- **P51 (M29 pelo DevTools) substituído por P53.** O cartão do M30 faz o mesmo pela tela.
- **P86 e P90: reinstalação já feita.** O uso diário foi reinstalado em 29/09 às 14:11, com o ícone do M44 e os avisos do M46. Só falta olhar.
- **P105: pré-requisito cumprido.** O uso diário instalado já é o da junção, com o Full. Só falta rodar o comando (item 6 do bloco 2).
- **P2: não bloqueia mais o M45**, que foi feito localmente. Bloqueia só o rascunho do release (P94).
