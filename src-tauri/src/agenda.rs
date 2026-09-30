//! A agenda dos avisos de fim no Android (PLANO-ANDROID 5.2, item 1; A09).
//!
//! Com o app em segundo plano, o processo pode estar congelado ou morto na
//! hora de um fim de fase: o Rust não roda, e quem avisa é um alarme do
//! `AlarmManager` (A10a). Por isso cada aviso é calculado **antes**, a cada
//! transição do motor: [`montar`] lê o retrato do foco e o dos temporizadores
//! e devolve um [`Alarme`] por fim ainda por vir, com o título e o corpo já em
//! pt-BR (os mesmos do `i18n::notice` e do `i18n::timer_ended`), o canal
//! (que decide o som, 5.5) e o que a notificação contínua mostra depois dele
//! (5.3).
//!
//! - Sessão de foco correndo: um item por fim de fase restante do plano. O
//!   plano é fixo desde o início (a regra dos intervalos é determinística), e
//!   sai de novo do `minutes`/`focusMinutes`/`breakMinutes`/`skipBreaks` do
//!   retrato, com o mesmo `Plan::new` do núcleo.
//! - Temporizadores correndo rumo ao zero: um item cada.
//! - Pausado, parado, concluído ou cronômetro: nada.
//!
//! O relógio é o de parede (`ends_at`, em ms desde a época Unix). Com o
//! relógio do motor acelerado (`TOMATITO_SPEED` ≠ 1, só em debug), os prazos
//! do retrato não são instantes de parede, e a agenda é recusada
//! ([`AgendaRecusada`]); no Android o motor nem lê a variável (4.1).
//!
//! A agenda nunca diverge do motor: o teste de equivalência (abaixo) roda o
//! `Engine` com relógio falso até o fim e confere cada `notice` e cada
//! `timer_ended` emitidos contra a agenda montada a cada transição (mesmo
//! instante, mesmo texto, canal de acordo com o som).
//!
//! Só o Android usa este módulo (o `TauriSink`, sob
//! `cfg(target_os = "android")`); no desktop ele só compila nos testes.

use std::fmt;

use serde::Serialize;
use tomatito_core::{EpochMs, Notice, Phase, PhaseKind, Plan, PlanSettings, TimeZone, TimerEnded};

use crate::engine::Preferencias;
use crate::events::{FocusDto, PhaseKindDto, StatusDto, TimerStatusDto, TimersDto};
use crate::i18n::{self, NoticeText};

/// Os canais de aviso (5.5), com os ids de `Canais` na Kotlin (A08).
pub mod canal {
    pub const FIM_FOCO: &str = "fim-foco";
    pub const FIM_INTERVALO: &str = "fim-intervalo";
    pub const FIM_TEMPORIZADOR: &str = "fim-temporizador";
    pub const FIM_SEM_SOM: &str = "fim-sem-som";
}

/// Os ids dos temporizadores começam aqui; os das fases do foco são
/// `1 + índice da fase` (uma sessão de 240 min com F = B = 1 tem menos de 250
/// fases). O id também é o código de pedido do `PendingIntent` (5.2, item 3),
/// um `Int` na Kotlin.
const BASE_TEMPORIZADOR: i32 = 100_000;

/// Um aviso agendado, no formato combinado com a Kotlin no A07b
/// (`Agenda.deJson`, `Puras.kt`): chaves em camelCase.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Alarme {
    pub id: i32,
    /// O instante do fim, no relógio de parede.
    pub quando_ms: i64,
    /// Um dos [`canal`].
    pub canal: &'static str,
    pub titulo: String,
    pub corpo: Option<String>,
    /// A notificação contínua depois deste aviso; `None`: ela sai.
    pub continua_depois: Option<Continua>,
}

/// O que a notificação contínua mostra (5.3). Leva o tipo e os dados, não o
/// texto: o "Termina às …" é montado na Kotlin, no fuso do aparelho na hora
/// de mostrar (A07b).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Continua {
    /// `foco`, `intervalo` ou `temporizador`.
    pub tipo: &'static str,
    /// O nome do temporizador (vazio nos outros tipos).
    pub nome: String,
    /// O prazo da fase ou do temporizador; 0 com a fase pausada.
    pub fim_ms: i64,
    pub pausado: bool,
    /// O que falta, com a fase pausada.
    pub restante_ms: i64,
}

/// A agenda não foi montada.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum AgendaRecusada {
    /// O relógio do motor anda a `speed`× (`TOMATITO_SPEED`): os prazos do
    /// retrato não são instantes do relógio de parede do `AlarmManager`.
    Acelerada { speed: f64 },
}

impl fmt::Display for AgendaRecusada {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Acelerada { speed } => write!(
                f,
                "agenda recusada: relógio do motor a {speed}× (TOMATITO_SPEED); o AlarmManager usa o relógio de parede"
            ),
        }
    }
}

impl std::error::Error for AgendaRecusada {}

/// Uma fase do plano com o intervalo de tempo em que corre.
#[derive(Debug, Clone, Copy)]
struct Janela {
    fase: Phase,
    inicio: i64,
    fim: i64,
}

fn tipo_da_fase(kind: PhaseKind) -> &'static str {
    match kind {
        PhaseKind::Focus => "foco",
        PhaseKind::Break => "intervalo",
    }
}

fn ms(duracao_s: u64) -> i64 {
    i64::try_from(duracao_s.saturating_mul(1000)).unwrap_or(i64::MAX)
}

/// As fases que faltam da sessão correndo, da atual à última, com os
/// prazos, e o plano; `None` se não há fase correndo.
fn fases_restantes(focus: &FocusDto) -> Option<(Plan, Vec<Janela>)> {
    if !matches!(focus.status, StatusDto::Focus | StatusDto::Break) {
        return None;
    }
    let s = focus.session.as_ref()?;
    let ends_at = s.ends_at?;
    let plano = Plan::new(
        s.minutes,
        PlanSettings {
            focus_minutes: s.focus_minutes,
            break_minutes: s.break_minutes,
        },
        s.skip_breaks,
    )
    .ok()?;
    let atual = plano.phase(s.phase_index)?;
    let mut janelas = vec![Janela {
        fase: atual,
        inicio: ends_at.saturating_sub(ms(atual.duration_s)),
        fim: ends_at,
    }];
    let mut i = s.phase_index + 1;
    while let Some(fase) = plano.phase(i) {
        let inicio = janelas.last().map_or(ends_at, |j| j.fim);
        janelas.push(Janela {
            fase,
            inicio,
            fim: inicio.saturating_add(ms(fase.duration_s)),
        });
        i += 1;
    }
    Some((plano, janelas))
}

/// O aviso do núcleo no fim da janela `k` (o mesmo `notice_after` do
/// `focus.rs`, calculado adiante): `foco_s` já soma a fase que termina.
fn aviso_no_fim(plano: &Plan, janelas: &[Janela], k: usize, minutes: u32, foco_s: u64) -> Notice {
    let fim = janelas[k].fase;
    match janelas.get(k + 1) {
        None => Notice::SessionCompleted {
            total_minutes: minutes,
            focus_s: foco_s,
        },
        Some(prox) => match fim.kind {
            PhaseKind::Focus => Notice::FocusEnded {
                n: fim.n,
                blocks: plano.blocks(),
                break_s: prox.fase.duration_s,
                next_focus_at: EpochMs(prox.fim),
            },
            PhaseKind::Break => Notice::BreakEnded {
                next_n: prox.fase.n,
                blocks: plano.blocks(),
                next_focus_s: prox.fase.duration_s,
            },
        },
    }
}

/// O canal de um fim de fase: o do som, se ele está ligado nas
/// configurações (o motor filtra os sons pelas mesmas `Preferencias`, M38).
fn canal_da_fase(kind: PhaseKind, prefs: &Preferencias) -> &'static str {
    match kind {
        PhaseKind::Focus if prefs.som_fim_de_foco => canal::FIM_FOCO,
        PhaseKind::Break if prefs.som_fim_de_intervalo => canal::FIM_INTERVALO,
        _ => canal::FIM_SEM_SOM,
    }
}

/// Um temporizador correndo rumo ao zero: `(id, nome, duração, prazo)`.
type Correndo<'a> = (u64, &'a str, u64, i64);

fn temporizadores_correndo(timers: &TimersDto) -> Vec<Correndo<'_>> {
    timers
        .timers
        .iter()
        .filter(|t| t.status == TimerStatusDto::Running && !t.ended)
        .filter_map(|t| t.ends_at.map(|e| (t.id, t.name.as_str(), t.duration_ms, e)))
        .collect()
}

fn id_do_temporizador(id: u64) -> i32 {
    // `% 1e9` cabe em i32 com a base somada (< 2^31).
    BASE_TEMPORIZADOR + i32::try_from(id % 1_000_000_000).expect("cabe em i32")
}

/// A contínua logo depois do instante `t` (com os fins de `t` já
/// disparados): a fase da sessão que corre em `t`; a sessão pausada; ou o
/// temporizador que vence primeiro depois de `t`. A sessão tem precedência.
fn continua_em(
    t: i64,
    focus: &FocusDto,
    janelas: &[Janela],
    correndo: &[Correndo<'_>],
) -> Option<Continua> {
    if let Some(j) = janelas.iter().find(|j| j.inicio <= t && t < j.fim) {
        return Some(Continua {
            tipo: tipo_da_fase(j.fase.kind),
            nome: String::new(),
            fim_ms: j.fim,
            pausado: false,
            restante_ms: 0,
        });
    }
    if focus.status == StatusDto::Paused
        && let Some(s) = &focus.session
    {
        return Some(Continua {
            tipo: match s.phase.kind {
                PhaseKindDto::Focus => "foco",
                PhaseKindDto::Break => "intervalo",
            },
            nome: String::new(),
            fim_ms: 0,
            pausado: true,
            restante_ms: i64::try_from(s.remaining_ms).unwrap_or(i64::MAX),
        });
    }
    correndo
        .iter()
        .filter(|(_, _, _, fim)| *fim > t)
        .min_by_key(|(id, _, _, fim)| (*fim, *id))
        .map(|(_, nome, _, fim)| Continua {
            tipo: "temporizador",
            nome: (*nome).to_owned(),
            fim_ms: *fim,
            pausado: false,
            restante_ms: 0,
        })
}

fn alarme(id: i32, quando_ms: i64, canal: &'static str, texto: NoticeText) -> Alarme {
    Alarme {
        id,
        quando_ms,
        canal,
        titulo: texto.title,
        corpo: texto.body,
        continua_depois: None,
    }
}

/// A agenda: um [`Alarme`] por fim ainda por vir, em ordem de instante (e de
/// id, no empate). `speed` é a do motor; diferente de 1, recusa.
pub fn montar(
    focus: &FocusDto,
    timers: &TimersDto,
    prefs: &Preferencias,
    fuso: &TimeZone,
    speed: f64,
) -> Result<Vec<Alarme>, AgendaRecusada> {
    // 1.0 exato: é o valor sem aceleração.
    if speed != 1.0 {
        return Err(AgendaRecusada::Acelerada { speed });
    }
    let mut agenda = Vec::new();

    let (plano, janelas) = fases_restantes(focus).unzip();
    let janelas = janelas.unwrap_or_default();
    if let (Some(plano), Some(s)) = (plano, &focus.session) {
        let mut foco_s = s.focus_s;
        for (k, j) in janelas.iter().enumerate() {
            if j.fase.kind == PhaseKind::Focus {
                foco_s += j.fase.duration_s;
            }
            let aviso = aviso_no_fim(&plano, &janelas, k, s.minutes, foco_s);
            let indice = s.phase_index + u32::try_from(k).expect("fases cabem em u32");
            agenda.push(alarme(
                1 + i32::try_from(indice).expect("fases cabem em i32"),
                j.fim,
                canal_da_fase(j.fase.kind, prefs),
                i18n::notice(&aviso, fuso),
            ));
        }
    }

    let correndo = temporizadores_correndo(timers);
    for &(id, nome, duration_ms, fim) in &correndo {
        let fim_do_temporizador = TimerEnded {
            id,
            name: nome.to_owned(),
            duration_ms,
            ended_at: EpochMs(fim),
            late: false,
        };
        // O temporizador toca o som de fim de foco sempre, mesmo com os
        // `sounds.*` desligados (M32, M38): canal próprio, sempre com som.
        agenda.push(alarme(
            id_do_temporizador(id),
            fim,
            canal::FIM_TEMPORIZADOR,
            i18n::timer_ended(&fim_do_temporizador, fuso),
        ));
    }

    agenda.sort_by_key(|a| (a.quando_ms, a.id));
    for a in &mut agenda {
        a.continua_depois = continua_em(a.quando_ms, focus, &janelas, &correndo);
    }
    Ok(agenda)
}

/// A agenda viva do `TauriSink` (5.2, item 2): o último retrato do foco e o
/// dos temporizadores, as preferências e a última agenda montada. Cada
/// atualização remonta a agenda e devolve `Some` só se ela mudou (a
/// comparação é a da lista inteira, no lugar do hash do plano).
#[derive(Debug, Default)]
pub struct Viva {
    focus: Option<FocusDto>,
    timers: Option<TimersDto>,
    prefs: Preferencias,
    speed: Option<f64>,
    ultima: Option<Vec<Alarme>>,
}

impl Viva {
    fn speed(&self) -> f64 {
        self.speed.unwrap_or(1.0)
    }

    /// Remonta a agenda; `Ok(None)` se nada mudou desde a última.
    fn remontar(&mut self, fuso: &TimeZone) -> Result<Option<&[Alarme]>, AgendaRecusada> {
        let vazio_f;
        let focus = match &self.focus {
            Some(f) => f,
            None => {
                vazio_f = FocusDto {
                    seq: 0,
                    status: StatusDto::Idle,
                    at: 0,
                    session: None,
                };
                &vazio_f
            }
        };
        let vazio_t;
        let timers = match &self.timers {
            Some(t) => t,
            None => {
                vazio_t = TimersDto {
                    seq: 0,
                    at: 0,
                    timers: Vec::new(),
                };
                &vazio_t
            }
        };
        let nova = montar(focus, timers, &self.prefs, fuso, self.speed())?;
        if self.ultima.as_ref() == Some(&nova) {
            return Ok(None);
        }
        Ok(Some(self.ultima.insert(nova).as_slice()))
    }

    /// As preferências (setup e cada `settings_set`) e a velocidade do motor.
    pub fn configurar(
        &mut self,
        prefs: Preferencias,
        speed: f64,
        fuso: &TimeZone,
    ) -> Result<Option<&[Alarme]>, AgendaRecusada> {
        self.prefs = prefs;
        self.speed = Some(speed);
        self.remontar(fuso)
    }

    /// Só as preferências (cada `settings_set`), com a mesma velocidade.
    pub fn preferencias(
        &mut self,
        prefs: Preferencias,
        fuso: &TimeZone,
    ) -> Result<Option<&[Alarme]>, AgendaRecusada> {
        self.prefs = prefs;
        self.remontar(fuso)
    }

    /// Um `tt://state`.
    pub fn foco(
        &mut self,
        focus: &FocusDto,
        fuso: &TimeZone,
    ) -> Result<Option<&[Alarme]>, AgendaRecusada> {
        self.focus = Some(focus.clone());
        self.remontar(fuso)
    }

    /// Um `tt://timers`.
    pub fn temporizadores(
        &mut self,
        timers: &TimersDto,
        fuso: &TimeZone,
    ) -> Result<Option<&[Alarme]>, AgendaRecusada> {
        self.timers = Some(timers.clone());
        self.remontar(fuso)
    }
}

/// A entrega da agenda ao plugin Kotlin (5.2, itens 2 e 3; A10a), numa
/// thread própria: o `agendar` do plugin espera a Kotlin (que roda pelo
/// contexto do Android), e o `TauriSink` chama com o motor travado. A thread
/// entrega só a mais nova das agendas que se acumularam enquanto a anterior
/// era entregue: cada agenda substitui a anterior inteira.
#[cfg(target_os = "android")]
pub struct Entrega {
    tx: Option<std::sync::mpsc::Sender<Vec<Alarme>>>,
}

#[cfg(target_os = "android")]
impl Entrega {
    pub fn iniciar<R: tauri::Runtime>(app: tauri::AppHandle<R>) -> Self {
        use tauri_plugin_tomatito_android::TomatitoAndroidExt;
        let (tx, rx) = std::sync::mpsc::channel::<Vec<Alarme>>();
        let thread = std::thread::Builder::new()
            .name("tomatito-agenda".into())
            .spawn(move || {
                while let Ok(mut agenda) = rx.recv() {
                    while let Ok(mais_nova) = rx.try_recv() {
                        agenda = mais_nova;
                    }
                    match app.tomatito_android().agendar(&agenda) {
                        Ok(r) => eprintln!(
                            "[tomatito] agenda entregue: {} exato(s), {} inexato(s)",
                            r.exatos, r.inexatos
                        ),
                        Err(e) => eprintln!("[tomatito] agenda não entregue: {e}"),
                    }
                }
            });
        match thread {
            Ok(_) => Self { tx: Some(tx) },
            Err(e) => {
                eprintln!("[tomatito] a thread da agenda não subiu: {e}");
                Self { tx: None }
            }
        }
    }

    /// Não espera: só põe na fila da thread.
    pub fn enviar(&self, agenda: &[Alarme]) {
        let enviado = self
            .tx
            .as_ref()
            .is_some_and(|tx| tx.send(agenda.to_vec()).is_ok());
        if !enviado {
            eprintln!("[tomatito] agenda perdida: a thread da agenda não está de pé");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::{Engine, Sink};
    use crate::events::{PhaseEventDto, StopwatchDto, TickDto};
    use std::sync::Mutex;
    use tomatito_core::{Clock, FakeClock, Period, Sound};

    /// 14:30:00 em São Paulo de 21/09/2026.
    const T0: EpochMs = EpochMs(1_790_011_800_000);

    fn sp() -> TimeZone {
        TimeZone::get("America/Sao_Paulo").expect("a base de fusos do sistema")
    }

    /// Um aviso emitido pelo motor, com o instante do relógio falso.
    #[derive(Debug, Clone, PartialEq)]
    struct Emitido {
        em: i64,
        titulo: String,
        corpo: Option<String>,
        /// O som pedido no mesmo passo (o motor pede o som antes do aviso).
        som: Option<Sound>,
    }

    /// Faz o papel do `TauriSink` no Android: remonta a agenda a cada
    /// `state` e `timers` e anota os avisos que o motor emite.
    struct Espelho {
        clock: FakeClock,
        viva: Mutex<Viva>,
        /// Todas as agendas montadas, na ordem.
        agendas: Mutex<Vec<Vec<Alarme>>>,
        emitidos: Mutex<Vec<Emitido>>,
        som: Mutex<Option<Sound>>,
    }

    impl Espelho {
        fn new(clock: FakeClock, prefs: Preferencias) -> Self {
            let mut viva = Viva::default();
            viva.configurar(prefs, 1.0, &sp()).unwrap();
            Self {
                clock,
                viva: Mutex::new(viva),
                agendas: Mutex::new(vec![Vec::new()]),
                emitidos: Mutex::new(Vec::new()),
                som: Mutex::new(None),
            }
        }
        fn guardar(&self, nova: Option<&[Alarme]>) {
            if let Some(a) = nova {
                self.agendas.lock().unwrap().push(a.to_vec());
            }
        }
        fn ultima(&self) -> Vec<Alarme> {
            self.agendas.lock().unwrap().last().unwrap().clone()
        }
        fn emitir(&self, t: NoticeText) {
            self.emitidos.lock().unwrap().push(Emitido {
                em: self.clock.now().0,
                titulo: t.title,
                corpo: t.body,
                som: self.som.lock().unwrap().take(),
            });
        }
    }

    impl Sink for Espelho {
        fn state(&self, f: &FocusDto) {
            let mut v = self.viva.lock().unwrap();
            self.guardar(v.foco(f, &sp()).unwrap());
        }
        fn tick(&self, _: &TickDto) {}
        fn phase(&self, _: &PhaseEventDto) {}
        fn sound(&self, s: Sound) {
            *self.som.lock().unwrap() = Some(s);
        }
        fn notice(&self, n: Notice) {
            self.emitir(i18n::notice(&n, &sp()));
        }
        fn period(&self, _: &Period) {}
        fn timers(&self, t: &TimersDto) {
            let mut v = self.viva.lock().unwrap();
            self.guardar(v.temporizadores(t, &sp()).unwrap());
        }
        fn timer_notice(&self, e: &TimerEnded) {
            self.emitir(i18n::timer_ended(e, &sp()));
        }
        fn stopwatch(&self, _: &StopwatchDto) {}
    }

    fn motor(prefs: Preferencias) -> (Engine<Espelho>, FakeClock) {
        let clock = FakeClock::new(T0);
        let e = Engine::new(
            Box::new(clock.clone()),
            1.0,
            Espelho::new(clock.clone(), prefs),
        );
        e.configurar(prefs);
        (e, clock)
    }

    /// O canal que corresponde ao som que o motor pediu junto do aviso.
    fn canal_do_som(som: Option<Sound>, temporizador: bool) -> &'static str {
        match (som, temporizador) {
            (Some(Sound::FocusEnd), true) => canal::FIM_TEMPORIZADOR,
            (Some(Sound::FocusEnd), false) => canal::FIM_FOCO,
            (Some(Sound::BreakEnd), _) => canal::FIM_INTERVALO,
            (None, _) => canal::FIM_SEM_SOM,
        }
    }

    /// Anda de prazo em prazo (`proximo_prazo`) até nada mais correr, ou até
    /// `ate`, com um tick em cada prazo, como o laço faria.
    fn andar_ate(e: &Engine<Espelho>, clock: &FakeClock, ate: Option<EpochMs>) {
        while let Some(p) = e.proximo_prazo() {
            if ate.is_some_and(|a| p > a) {
                break;
            }
            clock.set(p);
            e.tick();
        }
        if let Some(a) = ate {
            clock.set(a);
            e.tick();
        }
    }

    /// Confere cada aviso emitido contra as agendas montadas: o item com o
    /// mesmo instante, título e corpo na agenda que valia antes do disparo
    /// (ou na montada no mesmo passo), com o canal do som pedido. Devolve
    /// quantos avisos foram cobertos (tem de ser todos).
    fn conferir(e: &Engine<Espelho>) -> usize {
        let agendas = e.sink().agendas.lock().unwrap().clone();
        let emitidos = e.sink().emitidos.lock().unwrap().clone();
        assert!(!emitidos.is_empty(), "o cenário emitiu avisos");
        let mut cobertos = 0;
        for av in &emitidos {
            let temporizador = av.titulo.starts_with("Temporizador");
            let achado = agendas
                .iter()
                .flatten()
                .find(|a| a.quando_ms == av.em && a.titulo == av.titulo && a.corpo == av.corpo);
            let a = achado.unwrap_or_else(|| panic!("aviso fora da agenda: {av:?}"));
            assert_eq!(
                a.canal,
                canal_do_som(av.som, temporizador),
                "canal de {av:?}"
            );
            cobertos += 1;
        }
        assert_eq!(cobertos, emitidos.len());
        cobertos
    }

    /// Os itens da agenda como (instante, título, corpo), para comparar com
    /// os emitidos.
    fn chaves(agenda: &[Alarme]) -> Vec<(i64, String, Option<String>)> {
        agenda
            .iter()
            .map(|a| (a.quando_ms, a.titulo.clone(), a.corpo.clone()))
            .collect()
    }

    fn emitidos(e: &Engine<Espelho>) -> Vec<(i64, String, Option<String>)> {
        let mut v: Vec<_> = e
            .sink()
            .emitidos
            .lock()
            .unwrap()
            .iter()
            .map(|a| (a.em, a.titulo.clone(), a.corpo.clone()))
            .collect();
        v.sort();
        v
    }

    fn prefs(f: u32, b: u32, som_foco: bool, som_intervalo: bool) -> Preferencias {
        Preferencias {
            plano: PlanSettings {
                focus_minutes: f,
                break_minutes: b,
            },
            som_fim_de_foco: som_foco,
            som_fim_de_intervalo: som_intervalo,
        }
    }

    /// Equivalência, planos sem interrupção: a agenda montada no início é
    /// exatamente a lista de avisos que o motor emite até o fim (≥ 5 planos,
    /// com e sem sons, com e sem intervalos).
    #[test]
    fn agenda_equivale_ao_motor_em_varios_planos() {
        let casos: [(u32, bool, Preferencias); 7] = [
            (60, false, prefs(25, 5, true, true)),
            (5, false, prefs(25, 5, true, true)),
            (3, false, prefs(1, 1, true, true)),
            (100, false, prefs(25, 5, false, true)),
            (90, false, prefs(20, 10, true, false)),
            (240, false, prefs(1, 1, false, false)),
            (45, true, prefs(25, 5, true, true)),
        ];
        for (minutos, pular, p) in casos {
            let (e, clock) = motor(p);
            e.start(minutos, pular, None).unwrap();
            let inicio = e.sink().ultima();
            andar_ate(&e, &clock, None);
            assert_eq!(
                chaves(&inicio),
                emitidos(&e),
                "T = {minutos}, pular = {pular}, {p:?}"
            );
            assert_eq!(conferir(&e), inicio.len());
            assert!(e.sink().ultima().is_empty(), "concluído: agenda vazia");
        }
    }

    /// Equivalência com pausa e retomada no meio de uma fase e com um pular:
    /// cada aviso emitido está na agenda montada na última transição, e a
    /// agenda da retomada é o que sai dali em diante.
    #[test]
    fn agenda_equivale_com_pausa_retomada_e_pular() {
        let (e, clock) = motor(prefs(25, 5, true, true));
        e.start(60, false, None).unwrap();
        andar_ate(&e, &clock, Some(T0.plus_ms(10 * 60_000)));
        e.pause().unwrap();
        assert!(e.sink().ultima().is_empty(), "pausado: nada agendado");
        clock.advance_ms(7 * 60_000 + 333);
        e.resume().unwrap();
        let da_retomada = e.sink().ultima();
        assert_eq!(da_retomada.len(), 3);
        // O primeiro fim foi deslocado pela pausa.
        assert_eq!(
            da_retomada[0].quando_ms,
            T0.0 + 1_650_000 + 7 * 60_000 + 333
        );
        andar_ate(&e, &clock, None);
        assert_eq!(chaves(&da_retomada), emitidos(&e));
        conferir(&e);

        // Pular o intervalo: os fins que sobram vêm antes.
        let (e, clock) = motor(prefs(25, 5, true, true));
        e.start(60, false, None).unwrap();
        andar_ate(&e, &clock, Some(T0.plus_ms(1_650_000 + 60_000)));
        e.skip().unwrap();
        let depois_de_pular = e.sink().ultima();
        assert_eq!(depois_de_pular.len(), 1);
        andar_ate(&e, &clock, None);
        let todos = emitidos(&e);
        assert_eq!(todos.len(), 2);
        assert_eq!(todos[1], chaves(&depois_de_pular)[0]);
        conferir(&e);
    }

    /// Equivalência com temporizadores simultâneos, um com nome, junto de uma
    /// sessão, e um pausado e retomado no meio.
    #[test]
    fn agenda_equivale_com_temporizadores_simultaneos() {
        let (e, clock) = motor(prefs(1, 1, true, false));
        e.start(5, false, None).unwrap();
        // Os padrões: 1 (1 min), 2 (3 min), 3 (5 min), 4 (10 min).
        e.timer_start(1).unwrap();
        e.timer_start(2).unwrap();
        let cha = e.timer_create("Chá", 150_000).unwrap();
        let cha_id = cha.timers.last().unwrap().id;
        e.timer_start(cha_id).unwrap();
        // O de 1 min vence junto do primeiro foco (mesmo instante).
        let a = e.sink().ultima();
        assert_eq!(a.len(), 5 + 3);
        assert_eq!(a.iter().filter(|x| x.quando_ms == T0.0 + 60_000).count(), 2);
        andar_ate(&e, &clock, Some(T0.plus_ms(30_000)));
        e.timer_pause(2).unwrap();
        andar_ate(&e, &clock, Some(T0.plus_ms(75_000)));
        e.timer_start(2).unwrap();
        andar_ate(&e, &clock, None);
        let n = conferir(&e);
        assert_eq!(n, 5 + 3, "5 fins de fase e 3 de temporizador");
        let emit = e.sink().emitidos.lock().unwrap().clone();
        let t2 = emit
            .iter()
            .find(|x| x.corpo.as_deref() == Some("3 min"))
            .unwrap();
        assert_eq!(t2.em, T0.0 + 180_000 + 45_000, "pausa de 45 s descontada");
        assert!(
            emit.iter()
                .any(|x| x.corpo.as_deref() == Some("Chá · 2 min 30 s"))
        );
    }

    #[test]
    fn speed_diferente_de_1_recusa_sem_agenda() {
        let (e, _) = motor(Preferencias::default());
        e.start(60, false, None).unwrap();
        let f = e.state().focus;
        let t = e.state().timers;
        for speed in [2.0, 60.0, 0.5] {
            let r = montar(&f, &t, &Preferencias::default(), &sp(), speed);
            assert_eq!(r, Err(AgendaRecusada::Acelerada { speed }));
            assert!(r.unwrap_err().to_string().contains("TOMATITO_SPEED"));
        }
        let mut v = Viva::default();
        assert!(v.configurar(Preferencias::default(), 240.0, &sp()).is_err());
        assert!(v.foco(&f, &sp()).is_err(), "a viva também recusa");
        assert_eq!(
            montar(&f, &t, &Preferencias::default(), &sp(), 1.0)
                .unwrap()
                .len(),
            3
        );
    }

    #[test]
    fn parado_pausado_concluido_e_cronometro_nao_agendam() {
        let (e, clock) = motor(Preferencias::default());
        let vazia = |e: &Engine<Espelho>| {
            let s = e.state();
            montar(&s.focus, &s.timers, &Preferencias::default(), &sp(), 1.0).unwrap()
        };
        assert!(vazia(&e).is_empty(), "ocioso");
        e.stopwatch_start().unwrap();
        assert!(vazia(&e).is_empty(), "o cronômetro não vence");
        e.start(5, false, None).unwrap();
        assert_eq!(vazia(&e).len(), 1);
        e.pause().unwrap();
        assert!(vazia(&e).is_empty(), "pausado");
        e.resume().unwrap();
        andar_ate(&e, &clock, None);
        assert!(vazia(&e).is_empty(), "concluído");
        e.start(5, false, None).unwrap();
        e.stop().unwrap();
        assert!(vazia(&e).is_empty(), "parado");
        // Temporizador pausado ou já passado do zero: nada.
        e.timer_start(1).unwrap();
        e.timer_pause(1).unwrap();
        assert!(vazia(&e).is_empty());
        e.timer_start(1).unwrap();
        andar_ate(&e, &clock, Some(clock.now().plus_ms(90_000)));
        assert!(vazia(&e).is_empty(), "passado do zero, nada a disparar");
    }

    /// Os textos, os ids e os canais de uma sessão de 60 min (25/5), como o
    /// M21 os escreve.
    #[test]
    fn itens_de_uma_sessao_de_60_min() {
        let (e, _) = motor(prefs(25, 5, true, false));
        e.start(60, false, None).unwrap();
        let a = e.sink().ultima();
        assert_eq!(
            a.iter()
                .map(|x| (
                    x.id,
                    x.quando_ms - T0.0,
                    x.canal,
                    x.titulo.as_str(),
                    x.corpo.as_deref()
                ))
                .collect::<Vec<_>>(),
            [
                (
                    1,
                    1_650_000,
                    canal::FIM_FOCO,
                    "Período de foco concluído",
                    Some("Intervalo de 5 min. Próximo foco às 15:02.")
                ),
                (
                    2,
                    1_950_000,
                    canal::FIM_SEM_SOM,
                    "Intervalo concluído",
                    Some("Período de foco 2 de 2, 27 min.")
                ),
                (
                    3,
                    3_600_000,
                    canal::FIM_FOCO,
                    "Sessão de foco concluída",
                    Some("60 min de foco.")
                ),
            ]
        );
    }

    /// A contínua depois de cada aviso: a fase seguinte; nada no fim; com a
    /// sessão pausada, a pausa; sem sessão, o próximo temporizador.
    #[test]
    fn continua_depois_de_cada_aviso() {
        let (e, _) = motor(prefs(25, 5, true, true));
        e.start(60, false, None).unwrap();
        e.timer_start(4).unwrap(); // 10 min
        let a = e.sink().ultima();
        let tipos: Vec<_> = a
            .iter()
            .map(|x| {
                x.continua_depois
                    .as_ref()
                    .map(|c| (c.tipo, c.fim_ms - T0.0))
            })
            .collect();
        assert_eq!(
            tipos,
            [
                // O temporizador de 10 min, com a sessão no foco 1.
                Some(("foco", 1_650_000)),
                Some(("intervalo", 1_950_000)),
                Some(("foco", 3_600_000)),
                None,
            ]
        );
        assert_eq!(a[0].id, BASE_TEMPORIZADOR + 4);

        let (e, clock) = motor(Preferencias::default());
        e.start(60, false, None).unwrap();
        e.timer_start(1).unwrap();
        e.timer_start(2).unwrap();
        clock.advance_ms(10_000);
        e.pause().unwrap();
        let a = e.sink().ultima();
        assert_eq!(a.len(), 2);
        let c = a[0].continua_depois.as_ref().unwrap();
        assert_eq!(
            (c.tipo, c.pausado, c.restante_ms),
            ("foco", true, 1_640_000)
        );
        e.stop().unwrap();
        let a = e.sink().ultima();
        let c = a[0].continua_depois.as_ref().unwrap();
        assert_eq!(
            (c.tipo, c.nome.as_str(), c.fim_ms),
            ("temporizador", "", T0.0 + 180_000)
        );
        assert_eq!(a[1].continua_depois, None);
    }

    /// O formato do fio é o que a Kotlin lê (`Agenda.deJson`, A07b).
    #[test]
    fn json_no_formato_da_kotlin() {
        let (e, _) = motor(Preferencias::default());
        e.start(5, false, None).unwrap();
        e.timer_start(1).unwrap();
        let json = serde_json::to_value(e.sink().ultima()).unwrap();
        assert_eq!(
            json,
            serde_json::json!([
                {
                    "id": BASE_TEMPORIZADOR + 1,
                    "quandoMs": T0.0 + 60_000,
                    "canal": "fim-temporizador",
                    "titulo": "Temporizador encerrado",
                    "corpo": "1 min",
                    "continuaDepois": {
                        "tipo": "foco", "nome": "", "fimMs": T0.0 + 300_000,
                        "pausado": false, "restanteMs": 0
                    }
                },
                {
                    "id": 1,
                    "quandoMs": T0.0 + 300_000,
                    "canal": "fim-foco",
                    "titulo": "Sessão de foco concluída",
                    "corpo": "5 min de foco.",
                    "continuaDepois": null
                }
            ])
        );
    }

    /// A viva só devolve a agenda quando ela muda (5.2, item 2).
    #[test]
    fn viva_so_manda_quando_muda() {
        let (e, clock) = motor(Preferencias::default());
        let mut v = Viva::default();
        let s = e.state();
        assert_eq!(
            v.foco(&s.focus, &sp()).unwrap(),
            Some(&[][..]),
            "a primeira sempre vai"
        );
        assert_eq!(v.temporizadores(&s.timers, &sp()).unwrap(), None);
        let f = e.start(5, false, None).unwrap();
        assert_eq!(v.foco(&f, &sp()).unwrap().map(<[_]>::len), Some(1));
        assert_eq!(v.foco(&f, &sp()).unwrap(), None, "o mesmo retrato");
        clock.advance_ms(1_000);
        let mut f2 = e.state().focus;
        f2.seq += 7;
        assert_eq!(
            v.foco(&f2, &sp()).unwrap(),
            None,
            "outro seq e outro `at`, mesma agenda"
        );
        // Desligar o som do fim de foco troca o canal: manda de novo.
        let sem_som = prefs(25, 5, false, true);
        let nova = v.preferencias(sem_som, &sp()).unwrap().unwrap();
        assert_eq!(nova[0].canal, canal::FIM_SEM_SOM);
        let t = e.timer_start(1).unwrap();
        assert_eq!(
            v.temporizadores(&t, &sp()).unwrap().map(<[_]>::len),
            Some(2)
        );
    }

    #[test]
    fn ids_cabem_no_int_da_kotlin() {
        assert_eq!(id_do_temporizador(1), 100_001);
        assert_eq!(
            id_do_temporizador(u64::MAX),
            BASE_TEMPORIZADOR + (u64::MAX % 1_000_000_000) as i32
        );
        // Uma sessão de 240 min com F = B = 1: 239 fases, ids 1..=239.
        let (e, _) = motor(prefs(1, 1, true, true));
        e.start(240, false, None).unwrap();
        let a = e.sink().ultima();
        assert_eq!(a.len(), 239);
        assert!(a.iter().all(|x| (1..BASE_TEMPORIZADOR).contains(&x.id)));
    }
}
