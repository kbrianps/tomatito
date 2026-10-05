// Catálogo de textos da interface (PLANO.md, 3.8): nenhum texto solto no
// código. Só pt-BR na v1; as chaves ficam estáveis para outro idioma depois.
// Notificações e menus nativos saem do src-tauri/src/i18n.rs.
export default Object.freeze({
  app: Object.freeze({
    nome: 'Tomatito',
  }),
  barraDeTitulo: Object.freeze({
    minimizar: 'Minimizar',
    maximizar: 'Maximizar',
    restaurar: 'Restaurar',
    fechar: 'Fechar',
  }),
  // Painel de navegação (M09). Os nomes das telas servem também de título de
  // cada tela.
  navegacao: Object.freeze({
    rotulo: 'Principal',
    foco: 'Foco',
    temporizador: 'Temporizador',
    cronometro: 'Cronômetro',
    configuracoes: 'Configurações',
  }),
  // Tela Foco (M10: a grade e os títulos dos cartões; o conteúdo de cada um
  // chega no M17, no M27 e no M30). Títulos da seção 2.1 do plano.
  foco: Object.freeze({
    sessao: 'Pronto para focar',
    progresso: 'Progresso diário',
    tarefas: 'Tarefas',
    // M17: o cartão "Pronto para focar" (views/focus/card-session.js). O
    // texto é o da seção 2.1 do plano; ele não promete silenciar as
    // notificações do sistema.
    preparo: Object.freeze({
      texto: 'Escolha a duração. Em sessões longas, o Tomatito intercala intervalos curtos.',
      seletor: 'Duração da sessão',
      aumentar: 'Aumentar',
      diminuir: 'Diminuir',
      unidade: 'min',
      pular: 'Pular intervalos',
      iniciar: 'Iniciar sessão de foco',
      // A frase dos intervalos, por categoria do Intl.PluralRules('pt-BR')
      // (format.js). O zero tem frase própria: em pt-BR, o 0 cai em "one".
      semIntervalos: 'Sem intervalos.',
      intervalos: Object.freeze({
        one: (n) => `Você terá ${n} intervalo.`,
        other: (n) => `Você terá ${n} intervalos.`,
      }),
    }),
    // M18: a sessão em andamento no cartão (views/focus/andamento.js): o
    // cabeçalho, que toma o lugar do título do cartão, o mostrador, os botões
    // redondos, o menu "..." e o rodapé "A seguir".
    andamento: Object.freeze({
      focus: 'Período de foco',
      break: 'Intervalo',
      contagem: (n, total) => `(${n} de ${total})`,
      // M19: o cabeçalho de uma fase pausada ganha " · Pausado".
      pausado: 'Pausado',
      unidade: 'min',
      aSeguir: 'A seguir:',
      proximo: Object.freeze({
        break: (min) => `intervalo de ${min} min`,
        focus: (min) => `foco de ${min} min`,
      }),
      pausar: 'Pausar',
      retomar: 'Retomar',
      mais: 'Mais opções',
      encerrar: 'Encerrar sessão',
      pularIntervalo: 'Pular intervalo',
      // O rótulo do mostrador (role="img"), atualizado uma vez por minuto
      // (PLANO.md, 3.8): "27 minutos restantes, período de foco 1 de 2".
      restantes: Object.freeze({
        one: (n) => `${n} minuto restante`,
        other: (n) => `${n} minutos restantes`,
      }),
      faseNoRotulo: Object.freeze({
        focus: (n, total) => `período de foco ${n} de ${total}`,
        break: (n, total) => `intervalo ${n} de ${total}`,
      }),
    }),
    // M19: o anúncio de cada troca de fase, na região aria-live escondida
    // (lib/a11y.js). Pausar e retomar não são anunciados.
    fases: Object.freeze({
      comecou: Object.freeze({
        focus: (n, total) => `Começou o período de foco ${n} de ${total}.`,
        break: (n, total) => `Começou o intervalo ${n} de ${total}.`,
      }),
      concluida: 'Sessão de foco concluída.',
      encerrada: 'Sessão de foco encerrada.',
    }),
    // M27: o conteúdo do cartão "Progresso diário" (views/focus/card-progress.js):
    // Ontem, o anel com a meta e Esta semana, e o rodapé. "Sequência" virou
    // "Esta semana" (1.1, sem gamificação). As durações vêm do format.js.
    diario: Object.freeze({
      ontem: 'Ontem',
      meta: 'Meta diária',
      semana: 'Esta semana',
      concluido: (texto) => `Concluído: ${texto}`,
      // O rótulo do anel (role="img"): a meta, o que foi feito hoje e a
      // fração da meta, que pode passar de 100% (o anel para no círculo cheio).
      anel: (meta, hoje, pct) => `Meta diária de ${meta}. Concluído hoje: ${hoje}, ${pct}% da meta.`,
      // M28: o lápis do cartão (nome e dica).
      editar: 'Editar meta diária',
    }),
    // M28: o diálogo "Editar meta diária" (views/focus/goal-dialog.js). As
    // metas por extenso, como no cartão ("1 hora e 30 minutos", e não "1 h
    // 30"; docs/decisoes.md, M28).
    metaDiaria: Object.freeze({
      titulo: 'Editar meta diária',
      meta: 'Meta diária',
      zerar: 'Zerar progresso às',
      opcoes: Object.freeze({
        0: 'Desativada',
        30: '30 minutos',
        60: '1 hora',
        90: '1 hora e 30 minutos',
        120: '2 horas',
        180: '3 horas',
        240: '4 horas',
        360: '6 horas',
        480: '8 horas',
      }),
      salvar: 'Salvar',
      cancelar: 'Cancelar',
      erro: 'Não foi possível salvar. Tente de novo.',
    }),
    // M30: o conteúdo do cartão "Tarefas" (views/focus/card-tasks.js). O
    // subtítulo muda na sessão ("Você está focando em"); o estado vazio é o
    // "Mantenha o rumo" do Relógio.
    listaDeTarefas: Object.freeze({
      adicionar: 'Adicionar tarefa',
      mais: 'Mais opções das tarefas',
      escolha: 'Escolha uma tarefa para a sessão',
      focando: 'Você está focando em',
      semTarefa: 'Sessão sem tarefa escolhida',
      vazio: 'Mantenha o rumo',
      vazioTexto: 'Anote o que precisa fazer e escolha uma tarefa para cada sessão.',
      campo: 'Nova tarefa',
      dicaDoCampo: 'Adicionar uma tarefa',
      escolher: 'Escolher para a sessão',
      escolherCurto: 'Escolher',
      escolhida: 'Escolhida',
      apagar: 'Apagar tarefa',
      apagarConcluidas: 'Apagar concluídas',
      erro: 'Não foi possível salvar a tarefa. Tente de novo.',
      longa: 'O título pode ter até 255 caracteres.',
    }),
  }),
  // M32: a tela Temporizador (views/timers.js). "Encerrado há" fica acima
  // do tempo negativo em todos os temas (PLANO.md, 4.2): no Lite, é ele que
  // distingue o estado, e não a cor.
  temporizador: Object.freeze({
    encerradoHa: 'Encerrado há',
    iniciar: 'Iniciar',
    pausar: 'Pausar',
    retomar: 'Retomar',
    redefinir: 'Redefinir',
    // M33: a barra do canto inferior direito (lápis e "+"), os botões de
    // cada card no modo de edição e a lista vazia.
    barra: 'Ações dos temporizadores',
    editarLista: 'Editar temporizadores',
    concluido: 'Concluído',
    adicionar: 'Adicionar temporizador',
    editar: 'Editar',
    excluir: 'Excluir',
    vazio: 'Nenhum temporizador. Use o botão Adicionar temporizador, no canto inferior direito.',
    // M33: o diálogo de adicionar e editar (views/timer-dialog.js).
    dialogo: Object.freeze({
      novo: 'Adicionar temporizador',
      editar: 'Editar temporizador',
      duracao: 'Duração',
      horas: 'Horas',
      minutos: 'Minutos',
      segundos: 'Segundos',
      mais: (campo) => `Aumentar ${campo.toLowerCase()}`,
      menos: (campo) => `Diminuir ${campo.toLowerCase()}`,
      nome: 'Nome do temporizador',
      salvar: 'Salvar',
      cancelar: 'Cancelar',
      zero: 'Escolha uma duração de pelo menos 1 segundo.',
      longo: 'O nome pode ter até 255 caracteres.',
      erro: 'Não foi possível salvar o temporizador. Tente de novo.',
    }),
    // A duração curta do título sem nome (format.js, duracaoCurta).
    unidades: Object.freeze({ h: 'h', min: 'min', s: 's' }),
    // O rótulo do anel (role="img"), uma vez por minuto (PLANO.md, 3.8).
    anel: Object.freeze({
      parado: 'Parado',
      restantes: Object.freeze({
        one: (n) => `${n} minuto restante`,
        other: (n) => `${n} minutos restantes`,
      }),
      pausado: (resto) => `Pausado, ${resto}`,
      encerrado: Object.freeze({
        one: (n) => `Encerrado há ${n} minuto`,
        other: (n) => `Encerrado há ${n} minutos`,
      }),
    }),
  }),
  // M34: a tela Cronômetro (views/stopwatch.js). As unidades embaixo dos
  // números são as do Relógio ("hr", "min", "sec"), em pt-BR.
  cronometro: Object.freeze({
    iniciar: 'Iniciar',
    pausar: 'Pausar',
    retomar: 'Retomar',
    volta: 'Marcar volta',
    redefinir: 'Redefinir',
    unidades: Object.freeze({ h: 'h', min: 'min', s: 's' }),
    // O rótulo do número (role="img"): muda ao trocar de estado e, correndo,
    // uma vez por minuto (PLANO.md, 3.8). Pausado, o tempo exato, que não muda.
    rotulo: Object.freeze({
      zerado: 'Cronômetro zerado',
      correndo: Object.freeze({
        one: (n) => `Cronômetro correndo, ${n} minuto`,
        other: (n) => `Cronômetro correndo, ${n} minutos`,
      }),
      pausado: (tempo) => `Cronômetro pausado em ${tempo}`,
    }),
    // M35: a lista de voltas, com as colunas do Relógio ("Laps", "Time",
    // "Total"). O cabeçalho também vai na primeira linha do "Copiar".
    voltas: Object.freeze({
      titulo: 'Voltas',
      volta: 'Volta',
      tempo: 'Tempo',
      total: 'Total',
      copiar: 'Copiar',
      copiado: 'Voltas copiadas',
      falhou: 'Não foi possível copiar as voltas',
    }),
  }),
  // Tela Configurações. M24: a seção Aparência (views/settings.js), com o
  // cartão do tema, como o SettingsCard do Relógio (ícone, título e
  // descrição) e as opções da 4.1. "Tomatito Suave" é nome provisório (1.2).
  // O Full só entra na lista no M51.
  // M38: a seção "Sessões de foco", com os cartões expansíveis do Relógio
  // (clock-focus-sessions-settings.png): os períodos, os dois sons e o volume.
  configuracoes: Object.freeze({
    sessoes: 'Sessões de foco',
    periodos: Object.freeze({
      titulo: 'Períodos de foco',
      descricao: 'Ajuste a duração dos períodos de foco e dos intervalos. Vale a partir da próxima sessão.',
      foco: 'Período de foco',
      intervalo: 'Intervalo',
    }),
    somFoco: Object.freeze({
      titulo: 'Som de fim de foco',
      descricao: 'Tocar um aviso quando o período de foco termina.',
      som: 'Duas notas',
      testar: 'Testar o som de fim de foco',
    }),
    somIntervalo: Object.freeze({
      titulo: 'Som de fim de intervalo',
      descricao: 'Tocar um aviso quando o intervalo termina.',
      som: 'Uma nota',
      testar: 'Testar o som de fim de intervalo',
    }),
    // O texto ao lado do switch, como o OnContent e o OffContent do
    // ToggleSwitch do WinUI.
    ativado: 'Ativado',
    desativado: 'Desativado',
    somDoAviso: 'Som do aviso',
    testar: 'Testar',
    volume: Object.freeze({
      titulo: 'Volume',
      descricao: 'Volume dos avisos sonoros.',
      valor: (n) => `${n}%`,
    }),
    erro: 'Não foi possível salvar a configuração. Tente de novo.',
    aparencia: 'Aparência',
    tema: 'Tema do aplicativo',
    temaDescricao: 'Escolha as cores do Tomatito.',
    temas: Object.freeze({
      lite: 'Tomatito Lite',
      suave: 'Tomatito Suave',
      light: 'Claro',
      dark: 'Escuro',
      system: 'Usar configuração do sistema',
      full: 'Tomatito Full',
    }),
    // M39: a seção "Sistema" (fechar para a bandeja, tempo na bandeja e
    // "Sair do Tomatito", 2.1) e o Sobre, como o expansível "Sobre" dos apps
    // do WinUI: o nome, a licença e a versão no cabeçalho; dentro, os avisos
    // de terceiros (o botão funciona a partir do M46) e o aviso de marcas da
    // seção 9 do plano.
    sistema: 'Sistema',
    // A13 (PLANO-ANDROID 4.3): o cartão "Avisos", só no Android
    // (views/avisos-android.js). A permissão de notificação e, sem alarme
    // exato (Android 12/12L), o aviso de atraso.
    notificacoes: Object.freeze({
      secao: 'Avisos',
      titulo: 'Avisos do sistema',
      estados: Object.freeze({
        granted: 'Permitidos. O fim de cada fase aparece mesmo com o Tomatito fechado.',
        denied: 'Bloqueados. O fim das fases não aparece fora do Tomatito.',
        prompt: 'Ainda não permitidos. O pedido aparece no primeiro início de uma sessão.',
        // `prompt` depois de o pedido já ter saído uma vez (recusado ou revogado).
        recusado: 'Ainda não permitidos. O fim das fases não aparece fora do Tomatito.',
      }),
      permitir: 'Permitir avisos',
      abrir: 'Abrir configurações de avisos do sistema',
      atrasar: 'Os avisos podem atrasar alguns minutos, porque o sistema não permite alarmes exatos para o Tomatito.',
      // A faixa discreta da tela Foco quando os avisos estão bloqueados.
      faixa: Object.freeze({
        texto: 'Os avisos estão bloqueados: o fim das fases não aparece com o Tomatito fechado.',
        permitir: 'Permitir avisos',
      }),
    }),
    fecharParaBandeja: Object.freeze({
      titulo: 'Fechar para a bandeja',
      descricao: 'Fechar a janela só a esconde: a sessão de foco e os temporizadores continuam.',
    }),
    tempoNaBandeja: Object.freeze({
      titulo: 'Tempo na bandeja',
      descricao: 'Mostrar no ícone da bandeja quantos minutos faltam da sessão de foco.',
    }),
    sair: Object.freeze({
      titulo: 'Sair do Tomatito',
      descricao: 'Encerrar a sessão de foco e fechar o aplicativo.',
      botao: 'Sair',
    }),
    sobre: Object.freeze({
      secao: 'Sobre',
      licenca: '© 2026 kbrianps · Licença MIT',
      versao: (v) => `Versão ${v}`,
      avisos: 'Avisos de terceiros',
      verAvisos: 'Ver avisos',
      // M46: a licença da fonte embutida, ao lado dos avisos, e o diálogo que
      // mostra os dois arquivos do pacote (views/notices-dialog.js).
      fonte: 'Licença da fonte Inter',
      verLicenca: 'Ver licença',
      // A23: a política de privacidade (o site da versão web); no Android abre
      // no navegador, e na web é um link.
      privacidade: 'Política de privacidade',
      verPolitica: 'Abrir',
      dialogo: Object.freeze({
        titulos: Object.freeze({
          avisos: 'Avisos de terceiros',
          ofl: 'Licença da fonte Inter',
        }),
        carregando: 'Carregando…',
        erro: 'Não foi possível abrir o arquivo, que deveria vir junto com o aplicativo.',
        fechar: 'Fechar',
      }),
      marcas: 'Interface inspirada no Fluent Design. Windows e Segoe são marcas da Microsoft. O Tomatito não é afiliado à Microsoft.',
      // W18: o Sobre da versão web (PLANO-WEB, 4; PLANO-WEB-V1, 7): o nome e
      // as duas linhas das limitações honestas, antes dos avisos.
      web: Object.freeze({
        nome: 'Tomatito para a web',
        umaAba: 'Use o Tomatito numa aba só.',
        dados: 'Os dados ficam só neste navegador, neste aparelho. Limpar os dados do site apaga as estatísticas e as tarefas.',
      }),
    }),
    // W18: a seção "Navegador" da versão web (views/navegador-web.js;
    // PLANO-WEB, 4): o tempo no título da aba e o convite de instalação.
    // Sem atalhos no texto do Instalar: na web eles ficam desligados
    // (PLANO-WEB-V1, 2.2 e 7).
    navegador: Object.freeze({
      secao: 'Navegador',
      tempoNaAba: Object.freeze({
        titulo: 'Tempo na aba',
        descricao: 'Mostrar os minutos restantes no título da aba.',
      }),
      instalar: Object.freeze({
        titulo: 'Instalar o Tomatito',
        descricao: 'Abre numa janela própria, fora das abas do navegador.',
        botao: 'Instalar',
      }),
    }),
    // W14: a seção Avisos da versão web (views/avisos-web.js; PLANO-WEB, 4 e
    // 5; PLANO-WEB-V1, 7), com os quatro estados da permissão e o rodapé.
    avisos: Object.freeze({
      secao: 'Avisos',
      titulo: 'Notificações',
      estados: Object.freeze({
        default: 'Mostrar um aviso quando o foco ou o intervalo terminar.',
        granted: 'Ativadas neste navegador.',
        denied: 'Bloqueadas neste navegador. Para ativar, abra as permissões do site (o ícone à esquerda do endereço).',
        'sem-suporte': 'Neste navegador não há notificações.',
      }),
      permitir: 'Permitir avisos',
      testar: 'Testar aviso',
      iphone: 'No iPhone e no iPad, os avisos só funcionam com o Tomatito na Tela de Início.',
      abaAberta: 'No navegador, o aviso depende de a aba continuar aberta.',
      celular:
        'No celular, com a tela apagada ou outro app aberto, o navegador pode segurar o aviso até você voltar ao Tomatito. A contagem não atrasa.',
      // O aviso do "Testar aviso".
      teste: Object.freeze({
        titulo: 'Tomatito',
        corpo: 'Os avisos estão ativados neste navegador.',
      }),
    }),
    // W16: o cartão da atualização da versão web (views/atualizar-web.js;
    // PLANO-WEB, 3.8). Só aparece com uma versão nova já baixada.
    atualizar: Object.freeze({
      secao: 'Atualização',
      titulo: 'Nova versão disponível',
      pronta: 'Já baixada. Ao atualizar, a página recarrega.',
      correndo: 'Já baixada. Para atualizar, encerre a sessão e os temporizadores em andamento.',
      botao: 'Atualizar',
    }),
    // M57: a opção avançada do plano B2 (views/opcao-x11.js).
    avancado: 'Avançado',
    x11: Object.freeze({
      titulo: 'Compatibilidade X11',
      descricao:
        'Abre o Tomatito pelo Xwayland, para o tomate poder ficar sempre na frente. Com escala fracionária, o texto pode ficar borrado.',
      proximoInicio: 'Vale a partir do próximo início do Tomatito.',
      reiniciar: 'Reiniciar agora',
      semXwayland: 'Esta sessão não tem Xwayland, e a opção fica sem efeito.',
    }),
  }),
  // W14: o InfoBar da versão web, no cartão de sessão, depois do primeiro
  // "Iniciar sessão de foco" com a permissão ainda não pedida
  // (views/focus/pedido-de-avisos.js; PLANO-WEB, 4).
  pedidoDeAvisos: Object.freeze({
    titulo: 'Aviso no fim de cada período?',
    texto: 'O navegador pode mostrar uma notificação quando o foco ou o intervalo terminar.',
    permitir: 'Permitir avisos',
    agoraNao: 'Agora não',
    bloqueados: 'Avisos bloqueados neste navegador. Dá para mudar nas permissões do site.',
    fechar: 'Fechar',
  }),
  // Unidades por extenso, por categoria do Intl.PluralRules('pt-BR')
  // (format.js): o aria-valuetext do seletor de minutos ("25 minutos").
  unidades: Object.freeze({
    minutos: Object.freeze({ one: (n) => `${n} minuto`, other: (n) => `${n} minutos` }),
    // M27: só a palavra, para o cartão "Progresso diário", que empilha o
    // número e a unidade (format.js, `duracao`).
    palavras: Object.freeze({
      minutos: Object.freeze({ one: 'minuto', other: 'minutos' }),
      horas: Object.freeze({ one: 'hora', other: 'horas' }),
    }),
  }),
  // M50: o tomate do Tomatito Full (src/tomato.js; PLANO.md, 5.10). O rótulo
  // do estado vai em caixa alta pelo CSS. A contagem usa o vocabulário da tela
  // Foco (foco.andamento: "Período de foco (1 de 2)", "A seguir: foco de 25
  // min"), e não o "Sessão 2 de 4" do protótipo; os botões de sessão reusam os
  // textos de lá (Iniciar sessão de foco, Pausar, Retomar, Encerrar sessão).
  tomate: Object.freeze({
    // Curtos: o rótulo fica entre os dois botões dos ombros, e a 240 px cabem
    // uns 9 caracteres (o "Intervalo" do protótipo).
    estados: Object.freeze({
      idle: 'Pronto',
      focus: 'Foco',
      break: 'Intervalo',
      paused: 'Pausado',
      completed: 'Concluída',
    }),
    // Ocioso e concluída: a duração da sessão ("Sessão de 30 min").
    sessaoDe: (min) => `Sessão de ${min} min`,
    voltar: 'Voltar ao modo normal',
    configuracoes: 'Configurações',
    // "Pular" leva à próxima fase; na última (ou sem sessão), fica desabilitado.
    pular: Object.freeze({
      break: 'Pular para o intervalo',
      focus: 'Pular para o foco',
      nenhum: 'Pular',
    }),
    // O rótulo do tempo (role="timer"), uma vez por minuto (3.8), com os
    // plurais de foco.andamento.restantes: "18 minutos restantes".
    pausadoNoRotulo: (restantes) => `${restantes}, pausado`,
    // M56: o menu nativo do botão direito (5.10), com os mesmos textos dos
    // botões para as ações do foco (vêm da vista, lib/tomate.js).
    menu: Object.freeze({
      tamanho: 'Tamanho',
      tamanhos: Object.freeze({ 240: 'Pequeno', 280: 'Médio', 320: 'Grande' }),
      // Só no Windows e no X11; no Wayland, a dica abaixo.
      sempreNaFrente: 'Sempre na frente',
      minimizar: 'Minimizar',
      fechar: 'Fechar',
    }),
    // M56: no Wayland, mostrada uma vez, nas Configurações (5.7), com o
    // Full ativo. O nome do item é o do GNOME em pt-BR.
    dicaSempreNaFrente:
      'No GNOME, use Alt+Espaço → Sempre na frente das outras janelas para manter o tomate por cima',
    // M52: a validação com reversão (5.9), na janela principal, no padrão da
    // troca de resolução de tela; e, depois de voltar, a oferta do modo opaco
    // (o plano B3).
    validacao: Object.freeze({
      titulo: 'O tomate aparece com o fundo transparente?',
      explicacao: 'Se ele aparece dentro de um quadrado preto, branco ou vazio, escolha Reverter.',
      prazo: (s) => `Voltando ao tema anterior em ${s} ${s === 1 ? 'segundo' : 'segundos'}.`,
      manter: 'Manter',
      reverter: 'Reverter',
      opacoTitulo: 'Usar o modo opaco?',
      revertida: Object.freeze({
        timeout: 'Sem resposta, o Tomatito voltou ao tema anterior.',
        revert: 'O Tomatito voltou ao tema anterior.',
      }),
      opacoExplicacao: 'No modo opaco, o tomate aparece dentro de um quadrado escuro e não depende da transparência.',
      usarOpaco: 'Usar o modo opaco',
      agoraNao: 'Agora não',
    }),
  }),
});
