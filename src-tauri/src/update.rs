//! A atualização por dentro do app (v0.3), só no desktop.
//!
//! O Tomatito não fala com a internet sozinho. Ele só consulta o release do
//! GitHub quando a pessoa clica em "Procurar atualizações" ou liga a opção
//! `autoUpdate` ("Procurar ao abrir", desligada por padrão). A consulta lê o
//! `latest.json` do último release publicado (o endereço e a chave pública
//! estão no `tauri.conf.json`, em `plugins.updater`); a instalação baixa o
//! instalador do mesmo release e confere a assinatura antes de usar.
//!
//! O que dá para atualizar depende de como o app foi instalado (o
//! `bundle_type` que o Tauri grava no binário): o `.exe` e o `.msi` no
//! Windows, o AppImage e o `.deb` no Linux. Um binário solto (`cargo run`,
//! `tauri build --no-bundle`) não tem instalador: os comandos respondem
//! `available: false` e a tela não mostra o cartão.
//!
//! Quem instalou o `.deb` também recebe as versões novas pelo atualizador do
//! sistema: o pacote leva a fonte do APT (docs/atualizacoes.md).
//!
//! No Android não há nada disto: quem atualiza é a Play.

use serde::Serialize;

/// Resposta do `update_info`: se este app sabe se atualizar e por qual
/// instalador (`"appimage"`, `"deb"`, `"nsis"`, `"msi"`).
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub available: bool,
    pub channel: Option<&'static str>,
    /// A versão que a última procura achou e ainda não foi instalada.
    pub pending: Option<String>,
}

/// Resposta do `update_check`: a versão em uso e, se houver, a nova.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheck {
    pub current: String,
    /// `None`: o app está na última versão.
    pub version: Option<String>,
}

/// Erro dos comandos: `{ code, message }`. `code` é `"unavailable"` (sem
/// instalador), `"network"` (a consulta ou o download falhou) ou `"install"`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateError {
    pub code: &'static str,
    pub message: String,
}

/// Evento do download: `{ downloaded, total }`, em bytes (`total` nulo se o
/// servidor não disse o tamanho).
pub const EVENTO_PROGRESSO: &str = "tt://update-progress";
/// Evento da procura ao abrir, quando acha uma versão: `{ version }`.
pub const EVENTO_DISPONIVEL: &str = "tt://update-available";

#[cfg(desktop)]
mod desktop {
    use std::sync::Mutex;
    use std::time::Duration;

    use serde::Serialize;
    use tauri::utils::config::BundleType;
    use tauri::utils::platform::bundle_type;
    use tauri::{AppHandle, Emitter, Manager, State};
    use tauri_plugin_updater::{Update, UpdaterExt};

    use super::{EVENTO_DISPONIVEL, EVENTO_PROGRESSO, UpdateCheck, UpdateError, UpdateInfo};
    use crate::i18n::NoticeText;
    use crate::notify::Notificador;

    /// A espera da procura ao abrir: o app sobe primeiro.
    const ESPERA_AO_ABRIR: Duration = Duration::from_secs(8);
    /// O limite da consulta ao `latest.json`.
    const LIMITE_DA_CONSULTA: Duration = Duration::from_secs(20);

    /// O que fica guardado entre a procura e a instalação, e o notificador
    /// da procura ao abrir (no Linux, a conexão dele precisa durar o app).
    pub struct Atualizador {
        pendente: Mutex<Option<Update>>,
        instalando: Mutex<bool>,
        notificador: Notificador,
    }

    impl Atualizador {
        pub fn new(app: AppHandle) -> Self {
            Self {
                pendente: Mutex::new(None),
                instalando: Mutex::new(false),
                notificador: Notificador::new(app),
            }
        }
    }

    #[derive(Clone, Serialize)]
    struct Progresso {
        downloaded: u64,
        total: Option<u64>,
    }

    #[derive(Clone, Serialize)]
    struct Disponivel {
        version: String,
    }

    /// O instalador deste binário, pelo nome que o `latest.json` usa.
    pub fn canal() -> Option<&'static str> {
        match bundle_type()? {
            BundleType::AppImage => Some("appimage"),
            BundleType::Deb => Some("deb"),
            BundleType::Nsis => Some("nsis"),
            BundleType::Msi => Some("msi"),
            _ => None,
        }
    }

    fn erro(code: &'static str, e: impl std::fmt::Display) -> UpdateError {
        UpdateError {
            code,
            message: e.to_string(),
        }
    }

    fn sem_instalador() -> UpdateError {
        erro("unavailable", "este binário não veio de um instalador")
    }

    /// Consulta o release e guarda a atualização achada (ou limpa a antiga).
    async fn procurar(app: &AppHandle) -> Result<UpdateCheck, UpdateError> {
        if canal().is_none() {
            return Err(sem_instalador());
        }
        let current = app.package_info().version.to_string();
        let achada = app
            .updater_builder()
            .timeout(LIMITE_DA_CONSULTA)
            .build()
            .map_err(|e| erro("network", e))?
            .check()
            .await
            .map_err(|e| erro("network", e))?;
        let version = achada.as_ref().map(|u| u.version.clone());
        eprintln!(
            "[tomatito] atualização: em uso {current}, no release {}",
            version.as_deref().unwrap_or("a mesma")
        );
        if let Ok(mut pendente) = app.state::<Atualizador>().pendente.lock() {
            *pendente = achada;
        }
        Ok(UpdateCheck { current, version })
    }

    #[tauri::command]
    pub fn update_info(estado: State<'_, Atualizador>) -> UpdateInfo {
        let channel = canal();
        let pending = estado
            .pendente
            .lock()
            .ok()
            .and_then(|p| p.as_ref().map(|u| u.version.clone()));
        UpdateInfo {
            available: channel.is_some(),
            channel,
            pending,
        }
    }

    #[tauri::command]
    pub async fn update_check(app: AppHandle) -> Result<UpdateCheck, UpdateError> {
        procurar(&app).await
    }

    /// Baixa e instala a atualização achada pelo `update_check` (ou procura
    /// de novo) e reinicia o app. No Windows, o instalador fecha o app e o
    /// reabre; no Linux, o reinício é o `request_restart` (a sessão em
    /// andamento volta pela retomada, como em qualquer reinício).
    #[tauri::command]
    pub async fn update_install(
        app: AppHandle,
        estado: State<'_, Atualizador>,
    ) -> Result<(), UpdateError> {
        {
            let mut instalando = estado.instalando.lock().map_err(|e| erro("install", e))?;
            if *instalando {
                return Err(erro("install", "já há uma instalação em andamento"));
            }
            *instalando = true;
        }
        let resultado = instalar(&app, &estado).await;
        if let Ok(mut instalando) = estado.instalando.lock() {
            *instalando = false;
        }
        resultado?;
        eprintln!("[tomatito] atualização instalada: reiniciando");
        app.request_restart();
        Ok(())
    }

    async fn instalar(app: &AppHandle, estado: &Atualizador) -> Result<(), UpdateError> {
        let guardada = estado.pendente.lock().ok().and_then(|mut p| p.take());
        let atualizacao = match guardada {
            Some(u) => u,
            None => {
                procurar(app).await?;
                estado
                    .pendente
                    .lock()
                    .ok()
                    .and_then(|mut p| p.take())
                    .ok_or_else(|| erro("install", "não há versão nova"))?
            }
        };
        let mut baixado: u64 = 0;
        let janela = app.clone();
        atualizacao
            .download_and_install(
                move |pedaco, total| {
                    baixado += pedaco as u64;
                    let _ = janela.emit(
                        EVENTO_PROGRESSO,
                        Progresso {
                            downloaded: baixado,
                            total,
                        },
                    );
                },
                || {},
            )
            .await
            .map_err(|e| {
                let code = match e {
                    tauri_plugin_updater::Error::Reqwest(_)
                    | tauri_plugin_updater::Error::Network(_) => "network",
                    _ => "install",
                };
                erro(code, e)
            })
    }

    /// A procura ao abrir (`autoUpdate`): uma consulta só, alguns segundos
    /// depois do início. Achou, avisa a tela e mostra uma notificação; quem
    /// instala é a pessoa, pelas Configurações.
    pub fn procurar_ao_abrir(app: &AppHandle) {
        if canal().is_none() {
            return;
        }
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(ESPERA_AO_ABRIR).await;
            match procurar(&app).await {
                Ok(UpdateCheck {
                    version: Some(version),
                    ..
                }) => {
                    app.state::<Atualizador>()
                        .notificador
                        .mostrar_texto(NoticeText {
                            title: format!("Tomatito {version} disponível"),
                            body: Some("Abra as Configurações para atualizar.".into()),
                        });
                    let _ = app.emit(EVENTO_DISPONIVEL, Disponivel { version });
                }
                Ok(_) => {}
                Err(e) => eprintln!("[tomatito] atualização: {} ({})", e.message, e.code),
            }
        });
    }
}

#[cfg(desktop)]
pub use desktop::*;

/// No Android, os mesmos comandos, sem instalador: a tela não mostra nada.
#[cfg(mobile)]
mod mobile {
    use super::{UpdateCheck, UpdateError, UpdateInfo};

    fn sem_instalador() -> UpdateError {
        UpdateError {
            code: "unavailable",
            message: "no Android, quem atualiza é a loja".into(),
        }
    }

    #[tauri::command]
    pub fn update_info() -> UpdateInfo {
        UpdateInfo::default()
    }

    #[tauri::command]
    pub fn update_check() -> Result<UpdateCheck, UpdateError> {
        Err(sem_instalador())
    }

    #[tauri::command]
    pub fn update_install() -> Result<(), UpdateError> {
        Err(sem_instalador())
    }
}

#[cfg(mobile)]
pub use mobile::*;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn as_respostas_saem_em_camel_case() {
        let info = serde_json::to_value(UpdateInfo {
            available: true,
            channel: Some("deb"),
            pending: None,
        })
        .unwrap();
        assert_eq!(
            info,
            serde_json::json!({ "available": true, "channel": "deb", "pending": null })
        );
        let check = serde_json::to_value(UpdateCheck {
            current: "0.3.0".into(),
            version: None,
        })
        .unwrap();
        assert_eq!(
            check,
            serde_json::json!({ "current": "0.3.0", "version": null })
        );
    }

    /// O binário dos testes não vem de instalador: sem canal, sem cartão.
    #[cfg(desktop)]
    #[test]
    fn binario_solto_nao_tem_canal() {
        assert_eq!(canal(), None);
    }
}
