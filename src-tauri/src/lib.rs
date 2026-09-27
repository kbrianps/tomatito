mod window;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // As janelas nascem aqui, e não no tauri.conf.json (PLANO.md, 4.7).
            // Até o settings.rs existir, o tema é sempre o Lite (M07).
            window::main_window::build_main(app.handle(), &window::main_window::ThemePrefs::LITE)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
