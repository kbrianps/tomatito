//! Plano B2, "Compatibilidade X11" (PLANO.md, 3.3, 5.9 e M57).
//!
//! Com `linuxX11 = true` no `settings.json`, o app abre pelo Xwayland: o
//! [`usar_x11_se_pedido`] lê a chave à mão no começo do `run()`, antes do
//! `Builder` (o GDK escolhe o backend quando o GTK inicia), e define
//! `GDK_BACKEND=x11`. No X11, o "Sempre na frente" do tomate funciona por
//! código (`window::tomato::sempre_na_frente_por_codigo`, M56).
//!
//! A opção fica nas Configurações (`src/views/opcao-x11.js`), que gravam a
//! chave pelo `settings_set` e oferecem reiniciar ([`app_restart`]). O
//! reinício do Tauri abre o mesmo binário herdando o ambiente, e por isso o
//! `GDK_BACKEND` que o app pôs vai junto; a marca [`MARCA`] diz que foi o app
//! quem o pôs, e o próximo início o tira se a opção foi desligada. Um
//! `GDK_BACKEND` que veio de fora (sem a marca) nunca é mexido.
//!
//! Sem `DISPLAY` (uma sessão sem Xwayland), o GTK não abriria no X11, e o
//! app nem chegaria à janela: a opção é ignorada, com uma linha no registro,
//! e a tela avisa.

use serde::Serialize;
use std::sync::OnceLock;

/// Marca, no ambiente, de que o `GDK_BACKEND=x11` foi posto pelo app.
#[cfg(target_os = "linux")]
pub const MARCA: &str = "TOMATITO_GDK_X11";

/// O que fazer com o ambiente no começo do `run()`.
#[cfg(any(target_os = "linux", test))]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Acao {
    /// Nada a mudar (opção desligada e nada herdado do app).
    Nada,
    /// Pôr `GDK_BACKEND=x11` e a marca.
    Ligar,
    /// Já veio do reinício com a opção ligada: manter.
    Manter,
    /// Veio do reinício, mas a opção foi desligada: tirar os dois.
    Desligar,
    /// Opção ligada, mas sem `DISPLAY`: não há Xwayland para abrir.
    SemXwayland,
}

/// A regra, sem ambiente: `pedido` é a `linuxX11`, `marcado` diz se a
/// [`MARCA`] veio herdada e `tem_display`, se há `DISPLAY`.
#[cfg(any(target_os = "linux", test))]
pub fn decidir(pedido: bool, marcado: bool, tem_display: bool) -> Acao {
    match (pedido, marcado, tem_display) {
        (true, true, _) => Acao::Manter,
        (true, false, true) => Acao::Ligar,
        (true, false, false) => Acao::SemXwayland,
        (false, true, _) => Acao::Desligar,
        (false, false, _) => Acao::Nada,
    }
}

/// O que o começo do `run()` viu e fez, para a tela (`x11_compat_get`).
#[derive(Debug, Clone, Copy, Default, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Situacao {
    /// A opção faz sentido aqui: Linux numa sessão Wayland (ou já no X11
    /// por causa dela).
    pub disponivel: bool,
    /// Este processo abriu pelo Xwayland por causa da opção.
    pub ativa: bool,
    /// Há Xwayland (`DISPLAY`) para abrir.
    pub xwayland: bool,
}

static SITUACAO: OnceLock<Situacao> = OnceLock::new();

/// Lê a `linuxX11` (3.3) e ajusta o ambiente. Roda no começo do `run()`,
/// chamado direto do `main`, antes de o Tauri, o GTK ou o tokio abrirem
/// qualquer thread.
#[cfg(target_os = "linux")]
pub fn usar_x11_se_pedido(identifier: &str) {
    use std::env;
    let pedido = crate::settings::linux_path(
        identifier,
        env::var_os("XDG_DATA_HOME").as_deref(),
        env::var_os("HOME").as_deref(),
    )
    .is_some_and(|arq| crate::settings::linux_x11(&arq));
    let marcado = env::var_os(MARCA).is_some();
    let tem_display = env::var_os("DISPLAY").is_some_and(|d| !d.is_empty());
    let wayland = env::var_os("WAYLAND_DISPLAY").is_some_and(|d| !d.is_empty());
    let acao = decidir(pedido, marcado, tem_display);
    // SAFETY (os três `set_var`/`remove_var`): ver o comentário da função;
    // nenhuma outra thread existe ainda.
    match acao {
        Acao::Ligar => {
            eprintln!("[tomatito] linuxX11 ligada: GDK_BACKEND=x11");
            unsafe {
                env::set_var("GDK_BACKEND", "x11");
                env::set_var(MARCA, "1");
            }
        }
        Acao::Manter => eprintln!("[tomatito] linuxX11 ligada: GDK_BACKEND=x11 (herdado)"),
        Acao::Desligar => {
            eprintln!("[tomatito] linuxX11 desligada: GDK_BACKEND volta ao padrão");
            unsafe {
                env::remove_var("GDK_BACKEND");
                env::remove_var(MARCA);
            }
        }
        Acao::SemXwayland => {
            eprintln!("[tomatito] linuxX11 ligada, mas sem DISPLAY (sem Xwayland): ignorada");
        }
        Acao::Nada => {}
    }
    let ativa = matches!(acao, Acao::Ligar | Acao::Manter);
    let _ = SITUACAO.set(Situacao {
        disponivel: wayland || ativa,
        ativa,
        xwayland: tem_display,
    });
}

/// `x11_compat_get` (M57): a [`Situacao`] deste processo. Fora do Linux,
/// tudo falso, e a tela não mostra a opção.
#[tauri::command]
pub fn x11_compat_get() -> Situacao {
    SITUACAO.get().copied().unwrap_or_default()
}

/// `app_restart` (M57): reinicia o app, para a `linuxX11` gravada valer. É o
/// `request_restart` do Tauri: passa pelo `ExitRequested` com o código de
/// reinício (que o `run()` não barra) e pelo `Exit`, e abre o mesmo binário
/// com os mesmos argumentos e o ambiente deste processo.
#[tauri::command]
pub fn app_restart(app: tauri::AppHandle) {
    eprintln!("[tomatito] reiniciando (Compatibilidade X11)");
    app.request_restart();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decidir_cobre_todas_as_combinacoes() {
        use Acao::*;
        let casos = [
            // (pedido, marcado, tem_display) → ação
            ((false, false, false), Nada),
            ((false, false, true), Nada),
            ((true, false, true), Ligar),
            ((true, false, false), SemXwayland),
            // O reinício herda o ambiente: com a opção ainda ligada, fica;
            // desligada, o app tira o que ele mesmo pôs.
            ((true, true, true), Manter),
            ((true, true, false), Manter),
            ((false, true, true), Desligar),
            ((false, true, false), Desligar),
        ];
        for ((p, m, d), esperado) in casos {
            assert_eq!(decidir(p, m, d), esperado, "{p} {m} {d}");
        }
    }

    #[test]
    fn situacao_sem_run_e_tudo_falso() {
        // Nos testes, ninguém chama o `usar_x11_se_pedido`.
        assert_eq!(x11_compat_get(), Situacao::default());
        let v = serde_json::to_value(Situacao {
            disponivel: true,
            ativa: false,
            xwayland: true,
        })
        .unwrap();
        assert_eq!(
            v,
            serde_json::json!({ "disponivel": true, "ativa": false, "xwayland": true })
        );
    }
}
