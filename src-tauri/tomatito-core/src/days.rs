//! Dias e semanas das estatísticas (PLANO.md, 3.3 e 3.8).
//!
//! O "dia" do Tomatito não vira à meia-noite, e sim na **hora de zerar**
//! (`resetHour`, de 0 a 23): com 04:00, uma sessão que termina às 02:00 de
//! terça ainda conta na segunda. A **semana** vai de segunda a domingo, com a
//! mesma virada: começa na segunda à hora de zerar e termina na segunda
//! seguinte, à mesma hora.
//!
//! Tudo em fuso local, pelo `jiff`, com horário de verão: a virada é a hora de
//! zerar no relógio da parede de cada data, então um dia pode ter 23 ou 25 h.
//! Se a hora de zerar cair num buraco do horário de verão (a hora que não
//! existe no dia em que o relógio adianta), vale a primeira hora depois dele
//! (a regra "compatible" do `jiff`, a mesma do JavaScript).
//!
//! Cada período conta no dia do seu `ended_at` (3.3): quem soma pergunta se o
//! fim está dentro de um [`DayRange`], sem olhar o começo. Um foco das 23:50
//! às 00:20 conta inteiro no dia novo.

use jiff::Timestamp;
use jiff::civil::{Date, Time};
use jiff::tz::TimeZone;

use crate::clock::EpochMs;

/// Maior hora de zerar aceita. Acima disso, vale 23 (as configurações já
/// recusam, M23; aqui é só para não quebrar).
pub const MAX_RESET_HOUR: u8 = 23;

/// Um intervalo de tempo `[start, end)`, em ms UTC: um dia ou uma semana.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct DayRange {
    /// A virada que abre o intervalo (incluída).
    pub start: EpochMs,
    /// A virada seguinte (excluída).
    pub end: EpochMs,
}

impl DayRange {
    /// Se `t` está dentro: `start <= t < end`.
    #[must_use]
    pub fn contains(&self, t: EpochMs) -> bool {
        self.start <= t && t < self.end
    }

    /// Duração em ms (23, 24 ou 25 h num dia, com horário de verão).
    #[must_use]
    pub fn len_ms(&self) -> i64 {
        self.end.ms_since(self.start)
    }
}

/// Os três intervalos que o `stats_get` (M26) soma.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct StatsRanges {
    /// O dia anterior a `today`.
    pub yesterday: DayRange,
    /// O dia de agora, pela hora de zerar.
    pub today: DayRange,
    /// A semana de agora, de segunda a domingo, pela hora de zerar.
    pub week: DayRange,
}

fn hora(reset_hour: u8) -> Time {
    // `min` garante a faixa, então o `Time::new` não falha.
    Time::new(
        i8::try_from(reset_hour.min(MAX_RESET_HOUR)).unwrap_or(0),
        0,
        0,
        0,
    )
    .unwrap_or(Time::midnight())
}

fn timestamp(t: EpochMs) -> Option<Timestamp> {
    Timestamp::from_millisecond(t.0).ok()
}

/// A virada de `date`: a hora de zerar dessa data, no fuso `tz`.
fn virada(date: Date, tz: &TimeZone, reset_hour: u8) -> Option<EpochMs> {
    let zoned = date
        .to_datetime(hora(reset_hour))
        .to_zoned(tz.clone())
        .ok()?;
    Some(EpochMs(zoned.timestamp().as_millisecond()))
}

/// A data do "dia do Tomatito" em que `t` cai: a data local, ou a do dia
/// anterior se `t` vem antes da virada daquela data. `None` só fora da faixa
/// do `jiff` (anos -9999 a 9999), num relógio muito errado.
#[must_use]
pub fn logical_date(t: EpochMs, tz: &TimeZone, reset_hour: u8) -> Option<Date> {
    let date = tz.to_datetime(timestamp(t)?).date();
    // Compara com a virada de verdade (e não com a hora local), para o
    // buraco do horário de verão cair do lado certo.
    if t < virada(date, tz, reset_hour)? {
        date.yesterday().ok()
    } else {
        Some(date)
    }
}

/// O dia de `date`: da virada dessa data até a virada da data seguinte.
#[must_use]
pub fn day_range(date: Date, tz: &TimeZone, reset_hour: u8) -> Option<DayRange> {
    Some(DayRange {
        start: virada(date, tz, reset_hour)?,
        end: virada(date.tomorrow().ok()?, tz, reset_hour)?,
    })
}

/// A segunda-feira da semana de `date` (a própria `date`, se for segunda).
#[must_use]
pub fn monday_of(date: Date) -> Option<Date> {
    let dias = i64::from(date.weekday().to_monday_zero_offset());
    date.checked_sub(jiff::Span::new().days(dias)).ok()
}

/// A semana de `date`: da virada da segunda até a virada da segunda seguinte.
#[must_use]
pub fn week_range(date: Date, tz: &TimeZone, reset_hour: u8) -> Option<DayRange> {
    let segunda = monday_of(date)?;
    let seguinte = segunda.checked_add(jiff::Span::new().days(7)).ok()?;
    Some(DayRange {
        start: virada(segunda, tz, reset_hour)?,
        end: virada(seguinte, tz, reset_hour)?,
    })
}

/// Ontem, hoje e esta semana, vistos de `now`.
#[must_use]
pub fn stats_ranges(now: EpochMs, tz: &TimeZone, reset_hour: u8) -> Option<StatsRanges> {
    let hoje = logical_date(now, tz, reset_hour)?;
    Some(StatsRanges {
        yesterday: day_range(hoje.yesterday().ok()?, tz, reset_hour)?,
        today: day_range(hoje, tz, reset_hour)?,
        week: week_range(hoje, tz, reset_hour)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use jiff::civil::date;
    #[cfg(target_family = "wasm")]
    use wasm_bindgen_test::wasm_bindgen_test as test;

    /// Um instante local em `tz`, para os testes lerem como um relógio.
    fn em(tz: &TimeZone, ano: i16, mes: i8, dia: i8, h: i8, m: i8) -> EpochMs {
        let z = date(ano, mes, dia)
            .at(h, m, 0, 0)
            .to_zoned(tz.clone())
            .unwrap();
        EpochMs(z.timestamp().as_millisecond())
    }

    fn sp() -> TimeZone {
        TimeZone::fixed(jiff::tz::offset(-3))
    }

    #[test]
    fn meia_noite_sem_hora_de_zerar() {
        let tz = sp();
        // 2026-09-28 é uma segunda.
        assert_eq!(
            logical_date(em(&tz, 2026, 9, 28, 0, 0), &tz, 0),
            Some(date(2026, 9, 28))
        );
        assert_eq!(
            logical_date(em(&tz, 2026, 9, 27, 23, 59), &tz, 0),
            Some(date(2026, 9, 27))
        );
        let dia = day_range(date(2026, 9, 28), &tz, 0).unwrap();
        assert_eq!(dia.start, em(&tz, 2026, 9, 28, 0, 0));
        assert_eq!(dia.end, em(&tz, 2026, 9, 29, 0, 0));
        assert_eq!(dia.len_ms(), 24 * 3_600_000);
    }

    #[test]
    fn periodo_que_cruza_a_meia_noite_conta_no_dia_em_que_terminou() {
        let tz = sp();
        let comeco = em(&tz, 2026, 9, 27, 23, 50);
        let fim = em(&tz, 2026, 9, 28, 0, 20);
        let r = stats_ranges(em(&tz, 2026, 9, 28, 9, 0), &tz, 0).unwrap();
        assert!(r.today.contains(fim));
        assert!(!r.today.contains(comeco));
        assert!(!r.yesterday.contains(fim), "não conta em ontem");
        assert_eq!(logical_date(fim, &tz, 0), Some(date(2026, 9, 28)));
    }

    #[test]
    fn hora_de_zerar_as_quatro() {
        let tz = sp();
        // 03:59 de terça ainda é segunda; 04:00 já é terça.
        assert_eq!(
            logical_date(em(&tz, 2026, 9, 29, 3, 59), &tz, 4),
            Some(date(2026, 9, 28))
        );
        assert_eq!(
            logical_date(em(&tz, 2026, 9, 29, 4, 0), &tz, 4),
            Some(date(2026, 9, 29))
        );
        let r = stats_ranges(em(&tz, 2026, 9, 29, 2, 0), &tz, 4).unwrap();
        assert_eq!(r.today.start, em(&tz, 2026, 9, 28, 4, 0));
        assert_eq!(r.today.end, em(&tz, 2026, 9, 29, 4, 0));
        assert_eq!(r.yesterday.start, em(&tz, 2026, 9, 27, 4, 0));
        assert_eq!(r.yesterday.end, r.today.start);
        // Um foco das 23:50 às 00:20 com a virada às 04:00: fica no mesmo dia.
        assert!(r.today.contains(em(&tz, 2026, 9, 29, 0, 20)));
        // O fim às 04:10 já é do dia seguinte.
        assert!(!r.today.contains(em(&tz, 2026, 9, 29, 4, 10)));
        // A hora de zerar fora da faixa vale 23.
        assert_eq!(
            day_range(date(2026, 9, 28), &tz, 99),
            day_range(date(2026, 9, 28), &tz, 23)
        );
    }

    #[test]
    fn semana_comeca_na_segunda() {
        let tz = sp();
        // Domingo, 2026-10-04, à noite: a semana é a da segunda 28/09.
        let r = stats_ranges(em(&tz, 2026, 10, 4, 22, 0), &tz, 0).unwrap();
        assert_eq!(r.week.start, em(&tz, 2026, 9, 28, 0, 0));
        assert_eq!(r.week.end, em(&tz, 2026, 10, 5, 0, 0));
        assert_eq!(r.week.len_ms(), 7 * 24 * 3_600_000);
        // Segunda, 2026-10-05, 00:00: semana nova.
        let r = stats_ranges(em(&tz, 2026, 10, 5, 0, 0), &tz, 0).unwrap();
        assert_eq!(r.week.start, em(&tz, 2026, 10, 5, 0, 0));
        // Na própria segunda, ontem (domingo) é da semana anterior.
        assert!(!r.week.contains(r.yesterday.start));
        // Todos os dias de 28/09 a 04/10 caem na mesma semana.
        for d in 28..=30 {
            let w = week_range(date(2026, 9, d), &tz, 0).unwrap();
            assert_eq!(w.start, em(&tz, 2026, 9, 28, 0, 0), "dia {d}");
        }
        for d in 1..=4 {
            let w = week_range(date(2026, 10, d), &tz, 0).unwrap();
            assert_eq!(w.start, em(&tz, 2026, 9, 28, 0, 0), "dia {d}");
        }
        assert_eq!(monday_of(date(2026, 9, 28)), Some(date(2026, 9, 28)));
        assert_eq!(monday_of(date(2026, 10, 4)), Some(date(2026, 9, 28)));
    }

    #[test]
    fn semana_com_hora_de_zerar_as_quatro() {
        let tz = sp();
        // Segunda, 02:00, com virada às 04:00: ainda é domingo, semana anterior.
        let r = stats_ranges(em(&tz, 2026, 10, 5, 2, 0), &tz, 4).unwrap();
        assert_eq!(r.week.start, em(&tz, 2026, 9, 28, 4, 0));
        assert_eq!(r.week.end, em(&tz, 2026, 10, 5, 4, 0));
        let r = stats_ranges(em(&tz, 2026, 10, 5, 4, 0), &tz, 4).unwrap();
        assert_eq!(r.week.start, em(&tz, 2026, 10, 5, 4, 0));
    }

    #[test]
    fn horario_de_verao() {
        // Nova York, 2026-03-08: o relógio pula das 02:00 para as 03:00.
        let ny = TimeZone::get("America/New_York").unwrap();
        let dia = day_range(date(2026, 3, 8), &ny, 0).unwrap();
        assert_eq!(dia.len_ms(), 23 * 3_600_000);
        let dia = day_range(date(2026, 11, 1), &ny, 0).unwrap();
        assert_eq!(dia.len_ms(), 25 * 3_600_000);
        // Virada às 02:00, que não existe em 08/03: vale 03:00 EDT.
        let dia = day_range(date(2026, 3, 8), &ny, 2).unwrap();
        assert_eq!(dia.start, em(&ny, 2026, 3, 8, 3, 0));
        assert_eq!(logical_date(dia.start, &ny, 2), Some(date(2026, 3, 8)));
        assert_eq!(
            logical_date(EpochMs(dia.start.0 - 1), &ny, 2),
            Some(date(2026, 3, 7))
        );
        // Os dias encostam, sem buraco nem sobreposição.
        let antes = day_range(date(2026, 3, 7), &ny, 2).unwrap();
        assert_eq!(antes.end, dia.start);
    }

    #[test]
    fn dias_em_seguida_encostam() {
        let tz = sp();
        for h in [0u8, 4, 23] {
            let r = stats_ranges(em(&tz, 2026, 9, 28, 12, 0), &tz, h).unwrap();
            assert_eq!(r.yesterday.end, r.today.start, "hora {h}");
            assert!(
                r.week.start <= r.today.start && r.today.end <= r.week.end,
                "hora {h}"
            );
        }
    }

    #[test]
    fn instante_fora_da_faixa_nao_quebra() {
        assert_eq!(logical_date(EpochMs(i64::MAX), &TimeZone::UTC, 0), None);
        assert_eq!(stats_ranges(EpochMs(i64::MAX), &TimeZone::UTC, 0), None);
    }
}
