//! Controle pela barra do sistema (v0.5), no desktop: as ações do foco que o
//! sistema oferece no clique direito sobre o ícone do app.
//!
//! - **Linux:** as ações do `.desktop` (`Actions=`), que a dock do Ubuntu
//!   mostra no menu do ícone (`packaging/linux/tomatito.desktop`);
//! - **Windows:** as tarefas da lista de atalhos da barra de tarefas
//!   (`acoes_windows.rs`).
//!
//! Nos dois, cada item abre o Tomatito com `--acao=<nome>`. Com o app já
//! aberto, o `single-instance` entrega os argumentos à instância que roda, e
//! ela executa a ação sem mexer nas janelas; fechado, o app abre e executa.
//! A bandeja (`tray.rs`) continua com o "Iniciar foco" de sempre.

use tauri::{AppHandle, Manager};

use crate::commands::AppEngine;

/// Uma ação pedida pela linha de comando.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Acao {
    /// Iniciar, pausar ou retomar, conforme o estado (o item da bandeja).
    Alternar,
    /// Pular para a próxima fase.
    Pular,
    /// Encerrar a sessão.
    Encerrar,
}

/// O prefixo do argumento: `--acao=alternar`.
pub const ARGUMENTO: &str = "--acao=";

impl Acao {
    pub const TODAS: [Acao; 3] = [Acao::Alternar, Acao::Pular, Acao::Encerrar];

    /// O nome no argumento e no `.desktop`.
    pub fn nome(self) -> &'static str {
        match self {
            Acao::Alternar => "alternar",
            Acao::Pular => "pular",
            Acao::Encerrar => "encerrar",
        }
    }

    /// O texto do item no menu do sistema (o mesmo do `.desktop`).
    #[cfg_attr(not(windows), allow(dead_code))]
    pub fn rotulo(self) -> &'static str {
        match self {
            Acao::Alternar => "Iniciar ou pausar foco",
            Acao::Pular => "Pular fase",
            Acao::Encerrar => "Encerrar sessão",
        }
    }

    /// O argumento inteiro: `--acao=pular`.
    #[cfg_attr(not(windows), allow(dead_code))]
    pub fn argumento(self) -> String {
        format!("{ARGUMENTO}{}", self.nome())
    }
}

/// A ação pedida nos argumentos, se houver (a primeira que valer).
pub fn dos_argumentos<S: AsRef<str>>(argv: &[S]) -> Option<Acao> {
    argv.iter().find_map(|a| {
        let nome = a.as_ref().strip_prefix(ARGUMENTO)?;
        Acao::TODAS.into_iter().find(|acao| acao.nome() == nome)
    })
}

/// Executa a ação no motor. Um pedido que não cabe no estado (pular sem
/// sessão, por exemplo) só vai para o registro.
pub fn executar(app: &AppHandle, acao: Acao) {
    let r = match acao {
        Acao::Alternar => {
            crate::tray::alternar_foco(app);
            return;
        }
        Acao::Pular => app.try_state::<AppEngine>().map(|m| m.skip()),
        Acao::Encerrar => app.try_state::<AppEngine>().map(|m| m.stop()),
    };
    if let Some(Err(e)) = r {
        eprintln!("[tomatito] ação {}: {e:?}", acao.nome());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn argumentos_reconhecidos_e_o_resto_ignorado() {
        assert_eq!(dos_argumentos(&["tomatito"]), None);
        assert_eq!(
            dos_argumentos(&["tomatito", "--acao=alternar"]),
            Some(Acao::Alternar)
        );
        assert_eq!(
            dos_argumentos(&["/usr/bin/tomatito", "--outra", "--acao=pular"]),
            Some(Acao::Pular)
        );
        assert_eq!(
            dos_argumentos(&["tomatito", "--acao=encerrar"]),
            Some(Acao::Encerrar)
        );
        assert_eq!(dos_argumentos(&["tomatito", "--acao=apagar-tudo"]), None);
        assert_eq!(dos_argumentos(&["tomatito", "--acao"]), None);
        assert_eq!(dos_argumentos::<&str>(&[]), None);
    }

    /// O `.desktop` do pacote oferece as mesmas ações, com os mesmos textos.
    #[test]
    fn o_desktop_do_pacote_tem_as_mesmas_acoes() {
        let modelo = include_str!("../../packaging/linux/tomatito.desktop");
        let nomes: Vec<_> = Acao::TODAS.iter().map(|a| a.nome()).collect();
        assert!(modelo.contains(&format!("Actions={};", nomes.join(";"))));
        for acao in Acao::TODAS {
            assert!(modelo.contains(&format!(
                "[Desktop Action {}]\nName={}\nExec={{{{exec}}}} {}\n",
                acao.nome(),
                acao.rotulo(),
                acao.argumento()
            )));
        }
    }

    #[test]
    fn cada_acao_tem_nome_rotulo_e_argumento() {
        for acao in Acao::TODAS {
            assert_eq!(
                dos_argumentos(&["tomatito".to_string(), acao.argumento()]),
                Some(acao)
            );
            assert!(!acao.rotulo().is_empty());
        }
        assert_eq!(Acao::Alternar.argumento(), "--acao=alternar");
    }
}
