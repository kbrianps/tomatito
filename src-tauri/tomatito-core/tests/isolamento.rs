//! Regra de isolamento (PLANO.md, 3.2): o `tomatito-core` não depende de
//! janela nem de WebView, em nenhum nível da árvore de dependências.
//!
//! A árvore vem do próprio Cargo (`cargo tree -p tomatito-core`), já
//! resolvida, e não da leitura do `Cargo.toml`. Assim entram:
//! - a forma em linha (`tauri = "..."`) e a de tabela (`[dependencies.tauri]`);
//! - as dependências só de um sistema (`[target.'cfg(windows)'.dependencies]`),
//!   pelo `--target all`;
//! - as de build e as de desenvolvimento, pelo `-e normal,build,dev`;
//! - as indiretas, em qualquer nível (o `--prefix depth` dá o nível de cada
//!   linha, que vai na mensagem de erro).

use std::process::Command;

/// Crates de janela e WebView. Vale o nome exato ou com sufixo depois de `-`
/// ou `_` (`tauri-utils`, `tao-macros`, `webkit2gtk-sys`, `webview2-com`).
const PROIBIDOS: [&str; 6] = ["tauri", "tao", "wry", "webkit2gtk", "gtk", "webview2"];

fn proibido(nome: &str) -> bool {
    PROIBIDOS.iter().any(|p| {
        nome.strip_prefix(p)
            .is_some_and(|resto| resto.is_empty() || resto.starts_with(['-', '_']))
    })
}

/// `(nível, nome)` de cada pacote na saída do `cargo tree --prefix depth`,
/// em que cada linha é `<nível><nome> v<versão> [...]`.
fn pacotes(saida: &str) -> Vec<(u32, &str)> {
    saida
        .lines()
        .filter_map(|linha| {
            let fim = linha.find(|c: char| !c.is_ascii_digit())?;
            let nivel = linha[..fim].parse().ok()?;
            let nome = linha[fim..].split_whitespace().next()?;
            Some((nivel, nome))
        })
        .collect()
}

fn proibidos_na_arvore(saida: &str) -> Vec<(u32, &str)> {
    pacotes(saida)
        .into_iter()
        .filter(|(_, nome)| proibido(nome))
        .collect()
}

/// Roda o `cargo tree` do núcleo. O `--locked` garante que o teste não mexe
/// no `Cargo.lock`.
fn arvore_do_nucleo() -> String {
    let cargo = std::env::var_os("CARGO").unwrap_or_else(|| env!("CARGO").into());
    let manifesto = concat!(env!("CARGO_MANIFEST_DIR"), "/Cargo.toml");
    let saida = Command::new(cargo)
        .args([
            "tree",
            "--manifest-path",
            manifesto,
            "-p",
            "tomatito-core",
            "--locked",
            "--target",
            "all",
            "-e",
            "normal,build,dev",
            "--prefix",
            "depth",
            "--charset",
            "ascii",
        ])
        .output()
        .expect("não foi possível rodar o cargo tree");
    assert!(
        saida.status.success(),
        "o cargo tree falhou:\n{}",
        String::from_utf8_lossy(&saida.stderr)
    );
    String::from_utf8(saida.stdout).expect("a saída do cargo tree não é UTF-8")
}

#[test]
fn nucleo_nao_depende_de_janela_nem_webview_em_nenhum_nivel() {
    let arvore = arvore_do_nucleo();
    // Sem a raiz, a leitura falhou, e uma lista vazia passaria sem conferir nada.
    assert_eq!(
        pacotes(&arvore).first(),
        Some(&(0, "tomatito-core")),
        "saída inesperada do cargo tree:\n{arvore}"
    );
    let achados = proibidos_na_arvore(&arvore);
    assert!(
        achados.is_empty(),
        "o tomatito-core não pode depender de janela nem de WebView; \
         achados (nível, crate): {achados:?}\n\nárvore:\n{arvore}"
    );
}

/// A leitura da saída pega o crate proibido em qualquer nível e com os
/// sufixos do `cargo tree` (`(*)`, `(proc-macro)`), sem confundir nomes
/// parecidos.
#[test]
fn leitura_da_arvore_pega_qualquer_nivel() {
    let saida = "\
0tomatito-core v0.1.0 (/x/src-tauri/tomatito-core)
1ponte v0.1.0 (/x/ponte)
2serde v1.0.228
2tao v0.37.1
3gtk v0.18.2
4gtk-sys v0.18.2 (*)
1tauri-macros v2.7.0 (proc-macro)
1wry v0.57.0
2webkit2gtk-sys v2.0.2
2webview2-com v0.38.2
1taos v1.0.0
1gtkwave v0.1.0
1meu-tauri v0.1.0
";
    assert_eq!(pacotes(saida).len(), 13);
    assert_eq!(
        proibidos_na_arvore(saida),
        [
            (2, "tao"),
            (3, "gtk"),
            (4, "gtk-sys"),
            (1, "tauri-macros"),
            (1, "wry"),
            (2, "webkit2gtk-sys"),
            (2, "webview2-com"),
        ]
    );
}
