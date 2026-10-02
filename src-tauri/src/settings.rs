//! Configurações do app (PLANO.md, 3.3): o `settings.json` em
//! `app_data_dir()`, lido e gravado só pelo Rust.
//!
//! O formato, os padrões, as faixas, as regras de tema e a aplicação de um
//! patch ficam no motor (`tomatito_motor::settings`, PLANO-WEB 3.3), que a
//! versão web também usa; este módulo os reexporta e guarda o arquivo.
//!
//! **Leitura** ([`load_from`]), que nunca falha:
//! - sem arquivo, valem os padrões da 3.3;
//! - arquivo ilegível (JSON quebrado ou que não é um objeto): valem os
//!   padrões, e o original é guardado como `settings.corrompido.json`;
//! - chave desconhecida: ignorada; chave com valor inválido (tipo errado ou
//!   fora da faixa): aquela chave fica no padrão, e as outras valem.
//!
//! **Escrita** ([`SettingsStore::set`]), o único caminho: recebe um *patch*
//! (só as chaves que mudam; `sounds` pode vir pela metade), confere cada
//! chave e aplica as regras de [`Settings::normalize`] (os dois pelo
//! [`aplicar_patch`] do motor) e grava com o `persist.rs`. Um patch com
//! qualquer chave desconhecida ou inválida é recusado inteiro, sem gravar
//! nada. Quem chama (o comando `settings_set`) emite `tt://settings` com o
//! resultado.
//!
//! **`linuxX11`** (plano B2) é a exceção: precisa ser lida antes do
//! `Builder`, quando ainda não há `app_data_dir()`. Ver [`linux_x11`].

use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

#[cfg(target_os = "linux")]
use serde::Deserialize;
use serde_json::Value;

pub use tomatito_motor::settings::*;

/// Nome do arquivo em `app_data_dir()`.
pub const FILE: &str = "settings.json";
/// Onde fica o original ilegível, ao lado do `settings.json`.
pub const CORRUPTED_FILE: &str = "settings.corrompido.json";

/// Lê o `settings.json` de `pasta`. Nunca falha (ver o topo do arquivo).
pub fn load_from(pasta: &Path) -> Settings {
    let arq = pasta.join(FILE);
    let bytes = match fs::read(&arq) {
        Ok(b) => b,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Settings::default(),
        Err(e) => {
            // Sem permissão, por exemplo: nem dá para guardar o original.
            eprintln!(
                "[tomatito] configurações: não deu para ler {}: {e}",
                arq.display()
            );
            return Settings::default();
        }
    };
    let objeto = match serde_json::from_slice::<Value>(&bytes) {
        Ok(Value::Object(m)) => m,
        outro => {
            let motivo = match outro {
                Err(e) => e.to_string(),
                Ok(_) => "não é um objeto JSON".to_owned(),
            };
            let guarda = pasta.join(CORRUPTED_FILE);
            match fs::rename(&arq, &guarda) {
                Ok(()) => eprintln!(
                    "[tomatito] configurações ilegíveis ({motivo}); usando os padrões, e o original ficou em {}",
                    guarda.display()
                ),
                Err(e) => eprintln!(
                    "[tomatito] configurações ilegíveis ({motivo}); usando os padrões (não deu para guardar o original: {e})"
                ),
            }
            return Settings::default();
        }
    };
    let Applied {
        mut settings,
        unknown,
        invalid,
    } = apply(&Settings::default(), &objeto);
    // A versão do arquivo vem junto no objeto, mas o `apply` só a copia; a
    // migração de verdade (se um dia houver a 2) entra aqui.
    if !invalid.is_empty() {
        eprintln!(
            "[tomatito] configurações: valores inválidos ficaram no padrão: {}",
            invalid.join(", ")
        );
    }
    if !unknown.is_empty() && cfg!(debug_assertions) {
        eprintln!(
            "[tomatito] configurações: chaves ignoradas: {}",
            unknown.join(", ")
        );
    }
    settings.normalize();
    settings
}

/// O dono das configurações enquanto o app roda: a cópia em memória e a
/// pasta do arquivo. Fica no `app.manage`.
pub struct SettingsStore {
    pasta: PathBuf,
    atual: Mutex<Settings>,
}

impl SettingsStore {
    /// Lê o arquivo de `pasta` (ver [`load_from`]).
    pub fn load(pasta: PathBuf) -> Self {
        let atual = Mutex::new(load_from(&pasta));
        Self { pasta, atual }
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Settings> {
        self.atual.lock().unwrap_or_else(|e| e.into_inner())
    }

    pub fn get(&self) -> Settings {
        self.lock().clone()
    }

    /// Aplica `patch`, grava e chama `gravou` com o resultado, ainda com a
    /// trava (assim os `tt://settings` saem na ordem das gravações).
    pub fn set(
        &self,
        patch: &Value,
        gravou: impl FnOnce(&Settings),
    ) -> Result<Settings, SettingsError> {
        let mut g = self.lock();
        let settings = aplicar_patch(&g, patch)?;
        crate::persist::write_json_atomic(&self.pasta.join(FILE), &settings)
            .map_err(|e| SettingsError::new(SettingsErrorCode::WriteFailed, e.to_string()))?;
        *g = settings.clone();
        gravou(&settings);
        Ok(settings)
    }
}

/// O caminho do `settings.json` sem o Tauri (3.3): `$XDG_DATA_HOME` (se for
/// um caminho absoluto, como no crate `dirs` que o `app_data_dir()` usa) ou
/// `$HOME/.local/share`, mais `/<identifier>/settings.json`.
#[cfg(target_os = "linux")]
pub fn linux_path(
    identifier: &str,
    xdg_data_home: Option<&std::ffi::OsStr>,
    home: Option<&std::ffi::OsStr>,
) -> Option<PathBuf> {
    let base = xdg_data_home
        .map(PathBuf::from)
        .filter(|p| p.is_absolute())
        .or_else(|| home.map(|h| PathBuf::from(h).join(".local/share")))?;
    Some(base.join(identifier).join(FILE))
}

/// `linuxX11` lida à mão, antes do `Builder` (3.3): só essa chave, e
/// qualquer erro (sem arquivo, JSON quebrado, tipo errado) vale `false`.
#[cfg(target_os = "linux")]
pub fn linux_x11(settings_json: &Path) -> bool {
    #[derive(Deserialize)]
    struct SoX11 {
        #[serde(rename = "linuxX11")]
        linux_x11: bool,
    }
    fs::read(settings_json)
        .ok()
        .and_then(|b| serde_json::from_slice::<SoX11>(&b).ok())
        .is_some_and(|s| s.linux_x11)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::persist::tests::PastaDeTeste;
    use serde_json::json;

    #[test]
    fn sem_arquivo_valem_os_padroes_e_nada_e_criado() {
        let d = PastaDeTeste::nova("sem");
        assert_eq!(load_from(&d.0), Settings::default());
        assert!(!d.0.exists());
    }

    #[test]
    fn objeto_vazio_e_chaves_ausentes_viram_padrao() {
        let d = PastaDeTeste::nova("vazio");
        fs::create_dir_all(&d.0).unwrap();
        fs::write(d.0.join(FILE), "{}").unwrap();
        assert_eq!(load_from(&d.0), Settings::default());
        fs::write(
            d.0.join(FILE),
            r#"{"volume": 30, "sounds": {"breakEnd": false}}"#,
        )
        .unwrap();
        let s = load_from(&d.0);
        assert_eq!(s.volume, 30);
        assert_eq!(
            s.sounds,
            Sounds {
                focus_end: true,
                break_end: false
            }
        );
        assert_eq!(s.focus_minutes, 25);
    }

    #[test]
    fn chave_desconhecida_e_ignorada() {
        let d = PastaDeTeste::nova("desconhecida");
        fs::create_dir_all(&d.0).unwrap();
        fs::write(
            d.0.join(FILE),
            r#"{"theme":"dark","corDoGato":"laranja","sounds":{"focusEnd":false,"miau":true},"volume":40}"#,
        )
        .unwrap();
        let s = load_from(&d.0);
        assert_eq!(s.theme, ThemePref::Dark);
        assert!(!s.sounds.focus_end);
        assert_eq!(s.volume, 40);
        // O arquivo não é mexido nem dado como corrompido.
        assert!(d.0.join(FILE).exists());
        assert!(!d.0.join(CORRUPTED_FILE).exists());
    }

    #[test]
    fn valor_invalido_fica_no_padrao_so_naquela_chave() {
        let d = PastaDeTeste::nova("invalido");
        fs::create_dir_all(&d.0).unwrap();
        fs::write(
            d.0.join(FILE),
            r#"{"theme":"roxo","volume":300,"resetHour":24,"tomatoSize":300,"dailyGoalMinutes":45,
                "breakMinutes":0,"focusMinutes":"25","closeToTray":"sim","sounds":{"focusEnd":1},
                "fullMode":"opaque","tomatoOnTop":false}"#,
        )
        .unwrap();
        let s = load_from(&d.0);
        let esperado = Settings {
            full_mode: FullMode::Opaque,
            tomato_on_top: false,
            ..Settings::default()
        };
        assert_eq!(s, esperado);
        assert!(!d.0.join(CORRUPTED_FILE).exists());
    }

    #[test]
    fn arquivo_corrompido_vira_padrao_e_e_guardado() {
        for (n, conteudo) in [
            b"{\"theme\": \"dark\",".as_slice(), // cortado no meio
            b"",                                 // vazio
            b"[1, 2]",                           // JSON, mas não objeto
            b"\xff\xfe lixo",                    // nem UTF-8
        ]
        .into_iter()
        .enumerate()
        {
            let d = PastaDeTeste::nova(&format!("corrompido{n}"));
            fs::create_dir_all(&d.0).unwrap();
            fs::write(d.0.join(FILE), conteudo).unwrap();
            assert_eq!(load_from(&d.0), Settings::default(), "caso {n}");
            assert!(!d.0.join(FILE).exists(), "caso {n}");
            assert_eq!(
                fs::read(d.0.join(CORRUPTED_FILE)).unwrap(),
                conteudo,
                "caso {n}"
            );
        }
    }

    #[test]
    fn corrompido_de_novo_substitui_o_guardado() {
        let d = PastaDeTeste::nova("corrompido-de-novo");
        fs::create_dir_all(&d.0).unwrap();
        fs::write(d.0.join(FILE), "primeiro {").unwrap();
        load_from(&d.0);
        fs::write(d.0.join(FILE), "segundo {").unwrap();
        load_from(&d.0);
        assert_eq!(
            fs::read_to_string(d.0.join(CORRUPTED_FILE)).unwrap(),
            "segundo {"
        );
    }

    #[test]
    fn tema_trocado_a_mao_leva_o_resolvido_e_o_ultimo_junto() {
        // O "Pronto quando" do M23: só `theme` mudou no arquivo, e o resto
        // ficou do Lite. A `main` precisa nascer no tema novo.
        let d = PastaDeTeste::nova("a-mao");
        fs::create_dir_all(&d.0).unwrap();
        let mut arquivo = Settings::default().to_map();
        for (tema, resolvido) in [
            ("dark", ResolvedTheme::Dark),
            ("light", ResolvedTheme::Light),
            ("suave", ResolvedTheme::Suave),
            ("lite", ResolvedTheme::Lite),
        ] {
            arquivo.insert("theme".into(), json!(tema));
            fs::write(d.0.join(FILE), serde_json::to_vec(&arquivo).unwrap()).unwrap();
            let s = load_from(&d.0);
            assert_eq!(s.theme.as_str(), tema);
            assert_eq!(s.resolved_theme, resolvido);
            assert_eq!(s.last_normal_theme.as_str(), tema);
        }
    }

    #[test]
    fn versao_do_arquivo_e_regravada_como_a_atual() {
        let d = PastaDeTeste::nova("versao");
        fs::create_dir_all(&d.0).unwrap();
        fs::write(d.0.join(FILE), r#"{"schemaVersion": 0}"#).unwrap();
        assert_eq!(load_from(&d.0).schema_version, SCHEMA_VERSION);
    }

    #[test]
    fn set_grava_emite_e_devolve() {
        let d = PastaDeTeste::nova("set");
        let store = SettingsStore::load(d.0.clone());
        let mut emitidos = Vec::new();
        let s = store
            .set(
                &json!({ "theme": "suave", "sounds": { "breakEnd": false } }),
                |s| emitidos.push(s.clone()),
            )
            .unwrap();
        assert_eq!(s.theme, ThemePref::Suave);
        assert_eq!(s.resolved_theme, ResolvedTheme::Suave);
        assert_eq!(s.last_normal_theme, NormalTheme::Suave);
        assert_eq!(
            s.sounds,
            Sounds {
                focus_end: true,
                break_end: false
            }
        );
        assert_eq!(emitidos, std::slice::from_ref(&s));
        assert_eq!(store.get(), s);
        // O que está no disco é o mesmo, e a próxima abertura o lê.
        assert_eq!(load_from(&d.0), s);
        let texto = fs::read_to_string(d.0.join(FILE)).unwrap();
        assert!(texto.contains("\"theme\": \"suave\""), "{texto}");
    }

    /// M28: o patch do diálogo "Editar meta diária" leva as duas chaves de
    /// uma vez; um valor fora da lista recusa as duas.
    #[test]
    fn set_meta_e_hora_de_zerar_juntas() {
        let d = PastaDeTeste::nova("meta");
        let store = SettingsStore::load(d.0.clone());
        let mut emitidos = 0;
        for (goal, hour) in [(60, 5), (0, 23), (480, 0)] {
            let s = store
                .set(
                    &json!({ "dailyGoalMinutes": goal, "resetHour": hour }),
                    |_| emitidos += 1,
                )
                .unwrap();
            assert_eq!((s.daily_goal_minutes, s.reset_hour), (goal, hour));
            let lido = load_from(&d.0);
            assert_eq!((lido.daily_goal_minutes, lido.reset_hour), (goal, hour));
        }
        assert_eq!(emitidos, 3, "uma emissão de tt://settings por gravação");
        let e = store
            .set(&json!({ "dailyGoalMinutes": 60, "resetHour": 24 }), |_| {
                panic!("não devia emitir")
            })
            .unwrap_err();
        assert_eq!(e.code, SettingsErrorCode::InvalidValue);
        assert_eq!(
            (store.get().daily_goal_minutes, store.get().reset_hour),
            (480, 0)
        );
    }

    #[test]
    fn set_como_o_apply_theme_da_4_6() {
        let d = PastaDeTeste::nova("apply-theme");
        let store = SettingsStore::load(d.0.clone());
        let s = store
            .set(
                &json!({ "theme": "system", "resolvedTheme": "dark" }),
                |_| {},
            )
            .unwrap();
        assert_eq!(
            (s.theme, s.last_normal_theme, s.resolved_theme),
            (ThemePref::System, NormalTheme::System, ResolvedTheme::Dark)
        );
        // Entrar no Full (5.7): o último fica como estava.
        let s = store.set(&json!({ "theme": "full" }), |_| {}).unwrap();
        assert_eq!(
            (s.theme, s.last_normal_theme, s.resolved_theme),
            (ThemePref::Full, NormalTheme::System, ResolvedTheme::Dark)
        );
        // Sair do Full: `theme = lastNormalTheme`.
        let s = store.set(&json!({ "theme": "system" }), |_| {}).unwrap();
        assert_eq!(s.theme, ThemePref::System);
    }

    #[test]
    fn set_recusa_o_patch_inteiro_e_nao_grava() {
        let d = PastaDeTeste::nova("recusa");
        let store = SettingsStore::load(d.0.clone());
        let casos = [
            (json!(["theme", "dark"]), SettingsErrorCode::InvalidPatch),
            (
                json!({ "theme": "dark", "tema": "dark" }),
                SettingsErrorCode::UnknownKey,
            ),
            (
                json!({ "sounds": { "fimDoFoco": false } }),
                SettingsErrorCode::UnknownKey,
            ),
            (json!({ "schemaVersion": 2 }), SettingsErrorCode::UnknownKey),
            (
                json!({ "theme": "dark", "volume": 101 }),
                SettingsErrorCode::InvalidValue,
            ),
            (json!({ "theme": "roxo" }), SettingsErrorCode::InvalidValue),
            (
                json!({ "resolvedTheme": "full" }),
                SettingsErrorCode::InvalidValue,
            ),
            (
                json!({ "lastNormalTheme": "full" }),
                SettingsErrorCode::InvalidValue,
            ),
            (
                json!({ "focusMinutes": 25.5 }),
                SettingsErrorCode::InvalidValue,
            ),
            (
                json!({ "breakMinutes": 0 }),
                SettingsErrorCode::InvalidValue,
            ),
            (
                json!({ "dailyGoalMinutes": 45 }),
                SettingsErrorCode::InvalidValue,
            ),
            (json!({ "resetHour": -1 }), SettingsErrorCode::InvalidValue),
            (
                json!({ "tomatoSize": "280" }),
                SettingsErrorCode::InvalidValue,
            ),
            (
                json!({ "sounds": { "focusEnd": null } }),
                SettingsErrorCode::InvalidValue,
            ),
            (json!({ "sounds": true }), SettingsErrorCode::InvalidValue),
        ];
        for (patch, code) in casos {
            let e = store
                .set(&patch, |_| panic!("não devia emitir: {patch}"))
                .unwrap_err();
            assert_eq!(e.code, code, "{patch}: {}", e.message);
        }
        assert_eq!(store.get(), Settings::default());
        assert!(!d.0.join(FILE).exists());
    }

    #[test]
    fn set_aceita_as_bordas_das_faixas() {
        let d = PastaDeTeste::nova("bordas");
        let store = SettingsStore::load(d.0.clone());
        for patch in [
            json!({ "volume": 0 }),
            json!({ "volume": 100 }),
            json!({ "resetHour": 23 }),
            json!({ "focusMinutes": 1, "breakMinutes": 60 }),
            json!({ "focusMinutes": 240, "breakMinutes": 1 }),
            json!({ "dailyGoalMinutes": 0 }),
            json!({ "dailyGoalMinutes": 480 }),
            json!({ "tomatoSize": 240 }),
            json!({ "fullValidated": "Mozilla/5.0 | Mesa Intel" }),
            json!({ "linuxX11": true }),
            json!({}),
        ] {
            store
                .set(&patch, |_| {})
                .unwrap_or_else(|e| panic!("{patch}: {}", e.message));
        }
    }

    #[test]
    fn falha_de_gravacao_nao_muda_nada() {
        let d = PastaDeTeste::nova("sem-gravar");
        // A "pasta" é um arquivo: a gravação falha.
        fs::write(&d.0, "sou um arquivo").unwrap();
        let store = SettingsStore {
            pasta: d.0.clone(),
            atual: Mutex::new(Settings::default()),
        };
        let e = store
            .set(&json!({ "theme": "dark" }), |_| panic!("não devia emitir"))
            .unwrap_err();
        assert_eq!(e.code, SettingsErrorCode::WriteFailed);
        assert_eq!(store.get(), Settings::default());
        fs::remove_file(&d.0).unwrap();
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn caminho_do_linux_x11() {
        use std::ffi::OsStr;
        let id = "io.github.kbrianps.tomatito.dev";
        assert_eq!(
            linux_path(
                id,
                Some(OsStr::new("/x/dados")),
                Some(OsStr::new("/home/k"))
            ),
            Some(PathBuf::from(
                "/x/dados/io.github.kbrianps.tomatito.dev/settings.json"
            ))
        );
        // Vazio ou relativo não vale (como no crate `dirs`): cai no HOME.
        for xdg in [Some(OsStr::new("")), Some(OsStr::new("relativo")), None] {
            assert_eq!(
                linux_path(id, xdg, Some(OsStr::new("/home/k"))),
                Some(PathBuf::from(
                    "/home/k/.local/share/io.github.kbrianps.tomatito.dev/settings.json"
                ))
            );
        }
        assert_eq!(linux_path(id, None, None), None);
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn linux_x11_so_com_true_e_nunca_falha() {
        let d = PastaDeTeste::nova("x11");
        fs::create_dir_all(&d.0).unwrap();
        let arq = d.0.join(FILE);
        assert!(!linux_x11(&arq)); // sem arquivo
        for (conteudo, esperado) in [
            (
                r#"{"linuxX11": true, "theme": "roxo", "volume": 999}"#,
                true,
            ),
            (r#"{"linuxX11": false}"#, false),
            (r#"{"linuxX11": "true"}"#, false),
            (r#"{"theme": "dark"}"#, false),
            (r#"{"linuxX11": tr"#, false),
        ] {
            fs::write(&arq, conteudo).unwrap();
            assert_eq!(linux_x11(&arq), esperado, "{conteudo}");
        }
    }
}
