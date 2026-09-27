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
    // M16: a contagem provisória do cartão de sessão (views/focus/contagem.js),
    // que o cartão mostra durante a sessão até o mostrador do M18. O iniciar
    // passou para o preparo (M17).
    provisorio: Object.freeze({
      pausar: 'Pausar',
      retomar: 'Retomar',
      pular: 'Pular',
      parar: 'Encerrar',
      ocioso: 'Nenhuma sessão em andamento',
      concluida: 'Sessão concluída',
      focus: (n, total) => `Período de foco ${n} de ${total}`,
      break: (n, total) => `Intervalo ${n} de ${total}`,
      pausado: (fase) => `Pausado: ${fase}`,
    }),
  }),
  // Unidades por extenso, por categoria do Intl.PluralRules('pt-BR')
  // (format.js): o aria-valuetext do seletor de minutos ("25 minutos").
  unidades: Object.freeze({
    minutos: Object.freeze({ one: (n) => `${n} minuto`, other: (n) => `${n} minutos` }),
  }),
});
