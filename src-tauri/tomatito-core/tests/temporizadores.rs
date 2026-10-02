//! Motor dos temporizadores (M31), pela API pública, como o app vai usar: o
//! relógio é um `FakeClock`, os efeitos vão para um `FakeCountdownEffects`, e
//! cada comando recebe o "agora" do relógio.
//!
//! Os três itens do "Pronto quando" do M31:
//! - dois temporizadores simultâneos: `dois_temporizadores_*`;
//! - a pausa de um sem afetar o outro: `pausar_um_*`;
//! - a contagem negativa: `contagem_negativa_*` (e o fim disparando uma
//!   única vez: `fim_dispara_uma_unica_vez_*`).

#[cfg(target_family = "wasm")]
use wasm_bindgen_test::wasm_bindgen_test as test;

use tomatito_core::{
    Clock, CountdownError, DEFAULT_MINUTES, EpochMs, FakeClock, FakeCountdownEffects,
    MAX_DURATION_MS, TimerId, TimerStatus, Timers,
};

/// 2026-09-21 14:13:20 UTC, só para os números serem de verdade.
const INICIO: EpochMs = EpochMs(1_790_000_000_000);
const S: u64 = 1000;
const MIN: u64 = 60 * S;

fn em(ms: u64) -> EpochMs {
    INICIO.plus_ms(ms)
}

/// Relógio, temporizadores e efeitos, com os comandos lendo o "agora".
struct Banco {
    relogio: FakeClock,
    t: Timers,
    fx: FakeCountdownEffects,
}

impl Banco {
    fn novo() -> Self {
        Self {
            relogio: FakeClock::new(INICIO),
            t: Timers::new(),
            fx: FakeCountdownEffects::new(),
        }
    }

    fn agora(&self) -> EpochMs {
        self.relogio.now()
    }

    fn criar(&mut self, nome: &str, ms: u64) -> TimerId {
        let now = self.agora();
        self.t.create(now, nome, ms, &mut self.fx).expect("criar")
    }

    fn iniciar(&mut self, id: TimerId) -> Result<(), CountdownError> {
        let now = self.agora();
        self.t.start(now, id, &mut self.fx)
    }

    fn pausar(&mut self, id: TimerId) -> Result<(), CountdownError> {
        let now = self.agora();
        self.t.pause(now, id, &mut self.fx)
    }

    fn redefinir(&mut self, id: TimerId) -> Result<(), CountdownError> {
        let now = self.agora();
        self.t.reset(now, id, &mut self.fx)
    }

    /// O tick do laço: anda `ms` e chama o `advance_to`.
    fn tick(&mut self, ms: u64) -> usize {
        let now = self.relogio.advance_ms(ms);
        self.t.advance_to(now, &mut self.fx)
    }

    fn restante(&self, id: TimerId) -> i64 {
        self.t.get(id, self.agora()).expect("existe").remaining_ms
    }

    fn status(&self, id: TimerId) -> TimerStatus {
        self.t.get(id, self.agora()).expect("existe").status
    }
}

#[test]
fn dois_temporizadores_correm_juntos_e_cada_um_termina_na_sua_hora() {
    let mut b = Banco::novo();
    let cha = b.criar("Chá", 4 * MIN);
    let ovo = b.criar("Ovo", 10 * MIN);
    assert_eq!(b.t.ids(), [cha, ovo]);
    assert!(!b.t.any_running());

    b.iniciar(cha).unwrap();
    b.relogio.advance_ms(30 * S);
    b.iniciar(ovo).unwrap();
    assert!(b.t.any_running());
    assert_eq!(b.t.next_deadline(), Some(em(4 * MIN)));
    b.fx.clear();

    // Ticks de 250 ms até 4 min: só o chá acaba.
    while b.agora() < em(4 * MIN) {
        b.tick(250);
    }
    assert_eq!(b.fx.ended_ids(), [cha]);
    let fim = &b.fx.ended[0];
    assert_eq!(fim.name, "Chá");
    assert_eq!(fim.duration_ms, 4 * MIN);
    assert_eq!(fim.ended_at, em(4 * MIN));
    assert!(!fim.late);
    assert_eq!(b.restante(cha), 0);
    assert_eq!(b.restante(ovo), as_i64(6 * MIN + 30 * S));
    assert_eq!(b.status(ovo), TimerStatus::Running);
    // O próximo prazo agora é o do ovo; o chá, encerrado, não conta mais.
    assert_eq!(b.t.next_deadline(), Some(em(10 * MIN + 30 * S)));

    // O ovo acaba 6 min 30 s depois, e o chá segue no negativo.
    b.fx.clear();
    while b.agora() < em(10 * MIN + 30 * S) {
        b.tick(250);
    }
    assert_eq!(b.fx.ended_ids(), [ovo]);
    assert_eq!(b.fx.ended[0].ended_at, em(10 * MIN + 30 * S));
    assert_eq!(b.restante(cha), -as_i64(6 * MIN + 30 * S));
    assert_eq!(b.restante(ovo), 0);
    assert_eq!(b.t.next_deadline(), None);
    // Os dois continuam correndo (no negativo): o laço não dorme.
    assert!(b.t.any_running());
}

#[test]
fn dois_que_vencem_no_mesmo_tick_disparam_na_ordem_dos_ids_com_um_retrato_so() {
    let mut b = Banco::novo();
    let a = b.criar("A", MIN);
    let c = b.criar("C", 2 * MIN);
    let d = b.criar("D", 90 * S);
    for id in [a, c, d] {
        b.iniciar(id).unwrap();
    }
    b.fx.clear();
    assert_eq!(b.tick(3 * MIN), 3);
    assert_eq!(b.fx.ended_ids(), [a, c, d]);
    assert_eq!(b.fx.changes.len(), 1, "um retrato depois dos fins");
    let retrato = &b.fx.changes[0];
    assert_eq!(retrato.at, em(3 * MIN));
    assert!(retrato.timers.iter().all(|t| t.ended && t.is_overdue()));
    assert_eq!(retrato.get(c).unwrap().remaining_ms, -as_i64(MIN));
}

#[test]
fn pausar_um_nao_mexe_no_outro() {
    let mut b = Banco::novo();
    let a = b.criar("A", 5 * MIN);
    let c = b.criar("C", 5 * MIN);
    b.iniciar(a).unwrap();
    b.iniciar(c).unwrap();

    b.tick(MIN);
    b.pausar(a).unwrap();
    assert_eq!(b.status(a), TimerStatus::Paused);
    assert_eq!(b.status(c), TimerStatus::Running);
    assert_eq!(b.t.get(a, b.agora()).unwrap().ends_at, None);
    assert_eq!(b.t.get(c, b.agora()).unwrap().ends_at, Some(em(5 * MIN)));

    // 2 min depois: o pausado parou em 4 min; o outro seguiu.
    b.tick(2 * MIN);
    assert_eq!(b.restante(a), as_i64(4 * MIN));
    assert_eq!(b.restante(c), as_i64(2 * MIN));

    // Retomar faz prazo = agora + restante, e o outro não muda.
    b.iniciar(a).unwrap();
    assert_eq!(b.t.get(a, b.agora()).unwrap().ends_at, Some(em(7 * MIN)));
    assert_eq!(b.t.get(c, b.agora()).unwrap().ends_at, Some(em(5 * MIN)));

    // Pausar o outro também não mexe no primeiro.
    b.tick(30 * S);
    b.pausar(c).unwrap();
    b.fx.clear();
    b.tick(4 * MIN);
    assert_eq!(b.fx.ended_ids(), [a], "só o que corre termina");
    assert_eq!(b.restante(c), as_i64(90 * S));
    assert_eq!(b.status(c), TimerStatus::Paused);
    assert_eq!(b.restante(a), -as_i64(30 * S));
}

#[test]
fn contagem_negativa_depois_do_zero() {
    let mut b = Banco::novo();
    let id = b.criar("", MIN);
    b.iniciar(id).unwrap();
    b.tick(MIN);
    assert_eq!(b.restante(id), 0);
    let zero = b.t.get(id, b.agora()).unwrap();
    assert!(zero.ended && zero.is_overdue());

    // O "-00:00:12" do M32.
    b.tick(12 * S);
    let r = b.t.get(id, b.agora()).unwrap();
    assert_eq!(r.remaining_ms, -12_000);
    assert_eq!(r.status, TimerStatus::Running);
    assert_eq!(r.ends_at, Some(em(MIN)));
    assert!(r.is_overdue());

    // Pausar no negativo guarda o negativo; o tempo parado não conta.
    b.pausar(id).unwrap();
    b.tick(5 * MIN);
    assert_eq!(b.restante(id), -12_000);
    // Retomar continua do negativo.
    b.iniciar(id).unwrap();
    b.tick(3 * S);
    assert_eq!(b.restante(id), -15_000);

    // E segue por horas, sem limite.
    b.tick(2 * 60 * MIN);
    assert_eq!(b.restante(id), -as_i64(2 * 60 * MIN + 15 * S));
}

#[test]
fn fim_dispara_uma_unica_vez_ate_redefinir() {
    let mut b = Banco::novo();
    let id = b.criar("Chá", 4 * MIN);
    b.iniciar(id).unwrap();
    b.fx.clear();

    b.tick(4 * MIN);
    assert_eq!(b.fx.ended.len(), 1);
    // Mais ticks, o mesmo "agora" de novo, pausar e retomar no negativo: nada.
    let now = b.agora();
    assert_eq!(b.t.advance_to(now, &mut b.fx), 0);
    for _ in 0..40 {
        b.tick(250);
    }
    b.pausar(id).unwrap();
    b.tick(MIN);
    b.iniciar(id).unwrap();
    b.tick(MIN);
    assert_eq!(b.fx.ended.len(), 1);

    // Redefinir rearma: parado na duração cheia, e o próximo fim dispara.
    b.redefinir(id).unwrap();
    let r = b.t.get(id, b.agora()).unwrap();
    assert_eq!(r.status, TimerStatus::Idle);
    assert_eq!(r.remaining_ms, as_i64(4 * MIN));
    assert!(!r.ended && !r.is_overdue());
    b.iniciar(id).unwrap();
    b.tick(4 * MIN);
    assert_eq!(b.fx.ended.len(), 2);
}

#[test]
fn pausar_depois_do_prazo_sem_tick_dispara_antes_de_pausar() {
    let mut b = Banco::novo();
    let id = b.criar("", MIN);
    b.iniciar(id).unwrap();
    b.fx.clear();
    // O laço ainda não passou; o comando chega 5 s depois do prazo.
    b.relogio.advance_ms(MIN + 5 * S);
    b.pausar(id).unwrap();
    assert_eq!(b.fx.ended_ids(), [id]);
    assert!(!b.fx.ended[0].late);
    assert_eq!(b.restante(id), -5000);
    // Pausado no negativo, o tick não dispara de novo.
    b.tick(MIN);
    assert_eq!(b.fx.ended.len(), 1);
}

#[test]
fn fim_percebido_depois_de_60_s_sai_atrasado() {
    let mut b = Banco::novo();
    let a = b.criar("A", MIN);
    let c = b.criar("C", 3 * MIN);
    b.iniciar(a).unwrap();
    b.iniciar(c).unwrap();
    b.fx.clear();
    // Suspensão: o próximo tick é 3 min depois. A venceu há 2 min; C, agora.
    b.tick(3 * MIN);
    assert_eq!(b.fx.ended_ids(), [a, c]);
    assert!(b.fx.ended[0].late);
    assert!(!b.fx.ended[1].late);
    // 60 s exatos ainda é normal.
    let mut b = Banco::novo();
    let id = b.criar("", MIN);
    b.iniciar(id).unwrap();
    b.tick(2 * MIN);
    assert!(!b.fx.ended[0].late);
    // O limite muda no modo acelerado.
    let mut t = Timers::new().with_late_after_ms(0);
    let mut fx = FakeCountdownEffects::new();
    let id = t.create(INICIO, "", MIN, &mut fx).unwrap();
    t.start(INICIO, id, &mut fx).unwrap();
    t.advance_to(em(MIN + 1), &mut fx);
    assert!(fx.ended[0].late);
}

#[test]
fn criar_editar_excluir_e_erros() {
    let mut b = Banco::novo();
    assert!(b.t.is_empty());
    let id = b.criar("  Chá\n", 4 * MIN);
    let r = b.t.get(id, b.agora()).unwrap();
    assert_eq!(r.name, "Chá");
    assert_eq!(r.status, TimerStatus::Idle);
    assert_eq!(r.remaining_ms, as_i64(4 * MIN));
    assert_eq!(b.fx.changes.len(), 1);

    let now = b.agora();
    for ruim in [0, 999, MAX_DURATION_MS + 1] {
        assert_eq!(
            b.t.create(now, "x", ruim, &mut b.fx),
            Err(CountdownError::InvalidDuration)
        );
    }
    assert_eq!(
        b.t.create(now, &"x".repeat(256), MIN, &mut b.fx),
        Err(CountdownError::NameTooLong)
    );
    assert_eq!(b.t.len(), 1);
    assert_eq!(b.fx.changes.len(), 1, "recusa não pede efeito");

    // Só o nome: o que corre continua correndo.
    b.iniciar(id).unwrap();
    b.tick(MIN);
    let now = b.agora();
    b.t.update(now, id, "Chá verde", 4 * MIN, &mut b.fx)
        .unwrap();
    assert_eq!(b.status(id), TimerStatus::Running);
    assert_eq!(b.restante(id), as_i64(3 * MIN));
    assert_eq!(b.t.get(id, now).unwrap().name, "Chá verde");

    // Duração nova: volta a parado, cheio.
    b.t.update(now, id, "Chá verde", 5 * MIN, &mut b.fx)
        .unwrap();
    assert_eq!(b.status(id), TimerStatus::Idle);
    assert_eq!(b.restante(id), as_i64(5 * MIN));

    assert_eq!(b.iniciar(99), Err(CountdownError::NotFound(99)));
    assert_eq!(b.pausar(id), Err(CountdownError::NotRunning));
    b.iniciar(id).unwrap();
    assert_eq!(b.iniciar(id), Err(CountdownError::AlreadyRunning));

    // Excluir um que corre; os ids não se repetem.
    let outro = b.criar("", MIN);
    b.t.delete(now, id, &mut b.fx).unwrap();
    assert_eq!(b.t.ids(), [outro]);
    assert_eq!(
        b.t.delete(now, id, &mut b.fx),
        Err(CountdownError::NotFound(id))
    );
    let novo = b.criar("", MIN);
    assert!(novo > outro);
    assert!(!b.t.any_running());
}

#[test]
fn padroes_de_1_3_5_e_10_min() {
    let t = Timers::with_defaults();
    let r = t.snapshot(INICIO);
    assert_eq!(DEFAULT_MINUTES, [1, 3, 5, 10]);
    assert_eq!(
        r.timers.iter().map(|t| t.duration_ms).collect::<Vec<_>>(),
        [MIN, 3 * MIN, 5 * MIN, 10 * MIN]
    );
    assert!(
        r.timers
            .iter()
            .all(|t| t.name.is_empty() && t.status == TimerStatus::Idle)
    );
    assert_eq!(t.ids(), [1, 2, 3, 4]);
}

#[test]
fn relogio_para_tras_nao_dispara_nem_passa_da_duracao() {
    let mut b = Banco::novo();
    let id = b.criar("", 5 * MIN);
    b.iniciar(id).unwrap();
    b.tick(MIN);
    b.fx.clear();
    b.relogio.set(EpochMs(INICIO.0 - as_i64(60 * MIN)));
    let now = b.agora();
    assert_eq!(b.t.advance_to(now, &mut b.fx), 0);
    assert_eq!(b.restante(id), as_i64(5 * MIN));
    // Pausar com o relógio atrás guarda no máximo a duração.
    b.pausar(id).unwrap();
    assert_eq!(b.restante(id), as_i64(5 * MIN));
    assert!(b.fx.ended.is_empty());
}

fn as_i64(ms: u64) -> i64 {
    i64::try_from(ms).unwrap()
}
