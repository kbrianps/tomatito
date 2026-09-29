//! Retomada (M40), pela API pública: o que o app faz ao abrir. Um núcleo
//! "antes de fechar" anda até o `kill -9`; o retrato dele vira o registro que
//! o `state.json` guarda; um núcleo novo, "na abertura", o recebe pelo
//! `restore` e roda o `advance_to(now)`.

#[cfg(target_family = "wasm")]
use wasm_bindgen_test::wasm_bindgen_test as test;

use tomatito_core::{
    EpochMs, FakeCountdownEffects, FakeEffects, Focus, FocusSnapshot, MAX_LAPS, Notice, PhaseKind,
    RestoreError, RunRecord, SessionConfig, SessionRecord, Sound, Status, Stopwatch,
    StopwatchRecord, StopwatchStatus, TimerRecord, TimerRunRecord, TimerStatus, Timers,
};

const INICIO: EpochMs = EpochMs(1_790_000_000_000);
const S: u64 = 1000;
const MIN: u64 = 60 * S;

fn em(ms: u64) -> EpochMs {
    INICIO.plus_ms(ms)
}

/// O registro que o app grava a partir do retrato (o `state.json`).
fn registro(r: &FocusSnapshot) -> Option<SessionRecord> {
    let s = r.session.as_ref()?;
    let run = match r.status {
        Status::Idle => return None,
        Status::Focus { .. } | Status::Break { .. } => RunRecord::Running {
            ends_at: s.ends_at.unwrap(),
        },
        Status::Paused { .. } => RunRecord::Paused {
            remaining_ms: s.remaining_ms,
        },
        Status::Completed => RunRecord::Completed {
            at: s.completed_at.unwrap(),
        },
    };
    Some(SessionRecord {
        id: s.id,
        config: s.config,
        started_at: s.started_at,
        phase_index: s.phase_index,
        phase_started_at: s.phase_started_at,
        run,
        focus_s: s.focus_s,
    })
}

/// Fecha o app em `fechou` (o retrato daquele instante é o do arquivo) e o
/// reabre em `abriu`: `restore` e `advance_to`.
fn fechar_e_abrir(antes: &Focus, fechou: EpochMs, abriu: EpochMs) -> (Focus, FakeEffects) {
    let r = antes.snapshot(fechou);
    let mut depois = Focus::new();
    depois
        .restore(antes.last_session_id(), registro(&r))
        .unwrap();
    let mut fx = FakeEffects::new();
    depois.advance_to(abriu, &mut fx);
    (depois, fx)
}

#[test]
fn kill_no_meio_do_foco_continua_no_tempo_certo() {
    let mut f = Focus::new();
    let mut fx = FakeEffects::new();
    f.start(INICIO, SessionConfig::new(60), &mut fx).unwrap();
    // `kill -9` aos 10 min; reabre 3 min depois.
    let (depois, fx) = fechar_e_abrir(&f, em(10 * MIN), em(13 * MIN));
    assert!(fx.is_empty(), "nada venceu: nenhum efeito ao abrir");
    let r = depois.snapshot(em(13 * MIN));
    assert_eq!(r.status, Status::Focus { n: 1 });
    let s = r.session.unwrap();
    assert_eq!(
        s.remaining_ms,
        1650 * S - 13 * MIN,
        "o tempo fechado contou"
    );
    assert_eq!(s.ends_at, Some(em(1650 * S)), "o mesmo prazo");
    assert_eq!(s.id, INICIO.0);
    assert_eq!(depois.deadline(), Some(em(1650 * S)));
}

#[test]
fn kill_e_a_fase_vence_ha_mais_de_60_s_grava_e_avisa_concluida_sem_som() {
    let mut f = Focus::new();
    let mut fx = FakeEffects::new();
    f.start(INICIO, SessionConfig::new(5), &mut fx).unwrap();
    // A sessão de 5 min vence aos 5 min; o app reabre aos 7 min.
    let (depois, fx) = fechar_e_abrir(&f, em(MIN), em(7 * MIN));
    assert!(fx.sounds().is_empty(), "atrasado: sem som");
    let p = fx.periods();
    assert_eq!(p.len(), 1);
    assert!(p[0].completed);
    assert_eq!(p[0].actual_s, 300);
    assert_eq!(
        p[0].ended_at,
        em(5 * MIN),
        "o fim é o prazo, não a abertura"
    );
    assert_eq!(p[0].session_id, INICIO.0);
    assert_eq!(fx.notices().len(), 1);
    assert!(matches!(
        fx.notices()[0],
        Notice::Late { ended_at, session_completed: true, .. } if ended_at == em(5 * MIN)
    ));
    assert_eq!(depois.status(), Status::Completed);
}

#[test]
fn reabrir_ate_60_s_depois_do_prazo_e_o_fim_normal_com_som() {
    let mut f = Focus::new();
    let mut fx = FakeEffects::new();
    f.start(INICIO, SessionConfig::new(5), &mut fx).unwrap();
    let (_, fx) = fechar_e_abrir(&f, em(MIN), em(5 * MIN + 60 * S));
    assert_eq!(fx.sounds(), [Sound::FocusEnd]);
    assert!(matches!(
        fx.notices()[..],
        [Notice::SessionCompleted { .. }]
    ));
}

#[test]
fn duas_horas_fechado_numa_sessao_de_60_min_grava_as_tres_fases() {
    let mut f = Focus::new();
    let mut fx = FakeEffects::new();
    f.start(INICIO, SessionConfig::new(60), &mut fx).unwrap();
    let (depois, fx) = fechar_e_abrir(&f, em(5 * MIN), em(120 * MIN));
    let kinds: Vec<_> = fx.periods().iter().map(|p| p.kind).collect();
    assert_eq!(
        kinds,
        [PhaseKind::Focus, PhaseKind::Break, PhaseKind::Focus]
    );
    assert!(fx.sounds().is_empty());
    assert_eq!(fx.notices().len(), 1);
    assert_eq!(
        depois.snapshot(em(120 * MIN)).session.unwrap().focus_s,
        3300
    );
}

#[test]
fn no_intervalo_e_pausado() {
    // Fechado no intervalo, reabre ainda nele.
    let mut f = Focus::new();
    let mut fx = FakeEffects::new();
    f.start(INICIO, SessionConfig::new(60), &mut fx).unwrap();
    f.advance_to(em(1650 * S), &mut fx);
    let (depois, fx2) = fechar_e_abrir(&f, em(1651 * S), em(1700 * S));
    assert!(fx2.is_empty());
    let r = depois.snapshot(em(1700 * S));
    assert_eq!(r.status, Status::Break { n: 1 });
    let s = r.session.unwrap();
    assert_eq!(s.focus_s, 1650, "o foco já feito vem junto");
    assert_eq!(s.remaining_ms, 300 * S - 50 * S);

    // Pausado: reabrir uma hora depois não muda nada.
    let mut f = Focus::new();
    f.start(INICIO, SessionConfig::new(25), &mut fx).unwrap();
    f.pause(em(4 * MIN), &mut fx).unwrap();
    let (mut depois, fx2) = fechar_e_abrir(&f, em(5 * MIN), em(65 * MIN));
    assert!(fx2.is_empty());
    let r = depois.snapshot(em(65 * MIN));
    assert!(matches!(r.status, Status::Paused { .. }));
    assert_eq!(r.session.unwrap().remaining_ms, 21 * MIN);
    let mut fx3 = FakeEffects::new();
    depois.resume(em(65 * MIN), &mut fx3).unwrap();
    assert_eq!(depois.deadline(), Some(em(86 * MIN)));
}

#[test]
fn concluida_e_ocioso_voltam_como_estavam() {
    let mut f = Focus::new();
    let mut fx = FakeEffects::new();
    f.start(INICIO, SessionConfig::new(5), &mut fx).unwrap();
    f.advance_to(em(5 * MIN), &mut fx);
    let (depois, fx2) = fechar_e_abrir(&f, em(6 * MIN), em(70 * MIN));
    assert!(fx2.is_empty(), "concluída não vence de novo");
    assert_eq!(depois.status(), Status::Completed);

    let mut ocioso = Focus::new();
    assert_eq!(ocioso.restore(0, None), Ok(()));
    assert_eq!(ocioso.status(), Status::Idle);
}

#[test]
fn o_id_da_sessao_nao_se_repete_entre_aberturas() {
    // O relógio voltou entre as aberturas: a próxima sessão ainda ganha um id
    // maior que o da guardada.
    let mut f = Focus::new();
    let mut fx = FakeEffects::new();
    f.start(INICIO, SessionConfig::new(5), &mut fx).unwrap();
    f.stop(em(MIN), &mut fx).unwrap();
    let mut depois = Focus::new();
    depois.restore(f.last_session_id(), None).unwrap();
    depois
        .start(INICIO, SessionConfig::new(5), &mut fx)
        .unwrap();
    assert_eq!(depois.snapshot(INICIO).session.unwrap().id, INICIO.0 + 1);
}

#[test]
fn registro_impossivel_fica_ocioso() {
    let base = SessionRecord {
        id: INICIO.0,
        config: SessionConfig::new(60),
        started_at: INICIO,
        phase_index: 0,
        phase_started_at: INICIO,
        run: RunRecord::Running { ends_at: em(MIN) },
        focus_s: 0,
    };
    let mut f = Focus::new();
    assert_eq!(
        f.restore(
            7,
            Some(SessionRecord {
                phase_index: 3,
                ..base
            })
        ),
        Err(RestoreError::PhaseOutOfRange { index: 3 })
    );
    assert_eq!(f.status(), Status::Idle);
    assert_eq!(f.last_session_id(), 7);
    let mut sem_t = base;
    sem_t.config.minutes = 0;
    assert!(matches!(
        f.restore(0, Some(sem_t)),
        Err(RestoreError::Plan(_))
    ));
    // Pausado com mais que a fase: para na duração.
    let pausado = SessionRecord {
        run: RunRecord::Paused {
            remaining_ms: 99 * MIN,
        },
        ..base
    };
    f.restore(0, Some(pausado)).unwrap();
    assert_eq!(f.snapshot(INICIO).session.unwrap().remaining_ms, 1650 * S);
}

#[test]
fn restaurar_mantem_o_limite_do_atraso() {
    let mut f = Focus::new().with_late_after_ms(10 * MIN);
    let mut fx = FakeEffects::new();
    let mut antes = Focus::new();
    antes.start(INICIO, SessionConfig::new(5), &mut fx).unwrap();
    f.restore(0, registro(&antes.snapshot(INICIO))).unwrap();
    assert_eq!(f.late_after_ms(), 10 * MIN);
    let mut fx = FakeEffects::new();
    f.advance_to(em(12 * MIN), &mut fx);
    assert_eq!(fx.sounds(), [Sound::FocusEnd], "7 min depois, dentro de 10");
}

fn temporizador(id: u64, run: TimerRunRecord, ended: bool) -> TimerRecord {
    TimerRecord {
        id,
        name: format!("t{id}"),
        duration_ms: 4 * MIN,
        run,
        ended,
    }
}

#[test]
fn temporizadores_voltam_e_o_que_zerou_fechado_dispara_atrasado_uma_vez() {
    let mut t = Timers::new();
    let recusados = t.restore(vec![
        temporizador(2, TimerRunRecord::Idle, false),
        temporizador(
            5,
            TimerRunRecord::Running {
                ends_at: em(5 * MIN),
            },
            false,
        ),
        temporizador(6, TimerRunRecord::Running { ends_at: em(MIN) }, false),
        temporizador(7, TimerRunRecord::Running { ends_at: em(MIN) }, true),
        temporizador(
            9,
            TimerRunRecord::Paused {
                remaining_ms: -12 * S as i64,
            },
            true,
        ),
    ]);
    assert_eq!(recusados, 0);
    assert_eq!(t.ids(), [2, 5, 6, 7, 9]);
    let mut fx = FakeCountdownEffects::new();
    t.advance_to(em(3 * MIN), &mut fx);
    assert_eq!(
        fx.ended_ids(),
        [6],
        "o 7 já tinha disparado antes de fechar"
    );
    assert!(fx.ended[0].late, "zerou 2 min antes da abertura: sem som");
    let r = t.snapshot(em(3 * MIN));
    let t5 = r.get(5).unwrap();
    assert_eq!(t5.status, TimerStatus::Running);
    assert_eq!(t5.remaining_ms, 2 * MIN as i64);
    assert_eq!(r.get(9).unwrap().remaining_ms, -12_000);
    assert_eq!(r.get(9).unwrap().status, TimerStatus::Paused);
    // Um novo continua depois do maior id.
    let id = t.create(em(3 * MIN), "", MIN, &mut fx).unwrap();
    assert_eq!(id, 10);
}

#[test]
fn temporizador_invalido_fica_de_fora_e_os_outros_entram() {
    let mut t = Timers::new();
    let longo = TimerRecord {
        name: "a".repeat(300),
        ..temporizador(3, TimerRunRecord::Idle, false)
    };
    let sem_duracao = TimerRecord {
        duration_ms: 0,
        ..temporizador(4, TimerRunRecord::Idle, false)
    };
    let recusados = t.restore(vec![
        temporizador(0, TimerRunRecord::Idle, false),
        temporizador(1, TimerRunRecord::Idle, true),
        temporizador(1, TimerRunRecord::Idle, false),
        longo,
        sem_duracao,
    ]);
    assert_eq!(recusados, 4);
    assert_eq!(t.ids(), [1]);
    assert!(
        !t.get(1, INICIO).unwrap().ended,
        "parado: o fim fica armado"
    );
    assert_eq!(Timers::new().restore(vec![]), 0);
}

#[test]
fn cronometro_correndo_conta_o_tempo_fechado() {
    let mut c = Stopwatch::new();
    assert!(c.restore(StopwatchRecord {
        status: StopwatchStatus::Running,
        started_at: Some(INICIO),
        accumulated_ms: 5 * S,
        laps: vec![1_000, 3_000],
    }));
    let r = c.snapshot(em(MIN));
    assert_eq!(r.elapsed_ms, 65 * S);
    assert_eq!(r.laps, [1_000, 3_000]);
    assert_eq!(c.lap(em(MIN)), Ok(3));

    let mut c = Stopwatch::new();
    assert!(c.restore(StopwatchRecord {
        status: StopwatchStatus::Paused,
        started_at: None,
        accumulated_ms: 7 * S,
        laps: vec![],
    }));
    assert_eq!(c.snapshot(em(MIN)).elapsed_ms, 7 * S);
    assert_eq!(c.status(), StopwatchStatus::Paused);
}

#[test]
fn cronometro_incoerente_fica_zerado() {
    let base = StopwatchRecord {
        status: StopwatchStatus::Running,
        started_at: None,
        accumulated_ms: 5 * S,
        laps: vec![],
    };
    for r in [
        base.clone(),
        StopwatchRecord {
            started_at: Some(INICIO),
            laps: vec![3, 2],
            ..base.clone()
        },
        StopwatchRecord {
            started_at: Some(INICIO),
            laps: vec![1; MAX_LAPS + 1],
            ..base.clone()
        },
    ] {
        let mut c = Stopwatch::new();
        assert!(!c.restore(r));
        assert_eq!(c.snapshot(INICIO).elapsed_ms, 0);
        assert_eq!(c.status(), StopwatchStatus::Idle);
    }
    let mut c = Stopwatch::new();
    assert!(c.restore(StopwatchRecord {
        status: StopwatchStatus::Idle,
        ..base
    }));
    assert_eq!(
        c.snapshot(INICIO).elapsed_ms,
        0,
        "zerado ignora o acumulado"
    );
}
