mod window;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // Spike A (M04): a `tomato` nasce junto com a `main` do template.
            // No `setup` a criação pode ser síncrona; fora dele, só em comando
            // async (PLANO.md, 5.3).
            window::tomato::build(app.handle())?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
