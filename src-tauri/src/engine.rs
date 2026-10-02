//! O motor no app (PLANO.md, 3.1 e 3.2). Desde o W05 (PLANO-WEB, 3.3) o
//! motor em si mora no `tomatito-motor` (`Engine`, `Sink`, `Preferencias`,
//! `CommandError`), compartilhado com a versão web, e é reexportado aqui: o
//! caminho `crate::engine::…` continua valendo. Aqui fica o que é do desktop:
//! o [`TauriSink`], o relógio do ambiente ([`clock_from_env`]) e o [`laco`].
//!
//! **O laço.** Um `tokio::time::interval` de 250 ms, com
//! `MissedTickBehavior::Skip`, que só roda enquanto uma fase corre. Parado
//! (ocioso, pausado ou concluído), a tarefa espera um `tokio::sync::Notify` e
//! não acorda sozinha: nenhum timer, nenhum gasto de CPU. Os comandos que
//! deixam uma fase correndo (iniciar, retomar, pular) chamam o
//! `Sink::acordar`, que no [`TauriSink`] é o `notify_one` desse `Notify`.
//!
//! **O tempo.** Cada tick lê o relógio de parede e chama `advance_to(now)`.
//! O `interval` só marca o ritmo (ele usa o `Instant`, que no Linux não conta a
//! suspensão); quem decide o que venceu é o prazo em ms desde a época Unix.
//!
//! O som (M20) vai para a thread do `audio.rs`, sem esperar, e a notificação
//! (M21), para o `notify.rs`, que também não espera. Os períodos (M26) vão
//! para o `stats.rs`, uma linha no SQLite por fase que termina. Cada transição
//! do foco (M40), dos temporizadores (M33) e do cronômetro (M34) vai para o
//! `state.json`.

use std::sync::Arc;

use serde::Serialize;
use tokio::sync::Notify;
use tokio::time::{MissedTickBehavior, interval};
use tomatito_core::{Clock, Notice, Period, Sound, SystemClock, TimerEnded};

pub use tomatito_motor::engine::*;

use crate::audio::Som;
use crate::events::{self, FocusDto, PhaseEventDto, StopwatchDto, TickDto, TimersDto};
use crate::notify::Notificador;
use crate::state_file::StateStore;
use crate::stats::Stats;
use crate::tray::Bandeja;

/// O laço (3.2). Roda para sempre na tarefa do `tauri::async_runtime`;
/// `acordar` é o mesmo `Notify` que o [`TauriSink`] do `motor` recebeu. É uma
/// função livre, e não um método, porque o `Engine` é de outro crate (E0116).
pub async fn laco<S: Sink>(motor: Arc<Engine<S>>, acordar: Arc<Notify>) {
    loop {
        if !motor.is_running() {
            // Um `notify_one` que chegou antes deste ponto fica guardado
            // (uma licença), e o `notified` volta na hora: nenhum início
            // se perde entre a conferência e a espera.
            acordar.notified().await;
            continue;
        }
        let mut every = interval(TICK_EVERY);
        every.set_missed_tick_behavior(MissedTickBehavior::Skip);
        loop {
            every.tick().await;
            if !motor.tick() {
                break;
            }
        }
    }
}

/// O relógio do motor e a velocidade dele. Num build de debug,
/// `TOMATITO_SPEED` acelera o tempo (3.2); um valor inválido é registrado e
/// ignorado. No release, a variável não é lida.
pub fn clock_from_env() -> (Box<dyn Clock>, f64) {
    #[cfg(debug_assertions)]
    {
        match tomatito_core::ScaledClock::from_env() {
            Ok(Some(c)) => {
                let speed = c.speed();
                eprintln!("[tomatito] relógio acelerado: {speed}×");
                return (Box::new(c), speed);
            }
            Ok(None) => {}
            Err(e) => eprintln!("[tomatito] {e}; seguindo sem aceleração"),
        }
    }
    (Box::new(SystemClock), 1.0)
}

/// O [`Sink`] do app: emite os eventos para todas as janelas e pede os sons
/// e as notificações.
pub struct TauriSink {
    app: tauri::AppHandle,
    som: Arc<Som>,
    notificador: Notificador,
    stats: Arc<Stats>,
    /// M33: o `state.json`.
    estado: Arc<StateStore>,
    /// M36: o item do menu e o tempo na bandeja.
    bandeja: Arc<Bandeja>,
    /// W05: o `Notify` do [`laco`].
    acordador: Arc<Notify>,
}

impl TauriSink {
    pub fn new(
        app: tauri::AppHandle,
        som: Arc<Som>,
        stats: Arc<Stats>,
        estado: Arc<StateStore>,
        bandeja: Arc<Bandeja>,
        acordador: Arc<Notify>,
    ) -> Self {
        let notificador = Notificador::new(app.clone());
        Self {
            app,
            som,
            notificador,
            stats,
            estado,
            bandeja,
            acordador,
        }
    }

    fn emit<T: Serialize + Clone>(&self, event: &str, payload: &T) {
        use tauri::Emitter;
        if let Err(e) = self.app.emit(event, payload.clone()) {
            eprintln!("[tomatito] falha ao emitir {event}: {e}");
        }
    }
}

impl Sink for TauriSink {
    fn state(&self, focus: &FocusDto) {
        self.emit(events::STATE, focus);
        // M36: "Iniciar foco" vira "Pausar foco" (só posta; não espera a
        // thread principal com o motor travado, tray.rs).
        self.bandeja.foco(focus);
        // M40: cada transição do foco vai para o `state.json`, como as dos
        // temporizadores (M33): nunca num tick, que não passa por aqui.
        self.estado.save_focus(focus);
    }
    fn tick(&self, tick: &TickDto) {
        self.emit(events::TICK, tick);
        // M36: o tempo na bandeja, que só muda uma vez por minuto.
        self.bandeja.tick(tick);
    }
    fn phase(&self, change: &PhaseEventDto) {
        self.emit(events::PHASE, change);
    }
    fn sound(&self, sound: Sound) {
        // Só manda o pedido: o motor está travado aqui, e a thread de som é
        // que espera o som acabar, com o volume que ela guarda.
        self.som.tocar(sound);
    }
    fn notice(&self, notice: Notice) {
        // Também sem esperar: o plugin entrega numa tarefa à parte.
        self.notificador.mostrar(notice);
    }
    fn timers(&self, timers: &TimersDto) {
        self.emit(events::TIMERS, timers);
        // M33: cada mudança da lista (criar, editar, excluir, iniciar, pausar,
        // redefinir, fim) é uma transição e vai para o `state.json`. Síncrono,
        // como o período: a gravação atômica leva poucos ms, e quem faz um
        // `cat` logo depois do clique já vê a lista nova.
        self.estado.save_timers(timers);
    }
    fn timer_notice(&self, ended: &TimerEnded) {
        self.notificador.mostrar_temporizador(ended);
    }
    fn stopwatch(&self, stopwatch: &StopwatchDto) {
        self.emit(events::STOPWATCH, stopwatch);
        // M34: cada transição vai para o `state.json`, como os temporizadores
        // no M33 (3.3); nunca num tick, que o cronômetro não tem.
        self.estado.save_stopwatch(stopwatch);
    }
    fn period(&self, period: &Period) {
        // Síncrono, com o motor travado: um INSERT leva menos de 1 ms, e
        // assim o `stats_get` que vier depois do `tt://state` já vê a linha.
        if let Err(e) = self.stats.record(period) {
            eprintln!("[tomatito] estatísticas: período não gravado ({e}): {period:?}");
        }
    }
    fn acordar(&self) {
        // Fora da trava do motor (o `Engine` só chama depois de soltá-la).
        self.acordador.notify_one();
    }
}

/// Os 3 testes do laço de verdade (W05: os demais foram com o motor para o
/// `tomatito-motor`), com um sink de teste que também acorda o laço.
#[cfg(test)]
mod tests {
    use super::*;
    use crate::events::StatusDto;
    use std::sync::Mutex;
    use std::time::Duration;
    use tomatito_core::{EpochMs, FakeClock};

    const T0: EpochMs = EpochMs(1_790_000_000_000);

    #[derive(Debug, Clone, PartialEq)]
    enum Out {
        Tick(TickDto),
        Notice(Notice),
        TimerNotice(TimerEnded),
        Outro,
    }

    /// Anota o que os testes do laço leem e acorda o laço como o
    /// [`TauriSink`].
    #[derive(Default)]
    struct Anota {
        out: Mutex<Vec<Out>>,
        acordador: Arc<Notify>,
    }

    impl Anota {
        fn tirar(&self) -> Vec<Out> {
            std::mem::take(&mut *self.out.lock().unwrap())
        }
        fn put(&self, o: Out) {
            self.out.lock().unwrap().push(o);
        }
    }

    impl Sink for Anota {
        fn state(&self, _: &FocusDto) {
            self.put(Out::Outro);
        }
        fn tick(&self, t: &TickDto) {
            self.put(Out::Tick(t.clone()));
        }
        fn phase(&self, _: &PhaseEventDto) {
            self.put(Out::Outro);
        }
        fn sound(&self, _: Sound) {
            self.put(Out::Outro);
        }
        fn notice(&self, n: Notice) {
            self.put(Out::Notice(n));
        }
        fn period(&self, _: &Period) {
            self.put(Out::Outro);
        }
        fn timers(&self, _: &TimersDto) {
            self.put(Out::Outro);
        }
        fn timer_notice(&self, e: &TimerEnded) {
            self.put(Out::TimerNotice(e.clone()));
        }
        fn stopwatch(&self, _: &StopwatchDto) {
            self.put(Out::Outro);
        }
        fn acordar(&self) {
            self.acordador.notify_one();
        }
    }

    /// O motor e o laço dele, já correndo numa tarefa.
    fn motor() -> (Arc<Engine<Anota>>, FakeClock, tokio::task::JoinHandle<()>) {
        let clock = FakeClock::new(T0);
        let e = Arc::new(Engine::new(Box::new(clock.clone()), 1.0, Anota::default()));
        let laco = tokio::spawn(laco(e.clone(), e.sink().acordador.clone()));
        (e, clock, laco)
    }

    fn ticks(out: &[Out]) -> usize {
        out.iter().filter(|o| matches!(o, Out::Tick(_))).count()
    }

    /// O laço de verdade, com o tempo do tokio parado (ele só anda quando
    /// todas as tarefas esperam). Parado, o laço não acorda.
    #[tokio::test(start_paused = true)]
    async fn laco_so_roda_com_algo_correndo() {
        let (e, clock, laco) = motor();
        tokio::time::sleep(Duration::from_secs(60)).await;
        assert_eq!(e.ticks(), 0, "ocioso: o laço espera o Notify");

        e.start(5, false, None).unwrap();
        for _ in 0..8 {
            tokio::time::sleep(TICK_EVERY).await;
            clock.advance_ms(250);
        }
        let rodando = e.ticks();
        assert!(
            (8..=10).contains(&rodando),
            "4 ticks por segundo: {rodando}"
        );
        assert!(ticks(&e.sink().tirar()) >= 2);

        e.pause().unwrap();
        tokio::time::sleep(Duration::from_secs(1)).await;
        let pausado = e.ticks();
        tokio::time::sleep(Duration::from_secs(3600)).await;
        assert_eq!(e.ticks(), pausado, "pausado: o laço espera o Notify");

        e.resume().unwrap();
        tokio::time::sleep(Duration::from_secs(1)).await;
        assert!(e.ticks() > pausado + 2, "retomar acorda o laço");

        e.stop().unwrap();
        tokio::time::sleep(Duration::from_secs(1)).await;
        let parado = e.ticks();
        tokio::time::sleep(Duration::from_secs(3600)).await;
        assert_eq!(e.ticks(), parado);
        laco.abort();
    }

    /// A fase vence sozinha pelo laço, e ele dorme depois do fim da sessão.
    #[tokio::test(start_paused = true)]
    async fn laco_fecha_a_sessao_e_dorme() {
        let (e, clock, laco) = motor();
        e.start(5, false, None).unwrap();
        for _ in 0..(4 * 301) {
            tokio::time::sleep(TICK_EVERY).await;
            clock.advance_ms(250);
        }
        assert_eq!(e.state().focus.status, StatusDto::Completed);
        let fim = e.ticks();
        tokio::time::sleep(Duration::from_secs(3600)).await;
        assert_eq!(e.ticks(), fim);
        let out = e.sink().tirar();
        assert!(
            out.iter()
                .any(|o| matches!(o, Out::Notice(Notice::SessionCompleted { .. })))
        );
        laco.abort();
    }

    /// O laço de verdade acorda com um temporizador e dorme depois do zero.
    #[tokio::test(start_paused = true)]
    async fn laco_acorda_com_o_temporizador() {
        let (e, clock, laco) = motor();
        tokio::time::sleep(Duration::from_secs(5)).await;
        assert_eq!(e.ticks(), 0);
        e.timer_start(1).unwrap();
        for _ in 0..(4 * 61) {
            tokio::time::sleep(TICK_EVERY).await;
            clock.advance_ms(250);
        }
        let fins = e
            .sink()
            .tirar()
            .iter()
            .filter(|o| matches!(o, Out::TimerNotice(_)))
            .count();
        assert_eq!(fins, 1);
        let fim = e.ticks();
        tokio::time::sleep(Duration::from_secs(3600)).await;
        assert_eq!(e.ticks(), fim, "passado o zero, o laço dorme");
        laco.abort();
    }
}
