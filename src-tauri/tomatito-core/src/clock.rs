//! Relógio de parede (PLANO.md, 3.2).
//!
//! O prazo de cada fase é um instante em milissegundos desde a época Unix
//! ([`EpochMs`]), comparado com o relógio de parede a cada tick. Não se usa
//! `std::time::Instant`: no Linux ele vem do `CLOCK_MONOTONIC`, que não conta o
//! tempo em suspensão, e uma fase que venceu com o computador suspenso ficaria
//! atrasada pelo tempo da suspensão.
//!
//! - [`SystemClock`]: o relógio de verdade, `SystemTime::now()`.
//! - [`FakeClock`]: o dos testes, que só anda quando mandam.
//! - `ScaledClock`: o modo acelerado, só em build de debug
//!   (`#[cfg(debug_assertions)]`), com a velocidade lida de `TOMATITO_SPEED`.
//!   `TOMATITO_SPEED=60` faz 1 min passar em 1 s.
//!
//! Relógio mudado à mão ou pelo NTP é aceito na v1: o tempo pode andar para
//! trás, e quem usa o relógio (`focus.rs`) não pode quebrar com isso.

use std::sync::Arc;
use std::sync::atomic::{AtomicI64, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

pub use jiff::tz::TimeZone;

/// Um instante do relógio de parede: milissegundos desde a época Unix, em UTC
/// (o `ends_at_ms` do plano). Negativo só antes de 1970, num relógio muito
/// errado.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct EpochMs(pub i64);

impl EpochMs {
    /// Este instante mais `ms` milissegundos, sem estourar.
    #[must_use]
    pub const fn plus_ms(self, ms: u64) -> Self {
        // Mais que i64::MAX ms (292 milhões de anos) satura no máximo.
        let ms = if ms > i64::MAX as u64 {
            i64::MAX
        } else {
            ms as i64
        };
        Self(self.0.saturating_add(ms))
    }

    /// Quantos ms se passaram de `earlier` até este instante. Negativo se
    /// `earlier` vier depois (o relógio andou para trás).
    #[must_use]
    pub const fn ms_since(self, earlier: Self) -> i64 {
        self.0.saturating_sub(earlier.0)
    }

    /// O mesmo que [`Self::ms_since`], mas 0 quando daria negativo.
    #[must_use]
    pub const fn ms_since_or_zero(self, earlier: Self) -> u64 {
        let ms = self.ms_since(earlier);
        if ms < 0 { 0 } else { ms as u64 }
    }

    /// Hora e minuto deste instante no fuso `tz`, em 24 h (3.8: "Horas:
    /// formato de 24 h"; datas e horas locais pelo `jiff`). Os segundos são
    /// cortados, como num relógio: 14:35:40 é 14:35. `None` só fora da faixa
    /// do `jiff` (anos -9999 a 9999), num relógio muito errado.
    ///
    /// É o "às 14:35" das notificações (M21). O app passa o fuso do sistema
    /// ([`TimeZone::system`]) a cada aviso, então uma troca de fuso com o app
    /// aberto já vale no aviso seguinte.
    #[must_use]
    pub fn hour_minute_in(self, tz: &TimeZone) -> Option<(u8, u8)> {
        let ts = jiff::Timestamp::from_millisecond(self.0).ok()?;
        let dt = tz.to_datetime(ts);
        Some((
            u8::try_from(dt.hour()).ok()?,
            u8::try_from(dt.minute()).ok()?,
        ))
    }
}

/// Converte um `SystemTime` em [`EpochMs`], inclusive antes de 1970.
pub fn epoch_ms(time: SystemTime) -> EpochMs {
    fn ms(d: Duration) -> i64 {
        i64::try_from(d.as_millis()).unwrap_or(i64::MAX)
    }
    match time.duration_since(UNIX_EPOCH) {
        Ok(depois) => EpochMs(ms(depois)),
        Err(antes) => EpochMs(-ms(antes.duration())),
    }
}

/// De onde vem o "agora". `Send + Sync` porque o laço do app (M16) e os
/// comandos leem o mesmo relógio de threads diferentes.
pub trait Clock: Send + Sync {
    fn now(&self) -> EpochMs;
}

impl<C: Clock + ?Sized> Clock for &C {
    fn now(&self) -> EpochMs {
        (**self).now()
    }
}

impl<C: Clock + ?Sized> Clock for Box<C> {
    fn now(&self) -> EpochMs {
        (**self).now()
    }
}

impl<C: Clock + ?Sized> Clock for Arc<C> {
    fn now(&self) -> EpochMs {
        (**self).now()
    }
}

/// O relógio de parede do sistema.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct SystemClock;

impl Clock for SystemClock {
    fn now(&self) -> EpochMs {
        epoch_ms(SystemTime::now())
    }
}

/// Relógio de teste: parado até alguém mandar andar. As cópias (`clone`)
/// compartilham o mesmo "agora", então o teste pode guardar uma e entregar
/// outra ao código testado.
#[derive(Debug, Clone, Default)]
pub struct FakeClock {
    now: Arc<AtomicI64>,
}

impl FakeClock {
    pub fn new(start: EpochMs) -> Self {
        Self {
            now: Arc::new(AtomicI64::new(start.0)),
        }
    }

    /// Põe o relógio em `time`, inclusive para trás (relógio mudado à mão).
    pub fn set(&self, time: EpochMs) {
        self.now.store(time.0, Ordering::SeqCst);
    }

    /// Anda `by` para a frente e devolve o novo "agora".
    pub fn advance(&self, by: Duration) -> EpochMs {
        let ms = i64::try_from(by.as_millis()).unwrap_or(i64::MAX);
        // `fetch_update` com saturação, para um salto enorme não dar a volta.
        let antes = self
            .now
            .fetch_update(Ordering::SeqCst, Ordering::SeqCst, |t| {
                Some(t.saturating_add(ms))
            })
            .unwrap_or_else(|t| t);
        EpochMs(antes.saturating_add(ms))
    }

    /// Anda `ms` milissegundos para a frente.
    pub fn advance_ms(&self, ms: u64) -> EpochMs {
        self.advance(Duration::from_millis(ms))
    }

    /// Anda `min` minutos para a frente.
    pub fn advance_min(&self, min: u64) -> EpochMs {
        self.advance(Duration::from_secs(min.saturating_mul(60)))
    }
}

impl Clock for FakeClock {
    fn now(&self) -> EpochMs {
        EpochMs(self.now.load(Ordering::SeqCst))
    }
}

/// Variável de ambiente do modo acelerado (só em build de debug).
#[cfg(debug_assertions)]
pub const SPEED_ENV: &str = "TOMATITO_SPEED";

/// Maior velocidade aceita. Com 10 000, um dia de relógio de verdade vira 27
/// anos no relógio acelerado, longe de estourar os ms em `i64`.
#[cfg(debug_assertions)]
pub const MAX_SPEED: f64 = 10_000.0;

/// Valor de `TOMATITO_SPEED` que não é um número maior que 0 e até
/// [`MAX_SPEED`]. O texto é para o registro do app; a interface não o mostra.
#[cfg(debug_assertions)]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SpeedError {
    /// O valor recebido, como veio (com `U+FFFD` no lugar de bytes que não
    /// são UTF-8).
    pub value: String,
}

#[cfg(debug_assertions)]
impl std::fmt::Display for SpeedError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "{SPEED_ENV} precisa ser um número maior que 0 e até {MAX_SPEED}; veio {:?}",
            self.value
        )
    }
}

#[cfg(debug_assertions)]
impl std::error::Error for SpeedError {}

/// Na faixa (0, [`MAX_SPEED`]]. Recusa também `NaN` e infinito.
#[cfg(debug_assertions)]
fn speed_ok(speed: f64) -> bool {
    speed > 0.0 && speed <= MAX_SPEED
}

/// Lê uma velocidade: um número decimal com ponto (`60`, `2.5`), maior que 0
/// e até [`MAX_SPEED`]. Espaços em volta são ignorados.
#[cfg(debug_assertions)]
pub fn parse_speed(value: &str) -> Result<f64, SpeedError> {
    let erro = || SpeedError {
        value: value.to_owned(),
    };
    // `parse` aceita "inf" e "NaN"; o `speed_ok` recusa os dois.
    let speed: f64 = value.trim().parse().map_err(|_| erro())?;
    if speed_ok(speed) {
        Ok(speed)
    } else {
        Err(erro())
    }
}

/// Modo acelerado (PLANO.md, 3.2): a partir do momento em que é criado, o
/// tempo do relógio de base passa `speed` vezes mais rápido.
///
/// `agora = origem + (base.now() − origem) × speed`, em que a origem é o
/// "agora" da base na criação. Como a base é o relógio de parede, a suspensão
/// também é acelerada: 1 min suspenso com `TOMATITO_SPEED=60` vale 1 h.
///
/// Existe só em build de debug: no build de release, `TOMATITO_SPEED` não faz
/// nada, porque não há código que a leia.
#[cfg(debug_assertions)]
#[derive(Debug, Clone)]
pub struct ScaledClock<C = SystemClock> {
    base: C,
    origin: EpochMs,
    speed: f64,
}

#[cfg(debug_assertions)]
impl<C: Clock> ScaledClock<C> {
    /// Acelera `base` a partir de agora. Recusa velocidades fora de
    /// (0, [`MAX_SPEED`]].
    pub fn new(base: C, speed: f64) -> Result<Self, SpeedError> {
        if !speed_ok(speed) {
            return Err(SpeedError {
                value: speed.to_string(),
            });
        }
        let origin = base.now();
        Ok(Self {
            base,
            origin,
            speed,
        })
    }

    pub fn speed(&self) -> f64 {
        self.speed
    }
}

#[cfg(debug_assertions)]
impl ScaledClock<SystemClock> {
    /// O relógio acelerado pedido em `TOMATITO_SPEED`, sobre o relógio do
    /// sistema:
    /// - variável ausente ou vazia: `Ok(None)` (o app usa o [`SystemClock`]);
    /// - valor válido: `Ok(Some(...))`;
    /// - valor inválido: `Err`, para o app registrar e seguir sem acelerar.
    pub fn from_env() -> Result<Option<Self>, SpeedError> {
        Self::from_env_value(std::env::var_os(SPEED_ENV).as_deref())
    }

    /// O mesmo que [`Self::from_env`], com o valor da variável já lido. Os
    /// testes usam esta forma: mexer no ambiente do processo é `unsafe` na
    /// edição 2024 e disputado entre os testes que rodam em paralelo.
    pub fn from_env_value(value: Option<&std::ffi::OsStr>) -> Result<Option<Self>, SpeedError> {
        let Some(value) = value else {
            return Ok(None);
        };
        let Some(texto) = value.to_str() else {
            return Err(SpeedError {
                value: value.to_string_lossy().into_owned(),
            });
        };
        if texto.trim().is_empty() {
            return Ok(None);
        }
        let speed = parse_speed(texto)?;
        Self::new(SystemClock, speed).map(Some)
    }
}

#[cfg(debug_assertions)]
impl<C: Clock> Clock for ScaledClock<C> {
    fn now(&self) -> EpochMs {
        let real = self.base.now().ms_since(self.origin);
        // f64 guarda inteiros exatos até 2^53 ms (285 mil anos); o `as`
        // satura no limite do i64 em vez de dar a volta.
        let acelerado = (real as f64 * self.speed).round() as i64;
        EpochMs(self.origin.0.saturating_add(acelerado))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const INICIO: EpochMs = EpochMs(1_790_000_000_000);

    #[test]
    fn hora_e_minuto_no_fuso() {
        // 1_790_000_000_000 ms = 2026-09-21 14:13:20 UTC.
        let utc = TimeZone::UTC;
        assert_eq!(INICIO.hour_minute_in(&utc), Some((14, 13)));
        let sp = TimeZone::fixed(jiff::tz::offset(-3));
        assert_eq!(INICIO.hour_minute_in(&sp), Some((11, 13)));
        // Os segundos são cortados: 14:13:59,999 ainda é 14:13.
        assert_eq!(INICIO.plus_ms(39_999).hour_minute_in(&utc), Some((14, 13)));
        assert_eq!(INICIO.plus_ms(40_000).hour_minute_in(&utc), Some((14, 14)));
        // Meia-noite em 24 h, e antes de 1970.
        assert_eq!(EpochMs(0).hour_minute_in(&utc), Some((0, 0)));
        assert_eq!(EpochMs(-60_000).hour_minute_in(&utc), Some((23, 59)));
        assert_eq!(EpochMs(i64::MAX).hour_minute_in(&utc), None);
    }

    #[test]
    fn hora_e_minuto_com_horario_de_verao() {
        // Nova York: 2026-03-08 06:59 UTC é 01:59 EST; 07:00 UTC é 03:00 EDT.
        let ny = TimeZone::get("America/New_York").unwrap();
        let antes = EpochMs(1_772_953_140_000);
        assert_eq!(antes.hour_minute_in(&ny), Some((1, 59)));
        assert_eq!(antes.plus_ms(60_000).hour_minute_in(&ny), Some((3, 0)));
    }

    #[test]
    fn epoch_ms_converte_antes_e_depois_de_1970() {
        assert_eq!(epoch_ms(UNIX_EPOCH), EpochMs(0));
        assert_eq!(
            epoch_ms(UNIX_EPOCH + Duration::from_millis(1_790_000_000_123)),
            EpochMs(1_790_000_000_123)
        );
        assert_eq!(
            epoch_ms(UNIX_EPOCH - Duration::from_millis(1500)),
            EpochMs(-1500)
        );
    }

    #[test]
    fn relogio_do_sistema_e_o_relogio_de_parede() {
        let antes = epoch_ms(SystemTime::now());
        let agora = SystemClock.now();
        let depois = epoch_ms(SystemTime::now());
        assert!(
            antes <= agora && agora <= depois,
            "{antes:?} {agora:?} {depois:?}"
        );
        // Depois de 2026-01-01, só para pegar uma unidade errada (s em vez de ms).
        assert!(agora > EpochMs(1_767_225_600_000), "{agora:?}");
    }

    #[test]
    fn contas_de_instante_nao_estouram() {
        assert_eq!(INICIO.plus_ms(1500), EpochMs(1_790_000_001_500));
        assert_eq!(EpochMs(i64::MAX - 1).plus_ms(10), EpochMs(i64::MAX));
        assert_eq!(EpochMs(0).plus_ms(u64::MAX), EpochMs(i64::MAX));
        assert_eq!(INICIO.plus_ms(2000).ms_since(INICIO), 2000);
        assert_eq!(INICIO.ms_since(INICIO.plus_ms(2000)), -2000);
        assert_eq!(INICIO.ms_since_or_zero(INICIO.plus_ms(2000)), 0);
        assert_eq!(EpochMs(i64::MIN).ms_since(EpochMs(i64::MAX)), i64::MIN);
    }

    #[test]
    fn relogio_falso_so_anda_quando_mandam_e_as_copias_andam_juntas() {
        let relogio = FakeClock::new(INICIO);
        let copia = relogio.clone();
        assert_eq!(relogio.now(), INICIO);
        assert_eq!(relogio.now(), INICIO);

        assert_eq!(relogio.advance_ms(250), INICIO.plus_ms(250));
        assert_eq!(copia.now(), INICIO.plus_ms(250));
        assert_eq!(copia.advance_min(40), INICIO.plus_ms(250 + 40 * 60_000));
        assert_eq!(relogio.now(), INICIO.plus_ms(250 + 40 * 60_000));

        // Para trás, como um relógio mudado à mão.
        relogio.set(EpochMs(INICIO.0 - 3_600_000));
        assert_eq!(copia.now(), EpochMs(INICIO.0 - 3_600_000));

        // Um salto enorme satura, não dá a volta.
        relogio.advance(Duration::MAX);
        assert_eq!(relogio.now(), EpochMs(i64::MAX));
    }

    #[test]
    fn relogio_serve_por_referencia_box_e_arc() {
        fn agora(relogio: &dyn Clock) -> EpochMs {
            relogio.now()
        }
        let relogio = FakeClock::new(INICIO);
        let arc: Arc<dyn Clock> = Arc::new(relogio.clone());
        let caixa: Box<dyn Clock> = Box::new(relogio.clone());
        relogio.advance_ms(5);
        assert_eq!(agora(&&relogio), INICIO.plus_ms(5));
        assert_eq!(agora(&arc), INICIO.plus_ms(5));
        assert_eq!(agora(&caixa), INICIO.plus_ms(5));
    }
}

#[cfg(all(test, debug_assertions))]
mod tests_acelerado {
    use super::*;
    use std::ffi::OsStr;

    const INICIO: EpochMs = EpochMs(1_790_000_000_000);

    #[test]
    fn velocidade_valida_e_invalida() {
        assert_eq!(parse_speed("60"), Ok(60.0));
        assert_eq!(parse_speed(" 2.5 "), Ok(2.5));
        assert_eq!(parse_speed("0.5"), Ok(0.5));
        assert_eq!(parse_speed("1e3"), Ok(1000.0));
        assert_eq!(parse_speed("10000"), Ok(MAX_SPEED));
        for ruim in [
            "", " ", "0", "-1", "-0", "10001", "abc", "60x", "1,5", "NaN", "inf", "-inf",
        ] {
            assert_eq!(
                parse_speed(ruim),
                Err(SpeedError {
                    value: ruim.to_owned()
                }),
                "{ruim:?}"
            );
        }
        let texto = parse_speed("abc").unwrap_err().to_string();
        assert!(texto.contains("TOMATITO_SPEED"), "{texto}");
        assert!(texto.contains("\"abc\""), "{texto}");
    }

    #[test]
    fn sessenta_vezes_faz_um_minuto_passar_em_um_segundo() {
        let base = FakeClock::new(INICIO);
        let acelerado = ScaledClock::new(base.clone(), 60.0).expect("velocidade válida");
        assert_eq!(acelerado.speed(), 60.0);
        assert_eq!(acelerado.now(), INICIO);

        base.advance_ms(1000);
        assert_eq!(acelerado.now(), INICIO.plus_ms(60_000));
        base.advance_ms(250);
        assert_eq!(acelerado.now(), INICIO.plus_ms(75_000));
        base.advance_min(25);
        assert_eq!(acelerado.now(), INICIO.plus_ms(75_000 + 25 * 60 * 60_000));

        // O relógio de base andando para trás também volta acelerado.
        base.set(EpochMs(INICIO.0 - 1000));
        assert_eq!(acelerado.now(), EpochMs(INICIO.0 - 60_000));
    }

    #[test]
    fn velocidade_fracionaria_e_origem_no_momento_da_criacao() {
        let base = FakeClock::new(INICIO);
        base.advance_ms(10_000);
        let lento = ScaledClock::new(base.clone(), 0.5).expect("velocidade válida");
        assert_eq!(lento.now(), INICIO.plus_ms(10_000));
        base.advance_ms(1001);
        // 500,5 ms arredonda para 501 (meio para longe do zero).
        assert_eq!(lento.now(), INICIO.plus_ms(10_501));
    }

    #[test]
    fn velocidade_fora_da_faixa_e_recusada() {
        for ruim in [0.0, -1.0, f64::NAN, f64::INFINITY, MAX_SPEED + 1.0] {
            assert!(
                ScaledClock::new(FakeClock::new(INICIO), ruim).is_err(),
                "{ruim}"
            );
        }
    }

    #[test]
    fn variavel_de_ambiente() {
        let ler = |v: Option<&str>| ScaledClock::from_env_value(v.map(OsStr::new));
        assert!(matches!(ler(None), Ok(None)));
        assert!(matches!(ler(Some("")), Ok(None)));
        assert!(matches!(ler(Some("  ")), Ok(None)));
        let acelerado = ler(Some("60")).expect("válida").expect("presente");
        assert_eq!(acelerado.speed(), 60.0);
        // Criado agora: o relógio acelerado começa no relógio do sistema.
        let diferenca = acelerado.now().ms_since(SystemClock.now()).abs();
        assert!(diferenca < 60_000, "{diferenca} ms");
        assert_eq!(
            ler(Some("rápido")).unwrap_err(),
            SpeedError {
                value: "rápido".to_owned()
            }
        );
        assert!(ler(Some("0")).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn variavel_de_ambiente_que_nao_e_utf8_e_recusada() {
        use std::os::unix::ffi::OsStrExt;
        let erro = ScaledClock::from_env_value(Some(OsStr::from_bytes(b"6\xff0"))).unwrap_err();
        assert_eq!(erro.value, "6\u{FFFD}0");
    }
}
