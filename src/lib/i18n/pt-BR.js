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
    // M16: a contagem provisória do cartão de sessão (views/focus/contagem.js),
    // até o cartão de verdade do M17 e do M18.
    provisorio: Object.freeze({
      minutos: Object.freeze([5, 25]),
      iniciar: (m) => `Iniciar ${m} min`,
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
});
