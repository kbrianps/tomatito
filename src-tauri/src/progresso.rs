//! O progresso da fase no ícone do app (v0.4), só no desktop: a barra que o
//! sistema desenha sobre o ícone, na dock do Ubuntu e na barra de tarefas do
//! Windows. Enche do começo ao fim de cada fase (foco ou intervalo), fica
//! parada na pausa e some sem sessão.
//!
//! - **Windows:** a barra de progresso do botão da janela na barra de tarefas
//!   (`set_progress_bar`), na `main` e na janelinha.
//! - **Linux:** o sinal `com.canonical.Unity.LauncherEntry.Update`, que a
//!   Ubuntu Dock (e o Dash to Dock, o Plank, o KDE) escuta, com o
//!   `application://Tomatito.desktop` do pacote. Vai direto pelo D-Bus (o
//!   mesmo zbus do `notify.rs`), sem depender da libunity. Sem o `.desktop`
//!   instalado (o binário de desenvolvimento), ninguém desenha nada.
//!
//! A conta é do retrato do motor (a duração da fase e o que falta dela); a
//! fração só vai ao sistema quando muda de ponto percentual (no máximo 100 vezes por fase).
//! Tudo é postado numa tarefa: o motor está travado quando chama aqui.

use std::sync::{Mutex, PoisonError};

use tauri::AppHandle;

use crate::events::{FocusDto, StatusDto, TickDto};

/// O que o ícone mostra.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Vista {
    Nenhuma,
    Correndo(u8),
    Pausada(u8),
}

#[derive(Debug, Default)]
struct Estado {
    ligado: bool,
    vista: Option<Vista>,
    aplicada: Option<Vista>,
}

/// O ponto percentual decorrido, de 0 a 100.
pub fn percentual(duracao_ms: u64, restante_ms: u64) -> u8 {
    if duracao_ms == 0 {
        return 0;
    }
    let decorrido = duracao_ms.saturating_sub(restante_ms);
    ((decorrido.saturating_mul(100)) / duracao_ms).min(100) as u8
}

impl Estado {
    fn do_foco(&mut self, foco: &FocusDto) {
        let Some(s) = foco.session.as_ref() else {
            self.vista = Some(Vista::Nenhuma);
            return;
        };
        let p = percentual(s.phase.duration_s.saturating_mul(1000), s.remaining_ms);
        self.vista = Some(match foco.status {
            StatusDto::Focus | StatusDto::Break => Vista::Correndo(p),
            StatusDto::Paused => Vista::Pausada(p),
            StatusDto::Idle | StatusDto::Completed => Vista::Nenhuma,
        });
    }

    fn do_tick(&mut self, tick: &TickDto) {
        self.vista = Some(Vista::Correndo(percentual(
            tick.phase.duration_s.saturating_mul(1000),
            tick.remaining_ms,
        )));
    }

    /// A vista a aplicar agora, se mudou.
    fn pendente(&mut self) -> Option<Vista> {
        let nova = if self.ligado {
            self.vista.unwrap_or(Vista::Nenhuma)
        } else {
            Vista::Nenhuma
        };
        if self.aplicada == Some(nova) {
            return None;
        }
        self.aplicada = Some(nova);
        Some(nova)
    }
}

pub struct Progresso {
    app: AppHandle,
    estado: Mutex<Estado>,
    #[cfg(target_os = "linux")]
    conexao: std::sync::Arc<tokio::sync::Mutex<Option<zbus::Connection>>>,
}

impl Progresso {
    pub fn new(app: AppHandle, ligado: bool) -> Self {
        Self {
            app,
            estado: Mutex::new(Estado {
                ligado,
                ..Estado::default()
            }),
            #[cfg(target_os = "linux")]
            conexao: Default::default(),
        }
    }

    /// `tt://state`.
    pub fn foco(&self, foco: &FocusDto) {
        self.mudar(|e| e.do_foco(foco));
    }

    /// `tt://tick`.
    pub fn tick(&self, tick: &TickDto) {
        self.mudar(|e| e.do_tick(tick));
    }

    /// `iconProgress` depois de um `settings_set`.
    pub fn ligar(&self, ligado: bool) {
        self.mudar(|e| e.ligado = ligado);
    }

    fn mudar(&self, f: impl FnOnce(&mut Estado)) {
        let nova = {
            let mut e = self.estado.lock().unwrap_or_else(PoisonError::into_inner);
            f(&mut e);
            e.pendente()
        };
        if let Some(vista) = nova {
            self.aplicar(vista);
        }
    }

    #[cfg(target_os = "linux")]
    fn aplicar(&self, vista: Vista) {
        let conexao = self.conexao.clone();
        let _ = &self.app;
        tauri::async_runtime::spawn(async move {
            let mut guarda = conexao.lock().await;
            if guarda.is_none() {
                match zbus::Connection::session().await {
                    Ok(c) => *guarda = Some(c),
                    Err(e) => {
                        eprintln!("[tomatito] progresso no ícone: sem o D-Bus de sessão: {e}");
                        return;
                    }
                }
            }
            let Some(c) = guarda.as_ref() else { return };
            if let Err(e) = linux::avisar(c, vista).await {
                eprintln!("[tomatito] progresso no ícone não enviado: {e}");
                *guarda = None;
            }
        });
    }

    #[cfg(not(target_os = "linux"))]
    fn aplicar(&self, vista: Vista) {
        use tauri::Manager;
        use tauri::window::{ProgressBarState, ProgressBarStatus};
        let app = self.app.clone();
        tauri::async_runtime::spawn(async move {
            let (status, progress) = match vista {
                Vista::Nenhuma => (ProgressBarStatus::None, 0),
                Vista::Correndo(p) => (ProgressBarStatus::Normal, p),
                Vista::Pausada(p) => (ProgressBarStatus::Paused, p),
            };
            for janela in app.webview_windows().values() {
                let _ = janela.set_progress_bar(ProgressBarState {
                    status: Some(status),
                    progress: Some(u64::from(progress)),
                });
            }
        });
    }
}

#[cfg(target_os = "linux")]
mod linux {
    use std::collections::HashMap;

    use zbus::Connection;
    use zbus::zvariant::Value;

    use super::Vista;

    /// O `.desktop` instalado pelo `.deb` e pelo AppImage de uso diário.
    pub const APP_URI: &str = "application://Tomatito.desktop";
    const CAMINHO: &str = "/io/github/kbrianps/tomatito/launcherentry";
    const INTERFACE: &str = "com.canonical.Unity.LauncherEntry";

    /// As propriedades do sinal `Update` para a vista.
    pub fn propriedades(vista: Vista) -> (f64, bool) {
        match vista {
            Vista::Nenhuma => (0.0, false),
            Vista::Correndo(p) | Vista::Pausada(p) => (f64::from(p) / 100.0, true),
        }
    }

    pub async fn avisar(c: &Connection, vista: Vista) -> zbus::Result<()> {
        let (progresso, visivel) = propriedades(vista);
        let mut props: HashMap<&str, Value<'_>> = HashMap::new();
        props.insert("progress", Value::from(progresso));
        props.insert("progress-visible", Value::from(visivel));
        c.emit_signal(None::<()>, CAMINHO, INTERFACE, "Update", &(APP_URI, props))
            .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn percentual_de_0_a_100() {
        assert_eq!(percentual(0, 0), 0);
        assert_eq!(percentual(1_500_000, 1_500_000), 0);
        assert_eq!(percentual(1_500_000, 750_000), 50);
        assert_eq!(percentual(1_500_000, 14_999), 99);
        assert_eq!(percentual(1_500_000, 0), 100);
        // Um restante maior que a duração (relógio adiantado) não estoura.
        assert_eq!(percentual(1_000, 5_000), 0);
    }

    fn tick(duracao_s: u64, restante_ms: u64) -> TickDto {
        TickDto {
            seq: 1,
            session_id: 7,
            phase_index: 0,
            phase: crate::events::PhaseDto {
                kind: crate::events::PhaseKindDto::Focus,
                n: 1,
                duration_s: duracao_s,
            },
            at: 0,
            ends_at_ms: 0,
            remaining_ms: restante_ms,
        }
    }

    #[test]
    fn so_avisa_quando_o_ponto_percentual_muda_e_recomeca_a_cada_fase() {
        let mut e = Estado {
            ligado: true,
            ..Estado::default()
        };
        e.do_tick(&tick(600, 600_000));
        assert_eq!(e.pendente(), Some(Vista::Correndo(0)));
        e.do_tick(&tick(600, 599_000));
        assert_eq!(e.pendente(), None);
        e.do_tick(&tick(600, 300_000));
        assert_eq!(e.pendente(), Some(Vista::Correndo(50)));
        // Outra fase: a duração é a dela.
        e.do_tick(&tick(120, 120_000));
        assert_eq!(e.pendente(), Some(Vista::Correndo(0)));
        e.do_tick(&tick(120, 30_000));
        assert_eq!(e.pendente(), Some(Vista::Correndo(75)));
    }

    #[test]
    fn desligado_nao_mostra_nada_e_religado_volta_ao_ponto() {
        let mut e = Estado {
            ligado: true,
            ..Estado::default()
        };
        e.do_tick(&tick(100, 100_000));
        e.do_tick(&tick(100, 40_000));
        assert_eq!(e.pendente(), Some(Vista::Correndo(60)));
        e.ligado = false;
        assert_eq!(e.pendente(), Some(Vista::Nenhuma));
        assert_eq!(e.pendente(), None);
        e.ligado = true;
        assert_eq!(e.pendente(), Some(Vista::Correndo(60)));
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn propriedades_do_sinal_da_dock() {
        assert_eq!(linux::propriedades(Vista::Nenhuma), (0.0, false));
        assert_eq!(linux::propriedades(Vista::Correndo(25)), (0.25, true));
        assert_eq!(linux::propriedades(Vista::Pausada(80)), (0.8, true));
        assert_eq!(linux::APP_URI, "application://Tomatito.desktop");
    }
}
