//! Ponte do motor para o navegador (PLANO-WEB, 3.3; marcos W01a e W06a).
//!
//! O motor é o mesmo do desktop: o `Engine` do `tomatito-motor`, com o foco,
//! os temporizadores e o cronômetro do `tomatito-core`. O que muda é quem o
//! hospeda:
//! - **[`RelogioJs`]:** o `Clock` lê o `Date.now()` global a cada uso (nunca
//!   `SystemTime`, que entra em pânico no `wasm32-unknown-unknown`, nem
//!   `performance.now()`, que é monotônico). Assim o relógio de teste do
//!   `verificar.mjs`, que troca o `Date.now`, vale também para o motor;
//! - **[`WebSink`]:** o `Sink` exige `Send + Sync + 'static`, e callbacks JS
//!   não são `Send`. Por isso os efeitos viram dados ([`Efeito`]) numa fila,
//!   esvaziada a cada chamada e devolvida ao JS, que os leva ao barramento
//!   (W06b). O `acordar` não faz nada: o `motor.js` arma o próprio prazo
//!   pelo `proximoPrazo` de cada resposta;
//! - **[`Motor`]:** `comando(nome, args)` é o espelho do `generate_handler!`
//!   do desktop para o foco, os temporizadores e o cronômetro, com os mesmos
//!   nomes e os args em camelCase, como o `invoke` do Tauri os manda.
//!   `comando`, `estado` e `tick` devolvem `{ resultado, efeitos,
//!   proximoPrazo }`. Um erro é lançado como `{ code, message }`, o mesmo
//!   objeto que o `invoke` do desktop rejeita.

use std::sync::{Mutex, PoisonError};

use serde::{Deserialize, Deserializer, Serialize};
use tomatito_core::{Clock, EpochMs, Notice, Period, Sound, TimeZone, TimerEnded, TimerId};
use tomatito_motor::engine::{CommandError, Engine, Sink};
use tomatito_motor::events::{
    FocusDto, PhaseDto, PhaseEventDto, PhaseKindDto, StateDto, StopwatchDto, TickDto, TimersDto,
};
use wasm_bindgen::prelude::*;

// ---------------------------------------------------------------------------
// Pânico legível no console, sem o crate console_error_panic_hook (3.3).
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
// O relógio.
// ---------------------------------------------------------------------------

/// O relógio de parede do navegador: `Date.now()`, lido do global a cada
/// chamada (o glue não guarda a função).
#[derive(Debug, Clone, Copy, Default)]
pub struct RelogioJs;

impl Clock for RelogioJs {
    fn now(&self) -> EpochMs {
        // `as` satura (NaN vira 0); o `Date.now()` é sempre um inteiro.
        EpochMs(js_sys::Date::now() as i64)
    }
}

// ---------------------------------------------------------------------------
// Os efeitos como dados.
// ---------------------------------------------------------------------------

/// `Sound` no fio: `"focusEnd"` ou `"breakEnd"`, como o `sound_test` do
/// desktop recebe.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SomDto {
    FocusEnd,
    BreakEnd,
}

impl From<Sound> for SomDto {
    fn from(s: Sound) -> Self {
        match s {
            Sound::FocusEnd => Self::FocusEnd,
            Sound::BreakEnd => Self::BreakEnd,
        }
    }
}

/// `Notice` no fio: os dados do aviso, sem o texto (o texto sai do
/// `i18n.rs`, no W13). Instantes em ms de época.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum AvisoDto {
    FocusEnded {
        n: u32,
        blocks: u32,
        break_s: u64,
        next_focus_at: i64,
    },
    BreakEnded {
        next_n: u32,
        blocks: u32,
        next_focus_s: u64,
    },
    SessionCompleted {
        total_minutes: u32,
        focus_s: u64,
    },
    Late {
        ended: PhaseDto,
        ended_at: i64,
        session_completed: bool,
    },
}

impl From<Notice> for AvisoDto {
    fn from(n: Notice) -> Self {
        match n {
            Notice::FocusEnded {
                n,
                blocks,
                break_s,
                next_focus_at,
            } => Self::FocusEnded {
                n,
                blocks,
                break_s,
                next_focus_at: next_focus_at.0,
            },
            Notice::BreakEnded {
                next_n,
                blocks,
                next_focus_s,
            } => Self::BreakEnded {
                next_n,
                blocks,
                next_focus_s,
            },
            Notice::SessionCompleted {
                total_minutes,
                focus_s,
            } => Self::SessionCompleted {
                total_minutes,
                focus_s,
            },
            Notice::Late {
                ended,
                ended_at,
                session_completed,
            } => Self::Late {
                ended: ended.into(),
                ended_at: ended_at.0,
                session_completed,
            },
        }
    }
}

/// Uma linha de `periods` (a mesma do SQLite do desktop), para o IndexedDB
/// (W08).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PeriodoDto {
    pub session_id: i64,
    pub kind: PhaseKindDto,
    pub n: u32,
    pub started_at: i64,
    pub ended_at: i64,
    pub planned_s: u64,
    pub actual_s: u64,
    pub completed: bool,
    pub task_id: Option<i64>,
}

impl From<&Period> for PeriodoDto {
    fn from(p: &Period) -> Self {
        Self {
            session_id: p.session_id,
            kind: p.kind.into(),
            n: p.n,
            started_at: p.started_at.0,
            ended_at: p.ended_at.0,
            planned_s: p.planned_s,
            actual_s: p.actual_s,
            completed: p.completed,
            task_id: p.task_id,
        }
    }
}

/// O fim de um temporizador, para o aviso (W13).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FimDoTemporizadorDto {
    pub id: TimerId,
    pub name: String,
    pub duration_ms: u64,
    pub ended_at: i64,
    pub late: bool,
}

impl From<&TimerEnded> for FimDoTemporizadorDto {
    fn from(e: &TimerEnded) -> Self {
        Self {
            id: e.id,
            name: e.name.clone(),
            duration_ms: e.duration_ms,
            ended_at: e.ended_at.0,
            late: e.late,
        }
    }
}

/// Um efeito do motor, na ordem em que saiu: `{ tipo, dados }`. Os `tipo`
/// `state`, `tick`, `phase`, `timers` e `stopwatch` levam o mesmo `dados`
/// que o `tt://<tipo>` do desktop; `sound`, `notice`, `period` e
/// `timerNotice` são o que o desktop faz no Rust (som, notificação e SQLite)
/// e a web faz no JS.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "tipo", content = "dados", rename_all = "camelCase")]
pub enum Efeito {
    State(FocusDto),
    Tick(TickDto),
    Phase(PhaseEventDto),
    Sound(SomDto),
    Notice(AvisoDto),
    Period(PeriodoDto),
    Timers(TimersDto),
    TimerNotice(FimDoTemporizadorDto),
    Stopwatch(StopwatchDto),
}

/// O `Sink` da web: enfileira os efeitos como dados.
#[derive(Debug, Default)]
pub struct WebSink {
    fila: Mutex<Vec<Efeito>>,
}

impl WebSink {
    fn por(&self, e: Efeito) {
        self.fila
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .push(e);
    }

    /// Tira todos os efeitos da fila, em ordem.
    pub fn esvaziar(&self) -> Vec<Efeito> {
        std::mem::take(&mut *self.fila.lock().unwrap_or_else(PoisonError::into_inner))
    }
}

impl Sink for WebSink {
    fn state(&self, focus: &FocusDto) {
        self.por(Efeito::State(focus.clone()));
    }
    fn tick(&self, tick: &TickDto) {
        self.por(Efeito::Tick(tick.clone()));
    }
    fn phase(&self, change: &PhaseEventDto) {
        self.por(Efeito::Phase(*change));
    }
    fn sound(&self, sound: Sound) {
        self.por(Efeito::Sound(sound.into()));
    }
    fn notice(&self, notice: Notice) {
        self.por(Efeito::Notice(notice.into()));
    }
    fn period(&self, period: &Period) {
        self.por(Efeito::Period(period.into()));
    }
    fn timers(&self, timers: &TimersDto) {
        self.por(Efeito::Timers(timers.clone()));
    }
    fn timer_notice(&self, ended: &TimerEnded) {
        self.por(Efeito::TimerNotice(ended.into()));
    }
    fn stopwatch(&self, stopwatch: &StopwatchDto) {
        self.por(Efeito::Stopwatch(stopwatch.clone()));
    }
    // `acordar`: o padrão, que não faz nada.
}

// ---------------------------------------------------------------------------
// Comandos, respostas e erros.
// ---------------------------------------------------------------------------

/// O que um comando devolve: o mesmo valor que o comando do desktop.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(untagged)]
pub enum Resultado {
    Foco(FocusDto),
    Temporizadores(TimersDto),
    Cronometro(StopwatchDto),
}

/// A resposta de `comando`, `estado` e `tick`.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Resposta<T> {
    pub resultado: T,
    /// Os efeitos desde a chamada anterior, em ordem (inclusive os que um
    /// comando recusado deixou na fila, como o fim de uma fase vencida que o
    /// `advance_to` do comando fechou antes de recusar).
    pub efeitos: Vec<Efeito>,
    /// O próximo prazo (fim da fase ou de um temporizador rumo ao zero), em
    /// ms de época; `null` quando nada vence.
    pub proximo_prazo: Option<i64>,
}

/// Um erro no formato do desktop: `{ code, message }`. Os do motor têm os
/// mesmos `code` do `CommandError`; os dois da web (`unknownCommand` e
/// `invalidArgs`) são o que o Tauri rejeita como texto no desktop.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(untagged)]
pub enum Erro {
    Motor(CommandError),
    Web { code: CodigoWeb, message: String },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum CodigoWeb {
    /// Nome de comando que o motor não atende.
    UnknownCommand,
    /// Args que faltam ou com o tipo errado.
    InvalidArgs,
    /// Falha ao passar um valor do Rust para o JS (não deve acontecer).
    Internal,
}

impl From<CommandError> for Erro {
    fn from(e: CommandError) -> Self {
        Self::Motor(e)
    }
}

impl Erro {
    fn web(code: CodigoWeb, message: impl Into<String>) -> Self {
        Self::Web {
            code,
            message: message.into(),
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ArgsFocusStart {
    minutes: u32,
    skip_breaks: Option<bool>,
    task_id: Option<i64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ArgsTimerCreate {
    name: Option<String>,
    duration_ms: u64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ArgsTimerUpdate {
    id: TimerId,
    name: Option<String>,
    duration_ms: u64,
}

#[derive(Deserialize)]
struct ArgsId {
    id: TimerId,
}

/// Os comandos do motor que a web atende, com os nomes do desktop.
pub const COMANDOS: [&str; 15] = [
    "focus_start",
    "focus_pause",
    "focus_resume",
    "focus_skip",
    "focus_stop",
    "timer_create",
    "timer_update",
    "timer_delete",
    "timer_start",
    "timer_pause",
    "timer_reset",
    "stopwatch_start",
    "stopwatch_pause",
    "stopwatch_lap",
    "stopwatch_reset",
];

fn ler<'de, T: Deserialize<'de>, D: Deserializer<'de>>(nome: &str, args: D) -> Result<T, Erro> {
    T::deserialize(args).map_err(|e| {
        Erro::web(
            CodigoWeb::InvalidArgs,
            format!("args inválidos para {nome}: {e}"),
        )
    })
}

// ---------------------------------------------------------------------------
// O motor exposto ao JS.
// ---------------------------------------------------------------------------

/// O motor de uma aba: o `Engine` do desktop com o [`WebSink`].
#[wasm_bindgen]
pub struct Motor {
    engine: Engine<WebSink>,
}

/// A parte em Rust puro, testável no nativo com um relógio de teste (as
/// funções com `JsValue` só rodam dentro do wasm).
impl Motor {
    /// O motor com outro relógio (os testes usam o `FakeClock`).
    #[doc(hidden)]
    pub fn com_relogio(relogio: Box<dyn Clock>) -> Self {
        Self {
            engine: Engine::new(relogio, 1.0, WebSink::default()),
        }
    }

    /// Embrulha um valor com os efeitos da fila e o próximo prazo.
    fn responder<T>(&self, resultado: T) -> Resposta<T> {
        Resposta {
            resultado,
            efeitos: self.engine.sink().esvaziar(),
            proximo_prazo: self.engine.proximo_prazo().map(|t| t.0),
        }
    }

    /// Roda o comando `nome` com os `args` (camelCase), como o `invoke`.
    pub fn executar<'de, D: Deserializer<'de>>(
        &self,
        nome: &str,
        args: D,
    ) -> Result<Resposta<Resultado>, Erro> {
        let e = &self.engine;
        let r = match nome {
            "focus_start" => {
                let a: ArgsFocusStart = ler(nome, args)?;
                Resultado::Foco(e.start(a.minutes, a.skip_breaks.unwrap_or(false), a.task_id)?)
            }
            "focus_pause" => Resultado::Foco(e.pause()?),
            "focus_resume" => Resultado::Foco(e.resume()?),
            "focus_skip" => Resultado::Foco(e.skip()?),
            "focus_stop" => Resultado::Foco(e.stop()?),
            "timer_create" => {
                let a: ArgsTimerCreate = ler(nome, args)?;
                Resultado::Temporizadores(
                    e.timer_create(a.name.as_deref().unwrap_or(""), a.duration_ms)?,
                )
            }
            "timer_update" => {
                let a: ArgsTimerUpdate = ler(nome, args)?;
                Resultado::Temporizadores(e.timer_update(
                    a.id,
                    a.name.as_deref().unwrap_or(""),
                    a.duration_ms,
                )?)
            }
            "timer_delete" => {
                Resultado::Temporizadores(e.timer_delete(ler::<ArgsId, _>(nome, args)?.id)?)
            }
            "timer_start" => {
                Resultado::Temporizadores(e.timer_start(ler::<ArgsId, _>(nome, args)?.id)?)
            }
            "timer_pause" => {
                Resultado::Temporizadores(e.timer_pause(ler::<ArgsId, _>(nome, args)?.id)?)
            }
            "timer_reset" => {
                Resultado::Temporizadores(e.timer_reset(ler::<ArgsId, _>(nome, args)?.id)?)
            }
            "stopwatch_start" => Resultado::Cronometro(e.stopwatch_start()?),
            "stopwatch_pause" => Resultado::Cronometro(e.stopwatch_pause()?),
            "stopwatch_lap" => Resultado::Cronometro(e.stopwatch_lap()?),
            "stopwatch_reset" => Resultado::Cronometro(e.stopwatch_reset()?),
            _ => {
                return Err(Erro::web(
                    CodigoWeb::UnknownCommand,
                    format!("comando desconhecido: {nome}"),
                ));
            }
        };
        Ok(self.responder(r))
    }

    /// O retrato do motor (o `get_state` sem `settings` e `recursos`), depois
    /// de fechar o que venceu.
    pub fn retrato(&self) -> Resposta<StateDto> {
        let s = self.engine.state();
        self.responder(s)
    }

    /// Um passo do relógio: fecha o que venceu e, com uma fase correndo,
    /// emite o `tick` se o segundo mostrado mudou. O `resultado` diz se
    /// ainda há algo correndo.
    pub fn passo(&self) -> Resposta<bool> {
        let correndo = self.engine.tick();
        self.responder(correndo)
    }
}

fn para_js<T: Serialize>(valor: &T) -> Result<JsValue, JsValue> {
    // json_compatible: None vira null (não undefined), mapas viram objetos e
    // i64/u64 viram number (erro se passar de 2^53, o que ms de época não faz).
    let ser = serde_wasm_bindgen::Serializer::json_compatible();
    valor.serialize(&ser).map_err(|e| {
        let erro = Erro::web(CodigoWeb::Internal, e.to_string());
        erro.serialize(&ser)
            .unwrap_or_else(|_| JsValue::from_str("erro interno"))
    })
}

fn resposta_js<T: Serialize>(r: Result<T, Erro>) -> Result<JsValue, JsValue> {
    match r {
        Ok(v) => para_js(&v),
        Err(e) => Err(para_js(&e)?),
    }
}

#[wasm_bindgen]
impl Motor {
    /// O motor com o relógio do navegador, ocioso, com os 4 temporizadores
    /// padrão e as preferências padrão (25 e 5; as das configurações chegam
    /// no W07a).
    #[wasm_bindgen(constructor)]
    #[allow(clippy::new_without_default)]
    pub fn new() -> Self {
        Self::com_relogio(Box::new(RelogioJs))
    }

    /// `comando(nome, args)`: devolve `{ resultado, efeitos, proximoPrazo }`
    /// ou lança `{ code, message }`.
    pub fn comando(&self, nome: &str, args: JsValue) -> Result<JsValue, JsValue> {
        resposta_js(self.executar(nome, serde_wasm_bindgen::Deserializer::from(args)))
    }

    /// `{ resultado: <StateDto>, efeitos, proximoPrazo }`.
    pub fn estado(&self) -> Result<JsValue, JsValue> {
        para_js(&self.retrato())
    }

    /// `{ resultado: <ainda corre>, efeitos, proximoPrazo }`.
    pub fn tick(&self) -> Result<JsValue, JsValue> {
        para_js(&self.passo())
    }

    /// Se há algo que vence (uma fase ou um temporizador rumo ao zero).
    #[wasm_bindgen(js_name = estaCorrendo)]
    pub fn esta_correndo(&self) -> bool {
        self.engine.is_running()
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
    use serde_json::{Value, json};
    use tomatito_core::FakeClock;
    #[cfg(target_family = "wasm")]
    use wasm_bindgen_test::wasm_bindgen_test as test;

    const T0: EpochMs = EpochMs(1_790_000_000_000);

    fn motor() -> (Motor, FakeClock) {
        let relogio = FakeClock::new(T0);
        (Motor::com_relogio(Box::new(relogio.clone())), relogio)
    }

    fn tipos(efeitos: &[Efeito]) -> Vec<&'static str> {
        efeitos
            .iter()
            .map(|e| match e {
                Efeito::State(_) => "state",
                Efeito::Tick(_) => "tick",
                Efeito::Phase(_) => "phase",
                Efeito::Sound(_) => "sound",
                Efeito::Notice(_) => "notice",
                Efeito::Period(_) => "period",
                Efeito::Timers(_) => "timers",
                Efeito::TimerNotice(_) => "timerNotice",
                Efeito::Stopwatch(_) => "stopwatch",
            })
            .collect()
    }

    #[test]
    fn iniciar_devolve_o_retrato_os_efeitos_e_o_prazo() {
        let (m, _) = motor();
        let r = m.executar("focus_start", json!({ "minutes": 25 })).unwrap();
        let Resultado::Foco(f) = &r.resultado else {
            panic!("focus_start devolve o retrato do foco");
        };
        assert_eq!(f.session.as_ref().unwrap().remaining_ms, 1_500_000);
        assert_eq!(tipos(&r.efeitos), ["state", "phase"]);
        assert_eq!(r.proximo_prazo, Some(T0.0 + 1_500_000));
        assert!(m.engine.is_running());
    }

    #[test]
    fn a_fila_esvazia_a_cada_chamada() {
        let (m, _) = motor();
        m.executar("focus_start", json!({ "minutes": 25 })).unwrap();
        let r = m.retrato();
        assert!(r.efeitos.is_empty(), "{:?}", r.efeitos);
        assert_eq!(r.proximo_prazo, Some(T0.0 + 1_500_000));
    }

    #[test]
    fn tick_fecha_a_fase_vencida_com_periodo_som_e_aviso() {
        let (m, relogio) = motor();
        m.executar("focus_start", json!({ "minutes": 55 })).unwrap();
        relogio.advance_ms(25 * 60_000);
        let r = m.passo();
        assert!(r.resultado, "o intervalo corre");
        assert_eq!(
            tipos(&r.efeitos),
            ["period", "state", "phase", "sound", "notice", "tick"]
        );
        assert_eq!(r.proximo_prazo, Some(T0.0 + 30 * 60_000));
    }

    #[test]
    fn erro_do_motor_tem_o_code_do_desktop() {
        let (m, _) = motor();
        let e = m.executar("focus_pause", json!(null)).unwrap_err();
        let v = serde_json::to_value(&e).unwrap();
        assert_eq!(
            v,
            json!({ "code": "notRunning", "message": "não há fase correndo para pausar" })
        );
    }

    #[test]
    fn comando_desconhecido_e_args_invalidos() {
        let (m, _) = motor();
        let v = serde_json::to_value(m.executar("app_quit", json!({})).unwrap_err()).unwrap();
        assert_eq!(v["code"], "unknownCommand");
        let v = serde_json::to_value(m.executar("focus_start", json!({})).unwrap_err()).unwrap();
        assert_eq!(v["code"], "invalidArgs");
        let v = serde_json::to_value(
            m.executar("focus_start", json!({ "minutes": 1000 }))
                .unwrap_err(),
        )
        .unwrap();
        assert_eq!(v["code"], "invalidMinutes");
    }

    #[test]
    fn temporizador_e_cronometro_pelo_despachante() {
        let (m, relogio) = motor();
        let r = m
            .executar(
                "timer_create",
                json!({ "name": "Chá", "durationMs": 120_000 }),
            )
            .unwrap();
        let Resultado::Temporizadores(t) = &r.resultado else {
            panic!("timer_create devolve os temporizadores");
        };
        let id = t.timers.last().unwrap().id;
        m.executar("timer_start", json!({ "id": id })).unwrap();
        assert_eq!(
            m.retrato().proximo_prazo,
            Some(T0.0 + 120_000),
            "o temporizador conta no prazo"
        );
        relogio.advance_ms(120_000);
        let r = m.passo();
        assert!(!r.resultado, "passado o zero, nada vence");
        assert_eq!(tipos(&r.efeitos), ["sound", "timerNotice", "timers"]);
        assert_eq!(r.proximo_prazo, None);

        let r = m.executar("stopwatch_start", json!(null)).unwrap();
        assert!(matches!(r.resultado, Resultado::Cronometro(_)));
        assert_eq!(tipos(&r.efeitos), ["stopwatch"]);
        let e = m.executar("stopwatch_start", json!(null)).unwrap_err();
        assert_eq!(serde_json::to_value(e).unwrap()["code"], "alreadyRunning");
    }

    #[test]
    fn efeitos_no_formato_tipo_e_dados() {
        let (m, relogio) = motor();
        m.executar("focus_start", json!({ "minutes": 55, "taskId": 7 }))
            .unwrap();
        relogio.advance_ms(25 * 60_000);
        let v: Value = serde_json::to_value(m.passo()).unwrap();
        let efeitos = v["efeitos"].as_array().unwrap();
        assert_eq!(efeitos[0]["tipo"], "period");
        assert_eq!(efeitos[0]["dados"]["taskId"], 7);
        assert_eq!(efeitos[0]["dados"]["plannedS"], 1500);
        assert_eq!(efeitos[3], json!({ "tipo": "sound", "dados": "focusEnd" }));
        assert_eq!(efeitos[4]["dados"]["kind"], "focusEnded");
        assert_eq!(efeitos[4]["dados"]["breakS"], 300);
        assert_eq!(v["proximoPrazo"], T0.0 + 30 * 60_000);
        assert_eq!(v["resultado"], true);
    }

    #[test]
    fn todos_os_comandos_da_lista_sao_atendidos() {
        let (m, _) = motor();
        for c in COMANDOS {
            if let Err(Erro::Web { code, .. }) =
                m.executar(c, json!({ "minutes": 25, "id": 1, "durationMs": 60_000 }))
            {
                assert_ne!(code, CodigoWeb::UnknownCommand, "{c}");
            }
        }
    }

    #[test]
    fn fuso_com_nome_iana() {
        let tz = TimeZone::get("America/Sao_Paulo").unwrap();
        assert_eq!(nome_do_fuso(&tz), Some("America/Sao_Paulo"));
    }
}
