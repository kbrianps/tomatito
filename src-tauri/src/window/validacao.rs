//! Validação com reversão do Tomatito Full (PLANO.md, 5.7, passo 5, e 5.9;
//! M52), no padrão da troca de resolução de tela.
//!
//! Na primeira entrada no Full em cada combinação (a chave do `fullValidated`:
//! o userAgent e o renderizador que a página do tomate informa, mais a versão
//! do WebView e a placa de vídeo; `tomato::chave_de_validacao`), a `main`
//! fica na tela (ou é criada) com a pergunta "O tomate aparece com o fundo
//! transparente?", Manter ou Reverter, e uma contagem de 10 s:
//! - **Manter** grava `fullValidated` com a chave e termina a entrada (a
//!   `main` se esconde);
//! - **Reverter**, ou nenhuma resposta em 10 s: o app volta ao tema anterior
//!   (o "Sair" da 5.7) e a `main` oferece o plano B3, o modo opaco;
//! - **Usar o modo opaco** grava `fullMode = opaque` e entra no Full de novo,
//!   já opaco (sem pergunta: a janela opaca é o próprio plano de reserva);
//! - sair do Full no meio (Esc ou "Voltar ao modo normal" no tomate) cancela
//!   a pergunta sem gravar nada.
//!
//! O prazo corre aqui, e não na página: a reversão acontece mesmo que a
//! `main` não consiga desenhar o diálogo. A página só mostra o que está aqui
//! (o `full_validation_get` ao ligar e o `tt://full-validation` a cada
//! mudança) e manda a resposta (`full_validation_answer`). Cada retrato leva
//! um `seq` crescente, para a página ignorar um retrato velho que chegue
//! depois de um novo.

use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::Deserialize;
use serde_json::{Value, json};
use tauri::{AppHandle, Emitter, Manager};

use super::{main_window, tomato};
use crate::settings::SettingsStore;

/// O retrato da validação, a cada mudança, para as janelas (a `main` o usa).
pub const EVENTO: &str = "tt://full-validation";

/// A contagem do diálogo (5.9).
pub const PRAZO: Duration = Duration::from_secs(10);

/// Por que o app voltou ao tema anterior.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Motivo {
    /// Sem resposta no prazo.
    Tempo,
    /// "Reverter".
    Reverter,
}

/// Onde a validação está.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub enum Fase {
    #[default]
    Nenhuma,
    /// A pergunta na tela, até `prazo_ms` (ms desde a época Unix). O `id`
    /// distingue uma pergunta da seguinte, para o prazo de uma não reverter
    /// a outra.
    Perguntando {
        id: u64,
        chave: String,
        prazo_ms: i64,
    },
    /// O app voltou ao tema anterior; a `main` oferece o modo opaco.
    Revertida(Motivo),
}

/// A resposta da página (`full_validation_answer{answer}`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Resposta {
    /// "Manter", na pergunta.
    Keep,
    /// "Reverter" (ou o Esc), na pergunta.
    Revert,
    /// "Usar o modo opaco", na oferta do B3.
    Opaque,
    /// "Agora não" (ou o Esc), na oferta do B3.
    Dismiss,
}

/// O estado (no `app.manage`, pelo `tomato::ligar`).
#[derive(Debug, Default)]
pub struct Validacao {
    atual: Mutex<Atual>,
}

#[derive(Debug, Default)]
struct Atual {
    seq: u64,
    proximo_id: u64,
    fase: Fase,
}

impl Validacao {
    fn lock(&self) -> std::sync::MutexGuard<'_, Atual> {
        self.atual.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// O retrato atual, como a página o recebe.
    pub fn retrato(&self) -> Value {
        let a = self.lock();
        retrato(a.seq, &a.fase)
    }

    /// Troca a fase e devolve o retrato novo, com o `seq` seguinte.
    fn trocar(&self, fase: Fase) -> Value {
        let mut a = self.lock();
        a.seq += 1;
        a.fase = fase;
        retrato(a.seq, &a.fase)
    }

    /// Tira a pergunta em curso (a de `id`, se dado) e deixa a fase em
    /// `Nenhuma` sem avisar: quem tirou decide o que vem depois. Devolve a
    /// chave dela, ou nada se não havia pergunta (ou era outra).
    fn tirar_pergunta(&self, id: Option<u64>) -> Option<String> {
        let mut a = self.lock();
        match &a.fase {
            Fase::Perguntando { id: i, chave, .. } if id.is_none_or(|id| id == *i) => {
                let chave = chave.clone();
                a.fase = Fase::Nenhuma;
                Some(chave)
            }
            _ => None,
        }
    }

    fn fase(&self) -> Fase {
        self.lock().fase.clone()
    }
}

/// O que vai no `tt://full-validation` e no `full_validation_get`:
/// `{ seq, state: "none" }`, `{ seq, state: "asking", deadlineMs, seconds }`
/// ou `{ seq, state: "reverted", reason: "timeout" | "revert" }`.
pub fn retrato(seq: u64, fase: &Fase) -> Value {
    match fase {
        Fase::Nenhuma => json!({ "seq": seq, "state": "none" }),
        Fase::Perguntando { prazo_ms, .. } => json!({
            "seq": seq,
            "state": "asking",
            "deadlineMs": prazo_ms,
            "seconds": PRAZO.as_secs(),
        }),
        Fase::Revertida(m) => json!({
            "seq": seq,
            "state": "reverted",
            "reason": match m {
                Motivo::Tempo => "timeout",
                Motivo::Reverter => "revert",
            },
        }),
    }
}

fn agora_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Troca a fase e emite o retrato novo para as janelas.
fn avisar(app: &AppHandle, fase: Fase) -> Value {
    let Some(v) = app.try_state::<Validacao>() else {
        return retrato(0, &fase);
    };
    // A troca e o emit juntos, na ordem do `seq`: o `trocar` já soltou a
    // trava quando o emit sai, mas a página descarta um `seq` menor.
    let r = v.trocar(fase);
    if let Err(e) = app.emit(EVENTO, &r) {
        eprintln!("[tomatito] {EVENTO} não saiu: {e}");
    }
    r
}

/// O retrato atual (`full_validation_get`).
pub fn atual(app: &AppHandle) -> Value {
    app.try_state::<Validacao>()
        .map(|v| v.retrato())
        .unwrap_or_else(|| retrato(0, &Fase::Nenhuma))
}

/// Faz a pergunta (5.7, passo 5): a `main` na tela (mostrada de novo ou,
/// se não existe, criada; a página dela pede o retrato ao ligar), a fase em
/// `Perguntando` com o prazo de 10 s a partir de agora, e a reversão
/// agendada. Chamada pelo `entrar` e pelo `abrir_no_inicio`, com o tomate já
/// na tela; não espera a resposta.
pub async fn perguntar(app: &AppHandle, chave: String) {
    let main = match app.get_webview_window(main_window::LABEL) {
        Some(m) => {
            if let Err(e) = m.show() {
                eprintln!("[tomatito] main não mostrada para a validação: {e}");
            }
            let _ = m.unminimize();
            Some(m)
        }
        None => {
            let s = app.state::<SettingsStore>().get();
            match main_window::build_main(app, &s) {
                Ok(m) => {
                    // O prazo só começa com a pergunta na tela.
                    tomato::esperar_visivel(&m, tomato::ESPERA_DA_MAIN).await;
                    Some(m)
                }
                Err(e) => {
                    // Sem a main, a pergunta não aparece, mas o prazo corre
                    // e a reversão acontece do mesmo jeito.
                    eprintln!("[tomatito] main não criada para a validação: {e}");
                    None
                }
            }
        }
    };
    let Some(v) = app.try_state::<Validacao>() else {
        return;
    };
    let id = {
        let mut a = v.lock();
        a.proximo_id += 1;
        a.proximo_id
    };
    let prazo_ms = agora_ms() + PRAZO.as_millis() as i64;
    avisar(
        app,
        Fase::Perguntando {
            id,
            chave,
            prazo_ms,
        },
    );
    if cfg!(debug_assertions) {
        eprintln!(
            "[tomatito] validação do Full: perguntando, prazo de {} s",
            PRAZO.as_secs()
        );
    }
    // O foco do teclado vai para a pergunta (o GNOME pode negar; 3.4).
    if let Some(m) = main {
        let _ = m.set_focus();
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(PRAZO).await;
        expirar(&app, id).await;
    });
}

/// O prazo da pergunta `id` acabou: se ela ainda está na tela, volta ao tema
/// anterior e oferece o B3.
async fn expirar(app: &AppHandle, id: u64) {
    let Some(v) = app.try_state::<Validacao>() else {
        return;
    };
    if v.tirar_pergunta(Some(id)).is_none() {
        return;
    }
    if cfg!(debug_assertions) {
        eprintln!("[tomatito] validação do Full: sem resposta; voltando ao tema anterior");
    }
    reverter(app, Motivo::Tempo).await;
}

/// Volta ao tema anterior (o "Sair" da 5.7) e só então oferece o B3: a
/// oferta nunca aparece com o tomate ainda aberto.
async fn reverter(app: &AppHandle, motivo: Motivo) -> Value {
    if let Err(e) = tomato::sair(app).await {
        eprintln!("[tomatito] a validação não conseguiu sair do Full: {e}");
    }
    avisar(app, Fase::Revertida(motivo))
}

/// Uma saída do Full no meio da pergunta (o `tomato::sair`): cancela, sem
/// gravar nada. Na oferta do B3 (depois de reverter), nada muda.
pub fn cancelar(app: &AppHandle) {
    let Some(v) = app.try_state::<Validacao>() else {
        return;
    };
    if v.tirar_pergunta(None).is_some() {
        avisar(app, Fase::Nenhuma);
    }
}

/// A resposta da página (`full_validation_answer`). Devolve o retrato depois
/// dela. Uma resposta que não cabe na fase atual (um "Manter" que chega
/// depois do prazo, por exemplo) não muda nada e devolve o retrato atual.
pub async fn responder(app: &AppHandle, resposta: Resposta) -> Result<Value, String> {
    let v = app
        .try_state::<Validacao>()
        .ok_or("validação indisponível")?;
    match resposta {
        Resposta::Keep => {
            let Some(chave) = v.tirar_pergunta(None) else {
                return Ok(v.retrato());
            };
            let r = avisar(app, Fase::Nenhuma);
            // Sem conseguir gravar, o Full continua (você viu o tomate); só a
            // próxima entrada pergunta de novo.
            let store = app.state::<SettingsStore>();
            if let Err(e) = crate::commands::gravar_configuracoes(
                app,
                &store,
                &json!({ "fullValidated": chave }),
            ) {
                eprintln!(
                    "[tomatito] fullValidated não gravado: {:?}: {}",
                    e.code, e.message
                );
            }
            tomato::concluir_entrada(app).await;
            Ok(r)
        }
        Resposta::Revert => {
            if v.tirar_pergunta(None).is_none() {
                return Ok(v.retrato());
            }
            Ok(reverter(app, Motivo::Reverter).await)
        }
        Resposta::Opaque => {
            let r = avisar(app, Fase::Nenhuma);
            let store = app.state::<SettingsStore>();
            crate::commands::gravar_configuracoes(app, &store, &json!({ "fullMode": "opaque" }))
                .map_err(|e| format!("{:?}: {}", e.code, e.message))?;
            tomato::entrar(app).await?;
            Ok(r)
        }
        Resposta::Dismiss => {
            if !matches!(v.fase(), Fase::Revertida(_)) {
                return Ok(v.retrato());
            }
            Ok(avisar(app, Fase::Nenhuma))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn retratos_da_validacao() {
        assert_eq!(
            retrato(3, &Fase::Nenhuma),
            json!({ "seq": 3, "state": "none" })
        );
        assert_eq!(
            retrato(
                4,
                &Fase::Perguntando {
                    id: 1,
                    chave: "segredo | Apple GPU".into(),
                    prazo_ms: 1_000
                }
            ),
            json!({ "seq": 4, "state": "asking", "deadlineMs": 1_000, "seconds": 10 }),
            "a chave fica no Rust"
        );
        assert_eq!(
            retrato(5, &Fase::Revertida(Motivo::Tempo)),
            json!({ "seq": 5, "state": "reverted", "reason": "timeout" })
        );
        assert_eq!(
            retrato(6, &Fase::Revertida(Motivo::Reverter)),
            json!({ "seq": 6, "state": "reverted", "reason": "revert" })
        );
    }

    #[test]
    fn respostas_da_pagina() {
        for (texto, r) in [
            ("keep", Resposta::Keep),
            ("revert", Resposta::Revert),
            ("opaque", Resposta::Opaque),
            ("dismiss", Resposta::Dismiss),
        ] {
            assert_eq!(serde_json::from_value::<Resposta>(json!(texto)).unwrap(), r);
        }
        assert!(serde_json::from_value::<Resposta>(json!("manter")).is_err());
    }

    #[test]
    fn cada_troca_sobe_o_seq() {
        let v = Validacao::default();
        assert_eq!(v.retrato()["seq"], 0);
        let a = v.trocar(Fase::Revertida(Motivo::Tempo));
        let b = v.trocar(Fase::Nenhuma);
        assert_eq!((a["seq"].as_u64(), b["seq"].as_u64()), (Some(1), Some(2)));
        assert_eq!(v.retrato(), b);
    }

    #[test]
    fn so_o_prazo_da_propria_pergunta_reverte() {
        let v = Validacao::default();
        v.trocar(Fase::Perguntando {
            id: 2,
            chave: "k".into(),
            prazo_ms: 0,
        });
        // O prazo de uma pergunta anterior (id 1) não tira a atual.
        assert_eq!(v.tirar_pergunta(Some(1)), None);
        assert!(matches!(v.fase(), Fase::Perguntando { id: 2, .. }));
        assert_eq!(v.tirar_pergunta(Some(2)), Some("k".into()));
        assert_eq!(v.fase(), Fase::Nenhuma);
        // Tirada uma vez (o "Manter" e o prazo juntos), a segunda não acha nada.
        assert_eq!(v.tirar_pergunta(None), None);
        // Na oferta do B3, não há pergunta a tirar.
        v.trocar(Fase::Revertida(Motivo::Reverter));
        assert_eq!(v.tirar_pergunta(None), None);
        assert_eq!(v.fase(), Fase::Revertida(Motivo::Reverter));
    }
}
