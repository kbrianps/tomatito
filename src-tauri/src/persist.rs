//! Gravação atômica dos arquivos do app (PLANO.md, 3.3): `settings.json`
//! agora, `state.json` a partir do M33.
//!
//! Escreve tudo num arquivo temporário na mesma pasta, força para o disco e só
//! então renomeia por cima do definitivo. O `rename` na mesma pasta é atômico
//! no Linux (POSIX); no Windows, o `std::fs::rename` substitui o destino
//! existente numa operação só do NTFS. Quem lê vê o arquivo antigo inteiro ou
//! o novo inteiro, nunca a metade de um. Um corte de energia no meio deixa, no
//! máximo, um `.tmp` órfão, que a próxima gravação sobrescreve.

use std::fs::{self, File};
use std::io::{self, Write};
use std::path::{Path, PathBuf};

use serde::Serialize;

/// O temporário de `destino`: o mesmo nome com `.tmp` no fim, na mesma pasta
/// (renomear entre pastas de discos diferentes não seria atômico).
fn temporario(destino: &Path) -> PathBuf {
    let mut nome = destino.file_name().unwrap_or_default().to_os_string();
    nome.push(".tmp");
    destino.with_file_name(nome)
}

/// Grava `bytes` em `destino` de uma vez. Cria a pasta, se faltar.
pub fn write_atomic(destino: &Path, bytes: &[u8]) -> io::Result<()> {
    if let Some(pasta) = destino.parent() {
        fs::create_dir_all(pasta)?;
    }
    let tmp = temporario(destino);
    let resultado = (|| {
        let mut f = File::create(&tmp)?;
        f.write_all(bytes)?;
        f.sync_all()?;
        drop(f);
        fs::rename(&tmp, destino)
    })();
    if resultado.is_err() {
        let _ = fs::remove_file(&tmp);
        return resultado;
    }
    // No Linux, o rename só sobrevive a um corte de energia depois que a
    // própria pasta vai para o disco. No Windows não há como abrir a pasta
    // assim, e o NTFS registra o rename no diário.
    #[cfg(unix)]
    if let Some(pasta) = destino.parent()
        && let Ok(p) = File::open(pasta)
    {
        let _ = p.sync_all();
    }
    Ok(())
}

/// Grava `valor` como JSON legível (com recuo), terminado em nova linha.
pub fn write_json_atomic<T: Serialize>(destino: &Path, valor: &T) -> io::Result<()> {
    let mut bytes = serde_json::to_vec_pretty(valor).map_err(io::Error::other)?;
    bytes.push(b'\n');
    write_atomic(destino, &bytes)
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};

    /// Uma pasta temporária só deste teste, apagada no `drop`.
    pub struct PastaDeTeste(pub PathBuf);

    impl PastaDeTeste {
        pub fn nova(nome: &str) -> Self {
            static N: AtomicU32 = AtomicU32::new(0);
            let p = std::env::temp_dir().join(format!(
                "tomatito-teste-{}-{}-{}",
                std::process::id(),
                nome,
                N.fetch_add(1, Ordering::Relaxed)
            ));
            let _ = fs::remove_dir_all(&p);
            Self(p)
        }
    }

    impl Drop for PastaDeTeste {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn cria_a_pasta_e_grava() {
        let d = PastaDeTeste::nova("cria");
        let arq = d.0.join("sub/a.json");
        write_atomic(&arq, b"um").unwrap();
        assert_eq!(fs::read(&arq).unwrap(), b"um");
    }

    #[test]
    fn substitui_por_inteiro_e_nao_deixa_temporario() {
        let d = PastaDeTeste::nova("substitui");
        let arq = d.0.join("a.json");
        write_atomic(&arq, b"um texto bem mais comprido").unwrap();
        write_atomic(&arq, b"dois").unwrap();
        assert_eq!(fs::read(&arq).unwrap(), b"dois");
        let nomes: Vec<_> = fs::read_dir(&d.0)
            .unwrap()
            .map(|e| e.unwrap().file_name().into_string().unwrap())
            .collect();
        assert_eq!(nomes, ["a.json"]);
    }

    #[test]
    fn temporario_orfao_de_uma_queda_e_sobrescrito() {
        let d = PastaDeTeste::nova("orfao");
        let arq = d.0.join("a.json");
        fs::create_dir_all(&d.0).unwrap();
        fs::write(temporario(&arq), b"metade de um arq").unwrap();
        write_atomic(&arq, b"inteiro").unwrap();
        assert_eq!(fs::read(&arq).unwrap(), b"inteiro");
        assert!(!temporario(&arq).exists());
    }

    #[test]
    fn falha_sem_mexer_no_destino() {
        let d = PastaDeTeste::nova("falha");
        let arq = d.0.join("a.json");
        write_atomic(&arq, b"original").unwrap();
        // O temporário vira uma pasta: o File::create falha antes do rename.
        fs::create_dir_all(temporario(&arq)).unwrap();
        assert!(write_atomic(&arq, b"novo").is_err());
        assert_eq!(fs::read(&arq).unwrap(), b"original");
    }

    #[test]
    fn json_legivel_com_nova_linha() {
        let d = PastaDeTeste::nova("json");
        let arq = d.0.join("a.json");
        write_json_atomic(&arq, &serde_json::json!({ "a": 1 })).unwrap();
        assert_eq!(fs::read_to_string(&arq).unwrap(), "{\n  \"a\": 1\n}\n");
    }
}
