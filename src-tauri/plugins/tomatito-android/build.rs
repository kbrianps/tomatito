// Os comandos que o JS chama direto na Kotlin (`plugin:tomatito-android|...`).
// Cada um ganha a permissão `allow-<comando>`; o `default` lista as do app
// (permissions/default.toml). Os próximos entram aqui no marco de cada um
// (PLANO-ANDROID 4.2: A07b, A10a, A11, A16b).
const COMMANDS: &[&str] = &["permissoes", "cores"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .build();
}
