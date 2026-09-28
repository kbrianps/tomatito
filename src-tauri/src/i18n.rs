//! Catálogo de textos do Rust (PLANO.md, 3.8): notificações (M21) e, depois,
//! os menus da bandeja (M36). A interface tem o dela, em
//! `src/lib/i18n/pt-BR.js`. Nenhum texto solto no código.
//!
//! O núcleo manda os dados do aviso ([`Notice`]); aqui eles viram título e
//! corpo em pt-BR. Horas em 24 h, no fuso do sistema (quem chama passa o
//! fuso, e os testes passam um fixo). Durações em minutos inteiros, cortando
//! os segundos e nunca abaixo de 1, como o rodapé "A seguir" do mostrador
//! (`src/views/focus/andamento.js`): um bloco de 1650 s é "27 min".

use tomatito_core::{EpochMs, Notice, PhaseKind, TimeZone};

/// Uma notificação pronta para mostrar.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NoticeText {
    pub title: String,
    /// Sem corpo, a notificação mostra só o título.
    pub body: Option<String>,
}

/// Minutos de uma duração, como o mostrador os escreve.
fn minutes(duration_s: u64) -> u64 {
    (duration_s / 60).max(1)
}

/// "14:35" (24 h), ou `None` se o instante não cabe no calendário.
fn hh_mm(at: EpochMs, tz: &TimeZone) -> Option<String> {
    at.hour_minute_in(tz).map(|(h, m)| format!("{h:02}:{m:02}"))
}

/// Os textos de um aviso de fim de fase (M21):
///
/// | Aviso | Título | Corpo |
/// |---|---|---|
/// | fim do foco | Período de foco concluído | Intervalo de 5 min. Próximo foco às 14:35. |
/// | fim do intervalo | Intervalo concluído | Período de foco 2 de 2, 27 min. |
/// | fim da sessão | Sessão de foco concluída | 60 min de foco. |
/// | fim atrasado, sessão concluída | Sessão concluída às 14:32 | (nenhum) |
/// | fim atrasado, no meio da sessão | Período de foco concluído às 14:32 (ou Intervalo concluído às 14:32) | (nenhum) |
pub fn notice(notice: &Notice, tz: &TimeZone) -> NoticeText {
    match *notice {
        Notice::FocusEnded {
            break_s,
            next_focus_at,
            ..
        } => {
            let intervalo = format!("Intervalo de {} min.", minutes(break_s));
            let body = match hh_mm(next_focus_at, tz) {
                Some(h) => format!("{intervalo} Próximo foco às {h}."),
                None => intervalo,
            };
            NoticeText {
                title: "Período de foco concluído".into(),
                body: Some(body),
            }
        }
        Notice::BreakEnded {
            next_n,
            blocks,
            next_focus_s,
        } => NoticeText {
            title: "Intervalo concluído".into(),
            body: Some(format!(
                "Período de foco {next_n} de {blocks}, {} min.",
                minutes(next_focus_s)
            )),
        },
        Notice::SessionCompleted { total_minutes, .. } => NoticeText {
            title: "Sessão de foco concluída".into(),
            body: Some(format!("{total_minutes} min de foco.")),
        },
        Notice::Late {
            ended,
            ended_at,
            session_completed,
        } => {
            let base = if session_completed {
                "Sessão concluída"
            } else {
                match ended.kind {
                    PhaseKind::Focus => "Período de foco concluído",
                    PhaseKind::Break => "Intervalo concluído",
                }
            };
            let title = match hh_mm(ended_at, tz) {
                Some(h) => format!("{base} às {h}"),
                None => base.to_owned(),
            };
            NoticeText { title, body: None }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tomatito_core::{Effects, FakeClock, FakeEffects, Focus, Phase, SessionConfig};

    /// São Paulo, sem horário de verão desde 2019: UTC−3 o ano todo.
    fn sp() -> TimeZone {
        TimeZone::get("America/Sao_Paulo").expect("a base de fusos do sistema")
    }

    /// 14:30:00 em São Paulo (17:30 UTC) de 21/09/2026.
    const T0: EpochMs = EpochMs(1_790_011_800_000);

    fn texto(n: Notice) -> (String, Option<String>) {
        let t = notice(&n, &sp());
        (t.title, t.body)
    }

    #[test]
    fn os_textos_do_plano() {
        assert_eq!(T0.hour_minute_in(&sp()), Some((14, 30)));
        assert_eq!(
            texto(Notice::FocusEnded {
                n: 1,
                blocks: 2,
                break_s: 300,
                next_focus_at: T0.plus_ms(5 * 60_000 + 40_000),
            }),
            (
                "Período de foco concluído".into(),
                Some("Intervalo de 5 min. Próximo foco às 14:35.".into())
            )
        );
        assert_eq!(
            texto(Notice::BreakEnded {
                next_n: 2,
                blocks: 2,
                next_focus_s: 1650,
            }),
            (
                "Intervalo concluído".into(),
                Some("Período de foco 2 de 2, 27 min.".into())
            )
        );
        assert_eq!(
            texto(Notice::SessionCompleted {
                total_minutes: 60,
                focus_s: 3300,
            }),
            (
                "Sessão de foco concluída".into(),
                Some("60 min de foco.".into())
            )
        );
        let foco = Phase {
            kind: PhaseKind::Focus,
            n: 2,
            duration_s: 1650,
        };
        assert_eq!(
            texto(Notice::Late {
                ended: foco,
                ended_at: T0.plus_ms(2 * 60_000),
                session_completed: true,
            }),
            ("Sessão concluída às 14:32".into(), None)
        );
    }

    #[test]
    fn atrasado_no_meio_da_sessao() {
        let foco = Phase {
            kind: PhaseKind::Focus,
            n: 1,
            duration_s: 1650,
        };
        let intervalo = Phase {
            kind: PhaseKind::Break,
            n: 1,
            duration_s: 300,
        };
        assert_eq!(
            texto(Notice::Late {
                ended: foco,
                ended_at: T0,
                session_completed: false,
            }),
            ("Período de foco concluído às 14:30".into(), None)
        );
        assert_eq!(
            texto(Notice::Late {
                ended: intervalo,
                ended_at: T0,
                session_completed: false,
            }),
            ("Intervalo concluído às 14:30".into(), None)
        );
    }

    #[test]
    fn horas_em_24h_com_zero_a_esquerda() {
        let t = notice(
            &Notice::FocusEnded {
                n: 1,
                blocks: 2,
                break_s: 300,
                // 09:05 em São Paulo.
                next_focus_at: EpochMs(T0.0 - (5 * 3600 + 25 * 60) * 1000),
            },
            &sp(),
        );
        assert_eq!(
            t.body.as_deref(),
            Some("Intervalo de 5 min. Próximo foco às 09:05.")
        );
        let t = notice(
            &Notice::Late {
                ended: Phase {
                    kind: PhaseKind::Break,
                    n: 1,
                    duration_s: 300,
                },
                // 23:59 em São Paulo.
                ended_at: EpochMs(T0.0 + (9 * 3600 + 29 * 60) * 1000),
                session_completed: true,
            },
            &sp(),
        );
        assert_eq!(t.title, "Sessão concluída às 23:59");
    }

    #[test]
    fn minutos_cortados_e_nunca_zero() {
        assert_eq!(minutes(1650), 27);
        assert_eq!(minutes(1332), 22);
        assert_eq!(minutes(300), 5);
        assert_eq!(minutes(59), 1);
        assert_eq!(minutes(0), 1);
    }

    #[test]
    fn instante_fora_do_calendario_fica_sem_hora() {
        let t = notice(
            &Notice::FocusEnded {
                n: 1,
                blocks: 2,
                break_s: 300,
                next_focus_at: EpochMs(i64::MAX),
            },
            &sp(),
        );
        assert_eq!(t.body.as_deref(), Some("Intervalo de 5 min."));
    }

    /// Uma sessão de 60 min de verdade, pelo núcleo: os três avisos, na
    /// ordem, com os textos do plano.
    #[test]
    fn sessao_de_60_min_pelo_nucleo() {
        let clock = FakeClock::new(T0);
        let mut focus = Focus::new();
        let mut fx = FakeEffects::new();
        focus.start(T0, SessionConfig::new(60), &mut fx).unwrap();
        let fim = T0.plus_ms(60 * 60_000);
        let mut t = T0;
        while t < fim {
            t = clock.advance_ms(1000);
            focus.advance_to(t, &mut fx as &mut dyn Effects);
        }
        let textos: Vec<_> = fx.notices().into_iter().map(texto).collect();
        assert_eq!(
            textos,
            [
                (
                    "Período de foco concluído".into(),
                    // O foco 1 vai até 14:57:30; o intervalo, até 15:02:30.
                    Some("Intervalo de 5 min. Próximo foco às 15:02.".to_string())
                ),
                (
                    "Intervalo concluído".into(),
                    Some("Período de foco 2 de 2, 27 min.".into())
                ),
                (
                    "Sessão de foco concluída".into(),
                    Some("60 min de foco.".into())
                ),
            ]
        );
    }
}
