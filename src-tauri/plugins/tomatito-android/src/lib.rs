//! Plugin `tomatito-android` (PLANO-ANDROID 4.2): a parte do Tomatito que só
//! existe no Android, em Kotlin (`android/`), com o pacote
//! `io.github.kbrianps.tomatito.android`.
//!
//! O JS chama os comandos direto na Kotlin: `invoke('plugin:tomatito-android|cores', ...)`
//! passa pela ACL (`permissions/`, `capabilities/android.json`) e, como o
//! Rust não tem um comando com esse nome, o Tauri o entrega ao plugin
//! registrado aqui. O Rust do app usa o mesmo plugin pelo
//! [`TomatitoAndroidExt`] (o `tocar`, A08, e o `agendar`, A10a, com a
//! contínua desde o A11).
//!
//! Fora do Android, o crate compila vazio: ele só entra no desktop porque é
//! dependência por caminho dentro do workspace (`cargo test --workspace`).
#![cfg(target_os = "android")]

use serde::{Deserialize, Serialize};
use tauri::{
    Manager, Runtime,
    plugin::{Builder, PluginApi, PluginHandle, TauriPlugin, mobile::PluginInvokeError},
};

/// O nome do plugin, o prefixo dos comandos (`plugin:tomatito-android|...`).
pub const NOME: &str = "tomatito-android";
const PACOTE: &str = "io.github.kbrianps.tomatito.android";
const CLASSE: &str = "TomatitoPlugin";

/// O estado das permissões de aviso (resposta do `permissoes`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Permissoes {
    /// `granted`, `denied` ou `prompt` (o de um pedido que ainda pode ser feito).
    pub notificacoes: String,
    /// O `AlarmManager` aceita alarmes exatos (sempre, antes do Android 12).
    pub alarme_exato: bool,
    /// O `Build.VERSION.SDK_INT` do aparelho.
    pub sdk: u32,
}

/// Os argumentos do `cores`: o fundo atrás das barras do sistema, em
/// `#rrggbb`, e se os ícones delas devem ser escuros (tema claro).
#[derive(Debug, Clone, Serialize)]
pub struct Cores<'a> {
    pub fundo: &'a str,
    pub claro: bool,
}

/// Os argumentos do `tocar`: `focusEnd` ou `breakEnd` (os nomes do `sound_test`).
#[derive(Debug, Clone, Serialize)]
pub struct Tocar<'a> {
    pub som: &'a str,
}

/// A resposta do `agendar`: quantos itens foram com `setAlarmClock` e
/// quantos com `setAndAllowWhileIdle` (sem alarme exato).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
pub struct Agendados {
    pub exatos: u32,
    pub inexatos: u32,
}

/// O plugin Kotlin registrado, para o Rust do app.
pub struct TomatitoAndroid<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> TomatitoAndroid<R> {
    pub fn permissoes(&self) -> Result<Permissoes, PluginInvokeError> {
        self.0.run_mobile_plugin("permissoes", ())
    }

    pub fn cores(&self, cores: Cores<'_>) -> Result<(), PluginInvokeError> {
        self.0
            .run_mobile_plugin::<serde::de::IgnoredAny>("cores", cores)
            .map(|_| ())
    }

    /// O "Testar" (A08): toca o som de `res/raw` com a Activity visível. Volta
    /// quando o som começa, sem esperar ele acabar.
    pub fn tocar(&self, som: &str) -> Result<(), PluginInvokeError> {
        self.0
            .run_mobile_plugin::<serde::de::IgnoredAny>("tocar", Tocar { som })
            .map(|_| ())
    }

    /// A agenda dos avisos de fim (PLANO-ANDROID 5.2, item 3) e a
    /// notificação contínua (5.3): `pacote` serializa como
    /// `{ agenda: [Alarme...], continua: Continua | null }`, no formato do
    /// `Agenda.deJson` da Kotlin (o `agenda::Pacote` do app). A Kotlin cancela
    /// os alarmes anteriores, grava a agenda, agenda cada item e mostra,
    /// troca ou tira a contínua, tudo sob a mesma trava. Só o Rust chama (o
    /// comando fica fora da ACL). Espera a Kotlin terminar: chamar de uma
    /// thread própria, nunca da principal nem com o motor travado.
    pub fn agendar<T: Serialize>(&self, pacote: &T) -> Result<Agendados, PluginInvokeError> {
        self.0.run_mobile_plugin("agendar", pacote)
    }
}

/// Acesso ao plugin a partir do `App`, do `AppHandle` ou de uma janela.
pub trait TomatitoAndroidExt<R: Runtime> {
    fn tomatito_android(&self) -> &TomatitoAndroid<R>;
}

impl<R: Runtime, T: Manager<R>> TomatitoAndroidExt<R> for T {
    fn tomatito_android(&self) -> &TomatitoAndroid<R> {
        self.state::<TomatitoAndroid<R>>().inner()
    }
}

fn registrar<R: Runtime>(api: PluginApi<R, ()>) -> Result<TomatitoAndroid<R>, PluginInvokeError> {
    api.register_android_plugin(PACOTE, CLASSE)
        .map(TomatitoAndroid)
}

/// O plugin, para o `tauri::Builder::plugin` do app (só no Android).
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new(NOME)
        .setup(|app, api| {
            app.manage(registrar(api)?);
            Ok(())
        })
        .build()
}
