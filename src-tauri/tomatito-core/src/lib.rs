//! Motor do Tomatito.
//!
//! Guarda a regra dos intervalos, o relógio de parede e as máquinas de estado
//! do foco, do temporizador e do cronômetro. Não conhece o Tauri: conversa com
//! o app pelo trait `Effects` (M15), e os testes rodam sem janela.
//!
//! Por enquanto a biblioteca está vazia; os módulos entram a partir do M14.

#[cfg(test)]
mod tests {
    /// Crates de janela e WebView que o núcleo nunca pode usar.
    const PROIBIDOS: [&str; 6] = ["tauri", "wry", "tao", "gtk", "webkit2gtk", "webview2"];

    /// O núcleo só compila sem o Tauri se nenhuma dependência direta for de
    /// janela ou WebView. Lê o próprio `Cargo.toml` em tempo de compilação.
    #[test]
    fn nucleo_nao_depende_de_janela_nem_webview() {
        let manifesto = include_str!("../Cargo.toml");
        let mut em_dependencias = false;
        for linha in manifesto.lines().map(str::trim) {
            if linha.starts_with('[') {
                em_dependencias = linha.contains("dependencies");
                continue;
            }
            if !em_dependencias || linha.is_empty() || linha.starts_with('#') {
                continue;
            }
            let nome = linha
                .split(['=', '.', ' '])
                .next()
                .unwrap_or_default()
                .trim_matches('"');
            assert!(
                !PROIBIDOS.iter().any(|p| nome.starts_with(p)),
                "o tomatito-core não pode depender de `{nome}`"
            );
        }
    }
}
