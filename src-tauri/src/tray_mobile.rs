//! A bandeja no Android (A03, PLANO-ANDROID 4.1): não existe. A [`Bandeja`]
//! é uma casca com a mesma API da do desktop (`tray.rs`), para o `setup`, o
//! `TauriSink` e o `settings_set` continuarem iguais. O "tempo na bandeja" do
//! Android é a notificação contínua (5.3, A11), que não passa por aqui.

use tauri::AppHandle;

use crate::events::{FocusDto, TickDto};

pub struct Bandeja;

impl Bandeja {
    pub fn new(_app: AppHandle, _tray_time: bool) -> Self {
        Self
    }

    pub fn criar_icone(&self, _foco: &FocusDto) {}

    /// Sem ícone: o `recursos.bandeja` do `get_state` sai `false`.
    pub fn existe(&self) -> bool {
        false
    }

    pub fn foco(&self, _foco: &FocusDto) {}

    pub fn tick(&self, _tick: &TickDto) {}

    pub fn tray_time(&self, _ligado: bool) {}
}
