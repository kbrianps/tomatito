use std::env;
use std::path::PathBuf;

fn main() {
    let mut atributos = tauri_build::Attributes::new();

    if alvo_windows_msvc() {
        // O tauri-build põe o manifesto (Common Controls v6) só no .exe do app,
        // como recurso. Os binários de teste do `cargo test` ficam sem ele, e o
        // Windows os recusa ao carregar (STATUS_ENTRYPOINT_NOT_FOUND, 0xc0000139),
        // porque importam funções que só existem no comctl32 v6. Por isso o
        // manifesto sai do recurso e vai pelo linker, que o põe em todos os
        // binários do pacote: app, cdylib e testes. Ver docs/decisoes.md (M03).
        atributos = atributos
            .windows_attributes(tauri_build::WindowsAttributes::new_without_app_manifest());
        embutir_manifesto_pelo_linker();
    }

    if alvo_android() {
        // A18: páginas de 16 KB (exigência da Play para o Android 15+). O NDK
        // novo já alinha assim; a flag garante com qualquer NDK, e o
        // `llvm-readelf -lW` do A18 confere os `LOAD` em 0x4000.
        println!("cargo:rustc-link-arg=-Wl,-z,max-page-size=16384");
    }

    if let Err(erro) = tauri_build::try_build(atributos) {
        // Mesma saída do `tauri_build::build()`.
        println!("{erro:#}");
        std::process::exit(1);
    }
}

fn alvo_android() -> bool {
    env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("android")
}

/// O build script roda no host; o alvo vem das variáveis `CARGO_CFG_*`.
fn alvo_windows_msvc() -> bool {
    env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows")
        && env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc")
}

fn embutir_manifesto_pelo_linker() {
    let manifesto = PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR"))
        .join("windows-app-manifest.xml");
    println!("cargo:rerun-if-changed={}", manifesto.display());
    println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
    println!(
        "cargo:rustc-link-arg=/MANIFESTINPUT:{}",
        manifesto.display()
    );
}
