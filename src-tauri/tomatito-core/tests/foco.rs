//! Máquina de estados do foco (M15), pela API pública, como o app vai usar:
//! o relógio é um `FakeClock`, os efeitos vão para um `FakeEffects`, e cada
//! comando recebe o "agora" do relógio.
//!
//! Os três itens do "Pronto quando" do M15:
//! - iniciar, pausar, retomar, pular e parar: `iniciar_*`, `pausar_*`,
//!   `pular_*` e `parar_*`;
//! - o relógio pulando 40 min fecha a fase: `relogio_pulando_40_min_*`;
//! - o relógio pulando 2 h numa sessão de 60 min: `relogio_pulando_2_h_*`.

#[cfg(target_family = "wasm")]
use wasm_bindgen_test::wasm_bindgen_test as test;

use tomatito_core::{
    ChangeCause, Clock, EpochMs, FakeClock, FakeEffects, Focus, FocusError, Notice, Period, Phase,
    PhaseChange, PhaseKind, Plan, PlanError, PlanSettings, SessionConfig, Sound, Status,
};

/// 2026-09-21 14:13:20 UTC, só para os números serem de verdade.
const INICIO: EpochMs = EpochMs(1_790_000_000_000);
const S: u64 = 1000;
const MIN: u64 = 60 * S;

const FOCO_60: Phase = Phase {
    kind: PhaseKind::Focus,
    n: 1,
    duration_s: 1650,
};
const INTERVALO_60: Phase = Phase {
    kind: PhaseKind::Break,
    n: 1,
    duration_s: 300,
};
const FOCO_2_60: Phase = Phase {
    kind: PhaseKind::Focus,
    n: 2,
    duration_s: 1650,
};

fn em(ms: u64) -> EpochMs {
    INICIO.plus_ms(ms)
}

/// Relógio, foco e efeitos, com os comandos lendo o "agora" do relógio.
struct Banco {
    relogio: FakeClock,
    foco: Focus,
    fx: FakeEffects,
}

impl Banco {
    fn novo() -> Self {
        Self::com(Focus::new())
    }

    fn com(foco: Focus) -> Self {
        Self {
            relogio: FakeClock::new(INICIO),
            foco,
            fx: FakeEffects::new(),
        }
    }

    /// Já com uma sessão de `minutes` iniciada em `INICIO` e os efeitos do
    /// início apagados.
    fn sessao(minutes: u32) -> Self {
        Self::sessao_com(SessionConfig::new(minutes))
    }

    fn sessao_com(config: SessionConfig) -> Self {
        let mut banco = Self::novo();
        banco.iniciar(config).expect("início válido");
        banco.fx.clear();
        banco
    }

    fn agora(&self) -> EpochMs {
        self.relogio.now()
    }

    fn andar_ms(&self, ms: u64) -> EpochMs {
        self.relogio.advance_ms(ms)
    }

    fn ir(&self, t: EpochMs) {
        self.relogio.set(t);
    }

    fn avancar(&mut self) -> u32 {
        self.foco.advance_to(self.relogio.now(), &mut self.fx)
    }

    fn iniciar(&mut self, config: SessionConfig) -> Result<(), FocusError> {
        self.foco.start(self.relogio.now(), config, &mut self.fx)
    }

    fn pausar(&mut self) -> Result<(), FocusError> {
        self.foco.pause(self.relogio.now(), &mut self.fx)
    }

    fn retomar(&mut self) -> Result<(), FocusError> {
        self.foco.resume(self.relogio.now(), &mut self.fx)
    }

    fn pular(&mut self) -> Result<(), FocusError> {
        self.foco.skip(self.relogio.now(), &mut self.fx)
    }

    fn parar(&mut self) -> Result<(), FocusError> {
        self.foco.stop(self.relogio.now(), &mut self.fx)
    }

    fn restante_ms(&self) -> u64 {
        self.foco
            .snapshot(self.agora())
            .session
            .expect("há sessão")
            .remaining_ms
    }
}

fn periodo(
    fase: Phase,
    id: i64,
    de: EpochMs,
    ate: EpochMs,
    actual_s: u64,
    completo: bool,
) -> Period {
    Period {
        session_id: id,
        kind: fase.kind,
        n: fase.n,
        started_at: de,
        ended_at: ate,
        planned_s: fase.duration_s,
        actual_s,
        completed: completo,
        task_id: None,
    }
}

// ---------------------------------------------------------------------------
// Iniciar, pausar, retomar, pular e parar
// ---------------------------------------------------------------------------

#[test]
fn ocioso_nao_tem_sessao_nem_prazo() {
    let foco = Focus::new();
    assert_eq!(foco.status(), Status::Idle);
    assert_eq!(foco.deadline(), None);
    assert!(!foco.is_running());
    let retrato = foco.snapshot(INICIO);
    assert_eq!(retrato.status, Status::Idle);
    assert_eq!(retrato.at, INICIO);
    assert_eq!(retrato.session, None);
    assert_eq!(Focus::default(), foco);
    assert_eq!(foco.late_after_ms(), 60_000);
}

#[test]
fn iniciar_comeca_o_foco_1_com_o_prazo_no_relogio_de_parede() {
    let mut b = Banco::novo();
    b.iniciar(SessionConfig {
        task_id: Some(7),
        ..SessionConfig::new(60)
    })
    .expect("início válido");

    assert_eq!(b.foco.status(), Status::Focus { n: 1 });
    assert_eq!(b.foco.deadline(), Some(em(1650 * S)));
    assert!(b.foco.is_running());
    assert_eq!(b.fx.kinds(), ["estado", "fase"]);
    assert_eq!(
        b.fx.phase_changes(),
        [PhaseChange {
            cause: ChangeCause::Started,
            status: Status::Focus { n: 1 },
            ended: None,
        }]
    );

    let retrato = b.fx.states()[0].clone();
    assert_eq!(retrato, b.foco.snapshot(INICIO));
    let sessao = retrato.session.expect("há sessão");
    assert_eq!(sessao.id, INICIO.0);
    assert_eq!(sessao.config.minutes, 60);
    assert_eq!(sessao.config.task_id, Some(7));
    assert_eq!(sessao.started_at, INICIO);
    assert_eq!((sessao.blocks, sessao.intervals), (2, 1));
    assert_eq!(sessao.phase_index, 0);
    assert_eq!(sessao.phase, FOCO_60);
    assert_eq!(sessao.phase_started_at, INICIO);
    assert_eq!(sessao.ends_at, Some(em(1650 * S)));
    assert_eq!(sessao.remaining_ms, 1650 * S);
    assert_eq!(sessao.next, Some(INTERVALO_60));
    assert_eq!(sessao.focus_s, 0);
    assert_eq!(sessao.completed_at, None);

    // O restante acompanha o relógio, sem nenhum tick.
    b.andar_ms(10 * MIN + 250);
    assert_eq!(b.restante_ms(), 1650 * S - 10 * MIN - 250);
}

#[test]
fn iniciar_com_sessao_ativa_ou_plano_invalido_e_recusado_sem_efeitos() {
    let mut b = Banco::sessao(60);
    b.andar_ms(MIN);
    assert_eq!(
        b.iniciar(SessionConfig::new(30)),
        Err(FocusError::AlreadyActive)
    );
    b.pausar().expect("pausa");
    b.fx.clear();
    assert_eq!(
        b.iniciar(SessionConfig::new(30)),
        Err(FocusError::AlreadyActive)
    );
    assert!(b.fx.is_empty());
    assert_eq!(
        b.foco.status(),
        Status::Paused {
            kind: PhaseKind::Focus,
            n: 1
        }
    );

    let mut b = Banco::novo();
    let sem_intervalo = SessionConfig {
        settings: PlanSettings {
            focus_minutes: 25,
            break_minutes: 0,
        },
        ..SessionConfig::new(60)
    };
    assert_eq!(
        b.iniciar(sem_intervalo),
        Err(FocusError::Plan(PlanError::ZeroBreak))
    );
    assert_eq!(
        b.iniciar(SessionConfig::new(0)),
        Err(FocusError::Plan(PlanError::ZeroTotal))
    );
    assert!(b.fx.is_empty());
    assert_eq!(b.foco.status(), Status::Idle);
}

#[test]
fn pausar_guarda_o_restante_e_o_tempo_pausado_nao_conta() {
    let mut b = Banco::sessao(60);
    b.andar_ms(10 * MIN);
    b.pausar().expect("pausa");

    let pausado = Status::Paused {
        kind: PhaseKind::Focus,
        n: 1,
    };
    assert_eq!(b.foco.status(), pausado);
    assert_eq!(b.foco.deadline(), None);
    assert!(!b.foco.is_running());
    assert_eq!(b.fx.kinds(), ["estado"]);
    let retrato = b.fx.states()[0].clone();
    assert_eq!(retrato.status, pausado);
    let sessao = retrato.session.expect("há sessão");
    assert_eq!(sessao.ends_at, None);
    assert_eq!(sessao.remaining_ms, 1650 * S - 10 * MIN);

    // Três horas pausado: nada vence, nada muda.
    b.fx.clear();
    b.andar_ms(180 * MIN);
    assert_eq!(b.avancar(), 0);
    assert!(b.fx.is_empty());
    assert_eq!(b.restante_ms(), 1650 * S - 10 * MIN);

    // Pausar de novo e retomar sem pausa são recusados, sem efeitos.
    assert_eq!(b.pausar(), Err(FocusError::NotRunning));
    assert!(b.fx.is_empty());

    // Retomar: prazo = agora + o que faltava.
    let retomado_em = b.agora();
    b.retomar().expect("retomada");
    assert_eq!(b.foco.status(), Status::Focus { n: 1 });
    let prazo = retomado_em.plus_ms(1650 * S - 10 * MIN);
    assert_eq!(b.foco.deadline(), Some(prazo));
    assert_eq!(b.fx.kinds(), ["estado"]);
    assert_eq!(b.retomar(), Err(FocusError::NotPaused));

    // Vence no prazo novo, não antes; o período correu 1650 s de verdade.
    b.fx.clear();
    b.ir(EpochMs(prazo.0 - 1));
    assert_eq!(b.avancar(), 0);
    b.ir(prazo);
    assert_eq!(b.avancar(), 1);
    assert_eq!(
        b.fx.periods(),
        [periodo(FOCO_60, INICIO.0, INICIO, prazo, 1650, true)]
    );
    assert_eq!(b.foco.status(), Status::Break { n: 1 });
}

#[test]
fn pular_o_foco_vai_ao_intervalo_e_pular_o_intervalo_vai_ao_foco() {
    let mut b = Banco::sessao(60);

    // Foco 1 pulado aos 10 min: gravado como interrompido, com 600 s.
    let t1 = b.andar_ms(10 * MIN);
    b.pular().expect("pular o foco");
    assert_eq!(b.foco.status(), Status::Break { n: 1 });
    assert_eq!(b.foco.deadline(), Some(t1.plus_ms(5 * MIN)));
    assert_eq!(b.fx.kinds(), ["período", "estado", "fase"]);
    assert_eq!(
        b.fx.periods(),
        [periodo(FOCO_60, INICIO.0, INICIO, t1, 600, false)]
    );
    assert_eq!(
        b.fx.phase_changes(),
        [PhaseChange {
            cause: ChangeCause::Skipped,
            status: Status::Break { n: 1 },
            ended: Some(FOCO_60),
        }]
    );
    assert!(b.fx.sounds().is_empty());
    assert!(b.fx.notices().is_empty());

    // Intervalo pulado aos 2 min.
    b.fx.clear();
    let t2 = b.andar_ms(2 * MIN);
    b.pular().expect("pular o intervalo");
    assert_eq!(b.foco.status(), Status::Focus { n: 2 });
    assert_eq!(b.foco.deadline(), Some(t2.plus_ms(1650 * S)));
    assert_eq!(
        b.fx.periods(),
        [periodo(INTERVALO_60, INICIO.0, t1, t2, 120, false)]
    );

    // Pular o último foco conclui a sessão, também sem som nem aviso.
    b.fx.clear();
    let t3 = b.andar_ms(5 * MIN + 999);
    b.pular().expect("pular o último foco");
    assert_eq!(b.foco.status(), Status::Completed);
    assert_eq!(b.foco.deadline(), None);
    assert_eq!(
        b.fx.periods(),
        [periodo(FOCO_2_60, INICIO.0, t2, t3, 300, false)]
    );
    assert_eq!(
        b.fx.phase_changes()[0],
        PhaseChange {
            cause: ChangeCause::Skipped,
            status: Status::Completed,
            ended: Some(FOCO_2_60),
        }
    );
    assert!(b.fx.sounds().is_empty() && b.fx.notices().is_empty());
    let sessao = b.foco.snapshot(t3).session.expect("há sessão");
    assert_eq!(sessao.completed_at, Some(t3));
    assert_eq!(sessao.focus_s, 600 + 300);
    assert_eq!(sessao.remaining_ms, 0);
    assert_eq!(sessao.next, None);

    // Concluída: nada a pular nem a parar.
    b.fx.clear();
    assert_eq!(b.pular(), Err(FocusError::NoSession));
    assert_eq!(b.parar(), Err(FocusError::NoSession));
    assert_eq!(b.pausar(), Err(FocusError::NotRunning));
    assert!(b.fx.is_empty());
}

#[test]
fn pular_uma_fase_pausada_comeca_a_seguinte_correndo() {
    let mut b = Banco::sessao(60);
    b.andar_ms(4 * MIN);
    b.pausar().expect("pausa");
    let t = b.andar_ms(30 * MIN);
    b.fx.clear();
    b.pular().expect("pular");
    // O período conta só os 4 min que correram; o fim é a hora do pulo.
    assert_eq!(
        b.fx.periods(),
        [periodo(FOCO_60, INICIO.0, INICIO, t, 240, false)]
    );
    assert_eq!(b.foco.status(), Status::Break { n: 1 });
    assert_eq!(b.foco.deadline(), Some(t.plus_ms(5 * MIN)));
}

#[test]
fn parar_grava_o_parcial_e_volta_ao_ocioso() {
    let mut b = Banco::sessao_com(SessionConfig {
        task_id: Some(42),
        ..SessionConfig::new(60)
    });
    let t = b.andar_ms(12 * MIN + 30 * S + 999);
    b.parar().expect("parar");

    assert_eq!(b.foco.status(), Status::Idle);
    assert_eq!(b.foco.deadline(), None);
    assert_eq!(b.fx.kinds(), ["período", "estado", "fase"]);
    assert_eq!(
        b.fx.periods(),
        [Period {
            task_id: Some(42),
            // 750,999 s correram: grava 750.
            ..periodo(FOCO_60, INICIO.0, INICIO, t, 750, false)
        }]
    );
    assert_eq!(b.fx.states()[0].session, None);
    assert_eq!(
        b.fx.phase_changes(),
        [PhaseChange {
            cause: ChangeCause::Stopped,
            status: Status::Idle,
            ended: Some(FOCO_60),
        }]
    );
    assert!(b.fx.sounds().is_empty() && b.fx.notices().is_empty());

    // Parado: nenhum comando além de iniciar.
    b.fx.clear();
    assert_eq!(b.parar(), Err(FocusError::NoSession));
    assert_eq!(b.pular(), Err(FocusError::NoSession));
    assert_eq!(b.pausar(), Err(FocusError::NotRunning));
    assert_eq!(b.retomar(), Err(FocusError::NotPaused));
    assert_eq!(b.avancar(), 0);
    assert!(b.fx.is_empty());
}

#[test]
fn parar_num_intervalo_pausado_grava_o_intervalo() {
    let mut b = Banco::sessao(60);
    b.ir(em(1650 * S));
    b.avancar();
    b.andar_ms(MIN);
    b.pausar().expect("pausa");
    let t = b.andar_ms(10 * MIN);
    b.fx.clear();
    b.parar().expect("parar");
    assert_eq!(
        b.fx.periods(),
        [periodo(INTERVALO_60, INICIO.0, em(1650 * S), t, 60, false)]
    );
    assert_eq!(b.foco.status(), Status::Idle);
}

#[test]
fn nova_sessao_depois_de_concluida_ou_parada_tem_outro_id() {
    let mut b = Banco::sessao(5);
    b.ir(em(5 * MIN));
    assert_eq!(b.avancar(), 1);
    assert_eq!(b.foco.status(), Status::Completed);

    // Concluída: iniciar vale, no mesmo instante.
    b.iniciar(SessionConfig::new(5)).expect("nova sessão");
    let id = b.foco.snapshot(b.agora()).session.expect("sessão").id;
    assert_eq!(id, em(5 * MIN).0);

    // Parar e iniciar no mesmo ms: o id não repete.
    b.parar().expect("parar");
    b.iniciar(SessionConfig::new(5)).expect("outra sessão");
    let outro = b.foco.snapshot(b.agora()).session.expect("sessão").id;
    assert_eq!(outro, id + 1);

    // Com o relógio para trás, também não.
    b.parar().expect("parar");
    b.ir(INICIO);
    b.iniciar(SessionConfig::new(5)).expect("mais uma");
    let terceiro = b.foco.snapshot(b.agora()).session.expect("sessão").id;
    assert_eq!(terceiro, id + 2);
}

// ---------------------------------------------------------------------------
// O relógio pulando
// ---------------------------------------------------------------------------

#[test]
fn relogio_pulando_40_min_fecha_a_fase() {
    // 60 min: foco 1 (27,5 min) e intervalo (5 min) vencem; o foco 2 continua.
    let mut b = Banco::sessao(60);
    let agora = b.andar_ms(40 * MIN);
    assert_eq!(b.avancar(), 2);

    assert_eq!(
        b.fx.periods(),
        [
            periodo(FOCO_60, INICIO.0, INICIO, em(1650 * S), 1650, true),
            periodo(
                INTERVALO_60,
                INICIO.0,
                em(1650 * S),
                em(1950 * S),
                300,
                true
            ),
        ]
    );
    assert_eq!(b.foco.status(), Status::Focus { n: 2 });
    // O prazo do foco 2 é o do plano, contado do fim do intervalo, e não
    // do momento em que o app percebeu.
    assert_eq!(b.foco.deadline(), Some(em(3600 * S)));
    assert_eq!(b.restante_ms(), 20 * MIN);
    let sessao = b.foco.snapshot(agora).session.expect("sessão");
    assert_eq!(sessao.phase_started_at, em(1950 * S));
    assert_eq!(sessao.focus_s, 1650);

    // O intervalo venceu há 7,5 min: um aviso "atrasado", sem som.
    assert_eq!(
        b.fx.notices(),
        [Notice::Late {
            ended: INTERVALO_60,
            ended_at: em(1950 * S),
            session_completed: false,
        }]
    );
    assert!(b.fx.sounds().is_empty());
    assert_eq!(
        b.fx.phase_changes(),
        [PhaseChange {
            cause: ChangeCause::Ended { late: true },
            status: Status::Focus { n: 2 },
            ended: Some(INTERVALO_60),
        }]
    );

    // 25 min (um bloco só): o foco vence e a sessão conclui.
    let mut b = Banco::sessao(25);
    b.andar_ms(40 * MIN);
    assert_eq!(b.avancar(), 1);
    let foco_25 = Phase {
        kind: PhaseKind::Focus,
        n: 1,
        duration_s: 1500,
    };
    assert_eq!(
        b.fx.periods(),
        [periodo(foco_25, INICIO.0, INICIO, em(25 * MIN), 1500, true)]
    );
    assert_eq!(b.foco.status(), Status::Completed);
    assert_eq!(
        b.fx.notices(),
        [Notice::Late {
            ended: foco_25,
            ended_at: em(25 * MIN),
            session_completed: true,
        }]
    );
    assert!(b.fx.sounds().is_empty());
}

#[test]
fn relogio_pulando_2_h_numa_sessao_de_60_min_termina_concluida() {
    let mut b = Banco::sessao(60);
    b.andar_ms(120 * MIN);
    assert_eq!(b.avancar(), 3);

    assert_eq!(b.foco.status(), Status::Completed);
    assert_eq!(b.foco.deadline(), None);

    // 2 focos e 1 intervalo gravados, completos, cada um com o próprio prazo.
    let periodos = b.fx.periods();
    assert_eq!(
        periodos,
        [
            periodo(FOCO_60, INICIO.0, INICIO, em(1650 * S), 1650, true),
            periodo(
                INTERVALO_60,
                INICIO.0,
                em(1650 * S),
                em(1950 * S),
                300,
                true
            ),
            periodo(FOCO_2_60, INICIO.0, em(1950 * S), em(3600 * S), 1650, true),
        ]
    );
    let focos = periodos
        .iter()
        .filter(|p| p.kind == PhaseKind::Focus)
        .count();
    let intervalos = periodos
        .iter()
        .filter(|p| p.kind == PhaseKind::Break)
        .count();
    assert_eq!((focos, intervalos), (2, 1));

    // Um único aviso "atrasado", com a hora do fim da sessão, e nenhum som.
    assert_eq!(
        b.fx.notices(),
        [Notice::Late {
            ended: FOCO_2_60,
            ended_at: em(3600 * S),
            session_completed: true,
        }]
    );
    assert!(b.fx.sounds().is_empty());
    assert_eq!(
        b.fx.kinds(),
        ["período", "período", "período", "estado", "fase", "aviso"]
    );
    assert_eq!(
        b.fx.phase_changes(),
        [PhaseChange {
            cause: ChangeCause::Ended { late: true },
            status: Status::Completed,
            ended: Some(FOCO_2_60),
        }]
    );
    let sessao = b.fx.states()[0].session.clone().expect("sessão");
    assert_eq!(sessao.completed_at, Some(em(3600 * S)));
    assert_eq!(sessao.focus_s, 3300);

    // Rodar de novo não repete nada.
    b.fx.clear();
    b.andar_ms(MIN);
    assert_eq!(b.avancar(), 0);
    assert!(b.fx.is_empty());
}

#[test]
fn suspensao_no_meio_do_foco_ja_desconta_o_tempo_suspenso() {
    // O caso do M16: 1 min de suspensão no meio de um foco de 5 min.
    let mut b = Banco::sessao(5);
    b.andar_ms(2 * MIN);
    assert_eq!(b.restante_ms(), 3 * MIN);
    b.andar_ms(MIN); // suspenso: nenhum tick
    assert_eq!(b.avancar(), 0);
    assert_eq!(b.restante_ms(), 2 * MIN);
}

// ---------------------------------------------------------------------------
// Fim de fase no horário e a regra do atraso
// ---------------------------------------------------------------------------

#[test]
fn sessao_de_60_min_no_laco_de_250_ms_toca_e_avisa_cada_fim() {
    let mut b = Banco::sessao(60);
    let mut ticks = 0;
    while b.foco.status() != Status::Completed {
        b.andar_ms(250);
        b.avancar();
        ticks += 1;
        assert!(ticks <= 3600 * 4, "a sessão não terminou");
    }
    assert_eq!(ticks, 3600 * 4);

    assert_eq!(
        b.fx.sounds(),
        [Sound::FocusEnd, Sound::BreakEnd, Sound::FocusEnd]
    );
    assert_eq!(
        b.fx.notices(),
        [
            Notice::FocusEnded {
                n: 1,
                blocks: 2,
                break_s: 300,
                next_focus_at: em(1950 * S),
            },
            Notice::BreakEnded {
                next_n: 2,
                blocks: 2,
                next_focus_s: 1650,
            },
            Notice::SessionCompleted {
                total_minutes: 60,
                focus_s: 3300,
            },
        ]
    );
    assert_eq!(
        b.fx.periods(),
        [
            periodo(FOCO_60, INICIO.0, INICIO, em(1650 * S), 1650, true),
            periodo(
                INTERVALO_60,
                INICIO.0,
                em(1650 * S),
                em(1950 * S),
                300,
                true
            ),
            periodo(FOCO_2_60, INICIO.0, em(1950 * S), em(3600 * S), 1650, true),
        ]
    );
    let trocas: Vec<(ChangeCause, Status)> =
        b.fx.phase_changes()
            .iter()
            .map(|c| (c.cause, c.status))
            .collect();
    let no_horario = ChangeCause::Ended { late: false };
    assert_eq!(
        trocas,
        [
            (no_horario, Status::Break { n: 1 }),
            (no_horario, Status::Focus { n: 2 }),
            (no_horario, Status::Completed),
        ]
    );
    // Um retrato por fim de fase; nenhum nos ticks sem mudança.
    assert_eq!(b.fx.states().len(), 3);
    // Ordem de um fim no horário.
    assert_eq!(
        b.fx.kinds()[..5],
        ["período", "estado", "fase", "som", "aviso"]
    );
}

#[test]
fn ate_60_s_de_atraso_o_fim_e_normal_e_depois_disso_e_atrasado() {
    let mut b = Banco::sessao(30);
    b.ir(em(30 * MIN + 60 * S));
    assert_eq!(b.avancar(), 1);
    assert_eq!(b.fx.sounds(), [Sound::FocusEnd]);
    assert_eq!(
        b.fx.notices(),
        [Notice::SessionCompleted {
            total_minutes: 30,
            focus_s: 1800,
        }]
    );

    let mut b = Banco::sessao(30);
    b.ir(em(30 * MIN + 60 * S + 1));
    assert_eq!(b.avancar(), 1);
    assert!(b.fx.sounds().is_empty());
    assert!(matches!(b.fx.notices()[..], [Notice::Late { .. }]));
    assert_eq!(
        b.fx.phase_changes()[0].cause,
        ChangeCause::Ended { late: true }
    );
}

#[test]
fn varias_fases_vencidas_com_a_ultima_no_horario_dao_um_aviso_normal() {
    // O foco 1 venceu há 5,5 min; o intervalo, há 30 s.
    let mut b = Banco::sessao(60);
    b.ir(em(1950 * S + 30 * S));
    assert_eq!(b.avancar(), 2);
    assert_eq!(b.fx.periods().len(), 2);
    assert_eq!(b.fx.sounds(), [Sound::BreakEnd]);
    assert_eq!(
        b.fx.notices(),
        [Notice::BreakEnded {
            next_n: 2,
            blocks: 2,
            next_focus_s: 1650,
        }]
    );
    assert_eq!(b.foco.status(), Status::Focus { n: 2 });
}

#[test]
fn comando_depois_de_um_prazo_vencido_fecha_a_fase_antes() {
    // O laço ainda não passou pelo fim do foco 1 quando chega o "pausar".
    let mut b = Banco::sessao(60);
    b.ir(em(1650 * S + 10 * S));
    b.pausar().expect("pausa");
    assert_eq!(b.fx.periods().len(), 1);
    assert_eq!(b.fx.sounds(), [Sound::FocusEnd]);
    assert!(matches!(
        b.fx.notices()[..],
        [Notice::FocusEnded { n: 1, .. }]
    ));
    assert_eq!(
        b.foco.status(),
        Status::Paused {
            kind: PhaseKind::Break,
            n: 1
        }
    );
    assert_eq!(b.restante_ms(), 290 * S);

    // Com a sessão já vencida inteira, o "pausar" conclui e é recusado.
    let mut b = Banco::sessao(5);
    b.ir(em(6 * MIN));
    assert_eq!(b.pausar(), Err(FocusError::NotRunning));
    assert_eq!(b.foco.status(), Status::Completed);
    assert_eq!(b.fx.periods().len(), 1);
}

#[test]
fn pular_intervalos_da_um_foco_so_de_t() {
    let mut b = Banco::sessao_com(SessionConfig {
        skip_breaks: true,
        ..SessionConfig::new(60)
    });
    let sessao = b.foco.snapshot(INICIO).session.expect("sessão");
    assert_eq!((sessao.blocks, sessao.intervals), (1, 0));
    assert_eq!(sessao.next, None);
    assert_eq!(b.foco.deadline(), Some(em(60 * MIN)));
    b.ir(em(60 * MIN));
    assert_eq!(b.avancar(), 1);
    assert_eq!(
        b.fx.notices(),
        [Notice::SessionCompleted {
            total_minutes: 60,
            focus_s: 3600,
        }]
    );
}

#[test]
fn relogio_para_tras_nao_vence_nada_e_o_restante_nao_passa_da_fase() {
    let mut b = Banco::sessao(30);
    b.andar_ms(10 * MIN);
    // Mudado à mão: 1 h para trás.
    b.ir(EpochMs(INICIO.0 - 50 * MIN as i64));
    assert_eq!(b.avancar(), 0);
    assert!(b.fx.is_empty());
    assert_eq!(b.restante_ms(), 30 * MIN);
    assert_eq!(b.foco.status(), Status::Focus { n: 1 });

    // Pausar guarda no máximo a fase inteira; parar grava 0 s corridos.
    b.pausar().expect("pausa");
    assert_eq!(b.restante_ms(), 30 * MIN);
    b.retomar().expect("retomada");
    assert_eq!(b.foco.deadline(), Some(b.agora().plus_ms(30 * MIN)));
    b.fx.clear();
    b.parar().expect("parar");
    assert_eq!(b.fx.periods()[0].actual_s, 0);
}

/// Para vários T e saltos, um `advance_to` só fecha exatamente as fases cujo
/// prazo já passou, em ordem, encadeadas, e deixa a fase certa correndo.
#[test]
fn salto_qualquer_fecha_exatamente_as_fases_vencidas() {
    for t in (5..=240).step_by(5).chain([1, 2, 7, 59, 61, 89, 91, 185]) {
        for pular in [false, true] {
            let config = SessionConfig {
                skip_breaks: pular,
                ..SessionConfig::new(t)
            };
            let plano = Plan::new(t, PlanSettings::DEFAULT, pular).expect("plano");
            let fases: Vec<Phase> = plano.phases().collect();
            // Fim de cada fase, em ms desde o início.
            let fins: Vec<u64> = fases
                .iter()
                .scan(0, |acc, f| {
                    *acc += f.duration_s * S;
                    Some(*acc)
                })
                .collect();
            let total = u64::from(t) * MIN;
            assert_eq!(*fins.last().expect("fases"), total);

            let mut saltos: Vec<u64> = (0..total + 10 * MIN).step_by(433_217).collect();
            saltos.extend(fins.iter().flat_map(|&f| [f - 1, f, f + 1]));
            for salto in saltos {
                let contexto = format!("T = {t}, pular = {pular}, salto = {salto} ms");
                let mut b = Banco::sessao_com(config);
                b.ir(em(salto));
                let vencidas = fins.iter().filter(|&&f| f <= salto).count();
                assert_eq!(b.avancar() as usize, vencidas, "{contexto}");

                let periodos = b.fx.periods();
                assert_eq!(periodos.len(), vencidas, "{contexto}");
                let mut inicio = INICIO;
                for (i, p) in periodos.iter().enumerate() {
                    assert_eq!(
                        *p,
                        periodo(
                            fases[i],
                            INICIO.0,
                            inicio,
                            em(fins[i]),
                            fases[i].duration_s,
                            true
                        ),
                        "{contexto}"
                    );
                    inicio = p.ended_at;
                }

                let retrato = b.foco.snapshot(em(salto));
                let sessao = retrato.session.expect("sessão");
                if vencidas == fases.len() {
                    assert_eq!(retrato.status, Status::Completed, "{contexto}");
                    assert_eq!(sessao.remaining_ms, 0, "{contexto}");
                } else {
                    let atual = fases[vencidas];
                    let esperado = match atual.kind {
                        PhaseKind::Focus => Status::Focus { n: atual.n },
                        PhaseKind::Break => Status::Break { n: atual.n },
                    };
                    assert_eq!(retrato.status, esperado, "{contexto}");
                    assert_eq!(sessao.phase, atual, "{contexto}");
                    assert_eq!(sessao.ends_at, Some(em(fins[vencidas])), "{contexto}");
                    assert_eq!(sessao.remaining_ms, fins[vencidas] - salto, "{contexto}");
                }
                let foco_s: u64 = periodos
                    .iter()
                    .filter(|p| p.kind == PhaseKind::Focus)
                    .map(|p| p.actual_s)
                    .sum();
                assert_eq!(sessao.focus_s, foco_s, "{contexto}");

                // Um aviso só quando algo venceu; som só no horário.
                let avisos = b.fx.notices().len();
                assert_eq!(avisos, usize::from(vencidas > 0), "{contexto}");
                if let Some(&ultimo) = fins[..vencidas].last() {
                    let atrasou = salto - ultimo > 60 * S;
                    assert_eq!(b.fx.sounds().len(), usize::from(!atrasou), "{contexto}");
                    assert_eq!(
                        matches!(b.fx.notices()[0], Notice::Late { .. }),
                        atrasou,
                        "{contexto}"
                    );
                }
            }
        }
    }
}

#[test]
fn erros_tem_texto_para_o_registro() {
    for (erro, trecho) in [
        (FocusError::AlreadyActive, "em andamento"),
        (FocusError::NotRunning, "pausar"),
        (FocusError::NotPaused, "não está pausada"),
        (FocusError::NoSession, "não há sessão"),
        (FocusError::Plan(PlanError::ZeroBreak), "intervalo"),
    ] {
        let texto = erro.to_string();
        assert!(texto.contains(trecho), "{texto}");
    }
    let erro: FocusError = PlanError::ZeroTotal.into();
    assert!(std::error::Error::source(&erro).is_some());
}

// ---------------------------------------------------------------------------
// Modo acelerado (só em build de debug)
// ---------------------------------------------------------------------------

#[cfg(debug_assertions)]
mod acelerado {
    use super::*;
    use tomatito_core::ScaledClock;
    #[cfg(target_family = "wasm")]
    use wasm_bindgen_test::wasm_bindgen_test as test;

    /// Roda uma sessão com o relógio acelerado, andando o relógio de base de
    /// 250 em 250 ms (o laço do app), e devolve os efeitos.
    fn rodar(minutes: u32, speed: f64, foco: Focus) -> (FakeEffects, u32) {
        let base = FakeClock::new(INICIO);
        let relogio = ScaledClock::new(base.clone(), speed).expect("velocidade");
        let mut foco = foco;
        let mut fx = FakeEffects::new();
        foco.start(relogio.now(), SessionConfig::new(minutes), &mut fx)
            .expect("início");
        let mut ticks = 0;
        while foco.status() != Status::Completed {
            base.advance_ms(250);
            foco.advance_to(relogio.now(), &mut fx);
            ticks += 1;
        }
        (fx, ticks)
    }

    #[test]
    fn sessenta_vezes_faz_a_sessao_de_60_min_durar_60_s_sem_atraso() {
        let (fx, ticks) = rodar(60, 60.0, Focus::new());
        // 60 s de relógio de base, em ticks de 250 ms.
        assert_eq!(ticks, 240);
        assert_eq!(
            fx.sounds(),
            [Sound::FocusEnd, Sound::BreakEnd, Sound::FocusEnd]
        );
        assert!(
            !fx.notices()
                .iter()
                .any(|n| matches!(n, Notice::Late { .. }))
        );
        assert_eq!(fx.periods().len(), 3);
    }

    #[test]
    fn muito_acelerado_precisa_do_limite_de_atraso_acelerado() {
        // A 480×, cada tick de 250 ms são 120 s acelerados: fins "atrasados".
        let (fx, _) = rodar(60, 480.0, Focus::new());
        assert!(
            fx.notices()
                .iter()
                .any(|n| matches!(n, Notice::Late { .. }))
        );
        assert!(fx.sounds().len() < 3);

        // Com o limite multiplicado pela velocidade (o que o M16 pode fazer),
        // volta ao normal.
        let (fx, _) = rodar(60, 480.0, Focus::new().with_late_after_ms(60_000 * 480));
        assert!(
            !fx.notices()
                .iter()
                .any(|n| matches!(n, Notice::Late { .. }))
        );
        assert_eq!(fx.sounds().len(), 3);
    }
}
