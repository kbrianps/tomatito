mod audio;
mod commands;
mod engine;
mod events;
mod i18n;
mod notify;
mod persist;
mod settings;
mod stats;
mod tasks;
mod window;

use std::sync::Arc;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Um `generate_context!` só: ele embute a página no binário.
    let context = tauri::generate_context!();
    // B2 (5.9): a `linuxX11` é lida antes do `Builder`, porque o GDK escolhe
    // o backend quando o GTK inicia (3.3).
    #[cfg(target_os = "linux")]
    usar_x11_se_pedido(&context.config().identifier);
    let builder = tauri::Builder::default();
    // Plugins na ordem da 3.4: o single-instance (M36) entra antes deste. O
    // de notificação só existe no Windows; no Linux, o `notify.rs` fala
    // direto com o D-Bus (docs/decisoes.md, M21).
    #[cfg(windows)]
    let builder = builder.plugin(tauri_plugin_notification::init());
    builder
        .setup(|app| {
            // O motor nasce antes das janelas: o laço roda com ou sem elas
            // (PLANO.md, 3.2), e o primeiro `get_state` do JS já o encontra.
            let dados = app.path().app_data_dir()?;
            // O banco das estatísticas antes do motor: ele grava os períodos
            // desde a primeira fase (M26).
            let stats = Arc::new(stats::Stats::open(&dados));
            app.manage(stats.clone());
            let (clock, speed) = engine::clock_from_env();
            // A thread de som sobe junto: o motor e o `sound_test` usam a mesma.
            let som = Arc::new(audio::Som::iniciar());
            app.manage(som.clone());
            let motor = Arc::new(engine::Engine::new(
                clock,
                speed,
                engine::TauriSink::new(app.handle().clone(), som, stats),
            ));
            app.manage(motor.clone());
            tauri::async_runtime::spawn(motor.run());

            // As configurações antes das janelas: o tema escolhe a cor de
            // fundo e o que o script de inicialização passa à página (4.7).
            let store = settings::SettingsStore::load(dados);
            let s = store.get();
            app.manage(store);

            // As janelas nascem aqui, e não no tauri.conf.json (PLANO.md, 4.7).
            // Com `theme = full`, a 4.7 cria só a `tomato`; até ela existir
            // (M50), nasce a `main`, no tema normal (docs/decisoes.md, M23).
            window::main_window::build_main(app.handle(), &s)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_state,
            commands::settings_get,
            commands::settings_set,
            commands::focus_start,
            commands::focus_pause,
            commands::focus_resume,
            commands::focus_skip,
            commands::focus_stop,
            commands::sound_test,
            commands::stats_get,
            commands::task_list,
            commands::task_add,
            commands::task_complete,
            commands::task_delete,
        ])
        .run(context)
        .expect("error while building tauri application");
}

/// Plano B2 (5.9): com `linuxX11 = true` no `settings.json`, o app abre pelo
/// Xwayland. A opção na interface é do M57; a leitura já vale desde o M23.
#[cfg(target_os = "linux")]
fn usar_x11_se_pedido(identifier: &str) {
    let Some(arq) = settings::linux_path(
        identifier,
        std::env::var_os("XDG_DATA_HOME").as_deref(),
        std::env::var_os("HOME").as_deref(),
    ) else {
        return;
    };
    if settings::linux_x11(&arq) {
        eprintln!("[tomatito] linuxX11 ligada: GDK_BACKEND=x11");
        // SAFETY: roda no começo do `run()`, chamado direto do `main`, antes
        // de o Tauri, o GTK ou o tokio abrirem qualquer thread.
        unsafe { std::env::set_var("GDK_BACKEND", "x11") };
    }
}
