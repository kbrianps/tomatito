//! Avisos de terceiros e a licença da fonte (M46; PLANO.md, seção 9).
//!
//! O `THIRD_PARTY_NOTICES.md` (gerado por `scripts/gerar-avisos.mjs`) e o
//! `OFL-Inter.txt` vão nos instaladores pelo `bundle.resources` do
//! `tauri.conf.json`, e o Sobre os mostra lendo daqui: o texto que a pessoa vê
//! é o arquivo que está no pacote, e não uma cópia embutida no binário.
//!
//! Onde ficam: no `.deb`, em `/usr/lib/Tomatito/`; no AppImage, no
//! `usr/lib/Tomatito/` da imagem; no Windows, ao lado do `.exe`. É o
//! `BaseDirectory::Resource` do Tauri. No build de debug, o `tauri-build`
//! copia os mesmos arquivos para a pasta do binário, mas o Tauri só a reconhece
//! como "pasta do Cargo" se ela se chamar `target` (o nosso target-dir é
//! `/opt/cargo-target/tomatito`, seção 6.3); por isso, só em debug, a pasta do
//! binário é a segunda tentativa.

use serde::{Deserialize, Serialize};
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Manager, Runtime};

/// Os documentos que o Sobre abre.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Documento {
    /// `THIRD_PARTY_NOTICES.md`.
    Avisos,
    /// `OFL-Inter.txt`.
    Ofl,
}

impl Documento {
    /// O nome do arquivo entre os recursos (o destino no `bundle.resources`).
    pub const fn arquivo(self) -> &'static str {
        match self {
            Documento::Avisos => "THIRD_PARTY_NOTICES.md",
            Documento::Ofl => "OFL-Inter.txt",
        }
    }
}

/// Erro do `notices_read`: `{ code: "notFound", message }`. A interface
/// mostra um texto só, e o `message` (o caminho e o erro do sistema) vai para
/// o console.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ErroDeLeitura {
    pub code: &'static str,
    pub message: String,
}

/// `notices_read{doc}`: o texto de `"avisos"` ou `"ofl"`, lido dos recursos.
#[tauri::command]
pub fn notices_read<R: Runtime>(
    app: AppHandle<R>,
    doc: Documento,
) -> Result<String, ErroDeLeitura> {
    let caminho = app
        .path()
        .resolve(doc.arquivo(), BaseDirectory::Resource)
        .map_err(|e| ErroDeLeitura {
            code: "notFound",
            message: format!("{}: {e}", doc.arquivo()),
        })?;
    ler(&caminho).or_else(|erro| na_pasta_do_binario(doc, erro))
}

/// Só em debug: a pasta do binário, onde o tauri-build copiou os arquivos.
/// Sem o arquivo ali também, fica o erro da primeira tentativa.
#[cfg(debug_assertions)]
fn na_pasta_do_binario(doc: Documento, erro: ErroDeLeitura) -> Result<String, ErroDeLeitura> {
    let exe = std::env::current_exe().ok();
    match exe.as_deref().and_then(std::path::Path::parent) {
        Some(pasta) => ler(&pasta.join(doc.arquivo())).map_err(|_| erro),
        None => Err(erro),
    }
}

#[cfg(not(debug_assertions))]
fn na_pasta_do_binario(_doc: Documento, erro: ErroDeLeitura) -> Result<String, ErroDeLeitura> {
    Err(erro)
}

fn ler(caminho: &std::path::Path) -> Result<String, ErroDeLeitura> {
    std::fs::read_to_string(caminho).map_err(|e| ErroDeLeitura {
        code: "notFound",
        message: format!("{}: {e}", caminho.display()),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    /// A mesma tabela do `bundle.resources`: cada documento é um destino, e a
    /// origem existe no repositório.
    #[test]
    fn documentos_estao_nos_recursos_do_pacote() {
        let manifesto = Path::new(env!("CARGO_MANIFEST_DIR"));
        let conf: serde_json::Value = serde_json::from_str(
            &std::fs::read_to_string(manifesto.join("tauri.conf.json")).unwrap(),
        )
        .unwrap();
        let recursos = conf["bundle"]["resources"]
            .as_object()
            .expect("bundle.resources como mapa");
        for doc in [Documento::Avisos, Documento::Ofl] {
            let (origem, _) = recursos
                .iter()
                .find(|(_, destino)| destino.as_str() == Some(doc.arquivo()))
                .unwrap_or_else(|| panic!("{} fora do bundle.resources", doc.arquivo()));
            let texto = ler(&manifesto.join(origem)).unwrap();
            assert!(texto.len() > 1000, "{} curto demais", doc.arquivo());
        }
    }

    #[test]
    fn documento_vem_em_camel_case() {
        let d: Documento = serde_json::from_str("\"avisos\"").unwrap();
        assert_eq!(d, Documento::Avisos);
        let d: Documento = serde_json::from_str("\"ofl\"").unwrap();
        assert_eq!(d, Documento::Ofl);
        assert!(serde_json::from_str::<Documento>("\"LICENSE\"").is_err());
    }

    #[test]
    fn arquivo_ausente_e_not_found() {
        let e = ler(Path::new("/nao/existe/THIRD_PARTY_NOTICES.md")).unwrap_err();
        assert_eq!(e.code, "notFound");
        assert!(e.message.contains("THIRD_PARTY_NOTICES.md"));
    }
}
