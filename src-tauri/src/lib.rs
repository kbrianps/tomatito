mod commands;
mod engine;
mod events;
mod window;

use std::sync::Arc;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // O motor nasce antes das janelas: o laço roda com ou sem elas
            // (PLANO.md, 3.2), e o primeiro `get_state` do JS já o encontra.
            let (clock, speed) = engine::clock_from_env();
            let motor = Arc::new(engine::Engine::new(
                clock,
                speed,
                engine::TauriSink::new(app.handle().clone()),
            ));
            app.manage(motor.clone());
            tauri::async_runtime::spawn(motor.run());

            // As janelas nascem aqui, e não no tauri.conf.json (PLANO.md, 4.7).
            // Até o settings.rs existir, o tema é sempre o Lite (M07).
            window::main_window::build_main(app.handle(), &window::main_window::ThemePrefs::LITE)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_state,
            commands::focus_start,
            commands::focus_pause,
            commands::focus_resume,
            commands::focus_skip,
            commands::focus_stop,
        ])
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
