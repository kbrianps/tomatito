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
  }),
  // Tela Configurações. M24: a seção Aparência (views/settings.js), com o
  // cartão do tema, como o SettingsCard do Relógio (ícone, título e
  // descrição) e as opções da 4.1. "Tomatito Suave" é nome provisório (1.2).
  // O Full só entra na lista no M51.
  configuracoes: Object.freeze({
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
});
