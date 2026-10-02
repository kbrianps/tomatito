//! Regra dos intervalos (PLANO.md, 3.2): como uma sessão de T minutos se
//! divide em blocos de foco e intervalos.
//!
//! Com T = total, F = período de foco e B = intervalo, em minutos (F, B ≥ 1):
//! - `intervalos = floor((T − 1) / (F + B))`;
//! - `blocos = intervalos + 1`;
//! - `bloco_s = floor((T·60 − intervalos·B·60) / blocos)`, e o **último bloco
//!   fica com o resto**, para a soma dos blocos e dos intervalos dar T·60.
//!
//! "Pular intervalos" faz um bloco único de T.
//!
//! Tudo em segundos inteiros. O relógio de parede e os prazos em ms ficam com
//! a máquina de estados (`focus.rs`, M15), que percorre as fases de
//! [`Plan::phases`] em ordem.

use std::fmt;

/// F e B, as chaves `focusMinutes` e `breakMinutes` do `settings.json`
/// (PLANO.md, 3.3).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PlanSettings {
    /// F: duração de referência de um período de foco, em minutos.
    pub focus_minutes: u32,
    /// B: duração de cada intervalo, em minutos. Precisa ser pelo menos 1.
    pub break_minutes: u32,
}

impl PlanSettings {
    /// Padrões da seção 3.3: 25 e 5.
    pub const DEFAULT: Self = Self {
        focus_minutes: 25,
        break_minutes: 5,
    };
}

impl Default for PlanSettings {
    fn default() -> Self {
        Self::DEFAULT
    }
}

/// Por que um plano não pôde ser montado. Os textos são para registro e
/// depuração; a interface não os mostra (os catálogos ficam no app).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PlanError {
    /// T = 0: não há sessão de 0 minutos.
    ZeroTotal,
    /// F = 0: a regra dividiria a sessão em intervalos sem foco entre eles.
    ZeroFocus,
    /// B = 0: um intervalo de 0 minutos não é intervalo (a regra pede B ≥ 1).
    ZeroBreak,
}

impl fmt::Display for PlanError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::ZeroTotal => "a sessão precisa ter pelo menos 1 minuto",
            Self::ZeroFocus => "o período de foco precisa ter pelo menos 1 minuto",
            Self::ZeroBreak => "o intervalo precisa ter pelo menos 1 minuto",
        })
    }
}

impl std::error::Error for PlanError {}

/// Tipo de fase: período de foco ou intervalo.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PhaseKind {
    Focus,
    Break,
}

/// Uma fase do plano: `Foco{n}` ou `Intervalo{n}` na linguagem do plano.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Phase {
    pub kind: PhaseKind,
    /// Número da fase entre as do mesmo tipo, a partir de 1: o "1" de
    /// "Período de foco (1 de 2)". O intervalo `n` vem depois do foco `n`.
    pub n: u32,
    /// Duração planejada, em segundos (o `planned_s` da tabela `periods`).
    pub duration_s: u64,
}

/// O plano de uma sessão de foco: quantos blocos, quantos intervalos e a
/// duração de cada um. Imutável depois de montado.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Plan {
    total_minutes: u32,
    break_s: u64,
    intervals: u32,
    block_s: u64,
    last_block_s: u64,
}

impl Plan {
    /// Monta o plano de uma sessão de `total_minutes` (T) com F e B de
    /// `settings`. Com `skip_breaks` ("Pular intervalos"), a sessão vira um
    /// bloco único de T.
    ///
    /// B = 0 é recusado mesmo com `skip_breaks`: B vem das configurações, e a
    /// regra vale para elas, não para uma sessão em particular.
    pub fn new(
        total_minutes: u32,
        settings: PlanSettings,
        skip_breaks: bool,
    ) -> Result<Self, PlanError> {
        if total_minutes == 0 {
            return Err(PlanError::ZeroTotal);
        }
        if settings.focus_minutes == 0 {
            return Err(PlanError::ZeroFocus);
        }
        if settings.break_minutes == 0 {
            return Err(PlanError::ZeroBreak);
        }

        // Em u64: T·60 e F + B não cabem em u32 para qualquer entrada.
        let t = u64::from(total_minutes);
        let f = u64::from(settings.focus_minutes);
        let b = u64::from(settings.break_minutes);

        let intervals = if skip_breaks { 0 } else { (t - 1) / (f + b) };
        let blocks = intervals + 1;
        // Com intervalos·(F + B) ≤ T − 1, sobra pelo menos 1 minuto de foco
        // por bloco: a subtração não estoura e cada bloco tem ao menos 60 s.
        let focus_s = t * 60 - intervals * b * 60;
        let block_s = focus_s / blocks;
        let last_block_s = focus_s - (blocks - 1) * block_s;

        Ok(Self {
            total_minutes,
            break_s: b * 60,
            // intervalos ≤ (T − 1) / 2, que cabe em u32.
            intervals: u32::try_from(intervals).expect("intervalos cabem em u32"),
            block_s,
            last_block_s,
        })
    }

    /// T, em minutos.
    pub fn total_minutes(&self) -> u32 {
        self.total_minutes
    }

    /// T·60: a soma de todas as fases.
    pub fn total_s(&self) -> u64 {
        u64::from(self.total_minutes) * 60
    }

    /// Quantos intervalos a sessão tem (0 com "Pular intervalos").
    pub fn intervals(&self) -> u32 {
        self.intervals
    }

    /// Quantos blocos de foco a sessão tem: sempre `intervals() + 1`.
    pub fn blocks(&self) -> u32 {
        self.intervals + 1
    }

    /// Duração de cada bloco de foco, menos o último, em segundos.
    pub fn block_s(&self) -> u64 {
        self.block_s
    }

    /// Duração do último bloco de foco, com o resto da divisão, em segundos.
    /// Com um bloco só, é a sessão inteira.
    pub fn last_block_s(&self) -> u64 {
        self.last_block_s
    }

    /// Duração de cada intervalo (B·60), em segundos. Sem intervalos no
    /// plano, não é usada.
    pub fn break_s(&self) -> u64 {
        self.break_s
    }

    /// Quantas fases a sessão tem: blocos e intervalos, alternados.
    pub fn phase_count(&self) -> u32 {
        self.blocks() + self.intervals
    }

    /// A fase de índice `index`, a partir de 0, na ordem em que acontecem:
    /// foco 1, intervalo 1, foco 2, … , foco final. `None` depois da última.
    pub fn phase(&self, index: u32) -> Option<Phase> {
        if index >= self.phase_count() {
            return None;
        }
        let n = index / 2 + 1;
        Some(if index.is_multiple_of(2) {
            Phase {
                kind: PhaseKind::Focus,
                n,
                duration_s: if n == self.blocks() {
                    self.last_block_s
                } else {
                    self.block_s
                },
            }
        } else {
            Phase {
                kind: PhaseKind::Break,
                n,
                duration_s: self.break_s,
            }
        })
    }

    /// Todas as fases, em ordem. O iterador leva uma cópia do plano.
    pub fn phases(&self) -> impl Iterator<Item = Phase> + use<> {
        let plan = *self;
        (0..plan.phase_count()).map_while(move |index| plan.phase(index))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(target_family = "wasm")]
    use wasm_bindgen_test::wasm_bindgen_test as test;

    fn plano(total_minutes: u32) -> Plan {
        Plan::new(total_minutes, PlanSettings::DEFAULT, false).expect("plano válido")
    }

    fn soma_s(plan: &Plan) -> u64 {
        plan.phases().map(|fase| fase.duration_s).sum()
    }

    #[test]
    fn exemplos_da_regra() {
        assert_eq!(plano(30).intervals(), 0);
        assert_eq!(plano(30).blocks(), 1);
        assert_eq!(plano(45).intervals(), 1);
        assert_eq!(plano(90).intervals(), 2);

        // 60 min: 1 intervalo e 2 blocos de 1650 s, "27 min (1 de 2)".
        let p = plano(60);
        assert_eq!(p.intervals(), 1);
        assert_eq!(p.blocks(), 2);
        assert_eq!(p.block_s(), 1650);
        assert_eq!(p.last_block_s(), 1650);
        assert_eq!(p.block_s() / 60, 27);
    }

    #[test]
    fn cento_e_oitenta_e_cinco_min_poem_o_resto_no_ultimo_bloco() {
        let p = plano(185);
        assert_eq!(p.intervals(), 6);
        assert_eq!(p.blocks(), 7);
        let focos: Vec<u64> = p
            .phases()
            .filter(|fase| fase.kind == PhaseKind::Focus)
            .map(|fase| fase.duration_s)
            .collect();
        assert_eq!(focos, [1328, 1328, 1328, 1328, 1328, 1328, 1332]);
        assert_eq!(p.last_block_s(), 1332);
    }

    #[test]
    fn soma_das_fases_da_t_vezes_60_de_5_a_240() {
        for t in 5..=240 {
            let p = plano(t);
            assert_eq!(soma_s(&p), u64::from(t) * 60, "T = {t}");
            assert_eq!(p.total_s(), u64::from(t) * 60, "T = {t}");
        }
    }

    /// A mesma soma, e o formato das fases, para outros F e B e com
    /// "Pular intervalos", de 1 minuto em diante (o seletor vai de 1 em 1 no
    /// debug).
    #[test]
    fn plano_fecha_para_outros_f_e_b() {
        for f in [1, 5, 10, 15, 20, 25, 30, 45, 50, 60, 90] {
            for b in [1, 2, 3, 5, 10, 15, 20, 30] {
                let ajustes = PlanSettings {
                    focus_minutes: f,
                    break_minutes: b,
                };
                for t in 1..=240 {
                    for pular in [false, true] {
                        let contexto = format!("T = {t}, F = {f}, B = {b}, pular = {pular}");
                        let p = Plan::new(t, ajustes, pular).expect(&contexto);
                        let fases: Vec<Phase> = p.phases().collect();

                        assert_eq!(soma_s(&p), u64::from(t) * 60, "{contexto}");
                        let esperado = if pular { 0 } else { (t - 1) / (f + b) };
                        assert_eq!(p.intervals(), esperado, "{contexto}");
                        assert_eq!(fases.len() as u32, p.phase_count(), "{contexto}");
                        assert_eq!(p.phase_count(), 2 * p.intervals() + 1, "{contexto}");

                        // Alterna foco e intervalo, começa e termina em foco, e
                        // numera cada tipo a partir de 1.
                        for (i, fase) in fases.iter().enumerate() {
                            let i = i as u32;
                            let tipo = if i.is_multiple_of(2) {
                                PhaseKind::Focus
                            } else {
                                PhaseKind::Break
                            };
                            assert_eq!(fase.kind, tipo, "{contexto}, fase {i}");
                            assert_eq!(fase.n, i / 2 + 1, "{contexto}, fase {i}");
                            if fase.kind == PhaseKind::Break {
                                assert_eq!(fase.duration_s, u64::from(b) * 60, "{contexto}");
                            } else {
                                assert!(fase.duration_s >= 60, "{contexto}, fase {i}");
                            }
                        }

                        // O resto é menor que o número de blocos, então o
                        // último bloco passa dos outros em menos de 1 s por bloco.
                        assert!(p.last_block_s() >= p.block_s(), "{contexto}");
                        assert!(
                            p.last_block_s() - p.block_s() < u64::from(p.blocks()),
                            "{contexto}"
                        );
                        assert_eq!(p.phase(p.phase_count()), None, "{contexto}");
                    }
                }
            }
        }
    }

    #[test]
    fn pular_intervalos_da_um_bloco_so() {
        for t in [5, 30, 60, 185, 240] {
            let p = Plan::new(t, PlanSettings::DEFAULT, true).expect("plano válido");
            assert_eq!(p.intervals(), 0, "T = {t}");
            assert_eq!(p.blocks(), 1, "T = {t}");
            let fases: Vec<Phase> = p.phases().collect();
            assert_eq!(
                fases,
                [Phase {
                    kind: PhaseKind::Focus,
                    n: 1,
                    duration_s: u64::from(t) * 60,
                }],
                "T = {t}"
            );
        }
    }

    #[test]
    fn b_igual_a_zero_e_recusado() {
        let sem_intervalo = PlanSettings {
            focus_minutes: 25,
            break_minutes: 0,
        };
        for t in [1, 30, 60, 240] {
            for pular in [false, true] {
                assert_eq!(
                    Plan::new(t, sem_intervalo, pular),
                    Err(PlanError::ZeroBreak),
                    "T = {t}, pular = {pular}"
                );
            }
        }
    }

    #[test]
    fn t_e_f_iguais_a_zero_sao_recusados() {
        assert_eq!(
            Plan::new(0, PlanSettings::DEFAULT, false),
            Err(PlanError::ZeroTotal)
        );
        assert_eq!(
            Plan::new(0, PlanSettings::DEFAULT, true),
            Err(PlanError::ZeroTotal)
        );
        let sem_foco = PlanSettings {
            focus_minutes: 0,
            break_minutes: 5,
        };
        assert_eq!(Plan::new(60, sem_foco, false), Err(PlanError::ZeroFocus));
    }

    #[test]
    fn sequencia_de_fases_de_60_min() {
        let fases: Vec<Phase> = plano(60).phases().collect();
        assert_eq!(
            fases,
            [
                Phase {
                    kind: PhaseKind::Focus,
                    n: 1,
                    duration_s: 1650,
                },
                Phase {
                    kind: PhaseKind::Break,
                    n: 1,
                    duration_s: 300,
                },
                Phase {
                    kind: PhaseKind::Focus,
                    n: 2,
                    duration_s: 1650,
                },
            ]
        );
    }

    #[test]
    fn valores_extremos_nao_estouram() {
        let p = Plan::new(u32::MAX, PlanSettings::DEFAULT, false).expect("plano válido");
        assert_eq!(p.total_s(), u64::from(u32::MAX) * 60);
        assert_eq!(p.intervals(), (u32::MAX - 1) / 30);

        let enormes = PlanSettings {
            focus_minutes: u32::MAX,
            break_minutes: u32::MAX,
        };
        let p = Plan::new(u32::MAX, enormes, false).expect("plano válido");
        assert_eq!(p.intervals(), 0);
        assert_eq!(p.last_block_s(), u64::from(u32::MAX) * 60);
    }

    #[test]
    fn padrao_e_25_e_5() {
        assert_eq!(
            PlanSettings::default(),
            PlanSettings {
                focus_minutes: 25,
                break_minutes: 5,
            }
        );
    }
}
