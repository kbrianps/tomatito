// Os comandos que o JS chama direto na Kotlin (`plugin:tomatito-android|...`).
// Cada um ganha a permissão `allow-<comando>` (com `-` no lugar de `_`);
// na Kotlin, o método tem o nome em lowerCamelCase (`abrir_url` → `abrirUrl`); o `default` lista as do app
// (permissions/default.toml). Os próximos entram aqui no marco de cada um
// (PLANO-ANDROID 4.2: A16b). Os que só o Rust chama (`agendar`, A10a) ficam
// de fora: sem permissão, o JS recebe "not allowed".
const COMMANDS: &[&str] = &[
    "permissoes",
    "cores",
    "pedir_notificacoes",
    "abrir_config_avisos",
    "tocar",
    "abrir_url",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .build();
}
