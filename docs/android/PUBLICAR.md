# Publicar o Tomatito na Play Store

Passo a passo curto. Faça um bloco por vez; cada bloco leva de 10 a 20 minutos. Tudo o que você precisa colar está em `docs/android/play/`.

**Antes de começar**

- O pacote: `/opt/cargo-target/android/saidas/tomatito-android/app/outputs/bundle/universalRelease/app-universal-release.aab` (versão e SHA-256 em `docs/android/versoes.md`).
- A chave de upload já está guardada num gerenciador de senhas? (`docs/android/versoes.md`, "A chave de upload".) Se não, faça isso primeiro.

---

## Bloco 0: conferir antes do teste interno

1. [ ] **Aparelho verificado.** Contas novas precisam verificar um aparelho Android pelo app "Play Console" (da Play Store) no celular. Abra o app e veja se há algum aviso pendente.
2. [ ] **Verificação de desenvolvedor.** No Console, abra "Verificação de desenvolvedor Android" e veja se o nome do pacote `io.github.kbrianps.tomatito` aparece como registrado. Apps da própria Play são registrados sozinhos; é só conferir.
3. [ ] **E-mail público.** Decida o e-mail de contato que vai aparecer na loja.

## Bloco 1: criar o app

1. [ ] Play Console → **Criar app**.
2. [ ] Nome: `Tomatito: timer de foco`. Idioma padrão: **Português (Brasil)**. Tipo: **App**. Preço: **Gratuito**.
3. [ ] Marque as duas declarações e crie.

## Bloco 2: ficha da loja

Console → Presença na loja → **Ficha principal da loja**.

1. [ ] Cole o nome, a descrição curta e a completa de `docs/android/play/ficha.md`.
2. [ ] Ícone: `docs/android/play/icone-512.png`.
3. [ ] Gráfico de destaque: `docs/android/play/destaque-1024x500.png`.
4. [ ] Capturas de tela do telefone: os seis arquivos de `docs/android/play/capturas/`, na ordem.
5. [ ] Em **Configurações da loja**: categoria **Produtividade**, o e-mail de contato e o site `https://tomatito.kbrianps.workers.dev`.
6. [ ] Salve.

## Bloco 3: formulários

Console → Política e programas → **Conteúdo do app**. As respostas estão prontas em `docs/android/play/formularios.md`, uma seção por formulário.

1. [ ] Política de privacidade.
2. [ ] Acesso ao app.
3. [ ] Anúncios.
4. [ ] Classificação do conteúdo.
5. [ ] Público-alvo.
6. [ ] Segurança dos dados.
7. [ ] Apps governamentais, financeiros, de saúde e de notícias.

## Bloco 4: teste interno (para você ver o app no seu celular)

1. [ ] Console → Testar e lançar → Teste → **Teste interno** → Criar nova versão.
2. [ ] Aceite o **Play App Signing** (a Play guarda a chave definitiva do app).
3. [ ] Envie o arquivo `.aab` do caminho lá de cima.
4. [ ] Nome da versão: `0.2.0`. Notas: "Primeira versão."
5. [ ] Em **Testadores**, crie uma lista com o seu próprio e-mail.
6. [ ] Salve, revise e **inicie o lançamento** para o teste interno.
7. [ ] Abra o link de participação no seu celular e instale.
8. [ ] No celular: inicie um foco, apague a tela e veja se o aviso chega na hora.
9. [ ] Anote em `docs/android/versoes.md`: troque "não enviado" por "teste interno" e a data.

Se o Console pedir a **declaração de alarme exato**, o texto está em `formularios.md`.

## Bloco 5: teste fechado (os 12 testadores)

A conta é pessoal e nova: o Google exige **12 testadores inscritos por 14 dias seguidos** antes de liberar a produção.

1. [ ] Junte os e-mails Google de pelo menos 12 pessoas (vale chamar 15, para ter folga).
2. [ ] Console → Testar e lançar → Teste → **Teste fechado** → crie uma faixa (ou use a "Alpha").
3. [ ] Em **Testadores**, crie uma lista com os e-mails.
4. [ ] Crie a versão: **promova a do teste interno** (não precisa enviar o arquivo de novo).
5. [ ] Envie para revisão. A primeira revisão pode levar alguns dias.
6. [ ] Quando aprovar, copie o **link de participação** e mande o convite: o texto está em `docs/android/play/convite-testadores.txt` (troque a linha do link).
7. [ ] Acompanhe em "Teste fechado → Testadores" quantos já entraram. Os 14 dias contam com **12 inscritos ao mesmo tempo**.

**Calendário:** anote aqui o dia em que o 12º entrou: ____/____. Dia de pedir a produção: 14 dias depois.

## Bloco 6: pedir a produção

1. [ ] Depois dos 14 dias, no painel do app aparece **Solicitar acesso à produção**.
2. [ ] Respostas sugeridas:
   - *Como você recrutou os testadores?* "Amigos, familiares e colegas de faculdade, convidados por mensagem."
   - *O que os testadores fizeram?* "Usaram o timer de foco, os temporizadores e o cronômetro no dia a dia e relataram o que acharam."
   - *Que mudanças você fez com base no teste?* Conte o que de fato mudou; se nada mudou, diga que não houve defeitos relatados.
   - *Como você sabe que o app está pronto?* "O app passou em testes automatizados em emulador (Android 12 e 17, inclusive com tela bloqueada e modo de economia) e foi usado por 14 dias pelos testadores sem falhas."
3. [ ] Envie. A resposta costuma levar até 7 dias.
4. [ ] Aprovado: Console → **Produção** → Criar versão → promova a do teste fechado → lance.
5. [ ] Atualize `docs/android/versoes.md` (trilha "produção" e a data).

---

## Se algo der errado

- **Declaração de alarme exato recusada:** me avise; há um plano B pronto (`formularios.md`).
- **Pacote recusado por versão repetida:** rode `node scripts/android/versao.mjs`; cada envio novo precisa de uma versão maior.
- **Perdeu a chave de upload:** no Console, "Integridade do app → Assinatura do app → Solicitar redefinição da chave de upload".
- **Atualização futura:** aumente a versão no `Cargo.toml` e no `tauri.android.conf.json`, gere o pacote (`docs/android/versoes.md`, "Como gerar") e envie para a faixa que quiser.
