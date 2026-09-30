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

use std::cell::Cell;
use std::sync::{Mutex, PoisonError};

use serde::de::DeserializeOwned;
use serde::{Deserialize, Deserializer, Serialize};
use serde_json::{Map, Value};
use tomatito_core::{
    Clock, DayRange, EpochMs, Notice, Period, Sound, TimeZone, TimerEnded, TimerId, stats_ranges,
};
use tomatito_motor::engine::{CommandError, Engine, Preferencias, Sink};
use tomatito_motor::events::{
    FocusDto, PhaseDto, PhaseEventDto, PhaseKindDto, StateDto, StopwatchDto, TickDto, TimersDto,
};
use tomatito_motor::i18n::{self, NoticeText};
use tomatito_motor::settings::{Applied, Settings, SettingsError, aplicar_patch, apply};
use tomatito_motor::state_file::{
    Restored, SCHEMA_VERSION, SavedFocus, SavedStopwatch, SavedTimer, StateFile,
};
use tomatito_motor::tasks::{clean_title, visible_since};
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

/// `Notice` no fio: os dados do aviso. Instantes em ms de época. O texto
/// vai ao lado, no [`AvisoWebDto`] (W13).
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

/// Um texto de notificação pronto (o `NoticeText` do `i18n.rs`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct TextoDto {
    pub title: String,
    pub body: Option<String>,
}

impl From<NoticeText> for TextoDto {
    fn from(t: NoticeText) -> Self {
        Self {
            title: t.title,
            body: t.body,
        }
    }
}

/// O efeito `notice` (W13): os dados do aviso (os mesmos campos do
/// [`AvisoDto`], com o `kind`), o `prazo` da fase que acabou e os textos do
/// `i18n.rs`, no fuso do navegador. O `textoComAtraso` (o
/// [`i18n::notice_com_atraso`], com "às HH:MM") é o que o avisos.js mostra
/// quando o aviso sai de 10 a 60 s depois do prazo; o atrasado (mais de
/// 60 s) já vem com a hora no `texto` e não tem o outro.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AvisoWebDto {
    #[serde(flatten)]
    pub aviso: AvisoDto,
    pub prazo: Option<i64>,
    pub texto: TextoDto,
    pub texto_com_atraso: Option<TextoDto>,
}

impl AvisoWebDto {
    /// `prazo`: o fim da última fase fechada (o `endedAt` do último período
    /// concluído do mesmo passo, que o núcleo grava antes do aviso).
    pub fn novo(notice: Notice, prazo: Option<EpochMs>, tz: &TimeZone) -> Self {
        let prazo = match notice {
            Notice::Late { ended_at, .. } => Some(ended_at),
            _ => prazo,
        };
        let texto_com_atraso = match (notice, prazo) {
            (Notice::Late { .. }, _) | (_, None) => None,
            (_, Some(p)) => Some(i18n::notice_com_atraso(&notice, p, tz).into()),
        };
        Self {
            aviso: notice.into(),
            prazo: prazo.map(|p| p.0),
            texto: i18n::notice(&notice, tz).into(),
            texto_com_atraso,
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

/// O fim de um temporizador, para o aviso (W13), com os textos do
/// `i18n.rs` no fuso do navegador. O `textoComAtraso` ("Temporizador
/// encerrado às 14:32") é o do fim atrasado, para o avisos.js usar quando o
/// aviso sai de 10 a 60 s depois do `endedAt`; o atrasado já o tem no
/// `texto`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FimDoTemporizadorDto {
    pub id: TimerId,
    pub name: String,
    pub duration_ms: u64,
    pub ended_at: i64,
    pub late: bool,
    pub texto: TextoDto,
    pub texto_com_atraso: Option<TextoDto>,
}

impl FimDoTemporizadorDto {
    pub fn novo(e: &TimerEnded, tz: &TimeZone) -> Self {
        let texto_com_atraso = (!e.late).then(|| {
            let atrasado = TimerEnded {
                late: true,
                ..e.clone()
            };
            i18n::timer_ended(&atrasado, tz).into()
        });
        Self {
            id: e.id,
            name: e.name.clone(),
            duration_ms: e.duration_ms,
            ended_at: e.ended_at.0,
            late: e.late,
            texto: i18n::timer_ended(e, tz).into(),
            texto_com_atraso,
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
    Notice(AvisoWebDto),
    Period(PeriodoDto),
    Timers(TimersDto),
    TimerNotice(FimDoTemporizadorDto),
    Stopwatch(StopwatchDto),
}

/// O `Sink` da web: enfileira os efeitos como dados.
#[derive(Debug, Default)]
pub struct WebSink {
    fila: Mutex<Vec<Efeito>>,
    /// O fim do último período concluído, até o aviso que vem depois dele
    /// no mesmo passo (o `advance_to` do núcleo grava os períodos antes do
    /// aviso): o prazo que o aviso não traz.
    ultimo_prazo: Mutex<Option<EpochMs>>,
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
        let prazo = self
            .ultimo_prazo
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .take();
        self.por(Efeito::Notice(AvisoWebDto::novo(
            notice,
            prazo,
            &TimeZone::system(),
        )));
    }
    fn period(&self, period: &Period) {
        if period.completed {
            *self
                .ultimo_prazo
                .lock()
                .unwrap_or_else(PoisonError::into_inner) = Some(period.ended_at);
        }
        self.por(Efeito::Period(period.into()));
    }
    fn timers(&self, timers: &TimersDto) {
        self.por(Efeito::Timers(timers.clone()));
    }
    fn timer_notice(&self, ended: &TimerEnded) {
        self.por(Efeito::TimerNotice(FimDoTemporizadorDto::novo(
            ended,
            &TimeZone::system(),
        )));
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
    /// W09: o `lastSessionId` já guardado (o retrato não o leva, e no ocioso
    /// ele não pode voltar a 0), como o `StateStore` do desktop o guarda.
    ultimo_id: Cell<i64>,
}

/// A parte em Rust puro, testável no nativo com um relógio de teste (as
/// funções com `JsValue` só rodam dentro do wasm).
impl Motor {
    /// O motor com outro relógio (os testes usam o `FakeClock`).
    #[doc(hidden)]
    pub fn com_relogio(relogio: Box<dyn Clock>) -> Self {
        Self {
            engine: Engine::new(relogio, 1.0, WebSink::default()),
            ultimo_id: Cell::new(0),
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

    /// As preferências do motor a partir das configurações (F e B da próxima
    /// sessão e os sons de fim de fase), como o `settings_set` do desktop faz
    /// a cada gravação (M38).
    pub fn aplicar_configuracoes(&self, s: &Settings) {
        self.engine.configurar(Preferencias::from(s));
    }

    /// Um passo do relógio: fecha o que venceu e, com uma fase correndo,
    /// emite o `tick` se o segundo mostrado mudou. O `resultado` diz se
    /// ainda há algo correndo.
    pub fn passo(&self) -> Resposta<bool> {
        let correndo = self.engine.tick();
        self.responder(correndo)
    }

    /// W09: a retomada ao abrir a aba, como o `setup` do desktop faz com o
    /// `state.json` (M40): lê o texto de `tomatito:estado` ([`ler_estado`]),
    /// guarda o `lastSessionId` e entrega as partes ao
    /// [`Engine::restaurar`], que roda o `advance_to(agora)` com a regra do
    /// atraso (mais de 60 s depois do prazo: sem som e um aviso só,
    /// "Sessão concluída às 14:32"). Os efeitos desse fechamento (o
    /// período, o aviso, o fim do temporizador) vêm na resposta.
    pub fn retomar(&self, texto: Option<&str>) -> Resposta<CargaDto> {
        let Carga {
            restored,
            ultimo_id,
            avisos,
            corrompido,
        } = ler_estado(texto);
        self.ultimo_id.set(ultimo_id);
        self.engine.restaurar(restored);
        self.responder(CargaDto { avisos, corrompido })
    }

    /// W09: o que vai para `tomatito:estado`: as três partes de uma vez, no
    /// formato do `state.json` (o `save_all` do desktop), a partir do
    /// retrato atual. A web grava o arquivo inteiro a cada transição.
    pub fn para_gravar(&self) -> Resposta<StateFile> {
        let estado = self.engine.state();
        let focus = SavedFocus::from_dto(&estado.focus, self.ultimo_id.get());
        self.ultimo_id.set(focus.last_session_id);
        let arquivo = StateFile {
            schema_version: SCHEMA_VERSION,
            saved_at: estado.focus.at,
            focus: Some(focus),
            timers: Some(
                estado
                    .timers
                    .timers
                    .iter()
                    .map(SavedTimer::from_dto)
                    .collect(),
            ),
            stopwatch: Some((&estado.stopwatch).into()),
        };
        self.responder(arquivo)
    }
}

// ---------------------------------------------------------------------------
// Retomada (W09): a carga do `state.json` do desktop (`StateStore::load`),
// sobre o texto de `tomatito:estado` no localStorage.
// ---------------------------------------------------------------------------

/// O que o texto gravado trouxe.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Carga {
    pub restored: Restored,
    /// O `lastSessionId` gravado (0 sem foco).
    pub ultimo_id: i64,
    /// O que o desktop escreve no registro, para o JS pôr no console.
    pub avisos: Vec<String>,
    /// O texto não abriu como objeto JSON: o JS o guarda à parte (o
    /// `state.corrompido.json` do desktop).
    pub corrompido: bool,
}

/// O `resultado` do `restaurar`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct CargaDto {
    pub avisos: Vec<String>,
    pub corrompido: bool,
}

/// Lê a parte `chave` do objeto; ilegível, anota e devolve `None`.
fn parte<T: DeserializeOwned>(
    objeto: &Map<String, Value>,
    chave: &str,
    avisos: &mut Vec<String>,
) -> Option<T> {
    let v = objeto.get(chave)?;
    match T::deserialize(v) {
        Ok(t) => Some(t),
        Err(e) => {
            avisos.push(format!(
                "tomatito:estado: \"{chave}\" ilegível ({e}); fica o padrão"
            ));
            None
        }
    }
}

/// A carga do `StateStore::load` do desktop, sem o arquivo: ausente dá o
/// padrão; um texto que não abre como objeto JSON é marcado `corrompido`;
/// uma `schemaVersion` desconhecida é ignorada inteira; cada parte vale
/// sozinha (ilegível, fica o padrão dela, e as outras entram).
pub fn ler_estado(texto: Option<&str>) -> Carga {
    let mut carga = Carga::default();
    let Some(texto) = texto else {
        return carga;
    };
    let objeto = match serde_json::from_str::<Value>(texto) {
        Ok(Value::Object(m)) => m,
        outro => {
            let motivo = match outro {
                Err(e) => e.to_string(),
                Ok(_) => "não é um objeto JSON".to_owned(),
            };
            carga.avisos.push(format!(
                "tomatito:estado ilegível ({motivo}); abrindo sem ele, e o original ficou em tomatito:estado.corrompido"
            ));
            carga.corrompido = true;
            return carga;
        }
    };
    let versao = objeto.get("schemaVersion").and_then(Value::as_u64);
    if versao != Some(u64::from(SCHEMA_VERSION)) {
        carga.avisos.push(format!(
            "tomatito:estado na versão {versao:?}, que esta versão não lê; abrindo sem ele"
        ));
        return carga;
    }
    let avisos = &mut carga.avisos;
    let focus: Option<SavedFocus> = parte(&objeto, "focus", avisos);
    let timers: Option<Vec<SavedTimer>> = parte(&objeto, "timers", avisos);
    let stopwatch: Option<SavedStopwatch> = parte(&objeto, "stopwatch", avisos);
    let sessao = focus.as_ref().and_then(|f| {
        let s = f.session.as_ref()?;
        let r = s.record();
        if r.is_none() {
            avisos.push(format!(
                "tomatito:estado: sessão {} sem o campo do estado; fica ociosa",
                s.id
            ));
        }
        r
    });
    carga.ultimo_id = focus.as_ref().map_or(0, |f| f.last_session_id);
    carga.restored = Restored {
        focus: focus.as_ref().map(|f| (f.last_session_id, sessao)),
        timers: timers.map(|lista| {
            lista
                .iter()
                .filter_map(|t| {
                    let r = t.record();
                    if r.is_none() {
                        avisos.push(format!(
                            "tomatito:estado: temporizador {} sem o campo do estado; fica de fora",
                            t.id
                        ));
                    }
                    r
                })
                .collect()
        }),
        stopwatch: stopwatch.as_ref().map(SavedStopwatch::record),
    };
    carga
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

    /// `configurar(json)`: as configurações (o JSON de um `settings_get`)
    /// viram as preferências do motor. Lança `{ code, message }` se o JSON
    /// não for umas configurações.
    pub fn configurar(&self, json: &str) -> Result<(), JsValue> {
        let s: Settings = serde_json::from_str(json).map_err(|e| {
            para_js(&Erro::web(CodigoWeb::InvalidArgs, e.to_string())).unwrap_or_else(|e| e)
        })?;
        self.aplicar_configuracoes(&s);
        Ok(())
    }

    /// W09: `restaurar(texto | null)`, uma vez, logo depois do
    /// `configurar`: `{ resultado: { avisos, corrompido }, efeitos,
    /// proximoPrazo }`.
    pub fn restaurar(&self, texto: Option<String>) -> Result<JsValue, JsValue> {
        para_js(&self.retomar(texto.as_deref()))
    }

    /// W09: `{ resultado: <o objeto de tomatito:estado>, efeitos,
    /// proximoPrazo }`; o JS o grava com `JSON.stringify` (o `serde_json`
    /// não escreve texto aqui, e o `.wasm` fica menor).
    pub fn gravavel(&self) -> Result<JsValue, JsValue> {
        para_js(&self.para_gravar())
    }

    /// Se há algo que vence (uma fase ou um temporizador rumo ao zero).
    #[wasm_bindgen(js_name = estaCorrendo)]
    pub fn esta_correndo(&self) -> bool {
        self.engine.is_running()
    }
}

// ---------------------------------------------------------------------------
// Configurações (W07a): o `settings.rs` do motor, sem o arquivo. A web guarda
// o JSON no localStorage (`tomatito:config`); a leitura e o patch passam por
// aqui, com as mesmas regras e os mesmos erros do desktop.
// ---------------------------------------------------------------------------

/// A leitura do `settings.json` do desktop (`load_from`), sobre um texto:
/// ausente, ilegível ou que não é objeto dá os padrões; um objeto passa
/// chave por chave pelo `apply` (as inválidas ficam no padrão, as
/// desconhecidas são ignoradas) e depois pelas regras de tema.
pub fn normalizar(texto: Option<&str>) -> Settings {
    let objeto = match texto.map(serde_json::from_str::<serde_json::Value>) {
        Some(Ok(serde_json::Value::Object(m))) => m,
        _ => return Settings::default(),
    };
    let Applied { mut settings, .. } = apply(&Settings::default(), &objeto);
    settings.normalize();
    settings
}

/// O `settings_set` sem a gravação: o patch (texto JSON) sobre as
/// configurações `base` (texto JSON, já normalizado). Um JSON ilegível no
/// patch é recusado como um patch que não é objeto (`invalidPatch`).
pub fn patch(base: Option<&str>, patch: &str) -> Result<Settings, SettingsError> {
    let base = normalizar(base);
    let valor = serde_json::from_str::<serde_json::Value>(patch).unwrap_or(serde_json::Value::Null);
    aplicar_patch(&base, &valor)
}

/// `normalizarConfig(texto | null)`: as configurações normalizadas, como o
/// `settings_get` as devolve.
#[wasm_bindgen(js_name = normalizarConfig)]
pub fn normalizar_config(texto: Option<String>) -> Result<JsValue, JsValue> {
    para_js(&normalizar(texto.as_deref()))
}

/// `aplicarPatch(base | null, patch)`: as configurações novas, ou lança o
/// `{ code, message }` do `SettingsError` do desktop.
#[wasm_bindgen(js_name = aplicarPatch)]
pub fn aplicar_patch_js(base: Option<String>, patch_json: &str) -> Result<JsValue, JsValue> {
    match patch(base.as_deref(), patch_json) {
        Ok(s) => para_js(&s),
        Err(e) => Err(para_js(&e)?),
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

// ---------------------------------------------------------------------------
// Estatísticas e tarefas (W08): as regras de dia do desktop, sem o SQLite. A
// web guarda os períodos e as tarefas no IndexedDB (armazenamento.js) e pede
// aqui só o que depende do fuso e das regras do motor.
// ---------------------------------------------------------------------------

/// Um intervalo `[start, end)` em ms UTC.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct FaixaDto {
    pub start: i64,
    pub end: i64,
}

impl From<DayRange> for FaixaDto {
    fn from(r: DayRange) -> Self {
        Self {
            start: r.start.0,
            end: r.end.0,
        }
    }
}

/// Ontem, hoje e esta semana: as faixas que o `Stats::summary` do desktop
/// soma (`stats_ranges`, com a hora de zerar e o horário de verão).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct FaixasDto {
    pub yesterday: FaixaDto,
    pub today: FaixaDto,
    pub week: FaixaDto,
}

/// As faixas vistas de `agora` no fuso `tz`, ou `None` com um instante fora
/// da faixa do jiff (o desktop soma 0 nesse caso).
pub fn faixas_em(agora: EpochMs, tz: &TimeZone, hora_de_zerar: u8) -> Option<FaixasDto> {
    stats_ranges(agora, tz, hora_de_zerar).map(|r| FaixasDto {
        yesterday: r.yesterday.into(),
        today: r.today.into(),
        week: r.week.into(),
    })
}

/// `faixas(agora, horaDeZerar)`: `{ yesterday, today, week }`, cada uma
/// `{ start, end }` em ms, no fuso do navegador; ou `null`.
#[wasm_bindgen(js_name = faixas)]
pub fn faixas_js(agora: f64, hora_de_zerar: u8) -> Result<JsValue, JsValue> {
    para_js(&faixas_em(
        EpochMs(agora as i64),
        &TimeZone::system(),
        hora_de_zerar,
    ))
}

/// `limparTitulo(titulo)`: o título como o `task_add` do desktop o grava, ou
/// lança o `{ code, message }` do `TaskError` (`emptyTitle`, `titleTooLong`).
#[wasm_bindgen(js_name = limparTitulo)]
pub fn limpar_titulo(titulo: &str) -> Result<String, JsValue> {
    clean_title(titulo).map_err(|e| para_js(&e).unwrap_or_else(|e| e))
}

/// `visivelDesde(agora, horaDeZerar)`: a última virada do dia (ms), no fuso
/// do navegador; as tarefas concluídas antes dela saem da lista.
#[wasm_bindgen(js_name = visivelDesde)]
pub fn visivel_desde(agora: f64, hora_de_zerar: u8) -> f64 {
    visible_since(EpochMs(agora as i64), &TimeZone::system(), hora_de_zerar).0 as f64
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
    fn configuracoes_normalizadas_como_no_desktop() {
        // Nada, lixo ou um valor que não é objeto: os padrões.
        for texto in [None, Some("{"), Some("[1]"), Some("null")] {
            assert_eq!(normalizar(texto), Settings::default(), "{texto:?}");
        }
        // Chave inválida fica no padrão; desconhecida é ignorada; o tema fixo
        // leva o resolvedTheme e o lastNormalTheme junto.
        let s = normalizar(Some(
            r#"{"theme":"dark","volume":300,"tema":"x","focusMinutes":50}"#,
        ));
        assert_eq!(s.focus_minutes, 50);
        assert_eq!(s.volume, Settings::default().volume);
        let v = serde_json::to_value(&s).unwrap();
        assert_eq!(
            (&v["theme"], &v["resolvedTheme"], &v["lastNormalTheme"]),
            (&json!("dark"), &json!("dark"), &json!("dark"))
        );
    }

    #[test]
    fn patch_recusado_com_o_code_do_desktop() {
        // Os casos do teste de recusa do settings.rs do desktop.
        let casos = [
            (json!(["theme", "dark"]), "invalidPatch"),
            (json!({ "theme": "dark", "tema": "dark" }), "unknownKey"),
            (json!({ "schemaVersion": 2 }), "unknownKey"),
            (json!({ "theme": "dark", "volume": 101 }), "invalidValue"),
            (
                json!({ "dailyGoalMinutes": 60, "resetHour": 24 }),
                "invalidValue",
            ),
            (json!({ "focusMinutes": 25.5 }), "invalidValue"),
        ];
        for (p, code) in casos {
            let e = patch(None, &p.to_string()).unwrap_err();
            assert_eq!(serde_json::to_value(&e).unwrap()["code"], code, "{p}");
        }
        assert_eq!(
            serde_json::to_value(patch(None, "{").unwrap_err()).unwrap()["code"],
            "invalidPatch"
        );
        let s = patch(Some(r#"{"theme":"suave"}"#), r#"{"breakMinutes":10}"#).unwrap();
        assert_eq!((s.break_minutes, s.theme.as_str()), (10, "suave"));
    }

    #[test]
    fn configurar_muda_o_intervalo_da_proxima_sessao() {
        let (m, relogio) = motor();
        let s = patch(None, r#"{"breakMinutes":10}"#).unwrap();
        m.aplicar_configuracoes(&s);
        m.executar("focus_start", json!({ "minutes": 60 })).unwrap();
        relogio.advance_min(25);
        let v: Value = serde_json::to_value(m.passo()).unwrap();
        let aviso = v["efeitos"]
            .as_array()
            .unwrap()
            .iter()
            .find(|e| e["tipo"] == "notice")
            .unwrap()
            .clone();
        assert_eq!(aviso["dados"]["breakS"], 600, "{aviso}");
    }

    fn efeito<'a>(efeitos: &'a [Value], tipo: &str) -> &'a Value {
        &efeitos
            .iter()
            .find(|e| e["tipo"] == tipo)
            .unwrap_or_else(|| panic!("sem {tipo}: {efeitos:?}"))["dados"]
    }

    fn texto(t: NoticeText) -> Value {
        json!({ "title": t.title, "body": t.body })
    }

    /// W13: o aviso leva os dados, o prazo e os textos do `i18n.rs` (no fuso
    /// do sistema, o mesmo que o wasm usa no navegador).
    #[test]
    fn aviso_de_fase_com_prazo_e_textos() {
        let (m, relogio) = motor();
        let tz = TimeZone::system();
        m.executar("focus_start", json!({ "minutes": 60 })).unwrap();
        let prazo = T0.plus_ms(1_650_000);
        // 20 s depois do prazo: ainda o aviso normal (o atrasado é de 60 s).
        relogio.advance_ms(1_650_000 + 20_000);
        let v: Value = serde_json::to_value(m.passo()).unwrap();
        let efeitos = v["efeitos"].as_array().unwrap();
        let aviso = efeito(efeitos, "notice");
        let notice = Notice::FocusEnded {
            n: 1,
            blocks: 2,
            break_s: 300,
            next_focus_at: prazo.plus_ms(300_000),
        };
        assert_eq!(aviso["kind"], "focusEnded", "{aviso}");
        assert_eq!(aviso["breakS"], 300, "{aviso}");
        assert_eq!(aviso["prazo"], prazo.0, "{aviso}");
        assert_eq!(aviso["texto"], texto(i18n::notice(&notice, &tz)));
        assert_eq!(
            aviso["textoComAtraso"],
            texto(i18n::notice_com_atraso(&notice, prazo, &tz))
        );
        assert_eq!(efeito(efeitos, "period")["endedAt"], prazo.0);

        // O atrasado já traz a hora no texto, e o prazo é o fim dele.
        let (m, relogio) = motor();
        m.executar("focus_start", json!({ "minutes": 25 })).unwrap();
        relogio.advance_ms(27 * 60_000);
        let v: Value = serde_json::to_value(m.passo()).unwrap();
        let aviso = efeito(v["efeitos"].as_array().unwrap(), "notice");
        assert_eq!(aviso["kind"], "late", "{aviso}");
        assert_eq!(aviso["prazo"], T0.0 + 25 * 60_000);
        assert_eq!(aviso["textoComAtraso"], Value::Null);
        assert!(
            aviso["texto"]["title"]
                .as_str()
                .unwrap()
                .starts_with("Sessão concluída às "),
            "{aviso}"
        );
    }

    #[test]
    fn aviso_de_temporizador_com_textos() {
        let (m, relogio) = motor();
        let tz = TimeZone::system();
        let r = m
            .executar(
                "timer_create",
                json!({ "name": "Chá", "durationMs": 240_000 }),
            )
            .unwrap();
        let Resultado::Temporizadores(t) = &r.resultado else {
            panic!("timer_create devolve os temporizadores");
        };
        let id = t.timers.last().unwrap().id;
        m.executar("timer_start", json!({ "id": id })).unwrap();
        relogio.advance_ms(240_000);
        let v: Value = serde_json::to_value(m.passo()).unwrap();
        let fim = efeito(v["efeitos"].as_array().unwrap(), "timerNotice");
        let ended = TimerEnded {
            id,
            name: "Chá".into(),
            duration_ms: 240_000,
            ended_at: T0.plus_ms(240_000),
            late: false,
        };
        assert_eq!(
            fim["texto"],
            json!({ "title": "Temporizador encerrado", "body": "Chá · 4 min" })
        );
        assert_eq!(
            fim["textoComAtraso"],
            texto(i18n::timer_ended(
                &TimerEnded {
                    late: true,
                    ..ended.clone()
                },
                &tz
            ))
        );
        assert_eq!(fim["endedAt"], ended.ended_at.0);
    }

    #[test]
    fn faixas_com_horario_de_verao() {
        // O dia de 08/03/2026 em Nova York tem 23 h (days.rs, teste
        // horario_de_verao); visto da segunda 09/03 às 00:30 EDT, ele é o
        // "ontem", e a semana começa na virada dessa segunda.
        let ny = TimeZone::get("America/New_York").unwrap();
        let seg_0h30 = EpochMs(1_773_030_600_000); // 2026-03-09T04:30:00Z
        let f = faixas_em(seg_0h30, &ny, 0).unwrap();
        assert_eq!(f.yesterday.end - f.yesterday.start, 23 * 3_600_000);
        assert_eq!(f.today.start, 1_773_028_800_000); // 2026-03-09T04:00:00Z
        assert_eq!(f.yesterday.end, f.today.start);
        assert_eq!(f.week.start, f.today.start);
        assert_eq!(
            serde_json::to_value(f).unwrap()["today"],
            json!({ "start": 1_773_028_800_000_i64, "end": 1_773_115_200_000_i64 })
        );
        assert_eq!(faixas_em(EpochMs(i64::MAX), &TimeZone::UTC, 0), None);
    }

    #[test]
    fn fuso_com_nome_iana() {
        let tz = TimeZone::get("America/Sao_Paulo").unwrap();
        assert_eq!(nome_do_fuso(&tz), Some("America/Sao_Paulo"));
    }

    // -----------------------------------------------------------------------
    // Retomada (W09).
    // -----------------------------------------------------------------------

    /// Grava o motor `m` e abre outro, com o relógio em `agora`, a partir do
    /// texto gravado.
    fn reabrir(m: &Motor, agora: EpochMs) -> (Motor, FakeClock, Resposta<CargaDto>, Value) {
        let texto = serde_json::to_string(&m.para_gravar().resultado).unwrap();
        let v: Value = serde_json::from_str(&texto).unwrap();
        let relogio = FakeClock::new(agora);
        let novo = Motor::com_relogio(Box::new(relogio.clone()));
        let r = novo.retomar(Some(&texto));
        (novo, relogio, r, v)
    }

    fn foco(m: &Motor) -> FocusDto {
        m.retrato().resultado.focus
    }

    #[test]
    fn retomada_no_meio_do_foco_mantem_o_prazo() {
        let (m, relogio) = motor();
        m.executar("focus_start", json!({ "minutes": 25 })).unwrap();
        relogio.advance_ms(5 * 60_000);
        let (novo, _, r, v) = reabrir(&m, EpochMs(T0.0 + 10 * 60_000));
        assert_eq!(v["schemaVersion"], 1);
        assert_eq!(v["focus"]["session"]["endsAt"], T0.0 + 25 * 60_000);
        assert!(r.resultado.avisos.is_empty(), "{:?}", r.resultado.avisos);
        assert!(!r.resultado.corrompido);
        assert!(r.efeitos.is_empty(), "nada venceu: {:?}", tipos(&r.efeitos));
        assert_eq!(r.proximo_prazo, Some(T0.0 + 25 * 60_000));
        let f = foco(&novo);
        assert_eq!(f.session.unwrap().remaining_ms, 15 * 60_000);
        assert!(novo.engine.is_running());
    }

    #[test]
    fn retomada_depois_do_fim_com_atraso_grava_o_periodo_sem_som() {
        let (m, _) = motor();
        m.executar("focus_start", json!({ "minutes": 25 })).unwrap();
        // 2 min depois do fim: mais que os 60 s da regra do atraso.
        let (novo, _, r, _) = reabrir(&m, EpochMs(T0.0 + 27 * 60_000));
        let t = tipos(&r.efeitos);
        assert!(t.contains(&"period"), "{t:?}");
        assert!(!t.contains(&"sound"), "atrasado não toca: {t:?}");
        let avisos: Vec<_> = r
            .efeitos
            .iter()
            .filter_map(|e| match e {
                Efeito::Notice(a) => Some(a.aviso),
                _ => None,
            })
            .collect();
        assert_eq!(avisos.len(), 1, "um aviso só: {avisos:?}");
        let AvisoDto::Late {
            ended_at,
            session_completed,
            ..
        } = &avisos[0]
        else {
            panic!("o aviso é o do atraso: {avisos:?}");
        };
        assert_eq!(*ended_at, T0.0 + 25 * 60_000);
        assert!(*session_completed);
        let periodo = r
            .efeitos
            .iter()
            .find_map(|e| match e {
                Efeito::Period(p) => Some(*p),
                _ => None,
            })
            .unwrap();
        assert_eq!(periodo.ended_at, T0.0 + 25 * 60_000);
        assert!(periodo.completed);
        assert!(!novo.engine.is_running());
    }

    #[test]
    fn retomada_de_temporizador_e_cronometro() {
        let (m, relogio) = motor();
        let r = m
            .executar(
                "timer_create",
                json!({ "name": "Chá", "durationMs": 300_000 }),
            )
            .unwrap();
        let Resultado::Temporizadores(t) = &r.resultado else {
            panic!("timer_create devolve os temporizadores");
        };
        let id = t.timers.last().unwrap().id;
        m.executar("timer_start", json!({ "id": id })).unwrap();
        m.executar("stopwatch_start", json!(null)).unwrap();
        relogio.advance_ms(10_000);
        m.executar("stopwatch_lap", json!(null)).unwrap();
        let (novo, _, r, _) = reabrir(&m, EpochMs(T0.0 + 60_000));
        assert!(r.resultado.avisos.is_empty(), "{:?}", r.resultado.avisos);
        let e = novo.retrato().resultado;
        assert_eq!(e.timers.timers.len(), 5, "os 4 padrão e o novo");
        let cha = e.timers.timers.iter().find(|x| x.id == id).unwrap();
        assert_eq!(cha.name, "Chá");
        assert_eq!(cha.ends_at, Some(T0.0 + 300_000));
        assert_eq!(e.stopwatch.laps.len(), 1);
        assert_eq!(
            serde_json::to_value(&e.stopwatch).unwrap()["status"],
            "running"
        );
        assert_eq!(e.stopwatch.started_at, Some(T0.0));
    }

    #[test]
    fn ultimo_id_continua_no_ocioso() {
        let (m, _) = motor();
        m.executar("focus_start", json!({ "minutes": 25 })).unwrap();
        // A web grava a cada transição, como o desktop a cada `tt://state`.
        m.para_gravar();
        m.executar("focus_stop", json!(null)).unwrap();
        let (novo, _, _, v) = reabrir(&m, T0);
        assert_eq!(v["focus"]["session"], Value::Null);
        let id = v["focus"]["lastSessionId"].as_i64().unwrap();
        assert!(id > 0);
        let v2: Value = serde_json::to_value(novo.para_gravar().resultado).unwrap();
        assert_eq!(v2["focus"]["lastSessionId"], id, "não volta a 0");
        let r = novo
            .executar("focus_start", json!({ "minutes": 25 }))
            .unwrap();
        let Resultado::Foco(f) = r.resultado else {
            panic!("focus_start devolve o foco");
        };
        assert!(f.session.unwrap().id > id, "o id não repete");
    }

    #[test]
    fn texto_ausente_ilegivel_ou_de_outra_versao() {
        assert_eq!(ler_estado(None), Carga::default());
        let c = ler_estado(Some("{nada"));
        assert!(c.corrompido);
        assert_eq!(c.restored, Restored::default());
        assert_eq!(c.avisos.len(), 1);
        let c = ler_estado(Some("[]"));
        assert!(c.corrompido);
        let c = ler_estado(Some(r#"{"schemaVersion":2,"focus":{"lastSessionId":9}}"#));
        assert!(!c.corrompido);
        assert_eq!(c.restored, Restored::default());
        assert_eq!(c.ultimo_id, 0);
        assert_eq!(c.avisos.len(), 1);
        // Uma parte ilegível fica no padrão, e as outras entram.
        let c = ler_estado(Some(
            r#"{"schemaVersion":1,"timers":"x","stopwatch":{"status":"idle","accumulatedMs":0,"laps":[]}}"#,
        ));
        assert_eq!(c.restored.timers, None);
        assert!(c.restored.stopwatch.is_some(), "{:?}", c.avisos);
        assert_eq!(c.avisos.len(), 1, "{:?}", c.avisos);
    }
}
