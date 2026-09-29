//! Ponte do `tomatito-core` para o navegador (PLANO-WEB, 3.3; marco W01a).
//!
//! O motor é o mesmo do desktop. Nenhum método lê o relógio: todo comando
//! recebe o `agora_ms` de quem chama (no navegador, `Date.now()`; nos testes,
//! um instante fixo). Nunca `SystemTime` (entra em pânico no
//! `wasm32-unknown-unknown`) nem `performance.now()` (monotônico).
//!
//! Esta é a versão mínima do W01a: só o foco, com `focusStart`, `focusPause`,
//! `restanteMs` e um retrato pequeno montado aqui mesmo, mais o fuso do
//! navegador pelo jiff. Os efeitos (som, aviso, período), os temporizadores,
//! o cronômetro e o formato completo do `tt://state` chegam com o
//! `tomatito-motor` (W04a–W06a).

use serde::Serialize;
use tomatito_core::{
    Effects, EpochMs, Focus, FocusError, FocusSnapshot, Notice, Period, PhaseChange, PhaseKind,
    PlanSettings, SessionConfig, Sound, Status, TimeZone,
};
use wasm_bindgen::prelude::*;

// ---------------------------------------------------------------------------
// Pânico legível no console, sem o crate console_error_panic_hook.
// ---------------------------------------------------------------------------

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console, js_name = error)]
    fn console_error(s: &str);
}

#[wasm_bindgen(start)]
fn inicio() {
    std::panic::set_hook(Box::new(|info| console_error(&info.to_string())));
}

// ---------------------------------------------------------------------------
// O retrato mínimo.
// ---------------------------------------------------------------------------

/// O estado do foco em texto, como o `status` do `tt://state` do desktop.
fn status(s: Status) -> &'static str {
    match s {
        Status::Idle => "idle",
        Status::Focus { .. } => "focus",
        Status::Break { .. } => "break",
        Status::Paused { .. } => "paused",
        Status::Completed => "completed",
    }
}

fn tipo(k: PhaseKind) -> &'static str {
    match k {
        PhaseKind::Focus => "focus",
        PhaseKind::Break => "break",
    }
}

/// A fase atual no retrato.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FaseDto {
    pub kind: &'static str,
    pub n: u32,
    pub duration_s: u64,
}

/// O retrato mínimo do foco num instante. Os instantes vão como `number`
/// (ms de época cabem em 2^53).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RetratoDto {
    pub status: &'static str,
    pub at: i64,
    /// Quanto falta da fase atual; 0 sem sessão.
    pub restante_ms: u64,
    /// O prazo da fase, só enquanto ela corre.
    pub ends_at: Option<i64>,
    pub fase: Option<FaseDto>,
    pub blocks: Option<u32>,
}

impl From<&FocusSnapshot> for RetratoDto {
    fn from(s: &FocusSnapshot) -> Self {
        let sessao = s.session.as_ref();
        Self {
            status: status(s.status),
            at: s.at.0,
            restante_ms: sessao.map_or(0, |x| x.remaining_ms),
            ends_at: sessao.and_then(|x| x.ends_at).map(|t| t.0),
            fase: sessao.map(|x| FaseDto {
                kind: tipo(x.phase.kind),
                n: x.phase.n,
                duration_s: x.phase.duration_s,
            }),
            blocks: sessao.map(|x| x.blocks),
        }
    }
}

fn para_js<T: Serialize>(valor: &T) -> Result<JsValue, JsError> {
    // json_compatible: None vira null (não undefined), e i64/u64 viram number
    // (erro se passar de 2^53, o que ms de época não faz).
    let ser = serde_wasm_bindgen::Serializer::json_compatible();
    valor
        .serialize(&ser)
        .map_err(|e| JsError::new(&e.to_string()))
}

fn erro(e: FocusError) -> JsError {
    JsError::new(&e.to_string())
}

fn instante(agora_ms: f64) -> EpochMs {
    // `as` satura (NaN vira 0): o JS sempre manda Date.now(), um inteiro.
    EpochMs(agora_ms as i64)
}

/// Efeitos descartados. No W01a o JS só lê o retrato; a fila de efeitos como
/// dados (o `WebSink`) é do W06a.
struct SemEfeitos;

impl Effects for SemEfeitos {
    fn play_sound(&mut self, _sound: Sound) {}
    fn notify(&mut self, _notice: Notice) {}
    fn record_period(&mut self, _period: &Period) {}
    fn state_changed(&mut self, _snapshot: &FocusSnapshot) {}
    fn phase_changed(&mut self, _change: &PhaseChange) {}
}

// ---------------------------------------------------------------------------
// O motor exposto ao JS.
// ---------------------------------------------------------------------------

/// O foco do `tomatito-core`, dirigido pelo relógio de quem chama.
#[wasm_bindgen]
pub struct Motor {
    foco: Focus,
}

impl Default for Motor {
    fn default() -> Self {
        Self::new()
    }
}

/// A parte em Rust puro, testável no nativo (as funções com `JsValue` e
/// `JsError` só rodam dentro do wasm).
impl Motor {
    /// Inicia uma sessão de `minutos` com F e B dados, sem tarefa.
    pub fn iniciar(
        &mut self,
        agora: EpochMs,
        minutos: u32,
        pular_intervalos: bool,
        foco_min: u32,
        intervalo_min: u32,
    ) -> Result<RetratoDto, FocusError> {
        let config = SessionConfig {
            minutes: minutos,
            settings: PlanSettings {
                focus_minutes: foco_min,
                break_minutes: intervalo_min,
            },
            skip_breaks: pular_intervalos,
            task_id: None,
        };
        self.foco.advance_to(agora, &mut SemEfeitos);
        self.foco.start(agora, config, &mut SemEfeitos)?;
        Ok(self.retrato_em(agora))
    }

    /// Pausa a fase que corre.
    pub fn pausar(&mut self, agora: EpochMs) -> Result<RetratoDto, FocusError> {
        self.foco.advance_to(agora, &mut SemEfeitos);
        self.foco.pause(agora, &mut SemEfeitos)?;
        Ok(self.retrato_em(agora))
    }

    /// O retrato em `agora`, depois de fechar as fases vencidas.
    pub fn retrato_em(&mut self, agora: EpochMs) -> RetratoDto {
        self.foco.advance_to(agora, &mut SemEfeitos);
        RetratoDto::from(&self.foco.snapshot(agora))
    }
}

#[wasm_bindgen]
impl Motor {
    /// Ocioso.
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self { foco: Focus::new() }
    }

    /// Inicia uma sessão de foco e devolve o retrato.
    #[wasm_bindgen(js_name = focusStart)]
    pub fn focus_start(
        &mut self,
        agora_ms: f64,
        minutos: u32,
        pular_intervalos: bool,
        foco_min: u32,
        intervalo_min: u32,
    ) -> Result<JsValue, JsError> {
        let r = self
            .iniciar(
                instante(agora_ms),
                minutos,
                pular_intervalos,
                foco_min,
                intervalo_min,
            )
            .map_err(erro)?;
        para_js(&r)
    }

    /// Pausa a fase que corre e devolve o retrato. Sem fase correndo, lança
    /// o erro do core ("não há fase correndo para pausar").
    #[wasm_bindgen(js_name = focusPause)]
    pub fn focus_pause(&mut self, agora_ms: f64) -> Result<JsValue, JsError> {
        let r = self.pausar(instante(agora_ms)).map_err(erro)?;
        para_js(&r)
    }

    /// Quanto falta da fase atual em `agora_ms`; 0 sem sessão.
    #[wasm_bindgen(js_name = restanteMs)]
    pub fn restante_ms(&mut self, agora_ms: f64) -> f64 {
        self.retrato_em(instante(agora_ms)).restante_ms as f64
    }

    /// O retrato mínimo em `agora_ms`.
    pub fn retrato(&mut self, agora_ms: f64) -> Result<JsValue, JsError> {
        para_js(&self.retrato_em(instante(agora_ms)))
    }
}

// ---------------------------------------------------------------------------
// Fuso: o que o desktop pega do sistema, aqui vem do Intl pelo jiff (`js`).
// ---------------------------------------------------------------------------

/// O nome IANA de um fuso, ou `None` se ele não tiver um.
pub fn nome_do_fuso(tz: &TimeZone) -> Option<&str> {
    tz.iana_name()
}

/// O fuso do navegador, como o jiff o enxerga (nome IANA, pelo Intl).
#[wasm_bindgen(js_name = fusoDoSistema)]
pub fn fuso_do_sistema() -> String {
    nome_do_fuso(&TimeZone::system())
        .unwrap_or("(sem nome IANA)")
        .to_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    const T0: EpochMs = EpochMs(1_790_000_000_000);

    #[test]
    fn iniciar_e_ler_um_minuto_depois() {
        let mut m = Motor::new();
        let r = m.iniciar(T0, 25, false, 25, 5).unwrap();
        assert_eq!(r.status, "focus");
        assert_eq!(r.restante_ms, 1_500_000);
        assert_eq!(r.ends_at, Some(T0.0 + 1_500_000));
        let depois = m.retrato_em(T0.plus_ms(60_000));
        assert_eq!(depois.restante_ms, 1_440_000);
        assert_eq!(
            depois.fase,
            Some(FaseDto {
                kind: "focus",
                n: 1,
                duration_s: 1500
            })
        );
    }

    #[test]
    fn pausar_sem_fase_correndo_da_o_erro_do_core() {
        let mut m = Motor::new();
        let e = m.pausar(T0).unwrap_err();
        assert_eq!(e.to_string(), "não há fase correndo para pausar");
    }

    #[test]
    fn pausado_o_restante_nao_anda() {
        let mut m = Motor::new();
        m.iniciar(T0, 25, false, 25, 5).unwrap();
        let r = m.pausar(T0.plus_ms(10_000)).unwrap();
        assert_eq!(r.status, "paused");
        assert_eq!(r.ends_at, None);
        assert_eq!(m.retrato_em(T0.plus_ms(600_000)).restante_ms, 1_490_000);
    }

    #[test]
    fn ocioso_tem_restante_zero_e_sem_fase() {
        let mut m = Motor::new();
        let r = m.retrato_em(T0);
        assert_eq!(
            (r.status, r.restante_ms, r.fase, r.blocks),
            ("idle", 0, None, None)
        );
    }

    #[test]
    fn fuso_com_nome_iana() {
        let tz = TimeZone::get("America/Sao_Paulo").unwrap();
        assert_eq!(nome_do_fuso(&tz), Some("America/Sao_Paulo"));
    }
}
