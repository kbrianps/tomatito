//! Configurações do app (PLANO.md, 3.3): o `settings.json` em
//! `app_data_dir()`, lido e gravado só pelo Rust.
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
//! chave, aplica as regras de [`Settings::normalize`] e grava com o
//! `persist.rs`. Um patch com qualquer chave desconhecida ou inválida é
//! recusado inteiro, sem gravar nada. Quem chama (o comando `settings_set`)
//! emite `tt://settings` com o resultado.
//!
//! **`linuxX11`** (plano B2) é a exceção: precisa ser lida antes do
//! `Builder`, quando ainda não há `app_data_dir()`. Ver [`linux_x11`].

use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

/// Nome do arquivo em `app_data_dir()`.
pub const FILE: &str = "settings.json";
/// Onde fica o original ilegível, ao lado do `settings.json`.
pub const CORRUPTED_FILE: &str = "settings.corrompido.json";
/// Versão do formato; sobe quando uma chave muda de sentido (migração).
pub const SCHEMA_VERSION: u32 = 1;

/// Faixas aceitas (3.3). F e B não têm faixa no plano: F vai até o maior T do
/// seletor (240), e B até 60 (docs/decisoes.md, M23).
pub const FOCUS_MINUTES: std::ops::RangeInclusive<u32> = 1..=240;
pub const BREAK_MINUTES: std::ops::RangeInclusive<u32> = 1..=60;
pub const DAILY_GOALS: [u32; 9] = [0, 30, 60, 90, 120, 180, 240, 360, 480];
pub const TOMATO_SIZES: [u32; 3] = [240, 280, 320];

/// `theme`: a preferência salva. `system` e `full` não são temas que a
/// `main` pinte: resolvem para [`ResolvedTheme`] (4.1 e 4.6).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ThemePref {
    #[default]
    Lite,
    Suave,
    Light,
    Dark,
    System,
    Full,
}

/// `lastNormalTheme`: qualquer preferência menos o Full.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NormalTheme {
    #[default]
    Lite,
    Suave,
    Light,
    Dark,
    System,
}

/// `resolvedTheme`: o tema que a `main` mostra, e o que escolhe a
/// `background_color` dela antes do JS.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ResolvedTheme {
    #[default]
    Lite,
    Suave,
    Light,
    Dark,
}

/// `fullMode`: `auto` ou `opaque` (plano B3). O spike deu o veredito A
/// (docs/decisoes.md, M05), então o padrão é `auto` também no Linux.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FullMode {
    #[default]
    Auto,
    Opaque,
}

impl ThemePref {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Lite => "lite",
            Self::Suave => "suave",
            Self::Light => "light",
            Self::Dark => "dark",
            Self::System => "system",
            Self::Full => "full",
        }
    }

    /// A preferência sem o Full; `None` no Full.
    pub fn normal(self) -> Option<NormalTheme> {
        Some(match self {
            Self::Lite => NormalTheme::Lite,
            Self::Suave => NormalTheme::Suave,
            Self::Light => NormalTheme::Light,
            Self::Dark => NormalTheme::Dark,
            Self::System => NormalTheme::System,
            Self::Full => return None,
        })
    }
}

impl NormalTheme {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Lite => "lite",
            Self::Suave => "suave",
            Self::Light => "light",
            Self::Dark => "dark",
            Self::System => "system",
        }
    }

    /// O tema que esta preferência pinta; `None` no Sistema, que depende do
    /// sistema e só o JS sabe (`win.theme()`, 4.6).
    pub fn fixed(self) -> Option<ResolvedTheme> {
        Some(match self {
            Self::Lite => ResolvedTheme::Lite,
            Self::Suave => ResolvedTheme::Suave,
            Self::Light => ResolvedTheme::Light,
            Self::Dark => ResolvedTheme::Dark,
            Self::System => return None,
        })
    }
}

/// `sounds.focusEnd` e `sounds.breakEnd`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Sounds {
    pub focus_end: bool,
    pub break_end: bool,
}

impl Default for Sounds {
    fn default() -> Self {
        Self {
            focus_end: true,
            break_end: true,
        }
    }
}

/// O `settings.json` inteiro, com as chaves da tabela da 3.3, em camelCase.
/// É também o que o `settings_get`, o `get_state` e o `tt://settings`
/// mandam para o JS.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub schema_version: u32,
    pub theme: ThemePref,
    pub last_normal_theme: NormalTheme,
    pub resolved_theme: ResolvedTheme,
    pub focus_minutes: u32,
    pub break_minutes: u32,
    pub sounds: Sounds,
    pub volume: u8,
    pub close_to_tray: bool,
    pub tray_time: bool,
    pub daily_goal_minutes: u32,
    pub reset_hour: u8,
    pub tomato_size: u32,
    pub tomato_on_top: bool,
    pub full_mode: FullMode,
    pub full_validated: String,
    #[serde(rename = "linuxX11")]
    pub linux_x11: bool,
}

impl Default for Settings {
    /// Os padrões da 3.3. Os que o plano deixou "a confirmar" ou pendentes
    /// estão em docs/decisoes.md, M23.
    fn default() -> Self {
        Self {
            schema_version: SCHEMA_VERSION,
            theme: ThemePref::Lite,
            last_normal_theme: NormalTheme::Lite,
            resolved_theme: ResolvedTheme::Lite,
            focus_minutes: 25,
            break_minutes: 5,
            sounds: Sounds::default(),
            // O mesmo do audio.rs desde o M20 (3.3: "a confirmar").
            volume: crate::audio::VOLUME_PADRAO,
            close_to_tray: true,
            // 1.2, item 7, pendente: desligado até você decidir (M36).
            tray_time: false,
            // 3.3: "a confirmar"; 2 horas.
            daily_goal_minutes: 120,
            reset_hour: 0,
            tomato_size: 280,
            // 3.3: `false` no Windows 10 (#15947). A detecção do Windows 10
            // entra com o Full no Windows (M55).
            tomato_on_top: true,
            full_mode: FullMode::Auto,
            full_validated: String::new(),
            linux_x11: false,
        }
    }
}

/// Chaves que o `settings_set` não aceita: o formato é do Rust.
const READ_ONLY: [&str; 1] = ["schemaVersion"];

impl Settings {
    /// Se cada valor está na faixa da 3.3. O serde já garante o tipo.
    fn out_of_range(&self) -> Vec<&'static str> {
        let mut ruins = Vec::new();
        if !FOCUS_MINUTES.contains(&self.focus_minutes) {
            ruins.push("focusMinutes");
        }
        if !BREAK_MINUTES.contains(&self.break_minutes) {
            ruins.push("breakMinutes");
        }
        if self.volume > 100 {
            ruins.push("volume");
        }
        if !DAILY_GOALS.contains(&self.daily_goal_minutes) {
            ruins.push("dailyGoalMinutes");
        }
        if self.reset_hour > 23 {
            ruins.push("resetHour");
        }
        if !TOMATO_SIZES.contains(&self.tomato_size) {
            ruins.push("tomatoSize");
        }
        ruins
    }

    /// As regras entre as chaves de tema (3.3 e 4.6), aplicadas depois de
    /// cada leitura e de cada patch:
    /// - fora do Full, `lastNormalTheme` = `theme`;
    /// - num tema fixo, `resolvedTheme` = esse tema (é o que faz uma troca
    ///   de `theme` à mão no arquivo abrir no tema certo, sem clarão);
    /// - no Sistema, `resolvedTheme` é o que o JS gravou, e só pode ser
    ///   Claro ou Escuro (4.1); se não for, Claro (o JS corrige no boot);
    /// - no Full, `resolvedTheme` é o do `lastNormalTheme`, pelas mesmas
    ///   regras: a `main` aberta a partir do tomate mostra o tema normal.
    pub fn normalize(&mut self) {
        self.schema_version = SCHEMA_VERSION;
        if let Some(normal) = self.theme.normal() {
            self.last_normal_theme = normal;
        }
        self.resolved_theme = match self.last_normal_theme.fixed() {
            Some(t) => t,
            None => match self.resolved_theme {
                ResolvedTheme::Dark => ResolvedTheme::Dark,
                _ => ResolvedTheme::Light,
            },
        };
    }

    fn to_map(&self) -> Map<String, Value> {
        match serde_json::to_value(self) {
            Ok(Value::Object(m)) => m,
            _ => unreachable!("Settings sempre vira um objeto JSON"),
        }
    }
}

/// O resultado de aplicar um objeto JSON sobre umas configurações.
#[derive(Debug, Default, PartialEq, Eq)]
struct Applied {
    settings: Settings,
    /// Chaves (com `sounds.` na frente, se for o caso) que o formato não tem.
    unknown: Vec<String>,
    /// Chaves com tipo errado ou fora da faixa; ficaram como estavam.
    invalid: Vec<String>,
}

/// Aplica `patch` sobre `base`, chave por chave. Cada chave é conferida
/// sozinha: uma inválida não derruba as outras. As regras de tema
/// ([`Settings::normalize`]) ficam para quem chama.
fn apply(base: &Settings, patch: &Map<String, Value>) -> Applied {
    let mut atual = base.to_map();
    let mut unknown = Vec::new();
    let mut invalid = Vec::new();
    for (chave, valor) in patch {
        match (atual.get(chave), valor) {
            (None, _) => unknown.push(chave.clone()),
            // Objeto dentro de objeto (`sounds`): subchave por subchave.
            (Some(Value::Object(sub)), Value::Object(vs)) => {
                let sub: Vec<String> = sub.keys().cloned().collect();
                for (sk, sv) in vs {
                    let caminho = format!("{chave}.{sk}");
                    if !sub.contains(sk) {
                        unknown.push(caminho);
                    } else if !try_set(&mut atual, chave, Some(sk), sv) {
                        invalid.push(caminho);
                    }
                }
            }
            (Some(_), _) => {
                if !try_set(&mut atual, chave, None, valor) {
                    invalid.push(chave.clone());
                }
            }
        }
    }
    let settings = serde_json::from_value(Value::Object(atual)).unwrap_or_else(|_| base.clone());
    Applied {
        settings,
        unknown,
        invalid,
    }
}

/// Põe `valor` em `atual[chave]` (ou `atual[chave][sub]`) se o resultado for
/// umas configurações válidas que guardam o valor como veio. Assim são
/// recusados um `300` no `volume` (não cabe em `u8`), um `"sim"` num booleano,
/// um `-1` ou um `25.5` num inteiro e um `24` no `resetHour` (fora da faixa).
fn try_set(atual: &mut Map<String, Value>, chave: &str, sub: Option<&str>, valor: &Value) -> bool {
    let mut cand = atual.clone();
    let alvo = match sub {
        Some(sk) => match cand.get_mut(chave) {
            Some(Value::Object(m)) => m.entry(sk.to_owned()).or_insert(Value::Null),
            _ => return false,
        },
        None => cand.entry(chave.to_owned()).or_insert(Value::Null),
    };
    *alvo = valor.clone();
    let Ok(s) = serde_json::from_value::<Settings>(Value::Object(cand.clone())) else {
        return false;
    };
    if s.out_of_range().contains(&chave) {
        return false;
    }
    // E o valor lido de volta tem de ser exatamente o que veio: nada de o
    // serde arredondar, cortar ou trocar o valor por outro no caminho.
    let volta = s.to_map();
    let lido = match sub {
        Some(sk) => volta.get(chave).and_then(|v| v.get(sk)),
        None => volta.get(chave),
    };
    if lido != Some(valor) {
        return false;
    }
    *atual = cand;
    true
}

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

/// Erro do `settings_set`, como o JS o recebe: `{ code, message }`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsError {
    pub code: SettingsErrorCode,
    pub message: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SettingsErrorCode {
    /// O patch não é um objeto JSON.
    InvalidPatch,
    /// Alguma chave que o formato não tem (ou `schemaVersion`).
    UnknownKey,
    /// Algum valor com tipo errado ou fora da faixa.
    InvalidValue,
    /// A gravação falhou; nada mudou, nem na memória.
    WriteFailed,
}

impl SettingsError {
    fn new(code: SettingsErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
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
        let Value::Object(patch) = patch else {
            return Err(SettingsError::new(
                SettingsErrorCode::InvalidPatch,
                "o patch precisa ser um objeto",
            ));
        };
        let mut g = self.lock();
        let Applied {
            mut settings,
            mut unknown,
            invalid,
        } = apply(&g, patch);
        unknown.extend(
            READ_ONLY
                .iter()
                .filter(|k| patch.contains_key(**k))
                .map(|k| k.to_string()),
        );
        if !unknown.is_empty() {
            return Err(SettingsError::new(
                SettingsErrorCode::UnknownKey,
                format!(
                    "chaves desconhecidas ou só de leitura: {}",
                    unknown.join(", ")
                ),
            ));
        }
        if !invalid.is_empty() {
            return Err(SettingsError::new(
                SettingsErrorCode::InvalidValue,
                format!("valores inválidos: {}", invalid.join(", ")),
            ));
        }
        settings.normalize();
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

    fn obj(v: Value) -> Map<String, Value> {
        match v {
            Value::Object(m) => m,
            _ => panic!("não é objeto"),
        }
    }

    #[test]
    fn padroes_da_secao_3_3_em_camel_case() {
        let v = serde_json::to_value(Settings::default()).unwrap();
        assert_eq!(
            v,
            json!({
                "schemaVersion": 1,
                "theme": "lite",
                "lastNormalTheme": "lite",
                "resolvedTheme": "lite",
                "focusMinutes": 25,
                "breakMinutes": 5,
                "sounds": { "focusEnd": true, "breakEnd": true },
                "volume": 80,
                "closeToTray": true,
                "trayTime": false,
                "dailyGoalMinutes": 120,
                "resetHour": 0,
                "tomatoSize": 280,
                "tomatoOnTop": true,
                "fullMode": "auto",
                "fullValidated": "",
                "linuxX11": false,
            })
        );
    }

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
    fn regras_de_tema() {
        let com = |theme, last, resolved| {
            let mut s = Settings {
                theme,
                last_normal_theme: last,
                resolved_theme: resolved,
                ..Settings::default()
            };
            s.normalize();
            (s.theme, s.last_normal_theme, s.resolved_theme)
        };
        use NormalTheme as N;
        use ResolvedTheme as R;
        use ThemePref as T;
        // Tema fixo: o último e o resolvido seguem o tema.
        assert_eq!(
            com(T::Suave, N::Dark, R::Dark),
            (T::Suave, N::Suave, R::Suave)
        );
        // Sistema: o resolvido é o que o JS gravou, se for Claro ou Escuro.
        assert_eq!(
            com(T::System, N::Lite, R::Dark),
            (T::System, N::System, R::Dark)
        );
        assert_eq!(
            com(T::System, N::Lite, R::Light),
            (T::System, N::System, R::Light)
        );
        assert_eq!(
            com(T::System, N::Lite, R::Lite),
            (T::System, N::System, R::Light)
        );
        // Full: o último fica, e a `main` mostra o tema dele.
        assert_eq!(
            com(T::Full, N::Suave, R::Lite),
            (T::Full, N::Suave, R::Suave)
        );
        assert_eq!(
            com(T::Full, N::System, R::Dark),
            (T::Full, N::System, R::Dark)
        );
        assert_eq!(
            com(T::Full, N::System, R::Suave),
            (T::Full, N::System, R::Light)
        );
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

    #[test]
    fn apply_informa_o_que_ignorou() {
        let a = apply(
            &Settings::default(),
            &obj(json!({ "x": 1, "sounds": { "y": 2, "focusEnd": "n" }, "volume": 10 })),
        );
        // O `Map` do serde_json é ordenado pela chave.
        assert_eq!(a.unknown, ["sounds.y", "x"]);
        assert_eq!(a.invalid, ["sounds.focusEnd"]);
        assert_eq!(a.settings.volume, 10);
    }
}
