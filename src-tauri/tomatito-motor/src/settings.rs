//! Configurações do app (PLANO.md, 3.3), a parte sem arquivo (PLANO-WEB,
//! 3.3): o formato do `settings.json`, os padrões, as faixas, as regras de
//! tema ([`Settings::normalize`]) e a aplicação de um *patch*
//! ([`aplicar_patch`]). O desktop (`src-tauri/src/settings.rs`) guarda o
//! arquivo (`load_from`, `SettingsStore`) e o que depende do sistema
//! (`linux_path`, `linux_x11`); a web guarda no navegador.
//!
//! **Patch** ([`aplicar_patch`]): só as chaves que mudam (`sounds` pode vir
//! pela metade); cada chave é conferida, e depois valem as regras de
//! [`Settings::normalize`]. Um patch com qualquer chave desconhecida ou
//! inválida é recusado inteiro.
//!
//! **Leitura** de um objeto guardado ([`apply`]): chave desconhecida é
//! ignorada; chave com valor inválido (tipo errado ou fora da faixa) fica no
//! padrão, e as outras valem.

use std::sync::atomic::{AtomicBool, Ordering};

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

/// Versão do formato; sobe quando uma chave muda de sentido (migração).
pub const SCHEMA_VERSION: u32 = 1;

/// O padrão do `volume` das configurações (3.3: "a confirmar"), de 0 a 100.
/// O `audio.rs` do desktop começa com ele (M20).
pub const VOLUME_PADRAO: u8 = 80;

/// Faixas aceitas (3.3). F e B não têm faixa no plano: F vai até o maior T do
/// seletor (240), e B até 60 (docs/decisoes.md, M23).
pub const FOCUS_MINUTES: std::ops::RangeInclusive<u32> = 1..=240;
pub const BREAK_MINUTES: std::ops::RangeInclusive<u32> = 1..=60;
pub const DAILY_GOALS: [u32; 9] = [0, 30, 60, 90, 120, 180, 240, 360, 480];
pub const TOMATO_SIZES: [u32; 3] = [240, 280, 320];

/// O padrão do `tomatoOnTop` fora do Windows 10: `true`. O desktop, no
/// Windows, troca-o no começo do `run()` pelo da versão do sistema
/// ([`definir_tomato_on_top_padrao`]).
static TOMATO_ON_TOP_PADRAO: AtomicBool = AtomicBool::new(true);

/// Troca o padrão do `tomatoOnTop` (3.3; M56): o desktop, no Windows, passa
/// `false` no Windows 10 (#15947), antes de ler as configurações. Sem a
/// versão (o `RtlGetVersion` falhou), vale o do Windows 11.
pub fn definir_tomato_on_top_padrao(padrao: bool) {
    TOMATO_ON_TOP_PADRAO.store(padrao, Ordering::Relaxed);
}

/// O padrão do `tomatoOnTop` (3.3; M56): `true`, salvo no Windows 10 (#15947).
fn tomato_on_top_padrao() -> bool {
    TOMATO_ON_TOP_PADRAO.load(Ordering::Relaxed)
}

/// Windows 11 é o 10.0 a partir do build 22000.
pub fn windows_11_ou_mais(maior: u32, build: u32) -> bool {
    maior > 10 || (maior == 10 && build >= 22000)
}

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
    /// v0.3: procurar atualizações ao abrir (só no desktop; desligada por
    /// padrão, porque é a única coisa que faz o app falar com a internet).
    pub auto_update: bool,
    /// v0.4: o Full no modo compacto: a janelinha é um cartão quadrado nas
    /// cores do `lastNormalTheme`, e não o tomate. Só vale com `theme = full`.
    pub compact: bool,
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
            volume: VOLUME_PADRAO,
            close_to_tray: true,
            // 1.2, item 7, pendente: desligado até você decidir (M36).
            tray_time: false,
            // 3.3: "a confirmar"; 2 horas.
            daily_goal_minutes: 120,
            reset_hour: 0,
            tomato_size: 280,
            // 3.3: `false` no Windows 10 (#15947; M56).
            tomato_on_top: tomato_on_top_padrao(),
            full_mode: FullMode::Auto,
            full_validated: String::new(),
            linux_x11: false,
            auto_update: false,
            compact: false,
        }
    }
}

/// Chaves que o `settings_set` não aceita: o formato é do Rust.
pub const READ_ONLY: [&str; 1] = ["schemaVersion"];

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

    /// As configurações como objeto JSON (as chaves em camelCase).
    pub fn to_map(&self) -> Map<String, Value> {
        match serde_json::to_value(self) {
            Ok(Value::Object(m)) => m,
            _ => unreachable!("Settings sempre vira um objeto JSON"),
        }
    }
}

/// O resultado de aplicar um objeto JSON sobre umas configurações.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct Applied {
    pub settings: Settings,
    /// Chaves (com `sounds.` na frente, se for o caso) que o formato não tem.
    pub unknown: Vec<String>,
    /// Chaves com tipo errado ou fora da faixa; ficaram como estavam.
    pub invalid: Vec<String>,
}

/// Aplica `patch` sobre `base`, chave por chave. Cada chave é conferida
/// sozinha: uma inválida não derruba as outras. As regras de tema
/// ([`Settings::normalize`]) ficam para quem chama.
pub fn apply(base: &Settings, patch: &Map<String, Value>) -> Applied {
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
    pub fn new(code: SettingsErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
}

/// O `settings_set` sem a gravação: aplica `patch` sobre `base` e devolve as
/// configurações novas, já normalizadas. Um patch que não é objeto, ou com
/// qualquer chave desconhecida, só de leitura ou inválida, é recusado inteiro.
pub fn aplicar_patch(base: &Settings, patch: &Value) -> Result<Settings, SettingsError> {
    let Value::Object(patch) = patch else {
        return Err(SettingsError::new(
            SettingsErrorCode::InvalidPatch,
            "o patch precisa ser um objeto",
        ));
    };
    let Applied {
        mut settings,
        mut unknown,
        invalid,
    } = apply(base, patch);
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
    Ok(settings)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn obj(v: Value) -> Map<String, Value> {
        match v {
            Value::Object(m) => m,
            _ => panic!("não é objeto"),
        }
    }

    #[test]
    fn sempre_na_frente_so_a_partir_do_windows_11() {
        assert!(windows_11_ou_mais(10, 22000));
        assert!(windows_11_ou_mais(10, 26100));
        assert!(!windows_11_ou_mais(10, 19045), "Windows 10 22H2");
        assert!(!windows_11_ou_mais(6, 3));
        assert!(windows_11_ou_mais(11, 0));
        #[cfg(not(windows))]
        assert!(tomato_on_top_padrao());
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
                "autoUpdate": false,
                "compact": false,
            })
        );
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
