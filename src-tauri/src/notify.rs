//! Notificações do sistema (PLANO.md, 3.1, 3.2 e M21): o fim de cada fase
//! vira uma notificação nativa, mesmo com a janela minimizada ou escondida.
//!
//! Sai sempre do Rust, sem o pacote do JS (3.6): o motor pede o aviso
//! ([`Notice`], só dados), o [`crate::i18n`] escreve o título e o corpo, e a
//! entrega depende do sistema:
//!
//! - **Linux:** uma chamada própria ao `org.freedesktop.Notifications` (o
//!   GNOME Shell), por uma conexão D-Bus de sessão aberta no primeiro aviso e
//!   mantida até o app fechar. O `tauri-plugin-notification` (pelo
//!   `notify-rust`) abre uma conexão por aviso e a fecha logo depois de
//!   mandar; o GNOME Shell vigia quem mandou e, quando essa conexão some,
//!   apaga a fonte do app com todas as notificações dela: o balão piscava e
//!   sumia, e a lista ficava vazia (conferido no teste aninhado;
//!   `docs/decisoes.md`, M21).
//! - **Windows:** o plugin, que mostra um toast (o nome e o ícone certos são
//!   do M49).
//!
//! Regras comuns:
//! - **Sem som próprio.** A notificação não pede som ao sistema: o som é o
//!   do `audio.rs`, que toca mesmo com o "Não perturbe" do GNOME ligado. O
//!   "Não perturbe" só esconde o balão; a notificação fica na lista.
//! - **Não trava o motor.** O motor chama [`Notificador::mostrar`] travado;
//!   a entrega roda numa tarefa do `tauri::async_runtime`. Um erro vira log e
//!   nunca derruba o app.
//! - **Fuso do sistema a cada aviso**, para "Próximo foco às 14:35" sair
//!   certo mesmo depois de uma troca de fuso com o app aberto.

use tauri::AppHandle;
use tomatito_core::{Notice, TimeZone, TimerEnded};

use crate::i18n;

/// Mostra os avisos do motor como notificações do sistema.
pub struct Notificador {
    entrega: Entrega,
}

impl Notificador {
    pub fn new(app: AppHandle) -> Self {
        Self {
            entrega: Entrega::new(app),
        }
    }

    pub fn mostrar(&self, notice: Notice) {
        let texto = i18n::notice(&notice, &TimeZone::system());
        eprintln!(
            "[tomatito] notificação: {} | {}",
            texto.title,
            texto.body.as_deref().unwrap_or("")
        );
        self.entrega.enviar(texto);
    }

    /// M32: o fim de um temporizador, pela mesma entrega.
    pub fn mostrar_temporizador(&self, ended: &TimerEnded) {
        let texto = i18n::timer_ended(ended, &TimeZone::system());
        eprintln!(
            "[tomatito] notificação: {} | {}",
            texto.title,
            texto.body.as_deref().unwrap_or("")
        );
        self.entrega.enviar(texto);
    }
}

#[cfg(target_os = "linux")]
use linux::Entrega;
#[cfg(windows)]
use windows::Entrega;

/// Nos sistemas sem entrega (a v1 é só Linux e Windows), o aviso fica no log.
#[cfg(not(any(target_os = "linux", windows)))]
struct Entrega;

#[cfg(not(any(target_os = "linux", windows)))]
impl Entrega {
    fn new(_app: AppHandle) -> Self {
        Self
    }
    fn enviar(&self, _texto: i18n::NoticeText) {}
}

#[cfg(target_os = "linux")]
mod linux {
    use std::collections::HashMap;
    use std::sync::Arc;

    use tauri::AppHandle;
    use tokio::sync::Mutex;
    use zbus::Connection;
    use zbus::zvariant::Value;

    use crate::i18n::NoticeText;

    const DESTINO: &str = "org.freedesktop.Notifications";
    const CAMINHO: &str = "/org/freedesktop/Notifications";
    /// O nome do `.desktop` instalado pelo `.deb` (3.8: `Tomatito.desktop`),
    /// sem a extensão. O GNOME acha o app primeiro pelo PID (a janela) e,
    /// sem janela, por este nome.
    const DESKTOP_ENTRY: &str = "Tomatito";
    /// O ícone instalado pelo `.deb`, com o nome do binário.
    const ICONE: &str = "tomatito";
    /// Urgência normal (0 é baixa, que o GNOME não mostra em balão).
    const URGENCIA_NORMAL: u8 = 1;

    pub struct Entrega {
        app_name: String,
        /// A conexão de sessão, aberta no primeiro aviso. O cadeado também
        /// põe os avisos em fila, na ordem em que o motor os pediu.
        conexao: Arc<Mutex<Option<Connection>>>,
    }

    impl Entrega {
        pub fn new(app: AppHandle) -> Self {
            let app_name = app
                .config()
                .product_name
                .clone()
                .unwrap_or_else(|| "Tomatito".into());
            Self {
                app_name,
                conexao: Arc::new(Mutex::new(None)),
            }
        }

        pub fn enviar(&self, texto: NoticeText) {
            let conexao = self.conexao.clone();
            let app_name = self.app_name.clone();
            // O `lock` do tokio é justo: as tarefas pegam o cadeado na ordem
            // em que chegaram a ele.
            tauri::async_runtime::spawn(async move {
                let mut guarda = conexao.lock().await;
                // Uma segunda tentativa, com conexão nova, se a antiga caiu
                // (o barramento reiniciou, por exemplo).
                for tentativa in 1..=2 {
                    if guarda.is_none() {
                        match Connection::session().await {
                            Ok(c) => *guarda = Some(c),
                            Err(e) => {
                                eprintln!(
                                    "[tomatito] notificação não saiu: sem o barramento de sessão: {e}"
                                );
                                return;
                            }
                        }
                    }
                    let Some(c) = guarda.as_ref() else { return };
                    match notificar(c, &app_name, &texto).await {
                        Ok(_) => return,
                        Err(e) => {
                            eprintln!(
                                "[tomatito] notificação não saiu (tentativa {tentativa}): {e}"
                            );
                            *guarda = None;
                        }
                    }
                }
            });
        }
    }

    /// O `Notify` da especificação: devolve o id que o servidor deu.
    async fn notificar(c: &Connection, app_name: &str, texto: &NoticeText) -> zbus::Result<u32> {
        let hints: HashMap<&str, Value<'_>> = HashMap::from([
            ("desktop-entry", Value::from(DESKTOP_ENTRY)),
            ("urgency", Value::from(URGENCIA_NORMAL)),
        ]);
        let acoes: Vec<&str> = Vec::new();
        let resposta = c
            .call_method(
                Some(DESTINO),
                CAMINHO,
                Some(DESTINO),
                "Notify",
                &(
                    app_name,
                    0u32, // não substitui nenhuma
                    ICONE,
                    texto.title.as_str(),
                    texto.body.as_deref().unwrap_or(""),
                    acoes,
                    hints,
                    -1i32, // o tempo na tela é o do servidor
                ),
            )
            .await?;
        resposta.body().deserialize::<u32>()
    }
}

#[cfg(windows)]
mod windows {
    use tauri::AppHandle;
    use tauri_plugin_notification::NotificationExt;

    use crate::i18n::NoticeText;

    pub struct Entrega {
        app: AppHandle,
    }

    impl Entrega {
        pub fn new(app: AppHandle) -> Self {
            Self { app }
        }

        /// O plugin monta o toast e o mostra numa tarefa à parte; o erro da
        /// entrega fica com ele, e só o que falhar antes vira log aqui.
        pub fn enviar(&self, texto: NoticeText) {
            let mut builder = self.app.notification().builder().title(&texto.title);
            if let Some(body) = &texto.body {
                builder = builder.body(body);
            }
            if let Err(e) = builder.show() {
                eprintln!("[tomatito] notificação não saiu: {e}");
            }
        }
    }
}
